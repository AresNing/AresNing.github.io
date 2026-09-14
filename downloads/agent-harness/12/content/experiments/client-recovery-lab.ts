import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {HarnessEventBus} from '../research/repos/pi/packages/agent/src/harness/events.ts';
import {reduceLaneSnapshot} from '../research/repos/pi/packages/agent/src/harness/runtime/reducer.ts';
import {RemoteJournalStream} from '../research/repos/deepseek/packages/api/gateway/src/client/journal-stream.ts';
import {ClientAssistantStream} from '../research/repos/deepseek/packages/api/session-controller/src/client/sessions/assistant-stream.ts';
const outcomes:any[]=[];
const tick=()=>new Promise(r=>setImmediate(r));
function latch<T=void>(){let release!:(v:T)=>void;const promise=new Promise<T>(r=>release=r);return {release,promise};}
async function until(pred:()=>boolean){for(let i=0;i<100;i++){if(pred())return;await tick();}throw Error('controlled schedule did not settle');}
async function check(name:string,fn:()=>any){try{outcomes.push({name,passed:true,observation:await fn()});}catch(e){outcomes.push({name,passed:false,error:String(e)});}}
const context={} as any;
const evt=(value:number)=>({type:'usage',totals:{tokens:value}} as any);
await check('12-pi-watch-buffers-before-start',async()=>{
 const bus=new HarnessEventBus();const w=bus.watch({cut:0},()=>true,context);const seen:number[]=[];
 await bus.emit(evt(1),context);assert.deepEqual(seen,[]);w.start(e=>{seen.push((e as any).totals.tokens);});await until(()=>seen.length===1);
 await bus.emit(evt(2),context);await until(()=>seen.length===2);assert.deepEqual(seen,[1,2]);w.unsubscribe();return {snapshotBeforeDelivery:true,seen};
});
await check('12-pi-resnapshot-drops-old-epoch-holds-post-cut',async()=>{
 const bus=new HarnessEventBus(),captured=latch(),finish=latch();let mark!:()=>void;
 const w=bus.watch({cut:0},()=>true,context,async(_c,boundary)=>{mark=boundary;captured.release();await finish.promise;return {cut:2};});
 const seen:number[]=[];w.start(e=>{seen.push((e as any).totals.tokens);});
 const res=w.resnapshot(context);await captured.promise;await bus.emit(evt(2),context);mark();await bus.emit(evt(3),context);assert.deepEqual(seen,[]);finish.release();assert.equal((await res).cut,2);await until(()=>seen.length===1);assert.deepEqual(seen,[3]);w.unsubscribe();return {representedBySnapshot:[2],postBoundary:[3],oldEpochSuppressed:true};
});
await check('12-pi-resnapshot-failure-is-not-lossless-replay',async()=>{
 const bus=new HarnessEventBus(),ready=latch(),fail=latch();const w=bus.watch({cut:0},()=>true,context,async()=>{ready.release();await fail.promise;throw Error('snapshot storage failed');});const seen:number[]=[];
 w.start(e=>{seen.push((e as any).totals.tokens);});const res=w.resnapshot(context);await ready.promise;await bus.emit(evt(1),context);fail.release();await assert.rejects(res,/snapshot storage failed/);await bus.emit(evt(2),context);await until(()=>seen.length===1);assert.deepEqual(seen,[2]);w.unsubscribe();return {snapshotRejected:true,preBoundaryEventNotReplayed:1,laterSeen:2,meaning:'caller must reopen snapshot, not continue as if gap-free'};
});
await check('12-pi-reducer-replaces-text-but-does-not-general-dedup',()=>{
 const s:any={lane:'main',tipId:null,transcript:[],stats:{messageCount:0},operation:{id:'op',kind:'run',runningTools:[]}};
 for(const text of ['A','AB','AB'])reduceLaneSnapshot(s,{type:'message_update',lane:'main',runId:'op',message:{role:'assistant',content:[{type:'text',text}]}} as any);
 assert.equal(s.operation.streamingMessage.content[0].text,'AB');
 const e:any={type:'entry_added',lane:'main',entry:{id:'e',type:'message',message:{role:'user'}}};reduceLaneSnapshot(s,e);reduceLaneSnapshot(s,e);assert.equal(s.transcript.length,2);
 assert.equal(reduceLaneSnapshot(s,{type:'navigation_end',lane:'main'} as any),'rebase');return {duplicateFullText:'AB',duplicateEntryCount:2,navigation:'rebase',meaning:'ordered watch contract required; reducer is not arbitrary network replay deduplicator'};
});
// This carrier only supplies physical-generation frames. The journal implementation is upstream code.
class Carrier{
 abort=new AbortController();queue:any[]=[];waiters:any[]=[];ended=false;signal=this.abort.signal;
 push(value:any,generation=1){const item={generation,value,signal:this.signal,accept(){}};const w=this.waiters.shift();if(w)w({value:item,done:false});else this.queue.push(item);}
 [Symbol.asyncIterator](){return this;}
 next(){if(this.queue.length)return Promise.resolve({value:this.queue.shift(),done:false});if(this.ended)return Promise.resolve({value:undefined,done:true});return new Promise<any>(r=>this.waiters.push(r));}
 restart(){}
 async dispose(){this.ended=true;this.abort.abort();for(const w of this.waiters.splice(0))w({done:true});}
}
class Journal extends RemoteJournalStream<any,any,number,any,any>{
 constructor(carrier:Carrier,readonly changes:any[],readonly errors:any[],readonly read:any){super({$stream:()=>carrier} as any,{name:'fixture journal',emptyCursor:-1,entries:p=>p.entries,hasMore:p=>!!p.hasMore,first:e=>e.seq,last:e=>e.seq,compare:(a,b)=>a-b,follows:(a,b)=>b===a+1,publish:c=>changes.push(c),failed:e=>errors.push(String(e))});}
 protected follow():any{throw Error('fixture carrier supplies already-decoded frames');}
 protected readPage(request:any,through:number,signal:AbortSignal){return this.read(request,through,signal);}
 protected repairRequest(initial:any){return {...initial,beforeSeq:undefined};}
}
const entries=(...seqs:number[])=>seqs.map(seq=>({seq,text:`v${seq}`}));
function setup(read:any=async()=>({entries:[]})){const carrier=new Carrier(),changes:any[]=[],errors:any[]=[];const journal=new Journal(carrier,changes,errors,read);return {carrier,changes,errors,journal};}
async function open(p:any,seqs:number[]){p.carrier.push({type:'opened',cursor:seqs.at(-1)??-1,page:{entries:entries(...seqs),hasMore:seqs[0]>0}});await p.journal.open({});}
await check('12-ds-journal-repairs-gap-while-new-events-arrive',async()=>{
 const pending=latch<any>(),called=latch();let requested=-1;const p=setup(async(_r,through)=>{requested=through;called.release();return pending.promise;});
 try{await open(p,[0,1]);p.carrier.push({type:'entry',entry:entries(3)[0]});await called.promise;p.carrier.push({type:'entry',entry:entries(5)[0]});p.carrier.push({type:'notification',notification:{kind:'progress'}});p.carrier.push({type:'entry',entry:entries(4)[0]});await tick();pending.release({entries:entries(0,1,2,3)});await until(()=>p.changes.length===3||p.errors.length>0);assert.deepEqual(p.errors,[]);assert.equal(requested,3);assert.deepEqual(p.changes[1].entries.map(e=>e.seq),[0,1,2,3,4,5]);assert.equal(p.changes[2].type,'notification');return {pageCut:3,mergedTail:5,queuedOutOfOrder:[5,4],notificationAfterRepair:true};}finally{await p.journal.dispose();}
});
await check('12-ds-journal-duplicate-is-skipped',async()=>{const p=setup();try{await open(p,[0]);for(const n of [1,1,0,2])p.carrier.push({type:'entry',entry:entries(n)[0]});await until(()=>p.changes.length===3);assert.deepEqual(p.changes.filter(c=>c.type==='append').map(c=>c.entry.seq),[1,2]);return {appended:[1,2]};}finally{await p.journal.dispose();}});
await check('12-ds-journal-rejects-regressing-opening',async()=>{const p=setup();try{await open(p,[0,1,2]);p.carrier.push({type:'opened',cursor:1,page:{entries:entries(0,1)}},2);await until(()=>p.errors.length===1);assert.match(p.errors[0],/behind/);assert.equal(p.changes.length,1);return {oldCursor:2,newCursor:1,rejected:true,oldViewRetained:true};}finally{await p.journal.dispose();}});
await check('12-ds-journal-new-generation-wins-over-old-page',async()=>{
 const pending=latch<any>(),called=latch();const p=setup(async()=>{called.release();return pending.promise;});
 try{await open(p,[0]);p.carrier.push({type:'entry',entry:entries(2)[0]});await called.promise;p.carrier.push({type:'opened',cursor:4,page:{entries:entries(0,1,2,3,4)}},2);await until(()=>p.changes.length===2);pending.release({entries:entries(0,1,2)});await tick();assert.equal(p.changes.length,2);assert.equal(p.changes[1].entries.at(-1).seq,4);return {stalePageTail:2,adoptedGenerationTail:4};}finally{pending.release({entries:entries(0,1,2)});await p.journal.dispose();}
});
await check('12-ds-older-page-during-live-append',async()=>{
 const pending=latch<any>();let through=-1;const p=setup(async(_r,t)=>{through=t;return pending.promise;});
 try{await open(p,[3,4]);const prep=p.journal.prepend({beforeSeq:3});p.carrier.push({type:'entry',entry:entries(5)[0]});await until(()=>p.changes.length===2);pending.release({entries:entries(1,2),hasMore:true});await prep;assert.equal(through,4);assert.deepEqual(p.changes.map(c=>c.type),['replace','append','prepend']);return {olderPageThrough:4,liveTail:5,olderEntries:[1,2]};}finally{pending.release({entries:entries(1,2)});await p.journal.dispose();}
});
await check('12-ds-expired-or-missing-page-does-not-silently-heal',async()=>{
 const p=setup(async()=>{throw Error('fixture: retained history unavailable');});try{await open(p,[0]);p.carrier.push({type:'entry',entry:entries(2)[0]});await until(()=>p.errors.length===1);assert.match(p.errors[0],/history unavailable/);assert.equal(p.changes.length,1);return {pageSourceIsFixture:true,failurePropagated:true,noFalseContinuousView:true};}finally{await p.journal.dispose();}
});
const start:any={type:'start',attemptId:'a',startedAfterSeq:0,turn:1,step:1,revision:1};
const durable:any={type:'event',event:{type:'assistant/message',seq:1,surfaceOp:'append',data:{turn:1,step:1}}};
const chunk:any={type:'chunk',attemptId:'a',index:0,revision:2,time:1,chunk:{type:'text-delta',index:0,text:'A'}};
const end:any={type:'end',attemptId:'a',index:1,revision:3,outcome:{kind:'committed',seq:1,eventType:'assistant/message'}};
await check('12-ds-assistant-missed-end-stages-until-new-baseline',()=>{
 const fold=new ClientAssistantStream();fold.replace([]);fold.acceptFrame(start);assert.equal(fold.acceptFrame(chunk)?.type,'transient');assert.equal(fold.acceptDurable(durable),undefined);
 // No end frame and no invented timeout: this module retains a staged settlement.
 const recovered=fold.replace([durable],{revision:3} as any);assert.deepEqual(recovered,[durable]);return {durableArrivalAloneNotPublished:true,missedEndNeedsAnotherRecoveryTrigger:true,baselineMakesResultVisible:true};
});
await check('12-ds-assistant-dense-index-and-settlement-identity',()=>{
 const f=new ClientAssistantStream();f.replace([]);f.acceptFrame(start);assert.equal(f.acceptFrame({...chunk,index:2})?.type,'rebaseline');
 f.replace([]);f.acceptFrame(start);f.acceptFrame(chunk);f.acceptDurable(durable);assert.equal(f.acceptFrame(end)?.type,'settlement');assert.equal(f.acceptFrame(end),undefined);
 const unknown=new ClientAssistantStream();unknown.replace([]);assert.equal(unknown.acceptFrame(chunk),undefined);assert.equal(unknown.acceptDurable(durable)?.type,'publish');return {knownIndexGap:'rebaseline',duplicateEndIgnored:true,unknownAttemptSuffixIgnored:true,durableWithoutKnownStart:'publish'};
});
await writeFile(new URL('../evidence/client-recovery-results.json',import.meta.url),JSON.stringify({date:'2026-09-14',scope:'Unmodified fixed-source Pi HarnessEventBus/reduceLaneSnapshot and DeepSeek RemoteJournalStream/ClientAssistantStream. Controlled generation carrier, page provider, synthetic event values and schedule gates. No full product, WebSocket, model or disk durability test.',outcomes},null,2)+'\n');
console.log(JSON.stringify({passed:outcomes.filter(x=>x.passed).length,total:outcomes.length,failures:outcomes.filter(x=>!x.passed)}));if(outcomes.some(x=>!x.passed))process.exitCode=1;
