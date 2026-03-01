// content/highlighter.js — Visual feedback overlay for verify mode

const HIGHLIGHTER_ID = '__automaton_scribe_highlight__';

let currentHighlight = null;

function ensureOverlay() {
  if (document.getElementById(HIGHLIGHTER_ID)) return;
  const overlay = document.createElement('div');
  overlay.id = HIGHLIGHTER_ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    border: '2px solid #6a1b9a',
    borderRadius: '3px',
    background: 'rgba(106, 27, 154, 0.08)',
    transition: 'all 0.1s ease',
    display: 'none',
  });
  document.body.appendChild(overlay);
}

function showHighlight(element) {
  ensureOverlay();
  const overlay = document.getElementById(HIGHLIGHTER_ID);
  if (!overlay) return;

  const rect = element.getBoundingClientRect();
  Object.assign(overlay.style, {
    top: rect.top - 2 + 'px',
    left: rect.left - 2 + 'px',
    width: rect.width + 4 + 'px',
    height: rect.height + 4 + 'px',
    display: 'block',
  });
  currentHighlight = element;
}

function hideHighlight() {
  const overlay = document.getElementById(HIGHLIGHTER_ID);
  if (overlay) overlay.style.display = 'none';
  currentHighlight = null;
}

function flashConfirm(element) {
  ensureOverlay();
  const overlay = document.getElementById(HIGHLIGHTER_ID);
  if (!overlay) return;

  const rect = element.getBoundingClientRect();
  Object.assign(overlay.style, {
    top: rect.top - 2 + 'px',
    left: rect.left - 2 + 'px',
    width: rect.width + 4 + 'px',
    height: rect.height + 4 + 'px',
    display: 'block',
    border: '2px solid #2e7d32',
    background: 'rgba(46, 125, 50, 0.15)',
  });

  setTimeout(() => {
    Object.assign(overlay.style, {
      display: 'none',
      border: '2px solid #6a1b9a',
      background: 'rgba(106, 27, 154, 0.08)',
    });
  }, 400);
}

function removeOverlay() {
  const overlay = document.getElementById(HIGHLIGHTER_ID);
  if (overlay) overlay.remove();
  currentHighlight = null;
}
