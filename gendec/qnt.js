/*
 * QNT / Qanot Sharq GENDEC parser.
 * QANOT SHARQ General Declaration formatındaki numaralı ekip satırlarını okur.
 *
 * Örnek satır:
 * 1. ABDUKADIROV ASROR 21DEC75 FA0508444
 *
 * Bu formatta görev ve milliyet kolonu yok. Verilen örneklerde sıra düzeni:
 * 1 = CP, 2 = FO, 3+ = CA. Milliyet PDF'de olmadığı için boş bırakılır.
 */
(function (global) {
  'use strict';

  const VERSION = '20260809-1';

  function parseQntCrewLines(rawLines) {
    const lines = Array.isArray(rawLines)
      ? rawLines.map(line => String(line || '').trim()).filter(Boolean)
      : String(rawLines || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    if (!isQntGeneralDeclaration(lines)) return [];

    const crewsByOrder = new Map();
    const rowRegex = /(?:^|\s)(\d{1,2})\s*[.)]\s+([A-Z][A-Z' -]*?)\s+(\d{2}[A-Z]{3}\d{2})\s+([A-Z0-9]{5,})(?=\s|$)/gi;

    for (const rawLine of lines) {
      const line = normalizeQntLine(rawLine);
      let match;

      rowRegex.lastIndex = 0;
      while ((match = rowRegex.exec(line)) !== null) {
        const orderNo = String(parseInt(match[1], 10));
        const order = parseInt(orderNo, 10);
        const fullName = normalizeQntName(match[2]);
        const birthDate = parseQntDate(match[3]);
        const identityNumber = String(match[4] || '').trim().toUpperCase();
        const person = splitQntName(fullName);

        if (!person.name || !person.surname || !birthDate || !identityNumber) continue;

        crewsByOrder.set(order, {
          orderNo,
          sourceTypeCode: 'QNT',
          crewTypeCode: getQntCrewType(order),
          name: person.name,
          surname: person.surname,
          nationalityCode: '',
          dateOfBirth: birthDate,
          identityCode: '',
          identityNumber
        });
      }
    }

    return Array.from(crewsByOrder.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, crew]) => crew);
  }

  function isQntGeneralDeclaration(lines) {
    const text = lines.join(' ')
      .replace(/\s+/g, ' ')
      .toUpperCase();

    return text.includes('QANOT SHARQ') &&
      (text.includes('TOTAL NUMBER OF CREW') || /\bHH\s*\d{3,5}\b/.test(text));
  }

  function normalizeQntLine(value) {
    return String(value || '')
      .replace(/[\u00ad\u2010-\u2015]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function normalizeQntName(value) {
    return String(value || '')
      .replace(/[^A-Z' -]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function splitQntName(fullName) {
    const parts = normalizeQntName(fullName).split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      return { name: '', surname: '' };
    }

    return {
      surname: parts[0],
      name: parts.slice(1).join(' ')
    };
  }

  function getQntCrewType(order) {
    if (order === 1) return 'CP';
    if (order === 2) return 'FO';
    return 'CA';
  }

  function parseQntDate(value) {
    const match = String(value || '').trim().toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{2})$/);
    if (!match) return '';

    const months = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };

    const month = months[match[2]];
    if (!month) return '';

    const yy = parseInt(match[3], 10);
    const year = yy <= 29 ? 2000 + yy : 1900 + yy;
    return `${year}-${month}-${match[1]}`;
  }

  global.parseQntCrewLines = parseQntCrewLines;
  global.QNTParser = {
    version: VERSION,
    parseCrewLines: parseQntCrewLines
  };
})(typeof window !== 'undefined' ? window : globalThis);
