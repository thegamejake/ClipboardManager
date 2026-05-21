(function () {
  const PENDING_QUEUE_KEY = 'clipboardManagerPendingQueue';

  if (window.__clipboardManager?.reinit) {
    window.__clipboardManager.reinit();
    return;
  }

  let pendingCopyText = '';
  let listening = false;

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

    return event.clipboardData?.getData('text/plain') || '';
  }

  function enqueueCopy(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    try {
      chrome.storage.local.get([PENDING_QUEUE_KEY], (result) => {
        if (chrome.runtime.lastError) return;

        const queue = result[PENDING_QUEUE_KEY] || [];
        queue.push({ text: trimmed, ts: Date.now() });

        chrome.storage.local.set({ [PENDING_QUEUE_KEY]: queue }, () => {
          void chrome.runtime.lastError;
        });
      });
    } catch {
      /* 擴充功能暫時無法連線 */
    }
  }

  function tryReadClipboardWithRetries(delays = [0, 50, 150]) {
    const attempt = (index) => {
      if (index >= delays.length) return;
      const run = () => {
        navigator.clipboard
          .readText()
          .then((clipText) => {
            if (clipText && clipText.trim() !== '') {
              enqueueCopy(clipText);
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

  function onKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') {
      return;
    }
    const text = captureSelectionText();
    if (text) {
      pendingCopyText = text;
    }
  }

  function onCopy(event) {
    const copiedText = getCopiedText(event) || pendingCopyText;
    pendingCopyText = '';

    if (copiedText) {
      enqueueCopy(copiedText);
      return;
    }

    tryReadClipboardWithRetries();
  }

  function detachListeners() {
    if (!listening) return;
    listening = false;
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('copy', onCopy, true);
  }

  function attachListeners() {
    detachListeners();
    listening = true;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('copy', onCopy, true);
  }

  window.__clipboardManager = {
    reinit: attachListeners
  };

  attachListeners();
})();
