# Automaton Scribe

A Chrome extension that records user interactions and exports them as human-readable Markdown test scripts. Think Selenium IDE, but lighter — no persistence, no runtime, just clean Markdown output.

## Features

- Record clicks, text input, scrolls, and key presses
- Verify mode to assert element text/values
- Automatic wait-step injection based on time gaps between actions
- Smart CSS selector engine (IDs, data attributes, ARIA, classes, structural fallback)
- Shadow DOM support
- Export as a self-documented Markdown file with an elements dictionary

## Install

1. Clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `extension/` folder
5. Click the extension icon to open the side panel

## Usage

1. Click the extension icon to open the side panel
2. Click **Create New Test**, enter a name and intention
3. Click **Record** — interact with the page normally
4. Toggle **Verify** to assert element content (click an element to capture its text)
5. Click **Stop** when done
6. Click **Export** to download the Markdown test script

## Running Tests

No dependencies required — tests run with plain Node.js:

```bash
node extension/tests/selector.test.js
node extension/tests/exporter.test.js
node extension/tests/waits.test.js
```

---

## Architecture

```
extension/
├── manifest.json            # MV3 manifest
├── background.js            # Service worker — tab routing, re-injection on navigation
├── content/
│   ├── selector.js          # CSS selector engine (4 strategies)
│   ├── highlighter.js       # Visual overlay for verify mode
│   └── recorder.js          # Event capture (click, input, scroll, keypress)
├── lib/
│   ├── exporter.js          # Session → Markdown formatter
│   └── waits.js             # Wait-step injection based on time gaps
├── sidepanel/
│   ├── index.html           # Panel markup (4 view states)
│   ├── panel.js             # UI state machine and messaging
│   └── panel.css            # Panel styles
└── tests/
    ├── selector.test.js     # Selector engine tests
    ├── exporter.test.js     # Exporter tests
    └── waits.test.js        # Wait bucketing tests
```

### Message flow

```
┌────────────┐         ┌──────────────┐         ┌─────────────────┐
│  Side Panel │ ──────▶ │  Background  │ ──────▶ │ Content Scripts  │
│  (panel.js) │         │ (background) │         │ (recorder, etc.) │
│             │ ◀─────────────────────────────── │                  │
└────────────┘   direct (chrome.runtime)         └─────────────────┘
```

- **Panel → Content:** the panel calls `chrome.tabs.sendMessage` directly (no background relay needed).
- **Content → Panel:** `chrome.runtime.sendMessage` reaches extension pages directly. The background does **not** re-broadcast these messages — doing so would cause duplicates.
- **Background role:** opens the side panel on icon click, forwards panel messages tagged `target: 'content'` to the active tab, and notifies the panel on tab navigation so it can re-inject scripts.

### Content script injection

Scripts are injected programmatically via `chrome.scripting.executeScript` in a fixed order:

1. **selector.js** — selector engine (global functions)
2. **highlighter.js** — overlay helpers (global functions)
3. **recorder.js** — event listeners (IIFE, auto-starts recording)

`selector.js` and `highlighter.js` are **not** wrapped in IIFEs — their functions stay global so `recorder.js` can call them.

A double-injection guard (`window.__automaton_scribe_injected__`) prevents duplicate listeners if the panel re-injects on navigation.

### UI state machine

```
IDLE → CONFIGURED → RECORDING → STOPPED → IDLE
```

| State | What's visible |
|---|---|
| IDLE | "Create New Test" button |
| CONFIGURED | Test name/intention form, Record button |
| RECORDING | Live step list, Verify toggle, Stop button |
| STOPPED | Final step list, Export and New Test buttons |

---

## Adding New Features

### Recording a new event type

If you want to capture a new kind of user interaction (e.g. drag-and-drop, right-click):

1. **`content/recorder.js`** — Add an event listener in `startRecording()`. Follow the existing pattern: capture the event, build a step object with `{ type, selector, label, timestamp, ... }`, and send it via `chrome.runtime.sendMessage({ action: 'EVENT_CAPTURED', event: step })`. Register the listener in the `listeners` array for cleanup.

2. **`sidepanel/panel.js`** — Add an icon for the new type in `renderSteps()` and a formatting case in `formatStepText()` so the step renders in the live list.

3. **`lib/exporter.js`** — Add a case in `formatStep()` to produce the Markdown line for your new event type. If the event targets an element, `buildElementsDictionary` will pick it up automatically (it reads `selector` from the step).

4. **Tests** — Add cases in `exporter.test.js` for `formatStep` with the new type. If the event needs selector logic, add cases in `selector.test.js`.

### Adding a new selector strategy

Selector strategies live in `content/selector.js` in the `strategies` array. Each strategy is a function that receives an element and returns `{ selector, confidence }` or `null`.

1. **`content/selector.js`** — Add your strategy function to the `strategies` array. Position matters — earlier strategies have higher priority. Set `confidence` to `'high'`, `'medium'`, or `'low'`.

2. **Tests** — Add cases in `selector.test.js` using the existing `MockElement` / `mockDocument` infrastructure.

### Changing the export format

The Markdown output is built entirely in `lib/exporter.js`:

- **`buildElementsDictionary(steps)`** — Deduplicates elements across all steps into an alias map.
- **`formatStep(step, elements)`** — Formats a single step using aliases from the dictionary.
- **`exportToMarkdown(session)`** — Assembles the full document: header, elements table, and numbered steps (with waits injected via `injectWaitSteps`).

Waits are never stored in `session.steps` — they are injected at export time by `lib/waits.js` and at display time independently by the panel.

### Adding a new UI view or control

1. **`sidepanel/index.html`** — Add the markup inside the appropriate `#view-*` section (or create a new view section).
2. **`sidepanel/panel.js`** — Wire up event listeners and update `transition()` if you added a new state.
3. **`sidepanel/panel.css`** — Style the new elements.

### Modifying background behavior

`background.js` is intentionally minimal. It handles:
- Opening the side panel on icon click
- Forwarding `target: 'content'` messages from the panel to the active tab
- Sending `TAB_NAVIGATED` to the panel when a page finishes loading

If you need the background to handle a new message type, add a case in the `chrome.runtime.onMessage` listener. Remember: do **not** re-broadcast content-script messages to the panel — they already arrive directly.
