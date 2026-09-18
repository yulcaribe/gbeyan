/*
 * Version: v1.7.4
 * Genel GENDEC beyan kodu.
 * Modal, PDF/Excel okuma, HGSB ekip beyan gönderimi ve generic fallback parser burada kalır.
 * Havayoluya özel parserlar ayrı dosyalardadır: noz.js, rys.js, sxs.js.
 */'use strict';

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

const CREW_TYPE_LABELS = {
  CM: 'KABİN AMİRİ',
  CP: 'KAPTAN PİLOT',
  FO: '1. YARDIMCI PİLOT',
  SO: '2. YARDIMCI PİLOT',
  TO: '3. YARDIMCI PİLOT',
  FE: 'UÇUŞ MÜHENDİSİ',
  CA: 'KABİN GÖREVLİSİ',
  LM: 'YÜK SORUMLUSU',
  FC: 'MÜRETTEBAT'
};

const GENDEC_TYPE_MAP = {
  CP: 'CP',
  CPT: 'CP',
  CAPT: 'CP',
  PIC: 'CP',

  FO: 'FO',
  SO: 'SO',
  TO: 'TO',
  FE: 'FE',

  CM: 'CM',
  SCCM: 'CM',

  CA: 'CA',
  CCM: 'CA',
  ACM: 'CA',
  JU: 'CA',
  PU: 'CM',

  LM: 'LM',
  FC: 'FC'
};

const GENDEC_ROLE_PATTERN = '(?:CP|FO|SO|TO|FE|CM|CA|JU|PU|LM|FC|SCCM|CCM\\d*|CCM|ACM\\d*|ACM|CPT|CAPT|PIC)';

const GENDER_CODES = new Set(['M', 'F', 'MALE', 'FEMALE']);

const NATIONALITY_NAME_MAP = {
  TR: 'TR',
  TUR: 'TR',
  TURKISH: 'TR',
  TURKEY: 'TR',
  TURKIYE: 'TR',

  IR: 'IR',
  IRN: 'IR',
  IRAN: 'IR',
  IRANIAN: 'IR',

  IT: 'IT',
  ITA: 'IT',
  ITALY: 'IT',
  ITALIAN: 'IT',

  US: 'US',
  USA: 'US',
  AMERICAN: 'US',
  UNITEDSTATES: 'US',

  DE: 'DE',
  DEU: 'DE',
  GERMANY: 'DE',
  GERMAN: 'DE',

  RU: 'RU',
  RUS: 'RU',
  RUSSIA: 'RU',
  RUSSIAN: 'RU',

  GB: 'GB',
  GBR: 'GB',
  UK: 'GB',
  BRITISH: 'GB',
  UNITEDKINGDOM: 'GB',

  FR: 'FR',
  FRA: 'FR',
  FRANCE: 'FR',
  FRENCH: 'FR'
};

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
      <div class="modal-field crew-upload-field" id="crewDropZone">
        <label for="crewPdfInput">Gendec PDF / Excel</label>
        <input type="file" id="crewPdfInput"
          accept="application/pdf,.pdf,.xlsx,.xls"
          onchange="handleCrewFileSelect(event)">
      </div>

      <button type="button" class="btn btn-secondary crew-manual-btn" onclick="crewAddEmptyRow()">
        + Manuel Ekip Ekle
      </button>

      <button type="button" class="btn btn-secondary crew-mail-btn" onclick="loadCrewFromMailCache(this)">
        ✉ Mailden Ekip Çek
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

  const dropZone = body.querySelector('#crewDropZone');
  for (const eventName of ['dragenter', 'dragover']) {
    dropZone?.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.add('drag-over'); });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropZone?.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.remove('drag-over'); });
  }
  dropZone?.addEventListener('drop', event => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleCrewFileSelect({ target: { files: [file] } });
  });
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
      grid-template-columns: minmax(220px,1fr) auto auto auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 12px;
    }

    .crew-upload-field input {
      width: 100%;
    }
    .crew-upload-field { padding: 7px; border: 1px dashed #cbd5e1; border-radius: 8px; }
    .crew-upload-field.drag-over { border-color: #2563eb; background: #eff6ff; }

    .crew-query-btn,
    .crew-manual-btn,
    .crew-mail-btn {
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
      .crew-manual-btn,
      .crew-mail-btn {
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
//  PDF seçilince oku + parse et
// ─────────────────────────────────────────────


async function handleCrewFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  _crewParsedList = [];
  setCrewSubmitDisabled(true);
  setCrewStatus('info', 'GenDec yerel olarak okunuyor...');
  try {
    const result = await globalThis.GendecBrowser.parseFile(file, {
      flightNo: _currentFlightDetail?.flightNumber || '',
      tailNumber: _currentFlightDetail?.tailNumber || '',
      departurePortCode: _currentFlightDetail?.departurePortCode || '',
      arrivalPortCode: _currentFlightDetail?.arrivalPortCode || ''
    });
    if (!result.crews?.length) throw new Error('Dosyada geçerli ekip satırı bulunamadı.');
    _crewParsedList = result.crews;
    renderCrewPreview();
    setCrewStatus('success', `${result.crews.length} ekip yerel dosyadan okundu. Kontrol edip onayla.`);
    setCrewSubmitDisabled(false);
  } catch (error) {
    setCrewStatus('error', `Dosya okunamadı: ${error.message}`);
  }
}

async function loadCrewFromMailCache(button) {
  const d = _currentFlightDetail || {};
  const flightNumber = String(d.flightNumber || '').trim();
  const api = globalThis.OtoBeyanApi;

  const tailNumber = String(d.tailNumber || '').trim();
  if (!flightNumber || !tailNumber) {
    setCrewStatus('error', 'Uçuş numarası veya kuyruk numarası bulunamadı.');
    return;
  }
  if (!api?.flightCrew) {
    setCrewStatus('error', 'Mail servisi açık değil. Önce erişim anahtarıyla Hızlı Beyan bağlantısını aç.');
    return;
  }

  const originalText = button?.textContent || '✉ Mailden Ekip Çek';
  if (button) {
    button.disabled = true;
    button.textContent = 'Mail önbelleği aranıyor...';
  }
  setCrewStatus('info', `${flightNumber} için önbellekteki GenDec aranıyor...`);

  try {
    const result = await api.flightCrew({ flightNumber, cacheOnly: true });
    if (!result.crews?.length) throw new Error('Ekip listesi bulunamadı.');
    _crewParsedList = result.crews;
    renderCrewPreview();
    setCrewStatus('success', `${result.crews.length} ekip OnRender üzerinde ayrıştırılmış JSON'dan alındı.`);
    setCrewSubmitDisabled(false);
  } catch (error) {
    setCrewStatus('error', 'Mail önbelleğinden ekip alınamadı: ' + error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

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
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <div style="font-size:13px;color:#334155">
        <strong>${_crewParsedList.length}</strong> ekip bulundu. Göndermeden önce kontrol et.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" style="padding:6px 10px" onclick="crewAddEmptyRow()">+ Manuel Ekip Ekle</button>
        ${_crewParsedList.some(crew => normalizeCrewExcelType(crew.crewTypeCode) === 'CP')
          ? '<button class="btn btn-outline" style="padding:6px 10px" onclick="updateCaptainFromGendec(this)">Kaptanı GenDec’ten Güncelle</button>'
          : ''}
      </div>
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
          <select onchange="crewUpdateRow(${i}, 'nationalityCode', this.value)">
            ${buildCountryOptions(crew.nationalityCode)}
          </select>
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

function buildCountryOptions(selected) {
  const selectedCode = normalizeNationality(selected);
  const countries = globalThis.HGBS_COUNTRIES || [];

  if (!countries.length) {
    return `<option value="${escapeHtml(selectedCode)}" selected>${escapeHtml(selectedCode || 'Ülke verisi yüklenemedi')}</option>`;
  }

  return [
    '<option value="">Milliyet seçin</option>',
    ...countries.map(country => {
      const code = String(country.value || '').toUpperCase();
      const isSelected = code === selectedCode ? ' selected' : '';
      return `<option value="${escapeHtml(code)}"${isSelected}>${escapeHtml(code + ' - ' + country.label)}</option>`;
    })
  ].join('');
}

function formatCountryValue(value) {
  const code = normalizeNationality(value);
  return globalThis.HGBS_COUNTRY_DATA?.format(code) || code || String(value || '').trim();
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

async function updateCaptainFromGendec(button) {
  const captain = _crewParsedList.find(crew => normalizeCrewExcelType(crew.crewTypeCode) === 'CP');
  const captainName = [captain?.name, captain?.surname].map(normalizePersonName).filter(Boolean).join(' ');
  const d = _currentFlightDetail;

  if (!d?.id || !d?.baseId) {
    setCrewStatus('error', 'Uçuşun id/baseId bilgisi eksik. Detayı yeniden aç.');
    return;
  }
  if (!captainName) {
    setCrewStatus('error', 'GenDec listesinde kaptan adı bulunamadı.');
    return;
  }
  if (!confirm(`Kaptan adı “${captainName}” olarak güncellensin mi?`)) return;

  const originalText = button?.textContent || 'Kaptanı GenDec’ten Güncelle';
  if (button) {
    button.disabled = true;
    button.textContent = 'Güncelleniyor...';
  }
  setCrewStatus('info', 'Kaptan adı HGSB uçuş kaydında güncelleniyor...');

  try {
    const payload = {
      ...d,
      authAgentNameSurname: STATE.user.userName || d.authAgentNameSurname || '',
      declarant: STATE.user.taxFirmName || d.declarant || '',
      captainNameSurname: captainName,
      crewNumber: _crewParsedList.length
    };
    const res = await apiCall('PUT', '/api/Flight/SetFlight?api-version=1.0', payload);
    _currentFlightDetail = res?.data || res || payload;
    _currentFlightBaseId = _currentFlightDetail.baseId || d.baseId;
    setCrewStatus('success', `Kaptan adı ${captainName} olarak güncellendi.`);
    await refreshHGBSFlightsForRows();
    if (typeof syncRowsWithHGBSHistory === 'function') syncRowsWithHGBSHistory();
    if (STATE.rows.length) renderTable();
  } catch (error) {
    setCrewStatus('error', 'Kaptan adı güncellenemedi: ' + error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
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
  const nationalityDisplay = formatCountryValue(nationality);

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
          <input value="${escapeHtml(nationalityDisplay)}" disabled>
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

function buildCrewPayload() {
  const crews = _crewParsedList.map(crew => ({
    id: '',
    crewTypeCode: normalizeCrewExcelType(crew.crewTypeCode),
    dateOfBirth: crewDateForApi(crew.dateOfBirth),
    identityCode: normalizeCode(crew.identityCode),
    identityNumber: normalizeIdentityNumber(crew.identityNumber),
    name: normalizePersonName(crew.name),
    surname: normalizePersonName(crew.surname),
    nationalityCode: normalizeNationality(crew.nationalityCode)
  }));

  return {
    baseId: _currentFlightBaseId,
    crews
  };
}

function validateCrewPayload(payload) {
  if (!payload.baseId) {
    return 'Uçuş baseId bulunamadı. Önce uçuş detayını getir.';
  }

  if (!payload.crews.length) {
    return 'Gönderilecek ekip yok.';
  }

  for (let i = 0; i < payload.crews.length; i++) {
    const c = payload.crews[i];

    if (!c.crewTypeCode) {
      return `${i + 1}. satırda görev tipi boş.`;
    }

    if (!c.name) {
      return `${i + 1}. satırda ad boş.`;
    }

    if (!c.surname) {
      return `${i + 1}. satırda soyad boş.`;
    }
  }

  return '';
}

function clearCrewDraftAfterSubmit() {
  _crewPdfFile = null;
  _crewParsedList = [];

  const inputArea = document.getElementById('crewInputArea');
  if (inputArea) inputArea.style.display = 'none';

  const previewBox = document.getElementById('crewPreviewBox');
  const previewBody = document.getElementById('crewPreviewBody');

  if (previewBox) previewBox.style.display = 'none';
  if (previewBody) previewBody.innerHTML = '';

  hideCrewSubmitButton();
}

async function submitCrewBeyan() {
  const btn = document.getElementById('crewSubmitBtn');

  const payload = buildCrewPayload();
  const validationError = validateCrewPayload(payload);

  if (validationError) {
    setCrewStatus('error', validationError);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor...';
  }

  setCrewStatus('info', 'Ekip beyanı HGSB’ye gönderiliyor...');

  try {
    const res = await apiCall('PUT', CREW_SET_ENDPOINT, payload);

    const savedList = normalizeApiCrewList(res);
    _crewExistingList = savedList;

    setCrewStatus('success', `Ekip beyanı gönderildi. ${savedList.length || payload.crews.length} kişi kaydedildi.`);

    clearCrewDraftAfterSubmit();
    renderExistingCrews(savedList.length ? savedList : payload.crews);

  } catch (err) {
    console.error(err);

    if (!err.message.includes('401')) {
      setCrewStatus('error', 'Ekip beyanı gönderilemedi: ' + err.message);
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Onayla ve Gönder';
    }
  }
}
