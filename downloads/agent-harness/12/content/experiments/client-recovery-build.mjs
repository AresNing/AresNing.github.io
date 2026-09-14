// Bundle fixed upstream modules. Package aliases only resolve their original source exports.
import {build} from '../research/repos/pi/node_modules/esbuild/lib/main.js';
import {resolve} from 'node:path';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='research/repos/deepseek/packages';
const aliases={
 '@deepseek-ai/dsh-typert-protocol':`${base}/typert/protocol/src/remote-error.ts`,
 '@deepseek-ai/dsh-deque':`${base}/util/deque/src/index.ts`,
 '@deepseek-ai/dsh-util-crypto':`${base}/util/crypto/src/index.ts`,
 '@deepseek-ai/dsh-util-values':`${base}/util/values/src/index.ts`,
 '@deepseek-ai/dsh-brand':`${base}/util/brand/src/index.ts`,
 '@deepseek-ai/dsh-llm/assistant-stream':`${base}/llm/llm/src/assistant-stream.ts`,
};
const result=await build({entryPoints:['experiments/client-recovery-lab.ts'],outfile:'experiments/client-recovery-lab.mjs',bundle:true,format:'esm',platform:'node',target:'node22',metafile:true,alias:Object.fromEntries(Object.entries(aliases).map(([a,p])=>[a,resolve(p)]))});
const files=Object.keys(result.metafile.inputs).filter(p=>p.startsWith('research/repos/'));
const sources=await Promise.all(files.map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
await writeFile('evidence/client-recovery-module-sources.json',JSON.stringify({scope:'Unmodified Pi event bus/reducer and DeepSeek journal/assistant reducers; alias maps narrow original exports. Controlled carriers and inputs, not complete products.',aliases,sources},null,2)+'\n');
console.log(`Bundled ${sources.length} fixed upstream source modules`);
