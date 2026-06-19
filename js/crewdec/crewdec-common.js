'use strict';

function buildCrewFromParts(rawType, fullName, nationalityCode, orderNo) {
  const crewTypeCode = mapCrewType(rawType);
  if (!crewTypeCode) return null;

  const parsedName = splitNameSurname(fullName);

  if (!parsedName.name || !parsedName.surname) return null;

  return {
    orderNo: orderNo || '',
    sourceTypeCode: normalizeSourceTypeCode(rawType),
    crewTypeCode,
    name: parsedName.name,
    surname: parsedName.surname,
    nationalityCode: normalizeNationality(nationalityCode),
    identityNumber: '',
    dateOfBirth: ''
  };
}

function mapCrewType(rawType) {
  const key = normalizeCode(rawType);
  return GENDEC_TYPE_MAP[key] || '';
}

function splitNameSurname(fullName) {
  const parts = normalizePersonName(fullName).split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return { name: '', surname: '' };
  }

  if (parts.length === 1) {
    return { name: parts[0], surname: '' };
  }

  return {
    name: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1]
  };
}

function removeDuplicateCrews(crews) {
  const seen = new Set();
  const result = [];

  for (const crew of crews) {
    const key = [
      crew.crewTypeCode,
      crew.name,
      crew.surname,
      crew.nationalityCode
    ].join('|');

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(crew);
  }

  return result;
}

function cleanGendecLine(line) {
  return String(line || '')
    .replace(/[^\wÇĞİÖŞÜçğıöşü' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

function normalizeCode(v) {
  return String(v || '')
    .trim()
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
}

function normalizeSourceTypeCode(v) {
  return String(v || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function normalizeNationality(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';

  const folded = normalizeNationalityKey(raw);

  if (!folded) return '';

  if (NATIONALITY_NAME_MAP[folded]) {
    return NATIONALITY_NAME_MAP[folded];
  }

  if (isKnownNationalityCode(folded)) {
    return folded;
  }

  return '';
}

function normalizePersonName(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR');
}

function foldTurkishChars(v) {
  return String(v || '')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u');
}
