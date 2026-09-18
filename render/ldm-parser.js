const FLIGHT_PATTERN = /\b([A-Z0-9]{2,3})\s*[- ]?(\d{1,5}[A-Z]?)\b/i;

export function normalizeFlightNumber(value) {
  const match = String(value || '').toUpperCase().match(FLIGHT_PATTERN);
  return match ? `${match[1]}${match[2]}` : '';
}
export function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}
export function normalizeTail(value) {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.startsWith('TC') && compact.length > 2 ? `TC-${compact.slice(2)}` : compact;
}
function dateFromLdmDay(dayValue, receivedAt) {
  const received = new Date(receivedAt || '');
  const day = Number.parseInt(dayValue, 10);
  if (!Number.isFinite(received.valueOf()) || day < 1 || day > 31) return '';
  const candidates = [-1, 0, 1].map(offset => new Date(Date.UTC(received.getUTCFullYear(), received.getUTCMonth() + offset, day)))
    .filter(candidate => candidate.getUTCDate() === day)
    .sort((left, right) => Math.abs(left - received) - Math.abs(right - received));
  return candidates[0]?.toISOString().slice(0, 10) || '';
}
export function parseLdmMessage(message, folder = '') {
  const text = `${message?.subject || ''}\n${message?.body || ''}`;
  const header = text.match(/\b([A-Z0-9]{2,3}\s*[- ]?\d{1,5}[A-Z]?)\/(\d{1,2})\.TC[- ]?([A-Z0-9]{3})\.[A-Z]\d+\.(\d+)\/(\d+)\b/i);
  const load = text.match(/-([A-Z]{3})\.(\d+)\/(\d+)\/(\d+)\/(\d+)\.[^\r\n]*?\bPAX\/(\d+)\b/i);
  if (!header || !load) return null;
  const groups = load.slice(2, 6).map(Number);
  const flightNumber = normalizeFlightNumber(header[1]);
  const flightDate = dateFromLdmDay(header[2], message?.date);
  const tailNumber = normalizeTail(`TC${header[3]}`);
  if (!flightNumber || !flightDate || !tailNumber) return null;
  const pax = groups[0] + groups[1] + groups[2];
  const statedPax = Number(load[6]);
  return {
    kind: 'ldm', key: `${flightNumber}|${tailNumber}`, flightNumber, flightDate, tailNumber,
    destinationPortCode: load[1].toUpperCase(), cockpitCrew: Number(header[4]), cabinCrew: Number(header[5]),
    pax, infant: groups[3], statedPax, passengerBreakdown: groups,
    validations: { paxMatchesMessage: pax === statedPax, countsNonNegative: groups.every(value => Number.isInteger(value) && value >= 0) },
    source: { type: 'ldm', folder, messageId: String(message?.id || ''), receivedAt: String(message?.date || ''), subject: String(message?.subject || '') }
  };
}
