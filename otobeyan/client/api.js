(function installOtoBeyanApi(global) {
  'use strict';

  const CLIENT_VERSION = '1.7.1';
  let accessCode = '';

  function config() {
    const value = global.OTOBEYAN_CONFIG || {};
    return {
      apiUrl: String(value.apiUrl || '').replace(/\/+$/, ''),
      mailLookbackHours: 6
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
    return jsonRequest('/api/mail/messages?hours=6');
  }

  async function flightAttachment(flightNumber) {
    const normalized = String(flightNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(normalized)) {
      throw new Error('Sefer numarası XQ254 biçiminde olmalı.');
    }
    const response = await fetch(endpoint(`/api/mail/flight-attachment?flightNo=${encodeURIComponent(normalized)}&hours=6`), {
      cache: 'no-store',
      headers: headers()
    });
    if (!response.ok) throw await responseError(response);
    return {
      blob: await response.blob(),
      fileName: decodeURIComponent(response.headers.get('X-Attachment-Name') || `${normalized}.pdf`),
      mailSubject: decodeURIComponent(response.headers.get('X-Mail-Subject') || '')
    };
  }

  async function flightData(input) {
    const params = new URLSearchParams({
      flightNumber: String(input?.flightNumber || ''),
      flightDate: String(input?.flightDate || '')
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
    flightPdf: flightAttachment,
    flightData
  });
})(globalThis);
