/*
 * RYS / RR / Ryanair-Buzz GENDEC parser.
 * PU - SURNAME,NAME gibi virgüllü rol satırlarını okur.
 */
'use strict';
function parseRyanCrewLines(rawLines) {
  const rolePattern = 'CP|FO|JU|PU|CA|CM|SCCM|CCM\\d*|CCM|ACM\\d*|ACM';
  const rx = new RegExp(`\\b(${rolePattern})\\s*-\\s*([^,]+),\\s*(.+)$`, 'i');
  const crews = [];

  for (const rawLine of rawLines) {
    const line = cleanGendecLineKeepComma(rawLine);
    const match = line.match(rx);
    if (!match) continue;

    const rawType = match[1];
    const surname = cleanupRyanCrewName(match[2]);
    const givenName = cleanupRyanCrewName(match[3]);

    const crew = buildCrewFromNameParts(rawType, givenName, surname, 'PL', String(crews.length + 1));
    if (crew) crews.push(crew);
  }

  return crews;
}

function cleanGendecLineKeepComma(line) {
  return String(line || '')
    .replace(/[^\wÇĞİÖŞÜçğıöşü', -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

function cleanupRyanCrewName(value) {
  const tokens = String(value || '')
    .replace(/\s+-\s+.*$/, '')
    .split(/\s+/)
    .map(token => token.replace(/^[^A-ZÇĞİÖŞÜ']+|[^A-ZÇĞİÖŞÜ']+$/g, ''))
    .filter(Boolean);

  while (tokens.length > 1 && /^[A-Z]{3}$/.test(foldTurkishChars(tokens[tokens.length - 1]))) {
    tokens.pop();
  }

  while (tokens.length && /^(BUZZ|SPRNI|RYANAIR|FLIGHT|CREW|AYT|WRO|ARN)$/.test(foldTurkishChars(tokens[tokens.length - 1]))) {
    tokens.pop();
  }

  return tokens.join(' ');
}
