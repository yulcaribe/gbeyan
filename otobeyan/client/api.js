(function installOtoBeyanApi(global) {
  'use strict';

  function config() {
    const value = global.OTOBEYAN_CONFIG || {};
    return {
      workerUrl: String(value.workerUrl || '').replace(/\/+$/, ''),
      accessCode: String(value.accessCode || ''),
      mailLookbackHours: 6
    };
  }

  function endpoint(path) {
    const { workerUrl } = config();
    if (!workerUrl) throw new Error('OtoBeyan Worker adresi tanımlı değil.');
    return `${workerUrl}${path}`;
  }

  function headers(extra = {}) {
    const { accessCode } = config();
    return {
      Authorization: `Bearer ${accessCode}`,
      ...extra
    };
  }

  async function readError(response) {
    const body = await response.json().catch(() => ({}));
    return body.error || `OtoBeyan Worker HTTP ${response.status}`;
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

  async function health() {
    return jsonRequest('/health');
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

  async function queryIgo(input, onEvent = () => {}) {
    const response = await fetch(endpoint('/api/igo/query'), {
      method: 'POST',
      cache: 'no-store',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error(await readError(response));
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
    health,
    syncMail,
    recentMail,
    flightPdf,
    queryIgo
  });
})(globalThis);
