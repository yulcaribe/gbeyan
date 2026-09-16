import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlightRecords } from './mail-parsers.mjs';

function ldm(flightNumber, flightDate, tailNumber, receivedAt, pax) {
  return {
    kind: 'ldm', key: `${flightNumber}|${flightDate}`, flightNumber, flightDate, tailNumber,
    pax, infant: 1, cockpitCrew: 2, cabinCrew: 4,
    validations: { paxMatchesMessage: true },
    source: { type: 'ldm', receivedAt }
  };
}

function trip(flightNumber, flightDate, tailNumber, receivedAt) {
  return {
    kind: 'trip-info', key: `${flightNumber}|${flightDate}`, flightNumber, flightDate, tailNumber,
    blockFuelKg: 8200,
    validations: { blockFuelPositive: true, blockFuelMatchesTakeOffPlusTaxi: true },
    source: { type: 'trip-info', receivedAt }
  };
}

test('LDM joins Trip Info by flight number and tail, not LDM-derived date', () => {
  const records = buildFlightRecords([
    ldm('XQ154', '2026-09-15', 'TC-SOA', '2026-09-16T01:00:00Z', 180),
    ldm('XQ154', '2026-09-16', 'TC-SPB', '2026-09-16T01:05:00Z', 99)
  ], [trip('XQ154', '2026-09-16', 'TC-SOA', '2026-09-16T00:55:00Z')]);

  const flight = records.find(record => record.key === 'XQ154|2026-09-16' && record.tailNumber === 'TC-SOA');
  assert.equal(flight.fields.pax.value, 180);
  assert.equal(flight.sources.ldm.receivedAt, '2026-09-16T01:00:00Z');
});
