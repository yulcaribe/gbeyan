/*
 * SXS / SunExpress GENDEC parser.
 * SXS'e özel format şimdilik generic parsera bırakılır.
 *
 * QNT bridge:
 * index.html zaten sxs.js'i gendec-core.js'den önce yüklediği için,
 * yeni qnt.js burada erkenden yüklenir. Core'un mevcut special parser
 * zinciri parseSxsCrewLines() fonksiyonunu çağırdığında QANOT SHARQ
 * dosyaları qnt.js'e delege edilir. Böylece index/core'u bozmak gerekmez.
 */
'use strict';

(function (global) {
  const QNT_PARSER_CDN_URL = 'https://cdn.jsdelivr.net/gh/yulcaribe/gbeyan@main/gendec/qnt.js';

  function ensureQntParserLoadedEarly() {
    if (typeof document === 'undefined') return;
    if (global.QNTParser && typeof global.QNTParser.parseCrewLines === 'function') return;
    if (document.querySelector('script[data-qnt-parser]')) return;

    const script = document.createElement('script');
    script.src = `${QNT_PARSER_CDN_URL}?runtime=${Date.now()}`;
    script.async = false;
    script.dataset.qntParser = 'dynamic';
    script.onload = () => console.info('[QNTParser] loaded', global.QNTParser?.version || 'unknown');
    script.onerror = () => console.warn('[QNTParser] CDN yüklenemedi:', script.src);
    document.head.appendChild(script);
  }

  ensureQntParserLoadedEarly();

  global.parseSxsCrewLines = function parseSxsCrewLines(rawLines) {
    if (global.QNTParser && typeof global.QNTParser.parseCrewLines === 'function') {
      const qntCrews = global.QNTParser.parseCrewLines(rawLines);
      if (Array.isArray(qntCrews) && qntCrews.length) return qntCrews;
    }

    // Şimdilik SXS'e özel parser yok; generic parser devam etsin.
    return [];
  };
})(typeof window !== 'undefined' ? window : globalThis);
