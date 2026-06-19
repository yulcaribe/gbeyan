'use strict';

// ─────────────────────────────────────────────
//  Crew Declaration / Gendec PDF Parser
// ─────────────────────────────────────────────

const CREW_SET_ENDPOINT = '/api/Flight/SetCrews?api-version=1.0';

function CREW_GET_ENDPOINT(baseId) {
  return `/api/Flight/GetCrews?baseId=${encodeURIComponent(baseId)}&api-version=1.0`;
}

function CREW_DELETE_ENDPOINT(id, baseId) {
  return `/api/Flight/DeleteCrew?id=${encodeURIComponent(id)}&baseId=${encodeURIComponent(baseId)}&api-version=1.0`;
}

let _crewPdfFile = null;
let _crewParsedList = [];
let _crewExistingList = [];

function resetCrewModalBody() {
  const body = document.getElementById('crewModalBody');
  if (!body) {
    console.warn('crewModalBody bulunamadı.');
    return;
  }

  body.innerHTML = `
    <div class="alert alert-info">
      Gendec PDF / Excel yükleyebilir veya dosya yüklemeden manuel ekip girebilirsin.
      Daha önce girilmiş ekip varsa <strong>Ekip Sorgula</strong> ile görebilirsin.
    </div>

    <div class="crew-upload-row" id="crewInputArea">
      <div class="modal-field crew-upload-field">
        <label for="crewPdfInput">Gendec PDF / Excel</label>
        <input type="file" id="crewPdfInput"
          accept="application/pdf,.pdf,.xlsx,.xls"
          onchange="handleCrewFileSelect(event)">
      </div>

      <button type="button" class="btn btn-secondary crew-manual-btn" onclick="crewAddEmptyRow()">
        + Manuel Ekip Ekle
      </button>

      <button type="button" class="btn btn-outline crew-query-btn" onclick="queryExistingCrews()">
        🔍 Ekip Sorgula
      </button>
    </div>

    <div id="crewStatusLine" class="modal-status-line"></div>

    <div id="crewExistingBox" style="display:none;margin-top:12px">
      <div class="crew-section-title">Sistemde Kayıtlı Ekipler</div>
      <div id="crewExistingBody"></div>
    </div>

    <div id="crewPreviewBox" style="display:none;margin-top:12px">
      <div class="crew-section-title">Okunan Ekip Listesi</div>
      <div id="crewPreviewBody"></div>
    </div>
  `;
}

function getCrewSubmitBtn() {
  return document.getElementById('crewSubmitBtn');
}

function setCrewSubmitDisabled(disabled) {
  const btn = getCrewSubmitBtn();
  if (btn) btn.disabled = disabled;
}

function resetCrewSubmitButton() {
  const btn = getCrewSubmitBtn();

  if (!btn) {
    console.warn('crewSubmitBtn bulunamadı. HTML footer kontrol edilmeli.');
    return;
  }

  btn.style.display = '';
  btn.disabled = true;
  btn.textContent = 'Onayla ve Gönder';
}

function hideCrewSubmitButton() {
  const btn = getCrewSubmitBtn();
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'Onayla ve Gönder';
  btn.style.display = 'none';
}

function showCrewSubmitButton() {
  const btn = getCrewSubmitBtn();
  if (!btn) return;

  btn.style.display = '';
}

function openCrewBeyanModal() {
  if (!_currentFlightBaseId || !_currentFlightDetail) {
    alert('Önce uçuş detayını getirmen gerekiyor.');
    return;
  }

  ensureCrewStyles();

  const overlay = document.getElementById('crewBeyanOverlay');
  if (!overlay) {
    alert('Ekip Beyan modalı bulunamadı: crewBeyanOverlay eksik.');
    return;
  }

  const d = _currentFlightDetail;

  const subtitle = [
    d.flightNumber,
    d.tailNumber,
    d.departurePortCode + ' → ' + d.arrivalPortCode,
    d.statusCode + ' - ' + d.statusText
  ].filter(Boolean).join(' · ');

  const subtitleEl = document.getElementById('crewModalSubtitle');
  if (subtitleEl) subtitleEl.textContent = subtitle;

  _crewPdfFile = null;
  _crewParsedList = [];
  _crewExistingList = [];

  resetCrewModalBody();
  resetCrewSubmitButton();
  setCrewStatus('', '');

  overlay.classList.remove('hidden');
}

function closeCrewBeyanModal() {
  const overlay = document.getElementById('crewBeyanOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function setCrewStatus(type, message) {
  const el = document.getElementById('crewStatusLine');
  if (!el) return;

  el.className = 'modal-status-line';

  if (!type || !message) {
    el.textContent = '';
    return;
  }

  el.classList.add('show', type);
  el.textContent = message;
}

// ─────────────────────────────────────────────
//  CSS
// ─────────────────────────────────────────────

function ensureCrewStyles() {
  if (document.getElementById('crewDecStyles')) return;

  const style = document.createElement('style');
  style.id = 'crewDecStyles';
  style.textContent = `
    .crew-upload-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 12px;
    }

    .crew-upload-field input {
      width: 100%;
    }

    .crew-query-btn,
    .crew-manual-btn {
      height: 36px;
      justify-content: center;
      white-space: nowrap;
    }

    .crew-section-title {
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .crew-card-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .crew-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
    }

    .crew-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .crew-card-title {
      font-size: 12px;
      font-weight: 800;
      color: #166534;
    }

    .crew-card-sub {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    .crew-card-grid {
      display: grid;
      grid-template-columns: minmax(145px, 1.2fr) minmax(120px, 1fr) minmax(120px, 1fr) 74px auto;
      gap: 8px;
      align-items: end;
    }

    .crew-existing-grid {
      display: grid;
      grid-template-columns: minmax(140px, 1.2fr) minmax(120px, 1fr) minmax(120px, 1fr) 80px auto;
      gap: 8px;
      align-items: center;
    }

    .crew-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .crew-field label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }

    .crew-field input,
    .crew-field select {
      width: 100%;
      min-width: 0;
      padding: 7px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 12px;
      color: #1e293b;
      background: #fff;
      outline: none;
    }

    .crew-field input:focus,
    .crew-field select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,.12);
    }

    .crew-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      align-items: end;
    }

    .crew-small-note {
      margin-top: 10px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.4;
    }

    .crew-payload-box {
      margin-top: 12px;
      background: #0f172a;
      color: #94a3b8;
      padding: 10px;
      border-radius: 8px;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow: auto;
    }

    @media (max-width: 720px) {
      .crew-upload-row {
        grid-template-columns: 1fr;
      }

      .crew-query-btn,
      .crew-manual-btn {
        width: 100%;
      }

      .crew-card-grid,
      .crew-existing-grid {
        grid-template-columns: 1fr 1fr;
      }

      .crew-actions {
        grid-column: 1 / -1;
      }

      .crew-actions .btn {
        width: 100%;
        justify-content: center;
      }
    }

    @media (max-width: 460px) {
      .crew-card-grid,
      .crew-existing-grid {
        grid-template-columns: 1fr;
      }

      .crew-card-head {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `;

  document.head.appendChild(style);
}

// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Önizleme kartları
// ─────────────────────────────────────────────

function renderCrewPreview() {
  const box = document.getElementById('crewPreviewBox');
  const body = document.getElementById('crewPreviewBody');

  box.style.display = 'block';

  if (!_crewParsedList.length) {
    body.innerHTML = `
      <div style="color:#64748b">
        Henüz ekip yok.
      </div>
      <button class="btn btn-secondary" style="margin-top:10px" onclick="crewAddEmptyRow()">
        + Manuel Ekip Ekle
      </button>
    `;
    return;
  }

  body.innerHTML = `
    ${buildNationalityDatalistHtml('crewNationalityOptions')}

    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <div style="font-size:13px;color:#334155">
        <strong>${_crewParsedList.length}</strong> ekip bulundu. Göndermeden önce kontrol et.
      </div>
      <button class="btn btn-secondary" style="padding:6px 10px" onclick="crewAddEmptyRow()">
        + Manuel Ekip Ekle
      </button>
    </div>

    <div class="crew-card-list">
      ${_crewParsedList.map((crew, i) => buildCrewPreviewCard(crew, i)).join('')}
    </div>

    <div class="crew-small-note">
      Not: PDF içinde <strong>SCCM</strong> varsa HGSB'ye <strong>CM / KABİN AMİRİ</strong> gider.
      <strong>CCM, CCM1, CCM2, ACM</strong> varsa HGSB'ye <strong>CA / KABİN GÖREVLİSİ</strong> gider.
    </div>
  `;
}

function buildCrewPreviewCard(crew, i) {
  return `
    <div class="crew-card">
      <div class="crew-card-head">
        <div>
          <div class="crew-card-title">#${i + 1} Ekip</div>
          <div class="crew-card-sub">
            Kaynak: ${escapeHtml(crew.sourceTypeCode || 'PDF')} → ${escapeHtml(crew.crewTypeCode || '')}
          </div>
        </div>
      </div>

      <div class="crew-card-grid">
        <div class="crew-field">
          <label>Görev</label>
          <select onchange="crewUpdateRow(${i}, 'crewTypeCode', this.value)">
            ${buildCrewTypeOptions(crew.crewTypeCode)}
          </select>
        </div>

        <div class="crew-field">
          <label>Ad</label>
          <input value="${escapeHtml(crew.name || '')}" oninput="crewUpdateRow(${i}, 'name', this.value)">
        </div>

        <div class="crew-field">
          <label>Soyad</label>
          <input value="${escapeHtml(crew.surname || '')}" oninput="crewUpdateRow(${i}, 'surname', this.value)">
        </div>

        <div class="crew-field">
          <label>Milliyet</label>
          <input list="crewNationalityOptions" value="${escapeHtml(crew.nationalityCode || '')}" autocomplete="off" oninput="crewUpdateRow(${i}, 'nationalityCode', this.value)">
        </div>

        <div class="crew-field">
          <label>Doğum Tarihi</label>
          <input type="date" value="${escapeHtml(normalizeCrewExcelDate(crew.dateOfBirth || ''))}" oninput="crewUpdateRow(${i}, 'dateOfBirth', this.value)">
        </div>

        <div class="crew-field">
          <label>Belge Tipi</label>
          <input value="${escapeHtml(crew.identityCode || '')}" maxlength="5" oninput="crewUpdateRow(${i}, 'identityCode', this.value)">
        </div>

        <div class="crew-field">
          <label>Belge No</label>
          <input value="${escapeHtml(crew.identityNumber || '')}" oninput="crewUpdateRow(${i}, 'identityNumber', this.value)">
        </div>

        <div class="crew-actions">
          <button class="btn btn-danger" style="padding:7px 10px;font-size:11px" onclick="crewDeleteRow(${i})">
            Listeden Sil
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildCrewTypeOptions(selected) {
  return Object.entries(CREW_TYPE_LABELS).map(([value, label]) => {
    const sel = value === selected ? 'selected' : '';
    return `<option value="${escapeHtml(value)}" ${sel}>${escapeHtml(value + ' - ' + label)}</option>`;
  }).join('');
}

function crewUpdateRow(index, key, value) {
  if (!_crewParsedList[index]) return;

  if (key === 'crewTypeCode') {
    _crewParsedList[index][key] = normalizeCrewExcelType(value);
    return;
  }

  if (key === 'nationalityCode') {
    _crewParsedList[index][key] = normalizeNationality(value);
    return;
  }

  if (key === 'dateOfBirth') {
    _crewParsedList[index][key] = normalizeCrewExcelDate(value);
    return;
  }

  if (key === 'identityCode') {
    _crewParsedList[index][key] = normalizeCode(value);
    return;
  }

  if (key === 'identityNumber') {
    _crewParsedList[index][key] = normalizeIdentityNumber(value);
    return;
  }

  _crewParsedList[index][key] = normalizePersonName(value);
}

function crewDeleteRow(index) {
  _crewParsedList.splice(index, 1);
  renderCrewPreview();
  document.getElementById('crewSubmitBtn').disabled = !_crewParsedList.length;
}

function crewAddEmptyRow() {
  showCrewSubmitButton();

  _crewParsedList.push({
    orderNo: String(_crewParsedList.length + 1),
    sourceTypeCode: 'MANUEL',
    crewTypeCode: 'CA',
    name: '',
    surname: '',
    nationalityCode: '',
    dateOfBirth: '',
    identityCode: '',
    identityNumber: ''
  });

  renderCrewPreview();
  document.getElementById('crewSubmitBtn').disabled = false;
}

// ─────────────────────────────────────────────
//  Sistemde kayıtlı ekip sorgula / sil
// ─────────────────────────────────────────────

async function queryExistingCrews() {
  if (!_currentFlightBaseId) {
    setCrewStatus('error', 'Uçuş baseId bulunamadı. Önce uçuş detayını getir.');
    return;
  }

  const box = document.getElementById('crewExistingBox');
  const body = document.getElementById('crewExistingBody');

  box.style.display = 'block';
  body.innerHTML = `<div style="padding:12px;color:#64748b">Sistemdeki ekipler sorgulanıyor...</div>`;
  setCrewStatus('info', 'Ekip sorgulanıyor...');

  try {
    const res = await apiCall('GET', CREW_GET_ENDPOINT(_currentFlightBaseId));
    const list = normalizeApiCrewList(res);

    _crewExistingList = list;

    renderExistingCrews(list);

    if (list.length) {
      setCrewStatus('success', `${list.length} kayıtlı ekip bulundu.`);
    } else {
      setCrewStatus('info', 'Bu uçuş için sistemde kayıtlı ekip bulunamadı.');
    }

  } catch (err) {
    console.error(err);
    body.innerHTML = `
      <div class="alert alert-warning" style="margin:0">
        Ekip sorgulama endpoint'i farklı olabilir. Network'ten kayıtlı ekipleri çeken GET request URL'i lazım.
        <br><br>
        Denenen endpoint:
        <br>
        <code>${escapeHtml(CREW_GET_ENDPOINT(_currentFlightBaseId))}</code>
      </div>
    `;
    setCrewStatus('error', 'Ekip sorgulanamadı: ' + err.message);
  }
}

function normalizeApiCrewList(res) {
  if (!res) return [];

  if (Array.isArray(res.data)) return res.data;

  if (res.data && Array.isArray(res.data.crews)) return res.data.crews;

  if (res.data && Array.isArray(res.data.crewList)) return res.data.crewList;

  if (Array.isArray(res.crews)) return res.crews;

  return [];
}

function renderExistingCrews(list) {
  const box = document.getElementById('crewExistingBox');
  const body = document.getElementById('crewExistingBody');

  box.style.display = 'block';

  if (!list.length) {
    body.innerHTML = `
      <div class="crew-card">
        <div style="font-size:13px;color:#64748b">
          Sistemde kayıtlı ekip yok.
        </div>
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div class="crew-card-list">
      ${list.map((item, i) => buildExistingCrewCard(item, i)).join('')}
    </div>
  `;
}

function buildExistingCrewCard(item, i) {
  const id = item.id || '';
  const crewTypeCode = item.crewTypeCode || '';
  const crewTypeText = item.crewTypeText || CREW_TYPE_LABELS[crewTypeCode] || '';
  const name = item.name || '';
  const surname = item.surname || '';
  const nationality = item.nationalityCode || item.nationalityText || '';

  return `
    <div class="crew-card">
      <div class="crew-card-head">
        <div>
          <div class="crew-card-title">#${i + 1} Sistemde Kayıtlı Ekip</div>
          <div class="crew-card-sub">
            ID: <code>${escapeHtml(id || '—')}</code>
          </div>
        </div>
      </div>

      <div class="crew-existing-grid">
        <div class="crew-field">
          <label>Görev</label>
          <input value="${escapeHtml(crewTypeCode + (crewTypeText ? ' - ' + crewTypeText : ''))}" disabled>
        </div>

        <div class="crew-field">
          <label>Ad</label>
          <input value="${escapeHtml(name)}" disabled>
        </div>

        <div class="crew-field">
          <label>Soyad</label>
          <input value="${escapeHtml(surname)}" disabled>
        </div>

        <div class="crew-field">
          <label>Milliyet</label>
          <input value="${escapeHtml(nationality)}" disabled>
        </div>

        <div class="crew-actions">
          <button class="btn btn-danger" style="padding:7px 10px;font-size:11px" onclick="deleteExistingCrew('${escapeHtml(id)}')">
            Sistemden Sil
          </button>
        </div>
      </div>
    </div>
  `;
}

async function deleteExistingCrew(id) {
  if (!id) {
    setCrewStatus('error', 'Silinecek ekip id bulunamadı.');
    return;
  }

  if (!_currentFlightBaseId) {
    setCrewStatus('error', 'Uçuş baseId bulunamadı.');
    return;
  }

  const ok = confirm('Bu ekip kaydını sistemden silmek istiyor musun?');
  if (!ok) return;

  setCrewStatus('info', 'Ekip sistemden siliniyor...');

  try {
    await apiCall('DELETE', CREW_DELETE_ENDPOINT(id, _currentFlightBaseId));

    _crewExistingList = _crewExistingList.filter(item => item.id !== id);
    renderExistingCrews(_crewExistingList);

    setCrewStatus('success', 'Ekip kaydı sistemden silindi.');

  } catch (err) {
    console.error(err);
    setCrewStatus('error', 'Ekip silinemedi: ' + err.message);
  }
}
