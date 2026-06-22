/* global pdfjsLib */
(function (global) {
  'use strict';

  const VERSION = '0.1.2';
  const PARSER_NAME = 'FHY_FREEBIRD';

  const AIRLINE_CODE_ALIASES = {
    FHY: 'FH',
    FH: 'FHY'
  };

  const CREW_TYPE_MAP = {
    CP: 'CP',
    CPT: 'CP',
    CAPT: 'CP',
    PIC: 'CP',
    FO: 'FO',
    SO: 'SO',
    TO: 'TO',
    FE: 'FE',
    CM: 'CM',
    SCCM: 'CM',
    CA: 'CA',
    CCM: 'CA',
    ACM: 'CA'
  };

  const NATIONALITY_MAP = {
    TR: 'TR',
    TUR: 'TR',
    TURKISH: 'TR',
    TURKEY: 'TR',
    TURKIYE: 'TR',
    DE: 'DE',
    DEU: 'DE',
    GERMAN: 'DE',
    GERMANY: 'DE',
    US: 'US',
    USA: 'US',
    AMERICAN: 'US',
    UNITEDSTATES: 'US',
    NL: 'NL',
    NLD: 'NL',
    DUTCH: 'NL',
    NETHERLANDS: 'NL',
    RO: 'RO',
    ROU: 'RO',
    ROMANIAN: 'RO',
    ROMANIA: 'RO',
    ES: 'ES',
    ESP: 'ES',
    SPANISH: 'ES',
    SPAIN: 'ES',
    PL: 'PL',
    POL: 'PL',
    POLISH: 'PL',
    POLAND: 'PL',
    SE: 'SE',
    SWE: 'SE',
    SWEDISH: 'SE',
    SWEDEN: 'SE',
    GB: 'GB',
    GBR: 'GB',
    UK: 'GB',
    BRITISH: 'GB',
    UNITEDKINGDOM: 'GB',
    FR: 'FR',
    FRA: 'FR',
    FRENCH: 'FR',
    FRANCE: 'FR'
  };

  const GENDER_CODES = new Set(['M', 'F', 'MALE', 'FEMALE']);
  const ROLE_PATTERN = /^(?:CP|CPT|CAPT|PIC|FO|SO|TO|FE|CM|SCCM|CA|CCM\d*|CCM|ACM\d*|ACM)$/i;

  async function parsePdfFile(file, context = {}, options = {}) {
    const pages = await readPdfPages(file, options);
    return parsePages(pages, context, options);
  }

  async function readPdfPages(file, options = {}) {
    const pdfjs = options.pdfjsLib || global.pdfjsLib;

    if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
      throw new Error('PDF.js bulunamadi. fhyparser.js oncesinde pdf.min.js yuklenmeli.');
    }

    const data = await fileToPdfData(file);
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const items = pdfTextContentToItems(content);
      const lines = pdfItemsToLines(items);

      pages.push({
        pageNo,
        items,
        lines,
        text: lines.join('\n')
      });
    }

    return pages;
  }

  function parsePages(pages, context = {}, options = {}) {
    const warnings = [];
    const normalizedContext = normalizeContext(context);
    const freebirdPages = Array.isArray(pages) ? pages.filter(isFreebirdPage) : [];
    const detected = freebirdPages.length > 0;
    const emptyResult = makeResult({
      detected,
      freebirdPageCount: freebirdPages.length,
      warnings
    });

    if (!Array.isArray(pages) || !pages.length) {
      warnings.push('PDF sayfasi bulunamadi.');
      return emptyResult;
    }

    if (!normalizedContext.flightNoVariants.length) {
      warnings.push('FHY sayfa ayirmak icin flightNo gerekli.');
      return emptyResult;
    }

    const candidates = findMatchingPages(freebirdPages, normalizedContext);

    if (!candidates.length) {
      warnings.push(detected
        ? 'FHY/Freebird PDF algilandi ama secili ucus no ile sayfa eslesmedi.'
        : 'FHY/Freebird sayfasi bulunamadi.');
      return makeResult({
        detected,
        freebirdPageCount: freebirdPages.length,
        warnings
      });
    }

    const best = candidates[0];
    const crews = removeDuplicateCrews(parseCrewPage(best.page, options));

    if (!crews.length) {
      warnings.push('Eslesen FHY sayfasinda ekip satiri okunamadi.');
    }

    return makeResult({
      detected: true,
      freebirdPageCount: freebirdPages.length,
      matched: true,
      pageNo: best.page.pageNo,
      flightNo: best.info.flightNo || '',
      crews,
      warnings,
      candidates: candidates.map(item => ({
        pageNo: item.page.pageNo,
        score: item.score,
        flightNo: item.info.flightNo || '',
        flightNumbers: item.info.flightNumbers
      }))
    });
  }

  function findMatchingPages(pages, context) {
    const candidates = [];

    for (const page of pages) {
      if (!isFreebirdPage(page)) continue;

      const info = getPageInfo(page);
      const score = scorePage(info, context);

      if (score >= 100) {
        candidates.push({ page, info, score });
      }
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.page.pageNo - b.page.pageNo;
    });

    return candidates;
  }

  function scorePage(info, context) {
    const wantedFlights = new Set(context.flightNoVariants);
    const pageFlights = new Set(info.flightNumbers);
    let score = 0;

    for (const flightNo of wantedFlights) {
      if (pageFlights.has(flightNo)) {
        score += 100;
        break;
      }
    }

    if (!score) return 0;

    if (context.tailNumber && info.tailNumber && context.tailNumber === info.tailNumber) {
      score += 10;
    }

    if (context.departurePortCode && info.text.includes(context.departurePortCode)) {
      score += 2;
    }

    if (context.arrivalPortCode && info.text.includes(context.arrivalPortCode)) {
      score += 2;
    }

    return score;
  }

  function parseCrewPage(page) {
    const lineGroups = pdfItemsToLineGroups(dedupePdfItems(page.items || []));
    const crews = [];

    for (let i = 0; i < lineGroups.length; i++) {
      const name = getCrewNameFromLine(lineGroups[i]);
      if (!name) continue;

      const detail = findCrewDetailLine(lineGroups, i);
      if (!detail) continue;

      const parsedName = splitFreebirdNameSurname(name);
      const crew = buildCrew({
        orderNo: String(crews.length + 1),
        rawType: detail.role,
        name: parsedName.name,
        surname: parsedName.surname,
        nationality: detail.nationality,
        identityNumber: detail.identityNumber,
        dateOfBirth: detail.dateOfBirth
      });

      if (crew) crews.push(crew);
    }

    return crews;
  }

  function getCrewNameFromLine(line) {
    if (isHeaderLine(line) || isDetailLikeLine(line)) return '';

    const nameText = (line.items || [])
      .filter(item => item.x >= 165 && item.x <= 360)
      .map(item => item.text)
      .join(' ');

    const name = cleanCrewName(nameText);
    return isCrewName(name) ? name : '';
  }

  function findCrewDetailLine(lineGroups, nameIndex) {
    const nameY = lineGroups[nameIndex]?.y || 0;

    for (let i = nameIndex + 1; i < Math.min(lineGroups.length, nameIndex + 4); i++) {
      if (nameY && Math.abs(nameY - lineGroups[i].y) > 45) break;

      const detail = parseCrewDetailLine(lineGroups[i]);
      if (detail) return detail;
    }

    return null;
  }

  function parseCrewDetailLine(line) {
    const tokens = getLineTokens(line);
    if (!tokens.length) return null;

    let roleIndex = tokens.findIndex(token => token.x >= 155 && token.x <= 240 && mapCrewType(token.text));
    if (roleIndex < 0) roleIndex = tokens.findIndex(token => mapCrewType(token.text));
    if (roleIndex < 0) return null;

    const dateIndexes = [];
    tokens.forEach((token, index) => {
      if (isDateToken(token.text)) dateIndexes.push(index);
    });

    const dobByColumn = tokens.find(token => token.x >= 400 && token.x <= 500 && isDateToken(token.text));
    const dobByOrder = dateIndexes.length > 1 ? tokens[dateIndexes[1]] : null;
    const identityNumber = getIdentityValue(tokens, roleIndex, dateIndexes);
    const dateOfBirth = normalizeDate(dobByColumn?.text || dobByOrder?.text || '');
    const nationality = getNationalityValue(tokens, dateIndexes);
    const nationalityCode = normalizeNationality(nationality);

    if (!identityNumber || !dateOfBirth || !/^[A-Z]{2}$/.test(nationalityCode)) {
      return null;
    }

    return {
      role: tokens[roleIndex].text,
      identityNumber,
      dateOfBirth,
      nationality: nationalityCode
    };
  }

  function isHeaderLine(line) {
    const folded = foldChars(lineToText(line)).toUpperCase();
    if (!folded) return false;

    const headerWords = [
      'CREW NAME',
      'ROLE',
      'GENDER',
      'PASSPORT',
      'EXPIRY',
      'DOB',
      'NATIONALITY'
    ];

    return headerWords.some(word => folded.includes(word));
  }

  function isDetailLikeLine(line) {
    const tokens = getLineTokens(line);
    const hasRole = tokens.some(token => mapCrewType(token.text));
    if (!hasRole) return false;

    const hasGender = tokens.some(token => GENDER_CODES.has(String(token.text || '').toUpperCase()));
    const hasPassport = tokens.some(token => isPassportToken(token.text));
    const hasDate = tokens.some(token => isDateToken(token.text));

    return hasGender || hasPassport || hasDate;
  }

  function lineToText(line) {
    return (line?.items || [])
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getLineTokens(line) {
    const tokens = [];

    for (const item of (line.items || []).slice().sort((a, b) => a.x - b.x)) {
      String(item.text || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach(text => tokens.push({
          text,
          x: Number(item.x || 0),
          y: Number(item.y || 0)
        }));
    }

    return tokens;
  }

  function getIdentityValue(tokens, roleIndex, dateIndexes) {
    const byColumn = tokens
      .filter(token => token.x >= 255 && token.x <= 365 && isPassportToken(token.text))
      .map(token => token.text)
      .join('');

    if (byColumn) return normalizeIdentityNumber(byColumn);

    const firstDateIndex = dateIndexes.length ? dateIndexes[0] : tokens.length;

    for (let i = roleIndex + 1; i < firstDateIndex; i++) {
      const token = tokens[i];
      if (GENDER_CODES.has(String(token.text || '').toUpperCase())) continue;
      if (isPassportToken(token.text)) return normalizeIdentityNumber(token.text);
    }

    return '';
  }

  function getNationalityValue(tokens, dateIndexes) {
    const byColumn = tokens
      .filter(token => token.x >= 470 && isAlphaToken(token.text))
      .map(token => token.text)
      .join(' ');

    if (normalizeNationality(byColumn)) return byColumn;

    const lastDateIndex = dateIndexes.length ? dateIndexes[dateIndexes.length - 1] : -1;

    return tokens
      .slice(lastDateIndex + 1)
      .filter(token => isAlphaToken(token.text))
      .map(token => token.text)
      .join(' ');
  }

  function isFreebirdPage(page) {
    const text = foldChars(page?.text || '').toUpperCase();
    return text.includes('FREEBIRD AIRLINES')
      && text.includes('CREW NAME')
      && text.includes('PASSPORT');
  }

  function getPageInfo(page) {
    const text = foldChars(page?.text || '').toUpperCase();
    const flightNumbers = extractFlightNumbers(text);
    const tailMatch = text.match(/\bTC\s*-?\s*[A-Z0-9]{3,5}\b/);

    return {
      text,
      flightNo: flightNumbers[0] || '',
      flightNumbers,
      tailNumber: normalizeReg(tailMatch ? tailMatch[0] : '')
    };
  }

  function extractFlightNumbers(text) {
    const values = new Set();
    const rx = /\b(?:FHY|FH)\s*[-/]?\s*\d{2,5}[A-Z]?\b/gi;
    let match;

    while ((match = rx.exec(String(text || ''))) !== null) {
      getFlightNoVariants(match[0]).forEach(item => values.add(item));
    }

    return Array.from(values);
  }

  function getFlightNoVariants(flightNo) {
    const normalized = normalizeFlightNo(flightNo);
    const variants = new Set();

    if (!normalized) return [];

    variants.add(normalized);

    const parsed = normalized.match(/^([A-Z]{2,3})(\d+[A-Z]?)$/);
    if (parsed && AIRLINE_CODE_ALIASES[parsed[1]]) {
      variants.add(AIRLINE_CODE_ALIASES[parsed[1]] + parsed[2]);
    }

    return Array.from(variants);
  }

  function normalizeContext(context) {
    const flightNoVariants = new Set();

    getFlightNoVariants(context.flightNo || context.flightNumber || '').forEach(item => {
      flightNoVariants.add(item);
    });

    return {
      flightNoVariants: Array.from(flightNoVariants),
      tailNumber: normalizeReg(context.tailNumber || context.reg || ''),
      departurePortCode: normalizeCode(context.departurePortCode || context.origin || ''),
      arrivalPortCode: normalizeCode(context.arrivalPortCode || context.destination || '')
    };
  }

  function pdfTextContentToItems(content) {
    return (content.items || [])
      .filter(item => item.str && item.str.trim())
      .map(item => ({
        text: item.str.trim(),
        x: Number(item.transform?.[4] || 0),
        y: Math.round(Number(item.transform?.[5] || 0) / 2) * 2
      }));
  }

  function pdfItemsToLineGroups(items) {
    const lineMap = new Map();

    for (const item of items || []) {
      const y = Math.round(Number(item.y || 0) / 2) * 2;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item);
    }

    return Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([y, lineItems]) => ({
        y,
        items: lineItems.slice().sort((a, b) => a.x - b.x)
      }));
  }

  function pdfItemsToLines(items) {
    return pdfItemsToLineGroups(items)
      .map(group => group.items
        .map(i => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      )
      .filter(Boolean);
  }

  function dedupePdfItems(items) {
    const seen = new Set();
    const result = [];

    for (const item of items || []) {
      const key = [Math.round(item.x || 0), Math.round(item.y || 0), item.text].join('|');
      if (seen.has(key)) continue;

      seen.add(key);
      result.push(item);
    }

    return result;
  }

  async function fileToPdfData(file) {
    if (file instanceof ArrayBuffer) return file;
    if (ArrayBuffer.isView(file)) return file.buffer;
    if (file && typeof file.arrayBuffer === 'function') return await file.arrayBuffer();
    throw new Error('PDF verisi okunamadi.');
  }

  function buildCrew(data) {
    const crewTypeCode = mapCrewType(data.rawType);
    const name = normalizePersonName(data.name);
    const surname = normalizePersonName(data.surname);
    const nationalityCode = normalizeNationality(data.nationality);

    if (!crewTypeCode || !name || !surname || !nationalityCode) return null;

    return {
      orderNo: data.orderNo || '',
      sourceTypeCode: normalizeSourceTypeCode(data.rawType),
      crewTypeCode,
      name,
      surname,
      nationalityCode,
      identityNumber: normalizeIdentityNumber(data.identityNumber),
      dateOfBirth: normalizeDate(data.dateOfBirth)
    };
  }

  function mapCrewType(rawType) {
    const key = normalizeCode(rawType);
    return CREW_TYPE_MAP[key] || '';
  }

  function splitNameSurname(fullName) {
    const parts = normalizePersonName(fullName).split(/\s+/).filter(Boolean);

    if (parts.length <= 1) {
      return { name: parts[0] || '', surname: '' };
    }

    return {
      name: parts.slice(0, -1).join(' '),
      surname: parts[parts.length - 1]
    };
  }

  function splitFreebirdNameSurname(fullName) {
    const parts = normalizePersonName(fullName).split(/\s+/).filter(Boolean);

    if (parts.length <= 1) {
      return { name: '', surname: parts[0] || '' };
    }

    return {
      name: parts.slice(1).join(' '),
      surname: parts[0]
    };
  }

  function removeDuplicateCrews(crews) {
    const seen = new Set();
    const result = [];

    for (const crew of crews || []) {
      const key = [
        crew.crewTypeCode,
        crew.name,
        crew.surname,
        crew.nationalityCode,
        crew.identityNumber
      ].join('|');

      if (seen.has(key)) continue;
      seen.add(key);
      result.push(crew);
    }

    return result;
  }

  function makeResult(overrides = {}) {
    return {
      matched: false,
      detected: false,
      parser: PARSER_NAME,
      pageNo: 0,
      flightNo: '',
      crews: [],
      warnings: [],
      freebirdPageCount: 0,
      candidates: [],
      ...overrides
    };
  }

  function cleanCrewName(value) {
    return String(value || '')
      .replace(/[^A-Za-zÇĞİÖŞÜçğıöşü' -]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleUpperCase('tr-TR');
  }

  function isCrewName(value) {
    const name = String(value || '').trim();
    if (!name || /\d/.test(name)) return false;

    const folded = foldChars(name).toUpperCase();
    if (/^(CREW NAME|NAME|ROLE|GENDER|PASSPORT|PASSPORT EXPIRY|DOB|NATIONALITY)$/.test(folded)) {
      return false;
    }

    const blockedWords = [
      'CREW MEMBER',
      'MEMBER CONCERNED',
      'CONCERNED',
      'SIGNATURE',
      'DECLARATION',
      'FREEBIRD',
      'AIRLINES',
      'GENERAL DECLARATION'
    ];

    if (blockedWords.some(word => folded.includes(word))) return false;

    if (ROLE_PATTERN.test(folded)) return false;

    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || parts.length > 6) return false;

    return parts.every(part => /^[A-ZÇĞİÖŞÜ' -]+$/.test(part));
  }

  function normalizeDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }

    return '';
  }

  function normalizeNationality(value) {
    const folded = foldChars(value)
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase();

    if (!folded) return '';
    if (NATIONALITY_MAP[folded]) return NATIONALITY_MAP[folded];
    if (/^[A-Z]{2}$/.test(folded)) return folded;
    return '';
  }

  function normalizePersonName(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleUpperCase('tr-TR');
  }

  function normalizeFlightNo(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function normalizeReg(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '');
  }

  function normalizeCode(value) {
    return String(value || '')
      .trim()
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase();
  }

  function normalizeSourceTypeCode(value) {
    return String(value || '')
      .trim()
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
  }

  function normalizeIdentityNumber(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
  }

  function isDateToken(value) {
    return /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(String(value || '').trim());
  }

  function isPassportToken(value) {
    const normalized = normalizeIdentityNumber(value);
    return /^[A-Z0-9]{5,}$/.test(normalized) && /\d/.test(normalized);
  }

  function isAlphaToken(value) {
    return /^[A-Za-zÇĞİÖŞÜçğıöşü]+$/.test(String(value || '').trim());
  }

  function foldChars(value) {
    return String(value || '')
      .replace(/Ç/g, 'C').replace(/ç/g, 'c')
      .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
      .replace(/İ/g, 'I').replace(/ı/g, 'i')
      .replace(/Ö/g, 'O').replace(/ö/g, 'o')
      .replace(/Ş/g, 'S').replace(/ş/g, 's')
      .replace(/Ü/g, 'U').replace(/ü/g, 'u');
  }

  global.FHYParser = {
    version: VERSION,
    parser: PARSER_NAME,
    parsePdfFile,
    parsePages,
    readPdfPages,
    parseCrewPage,
    helpers: {
      getFlightNoVariants,
      normalizeNationality,
      normalizeDate
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
