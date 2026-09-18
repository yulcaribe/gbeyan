import { normalizeDate, normalizeFlightNumber, normalizeTail } from './ldm-parser.js';

export function parseTripInfoMessage(message, folder = '') {
  const text = `${message?.subject || ''}\n${message?.body || ''}`;
  const field = pattern => text.match(pattern)?.[1] || '';
  const flightDate = normalizeDate(field(/\bFLIGHT\s*DATE\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i));
  const flightNumber = normalizeFlightNumber(field(/\bFLIGHT\s*NO\s*:\s*([A-Z0-9]{2,3}\s*[- ]?\d{1,5}[A-Z]?)/i));
  const blockFuelKg = Number.parseInt(field(/\bBLOCK\s*FUEL\s*:\s*(\d{1,6})\b/i), 10);
  if (!flightDate || !flightNumber || !Number.isInteger(blockFuelKg)) return null;
  const tailNumber = normalizeTail(field(/\bREGIST(?:RATION|IRATION|ERATION)\s*:\s*(TC[- ]?[A-Z0-9]{3,5})\b/i));
  const crew = text.match(/\bCREW\s*:\s*(\d+)\s*\/\s*(\d+)/i);
  const takeOffFuelKg = Number.parseInt(field(/\bT\/O\s*FUEL\s*:\s*(\d{1,6})\b/i), 10) || null;
  const taxiFuelKg = Number.parseInt(field(/\bTAXI\s*FUEL\s*:\s*(\d{1,6})\b/i), 10) || null;
  return {
    kind: 'trip-info', key: `${flightNumber}|${tailNumber}`, flightNumber, flightDate, tailNumber,
    originPortCode: field(/\bORIGIN\s*:\s*([A-Z]{3})\b/i).toUpperCase(),
    destinationPortCode: field(/\bDESTINATION\s*:\s*([A-Z]{3})\b/i).toUpperCase(),
    cockpitCrew: crew ? Number(crew[1]) : null, cabinCrew: crew ? Number(crew[2]) : null,
    blockFuelKg, takeOffFuelKg, tripFuelKg: Number.parseInt(field(/\bTRIP\s*FUEL\s*:\s*(\d{1,6})\b/i), 10) || null,
    taxiFuelKg, captain: field(/\bCAPTAIN\s*:\s*(.*?)(?=\s+FUEL\s+REQUIRED|\r?$)/im).trim(),
    validations: { blockFuelPositive: blockFuelKg > 0, blockFuelMatchesTakeOffPlusTaxi: takeOffFuelKg !== null && taxiFuelKg !== null ? takeOffFuelKg + taxiFuelKg === blockFuelKg : null },
    source: { type: 'trip-info', folder, messageId: String(message?.id || ''), receivedAt: String(message?.date || ''), subject: String(message?.subject || '') }
  };
}
