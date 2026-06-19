'use strict';

// ─────────────────────────────────────────────
//  PDF seçilince oku + parse et
// ─────────────────────────────────────────────

async function handleCrewFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    return await handleCrewPdfSelect(event);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return await handleCrewExcelSelect(event);
  }

  setCrewStatus('error', 'Lütfen PDF, XLS veya XLSX dosyası seç.');
  document.getElementById('crewSubmitBtn').disabled = true;
}

async function handleCrewPdfSelect(event) {
  const file = event.target.files[0];

  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setCrewStatus('error', 'Lütfen Gendec PDF dosyası seç.');
    document.getElementById('crewSubmitBtn').disabled = true;
    return;
  }

  _crewPdfFile = file;
  _crewParsedList = [];

  document.getElementById('crewSubmitBtn').disabled = true;
  document.getElementById('crewPreviewBox').style.display = 'none';
  document.getElementById('crewPreviewBody').innerHTML = '';

  setCrewStatus('info', 'PDF okunuyor...');

  try {
    const text = await readPdfText(file);
    const crews = parseGendecCrewText(text);

    if (!crews.length) {
      setCrewStatus('error', 'PDF içinden ekip listesi bulunamadı. Gendec formatı farklı olabilir.');
      document.getElementById('crewPreviewBox').style.display = 'block';
      document.getElementById('crewPreviewBody').innerHTML = `
        <div style="color:#991b1b;font-weight:600;margin-bottom:8px">
          Ekip satırı bulunamadı.
        </div>
        <div style="font-size:12px;color:#64748b">
          Desteklenen örnekler:
          <br><code>CP 1 JOHN SMITH TR</code>
          <br><code>JOHN SMITH</code>
          <br><code>CPT M PASSPORT 01/01/2030 01/01/1980 Turkish</code>
        </div>
      `;
      return;
    }

    _crewParsedList = crews;

    renderCrewPreview();

    setCrewStatus('success', `${crews.length} ekip bulundu. Kontrol et, gerekirse düzelt, sonra gönder.`);
    document.getElementById('crewSubmitBtn').disabled = false;

  } catch (err) {
    console.error(err);
    setCrewStatus('error', 'PDF okunurken hata oluştu: ' + err.message);
    document.getElementById('crewSubmitBtn').disabled = true;
  }
}

//EXCEL READ FUNC

// ─────────────────────────────────────────────
//  PDF text extraction
// ─────────────────────────────────────────────

async function readPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js yüklenmemiş. index.html script sırasını kontrol et.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pageTexts.push(pdfTextContentToLines(content));
  }

  return pageTexts.join('\n');
}

function pdfTextContentToLines(content) {
  const items = content.items
    .filter(item => item.str && item.str.trim())
    .map(item => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: Math.round(item.transform[5] / 2) * 2
    }));

  const lineMap = new Map();

  for (const item of items) {
    if (!lineMap.has(item.y)) lineMap.set(item.y, []);
    lineMap.get(item.y).push(item);
  }

  const lines = Array.from(lineMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) => {
      return lineItems
        .sort((a, b) => a.x - b.x)
        .map(i => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .filter(Boolean);

  return lines.join('\n');
}
