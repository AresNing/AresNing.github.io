import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { approveEscalation, validateEscalationArgs } from '../research/repos/deepseek/packages/sandbox/sandbox/src/escalation.ts';
const results=[];
async function check(name,fn){try{results.push({name,passed:true,observation:await fn()});}catch(error){results.push({name,passed:false,error:String(error.stack??error)});}}
const request={requestedMode:'workspace-write',effectiveMode:'read-only',justification:'write fixture output',subject:'command'};
const base={agent:{id:'fixture'},callId:'fixture-call',toolName:'bash'};
await check('05-ds-invalid-pair-never-asks',async()=>{
 for(const args of [['workspace-write',undefined],[undefined,'reason'],['workspace-write','  ']])assert.throws(()=>validateEscalationArgs(...args));
 validateEscalationArgs(undefined,undefined);validateEscalationArgs('workspace-write','reason');
 return {invalidPairsRejected:3,validPairsAccepted:2};
});
await check('05-ds-widening-checked-against-effective-call',async()=>{
 let asks=0;const approval={...base,approver:{request:async()=>{asks++;return 'allowed-once';}}};
 await assert.rejects(approveEscalation({...request,effectiveMode:'workspace-write'},approval),/not strictly wider/);
 await assert.rejects(approveEscalation({...request,effectiveMode:'danger-full-access'},approval),/not strictly wider/);
 assert.equal(asks,0);
 assert.equal(await approveEscalation(request,approval),'workspace-write');assert.equal(asks,1);
 return {nonWideningAsks:0,readOnlyToWorkspaceWriteAsks:1};
});
await check('05-ds-missing-channel-fails-closed',async()=>{
 let asks=0;await assert.rejects(approveEscalation(request,{...base,approver:undefined}),/no approval service/);
 await assert.rejects(approveEscalation(request,{...base,agent:undefined,approver:{request:async()=>{asks++;return 'allowed-once';}}}),/no agent/);
 assert.equal(asks,0);return {asks:0,grants:0};
});
await check('05-ds-only-allowed-once-returns-mode',async()=>{
 const messages=[];
 for(const outcome of ['rejected','cancelled','unavailable']){
  await assert.rejects(approveEscalation(request,{...base,approver:{request:async()=>outcome}}),e=>{messages.push(e.message);return true;});
 }
 assert.equal(new Set(messages).size,3);return {nonGrantOutcomes:3,distinctErrors:3};
});
await check('05-ds-approval-pending-is-no-grant',async()=>{
 let release;const pending=new Promise(r=>release=r);let granted=false;let received;
 const ctl=new AbortController();
 const running=approveEscalation(request,{...base,signal:ctl.signal,approver:{request:async req=>{received=req;return pending;}}}).then(mode=>{granted=true;return mode;});
 await Promise.resolve();assert.equal(granted,false);assert.equal(received.signal,ctl.signal);assert.equal(received.callId,'fixture-call');assert.match(received.reason,/workspace-write/);
 release('allowed-once');assert.equal(await running,'workspace-write');assert.equal(request.effectiveMode,'read-only');
 return {grantBeforeReply:false,signalIdentityPreserved:true,callIdentityPreserved:true,inputPolicyMutated:false};
});
const report={scope:'Unmodified DeepSeek approveEscalation and validateEscalationArgs, with an injected approval responder. No actual tool, OS sandbox, full approval service, user approval or cancellation-service integration is exercised.',passed:results.filter(r=>r.passed).length,total:results.length,results};
await writeFile(resolve(import.meta.dirname,'../evidence/permission-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(report.passed!==report.total)process.exitCode=1;
