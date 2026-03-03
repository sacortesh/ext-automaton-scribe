// lib/exporter.js — Markdown formatter

/**
 * Generate a tag-qualified alias from a step object.
 * Format: <tag><qualifier>-<label> where qualifier comes from selector.
 * @param {object} step - { tagName, selector, label }
 * @returns {string}
 */
function toAlias(step) {
  // Support legacy string argument (defensive)
  if (typeof step === 'string') {
    return step.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 40);
  }

  const tag = (step.tagName || '').toLowerCase();
  const selector = step.selector || '';
  const label = step.label || '';

  // Extract qualifier from selector
  let qualifier = '';

  // 1. ID selector: #some-id
  const idMatch = selector.match(/^#([\w-]+)/);
  if (idMatch) {
    qualifier = '#' + idMatch[1];
  }

  // 2. data-testid / data-test / data-cy / data-qa attribute
  if (!qualifier) {
    const dataMatch = selector.match(/\[data-(?:testid|test|cy|qa|tag-name)="([^"]+)"\]/);
    if (dataMatch) {
      qualifier = '.' + dataMatch[1];
    }
  }

  // 3. Meaningful class
  if (!qualifier) {
    const classMatch = selector.match(/\.([\w-]{2,})/);
    if (classMatch) {
      qualifier = '.' + classMatch[1];
    }
  }

  // iframe prefix
  const framePrefix = step.isIframe ? `iframe${step.frameId}-` : '';

  // Build alias
  if (tag && qualifier) {
    // Tag + qualifier is often descriptive enough on its own
    const alias = framePrefix + tag + qualifier;
    return alias.substring(0, 40);
  }

  // No qualifier — use tag-label
  const kebabLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  if (tag && kebabLabel) {
    return (framePrefix + tag + '-' + kebabLabel).substring(0, 40);
  }

  // Fallback
  return (framePrefix + tag || kebabLabel || 'element').substring(0, 40);
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

    let baseAlias = toAlias(step);
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
      isIframe: step.isIframe || false,
      frameId: step.frameId || 0,
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
    const hasIframes = Array.from(elements.values()).some(e => e.isIframe);
    const hasShadowDom = Array.from(elements.values()).some(e => e.shadowDom);

    lines.push('## Elements');
    lines.push('');

    if (hasIframes) {
      lines.push('| Alias | Description | Selector | Confidence | Frame |');
      lines.push('|-------|-------------|----------|------------|-------|');
    } else {
      lines.push('| Alias | Description | Selector | Confidence |');
      lines.push('|-------|-------------|----------|------------|');
    }

    for (const el of elements.values()) {
      const confLabel = el.confidence === 'low' ? `${el.confidence} ⚠️` : el.confidence;
      const selectorDisplay = `\`${el.selector}\``;
      const safeDesc = el.description.replace(/[\n\r]+/g, ' ').replace(/\|/g, '\\|');
      const row = `| \`${el.alias}\` | ${safeDesc} | ${selectorDisplay} | ${confLabel} |`;
      if (hasIframes) {
        const frameLabel = el.isIframe ? `iframe-${el.frameId}` : 'main';
        lines.push(`${row} ${frameLabel} |`);
      } else {
        lines.push(row);
      }
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
  const hasAnyIframe = stepsWithWaits.some(s => s.isIframe);
  lines.push('## Steps');
  lines.push('');

  let stepNum = 1;
  let currentFrame = 'main';
  for (const step of stepsWithWaits) {
    if (hasAnyIframe) {
      const stepFrame = step.isIframe ? `iframe-${step.frameId}` : 'main';
      if (stepFrame !== currentFrame) {
        lines.push(`   <!-- Switch to ${stepFrame} -->`);
        currentFrame = stepFrame;
      }
    }
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
