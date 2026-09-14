import { build } from '../research/repos/pi/node_modules/esbuild/lib/main.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const ds = resolve(root, 'research/repos/deepseek');
// Reuse the upstream scheduler's two constant declarations verbatim. The actual
// Tools service is a fixture; pulling in its full plugin graph would test a
// different boundary. No scheduler statements or message constructors change.
const toolsSource = await readFile(resolve(ds, 'packages/core/tools/src/index.ts'), 'utf8');
const declarations = ['TOOL_RUNTIME_SCHEDULER', 'TOOL_ABORTED_BEFORE_DISPATCH'].map(name => {
  const line = toolsSource.split('\n').find(line => line.startsWith(`export const ${name}`));
  if (!line) throw Error(`Missing upstream declaration: ${name}`);
  return line;
}).join('\n');
await build({
  entryPoints: [resolve(root, 'experiments/deep-dive-lab.ts')],
  outfile: resolve(root, 'experiments/deep-dive-lab.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  alias: {
    '@earendil-works/pi-ai': resolve(root, 'experiments/pi-api-bridge.ts'),
    '@deepseek-ai/dsh-llm': resolve(ds, 'packages/llm/llm/src/message.ts'),
    '@deepseek-ai/dsh-util-values': resolve(ds, 'packages/util/values/src/index.ts'),
    '@deepseek-ai/dsh-util-crypto': resolve(ds, 'packages/util/crypto/src/index.ts'),
    '@deepseek-ai/dsh-brand': resolve(ds, 'packages/util/brand/src/index.ts'),
  },
  plugins: [{name: 'upstream-tool-seam-constants', setup(builder) {
    builder.onResolve({filter: /^@deepseek-ai\/dsh-tools$/}, () => ({path: 'constants', namespace: 'tool-seam'}));
    builder.onLoad({filter: /.*/, namespace: 'tool-seam'}, () => ({contents: declarations, loader: 'ts'}));
  }}],
});
