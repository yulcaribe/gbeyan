/*
 * Beyan <-> TGS Exchange mail integration
 * Version: v1.5.0beta
 * Credentials live only in this page's JavaScript memory and are cleared on logout/reload.
 */
(function initBeyanMailIntegration() {
  'use strict';

  const MAIL_API = 'https://mailer.mehmetisaacar47.workers.dev';
  const CAPTAIN_PREF_KEY = 'beyan_captain_from_gendec';
  const FLIGHT_CACHE_TTL_MS = 5 * 60 * 1000;
  const session = { username: '', password: '', connected: false };
  const flightDetailCache = new Map();
  let afterConnect = null;

  function getCaptainDefault() {
    try { return localStorage.getItem(CAPTAIN_PREF_KEY) === '1'; } catch (_) { return false; }
  }

  function setCaptainDefault(enabled) {
    try { localStorage.setItem(CAPTAIN_PREF_KEY, enabled ? '1' : '0'); } catch (_) {}
  }

  function escapeMailHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function suggestedUsername() {
    try {
      const value = String(STATE?.user?.userName || '').trim();
      return /^[a-zA-Z0-9._-]+$/.test(value) ? value.replace(/^tgs\\/i, '') : '';
    } catch (_) {
      return '';
    }
  }

  function mailHeaders(username = session.username, password = session.password) {
    return {
      'X-Exchange-User': String(username || '').trim(),
      'X-Exchange-Password': String(password || '')
    };
  }

  async function readError(response) {
    const data = await response.json().catch(() => ({}));
    return data.error || `Mail servisi HTTP ${response.status}`;
  }

  function isMissingEndpoint(response, message) {
    return response.status === 404 && /^not found\.?$/i.test(String(message || '').trim());
  }

  async function verifyMailConnection(headers) {
    let response = await fetch(`${MAIL_API}/api/login`, {
      method: 'GET',
      cache: 'no-store',
      headers
    });
    if (response.ok) return;

    const message = await readError(response);
    if (!isMissingEndpoint(response, message)) throw new Error(message);

    // Eski Worker surumlerinde /api/login yoktu; mail listesi istegi ayni dogrulamayi yapar.
    response = await fetch(`${MAIL_API}/api/messages`, {
      method: 'GET',
      cache: 'no-store',
      headers
    });
    if (!response.ok) throw new Error(await readError(response));
  }

  function ensureMailStyles() {
    if (document.getElementById('beyanMailStyles')) return;
    const style = document.createElement('style');
    style.id = 'beyanMailStyles';
    style.textContent = `
      #mailSessionBtn {
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #fff;
        color: #334155;
        padding: 7px 11px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      #mailSessionBtn.mail-connected {
        border-color: #86efac;
        background: #f0fdf4;
        color: #166534;
      }
      .mail-captain-default {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 9px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #fff;
        color: #334155;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .mail-captain-default input,
      .crew-captain-option input { accent-color: #166534; }
      #mailLoginOverlay { z-index: 2200; }
      .mail-login-card { max-width: 440px; width: 94%; }
      .mail-login-grid { display: grid; gap: 12px; }
      .mail-login-field { display: grid; gap: 5px; }
      .mail-login-field label {
        color: #475569;
        font-size: 12px;
        font-weight: 700;
      }
      .mail-login-field input {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        padding: 10px 11px;
        font: inherit;
      }
      #mailLoginStatus { min-height: 18px; color: #64748b; font-size: 12px; }
      #mailLoginStatus.error { color: #b91c1c; }
      #mailLoginStatus.success { color: #166534; }
      #mailCrewFetchBtn { white-space: nowrap; }
      .crew-upload-row.mail-controls-active {
        grid-template-columns: minmax(210px, 1fr) auto auto auto;
      }
      .crew-captain-option {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 10px;
        border: 1px solid #bbf7d0;
        border-radius: 8px;
        background: #f0fdf4;
        color: #166534;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      @media (max-width: 680px) {
        #mailSessionBtn { padding: 6px 8px; }
        .mail-captain-default { width: 100%; justify-content: center; }
        .crew-upload-row.mail-controls-active { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMailUi() {
    ensureMailStyles();

    const topbar = document.querySelector('.topbar-right');
    if (topbar && !document.getElementById('mailSessionBtn')) {
      const button = document.createElement('button');
      button.id = 'mailSessionBtn';
      button.type = 'button';
      button.textContent = '✉ Mail Girişi';
      button.addEventListener('click', () => openMailLogin());
      const logoutButton = document.getElementById('logoutBtn');
      topbar.insertBefore(button, logoutButton || null);

      const captainLabel = document.createElement('label');
      captainLabel.id = 'mailCaptainDefaultLabel';
      captainLabel.className = 'mail-captain-default';
      captainLabel.title = 'Yeni açılan ekip beyanlarında kaptan güncellemesini varsayılan olarak açar.';
      captainLabel.innerHTML = '<input id="mailCaptainDefaultToggle" type="checkbox"> Kaptanı GenDec\'ten çek';
      topbar.insertBefore(captainLabel, logoutButton || null);
      const captainToggle = document.getElementById('mailCaptainDefaultToggle');
      captainToggle.checked = getCaptainDefault();
      captainToggle.addEventListener('change', () => setCaptainDefault(captainToggle.checked));
    }

    if (!document.getElementById('mailLoginOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'mailLoginOverlay';
      overlay.className = 'modal-overlay hidden';
      overlay.innerHTML = `
        <div class="modal-card mail-login-card">
          <div class="modal-header" style="background:#1e3a5f">
            <div>
              <h2>GenDec Mail Girişi</h2>
              <div class="modal-hdr-sub">TGS Exchange / SXS\\GenDec</div>
            </div>
            <button class="modal-close" type="button" id="mailLoginClose">✕</button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info" style="margin-bottom:14px">
              Kullanıcı adı ve parola kaydedilmez. Sayfa yenilenince mail oturumu kapanır.
            </div>
            <div class="mail-login-grid">
              <div class="mail-login-field">
                <label for="mailUsername">TGS kullanıcı adı</label>
                <input id="mailUsername" autocomplete="username" placeholder="Örnek: ma056814">
              </div>
              <div class="mail-login-field">
                <label for="mailPassword">Mail parolası</label>
                <input id="mailPassword" type="password" autocomplete="current-password" placeholder="Exchange mail parolası">
              </div>
              <div id="mailLoginStatus"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" id="mailDisconnectBtn" style="display:none">Bağlantıyı Kes</button>
            <button class="btn btn-secondary" type="button" id="mailLoginCancel">Vazgeç</button>
            <button class="btn btn-primary" type="button" id="mailLoginConnect">Mail Girişi Yap</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      document.getElementById('mailLoginClose').addEventListener('click', closeMailLogin);
      document.getElementById('mailLoginCancel').addEventListener('click', closeMailLogin);
      document.getElementById('mailLoginConnect').addEventListener('click', connectMailSession);
      document.getElementById('mailDisconnectBtn').addEventListener('click', disconnectMailSession);
      overlay.addEventListener('click', event => {
        if (event.target === overlay) closeMailLogin();
      });
      document.getElementById('mailPassword').addEventListener('keydown', event => {
        if (event.key === 'Enter') connectMailSession();
      });
    }
  }

  function updateMailUi() {
    const button = document.getElementById('mailSessionBtn');
    if (button) {
      button.classList.toggle('mail-connected', session.connected);
      button.textContent = session.connected ? `● Mail: ${session.username}` : '✉ Mail Girişi';
    }
    const disconnect = document.getElementById('mailDisconnectBtn');
    if (disconnect) disconnect.style.display = session.connected ? '' : 'none';
  }

  function setLoginStatus(message, type = '') {
    const element = document.getElementById('mailLoginStatus');
    if (!element) return;
    element.textContent = message;
    element.className = type;
  }

  function openMailLogin(callback) {
    ensureMailUi();
    afterConnect = typeof callback === 'function' ? callback : null;
    const usernameInput = document.getElementById('mailUsername');
    const passwordInput = document.getElementById('mailPassword');
    usernameInput.value = session.username || suggestedUsername();
    passwordInput.value = '';
    setLoginStatus(session.connected ? `Mail oturumu açık: ${session.username}` : '');
    updateMailUi();
    document.getElementById('mailLoginOverlay').classList.remove('hidden');
    setTimeout(() => (session.connected ? passwordInput : usernameInput).focus(), 0);
  }

  function closeMailLogin() {
    document.getElementById('mailLoginOverlay')?.classList.add('hidden');
    const passwordInput = document.getElementById('mailPassword');
    if (passwordInput) passwordInput.value = '';
    afterConnect = null;
  }

  function clearMailSession() {
    session.username = '';
    session.password = '';
    session.connected = false;
    updateMailUi();
  }

  function disconnectMailSession() {
    clearMailSession();
    setLoginStatus('Mail bağlantısı kapatıldı.');
    setTimeout(closeMailLogin, 350);
  }

  async function connectMailSession() {
    const username = document.getElementById('mailUsername').value.trim().replace(/^tgs\\/i, '');
    const password = document.getElementById('mailPassword').value;
    const button = document.getElementById('mailLoginConnect');
    if (!username || !password) {
      setLoginStatus('Kullanıcı adı ve mail parolası zorunlu.', 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'Bağlanıyor...';
    setLoginStatus('SXS\\GenDec klasörü kontrol ediliyor...');
    try {
      await verifyMailConnection(mailHeaders(username, password));

      session.username = username;
      session.password = password;
      session.connected = true;
      updateMailUi();
      setLoginStatus('Mail bağlantısı kuruldu.', 'success');

      const callback = afterConnect;
      afterConnect = null;
      setTimeout(() => {
        document.getElementById('mailLoginOverlay')?.classList.add('hidden');
        document.getElementById('mailPassword').value = '';
        if (callback) callback();
      }, 350);
    } catch (error) {
      clearMailSession();
      setLoginStatus(`Bağlantı kurulamadı: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Mail Girişi Yap';
    }
  }

  function parseFlightDateValue(value) {
    if (value === null || value === undefined || value === '') return '';
    const text = String(value).trim();
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = text.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    match = text.match(/\/Date\((\d+)/);
    if (match) return new Date(Number(match[1])).toISOString().slice(0, 10);
    if (/^\d{13}$/.test(text)) return new Date(Number(text)).toISOString().slice(0, 10);
    return '';
  }

  function getOpenFlightQuery() {
    const detail = currentFlightDetail();
    if (!detail) throw new Error('Açık uçuş detayı bulunamadı. Uçuş detayını yeniden aç.');

    const flightNo = String(detail.flightNumber || detail.flightNo || '').trim();
    const dateValues = [
      detail.flightDate,
      detail.departureDateEta,
      detail.departureDateEtaStr,
      detail.departureDate,
      detail.departureDateStr,
      detail.arrivalDateEta,
      detail.arrivalDateEtaStr,
      detail.arrivalDate,
      detail.arrivalDateStr
    ];
    const flightDate = dateValues.map(parseFlightDateValue).find(Boolean) || '';
    if (!flightNo) throw new Error('Açık uçuşta sefer numarası bulunamadı.');
    if (!flightDate) throw new Error('Açık uçuşta sorgulanabilir tarih bulunamadı.');
    return { flightNo, flightDate };
  }

  function currentFlightDetail() {
    try {
      if (typeof _currentFlightDetail !== 'undefined' && _currentFlightDetail) return _currentFlightDetail;
    } catch (_) {}
    return globalThis._currentFlightDetail || null;
  }

  function currentFlightBaseId() {
    try {
      if (typeof _currentFlightBaseId !== 'undefined' && _currentFlightBaseId) return _currentFlightBaseId;
    } catch (_) {}
    return globalThis._currentFlightBaseId || currentFlightDetail()?.baseId || '';
  }

  function cacheFlightDetail(detail, baseId = '') {
    if (!detail) return;
    const key = String(baseId || detail.baseId || detail.id || '').trim();
    if (!key) return;
    flightDetailCache.set(key, { detail: { ...detail }, cachedAt: Date.now() });
  }

  async function getFlightDetailCached(baseId) {
    const key = String(baseId || '').trim();
    if (!key) throw new Error('Uçuş baseId bulunamadı.');

    const cached = flightDetailCache.get(key);
    if (cached && Date.now() - cached.cachedAt < FLIGHT_CACHE_TTL_MS) return { ...cached.detail };

    const current = currentFlightDetail();
    if (current && String(current.baseId || current.id || key) === key) {
      cacheFlightDetail(current, key);
      return { ...current };
    }

    if (typeof apiCall !== 'function') throw new Error('HGBS API bağlantısı bulunamadı.');
    const response = await apiCall('GET', `/api/Flight/GetFlight?baseId=${encodeURIComponent(key)}&api-version=1.0`);
    const detail = response?.data || response;
    if (!detail) throw new Error('HGBS uçuş detayı boş döndü.');
    cacheFlightDetail(detail, key);
    return { ...detail };
  }

  function parsedCrewList() {
    try { return Array.isArray(_crewParsedList) ? _crewParsedList : []; } catch (_) { return []; }
  }

  function findCaptainInCrewList(crews) {
    const captain = (crews || []).find(crew => {
      const type = String(crew?.crewTypeCode || '').trim().toUpperCase();
      const source = String(crew?.sourceTypeCode || '').trim().toUpperCase();
      return type === 'CP' || ['CP', 'CPT', 'CAPT', 'PIC'].includes(source);
    });
    if (!captain) return '';
    return `${captain.name || ''} ${captain.surname || ''}`.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  function findParsedCaptain() {
    return findCaptainInCrewList(parsedCrewList());
  }

  function shouldUpdateCaptainForOpenFlight() {
    return !!document.getElementById('crewCaptainFromGendec')?.checked;
  }

  function buildCaptainOnlyPayload(detail, baseId, captainName) {
    if (!detail?.id || !(detail.baseId || baseId)) {
      throw new Error('Kaptan güncellemesi için uçuş id/baseId eksik.');
    }
    return {
      ...detail,
      baseId: detail.baseId || baseId,
      captainNameSurname: captainName
    };
  }

  async function updateFlightCaptainOnly(baseId, captainName) {
    const detail = await getFlightDetailCached(baseId);

    const currentCaptain = String(detail.captainNameSurname || '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (currentCaptain === captainName) {
      return { changed: false, detail, captainName };
    }

    // SetFlight tam uçuş nesnesi bekliyor. Mevcut detay aynen korunur; yalnız kaptan alanı değişir.
    const payload = buildCaptainOnlyPayload(detail, baseId, captainName);

    const response = await apiCall('PUT', '/api/Flight/SetFlight?api-version=1.0', payload);
    const responseDetail = response?.data && typeof response.data === 'object' ? response.data : null;
    const updated = responseDetail ? { ...payload, ...responseDetail } : payload;
    cacheFlightDetail(updated, payload.baseId);

    try { _currentFlightDetail = updated; } catch (_) { globalThis._currentFlightDetail = updated; }
    try { _currentFlightBaseId = payload.baseId; } catch (_) { globalThis._currentFlightBaseId = payload.baseId; }
    const detailContent = document.getElementById('flightDetailContent');
    if (detailContent && typeof buildFlightDetailHtml === 'function') {
      detailContent.innerHTML = buildFlightDetailHtml(updated);
    }
    return { changed: true, detail: updated, captainName };
  }

  function decodeHeader(value, fallback) {
    if (!value) return fallback;
    try { return decodeURIComponent(value); } catch (_) { return value; }
  }

  function mailSearchKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function mailDateKeys(isoDate) {
    const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return [];
    const [, year, month, day] = match;
    const monthName = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(month) - 1];
    return [`${year}${month}${day}`, `${day}${month}${year}`, `${day}${monthName}${year}`, `${day}${monthName}`];
  }

  function findMailPdf(messages, flightNo, flightDate) {
    const flightKey = mailSearchKey(flightNo);
    const dateKeys = mailDateKeys(flightDate);
    const candidates = [];

    for (const message of messages || []) {
      const subjectKey = mailSearchKey(message.subject);
      const bodyKey = mailSearchKey(message.body);
      const mailDateMatch = String(message.date || '').slice(0, 10) === flightDate;
      for (const attachment of message.attachments || []) {
        if (!String(attachment.name || '').toLowerCase().endsWith('.pdf')) continue;
        const nameKey = mailSearchKey(attachment.name);
        const flightMatch = nameKey.includes(flightKey) || subjectKey.includes(flightKey) || bodyKey.includes(flightKey);
        const nameDateMatch = dateKeys.some(key => nameKey.includes(key));
        const subjectDateMatch = dateKeys.some(key => subjectKey.includes(key));
        const bodyDateMatch = dateKeys.some(key => bodyKey.includes(key));
        if (!flightMatch || !(nameDateMatch || subjectDateMatch || bodyDateMatch || mailDateMatch)) continue;
        const score =
          (nameKey.includes(flightKey) ? 50 : 0) + (nameDateMatch ? 50 : 0) +
          (subjectKey.includes(flightKey) ? 30 : 0) + (subjectDateMatch ? 30 : 0) +
          (bodyKey.includes(flightKey) ? 15 : 0) + (bodyDateMatch ? 15 : 0) +
          (mailDateMatch ? 5 : 0) + (nameKey.includes('GENDEC') ? 10 : 0);
        candidates.push({ message, attachment, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score || String(b.message.date).localeCompare(String(a.message.date)));
    return candidates[0] || null;
  }

  async function fetchFlightPdfLegacy(flightNo, flightDate) {
    const messagesResponse = await fetch(`${MAIL_API}/api/messages`, {
      method: 'GET',
      cache: 'no-store',
      headers: mailHeaders()
    });
    if (!messagesResponse.ok) throw new Error(await readError(messagesResponse));
    const data = await messagesResponse.json();
    const match = findMailPdf(data.messages, flightNo, flightDate);
    if (!match) throw new Error(`${flightDate} tarihli ${flightNo} uçuşu için PDF eki bulunamadı.`);

    const query = new URLSearchParams({ id: match.attachment.id, name: match.attachment.name });
    const attachmentResponse = await fetch(`${MAIL_API}/api/attachment?${query}`, {
      method: 'GET',
      cache: 'no-store',
      headers: mailHeaders()
    });
    if (!attachmentResponse.ok) throw new Error(await readError(attachmentResponse));
    return { response: attachmentResponse, subject: String(match.message.subject || ''), name: match.attachment.name };
  }

  async function fetchCrewPdfFromMail() {
    if (!session.connected) {
      openMailLogin(fetchCrewPdfFromMail);
      return;
    }

    const button = document.getElementById('mailCrewFetchBtn');
    try {
      const { flightNo, flightDate } = getOpenFlightQuery();
      if (button) {
        button.disabled = true;
        button.textContent = 'Mail aranıyor...';
      }
      if (typeof setCrewStatus === 'function') {
        setCrewStatus('info', `${flightDate} / ${flightNo} için SXS\\GenDec mailleri aranıyor...`);
      }

      const query = new URLSearchParams({ flightNo, date: flightDate });
      let response = await fetch(`${MAIL_API}/api/flight-pdf?${query}`, {
        method: 'GET',
        cache: 'no-store',
        headers: mailHeaders()
      });
      let legacyResult = null;
      if (!response.ok) {
        const message = await readError(response);
        if (!isMissingEndpoint(response, message)) throw new Error(message);
        legacyResult = await fetchFlightPdfLegacy(flightNo, flightDate);
        response = legacyResult.response;
      }

      const blob = await response.blob();
      const fileName = legacyResult?.name || decodeHeader(response.headers.get('X-Attachment-Name'), `GenDec_${flightDate}_${flightNo}.pdf`);
      const mailSubject = legacyResult?.subject || decodeHeader(response.headers.get('X-Mail-Subject'), '');
      const file = new File([blob], fileName, { type: blob.type || 'application/pdf', lastModified: Date.now() });

      if (typeof handleCrewPdfSelect !== 'function') throw new Error('Mevcut PDF parser fonksiyonu bulunamadı.');
      await handleCrewPdfSelect({ target: { files: [file] } });
      let count = 0;
      try { count = Array.isArray(_crewParsedList) ? _crewParsedList.length : 0; } catch (_) {}
      if (mailSubject && count > 0 && typeof setCrewStatus === 'function') {
        setCrewStatus('success', `${count} ekip mail PDF'sinden okundu. Kaynak: ${mailSubject}`);
      }
    } catch (error) {
      if (typeof setCrewStatus === 'function') setCrewStatus('error', `Mailden ekip çekilemedi: ${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '✉ Mailden Ekip Çek';
      }
    }
  }

  function injectCrewMailControls() {
    const area = document.getElementById('crewInputArea');
    if (!area) return;
    area.classList.add('mail-controls-active');

    if (!document.getElementById('mailCrewFetchBtn')) {
      const button = document.createElement('button');
      button.id = 'mailCrewFetchBtn';
      button.type = 'button';
      button.className = 'btn btn-primary';
      button.textContent = '✉ Mailden Ekip Çek';
      button.addEventListener('click', fetchCrewPdfFromMail);
      area.insertBefore(button, area.querySelector('.crew-manual-btn') || null);
    }

    if (!document.getElementById('crewCaptainFromGendec')) {
      const captainOption = document.createElement('label');
      captainOption.className = 'crew-captain-option';
      captainOption.innerHTML = '<input id="crewCaptainFromGendec" type="checkbox"> Bu uçuşun kaptanını GenDec ekip listesinden güncelle';
      area.appendChild(captainOption);
      document.getElementById('crewCaptainFromGendec').checked = getCaptainDefault();
    }

    cacheFlightDetail(currentFlightDetail(), currentFlightBaseId());
  }

  function wrapApplicationFunctions() {
    if (typeof globalThis.openCrewBeyanModal === 'function' && !globalThis.openCrewBeyanModal.__mailWrapped) {
      const originalOpenCrew = globalThis.openCrewBeyanModal;
      const wrappedOpenCrew = function (...args) {
        const result = originalOpenCrew.apply(this, args);
        injectCrewMailControls();
        return result;
      };
      wrappedOpenCrew.__mailWrapped = true;
      globalThis.openCrewBeyanModal = wrappedOpenCrew;
    }

    if (typeof globalThis.submitCrewBeyan === 'function' && !globalThis.submitCrewBeyan.__captainWrapped) {
      const originalSubmitCrew = globalThis.submitCrewBeyan;
      const wrappedSubmitCrew = async function (...args) {
        const updateCaptain = shouldUpdateCaptainForOpenFlight();
        const crewCountBefore = parsedCrewList().length;
        const baseId = currentFlightBaseId();
        const captainName = updateCaptain ? findParsedCaptain() : '';

        if (updateCaptain && !captainName) {
          if (typeof setCrewStatus === 'function') {
            setCrewStatus('error', 'GenDec ekip listesinde CP / Kaptan Pilot bulunamadı. Kaptan seçeneğini kapat veya CP satırını düzelt.');
          }
          return;
        }

        await originalSubmitCrew.apply(this, args);

        // Orijinal akış başarılı olduğunda taslak ekip listesi temizlenir. Hata olduysa kaptanı değiştirme.
        const crewSubmitSucceeded = crewCountBefore > 0 && parsedCrewList().length === 0;
        if (!updateCaptain || !crewSubmitSucceeded) return;

        if (typeof setCrewStatus === 'function') {
          setCrewStatus('info', `Ekip kaydedildi. Uçuş kaptanı ${captainName} olarak güncelleniyor...`);
        }
        try {
          const result = await updateFlightCaptainOnly(baseId, captainName);
          if (typeof setCrewStatus === 'function') {
            const captainNote = result.changed
              ? `Kaptan ${captainName} olarak güncellendi.`
              : `Kaptan zaten ${captainName}; uçuş güncelleme isteği gönderilmedi.`;
            setCrewStatus('success', `${crewCountBefore} kişilik ekip beyanı kaydedildi. ${captainNote}`);
          }
        } catch (error) {
          if (typeof setCrewStatus === 'function') {
            setCrewStatus('error', `Ekip beyanı kaydedildi fakat kaptan güncellenemedi: ${error.message}`);
          }
        }
      };
      wrappedSubmitCrew.__captainWrapped = true;
      globalThis.submitCrewBeyan = wrappedSubmitCrew;
    }

    if (typeof globalThis.logout === 'function' && !globalThis.logout.__mailWrapped) {
      const originalLogout = globalThis.logout;
      const wrappedLogout = function (...args) {
        clearMailSession();
        flightDetailCache.clear();
        return originalLogout.apply(this, args);
      };
      wrappedLogout.__mailWrapped = true;
      globalThis.logout = wrappedLogout;
    }
  }

  globalThis.BeyanMail = {
    openLogin: openMailLogin,
    disconnect: disconnectMailSession,
    fetchCrewPdf: fetchCrewPdfFromMail,
    isConnected: () => session.connected,
    captainDefault: () => getCaptainDefault(),
    clearFlightCache: () => flightDetailCache.clear()
  };

  ensureMailUi();
  wrapApplicationFunctions();
})();
