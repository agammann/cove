import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'cove-backup-selector-'));
const backup = join(root, 'must-not-exist.dump');
const script = resolve('scripts/backup-local.mjs');
const clean = { ...process.env };
for (const key of Object.keys(clean))
  if (/^(DATABASE_URL|POSTGRES_PASSWORD|DOCKER_.*|COMPOSE_.*|PG[A-Z_]*)$/i.test(key)) delete clean[key];
const environment = 'DATABASE_URL=postgresql://cove:synthetic-only@localhost:55439/cove\nPOSTGRES_PASSWORD=synthetic-only\n';
for (const fromFile of [false, true]) {
  writeFileSync(join(root, '.env'), environment + (fromFile ? 'DOCKER_CONFIG=/synthetic\n' : ''));
  const result = spawnSync(process.execPath, [script, backup], {
    cwd: root, env: { ...clean, ...(fromFile ? {} : { DOCKER_CONFIG: '/synthetic' }) },
    encoding: 'utf8', timeout: 15000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Docker|inherited/i);
  assert.equal(existsSync(backup), false, 'Rejected selector must not create a backup');
}
console.log('PASS: inherited and file-loaded Docker selectors fail before backup creation');
console.log(`Synthetic helper files retained at ${root}`);
