const STORAGE_KEY = 'clipboardHistory';
const PENDING_QUEUE_KEY = 'clipboardManagerPendingQueue';
const CONTENT_SCRIPT_ID = 'clipboard-content';
const MAX_HISTORY = 10;

let processingQueue = false;

function getClipboardHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

function saveClipboardHistory(history) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: history }, () => {
      resolve();
    });
  });
}

async function addClipboardEntry(text) {
  if (!text || text.trim() === '') return;

  let history = await getClipboardHistory();

  if (history.length > 0 && history[0].text === text) return;

  history.unshift({
    text: text,
    timestamp: Date.now()
  });

  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }

  await saveClipboardHistory(history);
}

async function processPendingQueue() {
  if (processingQueue) return;
  processingQueue = true;

  try {
    const result = await chrome.storage.local.get([PENDING_QUEUE_KEY]);
    const queue = result[PENDING_QUEUE_KEY];
    if (!Array.isArray(queue) || queue.length === 0) return;

    await chrome.storage.local.remove(PENDING_QUEUE_KEY);

    for (const item of queue) {
      if (item?.text) {
        await addClipboardEntry(item.text);
      }
    }
  } finally {
    processingQueue = false;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[PENDING_QUEUE_KEY]) {
    processPendingQueue();
  }
});

async function registerContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch {
    /* 首次安裝時可能尚未註冊 */
  }

  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      js: ['content.js'],
      matches: ['<all_urls>'],
      runAt: 'document_idle',
      allFrames: true
    }
  ]);
}

async function refreshOpenTabs() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  } catch {
    return;
  }

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
        world: 'ISOLATED'
      });
    } catch {
      /* 部分頁面無法注入 */
    }
  }
}

async function bootstrap() {
  await registerContentScripts();
  await refreshOpenTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  bootstrap();
});

bootstrap();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHistory') {
    getClipboardHistory().then((history) => {
      sendResponse({ history: history });
    });
    return true;
  }
  if (request.action === 'clearHistory') {
    saveClipboardHistory([]).then(() => {
      sendResponse({ status: 'success' });
    });
    return true;
  }
  if (request.action === 'removeEntry') {
    getClipboardHistory().then((history) => {
      history = history.filter((_, index) => index !== request.index);
      saveClipboardHistory(history).then(() => {
        sendResponse({ history: history });
      });
    });
    return true;
  }
});
