// Create a new local backup only after checking that the app and Compose use
// the same PostgreSQL cluster. This never overwrites an existing path.
import { closeSync, existsSync, fstatSync, fsyncSync, openSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import { Pool } from 'pg';

const destination = process.argv[2];
const project = process.argv.length === 5 && process.argv[3] === '--project' ? process.argv[4] : 'cove';
if ((process.argv.length !== 3 && process.argv.length !== 5) || !destination || !isAbsolute(destination) ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(project) || (process.argv.length === 5 && process.argv[3] !== '--project')) {
  throw new Error('Give an absolute path for a new backup and, optionally, --project NAME.');
}
const unsafe = Object.keys(process.env).filter(key => /^(DATABASE_URL|POSTGRES_PASSWORD|DOCKER_HOST|DOCKER_CONTEXT|COMPOSE_.*|PG[A-Z_]*)$/i.test(key));
if (unsafe.length) throw new Error('Unset inherited database, Docker context, Compose and PostgreSQL variables before using this helper.');
if (['compose.override.yaml', 'compose.override.yml', 'docker-compose.override.yaml', 'docker-compose.override.yml'].some(existsSync)) throw new Error('Compose overrides need a tailored backup procedure.');
process.loadEnvFile('.env');
if (Object.keys(process.env).some(key => /^(DOCKER_HOST|DOCKER_CONTEXT|COMPOSE_.*|PG[A-Z_]*)$/i.test(key))) throw new Error('Remove Docker context, Compose and PostgreSQL selectors from .env before using this helper.');
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.username !== 'cove' || !url.password || !url.port || url.pathname !== '/cove' || url.search || url.hash ||
    !/^[A-Za-z0-9_-]+$/.test(process.env.POSTGRES_PASSWORD ?? '') || decodeURIComponent(url.password) !== process.env.POSTGRES_PASSWORD) {
  throw new Error('Expected the loopback Cove development database.');
}
const docker = (args, options = {}) => {
  const result = spawnSync('docker', args, { windowsHide: true, ...options });
  if (result.error || result.status !== 0) throw new Error('Docker Compose command failed; inspect the local database and Compose mapping.');
  return result;
};
const compose = args => ['compose', '-p', project, ...args];
const verifyEndpoint = () => {
  const context = JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], { encoding: 'utf8' }).stdout);
  if (typeof context !== 'string' || !/^(unix:\/\/|npipe:\/\/)/i.test(context)) throw new Error('A local Docker context is required.');
  const mapped = docker(compose(['port', 'db', '5432']), { encoding: 'utf8' }).stdout.trim();
  if (mapped !== `127.0.0.1:${url.port}`) throw new Error('Compose db is not mapped to the DATABASE_URL loopback port.');
};
const appCluster = async () => {
  const pool = new Pool({ connectionString: url.href });
  try { return (await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0]?.id; }
  finally { await pool.end(); }
};
const composeCluster = () => docker(compose(['exec', '-T', 'db', 'psql', '-U', 'cove', '-d', 'cove', '-Atc', 'SELECT system_identifier::text FROM pg_control_system()']), { encoding: 'utf8' }).stdout.trim();
const fd = openSync(destination, 'wx', 0o600);
let complete = false;
try {
  verifyEndpoint();
  const systemId = await appCluster();
  if (!/^\d+$/.test(systemId ?? '') || composeCluster() !== systemId) throw new Error('Compose and DATABASE_URL do not identify the same PostgreSQL cluster.');
  docker(compose(['exec', '-T', 'db', 'pg_dump', '-U', 'cove', '-d', 'cove', '-Fc']), { stdio: ['ignore', fd, 'pipe'] });
  fsyncSync(fd);
  if (fstatSync(fd).size === 0) throw new Error('Backup is empty.');
  verifyEndpoint();
  if (await appCluster() !== systemId || composeCluster() !== systemId) throw new Error('Database mapping changed during backup.');
  complete = true;
} finally {
  closeSync(fd);
  if (!complete) console.error('Backup did not complete. The newly created file was left for inspection and must not be used.');
}
const input = openSync(destination, 'r');
try {
  docker(compose(['exec', '-T', 'db', 'pg_restore', '--list']), { stdio: [input, 'ignore', 'pipe'] });
} catch (error) {
  console.error('Archive listing failed. The file was left for inspection and must not be used.');
  throw error;
} finally { closeSync(input); }
console.log('Backup created and its archive directory is readable. Verify a restore in an isolated database before rotating credentials.');
