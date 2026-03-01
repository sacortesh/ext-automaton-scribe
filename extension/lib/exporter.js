// lib/exporter.js — Markdown formatter

/**
 * Generate a kebab-case alias from a label string.
 */
function toAlias(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 30);
}

/**
 * Build the elements dictionary from steps, deduplicating by selector.
 * Returns { elements: Map<selector, { alias, description, selector, confidence, shadowDom }>, aliasMap: Map<selector, alias> }
 */
function buildElementsDictionary(steps) {
  const elements = new Map();
  const aliasCounts = {};

  for (const step of steps) {
    if (!step.selector || step.type === 'wait' || step.type === 'scroll' || step.type === 'navigate') continue;
    if (elements.has(step.selector)) continue;

    let baseAlias = toAlias(step.label || step.selector);
    if (!baseAlias) baseAlias = 'element';

    // Deduplicate alias names
    if (aliasCounts[baseAlias] !== undefined) {
      aliasCounts[baseAlias]++;
      baseAlias = `${baseAlias}-${aliasCounts[baseAlias]}`;
    } else {
      aliasCounts[baseAlias] = 0;
    }

    const description = step.label || step.selector;
    elements.set(step.selector, {
      alias: baseAlias,
      description,
      selector: step.selector,
      confidence: step.confidence || 'medium',
      shadowDom: step.shadowDom || false,
    });
  }

  return elements;
}

/**
 * Export a session to Markdown.
 * @param {{ name: string, intention: string, steps: Array, recordedAt: string }} session
 * @returns {string} Markdown content
 */
function exportToMarkdown(session) {
  const { name, intention, steps, recordedAt } = session;
  const lines = [];

  // --- Header block ---
  lines.push(`# Test: ${name}`);
  lines.push('');
  lines.push(`**Intention:** ${intention}`);
  lines.push(`**Recorded:** ${recordedAt}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // --- Elements dictionary ---
  const stepsWithWaits = typeof injectWaitSteps === 'function' ? injectWaitSteps(steps) : steps;
  const elements = buildElementsDictionary(stepsWithWaits);

  if (elements.size > 0) {
    lines.push('## Elements');
    lines.push('');
    lines.push('| Alias | Description | Selector | Confidence |');
    lines.push('|-------|-------------|----------|------------|');

    const hasShadowDom = Array.from(elements.values()).some(e => e.shadowDom);

    for (const el of elements.values()) {
      const confLabel = el.confidence === 'low' ? `${el.confidence} ⚠️` : el.confidence;
      const selectorDisplay = `\`${el.selector}\``;
      lines.push(`| \`${el.alias}\` | ${el.description} | ${selectorDisplay} | ${confLabel} |`);
    }

    if (hasShadowDom) {
      lines.push('');
      lines.push('> Note: `>>` in selectors denotes shadow DOM pierce boundary.');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // --- Steps list ---
  lines.push('## Steps');
  lines.push('');

  let stepNum = 1;
  for (const step of stepsWithWaits) {
    const line = formatStep(step, elements);
    lines.push(`${stepNum}. ${line}`);
    stepNum++;
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format a single step as a Markdown line.
 */
function formatStep(step, elements) {
  const alias = step.selector && elements.has(step.selector)
    ? `\`${elements.get(step.selector).alias}\``
    : null;

  switch (step.type) {
    case 'click':
      return `Click on ${alias || `\`${step.label}\``}`;

    case 'input':
      return `Type \`"${step.value}"\` in ${alias || `\`${step.label}\``}`;

    case 'scroll': {
      const target = step.landmarkLabel
        ? `to ${step.landmarkLabel}`
        : `down (~${step.scrollY}px)`;
      return `Scroll ${target}`;
    }

    case 'keypress':
      return `Press \`${step.key}\``;

    case 'wait':
      return step.label;

    case 'verify': {
      const text = step.textContent ? ` with text: \`"${step.textContent}"\`` : '';
      const value = step.value ? ` with value: \`"${step.value}"\`` : '';
      return `Assert ${alias || `\`${step.selector}\``} exists${text}${value}`;
    }

    case 'navigate':
      return `Navigate to \`${step.url}\``;

    default:
      return `Unknown step: ${step.type}`;
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { exportToMarkdown, buildElementsDictionary, toAlias, formatStep };
}
