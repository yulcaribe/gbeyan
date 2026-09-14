// Private browser automation gateway.
// This file is bundled by Cloudflare Workers Builds via package.json.
// Browser binding adı: BROWSER
// Gerekli Worker Secret'ları:
// IGO_USERNAME, IGO_PASSWORD, EWS_USERNAME, EWS_PASSWORD, TEST_API_KEY
// CAPTCHA otomatik çözülmez. Yalnız kayıtlı iGO oturumu yoksa/sona erdiyse
// kullanıcı Live View ekranında kendisi tamamlar.

import { launch } from '@cloudflare/playwright';
import { DurableObject } from 'cloudflare:workers';
import mailWorker, { refreshMailCache } from './mail.js';
import PRIVATE_PAGE from './private-page.js';

const IGO_ORIGIN = 'https://igo.sunexpress.com';
const RELEASE_VERSION = '1.6.0d';
const LOGIN_URL = `${IGO_ORIGIN}/Account/pgLogin.aspx?ReturnUrl=%2fWB%2fpgWBFlightList.aspx`;
const FLIGHT_LIST_URL = `${IGO_ORIGIN}/WB/pgWBFlightList.aspx`;
const SESSION_OBJECT_NAME = 'primary-igo-session';
const LOADSHEET_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const LOADSHEET_CACHE_RETENTION_MS = 36 * 60 * 60 * 1000;
// Browser Rendering Free plan yeni tarayıcı açılışlarını yaklaşık 20 saniyede
// bir ile sınırlar. Cron yenilemesiyle kullanıcı sorgusunun çakışmasını Durable
// Object üzerinde tek bir kiralama kaydıyla engelliyoruz.
const BROWSER_LAUNCH_COOLDOWN_MS = 22_000;
const BROWSER_QUERY_WAIT_MS = 75_000;
const BROWSER_LEASE_TTL_MS = 10 * 60 * 1000;
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
    const record = {
      storageState,
      savedAt: new Date().toISOString()
    };
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
      if (!Number.isFinite(cachedTime) || now - cachedTime > LOADSHEET_CACHE_RETENTION_MS) {
        delete entries[entryKey];
      }
    }

    entries[key] = { ...result, cachedAt };
    await this.ctx.storage.put('loadSheetSnapshot', { cachedAt, entries });
    return { key, cachedAt };
  }

  async getLoadSheetStatus() {
    const snapshot = (await this.ctx.storage.get('loadSheetSnapshot')) || { cachedAt: null, entries: {} };
    return {
      cachedAt: snapshot.cachedAt || null,
      count: Object.keys(snapshot.entries || {}).length
    };
  }

  async getLoadSheetSnapshot() {
    return (await this.ctx.storage.get('loadSheetSnapshot')) || { cachedAt: null, entries: {} };
  }

  async getStatus() {
    const record = await this.ctx.storage.get('session');
    return {
      cached: Boolean(record?.storageState),
      savedAt: record?.savedAt || null
    };
  }

  async acquireBrowserLease(token, ttlMs = BROWSER_LEASE_TTL_MS) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const lease = await this.ctx.storage.get('browserLease');
      if (lease?.token && lease.token !== token && Number(lease.expiresAt || 0) > now) {
        return {
          acquired: false,
          reason: 'in-use',
          retryAfterMs: Math.max(500, Number(lease.expiresAt) - now)
        };
      }

      const lastLaunchAt = Number((await this.ctx.storage.get('browserLastLaunchAt')) || 0);
      const cooldownRemaining = BROWSER_LAUNCH_COOLDOWN_MS - (now - lastLaunchAt);
      if (cooldownRemaining > 0) {
        return {
          acquired: false,
          reason: 'cooldown',
          retryAfterMs: cooldownRemaining
        };
      }

      const expiresAt = now + Math.max(30_000, Number(ttlMs) || BROWSER_LEASE_TTL_MS);
      await this.ctx.storage.put({
        browserLease: { token, acquiredAt: now, expiresAt },
        browserLastLaunchAt: now
      });
      return { acquired: true, token, acquiredAt: now, expiresAt };
    });
  }

  async releaseBrowserLease(token) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const lease = await this.ctx.storage.get('browserLease');
      if (lease?.token === token) await this.ctx.storage.delete('browserLease');
      return { released: lease?.token === token };
    });
  }
}

function getSessionStore(env) {
  return env.IGO_SESSION_STORE.getByName(SESSION_OBJECT_NAME);
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isBrowserLaunchRateLimit(error) {
  const message = String(error?.message || error || '');
  return /429|rate\s*limit|too many browser/i.test(message);
}

function friendlyBrowserError(error) {
  const message = String(error?.message || error || '');
  if (/daily|per day|time limit.*today|browser time limit/i.test(message)) {
    return new Error('Load Sheet servisi günlük kullanım sınırına ulaştı. Cache verileri kullanılabilir; canlı sorgu daha sonra yeniden açılacak.');
  }
  if (isBrowserLaunchRateLimit(error) || error?.code === 'BROWSER_BUSY') {
    return new Error('Load Sheet servisi şu an yoğun. Kısa süre sonra yeniden dene.');
  }
  return error instanceof Error ? error : new Error(message || 'Load Sheet sorgusu başarısız.');
}

async function openQueuedBrowser(env, { waitMs = 0, leaseTtlMs = BROWSER_LEASE_TTL_MS, keepAliveMs = 240_000 } = {}) {
  const store = getSessionStore(env);
  const token = crypto.randomUUID();
  const deadline = Date.now() + Math.max(0, waitMs);
  let rateLimitRetries = 0;

  while (true) {
    const lease = await store.acquireBrowserLease(token, leaseTtlMs);
    if (!lease?.acquired) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await wait(Math.min(Math.max(500, Number(lease?.retryAfterMs) || 1_000), remaining, 2_000));
      continue;
    }

    try {
      const browser = await launch(env.BROWSER, { keep_alive: keepAliveMs });
      return { browser, token, store };
    } catch (error) {
      await store.releaseBrowserLease(token).catch(() => {});
      if (isBrowserLaunchRateLimit(error) && rateLimitRetries < 1) {
        rateLimitRetries += 1;
        const remaining = deadline - Date.now();
        if (remaining > BROWSER_LAUNCH_COOLDOWN_MS) {
          await wait(BROWSER_LAUNCH_COOLDOWN_MS);
          continue;
        }
      }
      throw friendlyBrowserError(error);
    }
  }
}

async function closeQueuedBrowser(handle) {
  if (!handle) return;
  try {
    await handle.browser?.close().catch(() => {});
  } finally {
    await handle.store?.releaseBrowserLease(handle.token).catch(() => {});
  }
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
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] || 0) ^ (b[index] || 0);
  }
  return mismatch === 0;
}

function hasAccess(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || !env.TEST_API_KEY) return false;
  return safeEqual(header.slice(7), env.TEST_API_KEY);
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

function isLoginUrl(value) {
  return /\/Account\/pgLogin\.aspx/i.test(String(value || ''));
}

async function gotoWithAbortRetry(page, url, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
        ...options
      });
    } catch (error) {
      lastError = error;
      const aborted = /net::ERR_ABORTED/i.test(String(error?.message || error));
      if (!aborted || attempt === 3) throw error;
      await page.waitForTimeout(attempt * 1_000);
    }
  }

  throw lastError;
}

function parseLoadSheet(text, url) {
  if (!/L\s*O\s*A\s*D\s*S\s*H\s*E\s*E\s*T/i.test(text)) {
    throw new Error('Load Sheet metni bulunamadı.');
  }

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
  const finalized = /\(\s*Digitally\s+Signed\s*\)/i.test(text);

  return {
    finalized,
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

async function fillLogin(page, env) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const username = page.locator(
    'input[name="eMailorUserName"], #eMailorUserName_I, input[id*="eMailorUserName"][type="text"]'
  ).first();
  const password = page.locator(
    'input[name="ePassword"], #ePassword_I, input[id*="ePassword"][type="password"]'
  ).first();

  await username.waitFor({ state: 'visible', timeout: 30_000 });
  await username.fill(env.IGO_USERNAME);
  await password.fill(env.IGO_PASSWORD);

  const usernameReady = (await username.inputValue()) === String(env.IGO_USERNAME);
  const passwordReady = (await password.inputValue()) === String(env.IGO_PASSWORD);
  if (!usernameReady || !passwordReady) {
    throw new Error('iGO kullanıcı adı/parolası Worker secret değerlerinden forma aktarılamadı.');
  }

  // Live View'da kullanıcı adı açık metin görünmesin. Değer input içinde
  // kaldığı için iGO form gönderimi değişmeden çalışır.
  await page.addStyleTag({
    content: `
      input[name="eMailorUserName"],
      #eMailorUserName_I,
      input[id*="eMailorUserName"] {
        -webkit-text-security: disc !important;
        user-select: none !important;
        caret-color: transparent !important;
      }
    `
  });

  await username.evaluate(element => {
    element.setAttribute('autocomplete', 'off');
    element.setAttribute('aria-label', 'iGO kullanıcı adı gizlendi');
    element.readOnly = true;
  });
}

async function createLiveView(context, page) {
  const cdp = await context.newCDPSession(page);
  const result = await cdp.send('Cloudflare.getLiveView', {
    mode: 'tab',
    expiresInMs: 3_600_000
  });
  await cdp.detach();
  return result.devtoolsFrontendUrl;
}

async function waitForHumanLogin(page, timeoutMs = 480_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.startsWith(IGO_ORIGIN) && !isLoginUrl(url) && url !== 'about:blank') {
      // Login POST'u URL'yi değiştirdikten sonra /Default.aspx yüklenmeye devam
      // edebilir. Yeni navigasyona başlamadan mevcut yönlendirmeyi bitir.
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
      return;
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error('CAPTCHA/giriş için ayrılan 8 dakika doldu. Testi yeniden başlat.');
}

async function saveSessionState(env, context) {
  const storageState = await context.storageState({ indexedDB: true });
  return getSessionStore(env).saveSession(storageState);
}

async function openIgoSession(env, browser, emit) {
  const store = getSessionStore(env);
  const saved = await store.getSession();

  if (saved?.storageState) {
    emit({ type: 'progress', message: 'Kayıtlı iGO oturumu kontrol ediliyor…' });
    const context = await browser.newContext({ storageState: saved.storageState });
    const page = await context.newPage();
    await gotoWithAbortRetry(page, FLIGHT_LIST_URL);

    if (!isLoginUrl(page.url())) {
      emit({ type: 'session', reused: true, message: 'Kayıtlı iGO oturumu kullanıldı; CAPTCHA gerekmedi.' });
      await saveSessionState(env, context);
      return { context, page, reused: true };
    }

    emit({ type: 'progress', message: 'Kayıtlı iGO oturumu sona ermiş; yeniden giriş gerekiyor.' });
    await context.close().catch(() => {});
    await store.clearSession();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  emit({ type: 'progress', message: 'iGO login sayfası açılıyor…' });
  await fillLogin(page, env);

  emit({
    type: 'captcha',
    message: 'Kullanıcı adı ve parola Worker secret değerlerinden dolduruldu. Live View’u aç, yalnız CAPTCHA’yı tamamlayıp giriş düğmesine bas.',
    liveViewUrl: await createLiveView(context, page)
  });

  await waitForHumanLogin(page);
  emit({ type: 'progress', message: 'iGO girişi başarılı; oturum güvenli depoya kaydediliyor…' });

  await gotoWithAbortRetry(page, FLIGHT_LIST_URL);
  if (isLoginUrl(page.url())) throw new Error('iGO oturumu doğrulanamadı.');
  await saveSessionState(env, context);
  emit({ type: 'session', reused: false, message: 'iGO oturumu kaydedildi; sonraki sorgularda CAPTCHA istenmeyecek.' });
  return { context, page, reused: false };
}

async function readGridRows(page) {
  return page.evaluate(() => {
    function cellText(cell) {
      return String(cell?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    return Array.from(document.querySelectorAll('tr[id*="_DXDataRow"]')).map(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      const flightLink = row.querySelector('a[href*="pgWBCalcForm.aspx"]');
      if (!flightLink || cells.length < 6) return null;

      const href = flightLink.getAttribute('href') || '';
      const routeMatch = cellText(cells[3]).match(/\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/i);
      const wbMainId = row.innerHTML.match(/OpenWBPrintPopup\(\s*['"](\d+)['"]\s*\)/i)?.[1] || '';
      const edno = row.innerHTML.match(/Load\s*Sheet\s*\(EDNO:\s*(\d+)\s*\)/i)?.[1] || '';

      return {
        flightDate: cellText(cells[0]),
        tailNumber: cellText(cells[1]),
        flightNumber: cellText(flightLink),
        departurePortCode: routeMatch?.[1] || '',
        arrivalPortCode: routeMatch?.[2] || '',
        scheduledTime: cellText(cells[4]),
        dcsStatus: cellText(cells[5]),
        fnm: href.match(/[?&]FNM=(\d+)/i)?.[1] || '',
        wbMainId,
        loadsheetEdno: edno ? Number.parseInt(edno, 10) : null,
        approvalStatus: cells.map(cellText).find(value => /^Approved$/i.test(value)) || ''
      };
    }).filter(Boolean);
  });
}

async function expandGridToAllRows(page) {
  const initialCount = await page.locator('tr[id*="_DXDataRow"]').count();
  const allRowsButton = page.locator('a[onclick*="PBA"]').first();
  if (await allRowsButton.count() === 0) return { expanded: false, rowCount: initialCount };

  await allRowsButton.click();
  await page.waitForFunction(({ before }) => {
    const grid = globalThis.grd || globalThis.ASPx?.GetControlCollection?.().Get('ctl00_ContentMain_grd');
    const callbackBusy = typeof grid?.InCallback === 'function' && grid.InCallback();
    const rowCount = document.querySelectorAll('tr[id*="_DXDataRow"]').length;
    return !callbackBusy && rowCount > before;
  }, { before: initialCount }, { timeout: 60_000 });

  return {
    expanded: true,
    rowCount: await page.locator('tr[id*="_DXDataRow"]').count()
  };
}

async function fetchLoadSheetTexts(page, rows) {
  const requests = rows.map(row => ({ wbMainId: String(row.wbMainId) }));
  return page.evaluate(async items => {
    const results = new Array(items.length);
    let cursor = 0;

    async function fetchNext() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        const sourceUrl = `/WB/pgWBPrint.aspx?ID=${encodeURIComponent(item.wbMainId)}&MODE=LS`;
        try {
          const response = await fetch(sourceUrl, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'text/html,application/xhtml+xml' }
          });
          const html = await response.text();
          const documentCopy = new DOMParser().parseFromString(html, 'text/html');
          const loadSheetText = documentCopy.querySelector('#LSText')?.textContent?.trim() || '';
          results[index] = {
            wbMainId: item.wbMainId,
            ok: response.ok && Boolean(loadSheetText),
            loginRequired: /\/Account\/pgLogin\.aspx/i.test(response.url) || /id=["']ePassword/i.test(html),
            text: loadSheetText,
            status: response.status
          };
        } catch (error) {
          results[index] = {
            wbMainId: item.wbMainId,
            ok: false,
            loginRequired: false,
            text: '',
            error: String(error?.message || error)
          };
        }
      }
    }

    const concurrency = Math.min(4, Math.max(1, items.length));
    await Promise.all(Array.from({ length: concurrency }, () => fetchNext()));
    return results;
  }, requests);
}

async function searchGrid(page, flight, date) {
  return page.evaluate(async args => {
    function cellText(cell) {
      return String(cell?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function readRows() {
      return Array.from(document.querySelectorAll('tr[id*="_DXDataRow"]')).map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const flightLink = row.querySelector('a[href*="pgWBCalcForm.aspx"]');
        if (!flightLink || cells.length < 6) return null;

        const href = flightLink.getAttribute('href') || '';
        const routeMatch = cellText(cells[3]).match(/\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/i);
        const wbMainId = row.innerHTML.match(/OpenWBPrintPopup\(\s*['"](\d+)['"]\s*\)/i)?.[1] || '';
        const edno = row.innerHTML.match(/Load\s*Sheet\s*\(EDNO:\s*(\d+)\s*\)/i)?.[1] || '';

        return {
          flightDate: cellText(cells[0]),
          tailNumber: cellText(cells[1]),
          flightNumber: cellText(flightLink),
          departurePortCode: routeMatch?.[1] || '',
          arrivalPortCode: routeMatch?.[2] || '',
          scheduledTime: cellText(cells[4]),
          dcsStatus: cellText(cells[5]),
          fnm: href.match(/[?&]FNM=(\d+)/i)?.[1] || '',
          wbMainId,
          loadsheetEdno: edno ? Number.parseInt(edno, 10) : null,
          approvalStatus: cells.map(cellText).find(value => /^Approved$/i.test(value)) || ''
        };
      }).filter(Boolean);
    }

    if (typeof globalThis.txtCarrier?.SetValue !== 'function'
      || typeof globalThis.txtFlightNo?.SetValue !== 'function'
      || typeof globalThis.deFlightDate?.SetDate !== 'function'
      || typeof globalThis.doSearch !== 'function') {
      throw new Error('iGO arama kontrolleri bulunamadı.');
    }

    globalThis.txtCarrier.SetValue(args.carrier);
    globalThis.txtFlightNo.SetValue(args.number);
    globalThis.deFlightDate.SetDate(new Date(args.year, args.month - 1, args.day));
    globalThis.doSearch();

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const filter = cellText(document.getElementById('filterLink'));
      const callbackBusy = typeof globalThis.grd?.InCallback === 'function' && globalThis.grd.InCallback();
      if (filter.includes(args.number) && filter.includes(String(args.day)) && !callbackBusy) {
        return readRows();
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('iGO arama callback’i zaman aşımına uğradı.');
  }, { carrier: flight.carrier, number: flight.number, ...date });
}

async function fetchLoadSheet(context, selected) {
  const url = `${IGO_ORIGIN}/WB/pgWBPrint.aspx?ID=${encodeURIComponent(selected.wbMainId)}&MODE=LS`;
  const page = await context.newPage();
  try {
    await gotoWithAbortRetry(page, url);
    if (isLoginUrl(page.url())) throw new Error('Load Sheet açılırken iGO oturumu sona erdi.');
    const text = await page.locator('#LSText').innerText({ timeout: 30_000 });
    return parseLoadSheet(text, url);
  } finally {
    await page.close().catch(() => {});
  }
}

async function refreshLoadSheetCache(env) {
  if (!env.BROWSER || !env.IGO_SESSION_STORE) return { skipped: true, reason: 'binding-missing' };
  const store = getSessionStore(env);
  const saved = await store.getSession();
  if (!saved?.storageState) return { skipped: true, reason: 'session-missing' };

  let browserHandle;
  try {
    browserHandle = await openQueuedBrowser(env, { waitMs: 0, keepAliveMs: 240_000 });
  } catch (error) {
    return { skipped: true, reason: isBrowserLaunchRateLimit(error) ? 'browser-rate-limit' : 'browser-launch-failed' };
  }
  if (!browserHandle) return { skipped: true, reason: 'browser-busy' };
  const { browser } = browserHandle;
  let context;
  try {
    context = await browser.newContext({ storageState: saved.storageState });
    const page = await context.newPage();
    await gotoWithAbortRetry(page, FLIGHT_LIST_URL);
    if (isLoginUrl(page.url())) {
      await store.clearSession();
      return { skipped: true, reason: 'session-expired' };
    }

    await page.locator('tr[id*="_DXDataRow"]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
    await expandGridToAllRows(page).catch(() => {});
    const rows = await readGridRows(page);
    const candidates = rows.filter(row =>
      row.wbMainId
      && normalizeFlightNumber(row.flightNumber).startsWith('XQ')
      && String(row.departurePortCode || '').toUpperCase() === 'AYT'
      && normalizeDate(row.flightDate)
    );
    const loadSheetTexts = await fetchLoadSheetTexts(page, candidates);
    const textById = new Map(loadSheetTexts.map(item => [String(item.wbMainId), item]));
    let refreshed = 0;
    let waitingForFinal = 0;
    let failed = 0;

    for (const selected of candidates) {
      const flightNumber = normalizeFlightNumber(selected.flightNumber);
      const flightDate = normalizeDate(selected.flightDate);
      try {
        const downloaded = textById.get(String(selected.wbMainId));
        if (downloaded?.loginRequired) {
          await store.clearSession();
          return { skipped: true, reason: 'session-expired', refreshed, waitingForFinal, failed };
        }
        if (!downloaded?.ok || !downloaded.text) {
          failed += 1;
          continue;
        }
        const sourceUrl = `${IGO_ORIGIN}/WB/pgWBPrint.aspx?ID=${encodeURIComponent(selected.wbMainId)}&MODE=LS`;
        const loadSheet = parseLoadSheet(downloaded.text, sourceUrl);
        if (!loadSheet.finalized) waitingForFinal += 1;
        await store.saveLoadSheet({
          status: 'ready',
          query: { flightNumber, flightDate },
          flight: selected,
          loadSheet
        });
        refreshed += 1;
      } catch (error) {
        if (/oturumu sona erdi/i.test(String(error?.message || error))) {
          await store.clearSession();
          return { skipped: true, reason: 'session-expired', refreshed, waitingForFinal, failed };
        }
        failed += 1;
      }
    }

    await saveSessionState(env, context);
    return { skipped: false, found: candidates.length, refreshed, waitingForFinal, failed };
  } finally {
    await context?.close().catch(() => {});
    await closeQueuedBrowser(browserHandle);
  }
}

async function runQuery(env, input, emit) {
  const flight = splitFlightNumber(input.flightNumber);
  const date = splitDate(input.flightDate);
  const cached = await getSessionStore(env).getLoadSheet(flight.normalized, date.normalized);
  if (isFreshLoadSheet(cached)) {
    emit({ type: 'result', data: cachedLoadSheetResult(cached) });
    return;
  }
  const browserHandle = await openQueuedBrowser(env, {
    waitMs: BROWSER_QUERY_WAIT_MS,
    leaseTtlMs: BROWSER_LEASE_TTL_MS,
    keepAliveMs: 600_000
  });
  if (!browserHandle) {
    const error = new Error('Load Sheet servisi şu an yoğun. Kısa süre sonra yeniden dene.');
    error.code = 'BROWSER_BUSY';
    throw error;
  }
  const { browser } = browserHandle;

  try {
    const { context, page, reused } = await openIgoSession(env, browser, emit);
    emit({ type: 'progress', message: 'Uçuş aranıyor…' });

    const rows = await searchGrid(page, flight, date);
    const candidates = rows.filter(row =>
      normalizeFlightNumber(row.flightNumber) === flight.normalized
      && normalizeDate(row.flightDate) === date.normalized
    );

    if (!candidates.length) throw new Error(`${flight.normalized} / ${date.normalized} iGO’da bulunamadı.`);
    if (candidates.length > 1) throw new Error(`Aynı sefer ve tarihte ${candidates.length} uçuş bulundu.`);

    const selected = candidates[0];
    if (!selected.wbMainId) throw new Error('Uçuş bulundu fakat Load Sheet henüz oluşmamış.');

    emit({ type: 'progress', message: `Load Sheet ID ${selected.wbMainId} okunuyor…` });
    const loadSheet = await fetchLoadSheet(context, selected);
    await saveSessionState(env, context);
    const result = {
      status: 'ready',
      igoSessionReused: reused,
      fromCache: false,
      query: { flightNumber: flight.normalized, flightDate: date.normalized },
      flight: selected,
      loadSheet
    };
    await getSessionStore(env).saveLoadSheet(result);
    emit({ type: 'result', data: result });
  } catch (error) {
    if (/oturumu (sona erdi|doğrulanamadı)/i.test(String(error?.message || error))) {
      await getSessionStore(env).clearSession().catch(() => {});
    }
    throw error;
  } finally {
    await closeQueuedBrowser(browserHandle);
  }
}

function queryStream(env, input) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      let closed = false;
      const emit = payload => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      runQuery(env, input, emit)
        .catch(error => emit({ type: 'error', message: error.message || 'Sorgu başarısız.' }))
        .finally(() => {
          closed = true;
          controller.close();
        });
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: API_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/') {
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
        ready: Boolean(
          env.BROWSER && env.IGO_SESSION_STORE && env.IGO_USERNAME && env.IGO_PASSWORD
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

    if (!env.BROWSER || !env.IGO_SESSION_STORE || !env.IGO_USERNAME || !env.IGO_PASSWORD) {
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

    return new Response(queryStream(env, input), {
      headers: {
        ...API_HEADERS,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
      }
    });
  },

  async scheduled(_controller, env, ctx) {
    if (!env.IGO_SESSION_STORE) return;
    const jobs = [];
    if (env.EWS_USERNAME && env.EWS_PASSWORD) {
      jobs.push(refreshMailCache(env, getSessionStore(env)));
    }
    if (env.BROWSER) jobs.push(refreshLoadSheetCache(env));
    if (jobs.length) ctx.waitUntil(Promise.allSettled(jobs));
  }
};
