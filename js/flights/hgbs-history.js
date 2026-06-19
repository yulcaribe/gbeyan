'use strict';

// ─────────────────────────────────────────────
//  HGBS live history helpers - no localStorage cache
// ─────────────────────────────────────────────

let HISTORY_CACHE = {};
let HISTORY_READY = false;
let HGBS_FLIGHT_CACHE = {};
let HGBS_FETCHED_DATES = new Set();
let _hgsbAutoRefreshTimer = null;
let _hgsbAutoRefreshRunning = false;

function normalizeFlightDate(v, fallback = todayStr()) {
  const value = String(v ?? '').trim();
  return value || fallback;
}

function getRowFlightDate(row) {
  return normalizeFlightDate(row?.flightDate || STATE.flightDate, todayStr());
}

function getRowId(row) {
  return generateFlightId(row.type, row.flightNo, row.reg, getRowFlightDate(row));
}

function getUniqueFlightDates(rows = STATE.rows) {
  const dates = new Set();
  (rows || []).forEach(row => dates.add(getRowFlightDate(row)));
  if (!dates.size) dates.add(normalizeFlightDate(STATE.flightDate, todayStr()));
  return Array.from(dates);
}

function clearHistoryForDate(dateVal) {
  const date = normalizeFlightDate(dateVal, '');
  if (!date) return;

  Object.keys(HISTORY_CACHE).forEach(id => {
    if (HISTORY_CACHE[id]?.flightDate === date) delete HISTORY_CACHE[id];
  });

  Object.keys(HGBS_FLIGHT_CACHE).forEach(key => {
    if (HGBS_FLIGHT_CACHE[key]?.flightDate === date) delete HGBS_FLIGHT_CACHE[key];
  });

  HGBS_FETCHED_DATES.delete(date);
}

function resetRowSubmissionState(row) {
  row._status = 'idle';
  row._result = null;
  row._sentAt = null;
  row._error = null;
}

function applyHistoryToRow(row) {
  if (!row) return;

  row.flightDate = getRowFlightDate(row);
  row.id = getRowId(row);

  if (isAlreadySent(row.id)) {
    const e = getHistoryEntry(row.id);
    row._status = 'already_sent';
    row._result = { apiId: e.apiId || '' };
    row._sentAt = e.sentAt || e.hgsbAt || '';
    row._error = null;
  } else if (row._status === 'already_sent') {
    resetRowSubmissionState(row);
  }
}

function toHgbDate(dateVal) {
  if (!dateVal) return '';
  const [y, m, d] = dateVal.split('-');
  return `${d}.${m}.${y}`;
}

function normalizeFlightNo(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function splitFlightNo(flightNo) {
  const v = normalizeFlightNo(flightNo);
  const m = v.match(/^([A-Z]{2,3})(\d+[A-Z]?)$/);

  if (!m) {
    return {
      prefix: '',
      number: v
    };
  }

  return {
    prefix: m[1],
    number: m[2]
  };
}

function getFlightNoVariants(flightNo) {
  const normalized = normalizeFlightNo(flightNo);
  const parsed = splitFlightNo(normalized);

  const variants = new Set();
  variants.add(normalized);

  if (parsed.prefix && AIRLINE_CODE_ALIASES[parsed.prefix]) {
    variants.add(AIRLINE_CODE_ALIASES[parsed.prefix] + parsed.number);
  }

  return Array.from(variants);
}

function normalizeReg(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '');
}

function normalizeStatus(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase();
}

function makeHGBSKey(type, flightNo, reg, dateVal) {
  return [
    normalizeFlightDate(dateVal, ''),
    String(type || '').trim().toUpperCase(),
    normalizeFlightNo(flightNo),
    normalizeReg(reg)
  ].join('|');
}

function unwrapFlightList(res) {
  if (Array.isArray(res)) return res;

  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.result)) return res.result;

  if (res.data && Array.isArray(res.data.items)) return res.data.items;
  if (res.data && Array.isArray(res.data.result)) return res.data.result;
  if (res.data && Array.isArray(res.data.list)) return res.data.list;
  if (res.data && Array.isArray(res.data.data)) return res.data.data;

  return [];
}

function extractFlightNo(f) {
  return (
    f.flightNumber ||
    f.flightNo ||
    f.flightCode ||
    f.ucusNo ||
    f.ucusNumarasi ||
    ''
  );
}

function extractReg(f) {
  return (
    f.tailNumber ||
    f.tailNo ||
    f.reg ||
    f.registrationNumber ||
    f.aircraftRegistration ||
    f.airCraftRegistration ||
    ''
  );
}

function extractApiId(f) {
  return (
    f.baseId ||
    f.id ||
    f.flightId ||
    f.apiId ||
    f.varisCikisBildirimNo ||
    f.notificationNo ||
    ''
  );
}

function extractStatus(f) {
  return (
    f.statusCode ||
    f.status ||
    f.statusName ||
    f.statusText ||
    f.durum ||
    f.flightStatus ||
    'HGBS_FOUND'
  );
}

function isCancelledStatus(status) {
  const s = normalizeStatus(status);

  return (
    s === 'CANCELLED' ||
    s === 'CANCELED' ||
    s === 'IPTAL' ||
    s === 'İPTAL' ||
    s.includes('IPTAL') ||
    s.includes('İPTAL') ||
    s === 'EXPIRED'
  );
}

const HGBS_STATUS_LABELS = {
  ONAYGERIGONDERILDI:       'Onay Geri Gönderildi',
  ONAYGERIGONDERIMTALEBI:   'Onay Geri Gönderme Talep Edildi',
  IPTALTALEBI:              'İptal Talep Edildi',
  TASLAK:                   'Taslak',
  IPTAL:                    'İptal',
  GUMRUGESUNULDU:           'Gümrüğe Sunuldu',
  GERIGONDERIMTALEBI:       'Geri Gönderme Talep Edildi',
  GERIGONDERILDI:           'Geri Gönderildi',
  KABULEDILDI:              'Onaylandı',
  GERICEKILDI:              'Geri Çekildi',
  HGBS_FOUND:               'HGBS Kaydı Var',
  CANCELLED:                'İptal'
};

function getHGBSStatusLabel(row) {
  const entry = getRowHistoryEntry(row);
  const raw   = entry?.raw || {};
  const code  = normalizeStatus(entry?.status || raw.statusCode || '');

  return (
    HGBS_STATUS_LABELS[code] ||
    raw.statusText ||
    raw.statusName ||
    raw.durum ||
    entry?.status ||
    'HGBS Kaydı Var'
  );
}

function renderHGBSSentLabel(row) {
  const label = getHGBSStatusLabel(row);
  return `Gönderildi - ${label}`;
}

async function getAgencyFlightsFromHGBS(params) {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    tailNumber: params.tailNumber || '',
    flightNumber: params.flightNumber || '',
    statusCode: params.statusCode || '',
    departurePortCode: params.departurePortCode || '',
    arrivalPortCode: params.arrivalPortCode || '',
    type: params.type || '',
    'api-version': '1.0'
  });

  return await apiCall(
    'GET',
    `/api/Flight/GetAgencyFlights?${q.toString()}`
  );
}

async function refreshHGBSFlightsForDate(dateVal) {
  const queryDate = normalizeFlightDate(dateVal || STATE.flightDate, todayStr());
  const hgbDate = toHgbDate(queryDate);

  clearHistoryForDate(queryDate);
  HISTORY_READY = false;

  const [arrRes, depRes] = await Promise.all([
    getAgencyFlightsFromHGBS({
      startDate: hgbDate,
      endDate: hgbDate,
      arrivalPortCode: 'AYT',
      type: 'GLS'
    }),

    getAgencyFlightsFromHGBS({
      startDate: hgbDate,
      endDate: hgbDate,
      departurePortCode: 'AYT',
      type: 'GDS'
    })
  ]);

const arrivals = unwrapFlightList(arrRes);
const departures = unwrapFlightList(depRes);

function getFlightNoVariantsInside(flightNo) {
  const normalized = normalizeFlightNo(flightNo);

  const m = normalized.match(/^([A-Z0-9]{2,3})(\d+[A-Z]?)$/);
  if (!m) return [normalized];

  const prefix = m[1];
  const number = m[2];

  const variants = new Set();
  variants.add(normalized);

  if (AIRLINE_CODE_ALIASES[prefix]) {
    variants.add(AIRLINE_CODE_ALIASES[prefix] + number);
  }

  return Array.from(variants);
}

  arrivals.forEach(f => {
  const flightNo = extractFlightNo(f);
  const reg = extractReg(f);

  if (!flightNo) return;

  const status = extractStatus(f);
  const apiId = extractApiId(f);
  const hgsbAt = f.createDate || f.createdDate || f.insertDate || f.createdAt || f.statusDate || '';

  getFlightNoVariantsInside(flightNo).forEach(variantFlightNo => {
    const id = generateFlightId('GELİŞ', variantFlightNo, reg, queryDate);
    const key = makeHGBSKey('GELİŞ', variantFlightNo, reg, queryDate);

    const entry = {
      id,
      flightDate: queryDate,
      flightNo: variantFlightNo,
      originalFlightNo: flightNo,
      reg,
      type: 'GELİŞ',
      status,
      apiId,
      hgsbAt,
      raw: f
    };

    HGBS_FLIGHT_CACHE[key] = entry;
    HISTORY_CACHE[id] = entry;
  });
});

departures.forEach(f => {
  const flightNo = extractFlightNo(f);
  const reg = extractReg(f);

  if (!flightNo) return;

  const status = extractStatus(f);
  const apiId = extractApiId(f);
  const hgsbAt = f.createDate || f.createdDate || f.insertDate || f.createdAt || f.statusDate || '';

  getFlightNoVariantsInside(flightNo).forEach(variantFlightNo => {
    const id = generateFlightId('GİDİŞ', variantFlightNo, reg, queryDate);
    const key = makeHGBSKey('GİDİŞ', variantFlightNo, reg, queryDate);

    const entry = {
      id,
      flightDate: queryDate,
      flightNo: variantFlightNo,
      originalFlightNo: flightNo,
      reg,
      type: 'GİDİŞ',
      status,
      apiId,
      hgsbAt,
      raw: f
    };

    HGBS_FLIGHT_CACHE[key] = entry;
    HISTORY_CACHE[id] = entry;
  });
});

  HISTORY_READY = true;
  HGBS_FETCHED_DATES.add(queryDate);

  console.log('HGBS canlı sorgu tamamlandı:', {
    date: hgbDate,
    arrivals: arrivals.length,
    departures: departures.length,
    total: Object.keys(HISTORY_CACHE).length
  });

  return HISTORY_CACHE;
}

async function refreshHGBSFlightsForRows(rows = STATE.rows) {
  for (const date of getUniqueFlightDates(rows)) {
    await refreshHGBSFlightsForDate(date);
  }

  return HISTORY_CACHE;
}

// Eski kod bu ismi çağırıyor. İsmi koruyoruz.
async function refreshHistoryFromSheet() {
  STATE.flightDate = todayStr();
  return await refreshHGBSFlightsForDate(STATE.flightDate);
}
//AUTOLOADER REFRESH30SEC FUNC
function syncRowsWithHGBSHistory() {
  if (!STATE.rows.length) return 0;

  let changed = 0;

  STATE.rows.forEach(row => {
    const oldStatus = row._status;
    const oldApiId = row._result?.apiId || '';

    applyHistoryToRow(row);

    const newApiId = row._result?.apiId || '';

    if (oldStatus !== row._status || oldApiId !== newApiId) {
      changed++;
    }
  });

  return changed;
}

function startHGSBAutoRefresh() {
  stopHGSBAutoRefresh();

  _hgsbAutoRefreshTimer = setInterval(async () => {
    if (!STATE.token) return;
    if (_hgsbAutoRefreshRunning) return;

    _hgsbAutoRefreshRunning = true;

    try {
      await refreshHGBSFlightsForRows();

      const changed = syncRowsWithHGBSHistory();

      if (STATE.rows.length && changed > 0) {
        renderTable();
      }

      console.log('HGBS auto refresh tamamlandı:', {
        time: new Date().toLocaleTimeString(),
        changed
      });

    } catch (err) {
      console.warn('HGBS auto refresh hatası:', err.message);
    } finally {
      _hgsbAutoRefreshRunning = false;
    }
  }, HGSB_AUTO_REFRESH_MS);
}

function stopHGSBAutoRefresh() {
  if (_hgsbAutoRefreshTimer) {
    clearInterval(_hgsbAutoRefreshTimer);
    _hgsbAutoRefreshTimer = null;
  }
}

function loadHistory() {
  return HISTORY_CACHE || {};
}

function isAlreadySent(id) {
  const entry = loadHistory()[id];

  // HGBS'de kayıt varsa durumunu ekranda göster.
  // IPTAL/TASLAK/KABULEDILDI ayrımı render tarafında status olarak basılır.
  return !!entry;
}

function markAsSent(id, meta = {}) {
  const now = new Date().toISOString();

  HISTORY_CACHE[id] = {
    id,
    flightDate: meta.flightDate || '',
    sentAt: now,
    status: 'HGBS_FOUND',
    flightNo: meta.flightNo || '',
    reg: meta.reg || '',
    type: meta.type || '',
    apiId: meta.apiId || '',
    hgsbBy: STATE.user.userName || '',
    hgsbAt: now
  };
}

function getHistoryEntry(id) {
  return loadHistory()[id] ?? null;
}

function getRowHistoryEntry(row) {
  if (!row) return null;
  row.flightDate = getRowFlightDate(row);
  row.id = getRowId(row);
  return getHistoryEntry(row.id) || null;
}

function getRowApiId(row) {
  const entry = getRowHistoryEntry(row) || {};
  const raw = entry.raw || {};

  return (
    row?._result?.apiId ||
    entry.apiId ||
    extractApiId(raw) ||
    raw.baseId ||
    raw.id ||
    raw.flightId ||
    ''
  );
}

function getRowStatusCode(row) {
  const entry = getRowHistoryEntry(row) || {};
  const raw = entry.raw || {};

  return normalizeStatus(
    entry.status ||
    raw.statusCode ||
    raw.status ||
    raw.statusName ||
    raw.durum ||
    ''
  );
}

function isDraftFlight(row) {
  return getRowStatusCode(row) === 'TASLAK';
}

function isSubmittedToCustomsFlight(row) {
  return getRowStatusCode(row) === 'GUMRUGESUNULDU';
}

function isWithdrawnFlight(row) {
  return getRowStatusCode(row) === 'GERICEKILDI';
}

async function refreshRowsAfterHGBSAction() {
  await refreshHGBSFlightsForRows();

  if (typeof syncRowsWithHGBSHistory === 'function') {
    syncRowsWithHGBSHistory();
  }

  if (STATE.rows.length) {
    renderTable();
  }
}

function removeFromHistory(id) {
  const oldEntry = HISTORY_CACHE[id] || getHistoryEntry(id) || {};
  const now = new Date().toISOString();

  HISTORY_CACHE[id] = {
    ...oldEntry,
    status: 'CANCELLED',
    cancelledBy: STATE.user.userName || '',
    cancelledAt: now
  };
}

async function pruneOldHistory() {
  // localStorage yok.
  // Her yenilemede HGBS canlı sorgulanır.
}
