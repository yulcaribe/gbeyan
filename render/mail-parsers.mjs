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
  if (!Number.isFinite(received.valueOf())) return '';
  const day = Number.parseInt(dayValue, 10);
  if (!Number.isInteger(day) || day < 1 || day > 31) return '';

  const candidates = [-1, 0, 1].map(offset => {
    const candidate = new Date(Date.UTC(received.getUTCFullYear(), received.getUTCMonth() + offset, day));
    return candidate.getUTCDate() === day ? candidate : null;
  }).filter(Boolean);
  candidates.sort((left, right) => Math.abs(left - received) - Math.abs(right - received));
  return candidates[0]?.toISOString().slice(0, 10) || '';
}

function source(message, folder, type) {
  return {
    type,
    folder,
    messageId: String(message?.id || ''),
    receivedAt: String(message?.date || ''),
    subject: String(message?.subject || '')
  };
}

export function parseLdmMessage(message, folder = '') {
  const text = `${message?.subject || ''}\n${message?.body || ''}`;
  const header = text.match(/\b([A-Z0-9]{2,3}\s*[- ]?\d{1,5}[A-Z]?)\/(\d{1,2})\.TC[- ]?([A-Z0-9]{3})\.[A-Z]\d+\.(\d+)\/(\d+)\b/i);
  const load = text.match(/-([A-Z]{3})\.(\d+)\/(\d+)\/(\d+)\/(\d+)\.[^\r\n]*?\bPAX\/(\d+)\b/i);
  if (!header || !load) return null;

  const groups = load.slice(2, 6).map(value => Number.parseInt(value, 10));
  const pax = groups[0] + groups[1] + groups[2];
  const infant = groups[3];
  const statedPax = Number.parseInt(load[6], 10);
  const cockpitCrew = Number.parseInt(header[4], 10);
  const cabinCrew = Number.parseInt(header[5], 10);
  const flightDate = dateFromLdmDay(header[2], message?.date);
  if (!flightDate) return null;

  return {
    kind: 'ldm',
    key: `${normalizeFlightNumber(header[1])}|${flightDate}`,
    flightNumber: normalizeFlightNumber(header[1]),
    flightDate,
    destinationPortCode: load[1].toUpperCase(),
    tailNumber: normalizeTail(`TC${header[3]}`),
    cockpitCrew,
    cabinCrew,
    pax,
    infant,
    statedPax,
    passengerBreakdown: groups,
    validations: {
      paxMatchesMessage: pax === statedPax,
      countsNonNegative: groups.every(Number.isInteger) && groups.every(value => value >= 0)
    },
    source: source(message, folder, 'ldm')
  };
}

export function parseTripInfoMessage(message, folder = '') {
  const text = `${message?.subject || ''}\n${message?.body || ''}`;
  const dateMatch = text.match(/\bFLIGHT\s*DATE\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i);
  const flightMatch = text.match(/\bFLIGHT\s*NO\s*:\s*([A-Z0-9]{2,3}\s*[- ]?\d{1,5}[A-Z]?)/i);
  const fuelMatch = text.match(/\bBLOCK\s*FUEL\s*:\s*(\d{1,6})\b/i);
  if (!dateMatch || !flightMatch || !fuelMatch) return null;

  const flightDate = normalizeDate(dateMatch[1]);
  const flightNumber = normalizeFlightNumber(flightMatch[1]);
  const field = pattern => text.match(pattern)?.[1] || '';
  const crew = text.match(/\bCREW\s*:\s*(\d+)\s*\/\s*(\d+)/i);
  const blockFuelKg = Number.parseInt(fuelMatch[1], 10);
  const takeOffFuelKg = Number.parseInt(field(/\bT\/O\s*FUEL\s*:\s*(\d{1,6})\b/i), 10) || null;
  const taxiFuelKg = Number.parseInt(field(/\bTAXI\s*FUEL\s*:\s*(\d{1,6})\b/i), 10) || null;
  if (!flightDate || !flightNumber) return null;

  return {
    kind: 'trip-info',
    key: `${flightNumber}|${flightDate}`,
    flightNumber,
    flightDate,
    originPortCode: field(/\bORIGIN\s*:\s*([A-Z]{3})\b/i).toUpperCase(),
    destinationPortCode: field(/\bDESTINATION\s*:\s*([A-Z]{3})\b/i).toUpperCase(),
    tailNumber: normalizeTail(field(/\bREGIST(?:I|E)RATION\s*:\s*(TC[- ]?[A-Z0-9]{3})\b/i)),
    cockpitCrew: crew ? Number.parseInt(crew[1], 10) : null,
    cabinCrew: crew ? Number.parseInt(crew[2], 10) : null,
    blockFuelKg,
    takeOffFuelKg,
    tripFuelKg: Number.parseInt(field(/\bTRIP\s*FUEL\s*:\s*(\d{1,6})\b/i), 10) || null,
    taxiFuelKg,
    captain: field(/\bCAPTAIN\s*:\s*(.*?)(?=\s+FUEL\s+REQUIRED|\r?$)/im).trim(),
    validations: {
      blockFuelPositive: Number.isInteger(blockFuelKg) && blockFuelKg > 0,
      blockFuelMatchesTakeOffPlusTaxi: takeOffFuelKg !== null && taxiFuelKg !== null
        ? takeOffFuelKg + taxiFuelKg === blockFuelKg
        : null
    },
    source: source(message, folder, 'trip-info')
  };
}

function newest(records) {
  return [...records].sort((left, right) =>
    String(right?.source?.receivedAt || '').localeCompare(String(left?.source?.receivedAt || ''))
  )[0] || null;
}

function valueField(value, sourceRecord, confidence, validation) {
  return {
    value,
    source: sourceRecord?.source || null,
    confidence,
    validation
  };
}

export function buildFlightRecords(ldmRecords = [], tripInfoRecords = []) {
  const tripKeys = new Set(tripInfoRecords.map(record => record.key).filter(Boolean));
  const standaloneLdmKeys = new Set(ldmRecords
    .filter(ldm => !tripInfoRecords.some(trip =>
      trip.flightNumber === ldm.flightNumber
      && normalizeTail(trip.tailNumber)
      && normalizeTail(trip.tailNumber) === normalizeTail(ldm.tailNumber)
    ))
    .map(record => record.key)
    .filter(Boolean));
  const keys = new Set([...tripKeys, ...standaloneLdmKeys]);

  return [...keys].map(key => {
    const trip = newest(tripInfoRecords.filter(record => record.key === key));
    const [flightNumber, flightDate] = key.split('|');
    const tripTail = normalizeTail(trip?.tailNumber);
    const ldm = newest(ldmRecords.filter(record => trip
      ? record.flightNumber === trip.flightNumber
        && tripTail
        && normalizeTail(record.tailNumber) === tripTail
      : record.key === key
    ));
    const paxValid = ldm?.validations?.paxMatchesMessage === true;
    const fuelValid = trip?.validations?.blockFuelPositive === true
      && trip?.validations?.blockFuelMatchesTakeOffPlusTaxi !== false;
    const tailNumber = trip?.tailNumber || ldm?.tailNumber || '';

    return {
      key,
      flightNumber,
      flightDate,
      originPortCode: trip?.originPortCode || '',
      destinationPortCode: trip?.destinationPortCode || ldm?.destinationPortCode || '',
      tailNumber,
      cockpitCrew: trip?.cockpitCrew ?? ldm?.cockpitCrew ?? null,
      cabinCrew: trip?.cabinCrew ?? ldm?.cabinCrew ?? null,
      fields: {
        pax: valueField(ldm?.pax ?? null, ldm, ldm ? (paxValid ? 1 : 0.55) : 0, ldm ? ldm.validations : { available: false }),
        infant: valueField(ldm?.infant ?? null, ldm, ldm ? (paxValid ? 1 : 0.55) : 0, ldm ? ldm.validations : { available: false }),
        blockFuelKg: valueField(trip?.blockFuelKg ?? null, trip, trip ? (fuelValid ? 1 : 0.55) : 0, trip ? trip.validations : { available: false })
      },
      sources: { ldm: ldm?.source || null, tripInfo: trip?.source || null },
      validations: {
        pax: paxValid,
        blockFuel: fuelValid,
        tailConsistent: ldm?.tailNumber && trip?.tailNumber ? ldm.tailNumber === trip.tailNumber : null
      }
    };
  }).sort((left, right) => `${right.flightDate}|${right.flightNumber}`.localeCompare(`${left.flightDate}|${left.flightNumber}`));
}
