(function installOtoBeyanApi(global) {
  'use strict';

  const CLIENT_VERSION = '1.6.0f';
  let accessCode = '';

  function config() {
    const value = global.OTOBEYAN_CONFIG || {};
    return {
      workerUrl: String(value.workerUrl || '').replace(/\/+$/, ''),
      mailLookbackHours: 6
    };
  }

  function endpoint(path) {
    const { workerUrl } = config();
    if (!workerUrl) throw new Error('Servis adresi tanımlı değil.');
    return `${workerUrl}${path}`;
  }

  function headers(extra = {}) {
    if (!accessCode) throw new Error('Erişim anahtarı gerekli.');
    return {
      Authorization: `Bearer ${accessCode}`,
      ...extra
    };
  }

  async function readError(response) {
    const body = await response.json().catch(() => ({}));
    return body.error || `Servis HTTP ${response.status}`;
  }

  async function jsonRequest(path, options = {}) {
    const response = await fetch(endpoint(path), {
      cache: 'no-store',
      ...options,
      headers: headers(options.headers)
    });
    if (!response.ok) throw new Error(await readError(response));
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

  async function flightPdf(flightNumber) {
    const normalized = String(flightNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^XQ\d{1,5}[A-Z]?$/.test(normalized)) {
      throw new Error('Sefer numarası XQ254 biçiminde olmalı.');
    }
    const response = await fetch(endpoint(`/api/mail/flight-pdf?flightNo=${encodeURIComponent(normalized)}&hours=6`), {
      cache: 'no-store',
      headers: headers()
    });
    if (!response.ok) throw new Error(await readError(response));
    return {
      blob: await response.blob(),
      fileName: decodeURIComponent(response.headers.get('X-Attachment-Name') || `${normalized}.pdf`),
      mailSubject: decodeURIComponent(response.headers.get('X-Mail-Subject') || '')
    };
  }

  async function cachedIgo(input) {
    const params = new URLSearchParams({
      flightNumber: String(input?.flightNumber || ''),
      flightDate: String(input?.flightDate || '')
    });
    const response = await fetch(endpoint(`/api/igo/loadsheet?${params}`), {
      cache: 'no-store',
      headers: headers()
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
  }

  async function queryIgo(input, onEvent = () => {}) {
    const cached = await cachedIgo(input);
    if (cached) {
      onEvent({ type: 'result', data: cached });
      return cached;
    }

    const response = await fetch(endpoint('/api/igo/query'), {
      method: 'POST',
      cache: 'no-store',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error(await readError(response));
    if ((response.headers.get('Content-Type') || '').includes('application/json')) {
      const result = await response.json();
      onEvent({ type: 'result', data: result });
      return result;
    }
    if (!response.body) throw new Error('iGO sorgu akışı açılamadı.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        onEvent(event);
        if (event.type === 'error') throw new Error(event.message || 'iGO sorgusu başarısız.');
        if (event.type === 'result') finalResult = event.data;
      }
    }

    if (!finalResult) throw new Error('iGO sorgusu sonuç döndürmedi.');
    return finalResult;
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
    flightPdf,
    cachedIgo,
    queryIgo
  });
})(globalThis);
