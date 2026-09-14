const state = {
  busy: false,
  extensionAvailable: false,
  pendingFlightNumber: '',
  lastContext: null,
  crews: [],
  igoResult: null,
  actionPanel: null
};

const HGBS_CREW_TYPES = {
  CM: 'KABİN AMİRİ',
  CP: 'KAPTAN PİLOT',
  FO: '1. YARDIMCI PİLOT',
  SO: '2. YARDIMCI PİLOT',
  TO: '3. YARDIMCI PİLOT',
  FE: 'UÇUŞ MÜHENDİSİ',
  CA: 'KABİN GÖREVLİSİ',
  LM: 'YÜK SORUMLUSU',
  FC: 'MÜRETTEBAT'
};

const extensionRequests = new Map();

window.addEventListener('message', event => {
  if (event.source !== window || event.data?.source !== 'otobeyan-extension') return;
  if (event.data.type === 'READY') {
    state.extensionAvailable = true;
    if (document.getElementById('otobeyanStatus')) checkIgoConnectivity();
    return;
  }
  if (event.data.type !== 'RESPONSE') return;
  const pending = extensionRequests.get(event.data.requestId);
  if (!pending) return;
  extensionRequests.delete(event.data.requestId);
  clearTimeout(pending.timeout);
  if (event.data.ok) pending.resolve(event.data.result);
  else {
    const error = new Error(event.data.error || 'Chrome eklentisi hatası.');
    error.code = event.data.code || 'IGO_BRIDGE_ERROR';
    pending.reject(error);
  }
});

function extensionRequest(type, payload = {}, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const timeout = setTimeout(() => {
      extensionRequests.delete(requestId);
      reject(new Error('OtoBeyan Chrome eklentisi yanıt vermedi.'));
    }, timeoutMs);
    extensionRequests.set(requestId, { resolve, reject, timeout });
    window.postMessage({ source: 'otobeyan-page', type, requestId, payload }, '*');
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function normalizeFlightNumber(value) {
  const match = String(value || '').toUpperCase().match(/\b(XQ)\s*[- ]?(\d{1,4}[A-Z]?)\b/);
  return match ? `${match[1]}${match[2]}` : '';
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

function getMainState() {
  try {
    return globalThis.eval('typeof STATE !== "undefined" ? STATE : null');
  } catch {
    return null;
  }
}

function getExcelContext(flightNumber) {
  const appState = getMainState();
  const rows = Array.isArray(appState?.rows) ? appState.rows : [];
  const matches = rows.filter(row => normalizeFlightNumber(row.flightNo) === flightNumber);
  const departures = matches.filter(row => String(row.type || '').toLocaleUpperCase('tr-TR').includes('GİDİŞ'));
  const candidates = departures.length ? departures : matches;
  if (!candidates.length) return null;

  const dates = [...new Set(candidates.map(row => normalizeDate(row.flightDate)).filter(Boolean))];
  if (dates.length !== 1) return { ambiguous: true, candidates };
  const row = candidates.find(item => normalizeDate(item.flightDate) === dates[0]) || candidates[0];
  return {
    flightNumber,
    flightDate: dates[0],
    tailNumber: row.reg || '',
    departurePortCode: row.departureAirport || '',
    arrivalPortCode: row.arrivalAirport || '',
    scheduledTime: row.time || '',
    rowIndex: rows.indexOf(row),
    row
  };
}

function installStyles() {
  if (document.getElementById('otobeyanStyles')) return;
  const style = document.createElement('style');
  style.id = 'otobeyanStyles';
  style.textContent = `
    #otobeyanLauncher{position:fixed;right:22px;bottom:22px;z-index:2050;border:0;border-radius:999px;background:#172554;color:#fff;padding:12px 17px;font:700 13px/1.2 inherit;box-shadow:0 12px 30px #0f172a38;cursor:pointer}
    #otobeyanPanel{position:fixed;right:22px;bottom:76px;z-index:2050;width:min(420px,calc(100vw - 24px));height:min(620px,calc(100vh - 110px));display:none;grid-template-rows:auto 1fr auto;background:#fff;border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 22px 55px #0f172a40;overflow:hidden}
    #otobeyanPanel.open{display:grid}.otobeyan-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;background:#172554;color:#fff}.otobeyan-title{font-weight:800}.otobeyan-sub{font-size:11px;color:#c7d2fe;margin-top:2px}.otobeyan-actions{display:flex;gap:6px}.otobeyan-head button{border:1px solid #ffffff40;background:#ffffff16;color:#fff;border-radius:7px;padding:6px 8px;cursor:pointer}
    #otobeyanMessages{padding:14px;overflow:auto;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.otobeyan-message{max-width:92%;padding:9px 11px;border-radius:11px;font-size:13px;line-height:1.45;white-space:pre-wrap}.otobeyan-message.bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;color:#334155}.otobeyan-message.user{align-self:flex-end;background:#dbeafe;color:#1e3a8a}.otobeyan-message.error{border-color:#fecaca;background:#fef2f2;color:#991b1b}.otobeyan-message.success{border-color:#bbf7d0;background:#f0fdf4;color:#166534}.otobeyan-message strong{font-weight:800}
    .otobeyan-compose{border-top:1px solid #e2e8f0;padding:10px;background:#fff}.otobeyan-input-row{display:grid;grid-template-columns:auto 1fr auto;gap:7px}.otobeyan-input-row button,.otobeyan-input-row input{border:1px solid #cbd5e1;border-radius:9px;font:inherit}.otobeyan-input-row input{min-width:0;padding:10px}.otobeyan-input-row button{padding:8px 10px;background:#fff;cursor:pointer}.otobeyan-input-row button:last-child{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:700}.otobeyan-input-row button:disabled{opacity:.55;cursor:wait}.otobeyan-hint{font-size:10px;color:#64748b;margin-top:7px}.otobeyan-card{margin-top:7px;padding-top:7px;border-top:1px solid #e2e8f0}.otobeyan-card>div{display:flex;justify-content:space-between;gap:10px;margin-top:3px}.otobeyan-card span:first-child{color:#64748b}.otobeyan-pill{display:inline-block;margin-top:7px;padding:3px 7px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:800}
    .otobeyan-wide{max-width:100%}.otobeyan-crew-list{display:flex;flex-direction:column;gap:8px;margin-top:9px}.otobeyan-crew-row{border:1px solid #dbe3ee;border-radius:10px;padding:9px;background:#f8fafc}.otobeyan-crew-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;font-weight:800}.otobeyan-crew-head button{border:0;background:#fee2e2;color:#991b1b;border-radius:6px;padding:4px 7px;cursor:pointer}.otobeyan-crew-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.otobeyan-crew-field{display:flex;flex-direction:column;gap:3px}.otobeyan-crew-field.full{grid-column:1/-1}.otobeyan-crew-field label{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:800}.otobeyan-crew-field input,.otobeyan-crew-field select,.otobeyan-review input,.otobeyan-review select{min-width:0;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;background:#fff;padding:7px;font:inherit;color:#0f172a}.otobeyan-source-arrow{font-size:10px;color:#64748b;margin-top:4px}.otobeyan-inline-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.otobeyan-btn{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;padding:8px 10px;font:700 11px/1.2 inherit;cursor:pointer}.otobeyan-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.otobeyan-btn.success{background:#15803d;border-color:#15803d;color:#fff}.otobeyan-btn:disabled{opacity:.55;cursor:not-allowed}.otobeyan-review{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.otobeyan-review label{display:flex;flex-direction:column;gap:3px;font-size:9px;text-transform:uppercase;color:#64748b;font-weight:800}
    @media(max-width:520px){#otobeyanLauncher{right:12px;bottom:12px}#otobeyanPanel{right:12px;bottom:66px}}
  `;
  document.head.appendChild(style);
}

function installUi() {
  if (document.getElementById('otobeyanPanel')) return;
  installStyles();
  document.body.insertAdjacentHTML('beforeend', `
    <button id="otobeyanLauncher" type="button">✈ OtoBeyan</button>
    <section id="otobeyanPanel" aria-label="OtoBeyan yardımcısı">
      <header class="otobeyan-head">
        <div><div class="otobeyan-title">OtoBeyan</div><div class="otobeyan-sub" id="otobeyanStatus">Chrome köprüsü kontrol ediliyor…</div></div>
        <div class="otobeyan-actions"><button id="otobeyanMailLogin" type="button">Mail</button><button id="otobeyanIgoLogin" type="button">iGO</button><button id="otobeyanClose" type="button">✕</button></div>
      </header>
      <div id="otobeyanMessages"></div>
      <div class="otobeyan-compose">
        <div class="otobeyan-input-row">
          <button id="otobeyanAttach" type="button" title="GenDec PDF yükle">📎</button>
          <input id="otobeyanInput" placeholder="XQ254 veya XQ254 13.09.2026" autocomplete="off">
          <button id="otobeyanSend" type="button">Gönder</button>
        </div>
        <div class="otobeyan-hint">PDF yüklersen ekip parserı; sefer yazarsan Excel tarihi + iGO Load Sheet kullanılır.</div>
        <input id="otobeyanFile" type="file" accept="application/pdf,.pdf" hidden>
      </div>
    </section>`);

  document.getElementById('otobeyanLauncher').addEventListener('click', togglePanel);
  document.getElementById('otobeyanClose').addEventListener('click', togglePanel);
  document.getElementById('otobeyanSend').addEventListener('click', submitText);
  document.getElementById('otobeyanInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') submitText();
  });
  document.getElementById('otobeyanAttach').addEventListener('click', () => document.getElementById('otobeyanFile').click());
  document.getElementById('otobeyanFile').addEventListener('change', handlePdf);
  document.getElementById('otobeyanIgoLogin').addEventListener('click', openIgoLogin);
  document.getElementById('otobeyanMailLogin').addEventListener('click', openMailLogin);
  addMessage('Sefer numarası yazabilir veya SunExpress GenDec PDF yükleyebilirsin. Önce Excel yüklüyse tarihi otomatik bulurum.', 'bot');
  syncVisibility();
  checkIgoConnectivity();
}

function syncVisibility() {
  const launcher = document.getElementById('otobeyanLauncher');
  if (launcher) launcher.style.display = '';
}

function togglePanel() {
  const panel = document.getElementById('otobeyanPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) document.getElementById('otobeyanInput').focus();
}

function addMessage(content, type = 'bot', html = false) {
  const message = document.createElement('div');
  message.className = `otobeyan-message ${type}`;
  if (html) message.innerHTML = content;
  else message.textContent = content;
  const list = document.getElementById('otobeyanMessages');
  list.appendChild(message);
  list.scrollTop = list.scrollHeight;
  return message;
}

function setBusy(busy) {
  state.busy = busy;
  document.getElementById('otobeyanSend').disabled = busy;
  document.getElementById('otobeyanAttach').disabled = busy;
}

async function checkIgoConnectivity() {
  const status = document.getElementById('otobeyanStatus');
  try {
    const result = await extensionRequest('STATUS', {}, 1_500);
    state.extensionAvailable = true;
    status.textContent = result.authenticated
      ? 'Chrome köprüsü · iGO bağlı'
      : result.tabOpen
        ? 'Chrome köprüsü hazır · iGO girişi bekleniyor'
        : 'Chrome köprüsü hazır · iGO sekmesi otomatik açılır';
    return;
  } catch {
    state.extensionAvailable = false;
  }
  status.textContent = 'Yerel dosya modu · iGO için Chrome köprüsü gerekli';
}

async function openIgoLogin() {
  if (state.extensionAvailable) {
    try {
      const result = await extensionRequest('OPEN_LOGIN');
      addMessage(result.authenticated
        ? 'iGO oturumu açık. Arama yapabilirsin.'
        : 'iGO sekmesini açtım. Girişi orada tamamla; eklenti parolanı görmez.', result.authenticated ? 'success' : 'bot');
      await checkIgoConnectivity();
      return;
    } catch (error) {
      addMessage(error.message, 'error');
      return;
    }
  }
  window.open('https://igo.sunexpress.com/WB/pgWBFlightList.aspx', '_blank', 'noopener');
  addMessage('iGO sayfasını açtım. Canlı sorgu için OtoBeyan Chrome köprüsünün kurulu ve dosya erişiminin açık olması gerekir.', 'bot');
}

function openMailLogin() {
  if (!globalThis.BeyanMail?.openLogin) {
    addMessage('Mail modülü henüz yüklenmedi. Sayfayı yenileyip tekrar dene.', 'error');
    return;
  }
  globalThis.BeyanMail.openLogin(async () => {
    addMessage('Mail bağlantısı hazır.', 'success');
    if (state.lastContext) await searchCrewMail(state.lastContext);
  });
}

function extractInputContext(text) {
  return {
    flightNumber: normalizeFlightNumber(text),
    flightDate: normalizeDate(text)
  };
}

function copyCrewListFromMainScope() {
  try {
    return globalThis.eval(`typeof _crewParsedList !== 'undefined'
      ? _crewParsedList.map(item => ({ ...item }))
      : []`);
  } catch {
    return [];
  }
}

async function fetchCrewFromConnectedMail(context) {
  if (!globalThis.BeyanMail?.isConnected?.()) {
    return { status: 'not-connected', crews: [], message: 'Mail bağlantısı açık değil.' };
  }

  let original;
  try {
    original = globalThis.eval(`({
      detail: typeof _currentFlightDetail === 'undefined' ? null : _currentFlightDetail,
      baseId: typeof _currentFlightBaseId === 'undefined' ? null : _currentFlightBaseId,
      pdfFile: typeof _crewPdfFile === 'undefined' ? null : _crewPdfFile,
      crews: typeof _crewParsedList === 'undefined' ? [] : _crewParsedList
    })`);
    globalThis.__otobeyanMailContext = {
      flightNumber: context.flightNumber,
      flightDate: context.flightDate,
      tailNumber: context.tailNumber || '',
      departurePortCode: context.departurePortCode || '',
      arrivalPortCode: context.arrivalPortCode || ''
    };
    globalThis.eval(`
      _currentFlightDetail = globalThis.__otobeyanMailContext;
      _currentFlightBaseId = null;
      _crewPdfFile = null;
      _crewParsedList = [];
    `);
    await globalThis.BeyanMail.fetchCrewPdf();
    const crews = copyCrewListFromMainScope();
    const statusText = document.getElementById('crewStatusLine')?.textContent?.trim() || '';
    return crews.length
      ? { status: 'found', crews, message: statusText }
      : { status: 'not-found', crews: [], message: statusText || 'Bu sefer/tarih için ekip PDF bulunamadı.' };
  } finally {
    if (original) {
      globalThis.__otobeyanOriginalMailState = original;
      globalThis.eval(`
        _currentFlightDetail = globalThis.__otobeyanOriginalMailState.detail;
        _currentFlightBaseId = globalThis.__otobeyanOriginalMailState.baseId;
        _crewPdfFile = globalThis.__otobeyanOriginalMailState.pdfFile;
        _crewParsedList = globalThis.__otobeyanOriginalMailState.crews;
      `);
    }
    delete globalThis.__otobeyanMailContext;
    delete globalThis.__otobeyanOriginalMailState;
  }
}

async function searchCrewMail(context) {
  if (!globalThis.BeyanMail?.isConnected?.()) {
    const message = addMessage('Ekip PDF araması için mail bağlantısı kapalı.', 'bot');
    const actions = document.createElement('div');
    actions.className = 'otobeyan-inline-actions';
    const button = document.createElement('button');
    button.className = 'otobeyan-btn primary';
    button.type = 'button';
    button.textContent = 'Mail Girişi Yap';
    button.addEventListener('click', openMailLogin);
    actions.appendChild(button);
    message.appendChild(actions);
    return null;
  }

  addMessage(`${context.flightNumber} / ${context.flightDate} için mailde GenDec aranıyor…`, 'bot');
  try {
    const result = await fetchCrewFromConnectedMail(context);
    if (result.status === 'found') {
      renderCrewEditor(result.crews, 'Mail GenDec');
      return result.crews;
    }
    addMessage(`Mail araması tamamlandı: ${result.message}`, 'error');
  } catch (error) {
    addMessage(`Mail GenDec alınamadı: ${error.message}`, 'error');
  }
  return null;
}

function cloneCrew(crew, index) {
  return {
    orderNo: String(crew.orderNo || index + 1),
    sourceTypeCode: String(crew.sourceTypeCode || crew.crewTypeCode || '').toUpperCase(),
    crewTypeCode: String(crew.crewTypeCode || 'CA').toUpperCase(),
    name: String(crew.name || ''),
    surname: String(crew.surname || ''),
    nationalityCode: String(crew.nationalityCode || ''),
    dateOfBirth: String(crew.dateOfBirth || ''),
    identityCode: String(crew.identityCode || ''),
    identityNumber: String(crew.identityNumber || '')
  };
}

function crewTypeOptions(selected) {
  return Object.entries(HGBS_CREW_TYPES).map(([code, label]) =>
    `<option value="${code}"${code === selected ? ' selected' : ''}>${code} - ${escapeHtml(label)}</option>`
  ).join('');
}

function crewField(label, index, key, value, options = {}) {
  const className = options.full ? 'otobeyan-crew-field full' : 'otobeyan-crew-field';
  if (options.select) {
    return `<label class="${className}"><span>${escapeHtml(label)}</span><select data-crew-index="${index}" data-crew-key="${key}">${options.select}</select></label>`;
  }
  return `<label class="${className}"><span>${escapeHtml(label)}</span><input ${options.type ? `type="${options.type}"` : ''} value="${escapeHtml(value)}" data-crew-index="${index}" data-crew-key="${key}"></label>`;
}

function bindCrewEditor(editor) {
  editor.querySelectorAll('[data-crew-index][data-crew-key]').forEach(control => {
    control.addEventListener('input', () => {
      const crew = state.crews[Number(control.dataset.crewIndex)];
      if (crew) crew[control.dataset.crewKey] = control.value;
      renderActionPanel();
    });
  });
  editor.querySelectorAll('[data-remove-crew]').forEach(button => {
    button.addEventListener('click', () => {
      state.crews.splice(Number(button.dataset.removeCrew), 1);
      renderCrewEditor(state.crews, 'Düzenlenen ekip');
    });
  });
}

function renderCrewEditor(crews, source) {
  if (!crews?.length) return;
  state.crews = crews.map(cloneCrew);
  const captain = state.crews.find(crew => crew.crewTypeCode === 'CP');
  const message = addMessage('', 'success');
  message.classList.add('otobeyan-wide');
  message.innerHTML = `<strong>${escapeHtml(source)} · ${state.crews.length} ekip</strong>${captain ? ` · Kaptan: ${escapeHtml(`${captain.name} ${captain.surname}`.trim())}` : ''}
    <div class="otobeyan-crew-list">
      ${state.crews.map((crew, index) => `
        <div class="otobeyan-crew-row">
          <div class="otobeyan-crew-head"><span>#${index + 1} Ekip</span><button type="button" data-remove-crew="${index}">Sil</button></div>
          <div class="otobeyan-crew-grid">
            ${crewField('PDF / Kaynak Crew Type', index, 'sourceTypeCode', crew.sourceTypeCode)}
            ${crewField('HGBS Crew Type', index, 'crewTypeCode', crew.crewTypeCode, { select: crewTypeOptions(crew.crewTypeCode) })}
            ${crewField('Ad', index, 'name', crew.name)}
            ${crewField('Soyad', index, 'surname', crew.surname)}
            ${crewField('Milliyet', index, 'nationalityCode', crew.nationalityCode)}
            ${crewField('Doğum Tarihi', index, 'dateOfBirth', crew.dateOfBirth, { type: 'date' })}
            ${crewField('Belge Tipi', index, 'identityCode', crew.identityCode)}
            ${crewField('Belge No', index, 'identityNumber', crew.identityNumber)}
          </div>
          <div class="otobeyan-source-arrow">Kaynak görev yalnız izleme/düzeltme içindir → HGBS'ye seçilen görev gönderilir.</div>
        </div>`).join('')}
    </div>
    <div class="otobeyan-inline-actions"><button class="otobeyan-btn" type="button" data-add-crew>+ Ekip Ekle</button></div>`;
  bindCrewEditor(message);
  message.querySelector('[data-add-crew]').addEventListener('click', () => {
    state.crews.push(cloneCrew({ sourceTypeCode: 'MANUEL', crewTypeCode: 'CA' }, state.crews.length));
    renderCrewEditor(state.crews, 'Düzenlenen ekip');
  });
  renderActionPanel();
}

async function submitText() {
  if (state.busy) return;
  const input = document.getElementById('otobeyanInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMessage(text, 'user');

  let context = extractInputContext(text);
  if (!context.flightNumber && state.pendingFlightNumber && context.flightDate) context.flightNumber = state.pendingFlightNumber;
  if (!context.flightNumber) {
    addMessage('Sefer numarasını XQ254 biçiminde yaz.', 'error');
    return;
  }

  const excel = getExcelContext(context.flightNumber);
  if (!context.flightDate && excel?.flightDate) context = { ...excel, ...context, flightDate: excel.flightDate };
  if (!context.flightDate) {
    state.pendingFlightNumber = context.flightNumber;
    addMessage(`${context.flightNumber} için Excel’de tek tarih bulamadım. Tarihi 13.09.2026 biçiminde yaz.`, 'bot');
    return;
  }

  state.pendingFlightNumber = '';
  state.lastContext = { ...excel, ...context };
  state.crews = [];
  state.igoResult = null;
  clearActionPanel();
  const mailPromise = searchCrewMail(state.lastContext);
  await runIgoQuery(state.lastContext);
  await mailPromise;
  renderActionPanel();
}

async function runIgoQuery(context) {
  setBusy(true);
  if (state.extensionAvailable) {
    addMessage(`${context.flightNumber} / ${context.flightDate} iGO’da Chrome köprüsüyle aranıyor…`, 'bot');
    try {
      const result = await extensionRequest('SEARCH_FLIGHT', context);
      if (result.status !== 'ready') {
        addMessage(result.warnings?.[0] || 'Uçuş bulundu fakat Load Sheet henüz hazır değil.', 'error');
      } else {
        renderIgoResult(result);
      }
    } catch (error) {
      addMessage(error.message, 'error');
    } finally {
      setBusy(false);
      checkIgoConnectivity();
    }
    return;
  }
  addMessage(`${context.flightNumber} / ${context.flightDate} hazır. iGO sorgusu için Chrome köprüsü algılanmadı; PDF ve mail ekip işlemleri sunucusuz devam eder.`, 'error');
  setBusy(false);
}

function renderIgoResult(result) {
  state.igoResult = result;
  const flight = result.flight;
  const sheet = result.loadSheet;
  const field = name => sheet.fields?.[name]?.value ?? '—';
  const finalized = sheet.finalized;
  const message = `
    <strong>${escapeHtml(flight.flightNumber)} · ${escapeHtml(flight.flightDate)}</strong>
    <div class="otobeyan-card">
      <div><span>Rota</span><strong>${escapeHtml(flight.departurePortCode)}–${escapeHtml(flight.arrivalPortCode)}</strong></div>
      <div><span>Kuyruk</span><strong>${escapeHtml(flight.tailNumber)}</strong></div>
      <div><span>PAX + INF</span><strong>${escapeHtml(field('pax'))} + ${escapeHtml(field('infant'))}</strong></div>
      <div><span>OffBlock Fuel</span><strong>${escapeHtml(field('offBlockFuelKg'))} kg</strong></div>
      <div><span>Load Sheet</span><strong>EDNO ${escapeHtml(field('edno'))}</strong></div>
    </div>
    <span class="otobeyan-pill">${finalized ? '✓ Digitally Signed' : '⚠ Finalize edilmedi'}</span>`;
  addMessage(message, finalized ? 'success' : 'error', true);
  state.declaration = {
    pax: Number(field('pax')) || 0,
    infant: Number(field('infant')) || 0,
    fuel: Number(field('offBlockFuelKg')) || 0,
    fuelType: 'national'
  };
  renderActionPanel();
}

function getMainFunction(name) {
  try {
    return globalThis.eval(`typeof ${name} === 'function' ? ${name} : null`);
  } catch {
    return null;
  }
}

function getCaptainName() {
  const captain = state.crews.find(crew => String(crew.crewTypeCode).toUpperCase() === 'CP');
  return captain ? `${captain.name || ''} ${captain.surname || ''}`.trim() : '';
}

function clearActionPanel() {
  state.actionPanel?.remove?.();
  state.actionPanel = null;
}

function updateDeclarationValue(key, value) {
  if (!state.declaration) return;
  state.declaration[key] = key === 'fuelType' ? value : Math.max(0, Number.parseInt(value, 10) || 0);
}

function renderActionPanel() {
  clearActionPanel();
  const context = state.lastContext;
  if (!context?.row || !state.igoResult || state.igoResult.status !== 'ready') return;

  const declaration = state.declaration || { pax: 0, infant: 0, fuel: 0, fuelType: 'national' };
  const combinedReady = state.crews.length > 0;
  const message = addMessage('', 'bot');
  message.classList.add('otobeyan-wide');
  message.innerHTML = `<strong>HGBS işlemine hazırla</strong>
    <div class="otobeyan-review">
      <label>PAX<input type="number" min="0" data-declaration="pax" value="${escapeHtml(declaration.pax)}"></label>
      <label>INFANT<input type="number" min="0" data-declaration="infant" value="${escapeHtml(declaration.infant)}"></label>
      <label>OffBlock Fuel KG<input type="number" min="0" data-declaration="fuel" value="${escapeHtml(declaration.fuel)}"></label>
      <label>HGBS Yakıt Alanı<select data-declaration="fuelType"><option value="national"${declaration.fuelType === 'national' ? ' selected' : ''}>Milli</option><option value="foreign"${declaration.fuelType === 'foreign' ? ' selected' : ''}>Yabancı</option></select></label>
    </div>
    <div class="otobeyan-inline-actions">
      <button class="otobeyan-btn primary" type="button" data-open-only>Sadece Uçuşu Aç</button>
      <button class="otobeyan-btn success" type="button" data-open-declare ${combinedReady ? '' : 'disabled'}>Uçuşu Aç + Beyan Et</button>
    </div>
    ${combinedReady ? '<div class="otobeyan-source-arrow">İkinci seçenek ekip + yolcu + infant + yakıtı kaydeder ve gümrüğe sunar. Son onay HGBS uçuş penceresinde verilir.</div>' : '<div class="otobeyan-source-arrow">Aç + Beyan Et için önce ekip PDF bulunmalı veya yüklenmeli.</div>'}`;
  message.querySelectorAll('[data-declaration]').forEach(control => {
    control.addEventListener('input', () => updateDeclarationValue(control.dataset.declaration, control.value));
  });
  message.querySelector('[data-open-only]').addEventListener('click', () => openFlightConfirmation(false));
  message.querySelector('[data-open-declare]').addEventListener('click', () => openFlightConfirmation(true));
  state.actionPanel = message;
}

function validateCrewDraft() {
  if (!state.crews.length) return 'Ekip listesi boş.';
  for (let index = 0; index < state.crews.length; index += 1) {
    const crew = state.crews[index];
    if (!HGBS_CREW_TYPES[crew.crewTypeCode]) return `${index + 1}. ekip için geçerli HGBS crew type seç.`;
    if (!String(crew.name || '').trim()) return `${index + 1}. ekipte ad boş.`;
    if (!String(crew.surname || '').trim()) return `${index + 1}. ekipte soyad boş.`;
  }
  return '';
}

function prefillFlightModal() {
  const crewInput = document.getElementById('modalCrewInput');
  const captainInput = document.getElementById('modalCaptainName');
  if (crewInput) crewInput.value = state.crews.length;
  if (captainInput) captainInput.value = getCaptainName();
  getMainFunction('updateModalPreview')?.();
}

function openFlightConfirmation(withDeclaration) {
  const context = state.lastContext;
  const openModal = getMainFunction('openModal');
  if (!context?.row || context.rowIndex < 0 || !openModal) {
    addMessage('Excel uçuş satırı veya HGBS uçuş açma ekranı bulunamadı.', 'error');
    return;
  }
  if (withDeclaration) {
    const crewError = validateCrewDraft();
    if (crewError) {
      addMessage(crewError, 'error');
      return;
    }
  }

  openModal(context.rowIndex, false);
  prefillFlightModal();
  if (!withDeclaration) return;

  const confirmButton = document.getElementById('modalConfirmBtn');
  if (confirmButton) {
    confirmButton.textContent = 'Uçuşu Aç + Beyan Et →';
    confirmButton.onclick = confirmOpenAndDeclare;
  }
  if (!state.igoResult?.loadSheet?.finalized) {
    const warning = document.getElementById('modalWarningBanner');
    if (warning) {
      warning.style.display = 'block';
      warning.textContent = '⚠ iGO Load Sheet finalize edilmedi. Bilgiler hazırlanmıştır; devam edersen mevcut değerler beyan edilir.';
    }
  }
}

async function buildCrewApiPayload(baseId) {
  const normalizeType = getMainFunction('normalizeCrewExcelType');
  const normalizeDate = getMainFunction('crewDateForApi');
  const normalizeCode = getMainFunction('normalizeCode');
  const normalizeIdentity = getMainFunction('normalizeIdentityNumber');
  const normalizeName = getMainFunction('normalizePersonName');
  const normalizeNationality = getMainFunction('normalizeNationality');
  return {
    baseId,
    crews: state.crews.map(crew => ({
      id: '',
      crewTypeCode: normalizeType ? normalizeType(crew.crewTypeCode) : String(crew.crewTypeCode || '').toUpperCase(),
      dateOfBirth: normalizeDate ? normalizeDate(crew.dateOfBirth) : crew.dateOfBirth,
      identityCode: normalizeCode ? normalizeCode(crew.identityCode) : String(crew.identityCode || '').toUpperCase(),
      identityNumber: normalizeIdentity ? normalizeIdentity(crew.identityNumber) : String(crew.identityNumber || '').toUpperCase(),
      name: normalizeName ? normalizeName(crew.name) : String(crew.name || '').toUpperCase(),
      surname: normalizeName ? normalizeName(crew.surname) : String(crew.surname || '').toUpperCase(),
      nationalityCode: normalizeNationality ? normalizeNationality(crew.nationalityCode) : String(crew.nationalityCode || '').toUpperCase()
    }))
  };
}

async function confirmOpenAndDeclare() {
  const context = state.lastContext;
  const row = context?.row;
  const apiCall = getMainFunction('apiCall');
  const getModalEtaValues = getMainFunction('getModalEtaValues');
  const validateModalEtaValues = getMainFunction('validateModalEtaValues');
  const buildPayload = getMainFunction('buildPayload');
  const getRowApiId = getMainFunction('getRowApiId');
  const buildHvbPayload = getMainFunction('buildHvbPayload');
  const hvbDefaultState = getMainFunction('hvbDefaultState');
  const hvbPopulateStateFromApi = getMainFunction('hvbPopulateStateFromApi');
  const closeModal = getMainFunction('closeModal');
  const refreshRows = getMainFunction('refreshRowsAfterHGBSAction');
  const updateRow = getMainFunction('updateRow');
  const markAsSent = getMainFunction('markAsSent');
  const setModalStatus = getMainFunction('setModalStatus');
  const button = document.getElementById('modalConfirmBtn');

  if (!row || !apiCall || !getModalEtaValues || !buildPayload || !buildHvbPayload || !hvbDefaultState) {
    addMessage('HGBS işlem fonksiyonları hazır değil. Sayfayı yenileyip tekrar dene.', 'error');
    return;
  }
  const crewError = validateCrewDraft();
  if (crewError) {
    setModalStatus?.('error', crewError);
    return;
  }
  const eta = getModalEtaValues();
  const etaValidation = validateModalEtaValues?.(row, eta);
  if (etaValidation && !etaValidation.isValid) {
    setModalStatus?.('error', etaValidation.message);
    document.getElementById(etaValidation.focusId)?.focus();
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Uçuş hazırlanıyor…';
  }
  setModalStatus?.('info', 'Uçuş, ekip ve hava yolu beyanı sırayla gönderiliyor…');

  try {
    const crewCount = state.crews.length;
    const captainName = getCaptainName();
    let baseId = getRowApiId?.(row) || '';

    if (!baseId) {
      const flightPayload = buildPayload(row, crewCount, captainName, eta, false);
      const response = await apiCall('PUT', '/api/Flight/SetFlight?api-version=1.0', flightPayload);
      const data = response?.data ?? response;
      baseId = data?.baseId ?? data?.id ?? (typeof data === 'string' || typeof data === 'number' ? data : '');
      if (!baseId) throw new Error('Uçuş açıldı ancak HGBS baseId dönmedi; beyan güvenli biçimde durduruldu.');
      row._status = 'success';
      row._result = { apiId: baseId };
      markAsSent?.(row.id, { flightDate: context.flightDate, flightNo: row.flightNo, type: row.type, reg: row.reg, apiId: baseId });
      updateRow?.(context.rowIndex);
    }

    if (button) button.textContent = 'Ekip gönderiliyor…';
    await apiCall('PUT', '/api/Flight/SetCrews?api-version=1.0', await buildCrewApiPayload(baseId));

    if (button) button.textContent = 'Yolcu / yakıt gönderiliyor…';
    const flightResponse = await apiCall('GET', `/api/Flight/GetFlight?baseId=${encodeURIComponent(baseId)}&api-version=1.0`);
    const flightDetail = flightResponse?.data || flightResponse;
    if (!flightDetail) throw new Error('HGBS uçuş detayı alınamadı.');

    let existingAirDec = {};
    try {
      const existingResponse = await apiCall('GET', `/api/Flight/GetAirDec?baseId=${encodeURIComponent(baseId)}&api-version=1.0`);
      existingAirDec = existingResponse?.data || existingResponse || {};
    } catch (_) {
      existingAirDec = {};
    }
    const airState = hvbPopulateStateFromApi
      ? hvbPopulateStateFromApi(hvbDefaultState(), existingAirDec)
      : hvbDefaultState();
    const declaration = state.declaration || {};
    const pax = Math.max(0, Number(declaration.pax) || 0);
    const infant = Math.max(0, Number(declaration.infant) || 0);
    const fuel = Math.max(0, Number(declaration.fuel) || 0);
    const isDeparture = flightDetail.flightTypeCode === 'GDS' || row.type === 'GİDİŞ';
    airState.hasPassenger = pax + infant > 0;
    airState.passengerLoadThisPort = isDeparture ? pax : 0;
    airState.passengerBabyLoadThisPort = isDeparture ? infant : 0;
    airState.passengerUnloadThisPort = isDeparture ? 0 : pax;
    airState.passengerBabyUnloadThisPort = isDeparture ? 0 : infant;
    airState.fuelNational = declaration.fuelType === 'foreign' ? 0 : fuel;
    airState.fuelForeign = declaration.fuelType === 'foreign' ? fuel : 0;
    const airPayload = buildHvbPayload(flightDetail, baseId, airState, existingAirDec);
    await apiCall('PUT', '/api/Flight/SetAirDec?api-version=1.0', airPayload);

    if (button) button.textContent = 'Gümrüğe sunuluyor…';
    await apiCall('POST', '/api/AirBase/StatusActionAgency?api-version=1.0', {
      id: baseId,
      action: 'GUMRUGESUNULDU',
      actionComment: '-'
    });

    closeModal?.();
    addMessage(`${row.flightNo}: uçuş açıldı, ${crewCount} ekip ile yolcu/yakıt kaydedildi ve gümrüğe sunuldu.`, 'success');
    await refreshRows?.();
  } catch (error) {
    setModalStatus?.('error', error.message);
    addMessage(`HGBS işlemi durdu: ${error.message}`, 'error');
    if (button) {
      button.disabled = false;
      button.textContent = 'Tekrar Dene: Uçuşu Aç + Beyan Et →';
    }
  }
}

async function handlePdf(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  addMessage(`📎 ${file.name}`, 'user');
  setBusy(true);
  try {
    if (typeof globalThis.readPdfText !== 'function' || typeof globalThis.parseCrewPdfFileData !== 'function') {
      throw new Error('GenDec PDF parserı henüz yüklenmedi. Sayfayı yenileyip tekrar dene.');
    }
    const text = await globalThis.readPdfText(file);
    const flightNumber = normalizeFlightNumber(text);
    const excel = flightNumber ? getExcelContext(flightNumber) : null;
    const flightDate = normalizeDate(text) || excel?.flightDate || '';
    const tailMatch = String(text).toUpperCase().match(/\bTC\s*[- ]?\s*([A-Z0-9]{3})\b/);
    const tailNumber = tailMatch ? `TC-${tailMatch[1]}` : excel?.tailNumber || '';
    const parsed = await globalThis.parseCrewPdfFileData(file, { flightNo: flightNumber, tailNumber });
    if (!parsed.crews?.length) throw new Error('PDF içinde ekip listesi bulunamadı.');
    state.crews = [];
    state.igoResult = null;
    clearActionPanel();
    renderCrewEditor(parsed.crews, `Yüklenen PDF${flightNumber ? ` · ${flightNumber}` : ''}`);
    if (flightNumber && flightDate) {
      state.lastContext = { ...excel, flightNumber, flightDate, tailNumber };
      await runIgoQuery(state.lastContext);
      renderActionPanel();
    } else {
      addMessage('Ekip hazır. iGO sorgusu için PDF’te sefer/tarih bulunamadı; sefer numarasını yaz.', 'bot');
    }
  } catch (error) {
    addMessage(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

installUi();
