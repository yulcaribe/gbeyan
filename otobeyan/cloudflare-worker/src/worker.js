// OtoBeyan iGO Browser Run POC
// Bu dosya Cloudflare Workers Builds tarafından package.json ile bundle edilir.
// Browser binding adı: BROWSER
// Cloudflare Git build tetikleyicisi.
// Gerekli Worker Secret'ları: IGO_USERNAME, IGO_PASSWORD, TEST_API_KEY
// CAPTCHA otomatik çözülmez; kullanıcı Live View ekranında kendisi tamamlar.

import { launch } from '@cloudflare/playwright';

const IGO_ORIGIN = 'https://igo.sunexpress.com';
const LOGIN_URL = `${IGO_ORIGIN}/Account/pgLogin.aspx?ReturnUrl=%2fWB%2fpgWBFlightList.aspx`;
const FLIGHT_LIST_URL = `${IGO_ORIGIN}/WB/pgWBFlightList.aspx`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
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

async function runTest(env, input, emit) {
  const flight = splitFlightNumber(input.flightNumber);
  const date = splitDate(input.flightDate);
  const browser = await launch(env.BROWSER, { keep_alive: 600_000 });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    emit({ type: 'progress', message: 'iGO login sayfası açılıyor…' });
    await fillLogin(page, env);

    emit({
      type: 'captcha',
      message: 'Live View’u aç, CAPTCHA’yı tamamla ve iGO giriş düğmesine bas.',
      liveViewUrl: await createLiveView(context, page)
    });

    await waitForHumanLogin(page);
    emit({ type: 'progress', message: 'iGO girişi başarılı. Uçuş aranıyor…' });

    await gotoWithAbortRetry(page, FLIGHT_LIST_URL);
    if (isLoginUrl(page.url())) throw new Error('iGO oturumu doğrulanamadı.');

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
    emit({
      type: 'result',
      data: {
        status: 'ready',
        query: { flightNumber: flight.normalized, flightDate: date.normalized },
        flight: selected,
        loadSheet
      }
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

function testStream(env, input) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      let closed = false;
      const emit = payload => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      runTest(env, input, emit)
        .catch(error => emit({ type: 'error', message: error.message || 'Test başarısız.' }))
        .finally(() => {
          closed = true;
          controller.close();
        });
    }
  });
}

const TEST_PAGE = String.raw`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OtoBeyan iGO Worker Test</title>
  <style>
    body{margin:0;background:#f1f5f9;color:#172554;font:14px/1.45 system-ui,sans-serif}
    main{max-width:680px;margin:40px auto;padding:24px;background:#fff;border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 18px 45px #0f172a18}
    h1{margin:0 0 8px;font-size:22px}.note{color:#64748b;margin-bottom:20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    label{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b}.full{grid-column:1/-1}
    input,button{border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit}button{background:#172554;color:#fff;font-weight:800;cursor:pointer;margin-top:14px;width:100%}button:disabled{opacity:.55}
    #log{margin-top:18px;padding:12px;background:#0f172a;color:#e2e8f0;border-radius:10px;min-height:90px;white-space:pre-wrap;overflow:auto}.live{display:none;margin-top:12px;padding:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px}.live a{font-weight:800;color:#92400e}
    .result{margin-top:12px;padding:12px;background:#dcfce7;border:1px solid #86efac;border-radius:10px;white-space:pre-wrap;display:none}
  </style>
</head>
<body>
  <main>
    <h1>OtoBeyan iGO Worker Test</h1>
    <div class="note">Şifre Worker Secret’tan okunur. CAPTCHA yalnız iGO Live View ekranında kullanıcı tarafından çözülür.</div>
    <div class="grid">
      <label>Sefer<input id="flight" value="XQ254"></label>
      <label>Tarih<input id="date" type="date"></label>
      <label class="full">Test API Anahtarı<input id="key" type="password" autocomplete="off"></label>
    </div>
    <button id="start">Login + Load Sheet Testini Başlat</button>
    <div id="live" class="live"></div>
    <div id="log">Hazır.</div>
    <div id="result" class="result"></div>
  </main>
  <script>
    const log = document.getElementById('log');
    const live = document.getElementById('live');
    const resultBox = document.getElementById('result');
    const start = document.getElementById('start');
    document.getElementById('date').value = new Date().toISOString().slice(0,10);

    function append(text){ log.textContent += '\n' + text; log.scrollTop = log.scrollHeight; }
    function handleEvent(event){
      if(event.type === 'progress') append('• ' + event.message);
      if(event.type === 'captcha'){
        append('• CAPTCHA kullanıcı onayı bekleniyor.');
        live.style.display = 'block';
        live.innerHTML = '<strong>İşlem bekliyor:</strong> <a target="_blank" rel="noopener" href="' + event.liveViewUrl + '">iGO Live View’u Aç</a><br>CAPTCHA’yı çözüp giriş düğmesine bas; bu test ekranını kapatma.';
      }
      if(event.type === 'result'){
        append('✓ Load Sheet başarıyla alındı.');
        resultBox.style.display = 'block';
        resultBox.textContent = JSON.stringify(event.data, null, 2);
      }
      if(event.type === 'error') append('HATA: ' + event.message);
    }

    start.addEventListener('click', async () => {
      start.disabled = true; live.style.display = 'none'; resultBox.style.display = 'none'; log.textContent = 'Test başlatılıyor…';
      try{
        const response = await fetch('/test', {
          method: 'POST',
          headers: {'Content-Type':'application/json','Authorization':'Bearer ' + document.getElementById('key').value},
          body: JSON.stringify({flightNumber:document.getElementById('flight').value,flightDate:document.getElementById('date').value})
        });
        if(!response.ok){ const body = await response.json().catch(() => ({})); throw new Error(body.error || 'HTTP ' + response.status); }
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while(true){
          const chunk = await reader.read(); if(chunk.done) break;
          buffer += decoder.decode(chunk.value, {stream:true});
          const lines = buffer.split('\n'); buffer = lines.pop();
          lines.filter(Boolean).forEach(line => handleEvent(JSON.parse(line)));
        }
      }catch(error){ append('HATA: ' + error.message); }
      finally{ start.disabled = false; }
    });
  </script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(TEST_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        browserBinding: Boolean(env.BROWSER),
        usernameSecret: Boolean(env.IGO_USERNAME),
        passwordSecret: Boolean(env.IGO_PASSWORD),
        apiKeySecret: Boolean(env.TEST_API_KEY)
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/test') {
      return json({ ok: false, error: 'Endpoint bulunamadı.' }, 404);
    }

    if (!env.BROWSER) return json({ ok: false, error: 'BROWSER binding tanımlı değil.' }, 503);
    if (!env.IGO_USERNAME || !env.IGO_PASSWORD || !env.TEST_API_KEY) {
      return json({ ok: false, error: 'IGO_USERNAME, IGO_PASSWORD veya TEST_API_KEY secret eksik.' }, 503);
    }
    if (request.headers.get('Authorization') !== `Bearer ${env.TEST_API_KEY}`) {
      return json({ ok: false, error: 'Test API anahtarı geçersiz.' }, 401);
    }

    let input;
    try {
      input = await request.json();
      splitFlightNumber(input.flightNumber);
      splitDate(input.flightDate);
    } catch (error) {
      return json({ ok: false, error: error.message || 'İstek geçersiz.' }, 400);
    }

    return new Response(testStream(env, input), {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
};
