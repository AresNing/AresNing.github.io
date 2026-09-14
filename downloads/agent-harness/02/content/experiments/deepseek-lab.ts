import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Context, Service } from '../research/repos/deepseek/vendor/cordis/src/index.ts';
import { compactCheckpointSource, isCompactCheckpointSource } from '../research/repos/deepseek/packages/compaction/compaction/src/checkpoint.ts';
import { defineSessionFormatMigration } from '../research/repos/deepseek/packages/session/session-format/src/chain.ts';
const outcomes = [];
async function check(name, run) {
  try { outcomes.push({ name, passed: true, observation: await run() }); }
  catch (error) { outcomes.push({ name, passed: false, error: String(error.stack ?? error) }); }
}
await check('07-cordis-unload', async () => {
  const root = new Context(); let calls = 0; let cleaned = 0;
  const fiber = root.plugin(ctx => {
    ctx.on('probe', () => { calls++; });
    ctx.effect(() => () => { cleaned++; });
  });
  await fiber;
  root.emit('probe'); assert.equal(calls, 1);
  await fiber.dispose(); root.emit('probe');
  assert.equal(calls, 1); assert.equal(cleaned, 1);
  await root.fiber.dispose(); return { callsAfterUnload: calls, cleaned };
});
await check('07-cordis-missing-dependency', async () => {
  const root = new Context(); let started = 0;
  const consumer = root.plugin(Object.assign(() => { started++; }, { inject: ['fixtureCounter'] }));
  await Promise.resolve(); assert.equal(started, 0);
  class Counter extends Service { constructor(ctx) { super(ctx, 'fixtureCounter'); } }
  const dependency = root.plugin(Counter); await dependency; await consumer;
  assert.equal(started, 1); await root.fiber.dispose();
  return { beforeDependency: 0, afterDependency: started };
});
await check('03-checkpoint-provenance', async () => {
  const source = compactCheckpointSource('fixture-compaction', 'fixture-command');
  assert.ok(Object.isFrozen(source)); assert.ok(isCompactCheckpointSource(source));
  assert.equal(isCompactCheckpointSource({ kind: 'plugin', plugin: 'unrelated' }), false);
  return { source, frozen: true, summaryQuality: 'not tested' };
});
await check('06-reject-nonadjacent-migration', async () => {
  assert.throws(() => defineSessionFormatMigration({ name: 'skip', fromVersion: 0, toVersion: 2 }), /adjacent/);
  return { nonAdjacentMigrationRejected: true };
});
await writeFile(resolve(import.meta.dirname, '../evidence/deepseek-lab-results.json'), JSON.stringify({ sourceCommit: 'c291e7961a515f6d7af9304e7fd1d257929aef26', runtime: process.version, scope: 'vendored Cordis and pure session/compaction modules, not full dsh', outcomes }, null, 2) + '\n');
console.log(JSON.stringify({ passed: outcomes.filter(x => x.passed).length, total: outcomes.length, failures: outcomes.filter(x => !x.passed) }, null, 2));
if (outcomes.some(x => !x.passed)) process.exitCode = 1;
