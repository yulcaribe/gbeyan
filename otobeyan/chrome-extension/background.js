'use strict';

const IGO_ORIGIN = 'https://igo.sunexpress.com';
const FLIGHT_LIST_URL = `${IGO_ORIGIN}/WB/pgWBFlightList.aspx`;
const LOGIN_URL = `${IGO_ORIGIN}/Account/pgLogin.aspx?ReturnUrl=%2fWB%2fpgWBFlightList.aspx`;

class BridgeError extends Error {
  constructor(message, code = 'IGO_BRIDGE_ERROR') {
    super(message);
    this.code = code;
  }
}

function normalizeFlightNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

function splitFlightNumber(value) {
  const normalized = normalizeFlightNumber(value);
  const match = normalized.match(/^([A-Z]{2,3})(\d{1,5}[A-Z]?)$/);
  if (!match) throw new BridgeError('Sefer numarası XQ254 biçiminde olmalı.', 'INVALID_FLIGHT_NUMBER');
  return { normalized, carrier: match[1], number: match[2] };
}

function parseIsoDate(value) {
  const normalized = normalizeDate(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new BridgeError('Uçuş tarihi YYYY-MM-DD biçiminde olmalı.', 'INVALID_FLIGHT_DATE');
  return {
    normalized,
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10)
  };
}

function isLoginUrl(url) {
  return /\/Account\/pgLogin\.aspx/i.test(String(url || ''));
}

async function findIgoTabs() {
  return chrome.tabs.query({ url: `${IGO_ORIGIN}/*` });
}

async function getIgoStatus() {
  const tabs = await findIgoTabs();
  const tab = tabs.find(item => !isLoginUrl(item.url)) || tabs[0];
  return {
    installed: true,
    tabOpen: Boolean(tab),
    authenticated: Boolean(tab && !isLoginUrl(tab.url)),
    page: tab ? (isLoginUrl(tab.url) ? 'login' : 'igo') : 'closed'
  };
}

async function openLogin() {
  const tabs = await findIgoTabs();
  let tab = tabs[0];
  if (tab) tab = await chrome.tabs.update(tab.id, { url: FLIGHT_LIST_URL, active: true });
  else tab = await chrome.tabs.create({ url: FLIGHT_LIST_URL, active: true });
  await waitForTabComplete(tab.id);
  tab = await chrome.tabs.get(tab.id);
  return {
    installed: true,
    tabOpen: true,
    authenticated: !isLoginUrl(tab.url),
    page: isLoginUrl(tab.url) ? 'login' : 'igo'
  };
}

function waitForTabComplete(tabId, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      cleanup();
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    timeout = setTimeout(() => {
      cleanup();
      reject(new BridgeError('iGO sekmesinin yüklenmesi zaman aşımına uğradı.', 'IGO_TIMEOUT'));
    }, timeoutMs);
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        cleanup();
        resolve();
      }
    }).catch(error => {
      cleanup();
      reject(error);
    });
  });
}

async function ensureFlightListTab() {
  const tabs = await findIgoTabs();
  let tab = tabs.find(item => !isLoginUrl(item.url)) || tabs[0];
  let temporary = false;
  if (!tab) {
    tab = await chrome.tabs.create({ url: FLIGHT_LIST_URL, active: false });
    temporary = true;
    await waitForTabComplete(tab.id);
    tab = await chrome.tabs.get(tab.id);
    if (isLoginUrl(tab.url)) {
      await chrome.tabs.update(tab.id, { active: true });
      throw new BridgeError('iGO oturumu sona ermiş. Açılan sekmede yeniden giriş yap.', 'IGO_LOGIN_REQUIRED');
    }
  }
  if (isLoginUrl(tab.url)) {
    await chrome.tabs.update(tab.id, { active: true });
    throw new BridgeError('iGO girişi gerekli. Açık sekmede giriş yap.', 'IGO_LOGIN_REQUIRED');
  }

  tab = await chrome.tabs.update(tab.id, { url: FLIGHT_LIST_URL, active: false });
  await waitForTabComplete(tab.id);
  tab = await chrome.tabs.get(tab.id);
  if (isLoginUrl(tab.url)) {
    await chrome.tabs.update(tab.id, { active: true });
    throw new BridgeError('iGO oturumu sona ermiş. Yeniden giriş yap.', 'IGO_LOGIN_REQUIRED');
  }
  return { tab, temporary };
}

function searchGridInPage(args) {
  function cellText(cell) {
    return String(cell?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function readGrid() {
    const rows = Array.from(document.querySelectorAll('tr[id*="_DXDataRow"]')).map(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      const flightLink = row.querySelector('a[href*="pgWBCalcForm.aspx"]');
      if (!flightLink || cells.length < 6) return null;
      const href = flightLink.getAttribute('href') || '';
      const routeMatch = cellText(cells[3]).match(/\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/i);
      const loadsheetId = row.innerHTML.match(/OpenWBPrintPopup\(\s*['"](\d+)['"]\s*\)/i)?.[1] || '';
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
        wbMainId: loadsheetId,
        loadsheetEdno: edno ? Number.parseInt(edno, 10) : null,
        loadsheetAvailable: Boolean(loadsheetId),
        approvalStatus: cells.map(cellText).find(value => /^Approved$/i.test(value)) || ''
      };
    }).filter(Boolean);
    const summary = cellText(document.querySelector('[id$="_DXPagerBottom"] .dxp-summary'));
    return { rows, summary, filter: cellText(document.getElementById('filterLink')) };
  }

  return new Promise((resolve, reject) => {
    if (typeof globalThis.txtCarrier?.SetValue !== 'function'
      || typeof globalThis.txtFlightNo?.SetValue !== 'function'
      || typeof globalThis.deFlightDate?.SetDate !== 'function'
      || typeof globalThis.doSearch !== 'function') {
      reject(new Error('iGO arama kontrolleri bulunamadı.'));
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      const result = readGrid();
      const filterReady = result.filter.includes(args.number) && result.filter.includes(String(args.day));
      const callbackBusy = typeof globalThis.grd?.InCallback === 'function' && globalThis.grd.InCallback();
      if (!filterReady || callbackBusy) return;
      finished = true;
      clearInterval(poll);
      clearTimeout(timeout);
      resolve(result);
    };

    globalThis.txtCarrier.SetValue(args.carrier);
    globalThis.txtFlightNo.SetValue(args.number);
    globalThis.deFlightDate.SetDate(new Date(args.year, args.month - 1, args.day));

    const poll = setInterval(finish, 200);
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      reject(new Error('iGO arama callback’i zaman aşımına uğradı.'));
    }, 45_000);
    globalThis.doSearch();
  });
}

async function executeSearch(tabId, flight, date) {
  const execution = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: searchGridInPage,
    args: [{ carrier: flight.carrier, number: flight.number, ...date }]
  });
  return execution[0]?.result || { rows: [], summary: '', filter: '' };
}

async function readLoadSheet(wbMainId) {
  const url = `${IGO_ORIGIN}/WB/pgWBPrint.aspx?ID=${encodeURIComponent(wbMainId)}&MODE=LS`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const html = await response.text();
    if (isLoginUrl(response.url) || /\bid=["'](?:eMailorUserName|ePassword)["']/i.test(html)) {
      const tabs = await findIgoTabs();
      if (tabs[0]) await chrome.tabs.update(tabs[0].id, { active: true });
      else await chrome.tabs.create({ url: LOGIN_URL, active: true });
      throw new BridgeError('iGO oturumu sona ermiş. Yeniden giriş yap.', 'IGO_LOGIN_REQUIRED');
    }
    if (!response.ok) {
      throw new BridgeError(`Load Sheet alınamadı: HTTP ${response.status}`, 'LOADSHEET_HTTP_ERROR');
    }

    const preMatch = html.match(/<pre\b[^>]*\bid=["']LSText["'][^>]*>([\s\S]*?)<\/pre>/i);
    const text = preMatch
      ? preMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/&#(?:39|x27);/gi, "'")
          .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
          .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
      : '';
    return { url, text };
  } catch (error) {
    if (error.name === 'AbortError') throw new BridgeError('Load Sheet isteği zaman aşımına uğradı.', 'IGO_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function makeField(value, source, evidence, confidence, validation = 'valid') {
  return { value, source, evidence: evidence || '', confidence, validation };
}

function parseLoadSheet(text, url) {
  const source = 'igo_loadsheet';
  if (!/L\s*O\s*A\s*D\s*S\s*H\s*E\s*E\s*T/i.test(text)) {
    throw new BridgeError('iGO Load Sheet metni bulunamadı.', 'LOADSHEET_PARSE_FAILED');
  }

  const header = text.match(/\b([A-Z]{3})\s*\/\s*([A-Z]{3})\s+(XQ)\s*(\d{1,5}[A-Z]?)\s+(TC[- ]?[A-Z0-9]{3})\s+(\S+)\s+(\d+)\s*\/\s*(\d+)/i);
  const date = text.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
  const passengers = text.match(/\bY\s+(\d+)\s*\+\s*(\d+)\b/i);
  const ttl = text.match(/\bTTL\s+(\d+)/i);
  const takeOff = text.match(/TAKE\s*OFF\s*FUEL\s+(\d+)/i);
  const taxi = text.match(/Taxi\s*Fuel\s*:\s*(\d+)/i);
  const offBlock = text.match(/OffBlock\s*Fuel\s*:\s*(\d+)/i);
  const edno = text.match(/\bEDNO\s*:\s*(\d+)/i);
  const wbMainId = url.match(/[?&]ID=(\d+)/i);
  const number = match => match ? Number.parseInt(match[1], 10) : null;
  const pax = passengers ? Number.parseInt(passengers[1], 10) : null;
  const infant = passengers ? Number.parseInt(passengers[2], 10) : null;
  const total = number(ttl);
  const takeOffFuel = number(takeOff);
  const taxiFuel = number(taxi);
  const offBlockFuel = number(offBlock);
  const finalized = /\(\s*Digitally\s+Signed\s*\)/i.test(text);
  const validations = [];
  if (pax !== null && infant !== null && total !== null) {
    validations.push({ code: 'passenger_total', status: pax + infant === total ? 'passed' : 'failed', message: `${pax} PAX + ${infant} INFANT = ${total} TTL` });
  }
  if (takeOffFuel !== null && taxiFuel !== null && offBlockFuel !== null) {
    validations.push({ code: 'fuel_balance', status: takeOffFuel + taxiFuel === offBlockFuel ? 'passed' : 'failed', message: `${takeOffFuel} Take-off + ${taxiFuel} Taxi = ${offBlockFuel} Off-block` });
  }
  const warnings = [];
  if (!finalized) warnings.push('Uçuş finalize edilmemiştir. Load Sheet verilerini kontrol ederek onaylayın.');
  if (validations.some(item => item.status === 'failed')) warnings.push('Load Sheet doğrulamalarından biri başarısız.');

  const headerEvidence = header?.[0] || '';
  return {
    matched: true,
    source,
    finalized,
    approved: /\bAPPROVED\s*:\s*\S+/i.test(text),
    warnings,
    validations,
    fields: {
      wbMainId: makeField(number(wbMainId), `${source}.url`, url, wbMainId ? 1 : 0, wbMainId ? 'valid' : 'missing'),
      edno: makeField(number(edno), `${source}.edno`, edno?.[0], edno ? 1 : 0, edno ? 'valid' : 'missing'),
      flightDate: makeField(date ? `${date[3]}-${date[2]}-${date[1]}` : '', `${source}.date`, date?.[0], date ? 0.95 : 0, date ? 'valid' : 'missing'),
      flightNumber: makeField(header ? `${header[3]}${header[4]}` : '', `${source}.flight`, headerEvidence, header ? 0.99 : 0, header ? 'valid' : 'missing'),
      tailNumber: makeField(header ? header[5].replace(/[^A-Z0-9]/gi, '').replace(/^TC/i, 'TC-').toUpperCase() : '', `${source}.tail`, headerEvidence, header ? 0.99 : 0, header ? 'valid' : 'missing'),
      departurePortCode: makeField(header?.[1] || '', `${source}.route`, headerEvidence, header ? 0.99 : 0, header ? 'valid' : 'missing'),
      arrivalPortCode: makeField(header?.[2] || '', `${source}.route`, headerEvidence, header ? 0.99 : 0, header ? 'valid' : 'missing'),
      pax: makeField(pax, `${source}.passengers`, passengers?.[0], passengers ? 0.99 : 0, passengers ? 'valid' : 'missing'),
      infant: makeField(infant, `${source}.passengers`, passengers?.[0], passengers ? 0.99 : 0, passengers ? 'valid' : 'missing'),
      passengerTotal: makeField(total, `${source}.passenger_total`, ttl?.[0], ttl ? 0.99 : 0, ttl ? 'valid' : 'missing'),
      offBlockFuelKg: makeField(offBlockFuel, `${source}.offblock_fuel`, offBlock?.[0], offBlock ? 0.99 : 0, offBlock ? 'valid' : 'missing'),
      taxiFuelKg: makeField(taxiFuel, `${source}.taxi_fuel`, taxi?.[0], taxi ? 0.98 : 0, taxi ? 'valid' : 'missing'),
      takeOffFuelKg: makeField(takeOffFuel, `${source}.takeoff_fuel`, takeOff?.[0], takeOff ? 0.98 : 0, takeOff ? 'valid' : 'missing'),
      cockpitCrew: makeField(header ? Number.parseInt(header[7], 10) : null, `${source}.crew_crosscheck`, headerEvidence, header ? 0.95 : 0, header ? 'crosscheck_only' : 'missing'),
      cabinCrew: makeField(header ? Number.parseInt(header[8], 10) : null, `${source}.crew_crosscheck`, headerEvidence, header ? 0.95 : 0, header ? 'crosscheck_only' : 'missing')
    }
  };
}

async function searchFlight(payload) {
  const flight = splitFlightNumber(payload.flightNumber);
  const date = parseIsoDate(payload.flightDate);
  const { tab, temporary } = await ensureFlightListTab();
  try {
    const grid = await executeSearch(tab.id, flight, date);
    const rows = (grid.rows || []).map(row => ({
      ...row,
      flightDate: normalizeDate(row.flightDate),
      flightNumber: normalizeFlightNumber(row.flightNumber),
      tailNumber: String(row.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^TC/, 'TC-')
    }));
    const candidates = rows.filter(row => row.flightNumber === flight.normalized && row.flightDate === date.normalized);
    if (!candidates.length) throw new BridgeError(`${flight.normalized} / ${date.normalized} iGO’da bulunamadı.`, 'IGO_FLIGHT_NOT_FOUND');
    if (candidates.length > 1) throw new BridgeError(`${flight.normalized} için aynı tarihte ${candidates.length} aday bulundu.`, 'IGO_FLIGHT_AMBIGUOUS');
    const selected = candidates[0];
    if (!selected.wbMainId) {
      return { status: 'loadsheet_unavailable', flight: selected, warnings: ['Uçuş bulundu fakat güncel Load Sheet bağlantısı henüz oluşmamış.'] };
    }
    const loadSheetSource = await readLoadSheet(selected.wbMainId);
    return {
      status: 'ready',
      query: { flightNumber: flight.normalized, flightDate: date.normalized },
      flight: selected,
      loadSheet: parseLoadSheet(loadSheetSource.text, loadSheetSource.url)
    };
  } finally {
    if (temporary) {
      const current = await chrome.tabs.get(tab.id).catch(() => null);
      if (current && !current.active) await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    if (message?.type === 'STATUS') return getIgoStatus();
    if (message?.type === 'OPEN_LOGIN') return openLogin();
    if (message?.type === 'SEARCH_FLIGHT') return searchFlight(message.payload || {});
    throw new BridgeError('Bilinmeyen OtoBeyan mesajı.');
  };
  run()
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, error: error.message || 'Eklenti hatası.', code: error.code || 'IGO_BRIDGE_ERROR' }));
  return true;
});
