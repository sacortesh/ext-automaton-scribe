// tests/exporter.test.js — Unit tests for Markdown exporter
// Run with: node extension/tests/exporter.test.js

const assert = require('assert');

// Provide injectWaitSteps globally (exporter checks typeof in browser context)
const { injectWaitSteps } = require('../lib/waits.js');
global.injectWaitSteps = injectWaitSteps;

const { exportToMarkdown, buildElementsDictionary, toAlias, formatStep } = require('../lib/exporter.js');

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

// --- toAlias ---
console.log('\ntoAlias:');

test('converts label to kebab-case', () => {
  assert.strictEqual(toAlias('Submit Button'), 'submit-button');
});

test('strips special characters', () => {
  assert.strictEqual(toAlias('Click "here"!'), 'click-here');
});

test('truncates to 30 chars', () => {
  const long = 'a very long label that exceeds thirty characters easily';
  assert.ok(toAlias(long).length <= 30);
});

test('handles empty string', () => {
  assert.strictEqual(toAlias(''), '');
});

// --- buildElementsDictionary ---
console.log('\nbuildElementsDictionary:');

test('deduplicates elements by selector', () => {
  const steps = [
    { type: 'click', selector: '#btn', label: 'Submit', confidence: 'high' },
    { type: 'click', selector: '#btn', label: 'Submit', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.size, 1);
});

test('creates unique aliases for different elements', () => {
  const steps = [
    { type: 'click', selector: '#btn1', label: 'Submit', confidence: 'high' },
    { type: 'click', selector: '#btn2', label: 'Submit', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  const aliases = Array.from(elements.values()).map(e => e.alias);
  assert.strictEqual(aliases[0], 'submit');
  assert.strictEqual(aliases[1], 'submit-1');
});

test('skips wait and scroll steps', () => {
  const steps = [
    { type: 'wait', label: 'Wait ~2s' },
    { type: 'scroll', scrollY: 400 },
    { type: 'click', selector: '#btn', label: 'OK', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.size, 1);
});

test('tracks shadow DOM flag', () => {
  const steps = [
    { type: 'click', selector: 'my-comp >> button', label: 'Inner', confidence: 'medium', shadowDom: true },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.get('my-comp >> button').shadowDom, true);
});

// --- formatStep ---
console.log('\nformatStep:');

test('formats click step with alias', () => {
  const elements = new Map([['#btn', { alias: 'submit-btn' }]]);
  const step = { type: 'click', selector: '#btn', label: 'Submit' };
  assert.strictEqual(formatStep(step, elements), 'Click on `submit-btn`');
});

test('formats click step without alias', () => {
  const elements = new Map();
  const step = { type: 'click', selector: '#btn', label: 'Submit' };
  assert.strictEqual(formatStep(step, elements), 'Click on `Submit`');
});

test('formats input step', () => {
  const elements = new Map([['#email', { alias: 'input-email' }]]);
  const step = { type: 'input', selector: '#email', label: 'Email', value: 'user@test.com' };
  assert.strictEqual(formatStep(step, elements), 'Type `"user@test.com"` in `input-email`');
});

test('formats scroll step with landmark', () => {
  const step = { type: 'scroll', scrollY: 400, landmarkLabel: '#footer' };
  assert.strictEqual(formatStep(step, new Map()), 'Scroll to #footer');
});

test('formats scroll step without landmark', () => {
  const step = { type: 'scroll', scrollY: 400, landmarkLabel: null };
  assert.strictEqual(formatStep(step, new Map()), 'Scroll down (~400px)');
});

test('formats keypress step', () => {
  const step = { type: 'keypress', key: 'Enter' };
  assert.strictEqual(formatStep(step, new Map()), 'Press `Enter`');
});

test('formats wait step', () => {
  const step = { type: 'wait', label: 'Wait ~2s', warn: false };
  assert.strictEqual(formatStep(step, new Map()), 'Wait ~2s');
});

test('formats wait step with warning (emoji in label)', () => {
  const step = { type: 'wait', label: 'Wait ~15s \u26A0\uFE0F (unusually long — possible service call or manual pause)', warn: true };
  assert.ok(formatStep(step, new Map()).includes('\u26A0'));
  // Should not duplicate the warning emoji
  const result = formatStep(step, new Map());
  const emojiCount = (result.match(/\u26A0/g) || []).length;
  assert.strictEqual(emojiCount, 1);
});

test('formats verify step with text', () => {
  const elements = new Map([['#btn', { alias: 'submit-btn' }]]);
  const step = { type: 'verify', selector: '#btn', textContent: 'Continue', value: null };
  assert.strictEqual(formatStep(step, elements), 'Assert `submit-btn` exists with text: `"Continue"`');
});

test('formats verify step with value', () => {
  const elements = new Map();
  const step = { type: 'verify', selector: '#input', textContent: '', value: 'hello' };
  assert.strictEqual(formatStep(step, elements), 'Assert `#input` exists with value: `"hello"`');
});

test('formats navigate step', () => {
  const step = { type: 'navigate', url: 'https://example.com/page' };
  assert.strictEqual(formatStep(step, new Map()), 'Navigate to `https://example.com/page`');
});

// --- exportToMarkdown ---
console.log('\nexportToMarkdown:');

test('produces valid markdown with header', () => {
  const session = {
    name: 'Login Test',
    intention: 'Verify login flow works',
    steps: [],
    recordedAt: '2025-01-15 10:00:00',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('# Test: Login Test'));
  assert.ok(md.includes('**Intention:** Verify login flow works'));
  assert.ok(md.includes('**Recorded:** 2025-01-15 10:00:00'));
});

test('includes elements dictionary', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'Submit', confidence: 'high', timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('## Elements'));
  assert.ok(md.includes('| Alias |'));
  assert.ok(md.includes('`submit`'));
});

test('includes steps list', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'Submit', confidence: 'high', timestamp: 1000 },
      { type: 'keypress', key: 'Enter', timestamp: 1200 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('## Steps'));
  assert.ok(md.includes('Click on `submit`'));
  assert.ok(md.includes('Press `Enter`'));
});

test('injects wait steps between events with time gaps', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'Submit', confidence: 'high', timestamp: 1000 },
      { type: 'click', selector: '#btn2', label: 'Next', confidence: 'high', timestamp: 4000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('Wait ~3s'));
});

test('flags low confidence selectors in elements table', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: 'div > span:nth-of-type(2)', label: 'Some text', confidence: 'low', timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('low \u26A0\uFE0F'));
});

test('includes shadow DOM note when applicable', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: 'my-comp >> button', label: 'Inner', confidence: 'medium', shadowDom: true, timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('shadow DOM pierce boundary'));
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
