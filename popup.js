const STORAGE_KEY = 'clipboardHistory';
const historyList = document.getElementById('historyList');
const clearBtn = document.getElementById('clearBtn');

function sendToBackground(message, onSuccess) {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.warn(chrome.runtime.lastError.message);
      return;
    }
    if (onSuccess) onSuccess(response);
  });
}

// 格式化時間戳記
function formatTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (hours < 24) return `${hours} 小時前`;
  if (days < 7) return `${days} 天前`;

  return date.toLocaleDateString('zh-TW');
}

// 取得文字預覽（最多 50 個字元）
function getPreview(text, maxLength = 50) {
  const preview = text.replace(/\n/g, ' ').trim();
  if (!preview) return '（空白或僅空白字元）';
  if (preview.length > maxLength) {
    return preview.substring(0, maxLength) + '...';
  }
  return preview;
}

// 載入並顯示歷史紀錄
function loadHistory() {
  sendToBackground({ action: 'getHistory' }, (response) => {
    const history = response?.history;

    if (!history || history.length === 0) {
      historyList.innerHTML = '<div class="empty-state">尚無紀錄</div>';
      return;
    }

    historyList.innerHTML = history.map((item, index) => `
      <div class="history-item">
        <div class="item-content">
          <div class="item-preview">${escapeHtml(getPreview(item.text))}</div>
          <div class="item-time">${formatTime(item.timestamp)}</div>
        </div>
        <div class="item-actions">
          <button class="copy-btn" data-index="${index}" title="複製到剪貼簿">複製</button>
          <button class="delete-btn" data-index="${index}" title="刪除">刪除</button>
        </div>
      </div>
    `).join('');

    // 加入事件監聽器
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => copyToClipboard(e, history));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => deleteEntry(e));
    });
  });
}

// HTML 跳脫（防止 XSS）
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// 複製到剪貼簿
function copyToClipboard(event, history) {
  const index = parseInt(event.target.dataset.index);
  const text = history[index].text;

  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '已複製';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 1000);
  }).catch(err => {
    console.error('複製失敗:', err);
  });
}

// 刪除項目
function deleteEntry(event) {
  const index = parseInt(event.target.dataset.index);
  sendToBackground({ action: 'removeEntry', index: index }, () => {
    loadHistory();
  });
}

// 清空歷史
clearBtn.addEventListener('click', () => {
  if (confirm('確定要清空所有紀錄嗎？')) {
    sendToBackground({ action: 'clearHistory' }, () => {
      loadHistory();
    });
  }
});

// background 寫入 storage 時自動更新（popup 開著時）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    loadHistory();
  }
});

// 初始化
loadHistory();

// 每分鐘重新整理時間顯示
setInterval(loadHistory, 60000);
