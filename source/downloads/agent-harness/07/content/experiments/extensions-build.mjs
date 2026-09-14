import { build } from '../research/repos/pi/node_modules/esbuild/lib/main.js';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
await build({entryPoints:[resolve(root,'experiments/extensions-lab.ts')],outfile:resolve(root,'experiments/extensions-lab.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',alias:{'@deepseek-ai/cosmokit':resolve(root,'research/repos/deepseek/vendor/cosmokit/src/index.ts')}});
