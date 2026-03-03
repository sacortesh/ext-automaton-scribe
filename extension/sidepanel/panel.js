// sidepanel/panel.js — UI state machine and session controller

// --- State ---
const STATES = { IDLE: 'IDLE', CONFIGURED: 'CONFIGURED', RECORDING: 'RECORDING', STOPPED: 'STOPPED' };

let state = STATES.IDLE;
let verifyActive = false;
let session = {
  name: '',
  intention: '',
  steps: [],
  recordedAt: null,
};

// --- DOM references ---
const $ = (sel) => document.querySelector(sel);
const viewIdle = $('#view-idle');
const viewConfigured = $('#view-configured');
const viewRecording = $('#view-recording');
const viewStopped = $('#view-stopped');
const statusBadge = $('#status-badge');
const errorBanner = $('#error-banner');

const btnNewTest = $('#btn-new-test');
const btnCancel = $('#btn-cancel');
const btnRecord = $('#btn-record');
const btnStop = $('#btn-stop');
const btnExport = $('#btn-export');
const btnNewFromStopped = $('#btn-new-from-stopped');
const btnVerifyToggle = $('#btn-verify-toggle');

const inputTestName = $('#input-test-name');
const inputIntention = $('#input-intention');
const stepList = $('#step-list');
const stoppedStepList = $('#stopped-step-list');
const stoppedTestName = $('#stopped-test-name');
const recLabel = $('#rec-label');
const recIndicator = $('.recording-indicator');

// --- State machine ---
function transition(newState) {
  state = newState;
  verifyActive = false;

  // Toggle views
  viewIdle.classList.toggle('hidden', state !== STATES.IDLE);
  viewConfigured.classList.toggle('hidden', state !== STATES.CONFIGURED);
  viewRecording.classList.toggle('hidden', state !== STATES.RECORDING);
  viewStopped.classList.toggle('hidden', state !== STATES.STOPPED);

  // Status badge
  const badgeConfig = {
    [STATES.IDLE]: { text: 'Idle', class: 'badge-idle' },
    [STATES.CONFIGURED]: { text: 'Ready', class: 'badge-configured' },
    [STATES.RECORDING]: { text: 'Recording', class: 'badge-recording' },
    [STATES.STOPPED]: { text: 'Done', class: 'badge-stopped' },
  };
  const badge = badgeConfig[state];
  statusBadge.textContent = badge.text;
  statusBadge.className = `badge ${badge.class}`;

  // Reset verify toggle
  btnVerifyToggle.classList.remove('active');
  recIndicator.classList.remove('verify-mode');
  recLabel.textContent = 'Recording...';

  hideError();
}

// --- Step rendering ---
const STEP_ICONS = {
  click: '\u{1F5B1}\uFE0F',   // 🖱️
  input: '\u2328\uFE0F',       // ⌨️
  scroll: '\u{1F4DC}',         // 📜
  keypress: '\u2328\uFE0F',    // ⌨️
  wait: '\u23F1\uFE0F',        // ⏱️
  verify: '\u2705',            // ✅
  navigate: '\u{1F310}',       // 🌐
};

function formatStepText(step) {
  switch (step.type) {
    case 'click':
      return `Click on <code>${escHtml(step.label)}</code>`;
    case 'input':
      return `Type <code>"${escHtml(step.value)}"</code> in <code>${escHtml(step.label)}</code>`;
    case 'scroll': {
      const target = step.landmarkLabel || `~${step.scrollY}px`;
      return `Scroll to <code>${escHtml(target)}</code>`;
    }
    case 'keypress':
      return `Press <code>${escHtml(step.key)}</code>`;
    case 'wait':
      return escHtml(step.label);
    case 'verify': {
      const text = step.textContent ? ` = <code>"${escHtml(step.textContent)}"</code>` : '';
      return `Assert <code>${escHtml(step.label || step.selector)}</code>${text}`;
    }
    case 'navigate':
      return `Navigate to <code>${escHtml(step.url)}</code>`;
    default:
      return escHtml(step.type);
  }
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderSteps(listEl, steps, deletable) {
  listEl.innerHTML = '';
  steps.forEach((step, i) => {
    const li = document.createElement('li');

    const numSpan = document.createElement('span');
    numSpan.className = 'step-number';
    numSpan.textContent = `${i + 1}.`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'step-icon';
    iconSpan.textContent = STEP_ICONS[step.type] || '\u2022';

    const textSpan = document.createElement('span');
    textSpan.className = 'step-text';
    textSpan.innerHTML = formatStepText(step);

    li.appendChild(numSpan);
    li.appendChild(iconSpan);
    li.appendChild(textSpan);

    if (deletable) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'step-delete';
      deleteBtn.textContent = '\u00D7';
      deleteBtn.title = 'Remove step';
      deleteBtn.addEventListener('click', () => {
        session.steps.splice(i, 1);
        renderSteps(listEl, session.steps, true);
      });
      li.appendChild(deleteBtn);
    }

    listEl.appendChild(li);
  });

  // Auto-scroll to bottom
  listEl.scrollTop = listEl.scrollHeight;
}

// --- Content script injection ---
async function injectContentScripts() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found.');

    // Check for restricted URLs
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:'))) {
      throw new Error('Cannot record on browser internal pages (chrome://, about:, etc.).');
    }

    // Inject into main frame
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: ['content/selector.js', 'content/highlighter.js', 'content/recorder.js'],
    });

    // Inject into same-origin child iframes
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });

      for (const frame of frames) {
        if (frame.frameId === 0) continue;          // Skip main frame
        if (frame.parentFrameId !== 0) continue;     // Skip nested iframes

        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [frame.frameId] },
            files: ['content/selector.js', 'content/highlighter.js', 'content/recorder.js'],
          });
          console.log(`Injected into iframe (frameId: ${frame.frameId})`);
        } catch (err) {
          console.warn(`Could not inject into iframe (frameId: ${frame.frameId}): ${err.message}`);
        }
      }
    } catch (frameErr) {
      console.warn('Failed to inject into iframes:', frameErr.message);
    }

    return tab.id;
  } catch (err) {
    throw new Error(`Failed to inject recorder: ${err.message}`);
  }
}

async function sendToContent(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type });
  }
}

// --- Error display ---
function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
  errorBanner.textContent = '';
}

// --- Form validation ---
function validateForm() {
  const nameValid = inputTestName.value.trim().length > 0;
  const intentionValid = inputIntention.value.trim().length > 0;
  btnRecord.disabled = !(nameValid && intentionValid);
}

// --- Event handlers ---

btnNewTest.addEventListener('click', () => {
  inputTestName.value = '';
  inputIntention.value = '';
  btnRecord.disabled = true;
  transition(STATES.CONFIGURED);
  inputTestName.focus();
});

btnCancel.addEventListener('click', () => {
  transition(STATES.IDLE);
});

inputTestName.addEventListener('input', validateForm);
inputIntention.addEventListener('input', validateForm);

btnRecord.addEventListener('click', async () => {
  session = {
    name: inputTestName.value.trim(),
    intention: inputIntention.value.trim(),
    steps: [],
    recordedAt: new Date().toLocaleString(),
  };

  try {
    // Safety net: stop any lingering recorder from a previous session
    await sendToContent('STOP_RECORDING').catch(() => {});
    await injectContentScripts();
    transition(STATES.RECORDING);
    renderSteps(stepList, session.steps, true);
  } catch (err) {
    showError(err.message);
  }
});

btnStop.addEventListener('click', async () => {
  await sendToContent('STOP_RECORDING');
  transition(STATES.STOPPED);

  // Inject waits and render final list
  const stepsWithWaits = typeof injectWaitSteps === 'function'
    ? injectWaitSteps(session.steps)
    : session.steps;

  stoppedTestName.textContent = session.name;
  renderSteps(stoppedStepList, stepsWithWaits, false);
});

btnVerifyToggle.addEventListener('click', async () => {
  verifyActive = !verifyActive;
  btnVerifyToggle.classList.toggle('active', verifyActive);
  recIndicator.classList.toggle('verify-mode', verifyActive);
  recLabel.textContent = verifyActive ? 'Verify Mode' : 'Recording...';

  // Update badge
  statusBadge.textContent = verifyActive ? 'Verify' : 'Recording';
  statusBadge.className = `badge ${verifyActive ? 'badge-verify' : 'badge-recording'}`;

  await sendToContent(verifyActive ? 'ENABLE_VERIFY_MODE' : 'DISABLE_VERIFY_MODE');
});

btnExport.addEventListener('click', () => {
  const md = exportToMarkdown(session);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const kebabName = session.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const dateStamp = new Date().toISOString().split('T')[0];
  const filename = `${kebabName}-${dateStamp}.md`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

btnNewFromStopped.addEventListener('click', async () => {
  if (session.steps.length > 0) {
    if (!confirm('You have recorded steps that have not been exported. Start a new test anyway?')) {
      return;
    }
  }
  await sendToContent('STOP_RECORDING');
  session = { name: '', intention: '', steps: [], recordedAt: null };
  inputTestName.value = '';
  inputIntention.value = '';
  btnRecord.disabled = true;
  transition(STATES.CONFIGURED);
  inputTestName.focus();
});

// --- Incoming messages from content script (via background) ---
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'EVENT_CAPTURED' && state === STATES.RECORDING) {
    const payload = {
      ...message.payload,
      frameId: sender.frameId || 0,
      isIframe: (sender.frameId || 0) !== 0,
    };
    session.steps.push(payload);
    renderSteps(stepList, session.steps, true);
  }

  // Handle tab navigation re-injection
  if (message.type === 'TAB_NAVIGATED' && state === STATES.RECORDING) {
    if (message.url) {
      session.steps.push({
        type: 'navigate',
        url: message.url,
        timestamp: Date.now(),
      });
      renderSteps(stepList, session.steps, true);
    }
    injectContentScripts().catch((err) => {
      showError(`Re-injection after navigation failed: ${err.message}`);
    });
  }
});

// --- Initialize ---
transition(STATES.IDLE);
