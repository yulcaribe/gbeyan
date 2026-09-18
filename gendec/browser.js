/* Browser-only file readers. Local files never leave this process. */
(function installGendecBrowser(global) {
  'use strict';

  function pdfTextContentToPage(content, pageNo) {
    const items = (content?.items || []).filter(item => item.str && item.str.trim()).map(item => ({
      text: item.str.trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0)
    }));
    const lineMap = new Map();
    for (const item of items) {
      const y = Math.round(item.y / 2) * 2;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item);
    }
    const lines = [...lineMap.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) =>
      row.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim()
    ).filter(Boolean);
    return { pageNo, items, lines, text: lines.join('\n') };
  }

  async function readPdfPages(file) {
    if (!global.pdfjsLib?.getDocument) throw new Error('PDF.js yüklenmemiş.');
    const data = await file.arrayBuffer();
    const pdf = await global.pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      pages.push(pdfTextContentToPage(await page.getTextContent(), pageNo));
    }
    return pages;
  }

  async function parsePdf(file, context = {}) {
    const pages = await readPdfPages(file);
    const text = pages.map(page => page.text).join('\n');
    const generic = global.GendecParser.parseText(text);
    const fhy = global.FHYParser?.parsePages?.(pages, context) || null;
    const crews = fhy?.matched && fhy.crews?.length ? fhy.crews : generic.crews;
    return { crews: global.GendecParser.removeDuplicateCrews(crews), metadata: generic.metadata, text, fhy };
  }

  async function parseExcel(file) {
    if (!global.XLSX?.read) throw new Error('XLSX kütüphanesi yüklenmemiş.');
    const workbook = global.XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('Excel içinde sayfa bulunamadı.');
    const matrix = global.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return { crews: global.GendecParser.parseExcelMatrix(matrix), metadata: { flightNumbers: [], tailNumbers: [] } };
  }

  async function parseFile(file, context = {}) {
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return parsePdf(file, context);
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseExcel(file);
    throw new Error('Yalnızca PDF, XLS veya XLSX dosyası desteklenir.');
  }

  global.GendecBrowser = Object.freeze({ parseFile, parsePdf, parseExcel, readPdfPages, pdfTextContentToPage });
  global.parseCrewPdfFileData = parsePdf;
  global.readCrewExcelFile = async file => (await parseExcel(file)).crews;
})(typeof window !== 'undefined' ? window : globalThis);
