'use strict';

function parseTableStyleCrewLines(lines) {
  const crews = [];

  for (let i = 1; i < lines.length; i++) {
    const roleInfo = parseTableRoleDetailLine(lines[i]);
    if (!roleInfo) continue;

    const nameLine = findNameLineBeforeRole(lines, i);
    if (!nameLine) continue;

    const orderNo = String(crews.length + 1);

    const crew = buildCrewFromParts(
      roleInfo.rawType,
      nameLine,
      roleInfo.nationalityCode,
      orderNo
    );

    if (crew) crews.push(crew);
  }

  return crews;
}

function parseTableRoleDetailLine(line) {
  const cleanLine = cleanGendecLine(line);
  const tokens = cleanLine.split(/\s+/).filter(Boolean);

  if (tokens.length < 3) return null;

  const rawType = tokens[0];
  const gender = tokens[1];

  // Bu formatta rol satırı genelde şöyle:
  // CPT M S37957985 28/08/2035 01/03/1975 Turkish
  // FO M U33914234 26/08/2034 25/06/1998 Turkish
  // SCCM F U24500070 02/10/2028 10/01/1979 Turkish
  // CCM1 F U22920831 30/12/2029 25/03/1996 Turkish
  if (!mapCrewType(rawType)) return null;
  if (!GENDER_CODES.has(gender)) return null;

  const nationalityRaw = tokens[tokens.length - 1];
  const nationalityCode = normalizeNationality(nationalityRaw);

  if (!nationalityCode) return null;

  return {
    rawType,
    nationalityCode
  };
}

function findNameLineBeforeRole(lines, roleLineIndex) {
  // Freebird gibi bazı PDF'lerde aynı görsel satırda iki kolon geliyor:
  // "Chisinau International Airport / FATMANUR CAGLIYAN"
  // Bu yüzden önce rota+isim karışmış satırdan sadece ismi ayıklıyoruz.
  for (let j = roleLineIndex - 1; j >= 0 && j >= roleLineIndex - 6; j--) {
    const candidate = extractCrewNameFromPossibleMixedLine(lines[j]);

    if (candidate) {
      return candidate;
    }
  }

  return '';
}

function extractCrewNameFromPossibleMixedLine(line) {
  const v = cleanGendecLine(line);
  if (!v) return '';

  // Rol/detail satırı, tarih, pasaport vb. isim olamaz.
  if (/\d/.test(v)) return '';
  if (new RegExp(`^${GENDEC_ROLE_PATTERN}\\b`, 'i').test(v)) return '';

  // Freebird kolon birleşmesi örneği:
  // CHISINAU INTERNATIONAL AIRPORT FATMANUR CAGLIYAN
  // cleanGendecLine tr-TR uppercase kullandığı için AIRPORT -> AİRPORT olabilir.
  // Bu yüzden karşılaştırmayı foldTurkishChars üzerinden yapıyoruz.
  const folded = foldTurkishChars(v);
  const airportMatch = /\bAIRPORT\b(?!.*\bAIRPORT\b)/.exec(folded);

  if (airportMatch) {
    const afterAirport = v
      .slice(airportMatch.index + airportMatch[0].length)
      .trim();

    if (isLikelyCrewNameLine(afterAirport)) {
      return afterAirport;
    }
  }

  // Normal tablo formatı:
  // MUSTAFA BASLI
  if (isLikelyCrewNameLine(v)) {
    return v;
  }

  return '';
}

function isLikelyCrewNameLine(line) {
  const v = cleanGendecLine(line);
  if (!v) return false;

  if (/\d/.test(v)) return false;

  const blockedWords = [
    'AIRPORT',
    'AIRLINES',
    'FREEBIRD',
    'SUNEXPRESS',
    'GENERAL',
    'DECLARATION',
    'OWNER',
    'OPERATOR',
    'FLIGHT',
    'FLT',
    'ROUTING',
    'CREW NAME',
    'PLACE',
    'ROLE',
    'GENDER',
    'PASSPORT',
    'EXPIRY',
    'DOB',
    'NATIONALITY',
    'COMMANDER',
    'POSITIONING',
    'ADDITIONAL',
    'ICAO',
    'APPENDIX',
    'SIGNATURE',
    'AUTHORISED',
    'AUTHORIZED',
    'PILOT',
    'DISEMBARKING',
    'EMBARKING',
    'PASSENGER',
    'STAGE',
    'ZULU',
    'LOCAL',
    'REGISTRATION',
    'DEPARTURE',
    'ARRIVAL',
    'CHISINAU',
    'ANTALYA'
  ];

  const folded = foldTurkishChars(v);

  if (blockedWords.some(word => folded.includes(word))) return false;

  const parts = v.split(/\s+/).filter(Boolean);

  if (parts.length < 2) return false;
  if (parts.length > 5) return false;

  return parts.every(p => /^[A-ZÇĞİÖŞÜ' -]+$/.test(p));
}
