import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runSingleAgent,mapWithConcurrencyLimit,fixture } from 'research-isolated:pi-subagent';
import { captureDelegatedPolicyOverrides,appendDelegatedPolicyOverrides } from 'research-isolated:ds-delegation';
import { settleRun } from '../research/repos/deepseek/packages/subagent/subagent/src/run-settlement.ts';
const outcomes=[];const latch=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release};};
async function check(name,fn){let timer;try{const observation=await Promise.race([fn(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('scenario deadline exceeded')),10000))]);outcomes.push({name,passed:true,observation});}catch(e){outcomes.push({name,passed:false,error:String(e.stack??e)});}finally{clearTimeout(timer);for(const t of fixture.timers)clearTimeout(t);fixture.timers=[];fixture.onSpawn=undefined;}}
const agent={name:'probe',source:'fixture',systemPrompt:''};
await check('08-pi-model-override-stops-thinking-inheritance',async()=>{
 fixture.code='process.exit(0)';const defaults={model:'parent/model',thinkingLevel:'high'};
 await runSingleAgent(process.cwd(),defaults,[agent],'probe','fixture',undefined,undefined,undefined,undefined,r=>({results:r}));
 assert.ok(fixture.args.includes('--thinking'));assert.ok(fixture.args.includes('parent/model'));const inherited=[...fixture.args];
 await runSingleAgent(process.cwd(),defaults,[{...agent,model:'child/model'}],'probe','fixture',undefined,undefined,undefined,undefined,r=>({results:r}));
 assert.ok(!fixture.args.includes('--thinking'));assert.ok(fixture.args.includes('child/model'));
 return {inheritedThinking:true,explicitChildModelThinkingInherited:false,baseFlags:inherited.slice(0,4)};
});
await check('08-pi-term-sent-is-not-process-exited',async()=>{
 const ready=latch(),term=latch();let proc;fixture.timerFired=0;
 fixture.code="process.on('SIGTERM',()=>process.stdout.write('TERM_SEEN\\n'));process.stdout.write('READY\\n');setInterval(()=>{},1000);";
 fixture.onSpawn=p=>{proc=p;p.stdout.on('data',buf=>{const s=String(buf);if(s.includes('READY'))ready.release();if(s.includes('TERM_SEEN'))term.release();});};
 const ctl=new AbortController();let settled=false;
 const run=runSingleAgent(process.cwd(),{},[agent],'probe','fixture',undefined,undefined,ctl.signal,undefined,r=>({results:r})).then(x=>{settled=true;return {ok:true,x};},error=>{settled=true;return {ok:false,error:String(error)};});
 const watchdog=setTimeout(()=>proc?.kill('SIGKILL'),8000);
 try{
  await ready.promise;ctl.abort();await term.promise;
  await delay(5250);
  assert.equal(fixture.timerFired,1);assert.equal(proc.killed,true);assert.equal(proc.exitCode,null);assert.equal(proc.signalCode,null);assert.equal(settled,false);
  const observation={fallbackTimerFired:true,killedFlag:true,childStillAlive:true,parentRunStillPending:true,watchdogKillRequired:true};
  proc.kill('SIGKILL');const result=await run;assert.equal(result.ok,false);assert.match(result.error,/Subagent was aborted/);return observation;
 }finally{clearTimeout(watchdog);if(proc?.exitCode===null&&proc?.signalCode===null)proc.kill('SIGKILL');await run;}
});
await check('08-pi-pool-capacity-and-input-order',async()=>{
 const release=latch(),cStarted=latch();const starts=[];let active=0,max=0;
 const run=mapWithConcurrencyLimit(['A','B','C'],2,async id=>{starts.push(id);active++;max=Math.max(max,active);if(id==='A')await release.promise;if(id==='C')cStarted.release();active--;return id;});
 await cStarted.promise;assert.deepEqual(starts,['A','B','C']);release.release();const result=await run;assert.deepEqual(result,['A','B','C']);assert.equal(max,2);return {maxActive:2,CStartsBeforeAEnds:true,resultsInInputOrder:true};
});
await check('08-pi-pool-rejection-does-not-join-peer',async()=>{
 const release=latch(),entered=latch();let finished=false;
 const run=mapWithConcurrencyLimit(['A','B'],2,async id=>{if(id==='A'){await entered.promise;throw Error('fixture failure');}entered.release();await release.promise;finished=true;});
 try{await assert.rejects(run,/fixture failure/);assert.equal(finished,false);return {aggregateRejectedBeforePeerFinished:true};}finally{release.release();await Promise.resolve();}
});
await check('08-ds-delegation-pins-approval-not-one-shot-grants',async()=>{
 let mode='workspace-write';const parent={session:{},ctx:{get:name=>name==='sandboxPolicy'?{defaultMode:'danger-full-access',overrideOf:()=>mode}:name==='approval'?{policy:'on-request'}:undefined}};
 const captured=captureDelegatedPolicyOverrides(parent);mode='read-only';assert.deepEqual(captured,{sandboxMode:'workspace-write',approvalPolicy:'never'});
 const events=[];appendDelegatedPolicyOverrides({append:(type,data)=>events.push({type,data})},captured);
 assert.deepEqual(events.map(x=>[x.type,x.data.source]),[['sandbox/mode','delegation'],['approval/policy','delegation']]);
 mode=undefined;assert.equal(captureDelegatedPolicyOverrides(parent).sandboxMode,undefined);
 return {snapshotUnaffectedByLaterParentSwitch:true,approvalPinnedToNever:true,deploymentDefaultNotCopied:true,appendedPolicyEvents:2};
});
await check('08-ds-job-settlement-waits-disposal',async()=>{
 const entered=latch(),release=latch();let settled=false;
 const running=settleRun({result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:'done'}]}),dispose:async()=>{entered.release();await release.promise;}}).then(x=>{settled=true;return x;});
 await entered.promise;assert.equal(settled,false);release.release();assert.deepEqual(await running,{status:'completed',output:'done'});
 return {resultReadyBeforeJobSettled:true,waitsForDispose:true};
});
await check('08-ds-dispose-failure-is-job-failure',async()=>{
 const one=await settleRun({result:Promise.resolve({stopReason:'completed',output:[]}),dispose:async()=>{throw Error('cleanup fault');}});assert.equal(one.status,'failed');assert.match(one.detail,/cleanup fault/);
 const both=await settleRun({result:Promise.reject(Error('result fault')),dispose:async()=>{throw Error('cleanup fault');}});assert.equal(both.status,'failed');assert.match(both.detail,/result fault/);assert.match(both.detail,/cleanup fault/);
 return {successfulResultDoesNotHideCleanupFailure:true,bothFailureDetailsPreserved:true};
});
const report={scope:'Original Pi subagent example functions and DeepSeek delegation policy functions isolated by AST, plus original DeepSeek settleRun; controlled real Node child processes and fixture policy/session services, no actual agents/models. The stuck-child observation deliberately verifies an implementation limitation and uses explicit watchdog cleanup.',outcomes};
await writeFile(resolve(import.meta.dirname,'../evidence/subagent-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:outcomes.filter(x=>x.passed).length,total:outcomes.length,failures:outcomes.filter(x=>!x.passed)}));if(outcomes.some(x=>!x.passed))process.exitCode=1;
