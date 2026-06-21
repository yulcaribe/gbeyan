'use strict';

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
const STATE = {
  token:      null,
  user: { userName: '', taxFirmName: '', taxNumber: '', userType: '', userId: '', userProfileName: '' },
  crewNumber: 6,
  flightDate: todayStr(),
  rows: []
};

let _modalPendingIndex = null;
let _modalForce = false;
let _modalArrManual  = false;
let _modalDepManual  = false;
let _pendingEtaValues   = null;
let _pendingCaptainName = '';

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function todayStr() {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function convertAircraftType(csvType) {
  const t = String(csvType ?? '').trim().toUpperCase().replace(/\s+/g,'');
  const map = {
    'A320-1':'A320-320','A320-2':'A320-200',
    'A321-1':'A321-321','A321-2':'A321-200','A321NEO':'A21N-32Q',
    'A330-3':'A333-333','A350-9':'A359-359',
    'B737-2':'B732-732','B737-8':'B738-738','B737-9':'B739-739',
    'B767-3':'B763-763','B777-3':'B773-773',
    'SU95':'SU95-SU9',
    'C25C':'OZEL-JET','CL850':'OZEL-JET','G280':'OZEL-JET','LJ60':'OZEL-JET','ONSA':'OZEL-JET'
  };
  return map[t] ?? 'OZEL-JET';
}

function generateFlightId(type, flightNo, reg, date) {
  const raw = encodeURIComponent([type, flightNo, reg, date].join('|'));
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

function getNationalityCode(tailNumber) {
  const reg = String(tailNumber ?? '').trim().toUpperCase().replace(/\s+/g,'').replace(/-/g,'');
  if (!reg || reg === '-') return 'TR';
  return NATIONALITY_PREFIX_MAP[reg.substring(0, 2)] ?? 'TR';
}

function normalizeCsvTimeForInput(timeValue) {
  const v = String(timeValue ?? '').trim();
  if (!v || v === '-') return '';
  const m = v.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) return m[1].padStart(2,'0') + ':' + m[2];
  const m2 = v.match(/^(\d{1,2})(\d{2})$/);
  if (m2) return m2[1].padStart(2,'0') + ':' + m2[2];
  return v;
}

function subtractHoursFromDateTime(dateVal, timeVal, hours) {
  if (!dateVal || !timeVal) return { date: dateVal || '', time: timeVal || '' };
  const [y, mo, d] = dateVal.split('-').map(Number);
  const [h, mi]    = timeVal.split(':').map(Number);
  const dt = new Date(y, mo - 1, d, h, mi);
  if (Number.isNaN(dt.getTime())) return { date: dateVal, time: timeVal };
  dt.setHours(dt.getHours() - hours);
  return {
    date: [dt.getFullYear(), String(dt.getMonth()+1).padStart(2,'0'), String(dt.getDate()).padStart(2,'0')].join('-'),
    time: String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0')
  };
}

function toHgsbIso(dateVal, timeVal) {
  if (!dateVal || !timeVal) return '';
  return `${dateVal}T${timeVal}:00+03:00`;
}

function toHgsbDisplayDate(dateVal) {
  if (!dateVal) return '';
  const [y, m, d] = dateVal.split('-');
  return `${d}.${m}.${y}`;
}

// ─────────────────────────────────────────────
//  HGBS live history helpers - no localStorage cache
// ─────────────────────────────────────────────

let HISTORY_CACHE = {};
let HISTORY_READY = false;
let HGBS_FLIGHT_CACHE = {};
let HGBS_FETCHED_DATES = new Set();
let _hgsbAutoRefreshTimer = null;
let _hgsbAutoRefreshRunning = false;

const AIRLINE_CODE_ALIASES = {
  SXS: 'XQ',
  XQ: 'SXS',
  FHY: 'FH',
  FH: 'FHY',
  STW: '2S',
  '2S': 'STW',
  ENT: 'E4',
  E4: 'ENT',
  TWI: 'TI',
  TI: 'TWI',
  THY: 'TK',
  TK: 'THY',
  TKJ: 'VF',
  VF: 'TKJ',
  FOE: 'OE',
  OE: 'FOE',
  FIA: '5F',
  '5F': 'FIA'
};

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





// ─────────────────────────────────────────────
//  API
// ─────────────────────────────────────────────
async function apiCall(method, path, body) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*'
  };
  if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    localStorage.removeItem(KEY_TOKEN);
    STATE.token = null;
    showLoginScreen('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
    throw new Error('401 Unauthorized');
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok || (data.status && data.status >= 400)) {
    const errMsg = Array.isArray(data.error) ? data.error.join(', ')
      : data.error || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  if (data.error && Array.isArray(data.error) && data.error.length) {
    throw new Error(data.error.join(', '));
  }

  return data;
}

// ─────────────────────────────────────────────
//  LOG-IN PARCASI
// ─────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('inputUser').value.trim();
  const password = document.getElementById('inputPass').value.trim();
  const btn = document.getElementById('loginBtn');

  const userTypeEl = document.getElementById('loginUserType');
  const selectedUserType = (userTypeEl?.value || 'MUK').trim();

  if (!username || !password) {
    showLoginAlert('Kullanıcı adı ve şifre boş bırakılamaz.', 'error');
    return;
  }

  if (!selectedUserType) {
    showLoginAlert('Kullanıcı tipi seçilmelidir.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor...';
  clearLoginAlert();

  try {
    const res = await apiCall('POST', '/api/Account/Login?api-version=1.0', {
      userName: username,
      userPassword: password,
      userType: selectedUserType
    });

    const d = res.data;

    const token = d.userToken;

    const user = {
      userName:        d.userName        ?? '',
      taxFirmName:     d.taxFirmName     ?? '',
      taxNumber:       d.taxNumber       ?? '',
      userType:        d.userType        ?? selectedUserType,
      userId:          d.userId          ?? '',
      userProfileName: d.userProfileName ?? ''
    };

    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_USER, JSON.stringify(user));

    STATE.token = token;
    STATE.user  = user;

    showMainScreen();
  } catch (err) {
    if (!err.message.includes('401')) {
      showLoginAlert(err.message, 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
}

function logout() {
  stopHGSBAutoRefresh();

  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
  STATE.token = null;
  STATE.user  = { userName:'', taxFirmName:'', taxNumber:'', userType:'', userId:'', userProfileName:'' };
  STATE.rows  = [];
  showLoginScreen();
}

// ─────────────────────────────────────────────
//  Screen switching
// ─────────────────────────────────────────────
function showLoginScreen(msg) {
  document.getElementById('mainSection').style.display = 'none';
  document.getElementById('loginSection').style.display = 'flex';
  if (msg) showLoginAlert(msg, 'warning');
}

async function showMainScreen() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainSection').style.display  = 'block';

  await refreshHistoryFromSheet();

  pruneOldHistory();
  renderUserInfo();
  initToolbar();
  openHistoryModal();
}

async function showMainScreen() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainSection').style.display  = 'block';

  await refreshHistoryFromSheet();

  pruneOldHistory();
  renderUserInfo();
  initToolbar();
  openHistoryModal();

  startHGSBAutoRefresh();
}




function showLoginAlert(msg, type = 'error') {
  document.getElementById('loginAlert').innerHTML =
    `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
}

function clearLoginAlert() {
  document.getElementById('loginAlert').innerHTML = '';
}

function showGlobalAlert(msg, type = 'info') {
  document.getElementById('globalAlert').innerHTML =
    `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { document.getElementById('globalAlert').innerHTML = ''; }, 5000);
}

// ─────────────────────────────────────────────
//  User info header
// ─────────────────────────────────────────────
function renderUserInfo() {
  const u = STATE.user;
  const initial = (u.userName || '?')[0].toUpperCase();
  document.getElementById('avatarInitial').textContent = initial;
  document.getElementById('uiUserName').textContent = u.userName || '—';
  document.getElementById('uiUserSub').textContent =
    [u.taxFirmName, u.userProfileName].filter(Boolean).join(' · ');
}

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

// ─────────────────────────────────────────────
//  Payload builder
// ─────────────────────────────────────────────
function buildPayload(row, crewNum, captainName, etaValues) {
  const nationalityCode = getNationalityCode(row.reg);
  const base = {
    flightNumber:          row.flightNo,
    tailNumber:            row.reg,
    airCraftTypeCode:      row.hgsbAircraftType,
    companyCode:           row.ac,
    nationalityCode,
    crewNumber:            crewNum,
    captainNameSurname:    captainName || '',
    declarant:             STATE.user.taxFirmName,
    authAgentNameSurname:  STATE.user.userName,
    customCode:            '070200',
    varisCikisBildirimNo:  '',
    isAutoConfirmVBCB:     false,
    isPlaneContinueAbroad: false,
    id:                    ''
  };

  if (row.type === 'GELİŞ') {
    const actualArrDate = etaValues.actualArrDate || etaValues.arrivalDateEta;
    const actualArrTime = etaValues.actualArrTime || etaValues.arrivalTimeEta;
    return {
      ...base,
      flightTypeCode:      'GLS',
      arrivalPortCode:     'AYT',
      departurePortCode:   row.departureAirport,
      arrivalDateEta:      toHgsbIso(etaValues.arrivalDateEta, etaValues.arrivalTimeEta),
      arrivalDateEtaStr:   toHgsbDisplayDate(etaValues.arrivalDateEta),
      arrivalTimeEta:      etaValues.arrivalTimeEta,
      departureDateEta:    null,
      departureDateEtaStr: '',
      departureTimeEta:    '',
      arrivalDate:         toHgsbIso(actualArrDate, actualArrTime),
      arrivalDateStr:      toHgsbDisplayDate(actualArrDate),
      arrivalTime:         actualArrTime,
      departureDate:       toHgsbIso(etaValues.actualDepDate, etaValues.actualDepTime),
      departureDateStr:    toHgsbDisplayDate(etaValues.actualDepDate),
      departureTime:       etaValues.actualDepTime
    };
  }

  // GİDİŞ
  return {
    ...base,
    flightTypeCode:      'GDS',
    arrivalPortCode:     row.arrivalAirport,
    departurePortCode:   'AYT',
    arrivalDateEta:      null,
    arrivalDateEtaStr:   '',
    arrivalTimeEta:      '',
    departureDateEta:    toHgsbIso(etaValues.departureDateEta, etaValues.departureTimeEta),
    departureDateEtaStr: toHgsbDisplayDate(etaValues.departureDateEta),
    departureTimeEta:    etaValues.departureTimeEta,
    departureDate:       toHgsbIso(etaValues.actualDepDate, etaValues.actualDepTime),
    departureDateStr:    toHgsbDisplayDate(etaValues.actualDepDate),
    departureTime:       etaValues.actualDepTime,
    arrivalDate:         toHgsbIso(etaValues.actualArrDate, etaValues.actualArrTime),
    arrivalDateStr:      toHgsbDisplayDate(etaValues.actualArrDate),
    arrivalTime:         etaValues.actualArrTime
  };
}

function buildDefaultEtaValues(row) {
  const today = getRowFlightDate(row);
  const time  = normalizeCsvTimeForInput(row.time);
  const m3 = subtractHoursFromDateTime(today, time, 3);
  const p3 = subtractHoursFromDateTime(today, time, -3);
  if (row.type === 'GELİŞ') {
    return {
      arrivalDateEta: today, arrivalTimeEta: time,
      actualArrDate:  today, actualArrTime:  time,
      actualDepDate:  m3.date, actualDepTime: m3.time,
      departureDateEta: today, departureTimeEta: time
    };
  }
  return {
    arrivalDateEta: today, arrivalTimeEta: time,
    actualArrDate:  p3.date, actualArrTime: p3.time,
    actualDepDate:  today,   actualDepTime: time,
    departureDateEta: today, departureTimeEta: time
  };
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
//  Modal
// ─────────────────────────────────────────────
function openModal(index, force) {
  const row = STATE.rows[index];
  _modalPendingIndex = index;
  _modalForce = force;
  _modalArrManual = false;
  _modalDepManual = false;

  document.getElementById('modalCrewInput').value = STATE.crewNumber;
  document.getElementById('modalCaptainName').value = '';
  document.getElementById('modalWarningBanner').style.display = force ? 'block' : 'none';
  document.getElementById('modalSubtitle').textContent =
    `${row.type} / ${row.flightNo} / ${row.departureAirport} → ${row.arrivalAirport}`;

  setModalEtaDefaults(row);
  setModalFieldVisibility(row);
  setModalStatus('', '');
  document.getElementById('payloadWrap').style.display = 'none';
  document.getElementById('payloadToggleIcon').textContent = '▶';
  const btn = document.getElementById('modalConfirmBtn');
  btn.disabled = false;
  btn.textContent = 'Gönder →';
  btn.onclick = () => confirmAndSend();
  updateModalPreview();

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('modalCrewInput').focus();
}

function setModalEtaDefaults(row) {
  const today = getRowFlightDate(row);
  const time  = normalizeCsvTimeForInput(row.time);
  const m3 = subtractHoursFromDateTime(today, time, 3);
  const p3 = subtractHoursFromDateTime(today, time, -3);

  document.getElementById('modalArrEtaDate').value = today;
  document.getElementById('modalArrEtaTime').value = time;
  document.getElementById('modalDepEtaDate').value = today;
  document.getElementById('modalDepEtaTime').value = time;

  if (row.type === 'GİDİŞ') {
    document.getElementById('modalActualDepDate').value = today;
    document.getElementById('modalActualDepTime').value = time;
    document.getElementById('modalActualArrDate').value = p3.date;
    document.getElementById('modalActualArrTime').value = p3.time;
  } else {
    document.getElementById('modalActualArrDate').value = today;
    document.getElementById('modalActualArrTime').value = time;
    document.getElementById('modalActualDepDate').value = m3.date;
    document.getElementById('modalActualDepTime').value = m3.time;
  }
}

function setModalFieldVisibility(row) {
  const isArr = row.type === 'GELİŞ';
  document.querySelectorAll('.modal-arr-eta').forEach(el => { el.style.display = isArr ? '' : 'none'; });
  document.querySelectorAll('.modal-dep-eta').forEach(el => { el.style.display = isArr ? 'none' : ''; });

  if (isArr) {
    document.getElementById('lblActualArrDate').textContent = 'Gerçek Varış Tarihi';
    document.getElementById('lblActualArrTime').textContent = 'Gerçek Varış Saati';
    document.getElementById('lblActualDepDate').innerHTML = 'Gerçek Kalkış Tarihi <small>(ETA−3s)</small>';
    document.getElementById('lblActualDepTime').innerHTML = 'Gerçek Kalkış Saati <small>(ETA−3s)</small>';
  } else {
    document.getElementById('lblActualArrDate').innerHTML = 'Gerçek Varış Tarihi <small>(ETA+3s)</small>';
    document.getElementById('lblActualArrTime').innerHTML = 'Gerçek Varış Saati <small>(ETA+3s)</small>';
    document.getElementById('lblActualDepDate').textContent = 'Gerçek Kalkış Tarihi';
    document.getElementById('lblActualDepTime').textContent = 'Gerçek Kalkış Saati';
  }
}

function getModalEtaValues() {
  return {
    arrivalDateEta:   document.getElementById('modalArrEtaDate').value,
    arrivalTimeEta:   document.getElementById('modalArrEtaTime').value,
    actualArrDate:    document.getElementById('modalActualArrDate').value,
    actualArrTime:    document.getElementById('modalActualArrTime').value,
    actualDepDate:    document.getElementById('modalActualDepDate').value,
    actualDepTime:    document.getElementById('modalActualDepTime').value,
    departureDateEta: document.getElementById('modalDepEtaDate').value,
    departureTimeEta: document.getElementById('modalDepEtaTime').value
  };
}

function validateModalEtaValues(row, eta) {
  const fail = (message, focusId) => ({ isValid: false, message, focusId });
  if (row.type === 'GELİŞ') {
    if (!eta.arrivalDateEta)  return fail('Geliş ETA tarihi doldurulmalıdır.',     'modalArrEtaDate');
    if (!eta.arrivalTimeEta)  return fail('Geliş ETA saati doldurulmalıdır.',      'modalArrEtaTime');
    if (!eta.actualArrDate)   return fail('Gerçek varış tarihi doldurulmalıdır.',  'modalActualArrDate');
    if (!eta.actualArrTime)   return fail('Gerçek varış saati doldurulmalıdır.',   'modalActualArrTime');
    if (!eta.actualDepDate)   return fail('Gerçek kalkış tarihi doldurulmalıdır.', 'modalActualDepDate');
    if (!eta.actualDepTime)   return fail('Gerçek kalkış saati doldurulmalıdır.',  'modalActualDepTime');
  } else {
    if (!eta.departureDateEta) return fail('Gidiş ETA tarihi doldurulmalıdır.',    'modalDepEtaDate');
    if (!eta.departureTimeEta) return fail('Gidiş ETA saati doldurulmalıdır.',     'modalDepEtaTime');
    if (!eta.actualDepDate)    return fail('Gerçek kalkış tarihi doldurulmalıdır.','modalActualDepDate');
    if (!eta.actualDepTime)    return fail('Gerçek kalkış saati doldurulmalıdır.', 'modalActualDepTime');
    if (!eta.actualArrDate)    return fail('Gerçek varış tarihi doldurulmalıdır.', 'modalActualArrDate');
    if (!eta.actualArrTime)    return fail('Gerçek varış saati doldurulmalıdır.',  'modalActualArrTime');
  }
  return { isValid: true, message: '', focusId: '' };
}

function syncModalArrDerived() {
  const d = document.getElementById('modalArrEtaDate').value;
  const t = document.getElementById('modalArrEtaTime').value;
  if (!_modalArrManual) {
    document.getElementById('modalActualArrDate').value = d;
    document.getElementById('modalActualArrTime').value = t;
  }
  if (!_modalDepManual) {
    const m3 = subtractHoursFromDateTime(d, t, 3);
    document.getElementById('modalActualDepDate').value = m3.date;
    document.getElementById('modalActualDepTime').value = m3.time;
  }
}

function syncModalDepDerived() {
  const d = document.getElementById('modalDepEtaDate').value;
  const t = document.getElementById('modalDepEtaTime').value;
  if (!_modalDepManual) {
    document.getElementById('modalActualDepDate').value = d;
    document.getElementById('modalActualDepTime').value = t;
  }
  if (!_modalArrManual) {
    const p3 = subtractHoursFromDateTime(d, t, -3);
    document.getElementById('modalActualArrDate').value = p3.date;
    document.getElementById('modalActualArrTime').value = p3.time;
  }
}

function onModalCrewInput(val) {
  const n = parseInt(val, 10);
  if (!Number.isNaN(n) && n >= 0) {
    STATE.crewNumber = n;
    const el = document.getElementById('crewInput');
    if (el) el.value = n;
  }
  updateModalPreview();
}

function updateModalPreview() {
  const row = STATE.rows[_modalPendingIndex];
  if (!row) return;

  const crewNum     = parseInt(document.getElementById('modalCrewInput').value, 10);
  const captainName = document.getElementById('modalCaptainName').value.trim();
  const eta         = getModalEtaValues();
  const nat         = getNationalityCode(row.reg);

  document.getElementById('modalSummary').innerHTML =
    buildModalSummary(row, Number.isNaN(crewNum) ? '—' : crewNum, captainName, nat, eta);

  const pre = document.getElementById('modalPayloadPre');
  if (Number.isNaN(crewNum) || crewNum < 0) {
    pre.textContent = 'Geçerli bir crew sayısı giriniz.';
    return;
  }
  const v = validateModalEtaValues(row, eta);
  if (!v.isValid) {
    pre.textContent = 'Önizleme için ' + v.message;
    return;
  }
  try {
    pre.textContent = JSON.stringify(buildPayload(row, crewNum, captainName, eta), null, 2);
  } catch (e) {
    pre.textContent = 'Hata: ' + e.message;
  }
}

function buildModalSummary(row, crewNum, captainName, nat, eta) {
  const isArr   = row.type === 'GELİŞ';
  const etaDate = isArr ? eta.arrivalDateEta    : eta.departureDateEta;
  const etaTime = isArr ? eta.arrivalTimeEta    : eta.departureTimeEta;
  const items = [
    ['Tip',           `${row.type} (${isArr ? 'GLS' : 'GDS'})`],
    ['Tarih',         toHgbDate(getRowFlightDate(row))],
    ['Uçuş No',       row.flightNo],
    ['Güzergah',      `${row.departureAirport}→${row.arrivalAirport}`],
    ['CSV Saat',      row.time],
    [isArr ? 'Geliş ETA' : 'Gidiş ETA', `${etaDate||'—'} ${etaTime||''}`],
    ['Gerçek Varış',  `${eta.actualArrDate||'—'} ${eta.actualArrTime||''}`],
    ['Gerçek Kalkış', `${eta.actualDepDate||'—'} ${eta.actualDepTime||''}`],
    ['Uçak Tipi',     row.hgsbAircraftType],
    ['REG',           row.reg],
    ['Milliyet',      nat],
    ['Crew',          crewNum],
    ['Kaptan',        captainName || '—'],
    ['Mükellef',      STATE.user.taxFirmName],
    ['Yetkili',       STATE.user.userName]
  ];
  return items.map(([l, v]) =>
    `<div class="summary-item"><span>${escapeHtml(l)}</span><strong>${escapeHtml(String(v))}</strong></div>`
  ).join('');
}

function togglePayloadPreview() {
  const wrap = document.getElementById('payloadWrap');
  const icon = document.getElementById('payloadToggleIcon');
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  icon.textContent   = isOpen ? '▶' : '▼';
}

function setModalStatus(type, message) {
  const el = document.getElementById('modalStatusLine');
  if (!el) return;
  el.className = 'modal-status-line';
  if (!type || !message) { el.textContent = ''; return; }
  el.classList.add('show', type);
  el.textContent = message;
}

function confirmAndSend() {
  const index = _modalPendingIndex;
  const force = _modalForce;
  const row   = STATE.rows[index];
  if (!row) return;

  const crewNum     = parseInt(document.getElementById('modalCrewInput').value, 10);
  const captainName = document.getElementById('modalCaptainName').value.trim();
  const eta         = getModalEtaValues();

  if (Number.isNaN(crewNum) || crewNum < 0) {
    setModalStatus('error', 'Crew sayısı geçerli bir sayı olmalıdır.');
    document.getElementById('modalCrewInput').focus();
    return;
  }
  const v = validateModalEtaValues(row, eta);
  if (!v.isValid) {
    setModalStatus('error', v.message);
    document.getElementById(v.focusId)?.focus();
    return;
  }

  STATE.crewNumber    = crewNum;
  _pendingEtaValues   = eta;
  _pendingCaptainName = captainName;

  const btn = document.getElementById('modalConfirmBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor...';
  }
  setModalStatus('info', 'HGSB\'ye gönderiliyor...');

  sendFlight(index, force).then(ok => {
    closeModal();
    if (ok) {
      openSuccessModal(index);
    } else {
      openErrorModal(index);
    }
  });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  _modalPendingIndex = null;
  setModalStatus('', '');
}

// ─────────────────────────────────────────────
//  Send
// ─────────────────────────────────────────────
async function sendFlight(index, force = false) {
  const row = STATE.rows[index];
  if (row._status === 'already_sent' && !force) return false;
  if (row._status === 'sending') return false;

  row._status = 'sending';
  updateRow(index);

  try {
    const eta     = _pendingEtaValues   ?? buildDefaultEtaValues(row);
    const captain = _pendingCaptainName ?? '';
    const crew    = STATE.crewNumber;
    const payload = buildPayload(row, crew, captain, eta);

    let apiId;
    if (MOCK_MODE) {
      await delay(400);
      apiId = 'mock-' + Math.random().toString(36).slice(2, 10);
    } else {
      const data = await apiCall('PUT', '/api/Flight/SetFlight?api-version=1.0', payload);
      apiId = data?.data?.baseId ?? data?.data?.id ?? data?.data ?? '';
    }

    row._status = 'success';
    row._result = { apiId };
    markAsSent(row.id, { flightDate: getRowFlightDate(row), flightNo: row.flightNo, type: row.type, reg: row.reg, apiId });
    updateRow(index);
    return true;

  } catch (err) {
    if (!err.message.includes('401')) {
      row._status = 'error';
      row._error  = err.message;
    }
    updateRow(index);
    return false;
  }
}


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
        <input type="text" id="editAircraftType" value="${escapeHtml(d.airCraftTypeCode || '')}">
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

function buildFlightEditPayload() {
  const d = _currentFlightDetail;
  if (!d) throw new Error('Uçuş detayı bulunamadı.');

  const flightTypeCode = d.flightTypeCode;

  const flightNumber = getFlightEditVal('editFlightNumber').toUpperCase().replace(/\s+/g, '');
  const companyCode  = getFlightEditVal('editCompanyCode').toUpperCase().replace(/\s+/g, '');
  const tailNumber   = getFlightEditVal('editTailNumber').toUpperCase().replace(/\s+/g, '');
  const aircraftType = getFlightEditVal('editAircraftType').toUpperCase().replace(/\s+/g, '');

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



// ── Hava Yolu Beyan — state ──────────────────────────────────────
let _hvbState = {};

function hvbInitState() {
  _hvbState = {
    isFlightContinue:          false,
    isFlightChangeInternalLine:false,
    isDivert:                  false,
    isEmergencyLand:           false,
    hasCargo:                  false,
    hasDutyFree:               false,
    hasUndecCargo:             false,
    hasCatering:               false,
    hasOutOfCatering:          false,
    hasPassenger:              true,
    nextAirPortCode:           '',
    passengerUnloadThisPort:      0,
    passengerBabyUnloadThisPort:  0,
    passengerLoadThisPort:        0,
    passengerBabyLoadThisPort:    0,
    passengerUnloadOtherPort:     0,
    passengerBabyUnloadOtherPort: 0,
    fuelNational:  0,
    fuelForeign:   0,
    otherIssues:   'NILL',
    cargoLoadThisPortUnit:    0,
    cargoUnloadThisPortUnit:  0,
    cargoUnloadOtherPortUnit: 0,
    cargoLoadThisPortKgm:     0,
    cargoUnloadThisPortKgm:   0,
    cargoUnloadOtherPortKgm:  0,
  };
}

function hvbSetToggle(key, val) {
  _hvbState[key] = val;
  const evetBtn  = document.getElementById('hvb_' + key + '_evet');
  const hayirBtn = document.getElementById('hvb_' + key + '_hayir');
  if (evetBtn && hayirBtn) {
    if (val) {
      evetBtn.style.background  = '#1e3a5f'; evetBtn.style.color  = '#fff';
      hayirBtn.style.background = '#e2e8f0'; hayirBtn.style.color = '#64748b';
    } else {
      hayirBtn.style.background = '#1e3a5f'; hayirBtn.style.color = '#fff';
      evetBtn.style.background  = '#e2e8f0'; evetBtn.style.color  = '#64748b';
    }
  }
  if (key === 'hasPassenger') {
    const pf = document.getElementById('hvbPassengerFields');
    if (pf) pf.style.display = val ? 'grid' : 'none';
  }
  if (key === 'hasCargo') {
    const cf = document.getElementById('hvbCargoFields');
    if (cf) cf.style.display = val ? 'grid' : 'none';
  }
  if (key === 'isFlightContinue') {
    const nf = document.getElementById('hvbNextAirportFields');
    if (nf) nf.style.display = val ? 'grid' : 'none';
    if (!val) _hvbState.nextAirPortCode = '';
  }
}

function hvbUpdateInt(key, raw) {
  const n = parseInt(String(raw ?? '').replace(',', '.'), 10);
  _hvbState[key] = Number.isFinite(n) && n >= 0 ? n : 0;
}

function hvbParseDecimal(raw) {
  const normalized = String(raw ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function hvbUpdateDecimal(key, raw) {
  _hvbState[key] = hvbParseDecimal(raw);
}

function hvbDecimalInputValue(value) {
  if (value === undefined || value === null || value === '') return '0';
  const n = typeof value === 'number' ? value : hvbParseDecimal(value);
  return Number.isFinite(n) ? String(n).replace('.', ',') : '0';
}

function hvbFormatDecimal(value) {
  if (value === undefined || value === null || value === '') return '—';
  const n = typeof value === 'number' ? value : hvbParseDecimal(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(n);
}

function hvbUpdateText(key, raw, opts = {}) {
  let value = String(raw ?? '').trim();
  if (opts.uppercase) value = value.toUpperCase().replace(/\s+/g, '');
  _hvbState[key] = value;
}

// ── Hava Yolu Beyan — modal ──────────────────────────────────────
let _hvbDeclareIndex = null;

function hvbYesNo(value) {
  return value ? 'Evet' : 'Hayır';
}

function hvbReadonlySection(title, body) {
  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.05em;margin-bottom:4px">${title}</div>
      ${body}
    </div>`;
}

function hvbReadonlyRow(label, value) {
  return `<div class="modal-row"><span class="lbl">${escapeHtml(label)}</span><span class="val">${escapeHtml(value ?? '—')}</span></div>`;
}

const HVB_READONLY_CREW_TYPE_LABELS = {
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

function getCrewField(item, keys) {
  for (const key of keys) {
    if (item && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
      return item[key];
    }
  }
  return '';
}

function buildHvbCrewReadonlyHtml(list, errorMessage) {
  if (errorMessage) {
    return hvbReadonlySection('Ekip Listesi', `
      <div class="alert alert-warning" style="margin:0">
        Ekip listesi sorgulanamadı: ${escapeHtml(errorMessage)}
      </div>
    `);
  }

  if (!Array.isArray(list) || !list.length) {
    return hvbReadonlySection('Ekip Listesi', `
      ${hvbReadonlyRow('Kayıtlı Ekip Sayısı', 0)}
      <div style="font-size:13px;color:#64748b;padding-top:8px">Bu uçuş için sistemde kayıtlı ekip bulunamadı.</div>
    `);
  }

  const cards = list.map((item, i) => {
    const typeCode = String(getCrewField(item, ['crewTypeCode', 'typeCode', 'crewType', 'positionCode'])).toUpperCase();
    const typeText = getCrewField(item, ['crewTypeText', 'typeText', 'positionText']) || HVB_READONLY_CREW_TYPE_LABELS[typeCode] || '';
    const name = getCrewField(item, ['name', 'firstName', 'givenName']);
    const surname = getCrewField(item, ['surname', 'lastName', 'familyName']);
    const fullName = [name, surname].filter(Boolean).join(' ') || getCrewField(item, ['nameSurname', 'fullName', 'crewName']);
    const nationality = getCrewField(item, ['nationalityCode', 'nationalityText', 'nationality']);
    const identityCode = getCrewField(item, ['identityCode', 'documentTypeCode', 'documentType']);
    const identityNumber = getCrewField(item, ['identityNumber', 'passportNumber', 'documentNumber']);

    return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:10px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px">
          <strong style="font-size:13px;color:#1e293b">#${i + 1} ${escapeHtml(fullName || 'İsimsiz Ekip')}</strong>
          <span style="font-size:12px;color:#64748b">${escapeHtml(typeCode + (typeText ? ' - ' + typeText : ''))}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12px;color:#475569">
          <div><strong>Milliyet:</strong> ${escapeHtml(nationality || '—')}</div>
          <div><strong>Belge:</strong> ${escapeHtml([identityCode, identityNumber].filter(Boolean).join(' / ') || '—')}</div>
        </div>
      </div>`;
  }).join('');

  return hvbReadonlySection('Ekip Listesi', `
    ${hvbReadonlyRow('Kayıtlı Ekip Sayısı', list.length)}
    ${cards}
  `);
}

function CARGO_GET_ENDPOINT(baseId) {
  return `/api/Flight/GetCargos?baseId=${encodeURIComponent(baseId)}&api-version=1.0`;
}

function normalizeApiCargoList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && Array.isArray(res.data.cargos)) return res.data.cargos;
  if (res.data && Array.isArray(res.data.items)) return res.data.items;
  if (Array.isArray(res.cargos)) return res.cargos;
  return [];
}

function hvbStateHasCargo() {
  if (_hvbState.hasCargo) return true;
  return [
    'cargoLoadThisPortUnit','cargoUnloadThisPortUnit','cargoUnloadOtherPortUnit',
    'cargoLoadThisPortKgm','cargoUnloadThisPortKgm','cargoUnloadOtherPortKgm'
  ].some(key => hvbParseDecimal(_hvbState[key]) > 0);
}

function buildHvbCargoManifestReadonlyHtml(list, errorMessage) {
  if (errorMessage) {
    return hvbReadonlySection('Kargo Manifestosu', `
      <div class="alert alert-warning" style="margin:0">
        Kargo manifestosu sorgulanamadı: ${escapeHtml(errorMessage)}
      </div>
    `);
  }

  if (!Array.isArray(list) || !list.length) {
    return hvbReadonlySection('Kargo Manifestosu', `
      ${hvbReadonlyRow('Kayıtlı Kargo Sayısı', 0)}
      <div style="font-size:13px;color:#64748b;padding-top:8px">Bu uçuş için sistemde kayıtlı kargo manifestosu bulunamadı.</div>
    `);
  }

  const totalPieces = list.reduce((sum, item) => sum + (parseInt(getCrewField(item, ['numOfPsc', 'numOfPieces', 'pieceCount']), 10) || 0), 0);
  const totalKgm = list.reduce((sum, item) => sum + hvbParseDecimal(getCrewField(item, ['grossKgm', 'grossKg', 'weightKgm'])), 0);

  const cards = list.map((item, i) => {
    const awb = getCrewField(item, ['awbNumber', 'awbNo', 'airWaybillNumber']);
    const desc = getCrewField(item, ['goodDesc', 'goodsDesc', 'description']);
    const cargoType = [
      getCrewField(item, ['cargoTypeCode']),
      getCrewField(item, ['cargoTypeText'])
    ].filter(Boolean).join(' - ');
    const origin = [getCrewField(item, ['portOrgCode']), getCrewField(item, ['portOrgText'])].filter(Boolean).join(' - ');
    const destination = [getCrewField(item, ['portDesCode']), getCrewField(item, ['portDesText'])].filter(Boolean).join(' - ');
    const transfer = [getCrewField(item, ['portTraCode']), getCrewField(item, ['portTraText'])].filter(Boolean).join(' - ');
    const grossKgm = getCrewField(item, ['grossKgm', 'grossKg', 'weightKgm']);
    const pieces = getCrewField(item, ['numOfPsc', 'numOfPieces', 'pieceCount']);
    const createDate = getCrewField(item, ['createDateStr', 'createDate']);
    const handlingCodes = Array.isArray(item?.handlingCodes)
      ? item.handlingCodes.map(code => typeof code === 'string' ? code : [code?.code, code?.text].filter(Boolean).join(' - ')).filter(Boolean).join(', ')
      : '';

    return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:10px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px">
          <strong style="font-size:13px;color:#1e293b">#${i + 1} AWB ${escapeHtml(awb || '—')}</strong>
          <span style="font-size:12px;color:#64748b">${escapeHtml(cargoType || '—')}</span>
        </div>
        <div style="font-size:12px;color:#475569;margin-bottom:6px"><strong>Eşya:</strong> ${escapeHtml(desc || '—')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12px;color:#475569">
          <div><strong>Çıkış:</strong> ${escapeHtml(origin || '—')}</div>
          <div><strong>Varış:</strong> ${escapeHtml(destination || '—')}</div>
          <div><strong>Transfer:</strong> ${escapeHtml(transfer || '—')}</div>
          <div><strong>Kap / KG:</strong> ${escapeHtml((pieces ?? '—') + ' / ' + hvbFormatDecimal(grossKgm))}</div>
          <div><strong>Resmi Kullanım:</strong> ${item?.isOfficialUse ? 'Evet' : 'Hayır'}</div>
          <div><strong>Kayıt:</strong> ${escapeHtml(createDate || '—')}</div>
          ${handlingCodes ? `<div style="grid-column:1/-1"><strong>Handling:</strong> ${escapeHtml(handlingCodes)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return hvbReadonlySection('Kargo Manifestosu', `
    ${hvbReadonlyRow('Kayıtlı Kargo Sayısı', list.length)}
    ${hvbReadonlyRow('Toplam Kap / KG', `${totalPieces} / ${hvbFormatDecimal(totalKgm)}`)}
    ${cards}
  `);
}
function buildHvbReadonlyHtml(d, row, crewList = [], crewError = '', cargoList = [], cargoError = '') {
  const isDeparture = d.flightTypeCode === 'GDS';
  const statusLine = [d.statusCode, d.statusText].filter(Boolean).join(' — ') || getHGBSStatusLabel(row);

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div class="alert alert-info" style="margin-bottom:0">
      Bu ekran bilgi amaçlıdır. Alanlar değiştirilemez. Onayla ve Gönder dersen uçuş Gümrüğe Sunuldu durumuna alınır.
    </div>

    ${hvbReadonlySection('Uçuş Bilgisi', `
      ${hvbReadonlyRow('Durum', statusLine)}
      ${hvbReadonlyRow('Kayıt No', d.recordNumber || '—')}
      ${hvbReadonlyRow('Referans No', d.referenceNumber || '—')}
      ${hvbReadonlyRow('Uçuş No', d.flightNumber || row?.flightNo || '—')}
      ${hvbReadonlyRow('Tip', d.flightTypeText || d.flightTypeCode || row?.type || '—')}
      ${hvbReadonlyRow('Kuyruk / REG', d.tailNumber || row?.reg || '—')}
      ${hvbReadonlyRow('Kalkış', `${d.departurePortText || ''} (${d.departurePortCode || row?.departureAirport || '—'})`)}
      ${hvbReadonlyRow('Varış', `${d.arrivalPortText || ''} (${d.arrivalPortCode || row?.arrivalAirport || '—'})`)}
      ${hvbReadonlyRow('Şirket', d.companyInfo || d.companyCode || '—')}
    `)}

    ${hvbReadonlySection('Ekip Bilgisi', `
      ${hvbReadonlyRow('Kaptan', d.captainNameSurname || '—')}
      ${hvbReadonlyRow('Crew Sayısı', d.crewNumber ?? STATE.crewNumber ?? '—')}
      ${hvbReadonlyRow('Kayıtlı Ekip Sayısı', Array.isArray(crewList) ? crewList.length : 0)}
      ${hvbReadonlyRow('Mükellef', d.declarant || STATE.user.taxFirmName || '—')}
      ${hvbReadonlyRow('Yetkili', d.authAgentNameSurname || STATE.user.userName || '—')}
    `)}

    ${buildHvbCrewReadonlyHtml(crewList, crewError)}

    ${hvbStateHasCargo() ? buildHvbCargoManifestReadonlyHtml(cargoList, cargoError) : ''}

    ${hvbReadonlySection('Hava Yolu Beyan Formu', `
      ${hvbReadonlyRow('Seferin İç Hat Devamı Var Mı?', hvbYesNo(_hvbState.isFlightContinue))}
      ${_hvbState.isFlightContinue ? hvbReadonlyRow('Sonraki İç Hat İstasyonu', _hvbState.nextAirPortCode || '—') : ''}
      ${hvbReadonlyRow('İç Hat Uçuşa Mı Kaydırıldı?', hvbYesNo(_hvbState.isFlightChangeInternalLine))}
      ${hvbReadonlyRow('Divert Edilmiş Mi?', hvbYesNo(_hvbState.isDivert))}
      ${hvbReadonlyRow('Acil İniş Mi?', hvbYesNo(_hvbState.isEmergencyLand))}
      ${hvbReadonlyRow('Kargo Var Mı?', hvbYesNo(_hvbState.hasCargo))}
      ${hvbReadonlyRow(isDeparture ? 'Uçağa Yüklenecek Gümrüksüz Satış Eşyası Var Mı?' : 'Uçaktan İndirilecek Gümrüksüz Satış Eşyası Var Mı?', hvbYesNo(_hvbState.hasDutyFree))}
      ${hvbReadonlyRow('Manifestoya Ve Özet Beyana Kaydedilmeyen Eşya Var Mı?', hvbYesNo(_hvbState.hasUndecCargo))}
      ${hvbReadonlyRow(isDeparture ? 'Uçağa Yüklenecek İkram Malzemesi Var Mı?' : 'Uçaktan İndirilecek İkram Malzemesi Var Mı?', hvbYesNo(_hvbState.hasCatering))}
      ${hvbReadonlyRow(isDeparture ? 'Uçağa Yüklenecek ve Yolculara Verilecek İkram Harici Eşya Var Mı?' : 'Uçaktan İndirilecek ve Yolculara Dağıtılmamış İkram Harici Eşya Var Mı?', hvbYesNo(_hvbState.hasOutOfCatering))}
      ${hvbReadonlyRow('Yolcu Var Mı?', hvbYesNo(_hvbState.hasPassenger))}
    `)}

    ${hvbReadonlySection('Yolcu / Yük / Yakıt', `
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Yolcu Sayısı' : 'Bu Limana Çıkarılacak Yolcu Sayısı', isDeparture ? _hvbState.passengerLoadThisPort : _hvbState.passengerUnloadThisPort)}
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Bebek Yolcu Sayısı' : 'Bu Limana Çıkarılacak Bebek Yolcu Sayısı', isDeparture ? _hvbState.passengerBabyLoadThisPort : _hvbState.passengerBabyUnloadThisPort)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Yolcu Sayısı', _hvbState.passengerUnloadOtherPort)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Bebek Yolcu Sayısı', _hvbState.passengerBabyUnloadOtherPort)}
      ${hvbReadonlyRow('Yakıt Miktarı Milli KG', _hvbState.fuelNational)}
      ${hvbReadonlyRow('Yakıt Miktarı Yabancı KG', _hvbState.fuelForeign)}
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Yük Kap Adedi' : 'Bu Limana Çıkarılacak Yük Kap Adedi', isDeparture ? _hvbState.cargoLoadThisPortUnit : _hvbState.cargoUnloadThisPortUnit)}
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Yük KG' : 'Bu Limana Çıkarılacak Yük KG', isDeparture ? _hvbState.cargoLoadThisPortKgm : _hvbState.cargoUnloadThisPortKgm)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Yük Kap Adedi', _hvbState.cargoUnloadOtherPortUnit)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Yük KG', _hvbState.cargoUnloadOtherPortKgm)}
      ${hvbReadonlyRow('Açıklama / Diğer Hususlar', _hvbState.otherIssues || 'NILL')}
    `)}
  </div>`;
}

async function openDeclareHavayoluBeyanModal(index) {
  const row = STATE.rows[index];
  if (!row) return;

  const apiId = getRowApiId(row);
  if (!apiId) {
    alert('Beyan için HGBS API ID bulunamadı. Önce HGBS kayıtlarını yenile.');
    return;
  }

  _hvbDeclareIndex = index;
  _currentFlightBaseId = apiId;
  _currentFlightDetail = null;
  hvbInitState();

  const declareButtonText = isWithdrawnFlight(row) ? 'Tekrar Beyan Et' : 'Onayla ve Gönder';
  const btn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = declareButtonText;
    btn.onclick = () => submitHavayoluBeyanStatusAction();
  }

  document.getElementById('hvbModalSubtitle').textContent = `${row.type} / ${row.flightNo} / ${row.departureAirport} → ${row.arrivalAirport}`;
  document.getElementById('hvbModalBody').innerHTML =
    `<div style="text-align:center;padding:40px 0;color:#64748b;font-size:13px">Hava yolu beyan formu yükleniyor...</div>`;
  document.getElementById('havayoluBeyanOverlay').classList.remove('hidden');

  try {
    const flightRes = await apiCall('GET', `/api/Flight/GetFlight?baseId=${encodeURIComponent(apiId)}&api-version=1.0`);
    const detail = flightRes?.data || flightRes;

    if (!detail) {
      throw new Error('HGBS uçuş detayı boş döndü.');
    }

    _currentFlightDetail = detail;

    try {
      const airDecRes = await apiCall('GET', `/api/Flight/GetAirDec?baseId=${encodeURIComponent(apiId)}&api-version=1.0`);
      if (airDecRes && airDecRes.data) hvbPopulateFromApi(airDecRes.data);
    } catch (_) {
      // Hava yolu beyan kaydı yoksa default değerlerle bilgi ekranı gösterilir.
    }

    let crewList = [];
    let crewError = '';
    try {
      if (typeof CREW_GET_ENDPOINT === 'function' && typeof normalizeApiCrewList === 'function') {
        const crewRes = await apiCall('GET', CREW_GET_ENDPOINT(apiId));
        crewList = normalizeApiCrewList(crewRes);
      }
    } catch (crewErr) {
      crewError = crewErr.message || String(crewErr);
    }

    let cargoList = [];
    let cargoError = '';
    if (hvbStateHasCargo()) {
      try {
        const cargoRes = await apiCall('GET', CARGO_GET_ENDPOINT(apiId));
        cargoList = normalizeApiCargoList(cargoRes);
      } catch (cargoErr) {
        cargoError = cargoErr.message || String(cargoErr);
      }
    }

    document.getElementById('hvbModalSubtitle').textContent = [detail.tailNumber, detail.departurePortCode, detail.arrivalPortCode].filter(Boolean).join(' · ');
    document.getElementById('hvbModalBody').innerHTML = buildHvbReadonlyHtml(detail, row, crewList, crewError, cargoList, cargoError);

    if (btn) btn.disabled = false;

  } catch (err) {
    document.getElementById('hvbModalBody').innerHTML = `
      <div class="alert alert-error" style="margin-bottom:0">
        ${escapeHtml(err.message)}
      </div>`;
  }
}

async function submitHavayoluBeyanStatusAction() {
  const index = _hvbDeclareIndex;
  const row = STATE.rows[index];
  const apiId = getRowApiId(row) || _currentFlightBaseId;

  if (!row || !apiId) {
    alert('Beyan için HGBS API ID bulunamadı.');
    return;
  }

  const btn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    if (MOCK_MODE) {
      await delay(400);
    } else {
      await apiCall('POST', '/api/AirBase/StatusActionAgency?api-version=1.0', {
        id: apiId,
        action: 'GUMRUGESUNULDU',
        actionComment: '-'
      });
    }

    closeHavayoluBeyanModal();
    showGlobalAlert(`${row.flightNo} beyan edildi.`, 'info');
    await refreshRowsAfterHGBSAction();

  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText || 'Onayla ve Gönder'; }
  }
}

async function openHavayoluBeyanModal() {
  const d = _currentFlightDetail;
  if (!d) return;

  hvbInitState();

  const subtitle = [d.tailNumber, d.departurePortCode, d.arrivalPortCode].filter(Boolean).join(' · ');
  const hvbBtn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  if (hvbBtn) {
    hvbBtn.disabled = false;
    hvbBtn.textContent = 'Gönder';
    hvbBtn.onclick = () => submitHavayoluBeyan();
  }
  document.getElementById('hvbModalSubtitle').textContent = subtitle;
  document.getElementById('hvbModalBody').innerHTML =
    `<div style="text-align:center;padding:40px 0;color:#64748b;font-size:13px">Yükleniyor...</div>`;
  document.getElementById('havayoluBeyanOverlay').classList.remove('hidden');

  try {
    const res = await apiCall('GET', `/api/Flight/GetAirDec?baseId=${encodeURIComponent(_currentFlightBaseId)}&api-version=1.0`);
    if (res && res.data) hvbPopulateFromApi(res.data);
  } catch (_) {
    // Kayıt yoksa veya hata varsa default state ile devam et
  }

  document.getElementById('hvbModalBody').innerHTML = buildHvbFormHtml(d);
}

function hvbPopulateFromApi(data) {
  const boolKeys = [
    'isFlightContinue','isFlightChangeInternalLine','isDivert','isEmergencyLand',
    'hasCargo','hasDutyFree','hasUndecCargo','hasCatering','hasOutOfCatering','hasPassenger',
  ];
  const intKeys = [
    'passengerUnloadThisPort','passengerBabyUnloadThisPort',
    'passengerLoadThisPort','passengerBabyLoadThisPort',
    'passengerUnloadOtherPort','passengerBabyUnloadOtherPort',
    'fuelNational','fuelForeign',
    'cargoLoadThisPortUnit','cargoUnloadThisPortUnit','cargoUnloadOtherPortUnit',
  ];
  const decimalKeys = [
    'cargoLoadThisPortKgm','cargoUnloadThisPortKgm','cargoUnloadOtherPortKgm',
  ];
  boolKeys.forEach(k => { if (data[k] !== undefined) _hvbState[k] = !!data[k]; });
  intKeys.forEach(k  => { if (data[k] !== undefined) _hvbState[k] = parseInt(data[k], 10) || 0; });
  decimalKeys.forEach(k => { if (data[k] !== undefined) _hvbState[k] = hvbParseDecimal(data[k]); });
  if (data.nextAirPortCode !== undefined) _hvbState.nextAirPortCode = String(data.nextAirPortCode || '').toUpperCase().replace(/\s+/g, '');
  if (data.otherIssues !== undefined) _hvbState.otherIssues = data.otherIssues || 'NILL';
}

function closeHavayoluBeyanModal() {
  document.getElementById('havayoluBeyanOverlay').classList.add('hidden');
  _hvbDeclareIndex = null;
}

function buildHvbFormHtml(d) {
  // toggle — durumu _hvbState'ten okur
  const tog = (label, key) => {
    const active = _hvbState[key];
    const on  = 'background:#1e3a5f;color:#fff';
    const off = 'background:#e2e8f0;color:#64748b';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <span style="font-size:13px;font-weight:500;color:#1e293b;flex:1">${label}</span>
        <div style="display:flex;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;flex-shrink:0">
          <button type="button" id="hvb_${key}_evet" onclick="hvbSetToggle('${key}',true)"
            style="padding:5px 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;${active ? on : off}">Evet</button>
          <button type="button" id="hvb_${key}_hayir" onclick="hvbSetToggle('${key}',false)"
            style="padding:5px 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;${!active ? on : off}">Hayır</button>
        </div>
      </div>`;
  };

  // sayı alanı — değeri _hvbState'ten okur
  const numField = (label, key) => `
    <div style="display:flex;flex-direction:column;gap:4px">
      <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${label}</label>
      <input type="number" min="0" step="1" value="${_hvbState[key] ?? 0}"
        oninput="hvbUpdateInt('${key}',this.value)"
        style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:100%">
    </div>`;

  const decimalField = (label, key) => `
    <div style="display:flex;flex-direction:column;gap:4px">
      <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${label}</label>
      <input type="text" inputmode="decimal" pattern="[0-9]*[,.]?[0-9]*" value="${escapeHtml(hvbDecimalInputValue(_hvbState[key] ?? 0))}"
        oninput="hvbUpdateDecimal('${key}',this.value)"
        style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:100%">
    </div>`;

  const section = (title, body) => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.05em;margin-bottom:4px">${title}</div>
      ${body}
    </div>`;

  const isDeparture      = d.flightTypeCode === 'GDS';
  const passengerDisplay = _hvbState.hasPassenger ? 'grid' : 'none';
  const cargoDisplay     = _hvbState.hasCargo     ? 'grid' : 'none';
  const nextAirportDisplay = _hvbState.isFlightContinue ? 'grid' : 'none';
  const cargoFields = isDeparture
    ? `
      ${numField('Bu Limandan Aldığı Yük (Kap Adedi)',        'cargoLoadThisPortUnit')}
      ${numField('Başka Limana Çıkarılacak Yük (Kap Adedi)',  'cargoUnloadOtherPortUnit')}
      ${decimalField('Bu Limandan Aldığı Yük (KG)',               'cargoLoadThisPortKgm')}
      ${decimalField('Başka Limana Çıkarılacak Yük (KG)',         'cargoUnloadOtherPortKgm')}
    `
    : `
      ${numField('Bu Limana Çıkarılacak Yük (Kap Adedi)',     'cargoUnloadThisPortUnit')}
      ${numField('Başka Limana Çıkarılacak Yük (Kap Adedi)',  'cargoUnloadOtherPortUnit')}
      ${decimalField('Bu Limana Çıkarılacak Yük (KG)',            'cargoUnloadThisPortKgm')}
      ${decimalField('Başka Limana Çıkarılacak Yük (KG)',         'cargoUnloadOtherPortKgm')}
    `;

  return `<div style="display:flex;flex-direction:column;gap:14px">

    ${section('Sefer Bilgisi', `
      <div class="modal-row" style="border-top:none"><span class="lbl">Kuyruk No</span><span class="val">${escapeHtml(d.tailNumber||'—')}</span></div>
      <div class="modal-row"><span class="lbl">Kalkış</span><span class="val">${escapeHtml((d.departurePortText||''))} (${escapeHtml(d.departurePortCode||'')})</span></div>
      <div class="modal-row"><span class="lbl">Varış</span><span class="val">${escapeHtml((d.arrivalPortText||''))} (${escapeHtml(d.arrivalPortCode||'')})</span></div>
      <div class="modal-row"><span class="lbl">Kayıt No</span><span class="val">${escapeHtml(d.recordNumber||'—')}</span></div>`)}

    ${section('Beyan Bilgileri', `
      ${tog('Seferin İç Hat Devamı Var Mı?',   'isFlightContinue')}
      <div id="hvbNextAirportFields" style="display:${nextAirportDisplay};grid-template-columns:1fr;gap:10px;margin-top:10px;margin-bottom:4px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Sonraki İç Hat İstasyonu</label>
          <input type="text" maxlength="3" value="${escapeHtml(_hvbState.nextAirPortCode || '')}"
            oninput="this.value=this.value.toUpperCase().replace(/[^A-Z]/g,'');hvbUpdateText('nextAirPortCode',this.value,{uppercase:true})"
            placeholder="ESB"
            style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:100%;text-transform:uppercase">
        </div>
      </div>
      ${tog('İç Hat Uçuşa Mı Kaydırıldı?',     'isFlightChangeInternalLine')}
      ${tog('Divert Edilmiş Mi?',               'isDivert')}
      ${tog('Acil İniş Mi?',                    'isEmergencyLand')}`)}

    ${section('Yük & İkram', `
      ${tog('Kargo Var Mı?', 'hasCargo')}
      <div id="hvbCargoFields" style="display:${cargoDisplay};grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;margin-bottom:4px">
        ${cargoFields}
      </div>
      ${tog(isDeparture ? 'Uçağa Yüklenecek Gümrüksüz Satış Eşyası Var Mı?' : 'Uçaktan İndirilecek Gümrüksüz Satış Eşyası Var Mı?', 'hasDutyFree')}
      ${tog('Manifestoya Ve Özet Beyana Kaydedilmeyen Eşya Var Mı?',                   'hasUndecCargo')}
      ${tog(isDeparture ? 'Uçağa Yüklenecek İkram Malzemesi Var Mı?' : 'Uçaktan İndirilecek İkram Malzemesi Var Mı?', 'hasCatering')}
      ${tog(isDeparture ? 'Uçağa Yüklenecek ve Yolculara Verilecek İkram Harici Eşya Var Mı?' : 'Uçaktan İndirilecek ve Yolculara Dağıtılmamış İkram Harici Eşya Var Mı?', 'hasOutOfCatering')}`)}

    ${section('Yolcu', `
      ${tog('Yolcu Var Mı?', 'hasPassenger')}
      <div id="hvbPassengerFields" style="display:${passengerDisplay};grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        ${isDeparture
          ? numField('Bu Limandan Aldığı Yolcu Sayısı',       'passengerLoadThisPort')
          : numField('Bu Limana Çıkarılacak Yolcu Sayısı',    'passengerUnloadThisPort')}
        ${isDeparture
          ? numField('Bu Limandan Aldığı Bebek Yolcu Sayısı', 'passengerBabyLoadThisPort')
          : numField('Bu Limana Çıkarılacak Bebek Yolcu Sayısı', 'passengerBabyUnloadThisPort')}
        ${numField('Başka Limana Çıkarılacak Yolcu Sayısı',      'passengerUnloadOtherPort')}
        ${numField('Başka Limana Çıkarılacak Bebek Yolcu Sayısı','passengerBabyUnloadOtherPort')}
      </div>`)}

    ${section('Yakıt', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
        ${numField(isDeparture ? 'Gidişte Beyan Edilen Yakıt Miktarı (Milli) KG'   : 'Gelişte Beyan Edilen Yakıt Miktarı (Milli) KG',   'fuelNational')}
        ${numField(isDeparture ? 'Gidişte Beyan Edilen Yakıt Miktarı (Yabancı) KG' : 'Gelişte Beyan Edilen Yakıt Miktarı (Yabancı) KG', 'fuelForeign')}
      </div>`)}

    ${section('Açıklama', `
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
        <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Açıklama / Diğer Hususlar</label>
        <textarea rows="4"
          oninput="_hvbState.otherIssues=this.value"
          style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical;font-family:inherit;width:100%">${escapeHtml(_hvbState.otherIssues||'NILL')}</textarea>
      </div>`)}

  </div>`;
}

async function submitHavayoluBeyan() {
  const d      = _currentFlightDetail || {};
  const isDep  = d.flightTypeCode === 'GDS';
  const nextAirPortCode = _hvbState.isFlightContinue
    ? String(_hvbState.nextAirPortCode || '').trim().toUpperCase().replace(/\s+/g, '')
    : '';

  if (_hvbState.isFlightContinue && !/^[A-Z]{3}$/.test(nextAirPortCode)) {
    alert('İç hat devamı için 3 harfli sonraki istasyon kodu gir.');
    return;
  }

  const payload = {
    // Kullanıcı girdileri
    isFlightContinue:          _hvbState.isFlightContinue,
    isFlightChangeInternalLine:_hvbState.isFlightChangeInternalLine,
    isDivert:                  _hvbState.isDivert,
    isEmergencyLand:           _hvbState.isEmergencyLand,
    hasCargo:                  _hvbState.hasCargo,
    hasDutyFree:               _hvbState.hasDutyFree,
    hasUndecCargo:             _hvbState.hasUndecCargo,
    hasCatering:               _hvbState.hasCatering,
    hasOutOfCatering:          _hvbState.hasOutOfCatering,
    hasPassenger:              _hvbState.hasPassenger,
    // Geliş: bu limana çıkarılacak | Gidiş: bu limandan alınan
    passengerUnloadThisPort:      (!isDep && _hvbState.hasPassenger) ? _hvbState.passengerUnloadThisPort     : null,
    passengerBabyUnloadThisPort:  (!isDep && _hvbState.hasPassenger) ? _hvbState.passengerBabyUnloadThisPort : null,
    passengerLoadThisPort:        (isDep  && _hvbState.hasPassenger) ? _hvbState.passengerLoadThisPort       : null,
    passengerBabyLoadThisPort:    (isDep  && _hvbState.hasPassenger) ? _hvbState.passengerBabyLoadThisPort   : null,
    passengerUnloadOtherPort:     _hvbState.hasPassenger ? _hvbState.passengerUnloadOtherPort     : null,
    passengerBabyUnloadOtherPort: _hvbState.hasPassenger ? _hvbState.passengerBabyUnloadOtherPort : null,
    fuelNational:  _hvbState.fuelNational,
    fuelForeign:   _hvbState.fuelForeign,
    otherIssues:   _hvbState.otherIssues || 'NILL',
    // Kargo alt alanları — hasCargo false ise null
    cargoUnloadThisPortUnit:  (_hvbState.hasCargo && !isDep) ? _hvbState.cargoUnloadThisPortUnit  : null,
    cargoLoadThisPortUnit:    (_hvbState.hasCargo && isDep)  ? _hvbState.cargoLoadThisPortUnit    : null,
    cargoUnloadOtherPortUnit: _hvbState.hasCargo             ? _hvbState.cargoUnloadOtherPortUnit : null,
    cargoUnloadThisPortKgm:   (_hvbState.hasCargo && !isDep) ? _hvbState.cargoUnloadThisPortKgm   : null,
    cargoLoadThisPortKgm:     (_hvbState.hasCargo && isDep)  ? _hvbState.cargoLoadThisPortKgm     : null,
    cargoUnloadOtherPortKgm:  _hvbState.hasCargo             ? _hvbState.cargoUnloadOtherPortKgm  : null,
    // Statik / uçuştan türetilen alanlar
    afterDecCatering:   false,
    afterDecFuel:       false,
    nextAirPortCode,
    nextDepartureDate:  null,
    nextDepartureTime:  '',
    preAirPortCode:     null,
    flightTypeCode:     d.flightTypeCode || '',
    id:                 '',
    baseId:             _currentFlightBaseId || '',
    seals:              [],
  };

  const btn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    await apiCall('PUT', '/api/Flight/SetAirDec?api-version=1.0', payload);
    closeHavayoluBeyanModal();
    alert('Hava Yolu Beyan Formu başarıyla gönderildi.');
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

function openErrorModal(index) {
  const row = STATE.rows[index];
  if (!row) return;

  const lines = (row._error || 'Bilinmeyen hata')
    .split(/,\s*|\n/)
    .map(s => s.trim())
    .filter(Boolean);

  document.getElementById('errorModalBody').innerHTML =
    lines.map(l => `<div class="error-item">${escapeHtml(l)}</div>`).join('');

  document.getElementById('errorOverlay').classList.remove('hidden');
}

function closeErrorModal() {
  document.getElementById('errorOverlay').classList.add('hidden');
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
