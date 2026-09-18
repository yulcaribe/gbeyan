(function installOtoBeyanApi(global) {
  'use strict';

  const CLIENT_VERSION = '1.8.7';
  const API_URL = (global.location?.protocol === 'http:' || global.location?.protocol === 'https:')\n    ? global.location.origin\n    : 'https://gbeyan.yulcaribe.com';
  let accessCode = '';

  function config() {
    return {
      apiUrl: API_URL,
      mailLookbackHours: 15
    };
  }

  function endpoint(path) {
    const { apiUrl } = config();
    if (!apiUrl) throw new Error('Servis adresi tanımlı değil.');
    return `${apiUrl}${path}`;
  }

  function headers(extra = {}) {
    if (!accessCode) throw new Error('Erişim anahtarı gerekli.');
    return {
      Authorization: `Bearer ${accessCode}`,
      ...extra
    };
  }

  async function responseError(response) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Servis HTTP ${response.status}`);
    error.code = body.code || '';
    error.status = response.status;
    return error;
  }

  async function jsonRequest(path, options = {}) {
    const response = await fetch(endpoint(path), {
      cache: 'no-store',
      ...options,
      headers: headers(options.headers)
    });
    if (!response.ok) throw await responseError(response);
    return response.json();
  }

  function setAccessCode(value) {
    accessCode = String(value || '').trim();
  }

  function clearAccessCode() {
    accessCode = '';
  }

  function isUnlocked() {
    return Boolean(accessCode);
  }

  async function verifyAccess(value) {
    const candidate = String(value || '').trim();
    if (!candidate) throw new Error('Erişim anahtarını gir.');
    setAccessCode(candidate);
    try {
      return await jsonRequest('/api/auth/verify');
    } catch (error) {
      clearAccessCode();
      throw error;
    }
  }

  async function health() {
    return jsonRequest('/api/auth/verify');
  }

  async function syncMail() {
    return jsonRequest('/api/mail/sync', { method: 'POST' });
  }

  async function recentMail() {
    return jsonRequest('/api/mail/messages?hours=15');
  }

  async function flightAttachment(flightNumber, options = {}) {
    const normalized = String(flightNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(normalized)) {
      throw new Error('Sefer numarası XQ254 biçiminde olmalı.');
    }
    const params = new URLSearchParams({ flightNo: normalized, hours: '15' });
    if (options.cacheOnly) params.set('cache', '1');
    if (Number.isInteger(options.candidateIndex) && options.candidateIndex > 0) {
      params.set('candidate', String(options.candidateIndex));
    }
    const response = await fetch(endpoint(`/api/mail/flight-attachment?${params}`), {
      cache: 'no-store',
      headers: headers()
    });
    if (!response.ok) throw await responseError(response);
    return {
      blob: await response.blob(),
      fileName: decodeURIComponent(response.headers.get('X-Attachment-Name') || `${normalized}.pdf`),
      mailSubject: decodeURIComponent(response.headers.get('X-Mail-Subject') || ''),
      mailDate: decodeURIComponent(response.headers.get('X-Mail-Date') || ''),
      candidateIndex: Number(response.headers.get('X-Candidate-Index') || 0),
      candidateCount: Number(response.headers.get('X-Candidate-Count') || 1)
    };
  }

  async function flightData(input) {
    const params = new URLSearchParams({
      flightNumber: String(input?.flightNumber || ''),
      flightDate: String(input?.flightDate || ''),
      tailNumber: String(input?.tailNumber || '')
    });
    return jsonRequest(`/api/mail/flight-data?${params}`);
  }

  global.OtoBeyanApi = Object.freeze({
    version: CLIENT_VERSION,
    setAccessCode,
    clearAccessCode,
    isUnlocked,
    verifyAccess,
    health,
    syncMail,
    recentMail,
    flightAttachment,
    cachedFlightAttachment: (flightNumber, options = {}) => flightAttachment(flightNumber, { ...options, cacheOnly: true }),
    flightPdf: flightAttachment,
    flightData
  });

  function installGate() {
    if (document.getElementById('privateFeatureGate')) return;
    const excelButton = document.getElementById('excelBtn');
    if (!excelButton?.parentElement) return;
    const gate = document.createElement('div');
    gate.id = 'privateFeatureGate';
    gate.innerHTML = '<input id="privateFeatureKey" type="password" placeholder="API anahtarı" autocomplete="off" aria-label="API anahtarı"><button id="privateFeatureUnlock" type="button">Etkinleştir</button><span id="privateFeatureGateStatus" role="status"></span>';
    excelButton.parentElement.insertBefore(gate, excelButton);
    const input = gate.querySelector('input');
    const button = gate.querySelector('button');
    const status = gate.querySelector('span');
    const unlock = async () => {
      button.disabled = true; status.textContent = 'Kontrol ediliyor…';
      try {
        await verifyAccess(input.value);
        gate.dataset.state = 'ready'; input.hidden = true; button.textContent = `✓ Etkin · ${CLIENT_VERSION}`;
        status.textContent = ''; global.OtoBeyanUi?.refresh?.();
      } catch (error) {
        button.disabled = false; status.textContent = error.message || 'Erişim reddedildi.';
      }
    };
    button.addEventListener('click', unlock);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') unlock(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installGate, { once: true });
  else installGate();
})(globalThis);
