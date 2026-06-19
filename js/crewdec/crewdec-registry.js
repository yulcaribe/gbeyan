'use strict';

function parseGendecCrewText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(cleanGendecLine)
    .filter(Boolean);

  const crews = [];

  // Format 1:
  // CP 1 BIZHAN ZARE IR
  // FO 2 HALIL IBRAHIM DEMIRCI TR
  for (const line of lines) {
    const segments = splitPossibleCrewSegments(line);

    for (const segment of segments) {
      const crew = parseCrewLine(segment);
      if (crew) crews.push(crew);
    }
  }

  // Format 2:
  // MUSTAFA BASLI
  // CPT M S37957985 28/08/2035 01/03/1975 Turkish
  const tableStyleCrews = parseTableStyleCrewLines(lines);
  for (const crew of tableStyleCrews) {
    crews.push(crew);
  }

  return removeDuplicateCrews(crews);
}
