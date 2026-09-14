import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { retryProviderRequest } from '../research/repos/pi/packages/ai/src/utils/provider-retry.ts';
import { BlockAssembler } from '../research/repos/deepseek/packages/llm/llm/src/assembler.ts';
import { apply as installInvariant } from '../research/repos/deepseek/packages/llm/llm/src/invariant.ts';
import { findCutPoint, estimateTokens } from 'research-isolated:pi-cut';
const outcomes=[];
async function check(name,run){try{outcomes.push({name,passed:true,observation:await run()});}catch(e){outcomes.push({name,passed:false,error:String(e.stack??e)});}}
const providerError=(headers,status=429)=>Object.assign(new Error('fixture provider error'),{status,headers:new Headers(headers)});
await check('02-provider-429-retry',async()=>{let calls=0;const value=await retryProviderRequest(async()=>{if(++calls===1)throw providerError({'retry-after-ms':'0'});return 'ok';},{maxRetries:1});assert.equal(calls,2);return {calls,value};});
await check('02-provider-retry-veto',async()=>{let calls=0;await assert.rejects(retryProviderRequest(async()=>{calls++;throw providerError({'x-should-retry':'false'});},{maxRetries:3}));assert.equal(calls,1);return {calls,vetoHonored:true};});
await check('02-provider-delay-cap-fails',async()=>{let calls=0;await assert.rejects(retryProviderRequest(async()=>{calls++;throw providerError({'retry-after-ms':'61000'});},{maxRetries:3}),/Server requested 61s retry delay/);assert.equal(calls,1);return {calls,requestedMs:61000,capMs:60000,delayClamped:false};});
await check('02-provider-backoff-aborts',async()=>{let calls=0;const ctl=new AbortController();await assert.rejects(retryProviderRequest(async()=>{calls++;setTimeout(()=>ctl.abort(),0);throw providerError({'retry-after-ms':'10000'});},{maxRetries:3,signal:ctl.signal}),{name:'AbortError'});assert.equal(calls,1);return {calls,requestedSleepMs:10000,cancelledWithoutRetry:true};});

const textBlock={type:'text',text:'visible'};
const toolBlock={type:'tool-call',id:'a',name:'probe',arguments:'{"x":1}'};
function twoBlocks(){const a=new BlockAssembler();a.push({type:'block-end',index:0,block:textBlock});a.push({type:'block-end',index:1,block:toolBlock});return a;}
await check('02-assembler-max-tokens-prunes-replay',async()=>{const a=twoBlocks();a.push({type:'finish',reason:{kind:'max-tokens'},replayState:{response:{fixture:true},blocks:[{id:'text'},{id:'tool'}]}});assert.deepEqual(a.blocks(),[textBlock]);assert.deepEqual(a.replayState.blocks,[{id:'text'}]);return {keptTypes:a.blocks().map(x=>x.type),keptReplay:a.replayState.blocks};});
await check('02-assembler-first-close-wins',async()=>{const a=twoBlocks();a.push({type:'block-end',index:0,block:{type:'text',text:'replacement'}});a.push({type:'text-delta',index:0,text:'straggler'});assert.equal(a.blocks()[0].text,'visible');return {text:a.blocks()[0].text};});
await check('02-assembler-interrupt-omits-tool',async()=>{const a=twoBlocks();assert.deepEqual(a.interruptedBlocks(),[textBlock]);return {keptTypes:a.interruptedBlocks().map(x=>x.type)};});
await check('02-assembler-missing-finish-vs-invariant',async()=>{
  const a=twoBlocks();assert.equal(a.finish.kind,'stop');
  const handlers=new Map();
  const ctx={on:(name,fn)=>handlers.set(name,fn),get:()=>undefined,invariants:{register:(_owner,install)=>{install(ctx,message=>{throw Error(message);});return ()=>{};}}};
  await installInvariant(ctx);
  async function* source(){yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:textBlock};}
  await assert.rejects(async()=>{for await(const c of handlers.get('llm/stream')({},()=>source()))void c;},/without a terminal finish/);
  return {assemblerDefault:'stop',strictCompanionRejects:true,productionPluginEnablement:'not tested'};
});

const user=(text)=>({role:'user',content:text,timestamp:0});
const assistant=(content)=>({role:'assistant',content,timestamp:0});
const entry=(message)=>({type:'message',message});
await check('03-cut-does-not-start-at-tool-result',async()=>{
  const entries=[entry(user('task')),entry(assistant([{type:'toolCall',id:'a',name:'probe',arguments:{}}])),entry({role:'toolResult',toolCallId:'a',content:[{type:'text',text:'x'.repeat(400)}],timestamp:0}),entry(assistant([{type:'text',text:'ok'}]))];
  const cut=findCutPoint(entries,0,entries.length,10);assert.equal(cut.firstKeptEntryIndex,3);assert.equal(cut.turnStartIndex,0);assert.equal(cut.isSplitTurn,true);
  return {...cut,retainedEstimate:estimateTokens(entries[3].message),requestedRecentTokens:10};
});
await check('03-cut-can-keep-more-than-budget',async()=>{
  const entries=[entry(user('task')),entry(assistant([{type:'toolCall',id:'a',name:'probe',arguments:{}}])),entry({role:'toolResult',toolCallId:'a',content:[{type:'text',text:'x'.repeat(400)}],timestamp:0})];
  const cut=findCutPoint(entries,0,entries.length,10);assert.equal(cut.firstKeptEntryIndex,0);
  return {...cut,retainedEstimate:entries.reduce((s,e)=>s+estimateTokens(e.message),0),requestedRecentTokens:10};
});
await check('03-cut-user-boundary-does-not-split',async()=>{const entries=[entry(user('old')),entry(assistant([{type:'text',text:'done'}])),entry(user('new task'))];const cut=findCutPoint(entries,0,3,1);assert.equal(cut.firstKeptEntryIndex,2);assert.equal(cut.isSplitTurn,false);return cut;});
await writeFile(resolve(import.meta.dirname,'../evidence/protocol-context-results.json'),JSON.stringify({date:'2026-09-13',scope:'Original pure algorithms and retry helper with synthetic inputs; no network or full product integration',outcomes},null,2)+'\n');
console.log(JSON.stringify({passed:outcomes.filter(x=>x.passed).length,total:outcomes.length,failures:outcomes.filter(x=>!x.passed)},null,2));
if(outcomes.some(x=>!x.passed))process.exitCode=1;
