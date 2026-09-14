(function loadOtoBeyan() {
  'use strict';

  const loaderUrl = document.currentScript?.src || '';
  const baseUrl = loaderUrl.slice(0, loaderUrl.lastIndexOf('/') + 1);
  const files = ['config.js', 'client/api.js', 'quickbeyan.js'];

  files.reduce((ready, file) => ready.then(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${baseUrl}${file}`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`OtoBeyan dosyası yüklenemedi: ${file}`));
    document.head.appendChild(script);
  })), Promise.resolve()).catch(error => {
    console.error('[OtoBeyan]', error);
  });
})();
