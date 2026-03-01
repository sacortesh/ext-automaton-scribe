# PLAN.md — Chrome Extension: Test Recorder

> Selenium-IDE-style test recorder as a Chrome Side Panel extension.
> Export-first (no persistence). Top-level page only. Human-readable MD output.

---

## Architecture Overview

```
extension/
├── manifest.json          # MV3, side_panel permission
├── background.js          # Service worker: tab/message routing
├── sidepanel/
│   ├── index.html
│   ├── panel.js           # UI state machine
│   └── panel.css
├── content/
│   ├── recorder.js        # Event listener injector
│   ├── selector.js        # Selector engine (modular)
│   └── highlighter.js     # Visual feedback overlay
└── lib/
    ├── exporter.js        # MD formatter
    └── waits.js           # Time bucketing logic
```

**Message flow:**
`sidepanel → background → content script → background → sidepanel`

All state lives in the sidepanel JS during session. No storage API used in MVP.

---

## Phases

---

### PHASE 1 — Extension Skeleton & Side Panel Shell
**Goal:** Boilerplate that opens as a side panel with basic UI scaffolding.

- [ ] **TASK 1.1** — Create `manifest.json`
  - Manifest V3
  - Permissions: `sidePanel`, `activeTab`, `scripting`, `tabs`
  - Register `background.js` as service worker
  - Register `sidepanel/index.html` as the side panel page
  - Content scripts: none yet (injected programmatically)

- [ ] **TASK 1.2** — Create `background.js` service worker
  - Listen for extension icon click → open side panel via `chrome.sidePanel.open()`
  - Set up message relay: `sidepanel ↔ content script` via `chrome.tabs.sendMessage` / `chrome.runtime.onMessage`

- [ ] **TASK 1.3** — Create `sidepanel/index.html` + `panel.css`
  - Minimal layout: header, main content area, footer action bar
  - Define 3 UI states visually: `IDLE`, `CONFIGURED`, `RECORDING`
  - No logic yet, just static HTML with placeholder buttons

- [ ] **TASK 1.4** — Verify side panel opens correctly on icon click in Chrome
  - Manual smoke test: extension loads, side panel opens, no console errors

---

### PHASE 2 — Test Creation Flow (UI State Machine)
**Goal:** The "Create New Test" → name/intention form → unlock Record button flow.

- [ ] **TASK 2.1** — Implement state machine in `panel.js`
  - States: `IDLE → CONFIGURED → RECORDING → STOPPED`
  - State drives which UI sections are visible/enabled
  - Keep state as a plain JS object (no framework needed)

- [ ] **TASK 2.2** — "Create New Test" button
  - On click: transition to `CONFIGURED` state
  - Show form: `Test Name` (required text input) + `Intention` (required textarea, describe what this test verifies)

- [ ] **TASK 2.3** — Form validation
  - Both fields required before enabling Record button
  - Inline validation, no submit button — enable Record reactively on input

- [ ] **TASK 2.4** — "Record" button
  - Enabled only in `CONFIGURED` state with valid form
  - On click: transition to `RECORDING` state, show recording indicator (red dot + label)
  - Send `START_RECORDING` message to background → content script

- [ ] **TASK 2.5** — "Stop Recording" button
  - Visible only in `RECORDING` state
  - On click: transition to `STOPPED` state
  - Send `STOP_RECORDING` to content script
  - Show recorded steps list + Export button

---

### PHASE 3 — Content Script: Event Capture
**Goal:** Inject recorder into the active tab, capture selective user interactions, relay them to the panel.

- [ ] **TASK 3.1** — Create `content/recorder.js` — injection & teardown
  - Injected programmatically via `chrome.scripting.executeScript` when recording starts
  - Must be idempotent (guard against double injection)
  - On `STOP_RECORDING`: remove all listeners, clean up

- [ ] **TASK 3.2** — Capture: Click events
  - Listen on `document` with `capture: true` (catches all elements)
  - On click: record `{ type: 'click', target, timestamp }`
  - Skip clicks on extension UI itself (guard by checking origin)

- [ ] **TASK 3.3** — Capture: Input events
  - Listen for `change` on `input`, `textarea`, `select`
  - Record `{ type: 'input', target, value, timestamp }`
  - Debounce: only fire after user stops typing (300ms)
  - Mask value if input type is `password`

- [ ] **TASK 3.4** — Capture: Scroll events
  - Listen for `scroll` on `window`
  - Debounced (500ms), record final scroll position `{ type: 'scroll', x, scrollY, timestamp }`
  - Desirable: attempt to identify nearest visible landmark element at scroll position (best-effort, non-blocking)

- [ ] **TASK 3.5** — Capture: Keyboard shortcuts (optional but useful)
  - Capture `keydown` for `Enter`, `Tab`, `Escape` — these matter in form flows
  - Record `{ type: 'keypress', key, target, timestamp }`

- [ ] **TASK 3.6** — Message relay to background/panel
  - Each captured event → `chrome.runtime.sendMessage({ type: 'EVENT_CAPTURED', payload })`
  - Panel receives and appends to session event log

---

### PHASE 4 — Selector Engine (Modular)
**Goal:** Given a DOM element, produce the best possible unique selector. Fully modular so strategies can be swapped/extended.

- [ ] **TASK 4.1** — Create `content/selector.js` — strategy runner
  - `getBestSelector(element)` → runs strategies in priority order, returns first unique result
  - Each strategy is a function: `(element) → string | null`
  - "Unique" = `document.querySelector(result) === element`

- [ ] **TASK 4.2** — Strategy 1: ID
  - `#elementId` — only if ID exists and is unique in document
  - Skip auto-generated IDs (heuristic: contains numbers > 5 chars, or matches patterns like `ember123`, `:r0:`)

- [ ] **TASK 4.3** — Strategy 2: Data attributes (Playwright-style)
  - Priority order: `data-testid`, `data-test`, `data-cy`, `data-qa`, `aria-label`, `name`, `role`
  - Produce `[data-testid="value"]` style selector
  - Verify uniqueness before returning

- [ ] **TASK 4.4** — Strategy 3: Class-based selector
  - Use meaningful classes (filter out utility classes: single-char, numeric-only, framework tokens like `ng-`, `css-`)
  - Combine with tag name: `button.submit-btn`
  - Walk up the DOM to add context if not unique: `form.login-form button.submit-btn`

- [ ] **TASK 4.5** — Strategy 4: Structural/fallback selector
  - Build nth-child path from a stable ancestor (first element with ID or data attribute)
  - Limit depth to 5 levels

- [ ] **TASK 4.6** — Shadow DOM support
  - Detect if element is inside a shadow root: `element.getRootNode() instanceof ShadowRoot`
  - Walk up shadow boundaries, building a composite selector
  - Use `>>` as separator to denote shadow boundary (Playwright convention)
  - Example output: `my-component >> button.submit`
  - Note in export that `>>` denotes shadow DOM pierce

- [ ] **TASK 4.7** — Selector confidence score + fallback label
  - Each strategy returns `{ selector, confidence: 'high' | 'medium' | 'low' }`
  - If best confidence is `low`, flag it in the export with a `⚠️` warning

---

### PHASE 5 — Wait/Time Bucketing
**Goal:** Convert raw timestamps into human-readable, approximate wait steps.

- [ ] **TASK 5.1** — Create `lib/waits.js`
  - `bucketWait(ms)` → returns wait label or `null`
  - Thresholds (configurable constants):
    - `< 500ms` → omit (too fast, likely UI response)
    - `500ms – 1500ms` → `Wait ~1s`
    - `1500ms – 4000ms` → `Wait ~2s` / `Wait ~3s` (round to nearest second)
    - `4000ms – 10000ms` → `Wait ~Xs` (round to nearest second)
    - `> 10000ms` → `Wait ~Xs ⚠️ (unusually long — possible service call or manual pause)`

- [ ] **TASK 5.2** — Inject wait steps between recorded events
  - When building the step list from raw events, calculate delta between consecutive timestamps
  - Insert `Wait` steps where `bucketWait` returns non-null

---

### PHASE 6 — Verify / Faux Click Mode
**Goal:** Secondary recording mode where clicks are intercepted (not triggered), elements are logged as assertion targets with their text/value.

- [ ] **TASK 6.1** — Add "Verify Mode" toggle button in panel
  - Only available during `RECORDING` state
  - Toggle indicator: distinct color (e.g., purple) vs record red
  - Send `ENABLE_VERIFY_MODE` / `DISABLE_VERIFY_MODE` to content script

- [ ] **TASK 6.2** — In `recorder.js`: intercept clicks in verify mode
  - When verify mode active: add listener with `capture: true` and call `event.preventDefault()` + `event.stopPropagation()`
  - Capture element, generate selector, capture visible text content and/or value
  - Record as `{ type: 'verify', target, selector, textContent, value, timestamp }`

- [ ] **TASK 6.3** — Visual feedback in verify mode
  - In `content/highlighter.js`: on hover, show a highlight outline on the element (no click needed)
  - On capture (click in verify mode): flash green outline briefly to confirm

- [ ] **TASK 6.4** — Verify steps in the step model
  - Verify steps render differently in the panel step list and in the export
  - Export format: `* Assert element [selector] exists with text: "Continue"`

---

### PHASE 7 — Live Step List in Panel
**Goal:** Show recorded steps in real-time in the side panel as the user records.

- [ ] **TASK 7.1** — Step list rendering in `panel.js`
  - Each incoming `EVENT_CAPTURED` message → append to `session.steps[]`
  - Re-render step list after each append
  - Step display: icon + short description + selector badge

- [ ] **TASK 7.2** — Step types & icons
  - `click` → 🖱️ `Click on [element label]`
  - `input` → ⌨️ `Type "[value]" in [element label]`
  - `scroll` → 📜 `Scroll to [position or element]`
  - `keypress` → ⌨️ `Press [Key]`
  - `wait` → ⏱️ `Wait ~Xs`
  - `verify` → ✅ `Assert [element label] = "[text]"`

- [ ] **TASK 7.3** — Step deletion
  - Each step has a delete (×) button
  - Removes from `session.steps[]` and re-renders

- [ ] **TASK 7.4** — Element label resolution
  - `getElementLabel(element)` → human-readable name
  - Priority: `aria-label` → `placeholder` → `innerText` (truncated 30 chars) → `title` → tag + selector fragment

---

### PHASE 8 — MD Exporter
**Goal:** Generate a well-structured, human-readable + technically detailed Markdown file from the session.

- [ ] **TASK 8.1** — Create `lib/exporter.js`
  - `exportToMarkdown(session)` → string
  - `session`: `{ name, intention, steps[], recordedAt }`

- [ ] **TASK 8.2** — MD format: header block
  ```markdown
  # Test: [Test Name]
  
  **Intention:** [Intention text]
  **Recorded:** [Date + time]
  
  ---
  ```

- [ ] **TASK 8.3** — MD format: Elements Dictionary
  ```markdown
  ## Elements
  
  | Alias | Description | Selector | Confidence |
  |-------|-------------|----------|------------|
  | `btn-continuar` | Button "Continuar" | `#continuar` | high |
  | `input-email` | Input placeholder "Email" | `[data-testid="email-input"]` | high |
  | `btn-submit` | Button "Submit" (⚠️ low confidence) | `form.login > div:nth-child(3) > button` | low |
  ```
  - Deduplicate elements across steps — same selector = same alias
  - Auto-generate alias from label (kebab-case)
  - Flag shadow DOM selectors with note: `(shadow DOM: \`>>\` denotes pierce boundary)`

- [ ] **TASK 8.4** — MD format: Steps list
  ```markdown
  ## Steps
  
  1. Click on `btn-continuar`
  2. Wait ~2s
  3. Type `"usuario@banco.com"` in `input-email`
  4. Wait ~1s
  5. Press `Enter`
  6. Wait ~3s ⚠️ (possible service call)
  7. Assert `btn-submit` exists with text: `"Continuar"`
  8. Scroll down (~400px)
  ```

- [ ] **TASK 8.5** — Export trigger in panel
  - "Export as Markdown" button visible in `STOPPED` state
  - Generate MD string → create Blob → trigger file download via `URL.createObjectURL`
  - Filename: `[test-name-kebab]-[date].md`

---

### PHASE 9 — Polish & Edge Cases
**Goal:** Make it solid enough for daily use without becoming scope creep.

- [ ] **TASK 9.1** — Handle recording across navigation (same-tab page transitions)
  - Content script is destroyed on navigation; re-inject automatically if still in `RECORDING` state
  - Background listens for `chrome.tabs.onUpdated` → re-inject recorder

- [ ] **TASK 9.2** — Duplicate event deduplication
  - Some events fire multiple times (click + focus + mousedown). Deduplicate by target + type within 50ms window.

- [ ] **TASK 9.3** — "New Test" reset
  - From `STOPPED` state, "New Test" clears `session` and returns to `IDLE`
  - Warn if session has steps and no export was done

- [ ] **TASK 9.4** — Selector engine unit tests (plain JS, no framework)
  - Test each strategy against fixture HTML
  - Test shadow DOM composite selector generation
  - Run via `node` directly from CLI

- [ ] **TASK 9.5** — Basic error handling
  - Content script injection failure (e.g., chrome:// pages) → show clear error in panel
  - Selector engine failure → fallback to nth-child + log warning in export

---

### PHASE 10 — Bug Fix: "New Test" Reset + Descriptive Element Aliases
**Goal:** Fix the broken "new test after recording" flow and make the exported Elements table aliases self-describing (include HTML tag + identifying selector fragment).

#### 10A — Fix "New Test" restart after recording

- [ ] **TASK 10.1** — `btnNewFromStopped`: send `STOP_RECORDING` before resetting
  - In `panel.js`, the `btnNewFromStopped` click handler currently resets the session and transitions to `IDLE` but never sends `STOP_RECORDING` to the content script
  - If the tab still has a lingering recorder (e.g., stop message was lost, or user navigated back), the `__automaton_scribe_injected__` guard will block re-injection
  - Add `await sendToContent('STOP_RECORDING')` before resetting session, to guarantee clean slate
  - Make the handler `async` to support the await

- [ ] **TASK 10.2** — `btnNewFromStopped`: transition to `CONFIGURED` instead of `IDLE`
  - Current flow: STOPPED → IDLE → user clicks "Create New Test" → CONFIGURED → fills form → Record
  - The user request ("not restarting testing") implies the extra IDLE step is friction — skip it
  - Change `transition(STATES.IDLE)` to `transition(STATES.CONFIGURED)` after reset
  - Clear and focus the test name input (same as `btnNewTest` does)

- [ ] **TASK 10.3** — `btnRecord`: send `STOP_RECORDING` before injecting new scripts
  - Safety net: when starting a new recording, always tell any existing content script to stop first
  - This ensures `__automaton_scribe_injected__` is reset even if previous stop was missed
  - Add `await sendToContent('STOP_RECORDING').catch(() => {})` before `injectContentScripts()`
  - Use `.catch(() => {})` because there may be no listener on the tab yet (first recording)

#### 10B — Descriptive Element Aliases in Export

- [ ] **TASK 10.4** — Add `tagName` to step payloads from `recorder.js`
  - In each `sendEvent()` call for click, input, keypress, and verify events, include `tagName: el.tagName.toLowerCase()`
  - This gives the exporter the HTML tag without needing to parse the selector

- [ ] **TASK 10.5** — Rewrite `toAlias()` in `exporter.js` to produce tag-qualified aliases
  - New signature: `toAlias(step)` — receives the full step object instead of just a label string
  - Build alias as: `<tag><qualifier>-<label>` where:
    - `<tag>` = `step.tagName` (e.g., `span`, `button`, `input`)
    - `<qualifier>` = first useful identifier from the selector:
      - If selector starts with `#id` → use `#id` (e.g., `span#type-to-search`)
      - Else if selector has `[data-testid="x"]` → use `.x` shorthand
      - Else if selector has a meaningful class → use `.class`
      - Else omit qualifier
    - `<label>` = kebab-cased version of `step.label`, truncated to keep total alias ≤ 40 chars
  - Examples:
    - `{ tagName: 'span', selector: '#type-to-search', label: 'Type to search' }` → `span#type-to-search`
    - `{ tagName: 'button', selector: '[data-testid="submit"]', label: 'Submit' }` → `button.submit`
    - `{ tagName: 'input', selector: '.email-field', label: 'Email' }` → `input.email-field`
    - `{ tagName: 'div', selector: 'div > span:nth-child(2)', label: 'Hello' }` → `div-hello`

- [ ] **TASK 10.6** — Update `buildElementsDictionary()` to pass step to new `toAlias()`
  - Change `toAlias(step.label || step.selector)` → `toAlias(step)`
  - Ensure deduplication logic still works with new alias format

- [ ] **TASK 10.7** — Update exporter tests for new alias format
  - Update `toAlias` tests: new input is a step object, new output includes tag prefix
  - Update `buildElementsDictionary` tests: expected aliases change format
  - Update `exportToMarkdown` integration tests: alias references in steps section change
  - Add new test cases for each qualifier path (ID, data-attr, class, no qualifier)

- [ ] **TASK 10.8** — Verify all 3 test suites pass
  - Run `node extension/tests/selector.test.js && node extension/tests/exporter.test.js && node extension/tests/waits.test.js`
  - Selector and waits tests should be unaffected
  - All exporter tests must pass with updated expectations

---

## MVP Cutoff (Phases 1–5 + 8)

If you want to ship something usable fast:

| Include | Exclude |
|--------|---------|
| Side panel shell + state machine | Verify mode (Phase 6) |
| Click + input capture | Scroll-to-element (use scroll position) |
| Selector engine (strategies 1–4) | Shadow DOM (add after) |
| Wait bucketing | Step deletion |
| MD export | Confidence scoring |

**Estimated tasks in MVP: ~25 tasks. Shadow DOM + verify mode add ~10 more.**

---

## Constraint Version (Half the time)

Skip Phase 9, skip shadow DOM (Task 4.6), skip keyboard capture (Task 3.5), skip scroll-to-element.
Use CSS path fallback only for selector if ID/data-attr not found.
No step deletion — export what you recorded.

**Output is still useful: you get click + input capture with good selectors + MD export.**

---

## Key Modularity Decisions

- **Selector strategies** are registered in an array — add/remove/reorder without touching core logic.
- **Step types** are a discriminated union — adding a new event type means adding one renderer + one exporter case.
- **Waits thresholds** are named constants at the top of `waits.js` — tune without reading logic.
- **MD format** is a pure function of session data — swap template without touching capture logic.