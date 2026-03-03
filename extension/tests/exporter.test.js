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

// --- toAlias: step object input ---
console.log('\ntoAlias (step objects):');

test('ID qualifier: tag#id', () => {
  const step = { tagName: 'span', selector: '#type-to-search', label: 'Type to search' };
  assert.strictEqual(toAlias(step), 'span#type-to-search');
});

test('data-testid qualifier: tag.value', () => {
  const step = { tagName: 'button', selector: '[data-testid="submit"]', label: 'Submit' };
  assert.strictEqual(toAlias(step), 'button.submit');
});

test('data-cy qualifier: tag.value', () => {
  const step = { tagName: 'input', selector: '[data-cy="email-input"]', label: 'Email' };
  assert.strictEqual(toAlias(step), 'input.email-input');
});

test('data-tag-name qualifier: tag.value', () => {
  const step = { tagName: 'div', selector: '[data-tag-name="user-card"]', label: 'User Card' };
  assert.strictEqual(toAlias(step), 'div.user-card');
});

test('class qualifier: tag.class', () => {
  const step = { tagName: 'input', selector: '.email-field', label: 'Email' };
  assert.strictEqual(toAlias(step), 'input.email-field');
});

test('no qualifier: tag-label', () => {
  const step = { tagName: 'div', selector: 'div > span:nth-child(2)', label: 'Hello' };
  assert.strictEqual(toAlias(step), 'div-hello');
});

test('truncates to 40 chars', () => {
  const step = { tagName: 'button', selector: '#a-very-long-identifier-that-goes-on-and-on', label: 'Click me' };
  assert.ok(toAlias(step).length <= 40);
});

test('handles missing tagName gracefully', () => {
  const step = { selector: '#btn', label: 'Submit' };
  // No tag, but has ID qualifier — should still produce something
  const alias = toAlias(step);
  assert.ok(alias.length > 0);
});

test('handles missing selector — falls back to tag-label', () => {
  const step = { tagName: 'button', label: 'Continue' };
  assert.strictEqual(toAlias(step), 'button-continue');
});

test('handles empty step — returns fallback', () => {
  const step = {};
  assert.strictEqual(toAlias(step), 'element');
});

test('legacy string input still works', () => {
  assert.strictEqual(toAlias('Submit Button'), 'submit-button');
});

test('legacy string: strips special characters', () => {
  assert.strictEqual(toAlias('Click "here"!'), 'click-here');
});

test('legacy string: handles empty string', () => {
  assert.strictEqual(toAlias(''), '');
});

// --- buildElementsDictionary ---
console.log('\nbuildElementsDictionary:');

test('deduplicates elements by selector', () => {
  const steps = [
    { type: 'click', selector: '#btn', label: 'Submit', tagName: 'button', confidence: 'high' },
    { type: 'click', selector: '#btn', label: 'Submit', tagName: 'button', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.size, 1);
});

test('produces tag-qualified aliases', () => {
  const steps = [
    { type: 'click', selector: '#btn', label: 'Submit', tagName: 'button', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.get('#btn').alias, 'button#btn');
});

test('creates unique aliases for different elements with same tag+qualifier pattern', () => {
  const steps = [
    { type: 'click', selector: '.submit', label: 'Submit', tagName: 'button', confidence: 'high' },
    { type: 'click', selector: 'form .submit', label: 'Submit', tagName: 'button', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  const aliases = Array.from(elements.values()).map(e => e.alias);
  assert.strictEqual(aliases[0], 'button.submit');
  assert.strictEqual(aliases[1], 'button.submit-1');
});

test('skips wait and scroll steps', () => {
  const steps = [
    { type: 'wait', label: 'Wait ~2s' },
    { type: 'scroll', scrollY: 400 },
    { type: 'click', selector: '#btn', label: 'OK', tagName: 'button', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.size, 1);
});

test('tracks shadow DOM flag', () => {
  const steps = [
    { type: 'click', selector: 'my-comp >> button', label: 'Inner', tagName: 'button', confidence: 'medium', shadowDom: true },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.get('my-comp >> button').shadowDom, true);
});

test('different selectors get different aliases', () => {
  const steps = [
    { type: 'click', selector: '#btn-ok', label: 'OK', tagName: 'button', confidence: 'high' },
    { type: 'click', selector: '#btn-cancel', label: 'Cancel', tagName: 'button', confidence: 'high' },
  ];
  const elements = buildElementsDictionary(steps);
  assert.strictEqual(elements.get('#btn-ok').alias, 'button#btn-ok');
  assert.strictEqual(elements.get('#btn-cancel').alias, 'button#btn-cancel');
});

// --- formatStep ---
console.log('\nformatStep:');

test('formats click step with alias', () => {
  const elements = new Map([['#btn', { alias: 'button#btn' }]]);
  const step = { type: 'click', selector: '#btn', label: 'Submit' };
  assert.strictEqual(formatStep(step, elements), 'Click on `button#btn`');
});

test('formats click step without alias', () => {
  const elements = new Map();
  const step = { type: 'click', selector: '#btn', label: 'Submit' };
  assert.strictEqual(formatStep(step, elements), 'Click on `Submit`');
});

test('formats input step', () => {
  const elements = new Map([['#email', { alias: 'input#email' }]]);
  const step = { type: 'input', selector: '#email', label: 'Email', value: 'user@test.com' };
  assert.strictEqual(formatStep(step, elements), 'Type `"user@test.com"` in `input#email`');
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
  const elements = new Map([['#btn', { alias: 'button#btn' }]]);
  const step = { type: 'verify', selector: '#btn', textContent: 'Continue', value: null };
  assert.strictEqual(formatStep(step, elements), 'Assert `button#btn` exists with text: `"Continue"`');
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

test('escapes newlines and pipes in description', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: "Line1\nLine2", tagName: 'button', confidence: 'high', timestamp: 1000 },
      { type: 'click', selector: '#col', label: "Has | pipe", tagName: 'span', confidence: 'high', timestamp: 2000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  // Each table row should be a single line — no raw newlines inside cells
  const tableLines = md.split('\n').filter(l => l.startsWith('| `'));
  for (const line of tableLines) {
    assert.ok(!line.includes('\n'), 'Table row should not contain raw newline');
  }
  assert.ok(md.includes('Line1 Line2'), 'Newline should be replaced with space');
  assert.ok(md.includes('\\|'), 'Pipe should be escaped');
});

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

test('includes elements dictionary with tag-qualified alias', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'Submit', tagName: 'button', confidence: 'high', timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('## Elements'));
  assert.ok(md.includes('| Alias |'));
  assert.ok(md.includes('`button#btn`'));
});

test('steps reference tag-qualified aliases', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'Submit', tagName: 'button', confidence: 'high', timestamp: 1000 },
      { type: 'keypress', key: 'Enter', timestamp: 1200 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('## Steps'));
  assert.ok(md.includes('Click on `button#btn`'));
  assert.ok(md.includes('Press `Enter`'));
});

test('injects wait steps between events with time gaps', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'Submit', tagName: 'button', confidence: 'high', timestamp: 1000 },
      { type: 'click', selector: '#btn2', label: 'Next', tagName: 'button', confidence: 'high', timestamp: 4000 },
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
      { type: 'click', selector: 'div > span:nth-of-type(2)', label: 'Some text', tagName: 'span', confidence: 'low', timestamp: 1000 },
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
      { type: 'click', selector: 'my-comp >> button', label: 'Inner', tagName: 'button', confidence: 'medium', shadowDom: true, timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('shadow DOM pierce boundary'));
});

test('data-testid alias appears in export steps', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '[data-testid="login-btn"]', label: 'Login', tagName: 'button', confidence: 'high', timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('`button.login-btn`'));
});

test('class-based alias appears in export steps', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'input', selector: '.email-field', label: 'Email', tagName: 'input', value: 'a@b.com', confidence: 'high', timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('`input.email-field`'));
});

// --- iframe support ---
console.log('\niframe support:');

test('toAlias: iframe step gets prefixed alias', () => {
  const step = { tagName: 'button', selector: '#submit', label: 'Submit', isIframe: true, frameId: 3 };
  assert.strictEqual(toAlias(step), 'iframe3-button#submit');
});

test('toAlias: main frame step has no prefix', () => {
  const step = { tagName: 'button', selector: '#submit', label: 'Submit', isIframe: false, frameId: 0 };
  assert.strictEqual(toAlias(step), 'button#submit');
});

test('toAlias: missing isIframe treated as main frame', () => {
  const step = { tagName: 'button', selector: '#submit', label: 'Submit' };
  assert.strictEqual(toAlias(step), 'button#submit');
});

test('elements table includes Frame column when iframes present', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'OK', tagName: 'button', confidence: 'high', timestamp: 1000, isIframe: false, frameId: 0 },
      { type: 'click', selector: '#inner-btn', label: 'Inner', tagName: 'button', confidence: 'high', timestamp: 2000, isIframe: true, frameId: 5 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('| Frame |'), 'Should have Frame column header');
  assert.ok(md.includes('main |'), 'Main frame element should show "main"');
  assert.ok(md.includes('iframe-5 |'), 'Iframe element should show "iframe-5"');
});

test('elements table omits Frame column when no iframes', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'OK', tagName: 'button', confidence: 'high', timestamp: 1000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(!md.includes('| Frame |'), 'Should NOT have Frame column header');
});

test('steps include frame switch comments', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'OK', tagName: 'button', confidence: 'high', timestamp: 1000, isIframe: false, frameId: 0 },
      { type: 'click', selector: '#inner-btn', label: 'Inner', tagName: 'button', confidence: 'high', timestamp: 2000, isIframe: true, frameId: 5 },
      { type: 'click', selector: '#btn', label: 'OK', tagName: 'button', confidence: 'high', timestamp: 3000, isIframe: false, frameId: 0 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('<!-- Switch to iframe-5 -->'), 'Should have switch-to-iframe comment');
  assert.ok(md.includes('<!-- Switch to main -->'), 'Should have switch-to-main comment');
});

test('no frame switch comments when all steps in main frame', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#btn', label: 'OK', tagName: 'button', confidence: 'high', timestamp: 1000 },
      { type: 'click', selector: '#btn2', label: 'Next', tagName: 'button', confidence: 'high', timestamp: 2000 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(!md.includes('<!-- Switch'), 'Should NOT have any switch comments');
});

test('iframe alias appears in exported steps', () => {
  const session = {
    name: 'Test',
    intention: 'Test',
    steps: [
      { type: 'click', selector: '#inner-btn', label: 'Inner', tagName: 'button', confidence: 'high', timestamp: 1000, isIframe: true, frameId: 2 },
    ],
    recordedAt: 'now',
  };
  const md = exportToMarkdown(session);
  assert.ok(md.includes('`iframe2-button#inner-btn`'), 'Alias should have iframe prefix');
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
