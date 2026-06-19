'use strict';

// ─────────────────────────────────────────────
//  API
// ─────────────────────────────────────────────
async function apiCall(method, path, body) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*'
  };
  if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    localStorage.removeItem(KEY_TOKEN);
    STATE.token = null;
    showLoginScreen('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
    throw new Error('401 Unauthorized');
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok || (data.status && data.status >= 400)) {
    const errMsg = Array.isArray(data.error) ? data.error.join(', ')
      : data.error || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  if (data.error && Array.isArray(data.error) && data.error.length) {
    throw new Error(data.error.join(', '));
  }

  return data;
}
