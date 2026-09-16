import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import mailService from './mail.mjs';
import PRIVATE_PAGE from './private-page.mjs';
import { MailStore } from './mail-store.mjs';

const VERSION = '1.7.2-mail-render';
const HEADERS = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Attachment-Name, X-Mail-Subject, Content-Disposition',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
};

function json(data, status = 200) { return Response.json(data, { status, headers: HEADERS }); }
function hasAccess(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || !env.TEST_API_KEY) return false;
  const expected = Buffer.from(env.TEST_API_KEY);
  const actual = Buffer.from(header.slice(7));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createBackend(env = process.env, store = new MailStore()) {
  const services = { mailCache: store, runRefresh: load => store.runRefresh(load) };
  const origins = new Set(['null', 'https://gbeyan.onrender.com']);
  for (const value of [env.RENDER_EXTERNAL_URL, env.PUBLIC_URL]) {
    if (value) origins.add(new URL(value).origin);
  }
  const failures = new Map();
  let settingsQueue = Promise.resolve();
  let pendingSettings = 0;

  async function dispatch(request, ip) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (url.pathname.startsWith('/api/') && origin && !origins.has(origin)) {
      return json({ ok: false, error: 'Bu kaynaktan erişime izin verilmiyor.' }, 403);
    }
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return json({ ok: true, version: VERSION });
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(PRIVATE_PAGE.replace(
        'Klasörler kaydedildi ve cache yenilendi.',
        'Klasörler sunucu yeniden başlayana kadar kaydedildi ve cache yenilendi.'
      ), { headers: {
        ...HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      } });
    }
    if (!url.pathname.startsWith('/api/')) return new Response(null, { status: 404, headers: HEADERS });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Yöntem desteklenmiyor.' }, 405);
    if (!env.TEST_API_KEY) return json({ ok: false, error: 'Servis hazır değil.' }, 503);
    if (!hasAccess(request, env)) {
      const now = Date.now();
      for (const [key, value] of failures) if (now - value.start >= 60_000) failures.delete(key);
      const value = failures.get(ip) || { start: now, count: 0 };
      value.count += 1;
      if (failures.size < 10_000 || failures.has(ip)) failures.set(ip, value);
      return json({ ok: false, error: value.count > 12 ? 'Çok fazla deneme.' : 'Erişim reddedildi.' }, value.count > 12 ? 429 : 401);
    }
    if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
      return json({ ok: true, version: VERSION, backend: 'mail',
        ready: Boolean(env.EWS_USERNAME && env.EWS_PASSWORD), storage: 'memory' });
    }
    if (url.pathname === '/api/admin/snapshot' && request.method === 'GET') {
      // Uses the same lazy refresh as personnel requests; there is no idle polling.
      const response = await mailService.fetch(new Request('http://backend.local/api/mail/messages', {
        headers: { Authorization: request.headers.get('Authorization') }
      }), env, services);
      if (!response.ok) return response;
      const snapshot = await response.json();
      return json({ ok: true, version: VERSION,
        cachedAt: snapshot.cachedAt, expiresAt: snapshot.expiresAt,
        settings: snapshot.settings, folderStatus: snapshot.folderStatus,
        flights: snapshot.flights || [], parsed: snapshot.parsed || { ldm: [], tripInfo: [] },
        genDec: (snapshot.gendecMessages || snapshot.messages || []).map(message => ({
          date: message.date || '', subject: message.subject || '', from: message.from || '',
          attachments: (message.attachments || []).filter(file => /\.(pdf|xlsx|xls)$/i.test(file.name || ''))
            .map(file => ({ name: file.name, size: Number(file.size || 0) }))
        })).filter(message => message.attachments.length)
      });
    }
    if (url.pathname.startsWith('/api/mail/')) return mailService.fetch(request, env, services);
    return new Response(null, { status: 404, headers: HEADERS });
  }

  async function orderedDispatch(request, ip) {
    const settingsWrite = request.method === 'POST' && new URL(request.url).pathname === '/api/mail/settings'
      && hasAccess(request, env) && (!request.headers.get('Origin') || origins.has(request.headers.get('Origin')));
    if (settingsWrite) {
      pendingSettings += 1;
      const operation = settingsQueue.then(async () => {
        // Finish the old refresh before invalidating its snapshot and settings.
        if (store.pendingRefresh) await store.pendingRefresh.catch(() => {});
        return dispatch(request, ip);
      });
      settingsQueue = operation.catch(() => {}).finally(() => { pendingSettings -= 1; });
      return operation;
    }
    if (pendingSettings) await settingsQueue;
    return dispatch(request, ip);
  }

  return createServer(async (incoming, outgoing) => {
    const origin = incoming.headers.origin;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 64 * 1024) {
          outgoing.writeHead(413, HEADERS); outgoing.end(); return;
        }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(new URL(incoming.url, 'http://backend.local'), {
        method: incoming.method, headers,
        ...(!['GET', 'HEAD'].includes(incoming.method) && size ? { body: Buffer.concat(chunks) } : {})
      });
      const response = await orderedDispatch(request, incoming.socket.remoteAddress || 'unknown');
      // Headers merges names case-insensitively, so the HTML policy replaces
      // the API default instead of sending two independently enforced policies.
      const responseHeaders = new Headers(HEADERS);
      response.headers.forEach((value, name) => responseHeaders.set(name, value));
      responseHeaders.set('Vary', 'Origin');
      responseHeaders.delete('Access-Control-Allow-Origin');
      if (origin && origins.has(origin)) responseHeaders.set('Access-Control-Allow-Origin', origin);
      outgoing.writeHead(response.status, Object.fromEntries(responseHeaders));
      if (response.body && incoming.method !== 'HEAD') await pipeline(Readable.fromWeb(response.body), outgoing);
      else outgoing.end();
    } catch {
      if (!outgoing.headersSent) {
        const headers = { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' };
        if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
        outgoing.writeHead(500, headers);
        outgoing.end(JSON.stringify({ ok: false, error: 'Sunucu isteği işleyemedi.' }));
      } else outgoing.destroy();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createBackend();
  server.listen(Number(process.env.PORT || 10000), '0.0.0.0', () => console.log('gbeyan mail API is listening.'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
