'use strict';

// ─────────────────────────────────────────────
//  History modal
// ─────────────────────────────────────────────
function openHistoryModal() {
  const history = loadHistory();
  const entries = Object.entries(history);

  let html;
  if (!entries.length) {
    html = '<div class="hist-empty">Henüz gönderim kaydı yok.</div>';
  } else {
    const rows = entries
      .sort((a, b) => (b[1].sentAt || '').localeCompare(a[1].sentAt || ''))
      .map(([, e]) => {
        const isArr = e.type === 'GELİŞ';
        const badge = isArr
          ? `<span class="badge badge-arr">↘ GELİŞ</span>`
          : `<span class="badge badge-dep">↗ GİDİŞ</span>`;
        const sentAt = e.sentAt ? new Date(e.sentAt).toLocaleString('tr-TR') : '—';
        const flightDate = e.flightDate ? toHgbDate(e.flightDate) : '—';
        return `<tr>
          <td>${badge}</td>
          <td>${escapeHtml(flightDate)}</td>
          <td><strong>${escapeHtml(e.flightNo || '—')}</strong></td>
          <td>${escapeHtml(e.reg || '—')}</td>
          <td><code style="font-size:11px">${escapeHtml(e.apiId || '—')}</code></td>
          <td style="color:#64748b;font-size:12px">${escapeHtml(sentAt)}</td>
        </tr>`;
      }).join('');

    html = `<table class="hist-table">
      <thead><tr>
        <th>Tip</th><th>Tarih</th><th>Uçuş No</th><th>REG</th><th>API ID</th><th>Gönderim Zamanı</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  document.getElementById('historyModalBody').innerHTML = html;
  document.getElementById('historyOverlay').classList.remove('hidden');
}

function closeHistoryModal() {
  document.getElementById('historyOverlay').classList.add('hidden');
}

function confirmClearHistory() {
  document.getElementById('confirmOverlay').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.add('hidden');
}

function clearHistory() {
  localStorage.removeItem(KEY_HISTORY);
  STATE.rows.forEach(r => {
    if (r._status === 'already_sent') {
      r._status = 'idle';
      r._result = null;
      r._sentAt = null;
    }
  });
  closeConfirm();
  renderTable();
  showGlobalAlert('Gönderim geçmişi temizlendi.', 'info');
}

// ─────────────────────────────────────────────
//  Keyboard shortcuts
// ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); closeErrorModal(); closeResultModal(); closeCancelModal(); closeHistoryModal(); }
  if (e.key === 'Enter' && document.getElementById('loginSection').style.display !== 'none') {
    doLogin();
  }
});

// Close modal on overlay click
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});
document.getElementById('confirmOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('confirmOverlay')) closeConfirm();
});
document.getElementById('errorOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('errorOverlay')) closeErrorModal();
});
document.getElementById('resultOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('resultOverlay')) closeResultModal();
});
document.getElementById('havayoluBeyanOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('havayoluBeyanOverlay')) closeHavayoluBeyanModal();
});
document.getElementById('crewBeyanOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('crewBeyanOverlay')) closeCrewBeyanModal();
});
document.getElementById('cancelOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('cancelOverlay')) closeCancelModal();
});
document.getElementById('historyOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('historyOverlay')) closeHistoryModal();
});

// ─── Drag & drop ───
const dropZone = document.getElementById('tableEmpty');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', e => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.endsWith('.csv')) {
    showGlobalAlert('Lütfen .csv uzantılı bir dosya yükleyin.', 'error');
    return;
  }
  document.getElementById('fileName').textContent = file.name;
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = async ev => {
    try {
      const buf = ev.target.result;
      const utf8 = new TextDecoder('utf-8').decode(buf);
      const csvText = (utf8.includes('GELİŞ') || utf8.includes('GİDİŞ'))
        ? utf8 : new TextDecoder('windows-1254').decode(buf);
      parseCsv(csvText);
      showGlobalAlert('HGBS kayıtları satır tarihlerine göre canlı sorgulanıyor...', 'info');
      await refreshHGBSFlightsForRows();
      syncRowsWithHGBSHistory();
      renderTable();
      showGlobalAlert('CSV yüklendi, satır tarihleri HGBS kayıtlarıyla karşılaştırıldı.', 'info');
    } catch (err) {
      showGlobalAlert('CSV işlenirken hata: ' + err.message, 'error');
    }
  };
});

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────
function init() {
  const token = localStorage.getItem(KEY_TOKEN);
  if (token) {
    STATE.token = token;
    try { STATE.user = JSON.parse(localStorage.getItem(KEY_USER) || '{}'); } catch {}
    showMainScreen();
  } else {
    showLoginScreen();
  }
}

init();
