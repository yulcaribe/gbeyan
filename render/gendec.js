import * as pdfjs from 'pdfjs-dist/build/pdf.js';
import * as XLSX from 'xlsx';
import '../gendec/parser.js';
import '../gendec/noz.js';
import '../gendec/rys.js';
import '../gendec/sxs.js';
import '../gendec/fhy.js';

function pdfPage(content, pageNo) {
  const items = (content?.items || []).filter(item => item.str && item.str.trim()).map(item => ({
    text: item.str.trim(), x: Number(item.transform?.[4] || 0), y: Number(item.transform?.[5] || 0)
  }));
  const rows = new Map();
  for (const item of items) {
    const y = Math.round(item.y / 2) * 2;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(item);
  }
  const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) =>
    row.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim()
  ).filter(Boolean);
  return { pageNo, items, lines, text: lines.join('\n') };
}

async function parsePdf(bytes, context) {
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
    const page = await document.getPage(pageNo);
    pages.push(pdfPage(await page.getTextContent(), pageNo));
  }
  const text = pages.map(page => page.text).join('\n');
  const generic = globalThis.GendecParser.parseText(text);
  const fhy = globalThis.FHYParser?.parsePages?.(pages, context) || null;
  return {
    crews: globalThis.GendecParser.removeDuplicateCrews(fhy?.matched && fhy.crews?.length ? fhy.crews : generic.crews),
    metadata: generic.metadata,
    parser: fhy?.matched ? 'fhy' : 'generic'
  };
}

function parseExcel(bytes) {
  const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('GenDec Excel içinde sayfa bulunamadı.');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const text = matrix.flat().map(String).join('\n');
  return {
    crews: globalThis.GendecParser.parseExcelMatrix(matrix),
    metadata: globalThis.GendecParser.extractMetadata(text),
    parser: 'excel'
  };
}

export function attachmentCacheKey(message, attachment) {
  return [message?.id, attachment?.id, Number(attachment?.size || 0)].map(String).join('|');
}

export async function parseGendecAttachment(bytes, attachment, context = {}) {
  const name = String(attachment?.name || '').toLowerCase();
  const parsed = name.endsWith('.pdf') ? await parsePdf(bytes, context)
    : (name.endsWith('.xlsx') || name.endsWith('.xls')) ? parseExcel(bytes)
      : (() => { throw new Error('Desteklenmeyen GenDec eki.'); })();
  return {
    ...parsed,
    crews: parsed.crews || [],
    flightNumbers: parsed.metadata?.flightNumbers || [],
    tailNumbers: parsed.metadata?.tailNumbers || []
  };
}

export function matchesFlightNumber(parsed, flightNumber) {
  const wantedFlight = globalThis.GendecParser.normalizeFlightNumber(flightNumber);
  const aliases = { FHY: 'FH', FH: 'FHY', STW: '2S', '2S': 'STW', TWI: 'TI', TI: 'TWI' };
  const variants = new Set([wantedFlight]);
  for (const [prefix, alias] of Object.entries(aliases)) {
    if (wantedFlight.startsWith(prefix)) variants.add(alias + wantedFlight.slice(prefix.length));
  }
  return parsed?.flightNumbers?.some(value =>
    variants.has(globalThis.GendecParser.normalizeFlightNumber(value))
  ) || false;
}
