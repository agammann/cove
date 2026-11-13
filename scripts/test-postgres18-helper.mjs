import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
if (process.platform === 'win32') {
  console.log('POSIX mock runs on hosted Linux.');
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), 'cove-pg18-helper-'));
const log = join(dir, 'calls');
writeFileSync(join(dir, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >> "$COVE_MOCK_LOG"
if [ "$1" = context ]; then printf '"%s"\\n' "\${COVE_MOCK_HOST:-unix:///fixture}"; exit 0; fi
case " $* " in *' ps -a '*) printf '%s\\n' "\${COVE_MOCK_EXISTING:-[]}" ;; esac
`, { mode: 0o755 });
const script = resolve('scripts/confirm-postgres18-fresh.mjs');
function check(mode, answer, extra = {}, file = '') {
  writeFileSync(log, '');
  const host = mode === 'local' ? 'localhost:55439' : 'db:5432';
  const environment = `DATABASE_URL=postgresql://cove:synthetic-only@${host}/cove\nPOSTGRES_PASSWORD=synthetic-only\nCOVE_DOMAIN=fixture.invalid\n` + file;
  writeFileSync(join(dir, mode === 'local' ? '.env' : '.env.production'), environment);
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^(DATABASE_URL|POSTGRES_PASSWORD|COVE_PG18_FRESH_INSTALL|COMPOSE_.*|DOCKER_HOST|DOCKER_CONTEXT|PG[A-Z_]*)$/i.test(k)) delete clean[k];
  const r = spawnSync(process.execPath, [script, mode], { cwd: dir, input: answer + '\n', encoding: 'utf8', timeout: 10000,
    env: { ...clean, PATH: dir + delimiter + clean.PATH, COVE_MOCK_LOG: log, ...extra } });
  return { ...r, calls: readFileSync(log, 'utf8') };
}
for (const mode of ['local', 'production']) {
  for (const failure of [
    check(mode, 'no'),
    check(mode, 'NO EXISTING COVE DATABASE', { COVE_MOCK_EXISTING: '{"ID":"existing"}' }),
    check(mode, 'NO EXISTING COVE DATABASE', { COMPOSE_FILE: 'unexpected' }),
    check(mode, 'NO EXISTING COVE DATABASE', { COVE_MOCK_HOST: 'tcp://fixture.invalid:2375' }),
    check(mode, 'NO EXISTING COVE DATABASE', {}, 'PGHOST=unexpected\n'),
    check(mode, 'NO EXISTING COVE DATABASE', {}, 'POSTGRES_PASSWORD=mismatch\n'),
  ]) {
    assert.notEqual(failure.status, 0);
    assert.doesNotMatch(failure.calls, / up /);
  }
  const success = check(mode, 'NO EXISTING COVE DATABASE');
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.calls, /compose\.postgres18-init\.yaml up -d --wait db/);
  assert.match(success.calls, / up -d --force-recreate --wait db/);
}
console.log('PASS: helper rejects unconfirmed, mismatched, selected and remote cases; confirmed fixtures use both modes');
console.log(`Synthetic helper files retained at ${dir}`);
