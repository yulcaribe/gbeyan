'use strict';

// ─────────────────────────────────────────────
//  CSV Parsing
// ─────────────────────────────────────────────
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('fileName').textContent = file.name;

  const reader = new FileReader();
  reader.readAsArrayBuffer(file);

  reader.onload = async e => {
    try {
      const buf = e.target.result;

      // Prefer UTF-8; fall back to windows-1254 for legacy files
      const utf8 = new TextDecoder('utf-8').decode(buf);
      const csvText = (utf8.includes('GELİŞ') || utf8.includes('GİDİŞ'))
        ? utf8
        : new TextDecoder('windows-1254').decode(buf);

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
}

function parseCsv(csvText) {
  const lines = csvText.split('\n');
  STATE.rows = [];
  let colMap = null;

  for (const line of lines) {
    const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.every(c => c === '') || cols.length < 3) continue;

    // Header row detection
    if (cols[0] === 'A/C' || cols.includes('GELİŞ')) {
      colMap = {};
      cols.forEach((name, i) => { colMap[name.trim().toUpperCase()] = i; });

      // Validate required columns
      const missing = REQUIRED_COLS.filter(n => colMap[n.toUpperCase()] === undefined);
      if (missing.length) {
        throw new Error('CSV\'de zorunlu kolon(lar) bulunamadı: ' + missing.join(', '));
      }
      continue;
    }

    if (!colMap) continue;

    // Helper: read by header name or fallback index
    const col = (name, fallback) => {
      const idx = colMap[name.toUpperCase()];
      return ((idx !== undefined ? cols[idx] : cols[fallback]) ?? '').trim() || '';
    };

    const ac      = col('A/C', 0)    || '-';
    const arrFlt  = col('GELİŞ', 1);
    const depFlt  = col('GİDİŞ', 2);
    const acType  = col('TIP', 13)   || '-';
    const reg     = col('REG', 15)   || '-';
    const staTime = col('STA', 8)    || '-';
    const stdTime = col('STD', 9)    || '-';

    // G1 appears twice — must use direct index (colMap would give the last one)
    const arrAirport = (cols[7] || '').trim() || '-';   // GELİŞ kalkış meydanı
    const depAirport = (cols[10] || '').trim() || '-';  // GİDİŞ varış meydanı

    const hgsbType = convertAircraftType(acType);
    const flightDate = todayStr();

    if (arrFlt && arrFlt !== '-') {
      const row = {
        type: 'GELİŞ', ac, flightDate, flightNo: normalizeFlightNo(arrFlt),
        departureAirport: arrAirport, arrivalAirport: 'AYT',
        time: staTime, hgsbAircraftType: hgsbType, reg,
        _status: 'idle', _error: null, _result: null, _sentAt: null
      };
      row.id = getRowId(row);
      applyHistoryToRow(row);
      STATE.rows.push(row);
    }

    if (depFlt && depFlt !== '-') {
      const row = {
        type: 'GİDİŞ', ac, flightDate, flightNo: normalizeFlightNo(depFlt),
        departureAirport: 'AYT', arrivalAirport: depAirport,
        time: stdTime, hgsbAircraftType: hgsbType, reg,
        _status: 'idle', _error: null, _result: null, _sentAt: null
      };
      row.id = getRowId(row);
      applyHistoryToRow(row);
      STATE.rows.push(row);
    }
  }
}
