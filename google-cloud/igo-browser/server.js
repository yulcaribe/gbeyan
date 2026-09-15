import express from 'express';
import crypto from 'crypto';
import { chromium } from 'playwright';

const app = express();
app.disable('x-powered-by');
const jsonBody = express.json({ limit: '2mb' });

const PORT = process.env.PORT || 8080;
const IGO_ORIGIN = 'https://igo.sunexpress.com';
const LOGIN_URL = `${IGO_ORIGIN}/Account/pgLogin.aspx?ReturnUrl=%2fWB%2fpgWBFlightList.aspx`;
const FLIGHT_LIST_URL = `${IGO_ORIGIN}/WB/pgWBFlightList.aspx`;
const LOGIN_SESSION_TTL_MS = 8 * 60 * 1000;
const LOGIN_VIEWPORT = { width: 1280, height: 900 };
const loginSessions = new Map();

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireSharedSecret(req, res, next) {
  const secret = process.env.CLOUDFLARE_SHARED_SECRET;
  const auth = req.get('authorization') || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!secret) return res.status(503).json({ ok: false, error: 'Servis hazır değil.' });
  if (!safeEqual(supplied, secret)) return res.status(401).json({ ok: false, error: 'Yetkisiz.' });
  next();
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

function isLoginUrl(value) {
  return /\/Account\/pgLogin\.aspx/i.test(String(value || ''));
}

function publicError(error) {
  let message = String(error?.message || error || 'Load Sheet sorgusu başarısız.');
  for (const secret of [error?.username, error?.password]) {
    if (secret) message = message.replaceAll(String(secret), '');
  }
  return message;
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
      if (!/net::ERR_ABORTED/i.test(String(error?.message || error)) || attempt === 3) throw error;
      await page.waitForTimeout(attempt * 1_000);
    }
  }
  throw lastError;
}

async function fillAndSubmitLogin(page, credentials) {
  const username = String(credentials?.username || '');
  const password = String(credentials?.password || '');
  if (!username || !password) {
    const error = new Error('iGO oturumu sona erdi; yeniden giriş bilgisi gerekiyor.');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }

  await gotoWithAbortRetry(page, LOGIN_URL);
  const usernameInput = page.locator(
    'input[name="eMailorUserName"], #eMailorUserName_I, input[id*="eMailorUserName"][type="text"]'
  ).first();
  const passwordInput = page.locator(
    'input[name="ePassword"], #ePassword_I, input[id*="ePassword"][type="password"]'
  ).first();
  await usernameInput.waitFor({ state: 'visible', timeout: 30_000 });
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await page.evaluate(({ usernameValue, passwordValue }) => {
    if (typeof globalThis.eMailorUserName?.SetValue === 'function') {
      globalThis.eMailorUserName.SetValue(usernameValue);
    }
    if (typeof globalThis.ePassword?.SetValue === 'function') {
      globalThis.ePassword.SetValue(passwordValue);
    }
  }, { usernameValue: username, passwordValue: password });
  await usernameInput.dispatchEvent('input');
  await usernameInput.dispatchEvent('change');
  await passwordInput.dispatchEvent('input');
  await passwordInput.dispatchEvent('change');
  await passwordInput.press('Tab');

  if ((await usernameInput.inputValue()) !== username || (await passwordInput.inputValue()) !== password) {
    throw new Error('iGO giriş bilgileri forma doğru aktarılamadı.');
  }

  const submitCandidates = [
    'button[type="submit"]',
    'input[type="submit"]',
    '[id*="btnLogin"]',
    '[name*="btnLogin"]',
    'button:has-text("Login")',
    'button:has-text("Giriş")',
    'a:has-text("Login")',
    'a:has-text("Giriş")'
  ];
  let submit = null;
  for (const selector of submitCandidates) {
    const candidate = page.locator(selector).first();
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
      submit = candidate;
      break;
    }
  }
  if (!submit) throw new Error('iGO giriş düğmesi bulunamadı.');

  await submit.click();
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  if (isLoginUrl(page.url())) {
    const error = new Error('iGO CAPTCHA veya giriş onayı gerekiyor.');
    error.code = 'CAPTCHA_REQUIRED';
    throw error;
  }
}

async function fillLoginForApproval(page, credentials) {
  const username = String(credentials?.username || '');
  const password = String(credentials?.password || '');
  if (!username || !password) {
    const error = new Error('iGO giriş bilgileri eksik.');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }

  await gotoWithAbortRetry(page, LOGIN_URL);
  const usernameInput = page.locator(
    'input[name="eMailorUserName"], #eMailorUserName_I, input[id*="eMailorUserName"][type="text"]'
  ).first();
  const passwordInput = page.locator(
    'input[name="ePassword"], #ePassword_I, input[id*="ePassword"][type="password"]'
  ).first();
  await usernameInput.waitFor({ state: 'visible', timeout: 30_000 });
  await usernameInput.fill(username);
  await passwordInput.fill(password);

  // Kullanıcı adı DOM'da form gönderimi için kalır fakat uzaktan gösterilen
  // görüntüde okunamaz ve kullanıcı tarafından seçilip kopyalanamaz.
  await page.addStyleTag({
    content: `
      input[name="eMailorUserName"],
      #eMailorUserName_I,
      input[id*="eMailorUserName"] {
        color: transparent !important;
        text-shadow: none !important;
        -webkit-text-security: disc !important;
        font-size: 0 !important;
        user-select: none !important;
        caret-color: transparent !important;
      }
    `
  });
  await usernameInput.evaluate(element => {
    element.readOnly = true;
    element.setAttribute('autocomplete', 'off');
    element.setAttribute('aria-label', 'Kullanıcı adı gizlendi');
  });
}

async function closeLoginSession(sessionId) {
  const session = loginSessions.get(sessionId);
  if (!session) return;
  loginSessions.delete(sessionId);
  await session.context?.close().catch(() => {});
  await session.browser?.close().catch(() => {});
}

async function cleanupLoginSessions() {
  const now = Date.now();
  const expired = Array.from(loginSessions.entries())
    .filter(([, session]) => Number(session.expiresAt || 0) <= now)
    .map(([sessionId]) => sessionId);
  await Promise.allSettled(expired.map(closeLoginSession));
}

function getLoginSession(sessionId) {
  const session = loginSessions.get(String(sessionId || ''));
  if (!session || Number(session.expiresAt || 0) <= Date.now()) {
    const error = new Error('iGO onay oturumu bulunamadı veya süresi doldu.');
    error.code = 'LOGIN_SESSION_EXPIRED';
    throw error;
  }
  session.expiresAt = Date.now() + LOGIN_SESSION_TTL_MS;
  return session;
}

async function loginSessionView(sessionId, session) {
  const currentUrl = session.page.url();
  if (currentUrl.startsWith(IGO_ORIGIN) && !isLoginUrl(currentUrl) && currentUrl !== 'about:blank') {
    await session.page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
    await gotoWithAbortRetry(session.page, FLIGHT_LIST_URL);
    if (!isLoginUrl(session.page.url())) {
      const storageState = await session.context.storageState({ indexedDB: true });
      await closeLoginSession(sessionId);
      return { ok: true, complete: true, storageState };
    }
  }

  const image = await session.page.screenshot({ type: 'jpeg', quality: 72 });
  return {
    ok: true,
    complete: false,
    sessionId,
    expiresAt: new Date(session.expiresAt).toISOString(),
    viewport: LOGIN_VIEWPORT,
    frame: `data:image/jpeg;base64,${image.toString('base64')}`
  };
}

async function openIgoSession(browser, storageState, credentials) {
  let context = await browser.newContext(storageState ? { storageState } : {});
  let page = await context.newPage();
  await gotoWithAbortRetry(page, FLIGHT_LIST_URL);

  if (!isLoginUrl(page.url())) return { context, page, reused: Boolean(storageState) };

  await context.close().catch(() => {});
  context = await browser.newContext();
  page = await context.newPage();
  try {
    await fillAndSubmitLogin(page, credentials);
    await gotoWithAbortRetry(page, FLIGHT_LIST_URL);
    if (isLoginUrl(page.url())) throw new Error('iGO oturumu doğrulanamadı.');
    return { context, page, reused: false };
  } catch (error) {
    error.username = String(credentials?.username || '');
    error.password = String(credentials?.password || '');
    await context.close().catch(() => {});
    throw error;
  }
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
      if (filter.includes(args.number) && filter.includes(String(args.day)) && !callbackBusy) return readRows();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('iGO arama callback’i zaman aşımına uğradı.');
  }, { carrier: flight.carrier, number: flight.number, ...date });
}

async function fetchLoadSheet(context, selected) {
  const sourceUrl = `${IGO_ORIGIN}/WB/pgWBPrint.aspx?ID=${encodeURIComponent(selected.wbMainId)}&MODE=LS`;
  const page = await context.newPage();
  try {
    await gotoWithAbortRetry(page, sourceUrl);
    if (isLoginUrl(page.url())) throw new Error('Load Sheet açılırken iGO oturumu sona erdi.');
    const text = await page.locator('#LSText').innerText({ timeout: 30_000 });
    return { text, sourceUrl };
  } finally {
    await page.close().catch(() => {});
  }
}

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true });
});

app.post('/browser-test', requireSharedSecret, jsonBody, async (_req, res) => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    res.json({ ok: true, title: await page.title() });
  } catch (error) {
    res.status(500).json({ ok: false, error: publicError(error) });
  } finally {
    await browser?.close().catch(() => {});
  }
});

app.post('/session/start', requireSharedSecret, jsonBody, async (req, res) => {
  let browser;
  let context;
  try {
    await cleanupLoginSessions();
    await Promise.allSettled(Array.from(loginSessions.keys()).map(closeLoginSession));
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox']
    });
    context = await browser.newContext({ viewport: LOGIN_VIEWPORT });
    const page = await context.newPage();
    await fillLoginForApproval(page, req.body?.credentials || null);

    const sessionId = crypto.randomUUID();
    const session = {
      browser,
      context,
      page,
      expiresAt: Date.now() + LOGIN_SESSION_TTL_MS
    };
    loginSessions.set(sessionId, session);
    browser = null;
    context = null;
    return res.json(await loginSessionView(sessionId, session));
  } catch (error) {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    return res.status(500).json({ ok: false, code: error?.code || 'LOGIN_SESSION_FAILED', error: publicError(error) });
  }
});

app.post('/session/action', requireSharedSecret, jsonBody, async (req, res) => {
  try {
    await cleanupLoginSessions();
    const sessionId = String(req.body?.sessionId || '');
    const session = getLoginSession(sessionId);
    const action = req.body?.action || {};

    if (action.type === 'click') {
      const x = Math.max(0, Math.min(LOGIN_VIEWPORT.width, Number(action.x) || 0));
      const y = Math.max(0, Math.min(LOGIN_VIEWPORT.height, Number(action.y) || 0));
      await session.page.mouse.click(x, y);
    } else if (action.type === 'password') {
      const passwordValue = String(action.value || '').slice(0, 256);
      if (!passwordValue) {
        return res.status(400).json({ ok: false, code: 'PASSWORD_REQUIRED', error: 'Parola boş olamaz.' });
      }
      const passwordInput = session.page.locator(
        'input[name="ePassword"], #ePassword_I, input[id*="ePassword"][type="password"]'
      ).first();
      await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
      await passwordInput.fill(passwordValue);
      await session.page.evaluate(value => {
        if (typeof globalThis.ePassword?.SetValue === 'function') globalThis.ePassword.SetValue(value);
      }, passwordValue);
      await passwordInput.dispatchEvent('input');
      await passwordInput.dispatchEvent('change');
      await passwordInput.press('Tab');
    } else if (action.type === 'wheel') {
      const deltaY = Math.max(-1200, Math.min(1200, Number(action.deltaY) || 0));
      await session.page.mouse.wheel(0, deltaY);
    } else if (action.type === 'enter') {
      await session.page.keyboard.press('Enter');
    } else if (action.type !== 'refresh') {
      return res.status(400).json({ ok: false, code: 'INVALID_ACTION', error: 'Geçersiz onay işlemi.' });
    }

    await session.page.waitForTimeout(1_200);
    return res.json(await loginSessionView(sessionId, session));
  } catch (error) {
    const status = error?.code === 'LOGIN_SESSION_EXPIRED' ? 410 : 500;
    return res.status(status).json({ ok: false, code: error?.code || 'LOGIN_SESSION_FAILED', error: publicError(error) });
  }
});

app.post('/session/cancel', requireSharedSecret, jsonBody, async (req, res) => {
  await closeLoginSession(String(req.body?.sessionId || ''));
  return res.json({ ok: true, cancelled: true });
});

app.post('/query', requireSharedSecret, jsonBody, async (req, res) => {
  let browser;
  let context;
  try {
    const flight = splitFlightNumber(req.body?.flightNumber);
    const date = splitDate(req.body?.flightDate);
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox']
    });
    const opened = await openIgoSession(browser, req.body?.storageState || null, req.body?.credentials || null);
    context = opened.context;
    const rows = await searchGrid(opened.page, flight, date);
    const candidates = rows.filter(row =>
      normalizeFlightNumber(row.flightNumber) === flight.normalized
      && normalizeDate(row.flightDate) === date.normalized
    );
    if (!candidates.length) throw new Error(`${flight.normalized} / ${date.normalized} iGO’da bulunamadı.`);
    if (candidates.length > 1) throw new Error(`Aynı sefer ve tarihte ${candidates.length} uçuş bulundu.`);

    const selected = candidates[0];
    if (!selected.wbMainId) throw new Error('Uçuş bulundu fakat Load Sheet henüz oluşmamış.');
    const loadSheet = await fetchLoadSheet(context, selected);
    const nextStorageState = await context.storageState({ indexedDB: true });
    return res.json({
      ok: true,
      sessionReused: opened.reused,
      query: { flightNumber: flight.normalized, flightDate: date.normalized },
      flight: selected,
      loadSheetText: loadSheet.text,
      sourceUrl: loadSheet.sourceUrl,
      storageState: nextStorageState
    });
  } catch (error) {
    const code = String(error?.code || 'QUERY_FAILED');
    const status = code === 'LOGIN_REQUIRED' || code === 'CAPTCHA_REQUIRED' ? 409 : 500;
    return res.status(status).json({ ok: false, code, error: publicError(error) });
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: 'Bulunamadı.' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`OtoBeyan Browser listening on ${PORT}`);
});
