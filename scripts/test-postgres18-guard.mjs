import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Random local-only fixtures; never operate on an existing Compose project.
const prefix = 'covepg18test' + randomBytes(8).toString('hex');
const env = { ...process.env, POSTGRES_PASSWORD: 'synthetic-only', COVE_DOMAIN: 'fixture.invalid',
  COVE_PG18_FRESH_INSTALL: 'confirmed-no-existing-cove-database' };
for (const k of Object.keys(env)) if (/^(COMPOSE_|DOCKER_|PG[A-Z_]*)/i.test(k)) delete env[k];
const containers = [];
function docker(args, options = {}) {
  const r = spawnSync('docker', args, { env, encoding: 'utf8', timeout: 120000, ...options });
  if (r.error || (!options.allowFailure && r.status !== 0)) throw Error(`Docker fixture failed: ${r.error?.message || r.stderr}`);
  return r;
}
const host = JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']).stdout);
if (typeof host !== 'string' || !/^(unix:\/\/|npipe:\/\/)/i.test(host)) throw Error('A local Docker context is required.');
const net = process.env.COVE_TEST_NETWORK || prefix + 'network';
if (process.env.COVE_TEST_NETWORK) {
  if (!/^covepg18test[0-9a-f]{16}network$/.test(net)) throw Error('Only an explicitly named Cove fixture network may be reused.');
  const inspected = JSON.parse(docker(['network', 'inspect', net]).stdout);
  assert.equal(inspected.length, 1);
  assert.equal(inspected[0].Internal, true);
  assert.equal(Object.keys(inspected[0].Containers ?? {}).length, 0, 'Fixture network is in use');
} else docker(['network', 'create', '--internal', net]);
const dir = mkdtempSync(join(tmpdir(), 'cove-pg18-fixture-'));
const overlay = join(dir, 'fixture.yaml');
const envFile = join(dir, 'fixture.env');
writeFileSync(envFile, 'POSTGRES_PASSWORD=synthetic-only\nCOVE_DOMAIN=fixture.invalid\n');
writeFileSync(overlay, `services:\n  db:\n    ports: !override ["127.0.0.1::5432"]\n  api:\n    env_file: !reset []\nnetworks:\n  default: !override { external: true, name: ${net} }\n`);
// Local has no api service; its override only changes ports and network.
const localOverlay = join(dir, 'local.yaml');
writeFileSync(localOverlay, `services:\n  db:\n    ports: !override ["127.0.0.1::5432"]\nnetworks:\n  default: !override { external: true, name: ${net} }\n`);
const compose = (project, production, init = false) => ['compose', '-p', project, '--env-file', envFile, '-f',
  production ? 'compose.production.yaml' : 'compose.yaml', ...(init ? ['-f', 'compose.postgres18-init.yaml'] : []),
  '-f', production ? overlay : localOverlay];
function rejected(args, pattern) {
  const r = docker(args, { allowFailure: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, pattern);
}
function id(project, production, init = false) {
  return docker([...compose(project, production, init), 'ps', '-q', 'db']).stdout.trim();
}
function mutate(volume, shell) {
  docker(['run', '--network', 'none', '--entrypoint', 'sh', '-v', volume + ':/fixture',
    'postgres:18.4-alpine', '-c', shell]);
}
async function ready(container) {
  for (let i = 0; i < 90; i++) {
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'cove'], { allowFailure: true }).status === 0) return;
    await delay(1000);
  }
  throw Error('Fixture database did not become ready.');
}
const guard = resolve('deploy/postgres18-guard.sh');
const readyScript = resolve('deploy/postgres18-ready.sh');
try {
  for (const production of [false, true]) {
    const project = prefix + (production ? 'prod' : 'local');
    const base = compose(project, production);
    rejected([...base, 'run', '--no-deps', 'db'], /attempt record is missing/i);
    rejected([...base, 'run', '--no-deps', '-e', 'PGDATA=/tmp/unreviewed', 'db'], /unexpected PGDATA/i);
    docker([...compose(project, production, true), 'up', '-d', '--wait', 'db']);
    const first = id(project, production, true);
    assert.match(first, /^[a-f0-9]{64}$/); containers.push(first);
    docker([...base, 'up', '-d', '--force-recreate', '--wait', 'db']);
    const current = id(project, production); containers.push(current);
    assert.equal(docker(['exec', current, 'psql', '-U', 'cove', '-d', 'cove', '-Atc', 'SHOW server_version_num']).stdout.trim().slice(0, 2), '18');
    rejected([...compose(project, production, true), 'run', '--no-deps', 'db'], /target storage is not empty/i);
    docker(['stop', current]);
    const target = project + (production ? '_database-18' : '_cove-data-18');
    mutate(target, 'mv /fixture/18/docker/.cove-init-complete /fixture/18/docker/.saved-marker');
    rejected([...base, 'run', '--no-deps', 'db'], /marker is missing/i);
    mutate(target, 'printf "cove-postgres18-initialization-complete-v1:123\\n" > /fixture/18/docker/.cove-init-complete');
    rejected([...base, 'run', '--no-deps', 'db'], /marker does not match/i);
    mutate(target, 'mv -f /fixture/18/docker/.saved-marker /fixture/18/docker/.cove-init-complete');
  }
  console.log('PASS: local and production fresh initialization, guarded restart and PGDATA rejection');
  const project = prefix + 'legacy';
  const oldVolume = project + '_cove-data';
  const old = docker(['run', '-d', '--network', 'none', '-e', 'POSTGRES_PASSWORD=synthetic-old',
    '-e', 'POSTGRES_USER=cove', '-e', 'POSTGRES_DB=cove', '-v', oldVolume + ':/var/lib/postgresql/data',
    'postgres:17.6-alpine']).stdout.trim();
  containers.push(old); await ready(old);
  docker(['exec', old, 'psql', '-U', 'cove', '-d', 'cove', '-v', 'ON_ERROR_STOP=1', '-c',
    "CREATE TABLE synthetic_legacy(value text); INSERT INTO synthetic_legacy VALUES ('preserved')"]);
  docker(['stop', old]);
  rejected([...compose(project, false, true), 'run', '--no-deps', 'db'], /legacy storage is populated/i);
  docker(['start', old]); await ready(old);
  assert.equal(docker(['exec', old, 'psql', '-U', 'cove', '-d', 'cove', '-Atc', 'SELECT value FROM synthetic_legacy']).stdout.trim(), 'preserved');
  docker(['stop', old]);
  console.log('PASS: real synthetic PG17 data blocks initialization and survives restart');
  const prodLegacy = prefix + 'prodlegacy';
  mutate(prodLegacy + '_database', 'printf old-production > /fixture/sentinel');
  rejected([...compose(prodLegacy, true, true), 'run', '--no-deps', 'db'], /legacy storage is populated/i);
  mutate(prodLegacy + '_database', 'test "$(cat /fixture/sentinel)" = old-production');
  const populated = prefix + 'populated';
  mutate(populated + '_cove-data-18', 'printf existing-target > /fixture/sentinel');
  rejected([...compose(populated, false, true), 'run', '--no-deps', 'db'], /target storage is not empty/i);
  mutate(populated + '_cove-data-18', 'test "$(cat /fixture/sentinel)" = existing-target');
  console.log('PASS: production legacy and populated targets are preserved');
  const oldVol = prefix + 'interruptedold', newVol = prefix + 'interruptednew';
  const failScript = resolve('tests/fixtures/pg18-init-fail.sh');
  const args = ['run', '--network', 'none', '--entrypoint', 'sh', '-e', 'POSTGRES_PASSWORD=synthetic-only',
    '-e', 'COVE_PG18_FRESH_INSTALL=confirmed-no-existing-cove-database', '-v', oldVol + ':/cove/legacy:ro',
    '-v', newVol + ':/var/lib/postgresql', '-v', guard + ':/cove/guard.sh:ro',
    '-v', failScript + ':/docker-entrypoint-initdb.d/yy-fail.sh:ro',
    '-v', readyScript + ':/docker-entrypoint-initdb.d/zz-cove-ready.sh:ro',
    'postgres:18.4-alpine', '/cove/guard.sh'];
  rejected([...args, 'initialize', 'postgres'], /synthetic initialization failure/i);
  rejected([...args, 'start', 'postgres'], /marker is missing/i);
  rejected([...args, 'initialize', 'postgres'], /target storage is not empty/i);
  console.log('PASS: interrupted initialization fails closed');
  const failedLs = resolve('tests/fixtures/pg18-ls-fail.sh');
  rejected(['run', '--network', 'none', '--entrypoint', 'sh', '-e',
    'PATH=/test-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    '-v', prefix + 'lsold:/cove/legacy:ro', '-v', prefix + 'lsnew:/var/lib/postgresql',
    '-v', guard + ':/cove/guard.sh:ro', '-v', failedLs + ':/test-bin/ls:ro',
    'postgres:18.4-alpine', '/cove/guard.sh', 'start', 'postgres'], /could not inspect legacy storage/i);
  console.log('PASS: a failed legacy listing blocks startup');
  const slowProject = prefix + 'slow';
  const slowFile = join(dir, 'slow.yaml');
  const slowScript = resolve('tests/fixtures/pg18-slow-init.sh');
  writeFileSync(slowFile, `services:\n  db:\n    volumes:\n      - ${JSON.stringify(slowScript + ':/docker-entrypoint-initdb.d/yy-slow.sh:ro')}\n`);
  const slowArgs = [...compose(slowProject, false, true), '-f', slowFile];
  docker([...slowArgs, 'up', '-d', '--no-deps', 'db']);
  const slow = docker([...slowArgs, 'ps', '-q', 'db']).stdout.trim(); containers.push(slow);
  let began = false, observed = false;
  for (let i = 0; i < 30; i++) {
    if (docker(['exec', slow, 'test', '-f', '/var/lib/postgresql/18/docker/.synthetic-slow-started'], { allowFailure: true }).status === 0) { began = true; break; }
    await delay(500);
  }
  assert.ok(began, 'Slow fixture did not start');
  for (let i = 0; i < 11; i++) {
    if (docker(['exec', slow, 'test', '-f', '/var/lib/postgresql/18/docker/.synthetic-slow-finished'], { allowFailure: true }).status === 0) break;
    const health = JSON.parse(docker(['inspect', '--format', '{{json .State.Health}}', slow]).stdout);
    assert.notEqual(health.Status, 'healthy', 'Temporary init server was reported healthy');
    if (health.Log.length) observed = true;
    await delay(1000);
  }
  assert.ok(observed, 'Expected a healthcheck during slow initialization');
  docker([...slowArgs, 'up', '-d', '--wait', 'db']);
  const normalArgs = [...compose(slowProject, false), '-f', slowFile];
  docker([...normalArgs, 'up', '-d', '--force-recreate', '--wait', 'db']);
  const normal = docker([...normalArgs, 'ps', '-q', 'db']).stdout.trim(); containers.push(normal);
  assert.equal(docker(['exec', normal, 'psql', '-U', 'cove', '-d', 'cove', '-Atc', 'SELECT value FROM synthetic_slow']).stdout.trim(), 'completed');
  docker(['stop', normal]);
  console.log('PASS: socket-only init remains unhealthy until completion and TCP startup');
  const raceOld = prefix + 'raceold', raceNew = prefix + 'racenew';
  docker(['volume', 'create', raceOld]); docker(['volume', 'create', raceNew]);
  const raceArgs = ['run', '--network', 'none', '--entrypoint', 'sh', '-e', 'COVE_PG18_FRESH_INSTALL=confirmed-no-existing-cove-database',
    '-v', raceOld + ':/cove/legacy:ro', '-v', raceNew + ':/var/lib/postgresql', '-v', guard + ':/cove/guard.sh:ro',
    'postgres:18.4-alpine', '/cove/guard.sh', 'initialize', 'postgres', '--help'];
  const race = () => new Promise((ok, fail) => { const p = spawn('docker', raceArgs, { env, stdio: 'ignore' }); p.once('error', fail); p.once('exit', ok); });
  const result = await Promise.all([race(), race()]);
  assert.equal(result.filter(n => n === 0).length, 1);
  console.log('PASS: only one concurrent initializer claims a target');
} finally {
  for (const c of containers) spawnSync('docker', ['stop', c], { env, stdio: 'ignore', timeout: 30000 });
  console.log(`Synthetic fixtures retained under prefix ${prefix}`);
}
