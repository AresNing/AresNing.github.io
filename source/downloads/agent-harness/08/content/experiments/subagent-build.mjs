import { build } from '../research/repos/pi/node_modules/esbuild/lib/main.js';
import ts from '../research/repos/pi/node_modules/typescript/lib/typescript.js';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const file='packages/coding-agent/examples/extensions/subagent/index.ts';
const source=await readFile(resolve(root,'research/repos/pi',file),'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=['runSingleAgent','mapWithConcurrencyLimit'];
const selected=ast.statements.filter(x=>ts.isFunctionDeclaration(x)&&names.includes(x.name?.text)).map(x=>({name:x.name.text,text:x.getText(ast),start:ast.getLineAndCharacterOfPosition(x.getStart(ast)).line+1,end:ast.getLineAndCharacterOfPosition(x.end).line+1}));
if(selected.length!==2)throw Error('Missing original functions');
const seam=`import {spawn as nativeSpawn} from 'node:child_process';
export const fixture={code:'',onSpawn:undefined,args:[],timers:[],timerFired:0};
function getPiInvocation(args){fixture.args=args;return {command:process.execPath,args:['-e',fixture.code,'--',...args]};}
function spawn(...args){const proc=nativeSpawn(...args);fixture.onSpawn?.(proc);return proc;}
function setTimeout(fn,ms){const t=globalThis.setTimeout(()=>{fixture.timerFired++;fn();},ms);fixture.timers.push(t);return t;}
function writePromptToTempFile(){throw Error('Prompt file seam not exercised');}
function getFinalOutput(){throw Error('Progress UI seam not exercised');}
`;
await writeFile(resolve(root,'evidence/subagent-extraction.json'),JSON.stringify({file,sha256:createHash('sha256').update(source).digest('hex'),declarations:selected.map(({text,...x})=>x),scope:'Original function bodies, isolated by AST. CLI command resolution replaced with a controlled Node child, spawn forwarded to native spawn, timers forwarded at original duration and observed. Empty systemPrompt and absent onUpdate avoid prompt-file/UI helper paths. No Pi CLI, model, plugins, actual agent or full extension load.'},null,2)+'\n');
const dsFile='packages/subagent/subagent/src/child-agent.ts';
const dsSource=await readFile(resolve(root,'research/repos/deepseek',dsFile),'utf8');
const dsAst=ts.createSourceFile(dsFile,dsSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const dsNames=['captureDelegatedPolicyOverrides','appendDelegatedPolicyOverrides'];
const dsSelected=dsAst.statements.filter(x=>ts.isFunctionDeclaration(x)&&dsNames.includes(x.name?.text)).map(x=>({name:x.name.text,text:x.getText(dsAst),start:dsAst.getLineAndCharacterOfPosition(x.getStart(dsAst)).line+1,end:dsAst.getLineAndCharacterOfPosition(x.end).line+1}));
if(dsSelected.length!==2)throw Error('Missing delegation functions');
const manifest=JSON.parse(await readFile(resolve(root,'evidence/subagent-extraction.json'),'utf8'));
manifest.deepseek={file:dsFile,sha256:createHash('sha256').update(dsSource).digest('hex'),declarations:dsSelected.map(({text,...x})=>x),scope:'Original policy capture/append bodies; parent policy services and child session append are fixtures.'};
await writeFile(resolve(root,'evidence/subagent-extraction.json'),JSON.stringify(manifest,null,2)+'\n');
await build({entryPoints:[resolve(root,'experiments/subagent-lab.ts')],outfile:resolve(root,'experiments/subagent-lab.mjs'),bundle:true,format:'esm',platform:'node',target:'node22',plugins:[{name:'original-subagent-functions',setup(b){b.onResolve({filter:/^research-isolated:ds-delegation$/},()=>({path:'ds',namespace:'delegation'}));b.onLoad({filter:/.*/,namespace:'delegation'},()=>({contents:dsSelected.map(x=>x.text).join('\n'),loader:'ts'}));b.onResolve({filter:/^research-isolated:pi-subagent$/},()=>({path:'pi',namespace:'research'}));b.onLoad({filter:/.*/,namespace:'research'},()=>({contents:seam+selected.map(x=>x.text).join('\n')+'\nexport {runSingleAgent,mapWithConcurrencyLimit};',loader:'ts'}));}}]});
