'use strict';

// ─────────────────────────────────────────────
//  Toolbar init
// ─────────────────────────────────────────────
function initToolbar() {
  const crewInput = document.getElementById('crewInput');
  if (crewInput) crewInput.value = STATE.crewNumber;

  STATE.flightDate = todayStr();
}

function onCrewChange(val) {
  const n = parseInt(val, 10);
  if (!Number.isNaN(n) && n >= 0) STATE.crewNumber = n;
}

async function onRowDateChange(index, val) {
  const row = STATE.rows[index];
  if (!row || !val) return;

  row.flightDate = normalizeFlightDate(val, todayStr());
  row.id = getRowId(row);
  resetRowSubmissionState(row);
  updateRow(index);

  try {
    showGlobalAlert(`${toHgbDate(row.flightDate)} için HGBS kayıtları sorgulanıyor...`, 'info');
    await refreshHGBSFlightsForDate(row.flightDate);
    syncRowsWithHGBSHistory();
    renderTable();
  } catch (err) {
    showGlobalAlert('Satır tarihi değişti ama HGBS sorgusu başarısız: ' + err.message, 'error');
  }
}

async function onRowFlightNoChange(index, val) {
  const row = STATE.rows[index];
  if (!row) return;

  const nextFlightNo = normalizeFlightNo(val);
  if (!nextFlightNo) {
    renderTable();
    showGlobalAlert('Uçuş no boş bırakılamaz.', 'error');
    return;
  }

  row.flightNo = nextFlightNo;
  row.flightDate = getRowFlightDate(row);
  row.id = getRowId(row);
  resetRowSubmissionState(row);
  updateRow(index);

  try {
    showGlobalAlert(`${toHgbDate(row.flightDate)} tarihli ${row.flightNo} HGBS kayıtları sorgulanıyor...`, 'info');
    await refreshHGBSFlightsForDate(row.flightDate);
    syncRowsWithHGBSHistory();
    renderTable();
  } catch (err) {
    showGlobalAlert('Uçuş no değişti ama HGBS sorgusu başarısız: ' + err.message, 'error');
  }
}

async function onRowRegChange(index, val) {
  const row = STATE.rows[index];
  if (!row) return;

  const nextReg = String(val ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!nextReg) {
    renderTable();
    showGlobalAlert('Kuyruk numarası boş bırakılamaz.', 'error');
    return;
  }

  row.reg = nextReg;
  row.flightDate = getRowFlightDate(row);
  row.id = getRowId(row);
  resetRowSubmissionState(row);
  updateRow(index);

  try {
    showGlobalAlert(`${toHgbDate(row.flightDate)} tarihli ${row.reg} HGBS kayıtları sorgulanıyor...`, 'info');
    await refreshHGBSFlightsForDate(row.flightDate);
    syncRowsWithHGBSHistory();
    renderTable();
  } catch (err) {
    showGlobalAlert('Kuyruk numarası değişti ama HGBS sorgusu başarısız: ' + err.message, 'error');
  }
}

// ─────────────────────────────────────────────
//  Table rendering
// ─────────────────────────────────────────────
function renderTable() {
  const empty     = document.getElementById('tableEmpty');
  const container = document.getElementById('tableContainer');
  const tbody     = document.getElementById('tableBody');

  if (!STATE.rows.length) {
    empty.style.display     = 'block';
    container.style.display = 'none';
    return;
  }

  empty.style.display     = 'none';
  container.style.display = 'block';
  tbody.innerHTML = '';
  STATE.rows.forEach((row, i) => tbody.appendChild(buildRow(row, i)));
  applySearch();
}

function buildRow(row, index) {
  const tr = document.createElement('tr');
  tr.id = `row-${index}`;
  tr.className = row.type === 'GELİŞ' ? 'row-arrival' : 'row-departure';

  const isArr = row.type === 'GELİŞ';

  tr.innerHTML = `
    <td><span class="badge ${isArr ? 'badge-arr' : 'badge-dep'}">${isArr ? '↘ GELİŞ' : '↗ GİDİŞ'}</span></td>
    <td>${escapeHtml(row.ac)}</td>
    <td>
      <input class="row-input row-date-input" type="date"
        value="${escapeHtml(getRowFlightDate(row))}"
        onchange="onRowDateChange(${index}, this.value)">
    </td>
    <td>
      <input class="row-input row-flight-input" type="text"
        value="${escapeHtml(row.flightNo)}"
        oninput="this.value=this.value.toUpperCase()"
        onchange="onRowFlightNoChange(${index}, this.value)"
        onkeydown="if(event.key==='Enter') this.blur()">
    </td>
    <td>${escapeHtml(row.departureAirport)}</td>
    <td>${escapeHtml(row.arrivalAirport)}</td>
    <td>${escapeHtml(row.time)}</td>
    <td>${escapeHtml(row.hgsbAircraftType)}</td>
    <td>
      <input class="row-input row-reg-input" type="text"
        value="${escapeHtml(row.reg)}"
        oninput="this.value=this.value.toUpperCase().replace(/\\s+/g,'')"
        onchange="onRowRegChange(${index}, this.value)"
        onkeydown="if(event.key==='Enter') this.blur()">
    </td>
    <td id="status-${index}">${renderStatus(row, index)}</td>
    <td class="action-cell" id="action-${index}">${renderAction(row, index)}</td>
  `;

  return tr;
}

function renderStatus(row, index) {
  switch (row._status) {
    case 'idle':
      return '<span class="status-badge status-idle">⚪ Bekliyor</span>';
    case 'sending':
      return '<span class="status-badge status-sending"><span class="spinner"></span> Gönderiliyor</span>';
    case 'success':
      return `<button class="status-link status-link-success" onclick="openSuccessModal(${index})">✅ Başarılı</button>`;
    case 'already_sent':
      return `<button class="status-link status-link-already" onclick="openSentDetailModal(${index})">⚠️ ${escapeHtml(renderHGBSSentLabel(row))}</button>`;
    case 'cancelled':
      return '<span class="status-badge status-cancelled">🚫 İptal Edildi</span>';
    case 'error':
      return `<button class="error-link" onclick="openErrorModal(${index})">❌ Hata</button>`;
    default:
      return '';
  }
}

function renderAction(row, index) {
  const isArr = row.type === 'GELİŞ';
  const icon  = isArr ? '↘' : '↗';
  const typeClass = isArr ? 'send-btn-arr' : 'send-btn-dep';
  const typeLabel = isArr ? 'Geliş Ekle' : 'Gidiş Ekle';

  if (row._status === 'sending') {
    return `<button class="send-btn send-btn-done" disabled><span class="spinner"></span> İşleniyor…</button>`;
  }

  if (row._status === 'already_sent') {
    if (isDraftFlight(row)) {
      return `<button class="send-btn ${typeClass}" onclick="openDeclareHavayoluBeyanModal(${index})">✈️ Beyan Et</button>
              <button class="cancel-btn" onclick="openCancelModal(${index})">✕ İptal</button>`;
    }

    if (isWithdrawnFlight(row)) {
      return `<button class="send-btn ${typeClass}" onclick="openDeclareHavayoluBeyanModal(${index})">✈️ Tekrar Beyan Et</button>`;
    }

    if (isSubmittedToCustomsFlight(row)) {
      return `<button class="resend-btn" onclick="withdrawSubmittedFlight(${index})">↩ Geri Çek</button>`;
    }

    return `<button class="send-btn send-btn-done" disabled>${icon} ${escapeHtml(renderHGBSSentLabel(row))}</button>
            <button class="cancel-btn" onclick="openCancelModal(${index})">✕ İptal</button>`;
  }

  if (row._status === 'success') {
    return `<button class="send-btn ${typeClass}" onclick="openModal(${index}, false)">${icon} Tekrar Ekle</button>
            <button class="cancel-btn" onclick="openCancelModal(${index})">✕ İptal</button>`;
  }

  if (row._status === 'cancelled') {
    return `<button class="send-btn send-btn-done" disabled>🚫 İptal Edildi</button>`;
  }

  return `<button class="send-btn ${typeClass}" onclick="openModal(${index}, false)">${icon} ${typeLabel}</button>`;
}

function updateRow(index) {
  const row = STATE.rows[index];
  const statusEl = document.getElementById(`status-${index}`);
  const actionEl = document.getElementById(`action-${index}`);
  if (statusEl) statusEl.innerHTML = renderStatus(row, index);
  if (actionEl) actionEl.innerHTML = renderAction(row, index);
}

// ─────────────────────────────────────────────
//  Search
// ─────────────────────────────────────────────
let _searchQuery = '';

function onSearch(val) {
  _searchQuery = val.trim().toLowerCase();
  applySearch();
}

function applySearch() {
  const q = _searchQuery;
  document.querySelectorAll('#tableBody tr').forEach((tr, i) => {
    if (!q) { tr.style.display = ''; return; }
    const row = STATE.rows[i];
    if (!row) return;
    const haystack = [
      row.type, row.ac, getRowFlightDate(row), row.flightNo,
      row.departureAirport, row.arrivalAirport, row.time,
      row.hgsbAircraftType, row.reg,
      row._status, row._error, row._result?.apiId
    ].join(' ').toLowerCase();
    tr.style.display = haystack.includes(q) ? '' : 'none';
  });
}
