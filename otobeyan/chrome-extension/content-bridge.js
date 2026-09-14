(() => {
  'use strict';

  const PAGE_SOURCE = 'otobeyan-page';
  const EXTENSION_SOURCE = 'otobeyan-extension';
  const allowedTypes = new Set(['STATUS', 'OPEN_LOGIN', 'SEARCH_FLIGHT']);

  function isOtoBeyanPage() {
    const path = decodeURIComponent(location.pathname || '').replace(/\\/g, '/');
    const isIndex = path.endsWith('/index.html') || path === '/';
    const isLocalFile = location.protocol === 'file:' && /\/gbeyan\/index\.html$/i.test(path);
    return isIndex && isLocalFile;
  }

  function announceReady() {
    if (!isOtoBeyanPage()) return;
    window.postMessage({ source: EXTENSION_SOURCE, type: 'READY' }, '*');
  }

  window.addEventListener('message', event => {
    if (event.source !== window || !isOtoBeyanPage()) return;
    const message = event.data;
    if (!message || message.source !== PAGE_SOURCE || !allowedTypes.has(message.type) || !message.requestId) return;

    chrome.runtime.sendMessage({ type: message.type, payload: message.payload || {} })
      .then(response => {
        if (!response?.ok) {
          const error = new Error(response?.error || 'Chrome eklentisi hatası.');
          error.code = response?.code || 'IGO_BRIDGE_ERROR';
          throw error;
        }
        window.postMessage({
          source: EXTENSION_SOURCE,
          type: 'RESPONSE',
          requestId: message.requestId,
          ok: true,
          result: response.result
        }, '*');
      })
      .catch(error => {
        window.postMessage({
          source: EXTENSION_SOURCE,
          type: 'RESPONSE',
          requestId: message.requestId,
          ok: false,
          error: error.message || 'Chrome eklentisi hatası.',
          code: error.code || 'IGO_BRIDGE_ERROR'
        }, '*');
      });
  });

  document.addEventListener('DOMContentLoaded', announceReady, { once: true });
  announceReady();
})();
