const QUICKBEYAN_VERSION = '1.8.5';

const state = {
  busy: false,
  lastContext: null,
  crews: [],
  mailDataResult: null,
  actionPanel: null,
  crewPanel: null,
  mailDataPanel: null,
  searchPanel: null,
  uploadPanel: null,
  crewSourceToken: 0,
  jobs: new Map()
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function normalizeFlightNumber(value, airlineCode = '') {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const fullFlight = compact.match(/^([A-Z]{3})(\d{1,5}[A-Z]?)$/)
    || compact.match(/^([A-Z0-9]{2})(\d{1,5}[A-Z]?)$/);
  const aliases = { STW: '2S', TWI: 'TI' };
  if (fullFlight && /[A-Z]/.test(fullFlight[1])) {
    return `${aliases[fullFlight[1]] || fullFlight[1]}${fullFlight[2]}`;
  }

  const number = compact.match(/^(\d{1,5}[A-Z]?)$/)?.[1] || '';
  const company = String(airlineCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefix = { ...aliases, '2S': '2S', TI: 'TI' }[company] || '';
  return number && prefix ? `${prefix}${number}` : '';
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

function installStyles() {
  // QuickBeyan styles live in style.css.
}

function installUi() {
  if (document.getElementById('otobeyanPanel')) return;
  installStyles();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="otobeyanOverlay" aria-hidden="true">
    <section id="otobeyanPanel" role="dialog" aria-modal="true" aria-label="Hızlı Beyan">
      <header class="otobeyan-head">
        <div><div class="otobeyan-title" id="otobeyanTitle">Hızlı Beyan</div><div class="otobeyan-sub" id="otobeyanStatus">Bağlantı kontrol ediliyor…</div></div>
        <div class="otobeyan-actions"><button id="otobeyanClose" type="button">✕</button></div>
      </header>
      <div id="otobeyanMessages"></div>
      <footer id="otobeyanLiveSummary" aria-live="polite"></footer>
    </section></div>
    <aside id="otobeyanJobStack" aria-live="polite" aria-label="Beyan işlemleri"></aside>`);

  document.getElementById('otobeyanClose').addEventListener('click', closePanel);
  document.getElementById('otobeyanOverlay').addEventListener('click', event => {
    if (event.target.id === 'otobeyanOverlay' && !state.busy) closePanel();
  });
  checkMailConnectivity();
  globalThis.OtoBeyanApi?.recentMail?.().catch(() => {
    // Sessiz ön ısıtma: gerçek hata kullanıcı Hızlı Beyan başlattığında gösterilir.
  });
  installQuickButtons();
}

function openPanel() {
  const overlay = document.getElementById('otobeyanOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closePanel() {
  const overlay = document.getElementById('otobeyanOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function isQuickBeyanEligible(row, actionCell) {
  const flightNumber = normalizeFlightNumber(row?.flightNo, row?.ac);
  const hasFlightNumber = Boolean(flightNumber);
  const hasOpenAction = Boolean(actionCell?.querySelector('button[onclick*="openModal("]'));
  return hasFlightNumber && hasOpenAction;
}

function setSearchStatus(message, type = 'bot') {
  if (!state.searchPanel?.isConnected) {
    state.searchPanel = addMessage(message, type);
    return;
  }
  state.searchPanel.className = `otobeyan-message ${type}`;
  state.searchPanel.textContent = message;
}

async function startQuickBeyan(rowIndex, triggerButton) {
  if (!globalThis.OtoBeyanApi?.isUnlocked?.()) return;
  if (state.busy) return;
  const appState = getMainState();
  const row = Array.isArray(appState?.rows) ? appState.rows[rowIndex] : null;
  if (!row) return;

  const context = {
    flightNumber: normalizeFlightNumber(row.flightNo, row.ac),
    flightDate: normalizeDate(row.flightDate),
    tailNumber: row.reg || '',
    departurePortCode: row.departureAirport || '',
    arrivalPortCode: row.arrivalAirport || '',
    scheduledTime: row.time || '',
    isDeparture: String(row.type || '').toLocaleUpperCase('tr-TR').includes('GİDİŞ'),
    rowIndex,
    row
  };
  if (!context.flightNumber || !context.flightDate) {
    alert('Hızlı Beyan için sefer numarası veya Excel tarihi eksik.');
    return;
  }

  state.lastContext = context;
  state.crews = [];
  state.mailDataResult = null;
  state.declaration = { pax: 0, infant: 0, fuel: 0, fuelType: 'foreign' };
  clearActionPanel();
  state.crewPanel = null;
  state.mailDataPanel = null;
  state.searchPanel = null;
  state.uploadPanel = null;
  state.crewSourceToken += 1;
  const messages = document.getElementById('otobeyanMessages');
  if (messages) messages.innerHTML = '';
  const title = document.getElementById('otobeyanTitle');
  if (title) title.textContent = `Hızlı Beyan · ${context.flightNumber}`;
  openPanel();
  renderLiveSummary();
  if (triggerButton) triggerButton.disabled = true;
  setBusy(true);

  try {
    setSearchStatus('Aranıyor…');
    renderQuickFilePicker();
    renderCrewEditor([], 'Ekip listesi');
    renderActionPanel();
    await Promise.all([searchCrewMail(context), runMailDataQuery(context)]);
    renderActionPanel();
    setSearchStatus('Hazır.', 'success');
    requestAnimationFrame(() => {
      if (messages) messages.scrollTop = 0;
    });
  } finally {
    setBusy(false);
    if (triggerButton?.isConnected) triggerButton.disabled = false;
  }
}

function addQuickButtons() {
  if (!globalThis.OtoBeyanApi?.isUnlocked?.()) return;
  const appState = getMainState();
  const rows = Array.isArray(appState?.rows) ? appState.rows : [];
  rows.forEach((row, rowIndex) => {
    const actionCell = document.getElementById(`action-${rowIndex}`);
    if (!actionCell || actionCell.querySelector('[data-otobeyan-quick]')) return;
    if (!isQuickBeyanEligible(row, actionCell)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'otobeyan-quick-btn';
    button.dataset.otobeyanQuick = String(rowIndex);
    button.textContent = '⚡ Hızlı Beyan';
    button.addEventListener('click', () => startQuickBeyan(rowIndex, button));
    actionCell.appendChild(button);
  });
}

function installQuickButtons() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;
  let queued = false;
  const queueInstall = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      addQuickButtons();
    });
  };
  new MutationObserver(queueInstall).observe(tableBody, { childList: true, subtree: true });
  queueInstall();
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
}

function jobKey(context) {
  return [context?.flightDate, context?.flightNumber, context?.departurePortCode, context?.arrivalPortCode].join('|');
}

function createJobNotification(job) {
  const stack = document.getElementById('otobeyanJobStack');
  if (!stack) return null;
  const card = document.createElement('article');
  card.className = 'otobeyan-job';
  card.dataset.jobKey = job.key;
  card.innerHTML = `
    <div class="otobeyan-job-head">
      <div class="otobeyan-job-icon" aria-hidden="true">↗</div>
      <div class="otobeyan-job-title"><strong>${escapeHtml(job.context.flightNumber)} beyanı</strong><span>${escapeHtml(job.context.departurePortCode)} → ${escapeHtml(job.context.arrivalPortCode)} · ${escapeHtml(summaryDate(job.context.flightDate))}</span></div>
      <button class="otobeyan-job-close" type="button" title="Bildirimi kapat" aria-label="Bildirimi kapat">×</button>
    </div>
    <div class="otobeyan-job-status">İşlem hazırlanıyor…</div>
    <div class="otobeyan-job-track"><div class="otobeyan-job-bar"></div></div>
    <div class="otobeyan-job-steps">
      <span class="otobeyan-job-step" data-job-step="flight">Uçuş</span>
      <span class="otobeyan-job-step" data-job-step="crew">Ekip</span>
      <span class="otobeyan-job-step" data-job-step="declaration">Yolcu/Yakıt</span>
      <span class="otobeyan-job-step" data-job-step="customs">Gümrük</span>
    </div>`;
  card.querySelector('.otobeyan-job-close').addEventListener('click', () => card.remove());
  stack.appendChild(card);
  job.notification = card;
  return card;
}

function updateJobNotification(job, stage, message, outcome = 'running') {
  const card = job.notification;
  if (!card?.isConnected) return;
  const stages = ['flight', 'crew', 'declaration', 'customs'];
  const stageIndex = Math.max(0, stages.indexOf(stage));
  card.classList.toggle('success', outcome === 'success');
  card.classList.toggle('error', outcome === 'error');
  card.querySelector('.otobeyan-job-status').textContent = message;
  card.querySelector('.otobeyan-job-icon').textContent = outcome === 'success' ? '✓' : outcome === 'error' ? '!' : '↗';
  card.querySelector('.otobeyan-job-bar').style.width = outcome === 'success' || outcome === 'error'
    ? '100%'
    : `${[12, 38, 68, 90][stageIndex]}%`;
  card.querySelectorAll('[data-job-step]').forEach((step, index) => {
    step.classList.toggle('done', outcome === 'success' || index < stageIndex);
    step.classList.toggle('current', outcome === 'running' && index === stageIndex);
  });
}

function revealRunningJob(job) {
  const card = job?.notification;
  if (!card?.isConnected) return;
  card.animate?.(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(0)' }],
    { duration: 260, easing: 'ease-out' }
  );
}

function finishJob(job, outcome, message) {
  updateJobNotification(job, 'customs', message, outcome);
  state.jobs.delete(job.key);
  if (outcome === 'success') {
    window.setTimeout(() => {
      if (job.notification?.classList.contains('success')) job.notification.remove();
    }, 15000);
  }
}

async function checkMailConnectivity() {
  const status = document.getElementById('otobeyanStatus');
  try {
    const health = await globalThis.OtoBeyanApi?.health?.();
    if (health?.ok && health?.ready) {
      status.textContent = `Mail verisi hazır · v${QUICKBEYAN_VERSION}`;
      return;
    }
  } catch (_) {}
  status.textContent = 'Bağlantı kurulamadı';
}

async function searchCrewMail(context) {
  const sourceToken = state.crewSourceToken;
  const fetchCrewAttachment = globalThis.OtoBeyanApi?.flightAttachment || globalThis.OtoBeyanApi?.flightPdf;
  const parser = globalThis.GendecBrowser;
  if (fetchCrewAttachment && parser?.parseFile) {
    try {
      let candidateIndex = 0;
      let candidateCount = 1;
      let lastError = null;

      while (candidateIndex < candidateCount && candidateIndex < 10) {
        const attachment = await fetchCrewAttachment(context.flightNumber, { candidateIndex });
        candidateCount = Math.max(1, Number(attachment.candidateCount || 1));
        const fileName = attachment.fileName || `${context.flightNumber}.pdf`;
        const file = new File([attachment.blob], fileName, {
          type: attachment.blob.type || 'application/octet-stream',
          lastModified: Date.now()
        });

        try {
          const result = await parser.parseFile(file, {
            flightNo: context.flightNumber,
            tailNumber: context.tailNumber || '',
            departurePortCode: context.departurePortCode || '',
            arrivalPortCode: context.arrivalPortCode || ''
          });

          const isPdf = /\.pdf$/i.test(fileName);
          if (isPdf && !parser.resultMatchesFlight?.(result, context.flightNumber)) {
            const found = (result?.metadata?.flightNumbers || []).join(', ') || 'sefer no okunamadı';
            throw new Error(`Yanlış GenDec içeriği: ${fileName} içinde ${context.flightNumber} yok (okunan: ${found}).`);
          }

          const crews = result?.crews;
          if (!Array.isArray(crews) || !crews.length) {
            throw new Error('GenDec bulundu fakat ekip listesi browser üzerinde ayrıştırılamadı.');
          }
          if (sourceToken !== state.crewSourceToken) return null;
          const revisionInfo = attachment.mailDate ? ` · ${attachment.mailDate}` : '';
          renderCrewEditor(crews, `Mail GenDec · ${fileName}${revisionInfo}`);
          return crews;
        } catch (error) {
          lastError = error;
          candidateIndex += 1;
        }
      }

      throw lastError || new Error(`${context.flightNumber} için doğrulanmış GenDec bulunamadı.`);
    } catch (error) {
      if (sourceToken !== state.crewSourceToken) return null;
      addMessage(`GenDec bulunamadı veya okunamadı: ${error?.message || 'Bilinmeyen hata.'} Ekibi aşağıdaki tablodan elle girebilirsin.`, 'error');
      if (sourceToken === state.crewSourceToken && !state.crews.length) {
        renderCrewEditor([{ sourceTypeCode: 'MANUEL', crewTypeCode: 'CA' }], 'Manuel ekip');
      }
      return null;
    }
  }

  addMessage('GenDec servisi veya browser parser kullanılamıyor. Ekibi aşağıdaki tablodan elle girebilirsin.', 'error');
  if (sourceToken === state.crewSourceToken && !state.crews.length) {
    renderCrewEditor([{ sourceTypeCode: 'MANUEL', crewTypeCode: 'CA' }], 'Manuel ekip');
  }
  return null;
}

function renderQuickFilePicker() {
  state.uploadPanel?.remove?.();
  const panel = addMessage('', 'bot');
  panel.classList.add('otobeyan-drop');
  panel.innerHTML = `
    <div class="otobeyan-drop-copy"><strong>GenDec PDF veya Excel yükle</strong><span>Dosyayı buraya sürükle ya da bilgisayardan seç.</span></div>
    <input class="otobeyan-file-input" type="file" accept="application/pdf,.pdf,.xlsx,.xls">
    <button class="otobeyan-btn" type="button" data-file-select>Dosya Seç</button>`;
  const input = panel.querySelector('input');
  panel.querySelector('[data-file-select]').addEventListener('click', () => input.click());
  input.addEventListener('change', () => processQuickCrewFile(input.files?.[0]));
  for (const eventName of ['dragenter', 'dragover']) {
    panel.addEventListener(eventName, event => {
      event.preventDefault();
      panel.classList.add('dragover');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    panel.addEventListener(eventName, event => {
      event.preventDefault();
      panel.classList.remove('dragover');
    });
  }
  panel.addEventListener('drop', event => processQuickCrewFile(event.dataTransfer?.files?.[0]));
  state.uploadPanel = panel;
}

async function processQuickCrewFile(file) {
  if (!file) return;
  state.crewSourceToken += 1;
  const fileName = String(file.name || '');
  const isExcel = /\.(xlsx|xls)$/i.test(fileName);
  const isPdf = /\.pdf$/i.test(fileName);
  if (!isExcel && !isPdf) {
    addMessage('Yalnızca PDF, XLS veya XLSX dosyası seçebilirsin.', 'error');
    return;
  }

  const context = state.lastContext;
  setSearchStatus(`${fileName} okunuyor…`);
  try {
    const result = await globalThis.GendecBrowser.parseFile(file, {
      flightNo: context?.flightNumber || '', tailNumber: context?.tailNumber || '',
      departurePortCode: context?.departurePortCode || '', arrivalPortCode: context?.arrivalPortCode || ''
    });
    const crews = result.crews;
    if (!Array.isArray(crews) || !crews.length) throw new Error('Dosyada ekip listesi bulunamadı.');
    renderCrewEditor(crews, `Yüklenen GenDec · ${fileName}`);
    setSearchStatus(`${crews.length} ekip dosyadan okundu.`, 'success');
  } catch (error) {
    addMessage(`Dosya okunamadı: ${error.message}`, 'error');
    setSearchStatus('Dosya okunamadı.', 'error');
  }
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
  const className = 'otobeyan-crew-field';
  if (options.select) {
    return `<label class="${className}" title="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><select aria-label="${escapeHtml(label)}" data-crew-index="${index}" data-crew-key="${key}">${options.select}</select></label>`;
  }
  return `<label class="${className}" title="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><input ${options.type ? `type="${options.type}"` : ''} aria-label="${escapeHtml(label)}" value="${escapeHtml(value)}" data-crew-index="${index}" data-crew-key="${key}"></label>`;
}

function bindCrewEditor(editor) {
  editor.querySelectorAll('[data-crew-index][data-crew-key]').forEach(control => {
    control.addEventListener('input', () => {
      const crew = state.crews[Number(control.dataset.crewIndex)];
      if (crew) crew[control.dataset.crewKey] = control.value;
      renderActionPanel();
      renderLiveSummary();
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
  state.crews = (crews || []).map(cloneCrew);
  state.crewPanel?.remove?.();
  const captain = state.crews.find(crew => crew.crewTypeCode === 'CP');
  const message = addMessage('', 'success');
  message.classList.add('otobeyan-wide');
  message.innerHTML = `<strong>${escapeHtml(source)} · ${state.crews.length} ekip</strong>${captain ? ` · Kaptan: ${escapeHtml(`${captain.name} ${captain.surname}`.trim())}` : ''}
    <div class="otobeyan-crew-list">
      <div class="otobeyan-crew-columns"><span>#</span><span>Görev</span><span>Ad</span><span>Soyad</span><span>Uyruk</span><span>Doğum</span><span>Belge</span><span>Belge No</span><span></span></div>
      ${state.crews.map((crew, index) => `
        <div class="otobeyan-crew-row">
          <span class="otobeyan-crew-no">${index + 1}</span>
          ${crewField('Görev', index, 'crewTypeCode', crew.crewTypeCode, { select: crewTypeOptions(crew.crewTypeCode) })}
          ${crewField('Ad', index, 'name', crew.name)}
          ${crewField('Soyad', index, 'surname', crew.surname)}
          ${crewField('Milliyet', index, 'nationalityCode', crew.nationalityCode)}
          ${crewField('Doğum Tarihi', index, 'dateOfBirth', crew.dateOfBirth, { type: 'date' })}
          ${crewField('Belge Tipi', index, 'identityCode', crew.identityCode)}
          ${crewField('Belge No', index, 'identityNumber', crew.identityNumber)}
          <button class="otobeyan-remove-crew" type="button" title="Ekibi sil" data-remove-crew="${index}">×</button>
        </div>`).join('')}
    </div>
    <div class="otobeyan-inline-actions"><button class="otobeyan-btn" type="button" data-add-crew>+ Ekip</button></div>`;
  bindCrewEditor(message);
  message.querySelector('[data-add-crew]').addEventListener('click', () => {
    state.crews.push(cloneCrew({ sourceTypeCode: 'MANUEL', crewTypeCode: 'CA' }, state.crews.length));
    renderCrewEditor(state.crews, 'Düzenlenen ekip');
  });
  state.crewPanel = message;
  renderActionPanel();
  renderLiveSummary();
}

async function runMailDataQuery(context) {
  if (globalThis.OtoBeyanApi?.flightData) {
    try {
      const result = await globalThis.OtoBeyanApi.flightData({
        flightNumber: context.flightNumber,
        flightDate: context.flightDate,
        tailNumber: context.tailNumber
      });
      renderMailDataResult(result);
    } catch (_) {
      addMessage('Mail uçuş verisi alınamadı. Yolcu, infant ve yakıtı elle girebilirsin.', 'error');
    } finally { checkMailConnectivity(); }
    return;
  }
  addMessage('Mail uçuş verisi kullanılamıyor. Yolcu, infant ve yakıtı elle girebilirsin.', 'error');
}

function renderMailDataResult(result) {
  state.mailDataResult = result;
  const flight = result.flight;
  if (!flight) {
    addMessage('Son 15 saatte bu uçuş için LDM veya Trip Info bulunamadı. Bilgileri elle girebilirsin.', 'error');
    return;
  }
  const field = name => flight.fields?.[name]?.value;
  const display = name => field(name) ?? '—';
  const hasLdm = Boolean(flight.sources?.ldm);
  const hasTripInfo = Boolean(flight.sources?.tripInfo);
  const sources = [hasLdm ? 'LDM' : '', hasTripInfo ? 'Trip Info' : ''].filter(Boolean).join(' + ') || '—';
  state.mailDataPanel?.remove?.();
  const message = `
    <strong>${escapeHtml(flight.flightNumber)} · ${escapeHtml(flight.flightDate)}</strong>
    <div class="otobeyan-card">
      <div><span>Rota</span><strong>${escapeHtml(flight.originPortCode || '—')}–${escapeHtml(flight.destinationPortCode || '—')}</strong></div>
      <div><span>Kuyruk</span><strong>${escapeHtml(flight.tailNumber)}</strong></div>
      <div><span>PAX + INF</span><strong>${escapeHtml(display('pax'))} + ${escapeHtml(display('infant'))}</strong></div>
      <div><span>Block Fuel</span><strong>${escapeHtml(display('blockFuelKg'))} kg</strong></div>
      <div><span>Kaynak</span><strong>${sources}</strong></div>
    </div>
    <span class="otobeyan-pill">${hasLdm ? '✓ Yolcu verisi' : '⚠ LDM yok'} · ${hasTripInfo ? '✓ Yakıt verisi' : '⚠ Trip Info yok'}</span>`;
  state.mailDataPanel = addMessage(message, hasLdm || hasTripInfo ? 'success' : 'error', true);
  state.declaration = {
    pax: Number(field('pax')) || 0,
    infant: Number(field('infant')) || 0,
    fuel: Number(field('blockFuelKg')) || 0,
    fuelType: 'foreign'
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

function getCaptainName(crews = state.crews) {
  const captain = crews.find(crew => String(crew.crewTypeCode).toUpperCase() === 'CP');
  return captain ? `${captain.name || ''} ${captain.surname || ''}`.trim() : '';
}

function summaryDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || '—');
}

function summaryTime(value) {
  const match = String(value || '').match(/^(\d{1,2})[:.](\d{2})/);
  return match ? `${match[1].padStart(2, '0')}.${match[2]}` : String(value || '—');
}

function renderLiveSummary() {
  const target = document.getElementById('otobeyanLiveSummary');
  const context = state.lastContext;
  if (!target || !context?.row) {
    if (target) target.innerHTML = '';
    return;
  }

  const row = context.row;
  const isArrival = String(row.type || '').toLocaleUpperCase('tr-TR').includes('GELİŞ');
  const scheduleLabel = isArrival ? 'STA' : 'STD';
  const captain = getCaptainName() || 'GİRİLMEDİ';
  const declaration = state.declaration || { pax: 0, infant: 0, fuel: 0, fuelType: 'foreign' };
  const fuelType = declaration.fuelType === 'national' ? 'MİLLİ' : 'YABANCI';
  const route = `${row.departureAirport || '—'} - ${row.arrivalAirport || '—'}`;

  target.innerHTML = `
    <div class="otobeyan-summary-main">${escapeHtml(context.flightNumber)} / ${escapeHtml(route)} / ${escapeHtml(row.reg || '—')} / ${escapeHtml(summaryDate(context.flightDate))} / ${scheduleLabel}: ${escapeHtml(summaryTime(row.time))} / ${state.crews.length} KİŞİ EKİP</div>
    <div class="otobeyan-summary-extra">
      <span class="otobeyan-summary-chip">KAPTAN: ${escapeHtml(captain)}</span>
      <span class="otobeyan-summary-chip">PAX: ${escapeHtml(declaration.pax)}</span>
      <span class="otobeyan-summary-chip">INF: ${escapeHtml(declaration.infant)}</span>
      <span class="otobeyan-summary-chip">YAKIT: ${escapeHtml(declaration.fuel)} KG · ${fuelType}</span>
    </div>`;
}

function clearActionPanel() {
  state.actionPanel?.remove?.();
  state.actionPanel = null;
}

function updateQuickDeclarationReadiness() {
  const panel = state.actionPanel;
  if (!panel) return;
  const fuelReady = Number(state.declaration?.fuel || 0) > 0;
  const crewReady = state.crews.length > 0;
  const button = panel.querySelector('[data-open-declare]');
  if (button) button.disabled = !(fuelReady && crewReady);
  const hint = panel.querySelector('.otobeyan-source-arrow');
  if (hint) {
    hint.textContent = fuelReady && crewReady
      ? 'Aç + Beyan Et bu ekrandaki tek onaydır; işlem sağ alttaki bildirimden takip edilir.'
      : !fuelReady
        ? 'Aç + Beyan Et için yakıt en az 1 KG olmalı.'
        : 'Aç + Beyan Et için önce ekip PDF bulunmalı veya yüklenmeli.';
  }
}

function updateDeclarationValue(key, value, control = null) {
  if (!state.declaration) return;
  if (key === 'fuelType') {
    state.declaration[key] = value;
  } else if (key === 'fuel') {
    const fuel = Number.parseInt(value, 10);
    if (!Number.isFinite(fuel) || fuel <= 0) {
      state.declaration.fuel = 0;
      if (control) control.value = '';
    } else {
      state.declaration.fuel = fuel;
    }
  } else {
    state.declaration[key] = Math.max(0, Number.parseInt(value, 10) || 0);
  }
  updateQuickDeclarationReadiness();
  renderLiveSummary();
}

function renderActionPanel() {
  clearActionPanel();
  const context = state.lastContext;
  if (!context?.row) return;

  const declaration = state.declaration || { pax: 0, infant: 0, fuel: 0, fuelType: 'foreign' };
  const fuelReady = Number(state.declaration?.fuel || 0) > 0;
  const combinedReady = state.crews.length > 0 && fuelReady;
  const message = addMessage('', 'bot');
  message.classList.add('otobeyan-wide');
  message.innerHTML = `<strong>HGBS işlemine hazırla</strong>
    <div class="otobeyan-review">
      <label>PAX<input type="number" min="0" data-declaration="pax" value="${escapeHtml(declaration.pax)}"></label>
      <label>INFANT<input type="number" min="0" data-declaration="infant" value="${escapeHtml(declaration.infant)}"></label>
      <label>OffBlock Fuel KG<input type="number" min="1" step="1" data-declaration="fuel" value="${Number(declaration.fuel) > 0 ? escapeHtml(declaration.fuel) : ''}" placeholder="En az 1"></label>
      <label>HGBS Yakıt Alanı<select data-declaration="fuelType"><option value="foreign"${declaration.fuelType === 'foreign' ? ' selected' : ''}>Yabancı</option><option value="national"${declaration.fuelType === 'national' ? ' selected' : ''}>Milli</option></select></label>
      <div class="otobeyan-inline-actions">
        <button class="otobeyan-btn primary" type="button" data-open-only>Sadece Uçuşu Aç</button>
        <button class="otobeyan-btn success" type="button" data-open-declare ${combinedReady ? '' : 'disabled'}>Aç + Beyan Et</button>
      </div>
    </div>
    ${combinedReady
      ? '<div class="otobeyan-source-arrow">Aç + Beyan Et bu ekrandaki tek onaydır; işlem sağ alttaki bildirimden takip edilir.</div>'
      : !fuelReady
        ? '<div class="otobeyan-source-arrow">Aç + Beyan Et için yakıt en az 1 KG olmalı.</div>'
        : '<div class="otobeyan-source-arrow">Aç + Beyan Et için önce ekip PDF bulunmalı veya yüklenmeli.</div>'}`;
  message.querySelectorAll('[data-declaration]').forEach(control => {
    control.addEventListener('input', () => updateDeclarationValue(control.dataset.declaration, control.value, control));
  });
  message.querySelector('[data-open-only]').addEventListener('click', () => openFlightConfirmation(false));
  message.querySelector('[data-open-declare]').addEventListener('click', event => {
    void openFlightConfirmation(true, event.currentTarget);
  });
  state.actionPanel = message;
  renderLiveSummary();
}

function validateCrewDraft() {
  if (!state.crews.length) return 'Ekip listesi boş.';
  for (let index = 0; index < state.crews.length; index += 1) {
    const crew = state.crews[index];
    if (!HGBS_CREW_TYPES[crew.crewTypeCode]) return `${index + 1}. ekip için geçerli HGBS crew type seç.`;
    if (!String(crew.name || '').trim()) return `${index + 1}. ekipte ad boş.`;
    if (!String(crew.surname || '').trim()) return `${index + 1}. ekipte soyad boş.`;
  }
  if (!getCaptainName()) return 'Uçuş kaptanı için bir ekip satırında HGBS görevini CP seç.';
  return '';
}

function prefillFlightModal() {
  const crewInput = document.getElementById('modalCrewInput');
  const captainInput = document.getElementById('modalCaptainName');
  if (crewInput) crewInput.value = state.crews.length;
  if (captainInput) captainInput.value = getCaptainName();
  getMainFunction('updateModalPreview')?.();
}

async function openFlightConfirmation(withDeclaration, triggerButton = null) {
  const context = state.lastContext;
  const openModal = getMainFunction('openModal');
  const prepareFlightModal = getMainFunction('prepareFlightModal');
  if (!context?.row || context.rowIndex < 0 || !openModal || (withDeclaration && !prepareFlightModal)) {
    addMessage('Excel uçuş satırı veya HGBS uçuş açma ekranı bulunamadı.', 'error');
    return;
  }
  if (withDeclaration) {
    const crewError = validateCrewDraft();
    if (crewError) {
      addMessage(crewError, 'error');
      return;
    }
    if (!(Number(state.declaration?.fuel) > 0)) {
      addMessage('Yakıt 0 olamaz. Aç + Beyan Et için en az 1 KG yakıt gir.', 'error');
      return;
    }
  }

  if (!withDeclaration) {
    openModal(context.rowIndex, false);
    prefillFlightModal();
    return;
  }

  const key = jobKey(context);
  const runningJob = state.jobs.get(key);
  if (runningJob) {
    closePanel();
    revealRunningJob(runningJob);
    return;
  }

  prepareFlightModal(context.rowIndex, false);
  prefillFlightModal();
  const getModalEtaValues = getMainFunction('getModalEtaValues');
  const validateModalEtaValues = getMainFunction('validateModalEtaValues');
  const eta = getModalEtaValues?.();
  const etaValidation = eta && validateModalEtaValues?.(context.row, eta);
  if (!eta || (etaValidation && !etaValidation.isValid)) {
    addMessage(etaValidation?.message || 'Uçuş saat bilgileri hazırlanamadı.', 'error');
    return;
  }

  const job = {
    key,
    context: { ...context },
    crews: state.crews.map(cloneCrew),
    declaration: { ...(state.declaration || {}) },
    eta: { ...eta },
    notification: null
  };
  state.jobs.set(key, job);
  createJobNotification(job);
  updateJobNotification(
    job,
    'flight',
    'Uçuş hazırlanıyor…'
  );
  closePanel();
  try {
    await confirmOpenAndDeclare(job, triggerButton);
  } catch (error) {
    finishJob(job, 'error', `İşlem durdu: ${error?.message || 'Beklenmeyen hata.'}`);
  }
}

async function buildCrewApiPayload(baseId, crews = state.crews) {
  const normalizeType = getMainFunction('normalizeCrewExcelType');
  const normalizeDate = getMainFunction('crewDateForApi');
  const normalizeCode = getMainFunction('normalizeCode');
  const normalizeIdentity = getMainFunction('normalizeIdentityNumber');
  const normalizeName = getMainFunction('normalizePersonName');
  const normalizeNationality = getMainFunction('normalizeNationality');
  return {
    baseId,
    crews: crews.map(crew => ({
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

async function confirmOpenAndDeclare(job, triggerButton = null) {
  const context = job.context;
  const row = context?.row;
  const apiCall = getMainFunction('apiCall');
  const buildPayload = getMainFunction('buildPayload');
  const getRowApiId = getMainFunction('getRowApiId');
  const buildHvbPayload = getMainFunction('buildHvbPayload');
  const hvbDefaultState = getMainFunction('hvbDefaultState');
  const hvbPopulateStateFromApi = getMainFunction('hvbPopulateStateFromApi');
  const refreshRows = getMainFunction('refreshRowsAfterHGBSAction');
  const updateRow = getMainFunction('updateRow');
  const markAsSent = getMainFunction('markAsSent');
  const button = triggerButton || document.getElementById('modalConfirmBtn');
  const originalButtonText = button?.textContent || 'Aç + Beyan Et';

  if (!row || !apiCall || !job.eta || !buildPayload || !buildHvbPayload || !hvbDefaultState) {
    finishJob(job, 'error', 'HGBS işlem bileşenleri hazır değil. Sayfayı yenileyip tekrar dene.');
    return false;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Uçuş hazırlanıyor…';
  }

  try {
    const declaredFuel = Number(job.declaration?.fuel || 0);
    if (!(declaredFuel > 0)) {
      throw new Error('Yakıt 0 olamaz. Beyan için en az 1 KG yakıt gerekli.');
    }

    const crewCount = job.crews.length;
    const captainName = getCaptainName(job.crews);
    const eta = job.eta;
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

    updateJobNotification(job, 'crew', baseId ? 'Uçuş hazır. Ekip gönderiliyor…' : 'Ekip gönderiliyor…');
    if (button) button.textContent = 'Ekip gönderiliyor…';
    await apiCall('PUT', '/api/Flight/SetCrews?api-version=1.0', await buildCrewApiPayload(baseId, job.crews));

    updateJobNotification(job, 'declaration', 'Ekip kaydedildi. Yolcu ve yakıt gönderiliyor…');
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
    const declaration = job.declaration || {};
    const pax = Math.max(0, Number(declaration.pax) || 0);
    const infant = Math.max(0, Number(declaration.infant) || 0);
    const fuel = Number(declaration.fuel) || 0;
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

    updateJobNotification(job, 'customs', 'Bilgiler kaydedildi. Gümrüğe sunuluyor…');
    if (button) button.textContent = 'Gümrüğe sunuluyor…';
    await apiCall('POST', '/api/AirBase/StatusActionAgency?api-version=1.0', {
      id: baseId,
      action: 'GUMRUGESUNULDU',
      actionComment: '-'
    });

    finishJob(job, 'success', `Tamamlandı: ${crewCount} ekip, yolcu ve yakıt kaydedilip gümrüğe sunuldu.`);
    try {
      await refreshRows?.();
    } catch (_) {
      // Beyan tamamlandı; yalnızca tablo yenilemesi başarısızsa sonucu hataya çevirmeyiz.
    }
    if (button) {
      button.disabled = true;
      button.textContent = '✓ Beyan Edildi';
    }
    return true;
  } catch (error) {
    finishJob(job, 'error', `İşlem durdu: ${error.message}`);
    if (button) {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
    return false;
  }
}

function lockQuickBeyanUi() {
  document.querySelectorAll('[data-otobeyan-quick]').forEach(element => element.remove());
  closePanel();
}

globalThis.OtoBeyanUi = Object.freeze({
  refresh: () => {
    if (!globalThis.OtoBeyanApi?.isUnlocked?.()) return;
    installUi();
    addQuickButtons();
  },
  lock: lockQuickBeyanUi
});

if (globalThis.OtoBeyanApi?.isUnlocked?.()) installUi();
