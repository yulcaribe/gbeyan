(function installPrivateFeatureGate(global) {
  'use strict';

  const loaderUrl = document.currentScript?.src || '';
  const baseUrl = loaderUrl.slice(0, loaderUrl.lastIndexOf('/') + 1);
  const buildVersion = new URL(loaderUrl, location.href).searchParams.get('v') || '1.7.3';
  const integrity = Object.freeze({
    'config.js': 'sha384-gVbY1CxDb280TjWQs2E+fQrjIk1czx2gP6g5FvZN8Ke/dKJqflyoxhKHHbY5pbP/',
    'client/api.js': 'sha384-1AYBIrhII5uaWltIEPIUygEfocPCeHeJMUMNGaQU1iyE73eudmQei5rNik3jbaQq',
    'quickbeyan.js': 'sha384-X5XgnP/lQIQvFWpSUnQZiFtSrmwHe1h2LElPR1U2dlCaWJBfo4n+UXj/+vFVMSeO'
  });
  let featureScriptPromise = null;
  let unlocked = false;

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${baseUrl}${file}?v=${buildVersion}`;
      script.async = false;
      script.integrity = integrity[file] || '';
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Gerekli bileşen yüklenemedi.'));
      document.head.appendChild(script);
    });
  }

  function installGateStyles() {
    if (document.getElementById('privateFeatureGateStyles')) return;
    const style = document.createElement('style');
    style.id = 'privateFeatureGateStyles';
    style.textContent = `
      #privateFeatureGate{display:flex;align-items:center;gap:6px;min-width:260px}
      #privateFeatureKey{width:150px;height:32px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:5px 8px;font:12px inherit;background:#fff;color:#0f172a}
      #privateFeatureKey:focus{outline:2px solid #bfdbfe;border-color:#2563eb}
      #privateFeatureUnlock{height:32px;border:1px solid #334155;border-radius:7px;padding:5px 10px;background:#334155;color:#fff;font:700 11px inherit;cursor:pointer;white-space:nowrap}
      #privateFeatureUnlock:disabled{opacity:.6;cursor:wait}
      #privateFeatureGate[data-state="ready"] #privateFeatureKey{display:none}
      #privateFeatureGate[data-state="ready"] #privateFeatureUnlock{border-color:#15803d;background:#15803d;cursor:default}
      #privateFeatureGateStatus{max-width:150px;color:#b91c1c;font:600 10px/1.2 inherit}
      @media(max-width:860px){#privateFeatureGate{order:20;min-width:100%}}
    `;
    document.head.appendChild(style);
  }

  function setGateState(state, message = '') {
    const gate = document.getElementById('privateFeatureGate');
    const button = document.getElementById('privateFeatureUnlock');
    const input = document.getElementById('privateFeatureKey');
    const status = document.getElementById('privateFeatureGateStatus');
    if (!gate || !button || !input || !status) return;
    gate.dataset.state = state;
    status.textContent = message;
    button.disabled = state === 'checking' || state === 'ready';
    button.textContent = state === 'checking' ? 'Kontrol…' : state === 'ready' ? '✓ Etkin · 1.7.3' : 'Etkinleştir';
    input.disabled = state === 'checking' || state === 'ready';
    if (state === 'ready') input.value = '';
  }

  async function loadFeatureUi() {
    if (!featureScriptPromise) featureScriptPromise = loadScript('quickbeyan.js');
    await featureScriptPromise;
    global.OtoBeyanUi?.refresh?.();
  }

  async function unlock(value) {
    if (unlocked) return true;
    setGateState('checking');
    try {
      await global.OtoBeyanApi.verifyAccess(value);
      unlocked = true;
      await loadFeatureUi();
      setGateState('ready');
      return true;
    } catch (error) {
      unlocked = false;
      global.OtoBeyanApi?.clearAccessCode?.();
      setGateState('locked', error?.message || 'Erişim reddedildi.');
      return false;
    }
  }

  function lock() {
    unlocked = false;
    global.OtoBeyanApi?.clearAccessCode?.();
    global.OtoBeyanUi?.lock?.();
    setGateState('locked');
  }

  function installGate() {
    if (document.getElementById('privateFeatureGate')) return;
    const excelButton = document.getElementById('excelBtn');
    if (!excelButton?.parentElement) return;
    installGateStyles();
    const gate = document.createElement('div');
    gate.id = 'privateFeatureGate';
    gate.dataset.state = 'locked';
    gate.innerHTML = `
      <input id="privateFeatureKey" type="password" placeholder="API anahtarı" autocomplete="off" spellcheck="false" aria-label="API anahtarı">
      <button id="privateFeatureUnlock" type="button">Etkinleştir</button>
      <span id="privateFeatureGateStatus" role="status" aria-live="polite"></span>`;
    const separator = document.createElement('div');
    separator.className = 'toolbar-sep';
    excelButton.parentElement.insertBefore(separator, excelButton);
    excelButton.parentElement.insertBefore(gate, excelButton);

    const input = gate.querySelector('#privateFeatureKey');
    gate.querySelector('#privateFeatureUnlock').addEventListener('click', () => unlock(input.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') unlock(input.value);
    });

    const main = document.getElementById('mainSection');
    if (main) {
      new MutationObserver(() => {
        if (main.style.display === 'none' && unlocked) lock();
      }).observe(main, { attributes: true, attributeFilter: ['style'] });
    }
  }

  global.PrivateFeatureGate = Object.freeze({ unlock, lock, isUnlocked: () => unlocked });

  Promise.resolve()
    .then(() => loadScript('config.js'))
    .then(() => loadScript('client/api.js'))
    .then(installGate)
    .catch(error => console.error('[PrivateFeature]', error));
})(globalThis);
