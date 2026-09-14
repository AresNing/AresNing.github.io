import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runAgentLoop } from '../research/repos/pi/packages/agent/src/agent-loop.ts';
import { EventStream } from '../research/repos/pi/packages/ai/src/utils/event-stream.ts';
import { executeToolCalls } from '../research/repos/deepseek/packages/core/agent-loop/src/tool-calls.ts';
import { TOOL_RUNTIME_SCHEDULER } from '@deepseek-ai/dsh-tools';

const model = { id: 'fixture', name: 'fixture', api: 'openai-responses', provider: 'fixture', baseUrl: 'https://example.invalid', reasoning: false, input: ['text'], cost: {input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow:8192,maxTokens:2048 };
const usage = {input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
const txt = value => ({type:'text',text:value});
const user = value => ({role:'user',content:value,timestamp:0});
const result = (id, extra={}) => ({content:[txt(id)],details:{},isError:false,...extra});
const message = (content, stopReason='stop') => ({role:'assistant',content,stopReason,api:model.api,provider:'fixture',model:'fixture',usage,timestamp:0});
const call = (id,name='probe') => ({type:'toolCall',id,name,arguments:{value:id}});
const gate = () => {let release; const promise=new Promise(r => release=r); return {promise,release};};
const outcomes=[];
const traces=[];
async function check(name, run) {
  const trace=[];
  const record=(kind,data={}) => trace.push({seq:trace.length+1,kind,...structuredClone(data)});
  let timer;
  try {
    const observation=await Promise.race([run(record),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('scenario deadline exceeded')),5000);})]);
    outcomes.push({name,passed:true,observation});
  } catch(error) {outcomes.push({name,passed:false,error:String(error.stack??error)});}
  finally {clearTimeout(timer);traces.push({name,events:trace});}
}
function pi(responses, record, config={}, execute=async id=>result(id), toolsExtra=[]) {
  let index=0;
  const inputs=[]; const events=[];
  const tools=[{name:'probe',label:'Probe',description:'fixture',parameters:{type:'object',properties:{value:{type:'string'}},required:['value']},execute},...toolsExtra];
  const streamFn=(_model,context)=>{
    inputs.push(JSON.parse(JSON.stringify(context))); record('model',{index:inputs.length});
    const stream=new EventStream(e=>e.type==='done',e=>e.message);
    queueMicrotask(()=>{const m=responses[index++]??message([txt('done')]);stream.push({type:'done',reason:m.stopReason,message:m});});
    return stream;
  };
  const running=runAgentLoop([user('fixture')],{systemPrompt:'fixture',messages:[],tools},{model,convertToLlm:x=>x,...config},e=>{events.push(structuredClone(e));record('pi-event',{raw:e});},undefined,streamFn);
  return {running,inputs,events};
}

await check('01-stop-before-followup-poll',async record=>{
  let polls=0;
  const p=pi([message([call('a')],'toolUse')],record,{shouldStopAfterTurn:()=>true,getFollowUpMessages:()=>{polls++;return [user('pending')];}});
  await p.running;assert.equal(p.inputs.length,1);assert.equal(polls,0);
  assert.equal(p.events.filter(e=>e.type==='tool_execution_end').length,1);
  return {modelCalls:1,followupPolls:0,toolCompleted:true};
});
await check('01-steer-during-prepare',async record=>{
  const queue=[];let prepared=false;
  const p=pi([message([call('a')],'toolUse'),message([txt('done')])],record,{
    getSteeringMessages:()=>queue.splice(0,1),
    prepareNextTurn:()=>{if(!prepared){prepared=true;queue.push(user('arrived-during-prepare'));}return undefined;},
  });
  await p.running;
  assert.ok(p.inputs[1].messages.some(m=>m.content==='arrived-during-prepare'));
  assert.equal(queue.length,0);
  return {secondRequestIncludesLateSteering:true,modelCalls:p.inputs.length};
});
await check('04-pi-all-preflight-before-body',async record=>{
  const bEntered=gate(),bRelease=gate();let bodies=0;
  const p=pi([message([call('a'),call('b')],'toolUse')],record,{
    beforeToolCall:async({toolCall})=>{record('preflight',{id:toolCall.id});if(toolCall.id==='b'){bEntered.release();await bRelease.promise;}},
  },async id=>{bodies++;record('body',{id});return result(id);});
  await bEntered.promise;assert.equal(bodies,0);bRelease.release();await p.running;assert.equal(bodies,2);
  return {bodiesWhileBApprovalPending:0,finalBodies:2};
});
await check('04-pi-one-sequential-tool-serializes-batch',async record=>{
  const aStarted=gate(),aRelease=gate();const starts=[];
  const execute=async id=>{starts.push(id);if(id==='a'){aStarted.release();await aRelease.promise;}return result(id);};
  const p=pi([message([call('a'),call('b'),call('c','exclusive')],'toolUse')],record,{},execute,[{name:'exclusive',executionMode:'sequential',parameters:{type:'object'},execute}]);
  await aStarted.promise;assert.deepEqual(starts,['a']);aRelease.release();await p.running;
  assert.deepEqual(starts,['a','b','c']);return {startsBeforeAReleased:['a'],finalStarts:starts};
});
await check('04-pi-termination-is-all-results',async record=>{
  const mixed=pi([message([call('a'),call('b')],'toolUse')],record,{},async id=>result(id,{terminate:id==='a'}));
  await mixed.running;
  const unanimous=pi([message([call('a'),call('b')],'toolUse')],record,{},async id=>result(id,{terminate:true}));
  await unanimous.running;assert.equal(mixed.inputs.length,2);assert.equal(unanimous.inputs.length,1);
  return {mixedModelCalls:2,unanimousModelCalls:1,allBodiesStillExecuted:true};
});
await check('04-pi-blocked-peer-is-not-batch-rollback',async record=>{
  const writes=[];
  const p=pi([message([call('a'),call('b')],'toolUse')],record,{
    beforeToolCall:({toolCall})=>toolCall.id==='b'?{block:true,terminate:true,reason:'fixture deny'}:undefined,
  },async id=>{writes.push(id);return result(id);});
  await p.running;assert.deepEqual(writes,['a']);assert.equal(p.inputs.length,2);
  return {executed:['a'],denied:['b'],modelCalls:2};
});

// This boundary uses the unchanged DeepSeek scheduler and message constructors.
// The registry, policy/dispatch/finalize service and session append are fixtures.
function ds(record, options={}) {
  const logs=[], contexts=[], starts=[], finished=[];
  const ctl=new AbortController();let active=0,maxActive=0;
  const agent={session:{append(type,data,intent){const event={seq:logs.length+1,type,data:structuredClone(data),intent:structuredClone(intent)};logs.push(event);record('session-append',{event});return event;}}};
  const service={
    prepare:async exec=>{record('prepare',{id:exec.callId});return options.prepare?options.prepare(exec):{kind:'dispatch',exec};},
    dispatch:async exec=>{starts.push(exec.callId);active++;maxActive=Math.max(active,maxActive);record('body-start',{id:exec.callId});try{return {kind:'post-result',result:await (options.body?.(exec,ctl)??result(exec.callId))};}finally{active--;finished.push(exec.callId);record('body-end',{id:exec.callId});}},
    finalize:async(exec,res)=>{record('finalize',{id:exec.callId});await options.finalize?.(exec,res);return res;},
    finish:(_exec,res)=>res,
  };
  const ctx={agents:{requireInitiator:()=>agent},agentLoop:{config:{maxParallelToolCalls:options.capacity??2}},tools:{executionMode:exec=>({kind:options.mode?.(exec)??'parallel'}),[TOOL_RUNTIME_SCHEDULER]:service}};
  return {logs,contexts,starts,finished,ctl,get maxActive(){return maxActive;},run:(ids=['a','b','c'])=>executeToolCalls(ctx,1,1,ids.map(id=>({type:'tool-call',id,name:'probe',arguments:'{}'})),ctl.signal,c=>contexts.push(c))};
}
await check('04-ds-rolling-pool-ordered-commit',async record=>{
  const aRelease=gate(),cStarted=gate();
  const d=ds(record,{body:async exec=>{if(exec.callId==='a')await aRelease.promise;if(exec.callId==='c')cStarted.release();return result(exec.callId);}});
  const running=d.run();await cStarted.promise;
  assert.deepEqual(d.starts,['a','b','c']);assert.equal(d.logs.filter(e=>e.type==='tool/result').length,0);
  aRelease.release();await running;
  const order=d.logs.filter(e=>e.type==='tool/result').map(e=>e.data.message.source.callId);
  assert.deepEqual(order,['a','b','c']);assert.equal(d.maxActive,2);
  return {thirdStartedBeforeFirstCompleted:true,resultsBeforeFirstCompleted:0,resultOrder:order,maxActive:2};
});
await check('04-ds-live-exclusive-barrier',async record=>{
  const aRelease=gate(),bRelease=gate(),bothStarted=gate(),aCommitted=gate();let exclusive=false,bFinished=false;
  const d=ds(record,{mode:exec=>exec.callId==='c'&&exclusive?'exclusive':'parallel',
    body:async exec=>{if(exec.callId==='a')await aRelease.promise;if(exec.callId==='b'){bothStarted.release();await bRelease.promise;bFinished=true;}if(exec.callId==='c')assert.equal(bFinished,true);return result(exec.callId);},
    finalize:exec=>{if(exec.callId==='a'){exclusive=true;aCommitted.release();}},
  });
  const running=d.run();await bothStarted.promise;aRelease.release();
  // Advance through the scheduler's actual finalizer, without relying on sleep.
  await aCommitted.promise;
  assert.deepEqual(d.starts,['a','b']);bRelease.release();await running;
  assert.ok(d.finished.indexOf('b')<d.finished.indexOf('c'));return {cReclassifiedAfterACommit:true,cWaitedForB:true};
});
await check('04-ds-cancel-drains-and-pairs-skipped',async record=>{
  const release=gate(),bothStarted=gate();let settled=false;
  const d=ds(record,{body:async exec=>{if(exec.callId==='b')bothStarted.release();await release.promise;return result(exec.callId);}});
  const running=d.run().then(x=>{settled=true;return x;});await bothStarted.promise;d.ctl.abort();
  assert.equal(settled,false);release.release();await running;assert.deepEqual(d.starts,['a','b']);
  const results=d.logs.filter(e=>e.type==='tool/result');assert.equal(results.length,3);
  assert.equal(results[2].data.error.code,'ABORTED_BEFORE_DISPATCH');
  for(const e of results)assert.equal(d.logs[e.intent.sourceEventSeqs[0]-1].type,'tool/call');
  return {started:d.starts,resultCount:3,skippedCode:results[2].data.error.code,abortedSignalPreserved:d.ctl.signal.aborted};
});
await check('04-ds-internal-failure-drains-without-fabrication',async record=>{
  const release=gate(),failed=gate();let settled=false;
  const d=ds(record,{body:async exec=>{if(exec.callId==='a'){await release.promise;return result('a');}failed.release();throw Error('fixture scheduler dispatch rejection');}});
  const running=d.run().then(()=>{throw Error('unexpected success');},error=>{settled=true;return String(error);});
  await failed.promise;assert.equal(settled,false);release.release();const error=await running;
  assert.match(error,/fixture scheduler/);assert.deepEqual(d.starts,['a','b']);
  assert.equal(d.logs.filter(e=>e.type==='tool/result').length,0);
  return {started:d.starts,drained:d.finished,toolCallsRetained:2,fabricatedResults:0};
});
await check('04-ds-conclusion-is-any-committed-result',async record=>{
  const d=ds(record,{body:async exec=>result(exec.callId,{concludesTurn:exec.callId==='a'})});
  const outcome=await d.run(['a','b']);assert.equal(outcome.concluded,true);assert.deepEqual(d.starts,['a','b']);
  return {concluded:true,bodiesExecuted:d.starts,shortCircuit:false};
});

const output=resolve(import.meta.dirname,'../evidence');
await writeFile(resolve(output,'deep-dive-results.json'),JSON.stringify({date:'2026-09-13',scope:'Pi real loop; DeepSeek real scheduler with stub services and real message constructor; no product or model benchmark',outcomes},null,2)+'\n');
await writeFile(resolve(output,'deep-dive-traces.json'),JSON.stringify(traces,null,2)+'\n');
console.log(JSON.stringify({passed:outcomes.filter(x=>x.passed).length,total:outcomes.length,failures:outcomes.filter(x=>!x.passed)},null,2));
if(outcomes.some(x=>!x.passed))process.exitCode=1;
