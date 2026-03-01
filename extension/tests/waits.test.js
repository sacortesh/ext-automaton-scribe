// tests/waits.test.js — Unit tests for wait bucketing
// Run with: node extension/tests/waits.test.js

const assert = require('assert');
const { bucketWait, injectWaitSteps, WAIT_THRESHOLDS } = require('../lib/waits.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
  }
}

console.log('\nbucketWait:');

test('returns null for deltas below 500ms', () => {
  assert.strictEqual(bucketWait(0), null);
  assert.strictEqual(bucketWait(100), null);
  assert.strictEqual(bucketWait(499), null);
});

test('returns ~1s for 500-1499ms', () => {
  const result = bucketWait(500);
  assert.strictEqual(result.seconds, 1);
  assert.strictEqual(result.warn, false);
  assert.ok(result.label.includes('~1s'));
});

test('returns ~2s for 1500-2499ms', () => {
  const result = bucketWait(1500);
  assert.strictEqual(result.seconds, 2);
  assert.strictEqual(result.warn, false);
});

test('returns ~3s for 2500-3499ms', () => {
  const result = bucketWait(3000);
  assert.strictEqual(result.seconds, 3);
});

test('returns warning for deltas > 10000ms', () => {
  const result = bucketWait(15000);
  assert.strictEqual(result.warn, true);
  assert.strictEqual(result.seconds, 15);
  assert.ok(result.label.includes('unusually long'));
});

test('rounds to nearest second', () => {
  const result = bucketWait(7400);
  assert.strictEqual(result.seconds, 7);
});

console.log('\ninjectWaitSteps:');

test('returns empty for empty input', () => {
  assert.deepStrictEqual(injectWaitSteps([]), []);
});

test('does not inject waits for fast consecutive events', () => {
  const events = [
    { type: 'click', timestamp: 1000 },
    { type: 'click', timestamp: 1200 },
  ];
  const result = injectWaitSteps(events);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].type, 'click');
  assert.strictEqual(result[1].type, 'click');
});

test('injects wait step for slow gaps', () => {
  const events = [
    { type: 'click', timestamp: 1000 },
    { type: 'click', timestamp: 4000 },
  ];
  const result = injectWaitSteps(events);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].type, 'click');
  assert.strictEqual(result[1].type, 'wait');
  assert.strictEqual(result[1].seconds, 3);
  assert.strictEqual(result[2].type, 'click');
});

test('injects multiple wait steps in a sequence', () => {
  const events = [
    { type: 'click', timestamp: 0 },
    { type: 'input', timestamp: 2000 },
    { type: 'click', timestamp: 5000 },
  ];
  const result = injectWaitSteps(events);
  assert.strictEqual(result.length, 5);
  assert.strictEqual(result[1].type, 'wait');
  assert.strictEqual(result[3].type, 'wait');
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
