const QUICKBEYAN_VERSION = '1.6.0e';

const state = {
  busy: false,
  lastContext: null,
  crews: [],
  igoResult: null,
  actionPanel: null,
  crewPanel: null,
  igoPanel: null,
  searchPanel: null,
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

function installStyles() {
  if (document.getElementById('otobeyanStyles')) return;
  const style = document.createElement('style');
  style.id = 'otobeyanStyles';
  style.textContent = `
    #otobeyanOverlay{position:fixed;inset:0;z-index:2300;display:none;place-items:center;padding:8px;background:#0f172a99;backdrop-filter:blur(2px)}
    #otobeyanOverlay.open{display:grid}
    #otobeyanPanel{width:min(1280px,calc(100vw - 16px));height:min(920px,calc(100dvh - 16px));display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#fff;border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 22px 70px #0f172a66;overflow:hidden}
    .otobeyan-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#172554;color:#fff}.otobeyan-title{font-size:17px;font-weight:800}.otobeyan-sub{font-size:10px;color:#c7d2fe;margin-top:1px}.otobeyan-actions{display:flex;gap:6px}.otobeyan-head button{border:1px solid #ffffff40;background:#ffffff16;color:#fff;border-radius:7px;padding:5px 8px;cursor:pointer}
    #otobeyanMessages{min-height:0;padding:7px;overflow:auto;overscroll-behavior:contain;background:#f8fafc;display:flex;flex-direction:column;gap:4px}.otobeyan-message{box-sizing:border-box;flex:0 0 auto;width:100%;padding:6px 8px;border-radius:8px;font-size:11px;line-height:1.25;white-space:pre-wrap;background:#fff;border:1px solid #e2e8f0;color:#334155}.otobeyan-message.error{border-color:#fecaca;background:#fef2f2;color:#991b1b}.otobeyan-message.success{border-color:#bbf7d0;background:#f0fdf4;color:#166534}.otobeyan-message strong{font-weight:800}
    .otobeyan-quick-btn{margin-top:5px;border:1px solid #2563eb;border-radius:7px;background:#eff6ff;color:#1d4ed8;padding:6px 9px;font:800 11px/1.1 inherit;cursor:pointer;white-space:nowrap}.otobeyan-quick-btn:hover{background:#dbeafe}.otobeyan-quick-btn:disabled{opacity:.55;cursor:wait}.otobeyan-card{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:4px}.otobeyan-card>div{display:grid;gap:1px;padding:4px 7px;border:1px solid #dbe3ee;border-radius:6px;background:#fff}.otobeyan-card span:first-child{color:#64748b;font-size:8px;text-transform:uppercase}.otobeyan-pill{display:inline-block;margin-top:4px;padding:2px 6px;border-radius:999px;background:#dcfce7;color:#166534;font-size:9px;font-weight:800}
    .otobeyan-wide{max-width:100%}.otobeyan-crew-list{display:flex;flex-direction:column;gap:2px;margin-top:4px;overflow-x:auto}.otobeyan-crew-row,.otobeyan-crew-columns{display:grid;grid-template-columns:26px minmax(118px,1.1fr) minmax(100px,1.1fr) minmax(110px,1.1fr) 58px 112px 70px minmax(125px,1.25fr) 28px;gap:4px;align-items:center;min-width:0}.otobeyan-crew-columns{padding:0 4px;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase}.otobeyan-crew-row{border:1px solid #dbe3ee;border-radius:6px;padding:3px;background:#f8fafc}.otobeyan-crew-no{text-align:center;font-weight:800;color:#475569}.otobeyan-crew-field{min-width:0}.otobeyan-crew-field span{display:none}.otobeyan-crew-field input,.otobeyan-crew-field select,.otobeyan-review input,.otobeyan-review select{min-width:0;width:100%;height:27px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:5px;background:#fff;padding:3px 5px;font:11px inherit;color:#0f172a}.otobeyan-remove-crew{border:0;background:#fee2e2;color:#991b1b;border-radius:5px;width:26px;height:25px;padding:0;cursor:pointer}.otobeyan-source-arrow{font-size:9px;color:#64748b;margin-top:3px}.otobeyan-inline-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px}.otobeyan-btn{border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#334155;padding:6px 9px;font:700 11px/1.2 inherit;cursor:pointer}.otobeyan-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.otobeyan-btn.success{background:#15803d;border-color:#15803d;color:#fff}.otobeyan-btn:disabled{opacity:.55;cursor:not-allowed}.otobeyan-review{display:grid;grid-template-columns:repeat(4,minmax(115px,1fr)) auto;gap:6px;margin-top:4px;align-items:end}.otobeyan-review label{display:flex;flex-direction:column;gap:2px;font-size:8px;text-transform:uppercase;color:#64748b;font-weight:800}.otobeyan-review .otobeyan-inline-actions{margin:0;flex-wrap:nowrap}
    #otobeyanLiveSummary{padding:7px 12px;border-top:1px solid #cbd5e1;background:#eef2ff;color:#172554}.otobeyan-summary-main{font-size:12px;font-weight:900;letter-spacing:.01em}.otobeyan-summary-extra{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}.otobeyan-summary-chip{padding:2px 6px;border:1px solid #c7d2fe;border-radius:999px;background:#fff;font-size:9px;font-weight:800;color:#3730a3}
    #otobeyanJobStack{position:fixed;right:18px;bottom:18px;z-index:2600;width:min(370px,calc(100vw - 24px));display:flex;flex-direction:column-reverse;gap:10px;pointer-events:none}.otobeyan-job{pointer-events:auto;overflow:hidden;border:1px solid #ffffff90;border-radius:16px;background:#fffffff2;color:#0f172a;box-shadow:0 18px 50px #0f172a35;backdrop-filter:blur(18px) saturate(1.25);animation:otobeyanJobIn .28s cubic-bezier(.2,.8,.2,1)}.otobeyan-job-head{display:flex;align-items:center;gap:10px;padding:11px 12px 7px}.otobeyan-job-icon{display:grid;place-items:center;width:34px;height:34px;flex:0 0 auto;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-size:17px}.otobeyan-job-title{min-width:0;flex:1}.otobeyan-job-title strong{display:block;font-size:13px}.otobeyan-job-title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;color:#64748b;font-size:10px}.otobeyan-job-close{display:none;border:0;background:transparent;color:#64748b;font:18px/1 inherit;cursor:pointer}.otobeyan-job-status{padding:0 12px 9px;font-size:11px;font-weight:700}.otobeyan-job-track{height:3px;background:#e2e8f0}.otobeyan-job-bar{height:100%;width:8%;background:linear-gradient(90deg,#2563eb,#60a5fa);transition:width .3s ease}.otobeyan-job-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;padding:8px 10px 10px}.otobeyan-job-step{text-align:center;color:#94a3b8;font-size:8px;font-weight:800}.otobeyan-job-step::before{content:'';display:block;width:7px;height:7px;margin:0 auto 3px;border-radius:50%;background:#cbd5e1}.otobeyan-job-step.done,.otobeyan-job-step.current{color:#1d4ed8}.otobeyan-job-step.done::before{background:#22c55e}.otobeyan-job-step.current::before{background:#2563eb;box-shadow:0 0 0 4px #dbeafe}.otobeyan-job.success .otobeyan-job-icon{background:#dcfce7;color:#15803d}.otobeyan-job.success .otobeyan-job-bar{background:#22c55e}.otobeyan-job.success .otobeyan-job-status{color:#166534}.otobeyan-job.error .otobeyan-job-icon{background:#fee2e2;color:#b91c1c}.otobeyan-job.error .otobeyan-job-bar{background:#ef4444}.otobeyan-job.error .otobeyan-job-status{color:#991b1b}.otobeyan-job.success .otobeyan-job-close,.otobeyan-job.error .otobeyan-job-close{display:block}@keyframes otobeyanJobIn{from{opacity:0;transform:translateX(28px) scale(.97)}to{opacity:1;transform:none}}
    @media(max-width:1000px){.otobeyan-crew-row,.otobeyan-crew-columns{grid-template-columns:26px 118px 100px 110px 58px 112px 70px 125px 28px;min-width:780px}.otobeyan-review{grid-template-columns:repeat(2,minmax(130px,1fr))}.otobeyan-review .otobeyan-inline-actions{grid-column:1/-1}}
    @media(max-width:720px){#otobeyanOverlay{padding:0}#otobeyanPanel{width:100%;height:100dvh;border-radius:0}.otobeyan-head{padding:8px 10px}.otobeyan-card{grid-template-columns:repeat(2,minmax(0,1fr))}#otobeyanLiveSummary{padding:6px 8px}#otobeyanJobStack{right:12px;bottom:12px}}
    @media(max-height:760px) and (min-width:721px){#otobeyanPanel{height:calc(100dvh - 8px)}.otobeyan-head{padding:7px 12px}#otobeyanMessages{padding:5px}.otobeyan-message{padding:4px 6px}.otobeyan-crew-field input,.otobeyan-crew-field select,.otobeyan-review input,.otobeyan-review select{height:25px}.otobeyan-crew-row{padding:2px}#otobeyanLiveSummary{padding:5px 10px}}
  `;
  document.head.appendChild(style);
}

function installUi() {
  if (document.getElementById('otobeyanPanel')) return;
  installStyles();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="otobeyanOverlay" aria-hidden="true">
    <section id="otobeyanPanel" role="dialog" aria-modal="true" aria-label="Hızlı Beyan">
      <header class="otobeyan-head">
        <div><div class="otobeyan-title" id="otobeyanTitle">Hızlı Beyan</div><div class="otobeyan-sub" id="otobeyanStatus">Bağlantı kontrol ediliyor…</div></div>
        <div class="otobeyan-actions"><button id="otobeyanIgoLogin" type="button">Oturum</button><button id="otobeyanClose" type="button">✕</button></div>
      </header>
      <div id="otobeyanMessages"></div>
      <footer id="otobeyanLiveSummary" aria-live="polite"></footer>
    </section></div>
    <aside id="otobeyanJobStack" aria-live="polite" aria-label="Beyan işlemleri"></aside>`);

  document.getElementById('otobeyanClose').addEventListener('click', closePanel);
  document.getElementById('otobeyanOverlay').addEventListener('click', event => {
    if (event.target.id === 'otobeyanOverlay' && !state.busy) closePanel();
  });
  document.getElementById('otobeyanIgoLogin').addEventListener('click', openIgoLogin);
  checkIgoConnectivity();
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
  const flightNumber = normalizeFlightNumber(row?.flightNo);
  const isSunExpress = flightNumber.startsWith('XQ');
  const hasOpenAction = Boolean(actionCell?.querySelector('button[onclick*="openModal("]'));
  return isSunExpress && hasOpenAction;
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
    flightNumber: normalizeFlightNumber(row.flightNo),
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
  state.igoResult = null;
  state.declaration = { pax: 0, infant: 0, fuel: 0, fuelType: 'foreign' };
  clearActionPanel();
  state.crewPanel = null;
  state.igoPanel = null;
  state.searchPanel = null;
  const messages = document.getElementById('otobeyanMessages');
  if (messages) messages.innerHTML = '';
  const title = document.getElementById('otobeyanTitle');
  if (title) title.textContent = `Hızlı Beyan · ${context.flightNumber}`;
  openPanel();
  renderLiveSummary();
  if (triggerButton) triggerButton.disabled = true;

  try {
    setSearchStatus('Aranıyor…');
    renderCrewEditor([], 'Ekip listesi');
    renderActionPanel();
    const mailPromise = searchCrewMail(context);
    if (context.isDeparture) {
      await runIgoQuery(context);
    } else {
      addMessage('Geliş seferi: yolcu ve yakıt bilgilerini elle gir.', 'bot');
    }
    await mailPromise;
    renderActionPanel();
    setSearchStatus('Hazır.', 'success');
    requestAnimationFrame(() => {
      if (messages) messages.scrollTop = 0;
    });
  } finally {
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

async function checkIgoConnectivity() {
  const status = document.getElementById('otobeyanStatus');
  try {
    const health = await globalThis.OtoBeyanApi?.health?.();
    if (health?.ok && health?.ready) {
      status.textContent = health.sessionReady
        ? `Bağlantı hazır · v${QUICKBEYAN_VERSION}`
        : `İlk sorguda oturum onayı gerekebilir · v${QUICKBEYAN_VERSION}`;
      return;
    }
  } catch (_) {}
  status.textContent = 'Bağlantı kurulamadı';
}

async function openIgoLogin() {
  addMessage('Oturum gerekiyorsa ilk sorguda güvenli onay bağlantısı açılır. Sonraki sorgularda kayıtlı oturum kullanılır.', 'bot');
}

async function searchCrewMail(context) {
  if (globalThis.OtoBeyanApi?.flightPdf && typeof globalThis.parseCrewPdfFileData === 'function') {
    try {
      const pdf = await globalThis.OtoBeyanApi.flightPdf(context.flightNumber);
      const file = new File([pdf.blob], pdf.fileName || `${context.flightNumber}.pdf`, {
        type: pdf.blob.type || 'application/pdf',
        lastModified: Date.now()
      });
      const parsed = await globalThis.parseCrewPdfFileData(file, {
        flightNo: context.flightNumber,
        tailNumber: context.tailNumber || '',
        departurePortCode: context.departurePortCode || '',
        arrivalPortCode: context.arrivalPortCode || ''
      });
      if (!Array.isArray(parsed.crews) || !parsed.crews.length) {
        throw new Error('GenDec PDF bulundu fakat ekip listesi ayrıştırılamadı.');
      }
      renderCrewEditor(parsed.crews, `Mail GenDec · ${pdf.fileName}`);
      return parsed.crews;
    } catch (error) {
      addMessage('GenDec bulunamadı veya okunamadı. Ekibi aşağıdaki tablodan elle girebilirsin.', 'error');
      if (!state.crews.length) {
        renderCrewEditor([{ sourceTypeCode: 'MANUEL', crewTypeCode: 'CA' }], 'Manuel ekip');
      }
      return null;
    }
  }

  addMessage('GenDec servisi kullanılamıyor. Ekibi aşağıdaki tablodan elle girebilirsin.', 'error');
  if (!state.crews.length) {
    renderCrewEditor([{ sourceTypeCode: 'MANUEL', crewTypeCode: 'CA' }], 'Manuel ekip');
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

async function runIgoQuery(context) {
  setBusy(true);
  if (globalThis.OtoBeyanApi?.queryIgo) {
    let liveViewWindow = null;
    try {
      const result = await globalThis.OtoBeyanApi.queryIgo({
        flightNumber: context.flightNumber,
        flightDate: context.flightDate
      }, event => {
        if (event.type === 'captcha' && event.liveViewUrl) {
          const message = addMessage('Oturum onayı gerekiyor.', 'bot');
          const link = document.createElement('a');
          link.href = event.liveViewUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'CAPTCHA ekranını aç';
          link.className = 'otobeyan-btn primary';
          link.addEventListener('click', clickEvent => {
            clickEvent.preventDefault();
            liveViewWindow = window.open(event.liveViewUrl, 'otobeyanIgoLogin');
          });
          const actions = document.createElement('div');
          actions.className = 'otobeyan-inline-actions';
          actions.appendChild(link);
          message.appendChild(actions);
        }
      });
      renderIgoResult(result);
      try { liveViewWindow?.close?.(); } catch (_) {}
      window.focus();
    } catch (error) {
      const detail = String(error?.message || '');
      const temporaryServiceProblem = /servisi (şu an yoğun|günlük kullanım sınırına ulaştı)/i.test(detail);
      addMessage(
        temporaryServiceProblem
          ? `${detail} Yolcu ve yakıtı bu sırada elle girebilirsin.`
          : 'Load Sheet bulunamadı veya okunamadı. Yolcu ve yakıtı elle girebilirsin.',
        'error'
      );
    } finally {
      setBusy(false);
      checkIgoConnectivity();
    }
    return;
  }
  addMessage('Load Sheet alınamadı. Yolcu ve yakıtı elle girebilirsin.', 'error');
  setBusy(false);
}

function renderIgoResult(result) {
  state.igoResult = result;
  const flight = result.flight;
  const sheet = result.loadSheet;
  const field = name => sheet.fields?.[name]?.value ?? sheet[name] ?? '—';
  const finalized = sheet.finalized;
  state.igoPanel?.remove?.();
  const message = `
    <strong>${escapeHtml(flight.flightNumber)} · ${escapeHtml(flight.flightDate)}</strong>
    <div class="otobeyan-card">
      <div><span>Rota</span><strong>${escapeHtml(flight.departurePortCode)}–${escapeHtml(flight.arrivalPortCode)}</strong></div>
      <div><span>Kuyruk</span><strong>${escapeHtml(flight.tailNumber)}</strong></div>
      <div><span>PAX + INF</span><strong>${escapeHtml(field('pax'))} + ${escapeHtml(field('infant'))}</strong></div>
      <div><span>OffBlock Fuel</span><strong>${escapeHtml(field('offBlockFuelKg'))} kg</strong></div>
      <div><span>Load Sheet</span><strong>EDNO ${escapeHtml(field('edno'))}</strong></div>
    </div>
    <span class="otobeyan-pill">${finalized ? '✓ Digitally Signed' : '⚠ Uçuş kapanmadı'}</span>`;
  state.igoPanel = addMessage(message, finalized ? 'success' : 'error', true);
  state.declaration = {
    pax: Number(field('pax')) || 0,
    infant: Number(field('infant')) || 0,
    fuel: Number(field('offBlockFuelKg')) || 0,
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

function updateDeclarationValue(key, value) {
  if (!state.declaration) return;
  state.declaration[key] = key === 'fuelType' ? value : Math.max(0, Number.parseInt(value, 10) || 0);
  renderLiveSummary();
}

function renderActionPanel() {
  clearActionPanel();
  const context = state.lastContext;
  if (!context?.row) return;

  const declaration = state.declaration || { pax: 0, infant: 0, fuel: 0, fuelType: 'foreign' };
  const combinedReady = state.crews.length > 0;
  const message = addMessage('', 'bot');
  message.classList.add('otobeyan-wide');
  message.innerHTML = `<strong>HGBS işlemine hazırla</strong>
    <div class="otobeyan-review">
      <label>PAX<input type="number" min="0" data-declaration="pax" value="${escapeHtml(declaration.pax)}"></label>
      <label>INFANT<input type="number" min="0" data-declaration="infant" value="${escapeHtml(declaration.infant)}"></label>
      <label>OffBlock Fuel KG<input type="number" min="0" data-declaration="fuel" value="${escapeHtml(declaration.fuel)}"></label>
      <label>HGBS Yakıt Alanı<select data-declaration="fuelType"><option value="foreign"${declaration.fuelType === 'foreign' ? ' selected' : ''}>Yabancı</option><option value="national"${declaration.fuelType === 'national' ? ' selected' : ''}>Milli</option></select></label>
      <div class="otobeyan-inline-actions">
        <button class="otobeyan-btn primary" type="button" data-open-only>Sadece Uçuşu Aç</button>
        <button class="otobeyan-btn success" type="button" data-open-declare ${combinedReady ? '' : 'disabled'}>Aç + Beyan Et</button>
      </div>
    </div>
    ${combinedReady ? '<div class="otobeyan-source-arrow">Aç + Beyan Et bu ekrandaki tek onaydır; işlem sağ alttaki bildirimden takip edilir.</div>' : '<div class="otobeyan-source-arrow">Aç + Beyan Et için önce ekip PDF bulunmalı veya yüklenmeli.</div>'}`;
  message.querySelectorAll('[data-declaration]').forEach(control => {
    control.addEventListener('input', () => updateDeclarationValue(control.dataset.declaration, control.value));
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
    state.igoResult && !state.igoResult.loadSheet?.finalized
      ? 'Uçuş kapanmadı; onaylanan bilgilerle işlem başlatıldı…'
      : 'Uçuş hazırlanıyor…'
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
