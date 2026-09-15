import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createBackend } from './server.mjs';
import { MailStore } from './mail-store.mjs';

const env = { TEST_API_KEY: 'test-key', EWS_USERNAME: 'test-user', EWS_PASSWORD: 'test-password',
  RENDER_EXTERNAL_URL: 'https://test-api.onrender.com' };
const auth = { Authorization: 'Bearer test-key', Origin: 'null' };

async function start(t, settings = env, store = new MailStore()) {
  const server = createBackend(settings, store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (path, headers = auth, method = 'GET', body) => new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: server.address().port,
      path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks), json() { return JSON.parse(this.body); } }));
    });
    request.on('error', reject); request.end(body);
  });
}

function element(page, token, children = []) {
  return [0, page, token | 64, ...children.flat(Infinity), 1];
}
function text(value) { return [3, ...Buffer.from(value), 0]; }
function wbxml(root) { return new Uint8Array([3, 1, 106, 0, ...root]); }
function exchangeResponse(root) {
  return new Response(wbxml(root), { headers: { 'Content-Type': 'application/vnd.ms-sync.wbxml' } });
}
function fakeExchange(t, { failFirst = false, pause = null } = {}) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'posta.tgs.aero');
    assert.match(options.headers.Authorization, /^Basic /);
    const cmd = new URL(url).searchParams.get('Cmd'); calls.push(cmd);
    if (failFirst && calls.length === 1) throw new Error('Test Exchange unavailable');
    if (cmd === 'FolderSync') {
      // Yield once so simultaneous HTTP requests meet an active refresh.
      await new Promise(resolve => setImmediate(resolve));
      if (pause) await pause();
      return exchangeResponse(element(7, 22, [element(7, 12, text('1')), element(7, 14, [
        element(7, 15, [element(7, 8, text('sxs')), element(7, 9, text('0')), element(7, 7, text('SXS'))]),
        element(7, 15, [element(7, 8, text('gendec')), element(7, 9, text('sxs')), element(7, 7, text('GenDec'))])
      ])]));
    }
    if (cmd === 'Sync') {
      const changes = Buffer.from(options.body).includes(Buffer.from([0, 0, 19 | 64]));
      const message = element(0, 7, [element(0, 13, text('message-1')), element(0, 29, [
        element(2, 20, text('XQ154 GenDec')), element(2, 24, text('crew@example.test')),
        element(2, 15, text(new Date().toISOString())),
        element(17, 14, element(17, 15, [element(17, 16, text('XQ154.pdf')),
          element(17, 17, text('file-1')), element(2, 8, text('15'))]))
      ])]);
      return exchangeResponse(element(0, 5, element(0, 28, element(0, 15, [
        element(0, 14, text('1')), element(0, 11, text('sync-1')),
        ...(changes ? [element(0, 22, message)] : [])
      ]))));
    }
    if (cmd === 'ItemOperations') {
      return exchangeResponse(element(20, 5, [element(20, 13, text('1')),
        element(20, 14, element(20, 6, [element(20, 13, text('1')),
          element(20, 11, element(20, 12, text(Buffer.from('%PDF-1.4 test').toString('base64'))))]))]));
    }
    throw new Error('Unexpected Exchange command: ' + cmd);
  };
  return calls;
}

test('health, key checks, local/hosted CORS, preflight and rate limit', async t => {
  const request = await start(t);
  assert.equal((await request('/healthz', {})).status, 200);
  assert.equal((await request('/api/auth/verify', {})).status, 401);
  const local = await request('/api/auth/verify');
  assert.equal(local.json().ready, true);
  assert.equal(local.headers['access-control-allow-origin'], 'null');
  const hosted = await request('/api/auth/verify', { ...auth, Origin: 'https://gbeyan.onrender.com' });
  assert.equal(hosted.headers['access-control-allow-origin'], 'https://gbeyan.onrender.com');
  const preflight = await request('/api/mail/messages', { Origin: 'null',
    'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }, 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
  const blocked = await request('/api/auth/verify', { ...auth, Origin: 'https://untrusted.example' });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
  let last;
  for (let i = 0; i < 12; i++) last = await request('/api/auth/verify', { Authorization: 'Bearer wrong' });
  assert.equal(last.status, 429);
  assert.equal((await request('/api/auth/verify')).status, 200);
  assert.equal((await request('/render/mail.mjs')).status, 404);
  const page = await request('/', {});
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /connect-src 'self'/);
});

test('simultaneous first requests scan once; expiry refreshes; attachment headers survive', async t => {
  const calls = fakeExchange(t);
  const store = new MailStore(); const request = await start(t, env, store);
  const responses = await Promise.all(Array.from({ length: 10 }, () => request('/api/mail/messages?hours=6')));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.json().gendecMessages[0].attachments[0].name, 'XQ154.pdf');
    assert.equal(response.json().lookbackHours, 6);
  }
  assert.deepEqual(calls, ['FolderSync', 'Sync', 'Sync']);
  assert.equal((await request('/api/mail/messages')).json().fromCache, true);
  assert.equal(calls.length, 3);
  const attachment = await request('/api/mail/flight-attachment?flightNo=XQ154');
  assert.equal(attachment.status, 200);
  assert.equal(attachment.body.toString(), '%PDF-1.4 test');
  assert.equal(decodeURIComponent(attachment.headers['x-attachment-name']), 'XQ154.pdf');
  assert.match(attachment.headers['access-control-expose-headers'], /X-Attachment-Name/);
  store.snapshot.cachedAt = new Date(Date.now() - 6 * 60_000).toISOString();
  assert.equal((await request('/api/mail/messages')).status, 200);
  assert.equal(calls.filter(cmd => cmd === 'FolderSync').length, 2);
  const snapshot = await request('/api/admin/snapshot');
  assert.equal(snapshot.json().genDec[0].subject, 'XQ154 GenDec');
});

test('failed scan unlocks refresh; forced scans coalesce; settings respect env defaults', async t => {
  let gate = null;
  const calls = fakeExchange(t, { failFirst: true, pause: () => gate });
  const settings = { ...env, GENDEC_FOLDER_PATH: 'SXS>GenDec', LDM_FOLDER_PATH: 'SXS>GenDec', TRIP_INFO_FOLDER_PATH: 'SXS>GenDec' };
  const store = new MailStore();
  const request = await start(t, settings, store);
  assert.equal((await request('/api/mail/messages')).status, 502);
  assert.equal((await request('/api/mail/messages')).status, 200);
  const before = calls.filter(cmd => cmd === 'FolderSync').length;
  let release;
  gate = new Promise(resolve => { release = resolve; });
  const runRefresh = store.runRefresh.bind(store);
  let joined = 0;
  store.runRefresh = load => {
    joined += 1;
    if (joined === 5) release();
    return runRefresh(load);
  };
  const responses = await Promise.all(Array.from({ length: 5 }, () => request('/api/mail/sync', auth, 'POST')));
  store.runRefresh = runRefresh;
  gate = null;
  assert(responses.every(response => response.status === 200));
  assert.equal(calls.filter(cmd => cmd === 'FolderSync').length, before + 1);
  assert.equal((await request('/api/mail/settings')).json().settings.gendec, 'SXS\\GenDec');
  const saved = await request('/api/mail/settings', { ...auth, 'Content-Type': 'application/json' }, 'POST',
    JSON.stringify({ gendec: 'SXS>GenDec', ldm: 'SXS>GenDec', tripInfo: 'SXS>GenDec' }));
  assert.equal(saved.status, 200);
  assert.equal((await request('/api/mail/messages')).json().fromCache, true);
});

test('missing server secrets fail without contacting Exchange', async t => {
  const request = await start(t, { TEST_API_KEY: 'test-key' });
  assert.equal((await request('/api/auth/verify')).json().ready, false);
  assert.equal((await request('/api/mail/messages')).status, 503);
});
