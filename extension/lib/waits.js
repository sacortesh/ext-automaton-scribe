// lib/waits.js — Time bucketing logic for wait steps

const WAIT_THRESHOLDS = {
  OMIT_BELOW_MS: 500,
  WARN_ABOVE_MS: 10000,
};

/**
 * Convert a millisecond delta into a human-readable wait label, or null if too short.
 * @param {number} ms - Time delta in milliseconds
 * @returns {{ label: string, warn: boolean } | null}
 */
function bucketWait(ms) {
  if (ms < WAIT_THRESHOLDS.OMIT_BELOW_MS) return null;

  const seconds = Math.round(ms / 1000);
  const clamped = Math.max(1, seconds);
  const warn = ms > WAIT_THRESHOLDS.WARN_ABOVE_MS;
  const label = `Wait ~${clamped}s` + (warn ? ' \u26A0\uFE0F (unusually long — possible service call or manual pause)' : '');

  return { label, warn, seconds: clamped };
}

/**
 * Given a list of raw recorded events (with timestamps), insert wait steps between them.
 * @param {Array<{ timestamp: number }>} events
 * @returns {Array} events with wait steps injected
 */
function injectWaitSteps(events) {
  if (events.length === 0) return [];

  const result = [events[0]];
  for (let i = 1; i < events.length; i++) {
    const delta = events[i].timestamp - events[i - 1].timestamp;
    const wait = bucketWait(delta);
    if (wait) {
      result.push({
        type: 'wait',
        label: wait.label,
        warn: wait.warn,
        seconds: wait.seconds,
        timestamp: events[i - 1].timestamp + delta,
      });
    }
    result.push(events[i]);
  }
  return result;
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bucketWait, injectWaitSteps, WAIT_THRESHOLDS };
}
