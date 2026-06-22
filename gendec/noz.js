/*
 * NOZ / Norwegian compact GENDEC parser.
 * Sıkışık tablo formatını ekip satırlarına ayırır.
 */
'use strict';
function parseNorwegianCompactCrewLines(rawLines) {
  const tableText = getNorwegianCompactCrewTableText(rawLines);
  if (!tableText) return [];

  const rolePattern = 'CP|FO|SO|TO|FE|CM|CA|JU|PU|LM|FC|SCCM|CCM\\d*|CCM|ACM\\d*|ACM|CPT|CAPT|PIC';
  const compact = tableText
    .replace(/[\u00ad\u2010-\u2015]/g, '-')
    .replace(/\s+/g, '');

  const rx = new RegExp(
    `(?:[A-Z]{3}-?[A-Z]{3})?(${rolePattern})(\\d{3,6})([^,\\s]+),([^,\\s]+?)([MF])(\\d{2}[A-Za-z]{3}\\d{2})([A-Z0-9]+?)([A-Z]{2})(?=(?:[A-Z]{3}-?[A-Z]{3})?(?:${rolePattern})\\d|[^A-Z0-9]|$)`,
    'g'
  );

  const crews = [];
  let match;

  while ((match = rx.exec(compact)) !== null) {
    const rawType = match[1];
    const surname = humanizeCompactCrewName(match[3]);
    const givenName = humanizeCompactCrewName(match[4]);
    const nationalityCode = match[8];

    const crew = buildCrewFromNameParts(rawType, givenName, surname, nationalityCode, String(crews.length + 1), {
      identityNumber: match[7] || '',
      dateOfBirth: parseCompactCrewDate(match[6])
    });

    if (crew) crews.push(crew);
  }

  return crews;
}

function getNorwegianCompactCrewTableText(rawLines) {
  let inCrewTable = false;
  const rows = [];

  for (const rawLine of rawLines) {
    const folded = foldTurkishChars(rawLine).toUpperCase();

    if (!inCrewTable && folded.includes('CREW') && folded.includes('NAME') && folded.includes('PASSPORT')) {
      inCrewTable = true;
      continue;
    }

    if (inCrewTable && (
      folded.includes('DECLARATION OF HEALTH') ||
      folded.includes('NUMBER OF PASSENGERS') ||
      folded.includes('AUTHORIZED AGENT')
    )) {
      break;
    }

    if (inCrewTable) rows.push(rawLine);
  }

  return rows.join(' ');
}

function humanizeCompactCrewName(value) {
  return String(value || '')
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function parseCompactCrewDate(value) {
  const m = String(value || '').match(/^(\d{2})([A-Za-z]{3})(\d{2})$/);
  if (!m) return '';

  const months = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
  };
  const month = months[m[2].toUpperCase()];
  if (!month) return '';

  const yy = parseInt(m[3], 10);
  const year = yy <= 29 ? 2000 + yy : 1900 + yy;
  return `${year}-${month}-${m[1]}`;
}
