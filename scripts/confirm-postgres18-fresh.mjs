import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync } from 'node:fs';
import { URL } from 'node:url';

const mode = process.argv[2];
if (!['local', 'production'].includes(mode) || process.argv.length !== 3)
  throw Error('Choose exactly local or production.');
const selector = /^(DATABASE_URL|POSTGRES_PASSWORD|COVE_DOMAIN|COVE_PG18_FRESH_INSTALL|COMPOSE_.*|DOCKER_.*|PG[A-Z_]*)$/i;
for (const key of Object.keys(process.env)) {
  if (selector.test(key)) throw Error(`Unset ${key} before selecting the intended local project.`);
}
if (['compose.override.yaml', 'compose.override.yml', 'docker-compose.override.yaml', 'docker-compose.override.yml'].some(existsSync))
  throw Error('Automatic Compose overrides require a separate reviewed procedure.');
const environmentFile = mode === 'local' ? '.env' : '.env.production';
process.loadEnvFile(environmentFile);
for (const key of Object.keys(process.env)) {
  if (selector.test(key) && !['DATABASE_URL', 'POSTGRES_PASSWORD', 'COVE_DOMAIN'].includes(key))
    throw Error(`Remove ${key} from the environment file before initialization.`);
}
let database;
try { database = new URL(process.env.DATABASE_URL); } catch { throw Error('A valid DATABASE_URL is required.'); }
const expectedHost = mode === 'local' ? ['localhost', '127.0.0.1'] : ['db'];
const expectedPort = mode === 'local' ? '55439' : '5432';
if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
    !expectedHost.includes(database.hostname) || database.port !== expectedPort ||
    database.username !== 'cove' || database.pathname !== '/cove' || database.search || database.hash ||
    !/^[A-Za-z0-9_-]+$/.test(process.env.POSTGRES_PASSWORD ?? '') ||
    decodeURIComponent(database.password) !== process.env.POSTGRES_PASSWORD)
  throw Error('DATABASE_URL and POSTGRES_PASSWORD must identify the same default Cove database; use a reviewed procedure for custom credentials or mappings.');
if (mode === 'production' && !process.env.COVE_DOMAIN?.trim())
  throw Error('Set COVE_DOMAIN in the private production environment file.');
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw Error(`Docker command failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  return result.stdout;
}
const host = JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
if (typeof host !== 'string' || !/^(unix:\/\/|npipe:\/\/)/i.test(host))
  throw Error('A local Docker context is required; use a reviewed procedure for other hosts.');
const base = mode === 'local'
  ? ['compose', '-p', 'cove', '--env-file', '.env', '-f', 'compose.yaml']
  : ['compose', '-p', 'cove-production', '--env-file', '.env.production', '-f', 'compose.production.yaml'];
const existing = docker([...base, 'ps', '-a', '--format', 'json']).trim();
if (existing && existing !== '[]')
  throw Error('This project already has containers. Stop and identify the existing installation; do not initialize.');
console.log('This is ONLY for a fresh installation. It does not migrate data.');
console.log('Inspect all prior Cove projects, Docker hosts, volumes, bind mounts, overrides and remote databases first.');
console.log('The guard cannot discover storage outside the selected project.');
console.log('Keep all potential Cove writers and storage changes stopped throughout initialization.');
const rl = createInterface({ input: stdin, output: stdout });
const answer = await rl.question('Type NO EXISTING COVE DATABASE to confirm: ');
rl.close();
if (answer !== 'NO EXISTING COVE DATABASE') throw Error('Fresh installation was not confirmed.');
const env = { ...process.env, COVE_PG18_FRESH_INSTALL: 'confirmed-no-existing-cove-database' };
docker([...base, '-f', 'compose.postgres18-init.yaml', 'up', '-d', '--wait', 'db'], { stdio: 'inherit', env });
docker([...base, 'up', '-d', '--force-recreate', '--wait', 'db'], { stdio: 'inherit', env });
console.log('Fresh PostgreSQL 18 database initialized. Continue with the setup guide.');
