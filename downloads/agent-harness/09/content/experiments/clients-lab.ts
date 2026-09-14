import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {writeFile} from 'node:fs/promises';
import {JsonRpcLineTransport} from '../research/repos/deepseek/packages/sdk/protocol/src/transport.ts';
import {writeRawStdout,waitForRawStdoutBackpressure} from '../research/repos/pi/packages/coding-agent/src/core/output-guard.ts';
const outcomes=[];
const latch=()=>{let release;const promise=new Promise<void>(r=>release=r);return {promise,release};};
const tick=()=>new Promise(r=>setImmediate(r));
async function check(name,fn){try{outcomes.push({name,passed:true,observation:await fn()});}catch(e){outcomes.push({name,passed:false,error:String(e)});}}
function pair(){const a=new PassThrough(),b=new PassThrough();const client=new JsonRpcLineTransport(b,a),server=new JsonRpcLineTransport(a,b);client.start();server.start();return {a,b,client,server,close(){client.close();server.close();a.destroy();b.destroy();}};}
await check('09-ds-responses-correlate-despite-concurrent-handlers',async()=>{
 const p=pair(),release=latch(),events=[];
 p.client.onNotification(m=>events.push(m));p.server.onRequest(async m=>{if(m==='slow')await release.promise;p.server.notify(m+'.event');return m;});
 try{const slow=p.client.request('slow',{});assert.equal(await p.client.request('fast',{}),'fast');assert.deepEqual(events,['fast.event']);release.release();assert.equal(await slow,'slow');return {fastResponseBeforeSlow:true,notificationsInterleaved:true,requestIdsPreserveCorrelation:true};}finally{release.release();p.close();}
});
await check('09-ds-abandonment-does-not-cancel-server',async()=>{
 const p=pair(),release=latch(),done=latch(),abort=new AbortController();let effect=0;
 p.server.onRequest(async()=>{await release.promise;effect++;done.release();return 'late';});
 try{const result=p.client.request('work',{},abort.signal);abort.abort(Error('fixture timeout'));await assert.rejects(result,/fixture timeout/);assert.equal(effect,0);release.release();await done.promise;await tick();assert.equal(effect,1);return {clientRejectedBeforeSideEffect:true,serverEffectStillOccurred:true,lateResponseIgnored:true};}finally{release.release();p.close();}
});
await check('09-ds-close-detaches-without-destroying-owned-streams',async()=>{
 const p=pair(),release=latch(),done=latch();let effect=0;
 p.server.onRequest(async()=>{await release.promise;effect++;done.release();return 'done';});
 try{const result=p.client.request('work',{});p.client.close();await assert.rejects(result,/transport closed/);assert.equal(p.a.destroyed,false);assert.equal(p.b.destroyed,false);release.release();await done.promise;await tick();assert.equal(effect,1);return {streamsRemainOpen:true,pendingRequestRejected:true,inflightPeerHandlerContinues:true};}finally{release.release();p.close();}
});
await check('09-pi-backpressure-follows-growing-write-tail',async()=>{
 const original=process.stdout.write,callbacks=[],writes=[];let settled=false;
 process.stdout.write=((text,callback)=>{writes.push(text);callbacks.push(callback);return false;}) as any;
 try{writeRawStdout('A');const waiting=waitForRawStdoutBackpressure().then(()=>{settled=true;});await tick();writeRawStdout('B');assert.deepEqual(writes,['A']);callbacks.shift()();await tick();assert.deepEqual(writes,['A','B']);assert.equal(settled,false);callbacks.shift()();await waiting;return {writesSerialized:true,waitIncludesLaterB:true,writeFalseAloneDoesNotReleaseWait:true};}finally{process.stdout.write=original;}
});
await check('09-pi-transient-buffer-error-retries-same-chunk',async()=>{
 const original=process.stdout.write,seen=[];let attempts=0;
 process.stdout.write=((text,callback)=>{seen.push(text);attempts++;queueMicrotask(()=>callback(attempts===1?Object.assign(Error('busy'),{code:'EAGAIN'}):undefined));return false;}) as any;
 try{writeRawStdout('frame');await waitForRawStdoutBackpressure();assert.deepEqual(seen,['frame','frame']);return {sameChunkRetried:true,attempts:2};}finally{process.stdout.write=original;}
});
await writeFile(new URL('../evidence/clients-results.json',import.meta.url),JSON.stringify({scope:'Unmodified DeepSeek JsonRpcLineTransport on paired in-memory byte streams, and unmodified Pi output-guard with fixture stdout callbacks. No product server, runtime client subprocess, network reconnect or actual terminal. Server side effects are counters.',outcomes},null,2)+'\n');
console.log(JSON.stringify({passed:outcomes.filter(x=>x.passed).length,total:outcomes.length,failures:outcomes.filter(x=>!x.passed)}));if(outcomes.some(x=>!x.passed))process.exitCode=1;
