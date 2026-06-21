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
//  PDF seçilince oku + parse et
// ─────────────────────────────────────────────


async function handleCrewFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    return await handleCrewPdfSelect(event);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return await handleCrewExcelSelect(event);
  }

  setCrewStatus('error', 'Lütfen PDF, XLS veya XLSX dosyası seç.');
  document.getElementById('crewSubmitBtn').disabled = true;
}

async function handleCrewPdfSelect(event) {
  const file = event.target.files[0];

  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setCrewStatus('error', 'Lütfen Gendec PDF dosyası seç.');
    document.getElementById('crewSubmitBtn').disabled = true;
    return;
  }

  _crewPdfFile = file;
  _crewParsedList = [];

  document.getElementById('crewSubmitBtn').disabled = true;
  document.getElementById('crewPreviewBox').style.display = 'none';
  document.getElementById('crewPreviewBody').innerHTML = '';

  setCrewStatus('info', 'PDF okunuyor...');

  try {
    const text = await readPdfText(file);
    const crews = parseGendecCrewText(text);

    if (!crews.length) {
      setCrewStatus('error', 'PDF içinden ekip listesi bulunamadı. Gendec formatı farklı olabilir.');
      document.getElementById('crewPreviewBox').style.display = 'block';
      document.getElementById('crewPreviewBody').innerHTML = `
        <div style="color:#991b1b;font-weight:600;margin-bottom:8px">
          Ekip satırı bulunamadı.
        </div>
        <div style="font-size:12px;color:#64748b">
          Desteklenen örnekler:
          <br><code>CP 1 JOHN SMITH TR</code>
          <br><code>JOHN SMITH</code>
          <br><code>CPT M PASSPORT 01/01/2030 01/01/1980 Turkish</code>
        </div>
      `;
      return;
    }

    _crewParsedList = crews;

    renderCrewPreview();

    setCrewStatus('success', `${crews.length} ekip bulundu. Kontrol et, gerekirse düzelt, sonra gönder.`);
    document.getElementById('crewSubmitBtn').disabled = false;

  } catch (err) {
    console.error(err);
    setCrewStatus('error', 'PDF okunurken hata oluştu: ' + err.message);
    document.getElementById('crewSubmitBtn').disabled = true;
  }
}

//EXCEL READ FUNC
// ─────────────────────────────────────────────
//  Excel parse
// ─────────────────────────────────────────────

async function handleCrewExcelSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  _crewPdfFile = null;
  _crewParsedList = [];

  document.getElementById('crewSubmitBtn').disabled = true;
  document.getElementById('crewPreviewBox').style.display = 'none';
  document.getElementById('crewPreviewBody').innerHTML = '';

  setCrewStatus('info', 'Excel okunuyor...');

  try {
    const crews = await readCrewExcelFile(file);

    if (!crews.length) {
      setCrewStatus('error', 'Excel içinde geçerli ekip satırı bulunamadı. Adı, Soyadı ve Mürettebat Tipi zorunlu.');
      return;
    }

    _crewParsedList = crews;

    renderCrewPreview();

    setCrewStatus('success', `${crews.length} ekip Excel'den okundu. Kontrol et, gerekirse düzelt, sonra gönder.`);
    document.getElementById('crewSubmitBtn').disabled = false;

  } catch (err) {
    console.error(err);
    setCrewStatus('error', 'Excel okunurken hata oluştu: ' + err.message);
    document.getElementById('crewSubmitBtn').disabled = true;
  }
}

async function readCrewExcelFile(file) {
  if (!window.XLSX) {
    throw new Error('XLSX kütüphanesi yüklenmemiş.');
  }

  const arrayBuffer = await file.arrayBuffer();

  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    raw: false
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel içinde sayfa bulunamadı.');
  }

  const sheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false
  });

  return parseCrewExcelMatrix(matrix);
}

function parseCrewExcelMatrix(matrix) {
  const headerIndex = findCrewExcelHeaderRow(matrix);

  if (headerIndex < 0) {
    throw new Error('Başlık satırı bulunamadı. Beklenen kolonlar: Adı, Soyadı, Mürettebat Tipi (REF).');
  }

  const headers = matrix[headerIndex].map(h => normalizeExcelKey(h));

  const idxName        = findHeaderIndex(headers, ['ADI', 'AD', 'NAME']);
  const idxSurname     = findHeaderIndex(headers, ['SOYADI', 'SOYAD', 'SURNAME', 'LASTNAME']);
  const idxBirthDate   = findHeaderIndex(headers, ['DOGUMTARIHI', 'DOB', 'DATEOFBIRTH']);
  const idxNationality = findHeaderIndex(headers, ['MILLIYETIREF', 'MILLIYET', 'UYRUK', 'NATIONALITY', 'NAT']);
  const idxCrewType    = findHeaderIndex(headers, ['MURETTEBATTIPIREF', 'MURETTEBATTIPI', 'GOREV', 'CREWTYPE', 'TYPE']);
  const idxDocType     = findHeaderIndex(headers, ['BELGETIPIREF', 'BELGETIPI', 'DOCTYPE', 'DOCUMENTTYPE']);
  const idxDocNo       = findHeaderIndex(headers, ['BELGENO', 'DOCUMENTNO', 'PASSPORTNO', 'PASSPORT', 'IDENTITYNUMBER']);

  if (idxName < 0 || idxSurname < 0 || idxCrewType < 0) {
    throw new Error('Zorunlu kolon eksik: Adı, Soyadı, Mürettebat Tipi (REF).');
  }

  const crews = [];

  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];

    const name = normalizePersonName(getExcelCell(row, idxName));
    const surname = normalizePersonName(getExcelCell(row, idxSurname));
    const crewTypeCode = normalizeCrewExcelType(getExcelCell(row, idxCrewType));

    // Zorunlu üçlü yoksa satırı atla.
    if (!name || !surname || !crewTypeCode) continue;

    crews.push({
      orderNo: String(crews.length + 1),
      sourceTypeCode: 'EXCEL',
      crewTypeCode,
      name,
      surname,
      nationalityCode: idxNationality >= 0 ? normalizeNationality(getExcelCell(row, idxNationality)) : '',
      dateOfBirth: idxBirthDate >= 0 ? normalizeCrewExcelDate(getExcelCell(row, idxBirthDate)) : '',
      identityCode: idxDocType >= 0 ? normalizeCode(getExcelCell(row, idxDocType)) : '',
      identityNumber: idxDocNo >= 0 ? normalizeIdentityNumber(getExcelCell(row, idxDocNo)) : ''
    });
  }

  return removeDuplicateCrews(crews);
}

function findCrewExcelHeaderRow(matrix) {
  for (let i = 0; i < matrix.length; i++) {
    const headers = (matrix[i] || []).map(h => normalizeExcelKey(h));

    const hasName = findHeaderIndex(headers, ['ADI', 'AD', 'NAME']) >= 0;
    const hasSurname = findHeaderIndex(headers, ['SOYADI', 'SOYAD', 'SURNAME', 'LASTNAME']) >= 0;
    const hasCrewType = findHeaderIndex(headers, ['MURETTEBATTIPIREF', 'MURETTEBATTIPI', 'GOREV', 'CREWTYPE', 'TYPE']) >= 0;

    if (hasName && hasSurname && hasCrewType) {
      return i;
    }
  }

  return -1;
}

function findHeaderIndex(headers, candidates) {
  for (const c of candidates) {
    const key = normalizeExcelKey(c);
    const idx = headers.indexOf(key);

    if (idx >= 0) return idx;
  }

  return -1;
}

function getExcelCell(row, index) {
  if (index < 0) return '';
  return String(row[index] ?? '').trim();
}

function normalizeExcelKey(value) {
  return foldTurkishChars(String(value || ''))
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeCrewExcelType(value) {
  const raw = String(value || '').trim();
  const key = normalizeCode(raw);

  if (!key) return '';

  if (GENDEC_TYPE_MAP[key]) return GENDEC_TYPE_MAP[key];

  const folded = foldTurkishChars(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (folded.includes('KAPTAN') || folded.includes('CAPTAIN') || folded.includes('PIC')) return 'CP';
  if (folded.includes('FIRSTOFFICER') || folded.includes('YARDIMCIPILOT') || folded === 'COPILOT') return 'FO';
  if (folded.includes('KABINAMIRI') || folded.includes('CABINCHIEF') || folded.includes('SCCM')) return 'CM';
  if (folded.includes('KABIN') || folded.includes('CABIN') || folded.includes('HOSTES') || folded.includes('CCM') || folded.includes('ACM')) return 'CA';

  return key.slice(0, 3);
}

function normalizeCrewExcelDate(value) {
  const v = String(value || '').trim();
  if (!v) return '';

  // 1973-05-27
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // 27.05.1973 veya 27/05/1973
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  return '';
}

function normalizeIdentityNumber(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function crewDateForApi(value) {
  const d = normalizeCrewExcelDate(value);
  return d ? `${d}T00:00:00+03:00` : '';
}


// ─────────────────────────────────────────────
//  PDF text extraction
// ─────────────────────────────────────────────

async function readPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js yüklenmemiş. index.html script sırasını kontrol et.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pageTexts.push(pdfTextContentToLines(content));
  }

  return pageTexts.join('\n');
}

function pdfTextContentToLines(content) {
  const items = content.items
    .filter(item => item.str && item.str.trim())
    .map(item => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: Math.round(item.transform[5] / 2) * 2
    }));

  const lineMap = new Map();

  for (const item of items) {
    if (!lineMap.has(item.y)) lineMap.set(item.y, []);
    lineMap.get(item.y).push(item);
  }

  const lines = Array.from(lineMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) => {
      return lineItems
        .sort((a, b) => a.x - b.x)
        .map(i => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .filter(Boolean);

  return lines.join('\n');
}

// ─────────────────────────────────────────────
//  Gendec parser
// ─────────────────────────────────────────────

function parseGendecCrewText(text) {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);

  const lines = rawLines
    .map(cleanGendecLine)
    .filter(Boolean);

  const crews = [];

  for (const crew of parseNorwegianCompactCrewLines(rawLines)) {
    crews.push(crew);
  }

  for (const crew of parseRyanCrewLines(rawLines)) {
    crews.push(crew);
  }

  // Format 1:
  // CP 1 BIZHAN ZARE IR
  // FO 2 HALIL IBRAHIM DEMIRCI TR
  for (const line of lines) {
    const segments = splitPossibleCrewSegments(line);

    for (const segment of segments) {
      const crew = parseCrewLine(segment);
      if (crew) crews.push(crew);
    }
  }

  // Format 2:
  // MUSTAFA BASLI
  // CPT M S37957985 28/08/2035 01/03/1975 Turkish
  const tableStyleCrews = parseTableStyleCrewLines(lines);
  for (const crew of tableStyleCrews) {
    crews.push(crew);
  }

  return removeDuplicateCrews(crews);
}

function parseNorwegianCompactCrewLines(rawLines) {
  const tableText = getNorwegianCompactCrewTableText(rawLines);
  if (!tableText) return [];

  const rolePattern = 'CP|FO|SO|TO|FE|CM|CA|JU|PU|LM|FC|SCCM|CCM\\d*|CCM|ACM\\d*|ACM|CPT|CAPT|PIC';
  const compact = tableText
    .replace(/[\u00ad\u2010-\u2015]/g, '-')
    .replace(/\s+/g, '');

  const rx = new RegExp(
    `(?:[A-Z]{3}-?[A-Z]{3})?(${rolePattern})(\\d{3,6})([^,\\s]+),([^,\\s]+?)([MF])(\\d{2}[A-Za-z]{3}\\d{2})([A-Z0-9]+?)([A-Z]{2})(?=(?:[A-Z]{3}-?[A-Z]{3})?(?:${rolePattern})\\d|[^A-Z0-9]|$)`,
    'g'
  );

  const crews = [];
  let match;

  while ((match = rx.exec(compact)) !== null) {
    const rawType = match[1];
    const surname = humanizeCompactCrewName(match[3]);
    const givenName = humanizeCompactCrewName(match[4]);
    const nationalityCode = match[8];

    const crew = buildCrewFromNameParts(rawType, givenName, surname, nationalityCode, String(crews.length + 1), {
      identityNumber: match[7] || '',
      dateOfBirth: parseCompactCrewDate(match[6])
    });

    if (crew) crews.push(crew);
  }

  return crews;
}

function getNorwegianCompactCrewTableText(rawLines) {
  let inCrewTable = false;
  const rows = [];

  for (const rawLine of rawLines) {
    const folded = foldTurkishChars(rawLine).toUpperCase();

    if (!inCrewTable && folded.includes('CREW') && folded.includes('NAME') && folded.includes('PASSPORT')) {
      inCrewTable = true;
      continue;
    }

    if (inCrewTable && (
      folded.includes('DECLARATION OF HEALTH') ||
      folded.includes('NUMBER OF PASSENGERS') ||
      folded.includes('AUTHORIZED AGENT')
    )) {
      break;
    }

    if (inCrewTable) rows.push(rawLine);
  }

  return rows.join(' ');
}

function parseRyanCrewLines(rawLines) {
  const rolePattern = 'CP|FO|JU|PU|CA|CM|SCCM|CCM\\d*|CCM|ACM\\d*|ACM';
  const rx = new RegExp(`\\b(${rolePattern})\\s*-\\s*([^,]+),\\s*(.+)$`, 'i');
  const crews = [];

  for (const rawLine of rawLines) {
    const line = cleanGendecLineKeepComma(rawLine);
    const match = line.match(rx);
    if (!match) continue;

    const rawType = match[1];
    const surname = cleanupRyanCrewName(match[2]);
    const givenName = cleanupRyanCrewName(match[3]);

    const crew = buildCrewFromNameParts(rawType, givenName, surname, 'PL', String(crews.length + 1));
    if (crew) crews.push(crew);
  }

  return crews;
}

function cleanGendecLineKeepComma(line) {
  return String(line || '')
    .replace(/[^\wÇĞİÖŞÜçğıöşü', -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

function cleanupRyanCrewName(value) {
  const tokens = String(value || '')
    .replace(/\s+-\s+.*$/, '')
    .split(/\s+/)
    .map(token => token.replace(/^[^A-ZÇĞİÖŞÜ']+|[^A-ZÇĞİÖŞÜ']+$/g, ''))
    .filter(Boolean);

  while (tokens.length > 1 && /^[A-Z]{3}$/.test(foldTurkishChars(tokens[tokens.length - 1]))) {
    tokens.pop();
  }

  while (tokens.length && /^(BUZZ|SPRNI|RYANAIR|FLIGHT|CREW|AYT|WRO|ARN)$/.test(foldTurkishChars(tokens[tokens.length - 1]))) {
    tokens.pop();
  }

  return tokens.join(' ');
}

function humanizeCompactCrewName(value) {
  return String(value || '')
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function parseCompactCrewDate(value) {
  const m = String(value || '').match(/^(\d{2})([A-Za-z]{3})(\d{2})$/);
  if (!m) return '';

  const months = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
  };
  const month = months[m[2].toUpperCase()];
  if (!month) return '';

  const yy = parseInt(m[3], 10);
  const year = yy <= 29 ? 2000 + yy : 1900 + yy;
  return `${year}-${month}-${m[1]}`;
}
function splitPossibleCrewSegments(line) {
  const cleanLine = cleanGendecLine(line);

  const roleRegex = new RegExp(
    `\\b(${GENDEC_ROLE_PATTERN})\\s+\\d{1,2}\\b`,
    'g'
  );

  const matches = [];
  let match;

  while ((match = roleRegex.exec(cleanLine)) !== null) {
    matches.push(match.index);
  }

  if (matches.length <= 1) {
    return [cleanLine];
  }

  const segments = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = matches[i + 1] || cleanLine.length;
    const segment = cleanLine.slice(start, end).trim();

    if (segment) segments.push(segment);
  }

  return segments;
}

function parseCrewLine(line) {
  const rx = new RegExp(`^(${GENDEC_ROLE_PATTERN})\\s+(\\d{1,2})\\s+(.+)$`, 'i');

  const m = line.match(rx);
  if (!m) return null;

  const rawType = m[1];
  const orderNo = m[2];
  const rest = cleanGendecLine(m[3]);

  const tokens = rest.split(/\s+/).filter(Boolean);

  let nationalityIndex = -1;

  for (let i = 1; i < tokens.length; i++) {
    const token = normalizeNationality(tokens[i]);

    if (/^[A-Z]{2}$/.test(token)) {
      nationalityIndex = i;
      break;
    }
  }

  if (nationalityIndex === -1) return null;

  const nameTokens = tokens.slice(0, nationalityIndex);
  const nationalityCode = tokens[nationalityIndex];

  if (nameTokens.length < 2) return null;

  return buildCrewFromParts(rawType, nameTokens.join(' '), nationalityCode, orderNo);
}

function parseTableStyleCrewLines(lines) {
  const crews = [];

  for (let i = 1; i < lines.length; i++) {
    const roleInfo = parseTableRoleDetailLine(lines[i]);
    if (!roleInfo) continue;

    const nameLine = findNameLineBeforeRole(lines, i);
    if (!nameLine) continue;

    const orderNo = String(crews.length + 1);

    const crew = buildCrewFromParts(
      roleInfo.rawType,
      nameLine,
      roleInfo.nationalityCode,
      orderNo
    );

    if (crew) crews.push(crew);
  }

  return crews;
}

function parseTableRoleDetailLine(line) {
  const cleanLine = cleanGendecLine(line);
  const tokens = cleanLine.split(/\s+/).filter(Boolean);

  if (tokens.length < 3) return null;

  const rawType = tokens[0];
  const gender = tokens[1];

  // Bu formatta rol satırı genelde şöyle:
  // CPT M S37957985 28/08/2035 01/03/1975 Turkish
  // FO M U33914234 26/08/2034 25/06/1998 Turkish
  // SCCM F U24500070 02/10/2028 10/01/1979 Turkish
  // CCM1 F U22920831 30/12/2029 25/03/1996 Turkish
  if (!mapCrewType(rawType)) return null;
  if (!GENDER_CODES.has(gender)) return null;

  const nationalityRaw = tokens[tokens.length - 1];
  const nationalityCode = normalizeNationality(nationalityRaw);

  if (!nationalityCode) return null;

  return {
    rawType,
    nationalityCode
  };
}

function findNameLineBeforeRole(lines, roleLineIndex) {
  // Freebird gibi bazı PDF'lerde aynı görsel satırda iki kolon geliyor:
  // "Chisinau International Airport / FATMANUR CAGLIYAN"
  // Bu yüzden önce rota+isim karışmış satırdan sadece ismi ayıklıyoruz.
  for (let j = roleLineIndex - 1; j >= 0 && j >= roleLineIndex - 6; j--) {
    const candidate = extractCrewNameFromPossibleMixedLine(lines[j]);

    if (candidate) {
      return candidate;
    }
  }

  return '';
}

function extractCrewNameFromPossibleMixedLine(line) {
  const v = cleanGendecLine(line);
  if (!v) return '';

  // Rol/detail satırı, tarih, pasaport vb. isim olamaz.
  if (/\d/.test(v)) return '';
  if (new RegExp(`^${GENDEC_ROLE_PATTERN}\\b`, 'i').test(v)) return '';

  // Freebird kolon birleşmesi örneği:
  // CHISINAU INTERNATIONAL AIRPORT FATMANUR CAGLIYAN
  // cleanGendecLine tr-TR uppercase kullandığı için AIRPORT -> AİRPORT olabilir.
  // Bu yüzden karşılaştırmayı foldTurkishChars üzerinden yapıyoruz.
  const folded = foldTurkishChars(v);
  const airportMatch = /\bAIRPORT\b(?!.*\bAIRPORT\b)/.exec(folded);

  if (airportMatch) {
    const afterAirport = v
      .slice(airportMatch.index + airportMatch[0].length)
      .trim();

    if (isLikelyCrewNameLine(afterAirport)) {
      return afterAirport;
    }
  }

  // Normal tablo formatı:
  // MUSTAFA BASLI
  if (isLikelyCrewNameLine(v)) {
    return v;
  }

  return '';
}

function isLikelyCrewNameLine(line) {
  const v = cleanGendecLine(line);
  if (!v) return false;

  if (/\d/.test(v)) return false;

  const blockedWords = [
    'AIRPORT',
    'AIRLINES',
    'FREEBIRD',
    'SUNEXPRESS',
    'GENERAL',
    'DECLARATION',
    'OWNER',
    'OPERATOR',
    'FLIGHT',
    'FLT',
    'ROUTING',
    'CREW NAME',
    'PLACE',
    'ROLE',
    'GENDER',
    'PASSPORT',
    'EXPIRY',
    'DOB',
    'NATIONALITY',
    'COMMANDER',
    'POSITIONING',
    'ADDITIONAL',
    'ICAO',
    'APPENDIX',
    'SIGNATURE',
    'AUTHORISED',
    'AUTHORIZED',
    'PILOT',
    'DISEMBARKING',
    'EMBARKING',
    'PASSENGER',
    'STAGE',
    'ZULU',
    'LOCAL',
    'REGISTRATION',
    'DEPARTURE',
    'ARRIVAL',
    'CHISINAU',
    'ANTALYA'
  ];

  const folded = foldTurkishChars(v);

  if (blockedWords.some(word => folded.includes(word))) return false;

  const parts = v.split(/\s+/).filter(Boolean);

  if (parts.length < 2) return false;
  if (parts.length > 5) return false;

  return parts.every(p => /^[A-ZÇĞİÖŞÜ' -]+$/.test(p));
}

function buildCrewFromParts(rawType, fullName, nationalityCode, orderNo) {
  const parsedName = splitNameSurname(fullName);
  return buildCrewFromNameParts(rawType, parsedName.name, parsedName.surname, nationalityCode, orderNo);
}

function buildCrewFromNameParts(rawType, name, surname, nationalityCode, orderNo, extra = {}) {
  const crewTypeCode = mapCrewType(rawType);
  if (!crewTypeCode) return null;

  const normalizedName = normalizePersonName(name);
  const normalizedSurname = normalizePersonName(surname);
  const normalizedNationality = normalizeNationality(nationalityCode);

  if (!normalizedName || !normalizedSurname || !normalizedNationality) return null;

  return {
    orderNo: orderNo || '',
    sourceTypeCode: normalizeSourceTypeCode(rawType),
    crewTypeCode,
    name: normalizedName,
    surname: normalizedSurname,
    nationalityCode: normalizedNationality,
    identityNumber: extra.identityNumber || '',
    dateOfBirth: extra.dateOfBirth || ''
  };
}

function mapCrewType(rawType) {
  const key = normalizeCode(rawType);
  return GENDEC_TYPE_MAP[key] || '';
}

function splitNameSurname(fullName) {
  const parts = normalizePersonName(fullName).split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return { name: '', surname: '' };
  }

  if (parts.length === 1) {
    return { name: parts[0], surname: '' };
  }

  return {
    name: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1]
  };
}

function removeDuplicateCrews(crews) {
  const seen = new Set();
  const result = [];

  for (const crew of crews) {
    const key = [
      crew.crewTypeCode,
      crew.name,
      crew.surname,
      crew.nationalityCode
    ].join('|');

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(crew);
  }

  return result;
}

function cleanGendecLine(line) {
  return String(line || '')
    .replace(/[^\wÇĞİÖŞÜçğıöşü' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

function normalizeCode(v) {
  return String(v || '')
    .trim()
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
}

function normalizeSourceTypeCode(v) {
  return String(v || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function normalizeNationality(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';

  const folded = foldTurkishChars(raw)
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();

  if (!folded) return '';

  if (NATIONALITY_NAME_MAP[folded]) {
    return NATIONALITY_NAME_MAP[folded];
  }

  if (/^[A-Z]{2}$/.test(folded)) {
    return folded;
  }

  if (/^[A-Z]{3}$/.test(folded)) {
    return folded.slice(0, 3);
  }

  return folded.slice(0, 3);
}

function normalizePersonName(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR');
}

function foldTurkishChars(v) {
  return String(v || '')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u');
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
          <input value="${escapeHtml(crew.nationalityCode || '')}" maxlength="3" oninput="crewUpdateRow(${i}, 'nationalityCode', this.value)">
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
