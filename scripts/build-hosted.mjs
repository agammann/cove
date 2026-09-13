import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const output = resolve('dist');
if (dirname(output) !== process.cwd()) throw Error('Unexpected build output path');
rmSync(output, {recursive:true,force:true});
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','apps/web/vite.config.ts'],{stdio:'inherit',env:{...process.env,VITE_COVE_SITES:'true'}});
await import('./build-sites.mjs');
