import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Context, Service } from '../research/repos/deepseek/vendor/cordis/src/index.ts';
import { BACKGROUND_CONTEXT } from '../research/repos/pi/packages/agent/src/harness/context.ts';
import { HookRegistry } from '../research/repos/pi/packages/agent/src/harness/hooks.ts';
const outcomes=[];
const latch=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release};};
async function check(name,fn){let timer;try{const observation=await Promise.race([fn(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('scenario deadline exceeded')),5000))]);outcomes.push({name,passed:true,observation});}catch(e){outcomes.push({name,passed:false,error:String(e.stack??e)});}finally{clearTimeout(timer);}}
const event={lane:'fixture',runId:'run',toolCallId:'call',toolName:'probe',args:{n:1},content:[{type:'text',text:'original'}],details:{},isError:false};
const gate={signal:new AbortController().signal,admit:fn=>fn()};
await check('07-pi-durable-rewrite-is-waterfall',async()=>{
 const seen=[];const r=new HookRegistry(()=>{});
 r.on('before_tool',e=>{seen.push(e.args.n);return {args:{n:e.args.n+1}};});
 r.on('before_tool',e=>{seen.push(e.args.n);return {args:{n:e.args.n*10}};});
 const res=await r.runToolWithGate('before_tool',event,gate,BACKGROUND_CONTEXT);
 assert.deepEqual(seen,[1,2]);assert.equal(res.args.n,20);return {observedArgs:seen,finalValue:20};
});
await check('07-pi-pre-failure-blocks-post-failure-preserves',async()=>{
 const errors=[];const r=new HookRegistry((e,n)=>errors.push(n));let afterPre=0;
 r.on('before_tool',()=>{throw Error('pre-failure');});r.on('before_tool',()=>{afterPre++;});
 const pre=await r.runToolWithGate('before_tool',event,gate,BACKGROUND_CONTEXT);assert.equal(pre.block.reason,'pre-failure');assert.equal(afterPre,0);
 r.on('after_tool',()=>({details:{saved:true}}));r.on('after_tool',()=>{throw Error('post-failure');});r.on('after_tool',e=>{assert.deepEqual(e.details,{saved:true});return {content:[{type:'text',text:'kept'}]};});
 const post=await r.runToolWithGate('after_tool',event,gate,BACKGROUND_CONTEXT);assert.deepEqual(post.details,{saved:true});assert.equal(post.content[0].text,'kept');assert.equal(post.isError,undefined);assert.deepEqual(errors,['before_tool','after_tool']);
 return {beforeBlocked:true,laterBeforeRan:false,earlierPostPatchPreserved:true,laterPostRan:true,errorFlagNotOverwritten:true};
});
await check('07-pi-removal-does-not-change-admitted-snapshot',async()=>{
 const entered=latch(),release=latch();const calls=[];let first=true;const r=new HookRegistry(()=>{});
 r.on('before_tool',async()=>{if(first){first=false;entered.release();await release.promise;}});
 const off=r.on('before_tool',()=>{calls.push('B');});
 const running=r.runToolWithGate('before_tool',event,gate,BACKGROUND_CONTEXT);await entered.promise;off();release.release();await running;
 assert.deepEqual(calls,['B']);await r.runToolWithGate('before_tool',event,gate,BACKGROUND_CONTEXT);assert.deepEqual(calls,['B']);
 return {removedHandlerRunsInCurrentSnapshot:1,removedHandlerRunsInNextAggregate:0};
});
await check('07-cordis-unload-waits-late-setup-cleanup',async()=>{
 const root=new Context(),setup=latch(),cleanup=latch(),entered=latch();let stopped=false,cleaned=0;
 const fiber=root.plugin(ctx=>{ctx.effect(async()=>{await setup.promise;return async()=>{entered.release();await cleanup.promise;cleaned++;};});});
 await fiber;const stopping=fiber.dispose().then(()=>stopped=true);await Promise.resolve();assert.equal(stopped,false);
 setup.release();await entered.promise;assert.equal(stopped,false);cleanup.release();await stopping;assert.equal(cleaned,1);await root.fiber.dispose();
 return {waitsForLateSetup:true,waitsForCleanup:true,cleaned:1};
});
await check('07-cordis-reverse-order-within-effect',async()=>{
 const root=new Context(),release=latch(),entered=latch();const order=[];
 const dispose=root.effect(function*(){yield ()=>{order.push('A');};yield async()=>{order.push('B:start');entered.release();await release.promise;order.push('B:end');};});
 const running=dispose();await entered.promise;assert.deepEqual(order,['B:start']);release.release();await running;assert.deepEqual(order,['B:start','B:end','A']);await dispose();assert.equal(order.length,3);await root.fiber.dispose();return {order,doubleDisposeNoOp:true};
});
await check('07-cordis-owner-unloads-independent-effects-concurrently',async()=>{
 const root=new Context(),release=latch(),both=latch();const starts=[];
 const fiber=root.plugin(ctx=>{for(const id of ['A','B'])ctx.effect(()=>async()=>{starts.push(id);if(starts.length===2)both.release();await release.promise;});});await fiber;
 let settled=false;const running=fiber.dispose().then(()=>settled=true);await both.promise;assert.equal(settled,false);release.release();await running;assert.equal(starts.length,2);await root.fiber.dispose();return {cleanupStartsBeforeRelease:starts,ownerWaitsForBoth:true};
});
await check('07-cordis-dependency-replacement-restarts-consumer',async()=>{
 const root=new Context();let started=0,cleaned=0;
 const consumer=root.plugin(Object.assign(ctx=>{started++;ctx.effect(()=>()=>{cleaned++;});},{inject:['fixtureService']}));
 class Fixture extends Service{constructor(ctx){super(ctx,'fixtureService');}}
 const first=root.plugin(Fixture);await first;await consumer;assert.equal(started,1);
 await first.dispose();await consumer;assert.equal(cleaned,1);
 const second=root.plugin(Fixture);await second;await consumer;assert.equal(started,2);await root.fiber.dispose();assert.equal(cleaned,2);
 return {consumerStarts:started,consumerCleanups:cleaned};
});
await check('07-cordis-cleanup-failure-can-stop-one-effect-chain',async()=>{
 const root=new Context();const order=[];
 const dispose=root.effect(function*(){yield ()=>{order.push('A');};yield ()=>{order.push('B');throw Error('cleanup failure');};});
 await assert.rejects(async()=>{await dispose();},/cleanup failure/);assert.deepEqual(order,['B']);await root.fiber.dispose();
 return {attemptedCleanup:order,earlierCleanupNotAttempted:true};
});
const report={scope:'Unmodified Pi durable HookRegistry and vendored Cordis. Hook callbacks, effect setup/cleanup and dependency services are controlled fixtures; gate only admits callbacks with an AbortSignal. No full Harness cancellation, plugin profile reload, OS process or telemetry exporter is tested.',outcomes};
await writeFile(resolve(import.meta.dirname,'../evidence/extensions-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:outcomes.filter(x=>x.passed).length,total:outcomes.length,failures:outcomes.filter(x=>!x.passed)}));if(outcomes.some(x=>!x.passed))process.exitCode=1;
