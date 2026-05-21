const STORAGE_KEY = 'clipboardHistory';
const MAX_HISTORY = 10;

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
  // popup 透過 chrome.storage.onChanged 更新，避免 popup 關閉時 sendMessage 失敗
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'addToClipboard') {
    addClipboardEntry(request.text).then(() => {
      sendResponse({ status: 'success' });
    });
    return true;
  } else if (request.action === 'getHistory') {
    getClipboardHistory().then((history) => {
      sendResponse({ history: history });
    });
    return true;
  } else if (request.action === 'clearHistory') {
    saveClipboardHistory([]).then(() => {
      sendResponse({ status: 'success' });
    });
    return true;
  } else if (request.action === 'removeEntry') {
    getClipboardHistory().then((history) => {
      history = history.filter((_, index) => index !== request.index);
      saveClipboardHistory(history).then(() => {
        sendResponse({ history: history });
      });
    });
    return true;
  }
});
