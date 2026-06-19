'use strict';

function splitPossibleCrewSegments(line) {
  const cleanLine = cleanGendecLine(line);

  const roleRegex = new RegExp(
    `\\b(${GENDEC_ROLE_PATTERN})\\s+\\d{1,2}\\b`,
    'g'
  );

  const matches = [];
  let match;

  while ((match = roleRegex.exec(cleanLine)) !== null) {
    matches.push(match.index);
  }

  if (matches.length <= 1) {
    return [cleanLine];
  }

  const segments = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = matches[i + 1] || cleanLine.length;
    const segment = cleanLine.slice(start, end).trim();

    if (segment) segments.push(segment);
  }

  return segments;
}

function parseCrewLine(line) {
  const rx = new RegExp(`^(${GENDEC_ROLE_PATTERN})\\s+(\\d{1,2})\\s+(.+)$`, 'i');

  const m = line.match(rx);
  if (!m) return null;

  const rawType = m[1];
  const orderNo = m[2];
  const rest = cleanGendecLine(m[3]);

  const tokens = rest.split(/\s+/).filter(Boolean);

  let nationalityIndex = -1;

  for (let i = 1; i < tokens.length; i++) {
    const token = normalizeNationality(tokens[i]);

    if (/^[A-Z]{2}$/.test(token)) {
      nationalityIndex = i;
      break;
    }
  }

  if (nationalityIndex === -1) return null;

  const nameTokens = tokens.slice(0, nationalityIndex);
  const nationalityCode = tokens[nationalityIndex];

  if (nameTokens.length < 2) return null;

  return buildCrewFromParts(rawType, nameTokens.join(' '), nationalityCode, orderNo);
}
