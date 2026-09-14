import { build } from '../research/repos/pi/node_modules/esbuild/lib/main.js';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await build({
  entryPoints: [resolve(root, 'experiments/pi-lab.ts')],
  outfile: resolve(root, 'experiments/pi-lab.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  alias: { '@earendil-works/pi-ai': resolve(root, 'experiments/pi-api-bridge.ts') },
});
await build({
  entryPoints: [resolve(root, 'experiments/deepseek-lab.ts')],
  outfile: resolve(root, 'experiments/deepseek-lab.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  alias: { '@deepseek-ai/cosmokit': resolve(root, 'research/repos/deepseek/vendor/cosmokit/src/index.ts') },
});
