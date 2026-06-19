'use strict';

// ─────────────────────────────────────────────
//  History
// ─────────────────────────────────────────────
let _cancelPendingIndex = null;

function openCancelModal(index) {
  const row = STATE.rows[index];
  if (!row) return;
  _cancelPendingIndex = index;

  const apiId = row._result?.apiId || getRowHistoryEntry(row)?.apiId || '';

  document.getElementById('cancelModalBody').innerHTML = `
    <div class="modal-row"><span class="lbl">Uçuş No</span><span class="val">${escapeHtml(row.flightNo)}</span></div>
    <div class="modal-row"><span class="lbl">Tarih</span><span class="val">${escapeHtml(toHgbDate(getRowFlightDate(row)))}</span></div>
    <div class="modal-row"><span class="lbl">Tip</span><span class="val">${escapeHtml(row.type)}</span></div>
    <div class="modal-row"><span class="lbl">REG</span><span class="val">${escapeHtml(row.reg)}</span></div>
    <div class="modal-row"><span class="lbl">API ID</span><span class="val"><code>${escapeHtml(apiId || '—')}</code></span></div>
    <div class="modal-row" style="flex-direction:column;gap:6px;align-items:flex-start">
      <span class="lbl">İptal Nedeni</span>
      <input type="text" id="cancelComment" value="hatalı"
        style="width:100%;padding:8px 10px;border:1px solid #fca5a5;border-radius:6px;font-size:13px;outline:none">
    </div>
  `;

  document.getElementById('cancelConfirmBtn').onclick = () => {
    const idx     = _cancelPendingIndex;
    const comment = document.getElementById('cancelComment').value.trim() || 'hatalı';
    closeCancelModal();
    doCancel(idx, apiId, comment);
  };

  document.getElementById('cancelOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('cancelComment')?.focus(), 50);
}

function closeCancelModal() {
  document.getElementById('cancelOverlay').classList.add('hidden');
  _cancelPendingIndex = null;
}

async function doCancel(index, apiId, comment) {
  const row = STATE.rows[index];
  if (!row || !apiId) return;

  row._status = 'sending';
  updateRow(index);

  try {
    if (MOCK_MODE) {
      await delay(400);
    } else {
      await apiCall('POST', '/api/AirBase/StatusActionAgency?api-version=1.0', {
        id: apiId,
        action: 'IPTAL',
        actionComment: comment
      });
    }
    row._status = 'cancelled';
    removeFromHistory(row.id);
  } catch (err) {
    if (!err.message.includes('401')) {
      row._status = 'error';
      row._error  = err.message;
    }
  }

  updateRow(index);
}


async function withdrawSubmittedFlight(index) {
  const row = STATE.rows[index];
  if (!row) return;

  const apiId = getRowApiId(row);
  if (!apiId) {
    alert('Geri çekme için HGBS API ID bulunamadı. Önce HGBS kayıtlarını yenile.');
    return;
  }

  const ok = confirm(`${row.flightNo} uçuşu Gümrüğe Sunuldu durumundan geri çekilecek. Devam edilsin mi?`);
  if (!ok) return;

  row._status = 'sending';
  updateRow(index);

  try {
    if (MOCK_MODE) {
      await delay(400);
    } else {
      await apiCall('POST', '/api/AirBase/StatusActionAgency?api-version=1.0', {
        id: apiId,
        action: 'GERICEKILDI',
        actionComment: 'HATALI'
      });
    }

    showGlobalAlert(`${row.flightNo} geri çekildi.`, 'info');
    await refreshRowsAfterHGBSAction();

  } catch (err) {
    if (!err.message.includes('401')) {
      row._status = 'error';
      row._error  = err.message;
      updateRow(index);
    }
  }
}

function openSuccessModal(index) {
  const row    = STATE.rows[index];
  if (!row) return;
  const apiId  = row._result?.apiId || '';
  const sentAt = row._sentAt ? new Date(row._sentAt).toLocaleString('tr-TR') : new Date().toLocaleString('tr-TR');
  document.getElementById('resultModalHeader').style.background = '#166534';
  document.getElementById('resultModalTitle').textContent = 'Gönderim Başarılı';
  document.getElementById('resultModalBody').innerHTML =
    buildResultBaseHtml(row, apiId, sentAt, true);
  document.getElementById('resultOverlay').classList.remove('hidden');
}

function openSentDetailModal(index) {
  const row    = STATE.rows[index];
  if (!row) return;
  const apiId  = row._result?.apiId || getRowHistoryEntry(row)?.apiId || '';
  const sentAt = row._sentAt ? new Date(row._sentAt).toLocaleString('tr-TR') : '—';
  document.getElementById('resultModalHeader').style.background = '#92400e';
  document.getElementById('resultModalTitle').textContent = 'Daha Önce Gönderildi';
  document.getElementById('resultModalBody').innerHTML =
    buildResultBaseHtml(row, apiId, sentAt, true);
  document.getElementById('resultOverlay').classList.remove('hidden');
}

function buildResultBaseHtml(row, apiId, sentAt, showFetchBtn) {
  const rows = [
    ['Uçuş No',       row.flightNo],
    ['Tarih',         toHgbDate(getRowFlightDate(row))],
    ['Tip',           row.type],
    ['REG',           row.reg],
    ['API ID',        apiId || '—'],
    ['Gönderim Zamanı', sentAt]
  ];
  const baseRows = rows.map(([l, v]) =>
    `<div class="modal-row"><span class="lbl">${escapeHtml(l)}</span><span class="val">${l === 'API ID' ? `<code>${escapeHtml(v)}</code>` : escapeHtml(v)}</span></div>`
  ).join('');

  const fetchBtn = showFetchBtn && apiId
    ? `<div style="padding:12px 0 4px">
         <button class="btn btn-outline" style="width:100%;justify-content:center"
           id="fetchDetailBtn" onclick="fetchFlightDetail('${escapeHtml(apiId)}')">
           🔍 Tüm Detayları Getir
         </button>
       </div>
       <div id="flightDetailContent"></div>`
    : '';

  return baseRows + fetchBtn;
}

let _currentFlightDetail = null;
let _currentFlightBaseId  = null;

async function fetchFlightDetail(baseId) {
  _currentFlightBaseId = baseId;

  const btn     = document.getElementById('fetchDetailBtn');
  const content = document.getElementById('flightDetailContent');

  if (!content) return;

  if (!baseId) {
    content.innerHTML = `
      <div class="alert alert-error" style="margin-top:8px">
        HGBS detay ID bulunamadı. Bu uçuş için baseId yok.
      </div>
    `;
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Yükleniyor...';
  }

  content.innerHTML = '';

  try {
    const data = await apiCall(
      'GET',
      `/api/Flight/GetFlight?baseId=${encodeURIComponent(baseId)}&api-version=1.0`
    );

    const detail = data?.data || data;

    if (!detail) {
      throw new Error('HGBS detay kaydı boş döndü. baseId hatalı olabilir.');
    }

    _currentFlightDetail = detail;
    content.innerHTML = buildFlightDetailHtml(detail);

    if (btn) {
      btn.style.display = 'none';
    }

  } catch (err) {
    _currentFlightDetail = null;

    content.innerHTML = `
      <div class="alert alert-error" style="margin-top:8px">
        ${escapeHtml(err.message)}
      </div>
    `;

    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔍 Tüm Detayları Getir';
    }
  }
}

function buildFlightDetailHtml(d) {
  const v = val => escapeHtml(String(val ?? '—'));
  const rows = [
    ['Durum',           `${d.statusCode} — ${d.statusText}`],
    ['Kayıt No',         d.recordNumber],
    ['Referans No',      d.referenceNumber],
    ['Uçuş Tipi',        d.flightTypeText],
    ['Uçak Tipi',        d.airCraftTypeText],
    ['Gümrük',           d.customText],
    ['Şirket',           d.companyInfo],
    ['Milliyet',         d.nationalityText],
    ['Kalkış',          `${d.departurePortText} (${d.departurePortCode})`],
    ['Varış',           `${d.arrivalPortText} (${d.arrivalPortCode})`],
    ['Kuyruk / REG',     d.tailNumber],
    ['Kaptan',           d.captainNameSurname || '—'],
    ['Crew',             d.crewNumber],
    [d.flightTypeCode === 'GLS' ? 'Geliş ETA' : 'Gidiş ETA',
      d.arrivalDateEtaStr
        ? `${d.arrivalDateEtaStr} ${d.arrivalTimeEta}`
        : d.departureDateEtaStr ? `${d.departureDateEtaStr} ${d.departureTimeEta}` : '—'],
    ['Gerçek Kalkış',   d.departureDateStr ? `${d.departureDateStr} ${d.departureTime}` : '—'],
    ['Gerçek Varış',    d.arrivalDateStr    ? `${d.arrivalDateStr}   ${d.arrivalTime}`   : '—'],
    ['Mükellef',         d.declarant],
    ['Yetkili',          d.authAgentNameSurname],
    ['Oluşturma Tarihi', d.createDateStr]
  ];

  const isIptal = (d.statusCode || '').toLowerCase().includes('iptal');

  return `
    <div style="border-top:2px solid #e2e8f0;margin-top:8px;padding-top:8px">
      ${rows.map(([l, val]) => {
        const isStatus = l === 'Durum';
        const valStyle = isStatus && isIptal ? ' style="color:#dc2626;font-weight:700"' : '';
        return `<div class="modal-row"><span class="lbl">${escapeHtml(l)}</span><span class="val"${valStyle}>${v(val)}</span></div>`;
      }).join('')}

      ${isIptal ? '' : `
        <div style="padding:14px 0 4px;display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary" style="width:100%;justify-content:center;background:#1e3a5f;border-color:#1e3a5f"
            onclick="openHavayoluBeyanModal()">
            ✈️ Hava Yolu Beyan Formu
          </button>

          <button class="btn btn-success" style="width:100%;justify-content:center"
            onclick="openCrewBeyanModal()">
            👥 Ekip Beyan Formu
          </button>
		  <button class="btn btn-outline" style="width:100%;justify-content:center"
			onclick="openFlightEditModal()">
			✏️ Uçuşu Düzenle
		</button>
        </div>
      `}
    </div>`;
}

function closeResultModal() {
  document.getElementById('resultOverlay').classList.add('hidden');
}

// ── Uçuş Düzenleme Modalı ──────────────────────────────────────

function hgsbDateToInput(dateVal, dateStr) {
  if (dateVal) {
    const m = String(dateVal).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }

  if (dateStr) {
    const m = String(dateStr).match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }

  return todayStr();
}

function hgsbTimeToInput(timeVal) {
  return normalizeCsvTimeForInput(timeVal || '');
}

function openFlightEditModal() {
  const d = _currentFlightDetail;

  if (!d) {
    alert('Önce uçuş detayını getir.');
    return;
  }

  document.getElementById('resultModalTitle').textContent = 'Uçuşu Düzenle';
  document.getElementById('resultModalBody').innerHTML = buildFlightEditHtml(d);
}

function buildFlightEditHtml(d) {
  const depDate = hgsbDateToInput(d.departureDate, d.departureDateStr);
  const arrDate = hgsbDateToInput(d.arrivalDate, d.arrivalDateStr);

  const depEtaDate = hgsbDateToInput(d.departureDateEta, d.departureDateEtaStr);
  const arrEtaDate = hgsbDateToInput(d.arrivalDateEta, d.arrivalDateEtaStr);

  const isArrival = d.flightTypeCode === 'GLS';
  const isDeparture = d.flightTypeCode === 'GDS';

  return `
    <div class="alert alert-warning" style="margin-bottom:12px">
      Bu ekran HGBS'deki mevcut uçuş kaydını düzenler. Yanlış bilgi girersen canlı kayıt değişir.
    </div>

    <div class="modal-summary" style="margin-bottom:14px">
      <div class="summary-item">
        <span>Kayıt No</span>
        <strong>${escapeHtml(d.recordNumber || '—')}</strong>
      </div>
      <div class="summary-item">
        <span>Durum</span>
        <strong>${escapeHtml((d.statusCode || '') + ' — ' + (d.statusText || ''))}</strong>
      </div>
      <div class="summary-item">
        <span>Base ID</span>
        <strong>${escapeHtml(d.baseId || '—')}</strong>
      </div>
      <div class="summary-item">
        <span>Tip</span>
        <strong>${escapeHtml(d.flightTypeText || d.flightTypeCode || '—')}</strong>
      </div>
    </div>

    <div class="modal-grid">

      <div class="modal-field">
        <label>Uçuş No</label>
        <input type="text" id="editFlightNumber" value="${escapeHtml(d.flightNumber || '')}">
      </div>

      <div class="modal-field">
        <label>Havayolu Kodu</label>
        <input type="text" id="editCompanyCode" value="${escapeHtml(d.companyCode || '')}">
      </div>

      <div class="modal-field">
        <label>REG / Kuyruk</label>
        <input type="text" id="editTailNumber" value="${escapeHtml(d.tailNumber || '')}">
      </div>

      <div class="modal-field">
        <label>HGSB Uçak Tipi</label>
        <input type="text" id="editAircraftType" list="editAircraftTypeOptions" autocomplete="off"
          value="${escapeHtml(normalizeAircraftTypeValue(d.airCraftTypeCode) || d.airCraftTypeCode || '')}"
          onchange="normalizeFlightEditAircraftType()">
        ${buildAircraftTypeDatalistHtml('editAircraftTypeOptions')}
      </div>

      <div class="modal-field">
        <label>Kaptan</label>
        <input type="text" id="editCaptainName" value="${escapeHtml(d.captainNameSurname || '')}">
      </div>

      <div class="modal-field">
        <label>Crew Sayısı</label>
        <input type="number" id="editCrewNumber" min="0" step="1" value="${escapeHtml(d.crewNumber ?? 0)}">
      </div>

      <div class="modal-field">
        <label>Kalkış Station</label>
        <input type="text" id="editDeparturePort" value="${escapeHtml(d.departurePortCode || '')}">
      </div>

      <div class="modal-field">
        <label>Varış Station</label>
        <input type="text" id="editArrivalPort" value="${escapeHtml(d.arrivalPortCode || '')}">
      </div>

      <div class="modal-field">
        <label>Gerçek Kalkış Tarihi</label>
        <input type="date" id="editDepartureDate" value="${escapeHtml(depDate)}">
      </div>

      <div class="modal-field">
        <label>Gerçek Kalkış Saati</label>
        <input type="time" id="editDepartureTime" step="60" value="${escapeHtml(hgsbTimeToInput(d.departureTime))}">
      </div>

      <div class="modal-field">
        <label>Gerçek Varış Tarihi</label>
        <input type="date" id="editArrivalDate" value="${escapeHtml(arrDate)}">
      </div>

      <div class="modal-field">
        <label>Gerçek Varış Saati</label>
        <input type="time" id="editArrivalTime" step="60" value="${escapeHtml(hgsbTimeToInput(d.arrivalTime))}">
      </div>

      ${isArrival ? `
        <div class="modal-field">
          <label>Geliş ETA Tarihi</label>
          <input type="date" id="editArrivalEtaDate" value="${escapeHtml(arrEtaDate)}">
        </div>

        <div class="modal-field">
          <label>Geliş ETA Saati</label>
          <input type="time" id="editArrivalEtaTime" step="60" value="${escapeHtml(hgsbTimeToInput(d.arrivalTimeEta))}">
        </div>
      ` : ''}

      ${isDeparture ? `
        <div class="modal-field">
          <label>Gidiş ETA Tarihi</label>
          <input type="date" id="editDepartureEtaDate" value="${escapeHtml(depEtaDate)}">
        </div>

        <div class="modal-field">
          <label>Gidiş ETA Saati</label>
          <input type="time" id="editDepartureEtaTime" step="60" value="${escapeHtml(hgsbTimeToInput(d.departureTimeEta))}">
        </div>
      ` : ''}

    </div>

    <div id="flightEditStatus" class="modal-status-line"></div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-secondary" onclick="cancelFlightEdit()">
        Vazgeç
      </button>
      <button class="btn btn-primary" id="flightEditSaveBtn" onclick="submitFlightEdit()">
        Güncelle
      </button>
    </div>
  `;
}

function cancelFlightEdit() {
  const d = _currentFlightDetail;

  document.getElementById('resultModalTitle').textContent = 'Detay';

  if (d) {
    document.getElementById('resultModalBody').innerHTML = buildFlightDetailHtml(d);
  }
}

function setFlightEditStatus(type, msg) {
  const el = document.getElementById('flightEditStatus');
  if (!el) return;

  el.className = `modal-status-line show ${type}`;
  el.textContent = msg;
}

function getFlightEditVal(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function normalizeFlightEditAircraftType() {
  const el = document.getElementById('editAircraftType');
  if (!el) return;

  const normalized = normalizeAircraftTypeValue(el.value);
  if (normalized) el.value = normalized;
}

function buildFlightEditPayload() {
  const d = _currentFlightDetail;
  if (!d) throw new Error('Uçuş detayı bulunamadı.');

  const flightTypeCode = d.flightTypeCode;

  const flightNumber = getFlightEditVal('editFlightNumber').toUpperCase().replace(/\s+/g, '');
  const companyCode  = getFlightEditVal('editCompanyCode').toUpperCase().replace(/\s+/g, '');
  const tailNumber   = getFlightEditVal('editTailNumber').toUpperCase().replace(/\s+/g, '');
  const rawAircraftType = getFlightEditVal('editAircraftType');
  const aircraftType = normalizeAircraftTypeValue(rawAircraftType) || rawAircraftType.toUpperCase().replace(/\s+/g, '');

  const captainName  = getFlightEditVal('editCaptainName').toUpperCase();
  const crewNumber   = parseInt(getFlightEditVal('editCrewNumber'), 10);

  const departurePort = getFlightEditVal('editDeparturePort').toUpperCase().replace(/\s+/g, '');
  const arrivalPort   = getFlightEditVal('editArrivalPort').toUpperCase().replace(/\s+/g, '');

  const departureDate = getFlightEditVal('editDepartureDate');
  const departureTime = getFlightEditVal('editDepartureTime');
  const arrivalDate   = getFlightEditVal('editArrivalDate');
  const arrivalTime   = getFlightEditVal('editArrivalTime');

  if (!flightNumber) throw new Error('Uçuş no boş olamaz.');
  if (!companyCode) throw new Error('Havayolu kodu boş olamaz.');
  if (!tailNumber) throw new Error('REG / kuyruk boş olamaz.');
  if (!aircraftType) throw new Error('HGSB uçak tipi boş olamaz.');
  if (!departurePort) throw new Error('Kalkış station boş olamaz.');
  if (!arrivalPort) throw new Error('Varış station boş olamaz.');
  if (Number.isNaN(crewNumber) || crewNumber < 0) throw new Error('Crew sayısı geçersiz.');
  if (!departureDate || !departureTime) throw new Error('Gerçek kalkış tarihi/saati boş olamaz.');
  if (!arrivalDate || !arrivalTime) throw new Error('Gerçek varış tarihi/saati boş olamaz.');

  const payload = {
    ...d,

    flightTypeCode,
    customCode: d.customCode || '070200',

    authAgentNameSurname: STATE.user.userName || d.authAgentNameSurname || '',
    declarant: STATE.user.taxFirmName || d.declarant || '',

    companyCode,
    airCraftTypeCode: aircraftType,
    tailNumber,
    flightNumber,
    nationalityCode: getNationalityCode(tailNumber),

    captainNameSurname: captainName,
    crewNumber,

    departurePortCode: departurePort,
    arrivalPortCode: arrivalPort,

    departureDate: toHgsbIso(departureDate, departureTime),
    departureDateStr: toHgsbDisplayDate(departureDate),
    departureTime,

    arrivalDate: toHgsbIso(arrivalDate, arrivalTime),
    arrivalDateStr: toHgsbDisplayDate(arrivalDate),
    arrivalTime,

    varisCikisBildirimNo: d.varisCikisBildirimNo ?? null,
    isAutoConfirmVBCB: false,
    isPlaneContinueAbroad: !!d.isPlaneContinueAbroad,

    id: d.id || '',
    baseId: d.baseId || ''
  };

  if (!payload.id || !payload.baseId) {
    throw new Error('Update için id/baseId eksik. Önce Tüm Detayları Getir ile tam detay çekilmeli.');
  }

  if (flightTypeCode === 'GLS') {
    const arrEtaDate = getFlightEditVal('editArrivalEtaDate');
    const arrEtaTime = getFlightEditVal('editArrivalEtaTime');

    if (!arrEtaDate || !arrEtaTime) {
      throw new Error('Geliş ETA tarihi/saati boş olamaz.');
    }

    payload.arrivalDateEta    = toHgsbIso(arrEtaDate, arrEtaTime);
    payload.arrivalDateEtaStr = toHgsbDisplayDate(arrEtaDate);
    payload.arrivalTimeEta    = arrEtaTime;

    payload.departureDateEta    = null;
    payload.departureDateEtaStr = '';
    payload.departureTimeEta    = '';

  } else if (flightTypeCode === 'GDS') {
    const depEtaDate = getFlightEditVal('editDepartureEtaDate');
    const depEtaTime = getFlightEditVal('editDepartureEtaTime');

    if (!depEtaDate || !depEtaTime) {
      throw new Error('Gidiş ETA tarihi/saati boş olamaz.');
    }

    payload.departureDateEta    = toHgsbIso(depEtaDate, depEtaTime);
    payload.departureDateEtaStr = toHgsbDisplayDate(depEtaDate);
    payload.departureTimeEta    = depEtaTime;

    payload.arrivalDateEta    = null;
    payload.arrivalDateEtaStr = '';
    payload.arrivalTimeEta    = '';
  }

  return payload;
}

async function submitFlightEdit() {
  const btn = document.getElementById('flightEditSaveBtn');

  try {
    const payload = buildFlightEditPayload();

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Güncelleniyor...';
    }

    setFlightEditStatus('info', 'HGSB kaydı güncelleniyor...');

    const res = await apiCall(
      'PUT',
      '/api/Flight/SetFlight?api-version=1.0',
      payload
    );

    const updated = res?.data || res;

    _currentFlightDetail = updated;
    _currentFlightBaseId = updated.baseId || payload.baseId;

    setFlightEditStatus('success', 'Uçuş başarıyla güncellendi.');

    document.getElementById('resultModalTitle').textContent = 'Detay';
    document.getElementById('resultModalBody').innerHTML = buildFlightDetailHtml(updated);

    await refreshHGBSFlightsForRows();

    if (typeof syncRowsWithHGBSHistory === 'function') {
      syncRowsWithHGBSHistory();
    }

    if (STATE.rows.length) {
      renderTable();
    }

  } catch (err) {
    setFlightEditStatus('error', err.message);

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Güncelle';
    }
  }
}
