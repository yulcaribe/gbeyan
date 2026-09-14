const status = document.getElementById('status');

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: 'STATUS' });
  if (!response?.ok) {
    status.className = 'status warn';
    status.textContent = response?.error || 'Durum alınamadı.';
    return;
  }
  status.className = `status ${response.result.authenticated ? 'ok' : 'warn'}`;
  status.textContent = response.result.authenticated
    ? 'iGO sekmesi açık ve oturum hazır.'
    : response.result.tabOpen
      ? 'iGO girişi bekleniyor.'
      : 'Sekme kapalı; sorguda otomatik açılacak.';
}

document.getElementById('openIgo').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'OPEN_LOGIN' });
  if (!response?.ok) status.textContent = response?.error || 'iGO açılamadı.';
  window.close();
});

refresh();
