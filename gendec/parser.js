/* Shared, environment-neutral GenDec parser. No DOM, fetch or mail access. */
(function installGendecParser(global) {
  'use strict';

  const TYPE_MAP = Object.freeze({
    CP: 'CP', CPT: 'CP', CAPT: 'CP', PIC: 'CP',
    FO: 'FO', SO: 'SO', TO: 'TO', FE: 'FE',
    CM: 'CM', SCCM: 'CM', PU: 'CM',
    CA: 'CA', CCM: 'CA', ACM: 'CA', JU: 'CA',
    LM: 'LM', FC: 'FC'
  });
  const ROLE_PATTERN = '(?:CP|FO|SO|TO|FE|CM|CA|JU|PU|LM|FC|SCCM|CCM\\d*|CCM|ACM\\d*|ACM|CPT|CAPT|PIC)';
  const GENDER_CODES = new Set(['M', 'F', 'MALE', 'FEMALE']);
  const NATIONALITIES = Object.freeze({
    TR: 'TR', TUR: 'TR', TURKISH: 'TR', TURKEY: 'TR', TURKIYE: 'TR',
    IR: 'IR', IRN: 'IR', IRAN: 'IR', IRANIAN: 'IR',
    IT: 'IT', ITA: 'IT', ITALY: 'IT', ITALIAN: 'IT',
    US: 'US', USA: 'US', AMERICAN: 'US', UNITEDSTATES: 'US',
    DE: 'DE', DEU: 'DE', GERMANY: 'DE', GERMAN: 'DE',
    RU: 'RU', RUS: 'RU', RUSSIA: 'RU', RUSSIAN: 'RU',
    GB: 'GB', GBR: 'GB', UK: 'GB', BRITISH: 'GB', UNITEDKINGDOM: 'GB',
    FR: 'FR', FRA: 'FR', FRANCE: 'FR', FRENCH: 'FR',
    PL: 'PL', POL: 'PL', POLAND: 'PL', POLISH: 'PL',
    NL: 'NL', NLD: 'NL', NETHERLANDS: 'NL', DUTCH: 'NL',
    RO: 'RO', ROU: 'RO', ROMANIA: 'RO', ROMANIAN: 'RO',
    ES: 'ES', ESP: 'ES', SPAIN: 'ES', SPANISH: 'ES',
    SE: 'SE', SWE: 'SE', SWEDEN: 'SE', SWEDISH: 'SE'
  });

  function foldTurkishChars(value) {
    return String(value || '')
      .replace(/Ç/g, 'C').replace(/ç/g, 'c').replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
      .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ö/g, 'O').replace(/ö/g, 'o')
      .replace(/Ş/g, 'S').replace(/ş/g, 's').replace(/Ü/g, 'U').replace(/ü/g, 'u');
  }
  function normalizeCode(value) {
    return String(value || '').trim().replace(/[^A-Za-z]/g, '').toUpperCase();
  }
  function normalizeSourceTypeCode(value) {
    return String(value || '').trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
  function normalizePersonName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
  }
  function normalizeIdentityNumber(value) {
    return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
  }
  function normalizeDate(value) {
    const text = String(value || '').trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return '';
  }
  function normalizeNationality(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const datasetCode = global.HGBS_COUNTRY_DATA?.findCode?.(raw) || '';
    if (datasetCode) return datasetCode;
    const key = foldTurkishChars(raw).replace(/[^A-Za-z]/g, '').toUpperCase();
    if (NATIONALITIES[key]) return NATIONALITIES[key];
    if (/^[A-Z]{2}$/.test(key)) return global.HGBS_COUNTRY_DATA
      ? (global.HGBS_COUNTRY_DATA.get(key) ? key : '') : key;
    return '';
  }
  function normalizeFlightNumber(value) {
    const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = compact.match(/^([A-Z0-9]{2,3})(\d{1,5}[A-Z]?)$/);
    return match ? `${match[1]}${match[2]}` : '';
  }
  function normalizeTailNumber(value) {
    const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return compact.startsWith('TC') && compact.length > 2 ? `TC-${compact.slice(2)}` : compact;
  }
  function mapCrewType(value) {
    const key = normalizeSourceTypeCode(value).replace(/\d+$/, '');
    return TYPE_MAP[key] || '';
  }
  function splitNameSurname(value) {
    const parts = normalizePersonName(value).split(/\s+/).filter(Boolean);
    if (parts.length < 2) return { name: parts[0] || '', surname: '' };
    return { name: parts.slice(0, -1).join(' '), surname: parts.at(-1) };
  }
  function buildCrewFromNameParts(rawType, name, surname, nationalityCode, orderNo, extra = {}) {
    const crewTypeCode = mapCrewType(rawType);
    const normalizedName = normalizePersonName(name);
    const normalizedSurname = normalizePersonName(surname);
    const nationality = normalizeNationality(nationalityCode);
    if (!crewTypeCode || !normalizedName || !normalizedSurname || !nationality) return null;
    return {
      orderNo: String(orderNo || ''),
      sourceTypeCode: normalizeSourceTypeCode(rawType),
      crewTypeCode,
      name: normalizedName,
      surname: normalizedSurname,
      nationalityCode: nationality,
      dateOfBirth: normalizeDate(extra.dateOfBirth),
      identityCode: normalizeCode(extra.identityCode),
      identityNumber: normalizeIdentityNumber(extra.identityNumber)
    };
  }
  function buildCrewFromParts(rawType, fullName, nationalityCode, orderNo, extra = {}) {
    const name = splitNameSurname(fullName);
    return buildCrewFromNameParts(rawType, name.name, name.surname, nationalityCode, orderNo, extra);
  }
  function removeDuplicateCrews(crews) {
    const seen = new Set();
    return (crews || []).filter(crew => {
      const key = [crew.crewTypeCode, crew.name, crew.surname, crew.nationalityCode, crew.identityNumber].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((crew, index) => ({ ...crew, orderNo: String(index + 1) }));
  }
  function cleanGendecLine(value) {
    return String(value || '').replace(/[^\wÇĞİÖŞÜçğıöşü' -]/g, ' ').replace(/\s+/g, ' ')
      .trim().toLocaleUpperCase('tr-TR');
  }

  function parseCrewLine(line) {
    const match = cleanGendecLine(line).match(new RegExp(`^(${ROLE_PATTERN})\\s+(\\d{1,2})\\s+(.+)$`, 'i'));
    if (!match) return null;
    const tokens = cleanGendecLine(match[3]).split(/\s+/).filter(Boolean);
    const nationalityIndex = tokens.findIndex((token, index) => index > 0 && normalizeNationality(token));
    if (nationalityIndex < 2) return null;
    return buildCrewFromParts(match[1], tokens.slice(0, nationalityIndex).join(' '), tokens[nationalityIndex], match[2]);
  }
  function splitPossibleCrewSegments(line) {
    const clean = cleanGendecLine(line);
    const matches = [...clean.matchAll(new RegExp(`\\b(${ROLE_PATTERN})\\s+\\d{1,2}\\b`, 'g'))].map(item => item.index);
    if (matches.length < 2) return [clean];
    return matches.map((start, index) => clean.slice(start, matches[index + 1] || clean.length).trim()).filter(Boolean);
  }
  function isLikelyCrewNameLine(line) {
    const value = cleanGendecLine(line);
    if (!value || /\d/.test(value)) return false;
    const folded = foldTurkishChars(value);
    const blocked = ['AIRPORT', 'AIRLINES', 'FREEBIRD', 'SUNEXPRESS', 'GENERAL', 'DECLARATION', 'FLIGHT',
      'CREW NAME', 'ROLE', 'GENDER', 'PASSPORT', 'NATIONALITY', 'COMMANDER', 'PASSENGER', 'REGISTRATION'];
    const parts = value.split(/\s+/);
    return !blocked.some(word => folded.includes(word)) && parts.length >= 2 && parts.length <= 6;
  }
  function extractNameBeforeRole(lines, index) {
    for (let cursor = index - 1; cursor >= Math.max(0, index - 6); cursor--) {
      const value = cleanGendecLine(lines[cursor]);
      const folded = foldTurkishChars(value);
      const airport = /\bAIRPORT\b(?!.*\bAIRPORT\b)/.exec(folded);
      const candidate = airport ? value.slice(airport.index + airport[0].length).trim() : value;
      if (isLikelyCrewNameLine(candidate)) return candidate;
    }
    return '';
  }
  function parseTableStyleCrewLines(lines) {
    const crews = [];
    for (let index = 1; index < lines.length; index++) {
      const tokens = cleanGendecLine(lines[index]).split(/\s+/).filter(Boolean);
      if (tokens.length < 4 || !mapCrewType(tokens[0]) || !GENDER_CODES.has(tokens[1])) continue;
      const nationality = normalizeNationality(tokens.at(-1));
      const name = extractNameBeforeRole(lines, index);
      if (!nationality || !name) continue;
      const dates = tokens.map(normalizeDate).filter(Boolean);
      const identityNumber = tokens.find(token => /^[A-Z0-9]{5,}$/.test(token) && /\d/.test(token) && !normalizeDate(token)) || '';
      const crew = buildCrewFromParts(tokens[0], name, nationality, crews.length + 1, {
        identityNumber,
        dateOfBirth: dates.at(-1) || ''
      });
      if (crew) crews.push(crew);
    }
    return crews;
  }
  function extractMetadata(text) {
    const source = foldTurkishChars(String(text || '')).toUpperCase();
    const flightMatches = [...source.matchAll(/\b(?:FLIGHT|FLT|FLIGHT\s*NO)?\s*[:#-]?\s*([A-Z0-9]{2,3})\s*[-/]?\s*(\d{1,5}[A-Z]?)\b/g)]
      .filter(match => !mapCrewType(match[1]))
      .map(match => normalizeFlightNumber(`${match[1]}${match[2]}`)).filter(Boolean);
    const tailMatches = [...source.matchAll(/\b(TC)\s*-?\s*([A-Z0-9]{3,5})\b/g)]
      .map(match => normalizeTailNumber(`${match[1]}${match[2]}`));
    return { flightNumbers: [...new Set(flightMatches)], tailNumbers: [...new Set(tailMatches)] };
  }
  function parseGendecCrewText(text) {
    const rawLines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const lines = rawLines.map(cleanGendecLine).filter(Boolean);
    const helpers = { buildCrewFromNameParts, buildCrewFromParts, foldTurkishChars, normalizeDate };
    const crews = [];
    for (const parser of Object.values(global.GendecAirlineParsers || {})) {
      try { crews.push(...(parser(rawLines, helpers) || [])); } catch { /* generic fallback remains available */ }
    }
    for (const line of lines) for (const segment of splitPossibleCrewSegments(line)) {
      const crew = parseCrewLine(segment);
      if (crew) crews.push(crew);
    }
    crews.push(...parseTableStyleCrewLines(lines));
    return { crews: removeDuplicateCrews(crews), metadata: extractMetadata(text) };
  }
  function normalizeExcelKey(value) {
    return foldTurkishChars(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function findHeaderIndex(headers, candidates) {
    return candidates.map(normalizeExcelKey).map(key => headers.indexOf(key)).find(index => index >= 0) ?? -1;
  }
  function normalizeCrewExcelType(value) {
    const direct = mapCrewType(value);
    if (direct) return direct;
    const folded = normalizeExcelKey(value);
    if (folded.includes('KAPTAN') || folded.includes('CAPTAIN') || folded.includes('PIC')) return 'CP';
    if (folded.includes('FIRSTOFFICER') || folded.includes('YARDIMCIPILOT') || folded === 'COPILOT') return 'FO';
    if (folded.includes('KABINAMIRI') || folded.includes('CABINCHIEF')) return 'CM';
    if (folded.includes('KABIN') || folded.includes('CABIN') || folded.includes('HOSTES')) return 'CA';
    return '';
  }
  function crewDateForApi(value) {
    const date = normalizeDate(value);
    return date ? `${date}T00:00:00+03:00` : '';
  }
  function parseCrewExcelMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    let headerIndex = -1;
    let headers = [];
    for (let index = 0; index < rows.length; index++) {
      const candidate = (rows[index] || []).map(normalizeExcelKey);
      if (findHeaderIndex(candidate, ['ADI', 'AD', 'NAME']) >= 0
        && findHeaderIndex(candidate, ['SOYADI', 'SOYAD', 'SURNAME', 'LASTNAME']) >= 0
        && findHeaderIndex(candidate, ['MURETTEBATTIPIREF', 'MURETTEBATTIPI', 'GOREV', 'CREWTYPE', 'TYPE']) >= 0) {
        headerIndex = index; headers = candidate; break;
      }
    }
    if (headerIndex < 0) throw new Error('Başlık satırı bulunamadı. Beklenen kolonlar: Adı, Soyadı, Mürettebat Tipi.');
    const field = (candidates) => findHeaderIndex(headers, candidates);
    const indexes = {
      name: field(['ADI', 'AD', 'NAME']), surname: field(['SOYADI', 'SOYAD', 'SURNAME', 'LASTNAME']),
      dob: field(['DOGUMTARIHI', 'DOB', 'DATEOFBIRTH']), nationality: field(['MILLIYETIREF', 'MILLIYET', 'UYRUK', 'NATIONALITY', 'NAT']),
      type: field(['MURETTEBATTIPIREF', 'MURETTEBATTIPI', 'GOREV', 'CREWTYPE', 'TYPE']),
      docType: field(['BELGETIPIREF', 'BELGETIPI', 'DOCTYPE', 'DOCUMENTTYPE']),
      docNo: field(['BELGENO', 'DOCUMENTNO', 'PASSPORTNO', 'PASSPORT', 'IDENTITYNUMBER'])
    };
    const cell = (row, index) => index < 0 ? '' : String(row[index] ?? '').trim();
    const crews = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const name = normalizePersonName(cell(row, indexes.name));
      const surname = normalizePersonName(cell(row, indexes.surname));
      const crewTypeCode = normalizeCrewExcelType(cell(row, indexes.type));
      if (!name || !surname || !crewTypeCode) continue;
      crews.push({
        orderNo: String(crews.length + 1), sourceTypeCode: normalizeSourceTypeCode(cell(row, indexes.type)) || 'EXCEL',
        crewTypeCode, name, surname, nationalityCode: normalizeNationality(cell(row, indexes.nationality)),
        dateOfBirth: normalizeDate(cell(row, indexes.dob)), identityCode: normalizeCode(cell(row, indexes.docType)),
        identityNumber: normalizeIdentityNumber(cell(row, indexes.docNo))
      });
    }
    return removeDuplicateCrews(crews);
  }

  const api = Object.freeze({
    parseText: parseGendecCrewText, parseGendecCrewText, parseExcelMatrix: parseCrewExcelMatrix,
    parseCrewExcelMatrix, extractMetadata, normalizeFlightNumber, normalizeTailNumber, normalizeNationality,
    normalizePersonName, normalizeIdentityNumber, normalizeDate, normalizeCode, normalizeSourceTypeCode,
    mapCrewType, buildCrewFromParts, buildCrewFromNameParts, removeDuplicateCrews, foldTurkishChars,
    normalizeCrewExcelType, normalizeCrewExcelDate: normalizeDate, crewDateForApi
  });
  global.GendecParser = api;
  Object.assign(global, api);
})(typeof window !== 'undefined' ? window : globalThis);
