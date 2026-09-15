// OtoBeyan private mail gateway. Exchange credentials stay in Worker secrets.

import { DurableObject } from 'cloudflare:workers';
import mailWorker, { refreshMailCache } from './mail.js';
import PRIVATE_PAGE from './private-page.js';

const RELEASE_VERSION = '1.7.1-mail';
const STORE_NAME = 'primary-mail-cache';
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

export class MailDataStore extends DurableObject {
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

  async getMailSettings() {
    return (await this.ctx.storage.get('mailSettings')) || null;
  }

  async saveMailSettings(settings) {
    await this.ctx.storage.put('mailSettings', settings);
    return settings;
  }
}

function getMailStore(env) {
  return env.MAIL_DATA_STORE.getByName(STORE_NAME);
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
  return new Response(null, { status: 404, headers: API_HEADERS });
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

    if (!env.MAIL_DATA_STORE) return json({ ok: false, error: 'Mail veri deposu hazır değil.' }, 503);
    const store = getMailStore(env);
    if (request.method === 'GET' && url.pathname === '/api/auth/verify') {
      return json({
        ok: true,
        version: RELEASE_VERSION,
        backend: 'mail',
        ready: Boolean(env.EWS_USERNAME && env.EWS_PASSWORD && env.MAIL_DATA_STORE)
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/snapshot') {
      const snapshot = await store.getMailSnapshot().catch(() => null);
      const settings = await store.getMailSettings().catch(() => null);
      return json({
        ok: true,
        version: RELEASE_VERSION,
        cachedAt: snapshot?.cachedAt || null,
        expiresAt: snapshot?.expiresAt || null,
        settings: snapshot?.settings || settings || null,
        folderStatus: snapshot?.folderStatus || {},
        flights: snapshot?.flights || [],
        parsed: snapshot?.parsed || { ldm: [], tripInfo: [] },
        genDec: (snapshot?.gendecMessages || snapshot?.messages || []).map(message => ({
          date: message?.date || '',
          subject: message?.subject || '',
          from: message?.from || '',
          attachments: (message?.attachments || [])
            .filter(attachment => /\.(pdf|xlsx|xls)$/i.test(String(attachment?.name || '')))
            .map(attachment => ({ name: attachment?.name || '', size: Number(attachment?.size || 0) }))
        })).filter(message => message.attachments.length)
      });
    }

    if (url.pathname.startsWith('/api/mail/')) {
      return mailWorker.fetch(request, env, { mailCache: store });
    }

    return notFound();
  },

  async scheduled(_controller, env, ctx) {
    if (!env.MAIL_DATA_STORE || !env.EWS_USERNAME || !env.EWS_PASSWORD) return;
    const store = getMailStore(env);
    ctx.waitUntil(refreshMailCache(env, store));
  }
};
