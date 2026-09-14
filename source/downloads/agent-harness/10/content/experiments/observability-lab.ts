import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {SessionTelemetryCoordinator} from '../research/repos/deepseek/packages/session/session-telemetry/src/coordinator.ts';
import {summarizeHarnessComparisons} from '../research/repos/pi/packages/evals/src/vitest-evals/summary.ts';
const outcomes=[];
function session(){const events=[0,1,2].map(seq=>({seq,type:'fixture/event',time:seq,data:{value:'original'}}));return {id:'fixture-session',header:{version:1},firstLiveSeq:0,events,snapshotEvents(offset){return events.slice(offset);}};}
function context(){const warnings=[];return {warnings,logger:{warn:x=>warnings.push(x)},effect:()=>{},waterfall:(_name,record)=>record};}
async function check(name,fn){try{outcomes.push({name,passed:true,observation:await fn()});}catch(e){outcomes.push({name,passed:false,error:String(e)});}}
await check('10-ds-handoff-cursor-is-not-delivery-ack',()=>{
 const s=session(),ctx=context(),handed=[];const backend={emit:r=>handed.push(r),shutdown:async()=>{}};
 new SessionTelemetryCoordinator(ctx as any,backend as any,{capture:'on-demand',includeHistory:true}).captureSession(s as any,1);
 assert.equal(handed.length,2); // A fixture exporter can still drop every handed record.
 new SessionTelemetryCoordinator(ctx as any,backend as any,{capture:'on-demand',includeHistory:true}).captureSession(s as any,1);
 assert.equal(handed.length,2);
 return {recordsHandedOff:2,remoteDeliveryUnacknowledged:true,newCoordinatorSameSessionDoesNotReplayPrefix:true};
});
await check('10-ds-failed-middle-record-can-be-passed-by-cursor',()=>{
 const s=session(),ctx=context(),attempts=[],accepted=[];let rejectMiddle=true;
 const backend={emit:r=>{const n=r.attributes['event.seq'];attempts.push(n);if(n===1&&rejectMiddle)throw Error('fixture exporter reject');accepted.push(n);},shutdown:async()=>{}};
 const c=new SessionTelemetryCoordinator(ctx as any,backend as any,{capture:'on-demand',includeHistory:true});c.captureSession(s as any);assert.deepEqual(accepted,[0,2]);assert.equal(ctx.warnings.length,1);rejectMiddle=false;c.captureSession(s as any);assert.deepEqual(attempts,[0,1,2]);return {laterRecordNotStarved:true,failedMiddleNotRetriedOnNextCapture:true,accepted:[0,2]};
});
await check('10-ds-capture-prefix-and-current-redaction-policy',()=>{
 const s=session(),ctx=context(),records=[];let policy='first';ctx.waterfall=(_n,r)=>({...r,body:{...r.body,policy}});
 const c=new SessionTelemetryCoordinator(ctx as any,{emit:r=>records.push(r),shutdown:async()=>{}} as any,{capture:'on-demand',includeHistory:true});
 c.captureSession(s as any,0);s.events[0].data.value='mutated';assert.equal(records[0].body.value,'original');policy='second';c.captureSession(s as any,1);assert.deepEqual(records.map(r=>[r.attributes['event.seq'],r.body.policy]),[[0,'first'],[1,'second']]);return {inclusivePrefixHonored:true,bodyCopiedBeforeLaterMutation:true,redactionSelectedAtCaptureTime:true};
});
await check('10-pi-paired-scores-exclude-harness-error',()=>{
 const base={evalSet:'fixture',testName:'case',file:'fixture.eval.ts',baseline:'base',candidates:['candidate'],repetition:0};
 const observations=[{...base,groupKey:'a',harness:'base',outcome:'scored',score:1,totalMs:10},{...base,groupKey:'a',harness:'candidate',outcome:'scored',score:1,totalMs:5},{...base,groupKey:'b',harness:'base',outcome:'scored',score:1,totalMs:10},{...base,groupKey:'b',harness:'candidate',outcome:'errored'}];
 const report=summarizeHarnessComparisons(observations as any);const comparison=report.evalSets[0].comparisons[0];assert.equal(comparison.correctness.totalPairs,2);assert.equal(comparison.correctness.eligiblePairs,1);assert.equal(comparison.correctness.candidatePassRate,1);assert.equal(comparison.totalMs.candidateMean,5);assert.equal(report.diagnostics[0].reason,'harness-error');
 return {candidatePassRate:1,totalPairs:2,eligiblePairs:1,errorKeptAsDiagnostic:true,latencyOnlyEligiblePair:5};
});
await writeFile(new URL('../evidence/observability-results.json',import.meta.url),JSON.stringify({scope:'Unmodified DeepSeek SessionTelemetryCoordinator module, on-demand branch. Context, Session snapshot, sink and branded-number constructors are fixtures. No Cordis lifecycle, canonical-feedback authorization, real Session persistence, OTel SDK, exporter or remote delivery exercised. Also original Pi summarizeHarnessComparisons on synthetic observations, no model eval.',outcomes},null,2)+'\n');console.log(JSON.stringify({passed:outcomes.filter(x=>x.passed).length,total:outcomes.length,failures:outcomes.filter(x=>!x.passed)}));if(outcomes.some(x=>!x.passed))process.exitCode=1;
