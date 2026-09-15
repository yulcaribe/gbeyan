// Private API/cache gateway. All iGO browser automation runs on Cloud Run;
// this Worker only authenticates clients, caches results and proxies requests.
// Secret values are configured in Cloudflare, never committed to this file.

import { DurableObject } from 'cloudflare:workers';
import mailWorker, { refreshMailCache } from './mail.js';
import PRIVATE_PAGE from './private-page.js';

const RELEASE_VERSION = '1.6.0f-cloudrun';
const SESSION_OBJECT_NAME = 'primary-igo-session';
const LOADSHEET_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const LOADSHEET_CACHE_RETENTION_MS = 36 * 60 * 60 * 1000;
const API_HEADERS = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
};

export class IgoSessionStore extends DurableObject {
  async getSession() {
    return (await this.ctx.storage.get('session')) || null;
  }

  async saveSession(storageState) {
    const record = { storageState, savedAt: new Date().toISOString() };
    await this.ctx.storage.put('session', record);
    return { savedAt: record.savedAt };
  }

  async clearSession() {
    await this.ctx.storage.delete('session');
    return { cleared: true };
  }

  async getMailSnapshot() {
    return (await this.ctx.storage.get('mailSnapshot')) || null;
  }

  async saveMailSnapshot(snapshot) {
    await this.ctx.storage.put('mailSnapshot', snapshot);
    return { cachedAt: snapshot?.cachedAt || null };
  }

  async clearMailSnapshot() {
    await this.ctx.storage.delete('mailSnapshot');
    return { cleared: true };
  }

  async getLoadSheet(flightNumber, flightDate) {
    const snapshot = (await this.ctx.storage.get('loadSheetSnapshot')) || { entries: {} };
    return snapshot.entries?.[loadSheetCacheKey(flightNumber, flightDate)] || null;
  }

  async saveLoadSheet(result) {
    const key = loadSheetCacheKey(result?.query?.flightNumber, result?.query?.flightDate);
    if (!key) throw new Error('Load Sheet cache anahtarı oluşturulamadı.');

    const now = Date.now();
    const cachedAt = new Date(now).toISOString();
    const snapshot = (await this.ctx.storage.get('loadSheetSnapshot')) || { entries: {} };
    const entries = snapshot.entries && typeof snapshot.entries === 'object' ? snapshot.entries : {};
    for (const [entryKey, entry] of Object.entries(entries)) {
      const cachedTime = Date.parse(entry?.cachedAt || '');
      if (!Number.isFinite(cachedTime) || now - cachedTime > LOADSHEET_CACHE_RETENTION_MS) delete entries[entryKey];
    }

    entries[key] = { ...result, cachedAt };
    await this.ctx.storage.put('loadSheetSnapshot', { cachedAt, entries });
    return { key, cachedAt };
  }

  async getLoadSheetStatus() {
    const snapshot = (await this.ctx.storage.get('loadSheetSnapshot')) || { cachedAt: null, entries: {} };
    return { cachedAt: snapshot.cachedAt || null, count: Object.keys(snapshot.entries || {}).length };
  }

  async getLoadSheetSnapshot() {
    return (await this.ctx.storage.get('loadSheetSnapshot')) || { cachedAt: null, entries: {} };
  }

  async getStatus() {
    const record = await this.ctx.storage.get('session');
    return { cached: Boolean(record?.storageState), savedAt: record?.savedAt || null };
  }
}

function getSessionStore(env) {
  return env.IGO_SESSION_STORE.getByName(SESSION_OBJECT_NAME);
}

function browserBackendReady(env) {
  return Boolean(env.OTOBEYAN_BROWSER_URL && env.CLOUDFLARE_SHARED_SECRET);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...API_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function safeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}

function hasAccess(request, env) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') && Boolean(env.TEST_API_KEY) && safeEqual(header.slice(7), env.TEST_API_KEY);
}

function notFound() {
  return new Response(null, {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
    }
  });
}

function normalizeFlightNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function splitFlightNumber(value) {
  const normalized = normalizeFlightNumber(value);
  const match = normalized.match(/^([A-Z]{2,3})(\d{1,5}[A-Z]?)$/);
  if (!match) throw new Error('Sefer numarası XQ254 biçiminde olmalı.');
  return { normalized, carrier: match[1], number: match[2] };
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

function splitDate(value) {
  const normalized = normalizeDate(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Tarih YYYY-MM-DD biçiminde olmalı.');
  return {
    normalized,
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10)
  };
}

function loadSheetCacheKey(flightNumber, flightDate) {
  const normalizedFlight = normalizeFlightNumber(flightNumber);
  const normalizedDate = normalizeDate(flightDate);
  return normalizedFlight && normalizedDate ? `${normalizedFlight}|${normalizedDate}` : '';
}

function isFreshLoadSheet(entry) {
  const cachedAt = Date.parse(entry?.cachedAt || '');
  return Number.isFinite(cachedAt) && Date.now() - cachedAt <= LOADSHEET_CACHE_MAX_AGE_MS;
}

function cachedLoadSheetResult(entry) {
  return {
    status: 'ready',
    igoSessionReused: true,
    fromCache: true,
    cachedAt: entry.cachedAt,
    query: entry.query,
    flight: entry.flight,
    loadSheet: entry.loadSheet
  };
}

function parseLoadSheet(text, url) {
  if (!/L\s*O\s*A\s*D\s*S\s*H\s*E\s*E\s*T/i.test(text)) throw new Error('Load Sheet metni bulunamadı.');

  const header = text.match(/\b([A-Z]{3})\s*\/\s*([A-Z]{3})\s+(XQ)\s*(\d{1,5}[A-Z]?)\s+(TC[- ]?[A-Z0-9]{3})\s+(\S+)\s+(\d+)\s*\/\s*(\d+)/i);
  const passengers = text.match(/\bY\s+(\d+)\s*\+\s*(\d+)\b/i);
  const ttl = text.match(/\bTTL\s+(\d+)/i);
  const takeOff = text.match(/TAKE\s*OFF\s*FUEL\s+(\d+)/i);
  const taxi = text.match(/Taxi\s*Fuel\s*:\s*(\d+)/i);
  const offBlock = text.match(/OffBlock\s*Fuel\s*:\s*(\d+)/i);
  const edno = text.match(/\bEDNO\s*:\s*(\d+)/i);
  const number = match => match ? Number.parseInt(match[1], 10) : null;
  const pax = passengers ? Number.parseInt(passengers[1], 10) : null;
  const infant = passengers ? Number.parseInt(passengers[2], 10) : null;
  const total = number(ttl);
  const takeOffFuel = number(takeOff);
  const taxiFuel = number(taxi);
  const offBlockFuel = number(offBlock);

  return {
    finalized: /\(\s*Digitally\s+Signed\s*\)/i.test(text),
    approved: /\bAPPROVED\s*:\s*\S+/i.test(text),
    flightNumber: header ? `${header[3]}${header[4]}` : '',
    departurePortCode: header?.[1] || '',
    arrivalPortCode: header?.[2] || '',
    tailNumber: header ? header[5].replace(/[^A-Z0-9]/gi, '').replace(/^TC/i, 'TC-').toUpperCase() : '',
    cockpitCrew: header ? Number.parseInt(header[7], 10) : null,
    cabinCrew: header ? Number.parseInt(header[8], 10) : null,
    pax,
    infant,
    passengerTotal: total,
    takeOffFuelKg: takeOffFuel,
    taxiFuelKg: taxiFuel,
    offBlockFuelKg: offBlockFuel,
    edno: number(edno),
    sourceUrl: url,
    validations: {
      passengerTotal: pax !== null && infant !== null && total !== null ? pax + infant === total : null,
      fuelTotal: takeOffFuel !== null && taxiFuel !== null && offBlockFuel !== null
        ? takeOffFuel + taxiFuel === offBlockFuel
        : null
    }
  };
}

async function runCloudRunQuery(env, input) {
  const flight = splitFlightNumber(input.flightNumber);
  const date = splitDate(input.flightDate);
  const store = getSessionStore(env);
  const cached = await store.getLoadSheet(flight.normalized, date.normalized);
  if (isFreshLoadSheet(cached)) return cachedLoadSheetResult(cached);

  const saved = await store.getSession();
  const baseUrl = String(env.OTOBEYAN_BROWSER_URL || '').replace(/\/+$/, '');
  if (!baseUrl || !env.CLOUDFLARE_SHARED_SECRET) throw new Error('Load Sheet servisi hazır değil.');

  let response;
  try {
    response = await fetch(`${baseUrl}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_SHARED_SECRET}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        flightNumber: flight.normalized,
        flightDate: date.normalized,
        storageState: saved?.storageState || null,
        credentials: { username: env.IGO_USERNAME, password: env.IGO_PASSWORD }
      }),
      signal: AbortSignal.timeout(88_000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error('Load Sheet sorgusu zaman aşımına uğradı.');
    throw new Error('Load Sheet servisine ulaşılamadı.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    if (payload?.code === 'LOGIN_REQUIRED' || payload?.code === 'CAPTCHA_REQUIRED') {
      await store.clearSession().catch(() => {});
    }
    const error = new Error(payload?.error || `Load Sheet servisi HTTP ${response.status} hatası verdi.`);
    error.status = response.status === 409 ? 409 : 502;
    error.code = payload?.code || 'CLOUD_RUN_ERROR';
    throw error;
  }
  if (!payload.flight || !payload.loadSheetText || !payload.sourceUrl) throw new Error('Load Sheet servisi eksik yanıt verdi.');

  if (payload.storageState) await store.saveSession(payload.storageState);
  const result = {
    status: 'ready',
    igoSessionReused: Boolean(payload.sessionReused),
    fromCache: false,
    query: { flightNumber: flight.normalized, flightDate: date.normalized },
    flight: payload.flight,
    loadSheet: parseLoadSheet(payload.loadSheetText, payload.sourceUrl)
  };
  await store.saveLoadSheet(result);
  return result;
}

function privatePageResponse() {
  return new Response(PRIVATE_PAGE, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: API_HEADERS });
    if (request.method === 'GET' && url.pathname === '/') return privatePageResponse();
    if (!url.pathname.startsWith('/api/')) return notFound();
    if (!env.TEST_API_KEY) return json({ ok: false, error: 'Servis hazır değil.' }, 503);

    if (!hasAccess(request, env)) {
      if (env.AUTH_RATE_LIMITER) {
        const key = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateLimit = await env.AUTH_RATE_LIMITER.limit({ key }).catch(() => ({ success: true }));
        if (!rateLimit.success) return json({ ok: false, error: 'Çok fazla deneme.' }, 429);
      }
      return json({ ok: false, error: 'Erişim reddedildi.' }, 401);
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/verify') {
      let sessionReady = false;
      if (env.IGO_SESSION_STORE) {
        const status = await getSessionStore(env).getStatus().catch(() => null);
        sessionReady = Boolean(status?.cached);
      }
      return json({
        ok: true,
        version: RELEASE_VERSION,
        browserBackend: 'cloud-run',
        ready: Boolean(
          browserBackendReady(env) && env.IGO_SESSION_STORE && env.IGO_USERNAME && env.IGO_PASSWORD
          && env.EWS_USERNAME && env.EWS_PASSWORD
        ),
        sessionReady
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/snapshot') {
      if (!env.IGO_SESSION_STORE) return json({ ok: false, error: 'Servis hazır değil.' }, 503);
      const store = getSessionStore(env);
      const [loadSheetSnapshot, mailSnapshot] = await Promise.all([
        store.getLoadSheetSnapshot().catch(() => ({ cachedAt: null, entries: {} })),
        store.getMailSnapshot().catch(() => null)
      ]);
      const loadSheets = Object.values(loadSheetSnapshot?.entries || {}).map(entry => ({
        cachedAt: entry?.cachedAt || null,
        flightDate: entry?.query?.flightDate || entry?.flight?.flightDate || '',
        flightNumber: entry?.flight?.flightNumber || entry?.loadSheet?.flightNumber || entry?.query?.flightNumber || '',
        departurePortCode: entry?.flight?.departurePortCode || entry?.loadSheet?.departurePortCode || '',
        arrivalPortCode: entry?.flight?.arrivalPortCode || entry?.loadSheet?.arrivalPortCode || '',
        tailNumber: entry?.flight?.tailNumber || entry?.loadSheet?.tailNumber || '',
        pax: entry?.loadSheet?.pax ?? null,
        infant: entry?.loadSheet?.infant ?? null,
        offBlockFuelKg: entry?.loadSheet?.offBlockFuelKg ?? null,
        edno: entry?.loadSheet?.edno ?? null,
        finalized: Boolean(entry?.loadSheet?.finalized)
      })).sort((a, b) => `${b.flightDate}|${b.flightNumber}`.localeCompare(`${a.flightDate}|${a.flightNumber}`));
      const genDec = (mailSnapshot?.messages || []).map(message => ({
        date: message?.date || '',
        subject: message?.subject || '',
        from: message?.from || '',
        attachments: (message?.attachments || [])
          .filter(attachment => String(attachment?.name || '').toLowerCase().endsWith('.pdf'))
          .map(attachment => ({ name: attachment?.name || '', size: Number(attachment?.size || 0) }))
      })).filter(message => message.attachments.length);
      return json({
        ok: true,
        version: RELEASE_VERSION,
        loadSheetCachedAt: loadSheetSnapshot?.cachedAt || null,
        genDecCachedAt: mailSnapshot?.cachedAt || null,
        loadSheets,
        genDec
      });
    }

    if (url.pathname.startsWith('/api/mail/')) {
      const mailCache = env.IGO_SESSION_STORE ? getSessionStore(env) : null;
      return mailWorker.fetch(request, env, { mailCache });
    }

    if (request.method === 'GET' && url.pathname === '/api/igo/loadsheet') {
      if (!env.IGO_SESSION_STORE) return json({ ok: false, error: 'Servis hazır değil.' }, 503);
      try {
        const flight = splitFlightNumber(url.searchParams.get('flightNumber'));
        const date = splitDate(url.searchParams.get('flightDate'));
        const cached = await getSessionStore(env).getLoadSheet(flight.normalized, date.normalized);
        if (!isFreshLoadSheet(cached)) {
          return json({
            ok: false,
            status: 'cache_miss',
            query: { flightNumber: flight.normalized, flightDate: date.normalized }
          }, 404);
        }
        return json(cachedLoadSheetResult(cached));
      } catch (error) {
        return json({ ok: false, error: error.message || 'İstek geçersiz.' }, 400);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/igo/session/reset') {
      if (!env.IGO_SESSION_STORE) return json({ ok: false, error: 'IGO_SESSION_STORE binding tanımlı değil.' }, 503);
      await getSessionStore(env).clearSession();
      return json({ ok: true });
    }

    if (request.method !== 'POST' || url.pathname !== '/api/igo/query') return notFound();
    if (!browserBackendReady(env) || !env.IGO_SESSION_STORE || !env.IGO_USERNAME || !env.IGO_PASSWORD) {
      return json({ ok: false, error: 'Servis hazır değil.' }, 503);
    }

    let input;
    try {
      input = await request.json();
      splitFlightNumber(input.flightNumber);
      splitDate(input.flightDate);
    } catch (error) {
      return json({ ok: false, error: error.message || 'İstek geçersiz.' }, 400);
    }

    try {
      return json(await runCloudRunQuery(env, input));
    } catch (error) {
      return json({
        ok: false,
        code: error?.code || 'QUERY_FAILED',
        error: error?.message || 'Load Sheet sorgusu başarısız.'
      }, Number(error?.status) || 502);
    }
  },

  async scheduled(_controller, env, ctx) {
    if (!env.IGO_SESSION_STORE || !env.EWS_USERNAME || !env.EWS_PASSWORD) return;
    ctx.waitUntil(refreshMailCache(env, getSessionStore(env)));
  }
};
