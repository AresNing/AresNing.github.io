import { build } from '../research/repos/pi/node_modules/esbuild/lib/main.js';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await build({entryPoints:[resolve(root,'experiments/permission-lab.ts')],outfile:resolve(root,'experiments/permission-lab.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',alias:{'@deepseek-ai/dsh-util-values':resolve(root,'research/repos/deepseek/packages/util/values/src/index.ts')}});
