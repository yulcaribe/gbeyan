/*
 * OtoBeyan TGS Exchange ActiveSync mail module
 * Version: v1.6.0b
 * Production credentials come from EWS_USERNAME / EWS_PASSWORD Worker secrets.
 * Credentials never leave Worker secrets.
 */
const EAS = 'https://posta.tgs.aero/Microsoft-Server-ActiveSync';
const DOMAIN = 'tgs';
const DEVICE_ID = 'BeyanMailClient01';
const DEVICE_TYPE = 'BeyanWeb';
const TARGET_FOLDER_PATH = ['SXS', 'GenDec'];
const WINDOW_SIZE = 100;
const MAX_SYNC_PAGES = 5;
const DEFAULT_LOOKBACK_HOURS = 6;
const MAIL_CACHE_TTL_MS = 5 * 60 * 1000;

const TAGS = {
  0: { 5:'Sync',6:'Responses',7:'Add',8:'Change',9:'Delete',10:'Fetch',11:'SyncKey',12:'ClientId',13:'ServerId',14:'Status',15:'Collection',16:'Class',18:'CollectionId',19:'GetChanges',20:'MoreAvailable',21:'WindowSize',22:'Commands',23:'Options',24:'FilterType',28:'Collections',29:'ApplicationData',30:'DeletesAsMoves',34:'MIMESupport',35:'MIMETruncation',40:'MaxItems' },
  2: { 5:'Attachment',6:'Attachments',7:'AttName',8:'AttSize',9:'Att0Id',10:'AttMethod',12:'Body',13:'BodySize',14:'BodyTruncated',15:'DateReceived',16:'DisplayName',17:'DisplayTo',18:'Importance',19:'MessageClass',20:'Subject',21:'Read',22:'To',23:'Cc',24:'From',25:'ReplyTo' },
  7: { 7:'DisplayName',8:'ServerId',9:'ParentId',10:'Type',12:'Status',14:'Changes',15:'Add',16:'Delete',17:'Update',18:'SyncKey',19:'FolderCreate',20:'FolderDelete',21:'FolderUpdate',22:'FolderSync',23:'Count' },
  17: { 5:'BodyPreference',6:'Type',7:'TruncationSize',8:'AllOrNone',10:'Body',11:'Data',12:'EstimatedDataSize',13:'Truncated',14:'Attachments',15:'Attachment',16:'DisplayName',17:'FileReference',18:'Method',19:'ContentId',20:'ContentLocation',21:'IsInline',22:'NativeBodyType',23:'ContentType',24:'Preview' },
  20: { 5:'ItemOperations',6:'Fetch',7:'Store',8:'Options',9:'Range',10:'Total',11:'Properties',12:'Data',13:'Status',14:'Response',15:'Version',16:'Schema',17:'Part' },
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const mb = n => { const out = [n & 127]; while ((n >>>= 7)) out.unshift((n & 127) | 128); return out; };
const text = value => [3, ...encoder.encode(String(value)), 0];
const tag = (page, token, content = null) => [
  0,
  page,
  token | (content === null ? 0 : 64),
  ...(content === null ? [] : content.flat(Infinity)),
  ...(content === null ? [] : [1])
];
const document = root => new Uint8Array([3, 1, 106, 0, ...root]);

function readMb(bytes, state) { let value = 0, byte; do { byte = bytes[state.i++]; value = (value << 7) | (byte & 127); } while (byte & 128); return value; }
function wbxml(bytes) {
  const state = { i: 4, page: 0 }; // WBXML 1.3, unknown public id, UTF-8, empty string table
  const root = { name: 'root', children: [] }, stack = [root];
  const addText = value => stack.at(-1).text = (stack.at(-1).text || '') + value;
  while (state.i < bytes.length) {
    const code = bytes[state.i++];
    if (code === 0) { state.page = bytes[state.i++]; continue; }
    if (code === 1) { if (stack.length > 1) stack.pop(); continue; }
    if (code === 3) { const start = state.i; while (bytes[state.i] !== 0 && state.i < bytes.length) state.i++; addText(decoder.decode(bytes.slice(start, state.i++))); continue; }
    if (code === 195) {
      const size = readMb(bytes, state);
      const opaque = bytes.slice(state.i, state.i += size);
      stack.at(-1).binary = opaque;
      continue;
    }
    if (code === 131) { readMb(bytes, state); continue; } // string table reference, not used by Exchange responses here
    if (code < 5) throw new Error(`Desteklenmeyen WBXML global token: ${code}`);
    const token = code & 63, hasContent = (code & 64) !== 0, hasAttrs = (code & 128) !== 0;
    if (hasAttrs) throw new Error('WBXML attributes desteklenmiyor.');
    const node = { name: TAGS[state.page]?.[token] || `p${state.page}:${token}`, children: [] };
    stack.at(-1).children.push(node);
    if (hasContent) stack.push(node);
  }
  return root;
}
function nodes(node, name) { const found = []; const walk = n => { if (n.name === name) found.push(n); n.children?.forEach(walk); }; walk(node); return found; }
function first(node, name) { return nodes(node, name)[0]?.text || ''; }
function child(node, name) { return node.children?.find(n => n.name === name); }
function treeSummary(node) { return { n: node.name, t: node.text || undefined, c: (node.children || []).map(treeSummary) }; }
function safeTreeSummary(node) {
  return {
    n: node.name,
    t: node.name === 'Data' && node.text ? `[base64:${node.text.length}]` : node.text || undefined,
    b: node.binary ? node.binary.length : undefined,
    c: (node.children || []).map(safeTreeSummary)
  };
}
function attachmentBytes(dataNode) {
  if (dataNode?.binary?.length) return dataNode.binary;

  // ItemOperations inline attachment content is base64 text inside WBXML.
  const encoded = String(dataNode?.text || '').replace(/\s+/g, '');
  if (!encoded) return null;

  try {
    const binary = atob(encoded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw new Error('Exchange ek verisi geldi fakat base64 cozulemedi.');
  }
}

function userAlias(value) {
  const entered = String(value || '').trim();
  const alias = entered.includes('\\') ? entered.slice(entered.lastIndexOf('\\') + 1) : entered;
  if (!alias) throw new Error('TGS kullanici adini gir.');
  if (!/^[a-zA-Z0-9._-]+$/.test(alias)) throw new Error('TGS kullanici adi gecersiz. Sadece tgs\\ sonrasindaki kismi gir.');
  return alias;
}
function basic(alias, password) {
  const domainUser = `${DOMAIN}\\${alias}`;
  return 'Basic ' + btoa(String.fromCharCode(...encoder.encode(`${domainUser}:${password}`)));
}
async function eas(alias, password, command, payload = null, extra = {}, queryExtra = {}) {
  const query = new URLSearchParams({ Cmd: command, User: alias, DeviceId: DEVICE_ID, DeviceType: DEVICE_TYPE, ...queryExtra });
  const response = await fetch(`${EAS}?${query}`, {
    method: 'POST',
    headers: { Authorization: basic(alias, password), 'MS-ASProtocolVersion': '14.1', 'User-Agent': 'BeyanMail/1.5.0beta', ...(payload ? { 'Content-Type': 'application/vnd.ms-sync.wbxml' } : {}), ...extra },
    body: payload,
  });
  if (!response.ok) throw new Error(`Exchange HTTP ${response.status}`);
  return { response, tree: response.headers.get('content-type')?.includes('wbxml') ? wbxml(new Uint8Array(await response.arrayBuffer())) : null };
}
function folderSyncPayload() { return document(tag(7, 22, tag(7, 18, text('0')))); }
function attachmentPayload(fileReference) {
  return document(tag(20, 5, tag(20, 6, [
    tag(20, 7, text('Mailbox')),
    tag(17, 17, text(fileReference))
  ])));
}
function syncPayload(collectionId, syncKey, getChanges) {
  const collection = [
    tag(0, 11, text(syncKey)),
    tag(0, 18, text(collectionId))
  ];

  if (getChanges) {
    collection.push(
      tag(0, 30),
      tag(0, 19, text('1')),
      tag(0, 21, text(String(WINDOW_SIZE))),
      tag(0, 23, [
        // 0 = tarih filtresi yok; hedef klasordeki tum senkronize edilebilir mailler.
        tag(0, 24, text('0')),
        tag(17, 5, [
          tag(17, 6, text('1')),
          tag(17, 7, text('32768'))
        ])
      ])
    );
  }

  return document(tag(0, 5, tag(0, 28, tag(0, 15, collection))));
}
async function targetFolder(alias, password) {
  const { tree } = await eas(alias, password, 'FolderSync', folderSyncPayload());
  const records = [...nodes(tree, 'Add'), ...nodes(tree, 'Update')]
    .map(folder => ({
      id: first(folder, 'ServerId'),
      parentId: first(folder, 'ParentId'),
      name: first(folder, 'DisplayName'),
      type: first(folder, 'Type')
    }))
    .filter(folder => folder.id && folder.name);

  let parentId = null;
  let current = null;
  for (const segment of TARGET_FOLDER_PATH) {
    const wanted = segment.toLocaleLowerCase('tr-TR');
    const candidates = records.filter(folder => folder.name.toLocaleLowerCase('tr-TR') === wanted);
    current = parentId === null
      ? candidates[0]
      : candidates.find(folder => folder.parentId === parentId);
    if (!current) {
      const available = records.map(folder => folder.name).sort().join(', ');
      throw new Error(`Mail klasoru bulunamadi: ${TARGET_FOLDER_PATH.join('\\')}. Bulunan klasorler: ${available.slice(0, 2500)}`);
    }
    parentId = current.id;
  }

  return current;
}
function messageFrom(add) {
  const data = child(add, 'ApplicationData') || add;
  const attachmentNodes = nodes(data, 'Attachment');
  return {
    id: first(add, 'ServerId'), subject: first(data, 'Subject'), from: first(data, 'From') || first(data, 'DisplayName'), to: first(data, 'To'), date: first(data, 'DateReceived'), read: first(data, 'Read') === '1',
    body: first(child(data, 'Body') || data, 'Data') || first(data, 'Body'),
    attachments: attachmentNodes
      .map(file => ({
        id: first(file, 'FileReference') || first(file, 'Att0Id'),
        name: first(file, 'DisplayName') || first(file, 'AttName'),
        contentType: first(file, 'ContentType'),
        size: Number(first(file, 'AttSize') || 0),
        inline: first(file, 'IsInline') === '1'
      }))
      .filter(file => file.id && file.name),
  };
}
async function loadMessages(alias, password) {
  const folder = await targetFolder(alias, password);
  const initial = await eas(alias, password, 'Sync', syncPayload(folder.id, '0', false));
  let syncKey = first(initial.tree, 'SyncKey');
  if (!syncKey) {
    throw new Error(
      'Exchange ilk SyncKey degerini vermedi. InitialSync=' +
      JSON.stringify(treeSummary(initial.tree)).slice(0, 3500)
    );
  }

  const messages = [];
  const seen = new Set();
  let moreAvailable = false;
  let pages = 0;

  do {
    const result = await eas(alias, password, 'Sync', syncPayload(folder.id, syncKey, true));
    const status = first(result.tree, 'Status');
    if (status && status !== '1') {
      throw new Error(`Exchange Sync hatasi: Status ${status}. Sync=${JSON.stringify(treeSummary(result.tree)).slice(0, 2500)}`);
    }

    for (const add of nodes(result.tree, 'Add')) {
      const message = messageFrom(add);
      if (message.id && !seen.has(message.id)) {
        seen.add(message.id);
        messages.push(message);
      }
    }

    const nextSyncKey = first(result.tree, 'SyncKey');
    if (!nextSyncKey) throw new Error('Exchange sonraki SyncKey degerini vermedi.');
    syncKey = nextSyncKey;
    moreAvailable = nodes(result.tree, 'MoreAvailable').length > 0;
    pages++;
  } while (moreAvailable && pages < MAX_SYNC_PAGES);

  messages.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { folder, messages, syncKey, pages, moreAvailable, limit: WINDOW_SIZE * MAX_SYNC_PAGES };
}
async function fetchAttachment(alias, password, attachmentId) {
  const { tree } = await eas(alias, password, 'ItemOperations', attachmentPayload(attachmentId));
  const fetchNode = nodes(tree, 'Fetch')[0] || tree;
  const status = first(fetchNode, 'Status') || first(tree, 'Status');
  if (status !== '1') throw new Error(`Ek indirilemedi. ItemOperations Status ${status || 'yok'}.`);

  const dataNode = nodes(fetchNode, 'Data').find(node => node.binary?.length || node.text)
    || nodes(tree, 'Data').find(node => node.binary?.length || node.text);
  const bytes = attachmentBytes(dataNode);
  if (!bytes?.length) {
    throw new Error(
      'Exchange ek verisini dondurmedi. ItemOperations=' +
      JSON.stringify(safeTreeSummary(tree)).slice(0, 2500)
    );
  }
  return bytes;
}
function searchKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
function lookbackHours(url) {
  return DEFAULT_LOOKBACK_HOURS;
}

function recentMessages(messages, hours = DEFAULT_LOOKBACK_HOURS, now = Date.now()) {
  const cutoff = now - hours * 60 * 60 * 1000;
  return (messages || []).filter(message => {
    const receivedAt = Date.parse(message.date || '');
    return Number.isFinite(receivedAt) && receivedAt >= cutoff && receivedAt <= now + 5 * 60 * 1000;
  });
}

function compactMessage(message) {
  return {
    id: String(message.id || ''),
    subject: String(message.subject || '').slice(0, 1000),
    from: String(message.from || '').slice(0, 500),
    to: String(message.to || '').slice(0, 500),
    date: String(message.date || ''),
    read: Boolean(message.read),
    body: String(message.body || '').slice(0, 4000),
    attachments: (message.attachments || []).map(attachment => ({
      id: String(attachment.id || ''),
      name: String(attachment.name || '').slice(0, 500),
      contentType: String(attachment.contentType || '').slice(0, 200),
      size: Number(attachment.size || 0),
      inline: Boolean(attachment.inline)
    }))
  };
}

function findFlightPdf(messages, flightNo) {
  const flightKey = searchKey(flightNo);
  if (!flightKey) throw new Error('Ucus numarasi eksik.');
  if (!/^XQ\d{1,5}[A-Z]?$/.test(flightKey)) throw new Error('Ucus numarasi XQ254 biciminde olmali.');
  const flightPattern = new RegExp(`${flightKey}(?!\\d)`);
  const candidates = [];

  for (const message of messages) {
    const subjectKey = searchKey(message.subject);
    const bodyKey = searchKey(message.body);

    for (const attachment of message.attachments || []) {
      if (!String(attachment.name || '').toLowerCase().endsWith('.pdf')) continue;
      const nameKey = searchKey(attachment.name);
      const flightMatch = flightPattern.test(nameKey) || flightPattern.test(subjectKey) || flightPattern.test(bodyKey);
      if (!flightMatch) continue;

      let score = 0;
      if (nameKey.includes(flightKey)) score += 50;
      if (subjectKey.includes(flightKey)) score += 30;
      if (bodyKey.includes(flightKey)) score += 15;
      if (nameKey.includes('GENDEC')) score += 10;
      candidates.push({ message, attachment, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score || String(b.message.date).localeCompare(String(a.message.date)));
  return candidates[0] || null;
}
function fileResponse(bytes, name, extraHeaders = {}) {
  const safeName = String(name || 'attachment.pdf').replaceAll('"', '');
  const lowerName = safeName.toLowerCase();
  const contentType = lowerName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
  return new Response(bytes, { headers: {
    ...cors,
    'Content-Type': contentType,
    'Content-Length': String(bytes.length),
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'X-Attachment-Name': encodeURIComponent(safeName),
    ...extraHeaders
  } });
}
const cors = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Attachment-Name, X-Mail-Subject, Content-Disposition',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};
function json(data, status = 200) { return Response.json(data, { status, headers: cors }); }

function snapshotFrom(result, hours) {
  const cachedAt = new Date().toISOString();
  return {
    cacheVersion: 1,
    folder: TARGET_FOLDER_PATH.join('\\'),
    messages: recentMessages(result.messages, hours).map(compactMessage),
    lookbackHours: hours,
    fetchedMessages: result.messages.length,
    syncKey: result.syncKey,
    pages: result.pages,
    moreAvailable: result.moreAvailable,
    limit: result.limit,
    cachedAt,
    expiresAt: new Date(Date.now() + MAIL_CACHE_TTL_MS).toISOString()
  };
}

function snapshotIsFresh(snapshot) {
  return Boolean(snapshot?.cachedAt)
    && Date.now() - Date.parse(snapshot.cachedAt) < MAIL_CACHE_TTL_MS;
}

export async function refreshMailCache(env, cache, hours = DEFAULT_LOOKBACK_HOURS) {
  const alias = userAlias(env.EWS_USERNAME);
  if (!env.EWS_PASSWORD) throw new Error('EWS_PASSWORD secret eksik.');
  const result = await loadMessages(alias, env.EWS_PASSWORD);
  const snapshot = snapshotFrom(result, hours);
  if (cache?.saveMailSnapshot) await cache.saveMailSnapshot(snapshot);
  return snapshot;
}

async function getMailSnapshot(env, cache, hours, force = false) {
  if (!force && cache?.getMailSnapshot) {
    const stored = await cache.getMailSnapshot();
    if (snapshotIsFresh(stored)) {
      return {
        ...stored,
        messages: recentMessages(stored.messages, hours),
        lookbackHours: hours,
        fromCache: true
      };
    }
  }

  const snapshot = await refreshMailCache(env, cache, hours);
  return { ...snapshot, fromCache: false };
}

export default {
  async fetch(request, env, services = {}) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/mail(?=\/|$)/, '/api');
    try {
      if (!env.EWS_USERNAME || !env.EWS_PASSWORD || !env.TEST_API_KEY) {
        return json({ error: 'EWS_USERNAME, EWS_PASSWORD veya TEST_API_KEY secret eksik.' }, 503);
      }
      if (request.headers.get('Authorization') !== `Bearer ${env.TEST_API_KEY}`) {
        return json({ error: 'Erisim anahtari gecersiz.' }, 401);
      }
      const alias = userAlias(env.EWS_USERNAME);
      const password = env.EWS_PASSWORD;
      if (route === '/api/login') {
        await targetFolder(alias, password);
        return json({ ok: true, user: alias, folder: TARGET_FOLDER_PATH.join('\\') });
      }
      if (route === '/api/messages') {
        const hours = lookbackHours(url);
        const snapshot = await getMailSnapshot(env, services.mailCache, hours, url.searchParams.get('refresh') === '1');
        return json(snapshot);
      }
      if (route === '/api/flight-pdf') {
        const flightNo = url.searchParams.get('flightNo');
        const hours = lookbackHours(url);
        let snapshot = await getMailSnapshot(env, services.mailCache, hours);
        let match = findFlightPdf(snapshot.messages, flightNo);
        if (!match && snapshot.fromCache) {
          snapshot = await getMailSnapshot(env, services.mailCache, hours, true);
          match = findFlightPdf(snapshot.messages, flightNo);
        }
        if (!match) {
          return json({
            error: `Son ${hours} saatte ${flightNo} ucusu icin PDF eki bulunamadi.`,
            searchedMessages: snapshot.messages.length,
            moreAvailable: snapshot.moreAvailable
          }, 404);
        }
        const bytes = await fetchAttachment(alias, password, match.attachment.id);
        return fileResponse(bytes, match.attachment.name, {
          'X-Mail-Subject': encodeURIComponent(String(match.message.subject || ''))
        });
      }
      if (route === '/api/attachment') {
        const attachmentId = url.searchParams.get('id');
        const name = url.searchParams.get('name') || 'attachment';
        if (!attachmentId) return json({ error: 'id eksik.' }, 400);
        const fileBytes = await fetchAttachment(alias, password, attachmentId);
        return fileResponse(fileBytes, name);
      }
      if (route === '/api/sync' && request.method === 'POST') {
        const snapshot = await getMailSnapshot(env, services.mailCache, DEFAULT_LOOKBACK_HOURS, true);
        return json({
          ok: true,
          cachedAt: snapshot.cachedAt,
          expiresAt: snapshot.expiresAt,
          messageCount: snapshot.messages.length,
          lookbackHours: snapshot.lookbackHours
        });
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 502); }
  },
};
