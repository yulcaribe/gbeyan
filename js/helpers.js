'use strict';

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
  return normalizeAircraftTypeValue(csvType) || DEFAULT_AIRCRAFT_TYPE;
}

function generateFlightId(type, flightNo, reg, date) {
  const raw = encodeURIComponent([type, flightNo, reg, date].join('|'));
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

function getNationalityCode(tailNumber) {
  const reg = String(tailNumber ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!reg || reg === '-') return 'TR';

  const prefix = Object.keys(NATIONALITY_PREFIX_MAP)
    .sort((a, b) => b.length - a.length)
    .find(p => reg.startsWith(p));

  if (prefix) {
    const code = NATIONALITY_PREFIX_MAP[prefix];
    return isKnownNationalityCode(code) ? code : 'TR';
  }

  const maybeCode = reg.substring(0, 2);
  return isKnownNationalityCode(maybeCode) ? maybeCode : 'TR';
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
