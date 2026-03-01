// background.js — Service worker: tab/message routing

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Message relay: sidepanel ↔ content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages from the side panel → forward to the active tab's content script
  if (message.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
          sendResponse(response);
        });
      }
    });
    return true; // keep channel open for async response
  }

  // Messages from content script with target 'panel' are already received directly
  // by extension pages (side panel) via chrome.runtime.onMessage — no relay needed.
  // Only TAB_NAVIGATED (originated by background itself) needs sendMessage to reach the panel.
});

// Re-inject recorder after same-tab navigation if still recording
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Ask the panel if we're still recording — it will re-inject if needed
    chrome.runtime.sendMessage({
      type: 'TAB_NAVIGATED',
      target: 'panel',
      tabId,
      url: tab.url,
    }).catch(() => {});
  }
});
