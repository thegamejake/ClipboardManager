// 在 keydown 時先快取選取文字（部分網站在 copy 事件時選取已清空）
let pendingCopyText = '';

function getInputSelection(el) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return '';
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  if (typeof start === 'number' && typeof end === 'number' && start !== end) {
    return el.value.substring(start, end);
  }
  return '';
}

function getContentEditableSelection(el) {
  if (!el || !el.isContentEditable) return '';
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';
  const range = selection.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return '';
  return selection.toString();
}

function captureSelectionText() {
  const fromSelection = window.getSelection()?.toString() || '';
  if (fromSelection) return fromSelection;

  const active = document.activeElement;
  if (active) {
    const fromActiveInput = getInputSelection(active);
    if (fromActiveInput) return fromActiveInput;

    const fromEditable = getContentEditableSelection(active);
    if (fromEditable) return fromEditable;
  }

  return '';
}

function getCopiedText(event) {
  const fromSelection = captureSelectionText();
  if (fromSelection) return fromSelection;

  if (event.target) {
    const fromTarget = getInputSelection(event.target);
    if (fromTarget) return fromTarget;

    const fromTargetEditable = getContentEditableSelection(event.target);
    if (fromTargetEditable) return fromTargetEditable;
  }

  const fromClipboardData = event.clipboardData?.getData('text/plain') || '';
  if (fromClipboardData) return fromClipboardData;

  return '';
}

function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function sendToBackground(payload) {
  if (!isExtensionContextValid()) return false;

  try {
    chrome.runtime.sendMessage(payload, () => {
      try {
        void chrome.runtime.lastError;
      } catch {
        /* 擴充功能已重新載入 */
      }
    });
    return true;
  } catch {
    return false;
  }
}

function pushCopiedText(text) {
  if (!text || text.trim() === '') return;
  sendToBackground({ action: 'addToClipboard', text });
}

function tryReadClipboardWithRetries(delays = [0, 50, 150]) {
  const attempt = (index) => {
    if (index >= delays.length) return;
    const run = () => {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text && text.trim() !== '') {
            pushCopiedText(text);
            return;
          }
          attempt(index + 1);
        })
        .catch(() => attempt(index + 1));
    };
    if (delays[index] === 0) {
      run();
    } else {
      setTimeout(run, delays[index]);
    }
  };
  attempt(0);
}

document.addEventListener(
  'keydown',
  (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') {
      return;
    }
    const text = captureSelectionText();
    if (text) {
      pendingCopyText = text;
    }
  },
  true
);

document.addEventListener(
  'copy',
  (event) => {
    const copiedText =
      getCopiedText(event) || pendingCopyText;
    pendingCopyText = '';

    if (copiedText) {
      pushCopiedText(copiedText);
      return;
    }

    tryReadClipboardWithRetries();
  },
  true
);
