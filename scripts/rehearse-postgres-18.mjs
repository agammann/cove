import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Only randomly named test resources and fictional records are used.
if (existsSync('.env')) throw new Error('Run only from a clean checkout without .env.');
if (Object.keys(process.env).some(key => /^(DOCKER_HOST|DOCKER_CONTEXT|PG[A-Z_]*)$/i.test(key))) {
  throw new Error('Unset inherited Docker and PostgreSQL selectors first.');
}
const suffix = randomBytes(8).toString('hex');
const oldName = `cove-pg-fixture-${suffix}-old`;
const newName = `cove-pg-fixture-${suffix}-new`;
const invalidName = `cove-pg-fixture-${suffix}-invalid`;
const oldVolume = `${oldName}-data`;
const newVolume = `${newName}-data`;
const password = randomBytes(24).toString('hex');
const created = [];
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: null, maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${program} failed: ${result.error?.message || result.stderr?.toString().trim() || `exit ${result.status}`}`);
  }
  return result.stdout;
}
const docker = (...args) => run('docker', args);
const endpoint = JSON.parse(docker('context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}').toString());
if (typeof endpoint !== 'string' || !/^(unix:\/\/|npipe:\/\/)/i.test(endpoint)) {
  throw new Error('A local Docker context is required.');
}
const sql = (name, input) => run('docker', ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'cove', '-d', 'cove', '-At'], { input }).toString().trim();
async function ready(name) {
  for (let i = 0; i < 90; i++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'cove', '-d', 'cove'], { stdio: 'ignore' }).status === 0) return;
    await delay(1000);
  }
  throw new Error('Fixture database did not become ready.');
}
function start(name, volume, image, mount, pgdata) {
  docker('run', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=cove', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=cove', '-e', `PGDATA=${pgdata}`, '-v', `${volume}:${mount}`, image);
  created.push(name);
}
function migrate(name) {
  const port = docker('port', name, '5432/tcp').toString().trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error('Expected loopback-only fixture port.');
  const env = { ...process.env, DATABASE_URL: `postgresql://cove:${password}@127.0.0.1:${port}/cove` };
  run(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'packages/database/migrate.ts'], { env });
}
const snapshot = `SELECT (SELECT count(*) FROM cove_owners) || ':' || (SELECT count(*) FROM projects) || ':' || (SELECT count(*) FROM security_ledger) || ':' || (SELECT count(*) FROM drizzle.__drizzle_migrations);`;
try {
  start(oldName, oldVolume, 'postgres:17.6-alpine', '/var/lib/postgresql/data', '/var/lib/postgresql/data');
  await ready(oldName);
  migrate(oldName);
  sql(oldName, `BEGIN;
INSERT INTO "user"(id,name,email,"emailVerified") VALUES ('fixture-owner','Fictional owner','owner@example.invalid',true);
INSERT INTO cove_owners(id) VALUES ('fixture-owner');
INSERT INTO projects(id,owner_id,name,description,version) VALUES ('11111111-1111-4111-8111-111111111111','fixture-owner','Fictional project','Synthetic data',1);
INSERT INTO revisions(id,project_id,version,context,author,actor_id,summary) VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',1,'{}','owner','fixture-owner','Synthetic revision');
INSERT INTO security_ledger(id,kind,target_id) VALUES ('22222222-2222-4222-8222-222222222222','revocation','fictional-target');
COMMIT;`);
  const before = sql(oldName, snapshot);
  assert.equal(before, '1:1:1:2');
  // The source is stopped after a final dump to model quiesced writers.
  const dump = docker('exec', oldName, 'pg_dump', '-U', 'cove', '-d', 'cove', '-Fc');
  docker('stop', oldName);
  docker('run', '-d', '--name', invalidName, '--network', 'none', '-e', 'POSTGRES_USER=cove', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=cove', '-e', 'PGDATA=/var/lib/postgresql/data', '-v', `${oldVolume}:/var/lib/postgresql/data`, 'postgres:18.4-alpine');
  created.push(invalidName);
  assert.notEqual(docker('wait', invalidName).toString().trim(), '0');
  start(newName, newVolume, 'postgres:18.4-alpine', '/var/lib/postgresql', '/var/lib/postgresql/18/docker');
  await ready(newName);
  run('docker', ['exec', '-i', newName, 'pg_restore', '--exit-on-error', '--no-owner', '-U', 'cove', '-d', 'cove'], { input: dump });
  assert.equal(sql(newName, snapshot), before);
  assert.equal(sql(newName, `SELECT name || ':' || description FROM projects WHERE owner_id='fixture-owner'`), 'Fictional project:Synthetic data');
  assert.equal(sql(newName, `SELECT summary FROM revisions WHERE actor_id='fixture-owner'`), 'Synthetic revision');
  migrate(newName);
  assert.equal(sql(newName, snapshot), before);
  sql(newName, `INSERT INTO security_ledger(id,kind,target_id) VALUES ('33333333-3333-4333-8333-333333333333','revocation','post-cutover');`);
  assert.equal(sql(newName, snapshot), '1:1:2:2');
  docker('stop', newName);
  docker('start', oldName);
  await ready(oldName);
  assert.equal(sql(oldName, snapshot), before);
  console.log('PASS: isolated 17-to-18 restore and old-volume rollback; post-cutover writes are absent from the old volume.');
} finally {
  // Retain the uniquely named synthetic volumes and containers for inspection.
  for (const name of created) spawnSync('docker', ['stop', name], { stdio: 'ignore' });
  console.log(`Synthetic resources retained: ${created.join(', ')}; volumes ${oldVolume}, ${newVolume}`);
}

