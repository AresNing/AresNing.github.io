import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runAgentLoop } from '../research/repos/pi/packages/agent/src/agent-loop.ts';
import { Agent } from '../research/repos/pi/packages/agent/src/agent.ts';
import { EventStream } from '../research/repos/pi/packages/ai/src/utils/event-stream.ts';
import { parseStreamingJson } from '../research/repos/pi/packages/ai/src/utils/json-parse.ts';
import { truncateHead, truncateTail } from '../research/repos/pi/packages/agent/src/harness/utils/truncate.ts';

const output = resolve(import.meta.dirname, '../evidence');
await mkdir(output, { recursive: true });
const model = { id: 'scripted', name: 'scripted', api: 'openai-responses', provider: 'fixture', baseUrl: 'https://example.invalid', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 2048 };
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const msg = (content, stopReason = 'stop') => ({ role: 'assistant', content, stopReason, api: model.api, provider: 'fixture', model: 'scripted', usage, timestamp: 0 });
const call = (id, value = id) => ({ type: 'toolCall', id, name: 'probe', arguments: { value } });
const text = (value) => ({ type: 'text', text: value });
const result = (value) => ({ content: [text(value)], details: {} });
const user = (value) => ({ role: 'user', content: value, timestamp: 0 });
const traces = [];
const outcomes = [];
const gate = () => { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; };

function provider(responses, capture = []) {
  let index = 0;
  const streamFn = (_model, context, options) => {
    capture.push(JSON.parse(JSON.stringify(context)));
    const stream = new EventStream(e => e.type === 'done' || e.type === 'error', e => e.message ?? e.error);
    queueMicrotask(() => {
      const message = options?.signal?.aborted ? msg([], 'aborted') : responses[index++] ?? msg([text('finished')]);
      stream.push({ type: 'start', partial: { ...message, content: [] } });
      stream.push(message.stopReason === 'aborted' || message.stopReason === 'error'
        ? { type: 'error', reason: message.stopReason, error: message }
        : { type: 'done', reason: message.stopReason, message });
    });
    return stream;
  };
  return streamFn;
}

async function scenario(name, run) {
  const events = [];
  const emit = (event) => { events.push(structuredClone(event)); traces.push({ scenario: name, seq: events.length, source: 'pi-agent-core', raw: structuredClone(event) }); };
  try { const observation = await run(emit, events); outcomes.push({ name, passed: true, observation }); }
  catch (error) { outcomes.push({ name, passed: false, error: String(error.stack ?? error) }); }
}

async function loop(responses, emit, overrides = {}, toolExecute = async (_id, args) => result(args.value), signal, capture = []) {
  const context = { systemPrompt: 'Use only synthetic data', messages: [], tools: [{ name: 'probe', label: 'Probe', description: 'synthetic side effect', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false }, execute: toolExecute }] };
  return runAgentLoop([user('run fixture')], context, { model, convertToLlm: x => x, ...overrides }, emit, signal, provider(responses, capture));
}

await scenario('01-two-tool-batches', async (emit, events) => {
  let writes = 0;
  await loop([msg([call('a')], 'toolUse'), msg([call('b')], 'toolUse'), msg([text('done')])], emit, {}, async () => { writes++; return result('ok'); });
  assert.equal(events.filter(e => e.type === 'turn_end').length, 3);
  assert.equal(events.filter(e => e.type === 'agent_end').length, 1);
  assert.equal(writes, 2);
  return { modelTurns: 3, agentRuns: 1, writes };
});
await scenario('01-cancel-preflight', async emit => {
  const ctl = new AbortController(); let writes = 0;
  await loop([msg([call('a'), call('b')], 'toolUse')], emit, { beforeToolCall: () => { ctl.abort(); } }, async () => { writes++; return result('bad'); }, ctl.signal);
  assert.equal(writes, 0); return { writes };
});
await scenario('01-cancel-cooperative-tool', async emit => {
  const ctl = new AbortController(); let writes = 0;
  await loop([msg([call('a')], 'toolUse')], emit, {}, async (_id, _args, signal) => {
    ctl.abort(); signal.throwIfAborted(); writes++; return result('bad');
  }, ctl.signal);
  assert.equal(writes, 0); return { writes };
});
await scenario('01-cancel-ignoring-tool', async emit => {
  const ctl = new AbortController(); let writes = 0;
  await loop([msg([call('a')], 'toolUse')], emit, {}, async () => {
    ctl.abort(); await Promise.resolve(); writes++; return result('already committed');
  }, ctl.signal);
  assert.equal(writes, 1); return { writesAfterAbort: writes, meaning: 'AbortSignal requires tool cooperation' };
});
await scenario('02-truncated-arguments', async (emit, events) => {
  const parsed = parseStreamingJson('{"value":"partial'); let writes = 0;
  await loop([msg([{ ...call('a'), arguments: parsed }], 'length'), msg([text('done')])], emit, {}, async () => { writes++; return result('bad'); });
  assert.equal(writes, 0);
  assert.equal(events.find(e => e.type === 'tool_execution_end').isError, true);
  return { parsed, writes, meaning: 'parseable partial JSON was not executed' };
});
await scenario('02-stream-error', async (emit, events) => {
  let writes = 0;
  await loop([msg([call('a')], 'error')], emit, {}, async () => { writes++; return result('bad'); });
  assert.equal(writes, 0); assert.equal(events.at(-1).type, 'agent_end');
  return { writes, settled: true };
});
await scenario('03-context-transform', async emit => {
  const capture = []; let full = [];
  await loop([msg([call('a')], 'toolUse'), msg([text('done')])], emit, {
    transformContext: messages => { full = structuredClone(messages); return [user('KEEP: output JSON'), ...messages.slice(-1)]; },
  }, undefined, undefined, capture);
  assert.equal(capture.length, 2);
  assert.equal(capture[1].messages[0].content, 'KEEP: output JSON');
  assert.ok(full.length > capture[1].messages.length);
  return { providerMessages: capture[1].messages.length, originalMessages: full.length, constraintRetainedByExplicitTransform: true, modelSemanticRetention: 'not tested' };
});
await scenario('04-parallel-order', async (emit, events) => {
  const bDone = gate();
  await loop([msg([call('a'), call('b')], 'toolUse')], emit, {}, async id => {
    if (id === 'a') await bDone.promise; else bDone.release();
    return result(id);
  });
  const completion = events.filter(e => e.type === 'tool_execution_end').map(e => e.toolCallId);
  const history = events.filter(e => e.type === 'message_end' && e.message.role === 'toolResult').map(e => e.message.toolCallId);
  assert.deepEqual(completion, ['b', 'a']); assert.deepEqual(history, ['a', 'b']);
  return { completion, history };
});
await scenario('04-dependent-sequential', async emit => {
  let produced = false; let consumed = false;
  await loop([msg([call('produce'), call('consume')], 'toolUse')], emit, { toolExecution: 'sequential' }, async id => {
    if (id === 'produce') produced = true; else { assert.equal(produced, true); consumed = true; }
    return result(id);
  });
  assert.equal(consumed, true); return { consumedAfterProduce: true };
});
await scenario('04-output-truncation', async () => {
  const input = Array.from({ length: 3000 }, (_, i) => `${i}:合成输出`).join('\n');
  const head = truncateHead(input); const tail = truncateTail(input);
  assert.equal(head.truncated, true); assert.equal(tail.truncated, true);
  assert.ok(head.outputBytes <= head.maxBytes); assert.ok(tail.outputBytes <= tail.maxBytes);
  return { headLines: head.outputLines, tailLines: tail.outputLines, totalLines: head.totalLines, headBytes: head.outputBytes };
});
await scenario('05-denied-before-execute', async emit => {
  let writes = 0;
  await loop([msg([call('a')], 'toolUse')], emit, { beforeToolCall: () => ({ block: true, reason: 'fixture deny', terminate: true }) }, async () => { writes++; return result('bad'); });
  assert.equal(writes, 0); return { writes, boundary: 'application hook, not OS sandbox' };
});
await scenario('07-after-hook-failure', async (emit, events) => {
  let writes = 0;
  await loop([msg([call('a')], 'toolUse')], emit, { afterToolCall: () => { throw new Error('hook failed'); } }, async () => { writes++; return result('committed'); });
  assert.equal(writes, 1); assert.equal(events.find(e => e.type === 'tool_execution_end').isError, true);
  return { writes, presentedAsError: true, meaning: 'result transformation cannot undo effect' };
});
await scenario('09-agent-end-subscriber-barrier', async emit => {
  const entered = gate(); const release = gate(); let settled = false;
  const agent = new Agent({ initialState: { model }, streamFn: provider([msg([text('done')])]) });
  agent.subscribe(async event => { emit(event); if (event.type === 'agent_end') { entered.release(); await release.promise; } });
  const running = agent.prompt('fixture').then(() => { settled = true; });
  await entered.promise; assert.equal(settled, false); release.release(); await running;
  assert.equal(settled, true); return { settledBeforeSubscriber: false, settledAfterSubscriber: true };
});

await writeFile(resolve(output, 'pi-events.jsonl'), traces.map(x => JSON.stringify(x)).join('\n') + '\n');
await writeFile(resolve(output, 'pi-lab-results.json'), JSON.stringify({ sourceCommit: '71dca871bc80b6bc97be37f0ca3189399d651fff', runtime: process.version, model: 'scripted, no network', outcomes }, null, 2) + '\n');
console.log(JSON.stringify({ passed: outcomes.filter(x => x.passed).length, total: outcomes.length, failures: outcomes.filter(x => !x.passed) }, null, 2));
if (outcomes.some(x => !x.passed)) process.exitCode = 1;
