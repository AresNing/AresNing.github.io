import { build } from '../research/repos/pi/node_modules/esbuild/lib/main.js';
import ts from '../research/repos/pi/node_modules/typescript/lib/typescript.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const ds=resolve(root,'research/repos/deepseek');
const path=resolve(root,'research/repos/pi/packages/agent/src/harness/compaction/compaction.ts');
const source=await readFile(path,'utf8');
const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['safeJsonStringify','estimateTextAndImageContentChars','estimateTokens','findValidCutPoints','findTurnStartIndex','findCutPoint','ESTIMATED_IMAGE_CHARS']);
const selected=[];
for(const statement of ast.statements){
  const name=ts.isFunctionDeclaration(statement)?statement.name?.text:ts.isVariableStatement(statement)?statement.declarationList.declarations[0]?.name.getText(ast):undefined;
  if(names.has(name))selected.push({name,text:statement.getText(ast),start:ast.getLineAndCharacterOfPosition(statement.getStart(ast)).line+1,end:ast.getLineAndCharacterOfPosition(statement.end).line+1});
}
if(selected.length!==names.size)throw Error('Pure-function extraction incomplete');
await writeFile(resolve(root,'evidence/protocol-context-extraction.json'),JSON.stringify({scope:'Unmodified AST declarations isolated from product import graph; not full compaction integration',file:'packages/agent/src/harness/compaction/compaction.ts',sha256:createHash('sha256').update(source).digest('hex'),declarations:selected.map(({text,...x})=>x)},null,2)+'\n');
await build({entryPoints:[resolve(root,'experiments/protocol-context-lab.ts')],outfile:resolve(root,'experiments/protocol-context-lab.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',alias:{
  '@deepseek-ai/dsh-util-values':resolve(ds,'packages/util/values/src/index.ts'),
  '@deepseek-ai/dsh-util-crypto':resolve(ds,'packages/util/crypto/src/index.ts'),
  '@deepseek-ai/dsh-brand':resolve(ds,'packages/util/brand/src/index.ts'),
},plugins:[{name:'isolate-original-pi-cut-functions',setup(b){
  b.onResolve({filter:/^research-isolated:pi-cut$/},()=>({path:'pi-cut',namespace:'research'}));
  b.onLoad({filter:/.*/,namespace:'research'},()=>({contents:selected.map(x=>x.text).join('\n'),loader:'ts'}));
}}]});
