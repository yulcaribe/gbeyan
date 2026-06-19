'use strict';

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
