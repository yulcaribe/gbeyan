'use strict';

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
