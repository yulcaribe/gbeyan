/*
 * OtoBeyan TGS Exchange ActiveSync mail module
 * Version: v1.7.4
 * Production credentials come from server environment variables.
 * Credentials stay on the server.
 */
import { normalizeDate, normalizeFlightNumber, normalizeTail, parseLdmMessage } from './ldm-parser.js';
import { parseTripInfoMessage } from './tripinfo-parser.js';
import { attachmentCacheKey, matchesFlightNumber, parseGendecAttachment } from './gendec.js';

const EAS = 'https://posta.tgs.aero/Microsoft-Server-ActiveSync';
const DOMAIN = 'tgs';
const DEVICE_ID = 'BeyanMailClient01';
const DEVICE_TYPE = 'BeyanWeb';
const DEFAULT_FOLDER_SETTINGS = Object.freeze({
  gendec: 'SXS\\GenDec',
  ldm: 'SXS\\GenDec',
  tripInfo: 'SXS\\GenDec'
});
const WINDOW_SIZE = 100;
const MAX_SYNC_PAGES = 5;
const DEFAULT_LOOKBACK_HOURS = 15;
const MAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const CREW_ATTACHMENT_EXTENSIONS = Object.freeze(['.pdf', '.xlsx', '.xls']);
const FLIGHT_CODE_ALIASES = Object.freeze({
  STW: '2S',
  '2S': 'STW',
  TWI: 'TI',
  TI: 'TWI'
});

function newest(records) {
  return [...records].sort((left, right) => String(right?.source?.receivedAt || '').localeCompare(String(left?.source?.receivedAt || '')))[0] || null;
}
function valueField(value, record, confidence, validation) {
  return { value, source: record?.source || null, confidence, validation };
}
function buildFlightRecords(ldmRecords = [], tripInfoRecords = []) {
  const keys = new Set([...ldmRecords, ...tripInfoRecords].map(record => record.key).filter(Boolean));
  return [...keys].map(key => {
    const trip = newest(tripInfoRecords.filter(record => record.key === key));
    const ldm = newest(ldmRecords.filter(record => record.key === key));
    const selected = trip || ldm;
    const paxValid = ldm?.validations?.paxMatchesMessage === true;
    const fuelValid = trip?.validations?.blockFuelPositive === true && trip?.validations?.blockFuelMatchesTakeOffPlusTaxi !== false;
    return {
      key, flightNumber: selected?.flightNumber || '', flightDate: trip?.flightDate || ldm?.flightDate || '',
      originPortCode: trip?.originPortCode || '', destinationPortCode: trip?.destinationPortCode || ldm?.destinationPortCode || '',
      tailNumber: selected?.tailNumber || '', cockpitCrew: trip?.cockpitCrew ?? ldm?.cockpitCrew ?? null,
      cabinCrew: trip?.cabinCrew ?? ldm?.cabinCrew ?? null,
      fields: {
        pax: valueField(ldm?.pax ?? null, ldm, ldm ? (paxValid ? 1 : 0.55) : 0, ldm?.validations || { available: false }),
        infant: valueField(ldm?.infant ?? null, ldm, ldm ? (paxValid ? 1 : 0.55) : 0, ldm?.validations || { available: false }),
        blockFuelKg: valueField(trip?.blockFuelKg ?? null, trip, trip ? (fuelValid ? 1 : 0.55) : 0, trip?.validations || { available: false })
      },
      sources: { ldm: ldm?.source || null, tripInfo: trip?.source || null },
      validations: { pax: paxValid, blockFuel: fuelValid, tailConsistent: ldm && trip ? ldm.tailNumber === trip.tailNumber : null }
    };
  }).sort((left, right) => `${right.flightDate}|${right.flightNumber}`.localeCompare(`${left.flightDate}|${left.flightNumber}`));
}

const TAGS = {
  0: { 5:'Sync',6:'Responses',7:'Add',8:'Change',9:'Delete',10:'Fetch',11:'SyncKey',12:'ClientId',13:'ServerId',14:'Status',15:'Collection',16:'Class',18:'CollectionId',19:'GetChanges',20:'MoreAvailable',21:'WindowSize',22:'Commands',23:'Options',24:'FilterType',28:'Collections',29:'ApplicationData',30:'DeletesAsMoves',34:'MIMESupport',35:'MIMETruncation',40:'MaxItems' },
  2: { 5:'Attachment',6:'Attachments',7:'AttName',8:'AttSize',9:'Att0Id',10:'AttMethod',12:'Body',13:'BodySize',14:'BodyTruncated',15:'DateReceived',16:'DisplayName',17:'DisplayTo',18:'Importance',19:'MessageClass',20:'Subject',21:'Read',22:'To',23:'Cc',24:'From',25:'ReplyTo' },
  5: { 5:'MoveItems',6:'Move',7:'SrcMsgId',8:'SrcFldId',9:'DstFldId',10:'Response',11:'Status',12:'DstMsgId' },
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
    signal: AbortSignal.timeout(60_000),
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
function deleteMessagesPayload(collectionId, syncKey, messageIds) {
  return document(tag(0, 5, tag(0, 28, tag(0, 15, [
    tag(0, 11, text(syncKey)),
    tag(0, 18, text(collectionId)),
    tag(0, 30, text('0')),
    tag(0, 22, messageIds.map(messageId => tag(0, 9, tag(0, 13, text(messageId)))))
  ]))));
}
async function folderRecords(alias, password) {
  const { tree } = await eas(alias, password, 'FolderSync', folderSyncPayload());
  return [...nodes(tree, 'Add'), ...nodes(tree, 'Update')]
    .map(folder => ({
      id: first(folder, 'ServerId'),
      parentId: first(folder, 'ParentId'),
      name: first(folder, 'DisplayName'),
      type: first(folder, 'Type')
    }))
    .filter(folder => folder.id && folder.name);
}

function folderSegments(value) {
  const raw = String(value || '').trim();
  // Use > (or the UI breadcrumb ›) when a real folder name contains /.
  // Backslash remains supported for simple legacy paths such as SXS\GenDec.
  const separator = /[>›]/.test(raw) ? /\s*[>›]\s*/ : /\\+/;
  const segments = raw.split(separator).map(part => part.trim()).filter(Boolean);
  if (!segments.length || segments.length > 8) throw new Error('Mail klasoru yolu gecersiz.');
  return segments;
}

function targetFolder(records, folderPath) {
  const segments = folderSegments(folderPath);

  let parentId = null;
  let current = null;
  for (const segment of segments) {
    const wanted = segment.toLocaleLowerCase('tr-TR');
    const candidates = records.filter(folder => folder.name.toLocaleLowerCase('tr-TR') === wanted);
    current = parentId === null
      ? candidates[0]
      : candidates.find(folder => folder.parentId === parentId);
    if (!current) {
      const available = records.map(folder => folder.name).sort().join(', ');
      throw new Error(`Mail klasoru bulunamadi: ${segments.join('\\')}. Bulunan klasorler: ${available.slice(0, 2500)}`);
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
async function loadMessages(alias, password, folder) {
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
async function permanentlyDeleteMessages(alias, password, loadedFolder, messageIds) {
  let syncKey = loadedFolder.syncKey;
  let deleted = 0;
  const uniqueIds = [...new Set(messageIds.map(value => String(value || '')).filter(Boolean))];

  for (let index = 0; index < uniqueIds.length; index += WINDOW_SIZE) {
    const batch = uniqueIds.slice(index, index + WINDOW_SIZE);
    const result = await eas(alias, password, 'Sync', deleteMessagesPayload(loadedFolder.folder.id, syncKey, batch));
    const collection = nodes(result.tree, 'Collection')[0] || result.tree;
    const status = child(collection, 'Status')?.text || first(result.tree, 'Status');
    if (status !== '1') throw new Error(`Exchange kalici silme hatasi: Status ${status || 'yok'}.`);
    for (const response of nodes(child(collection, 'Responses') || collection, 'Delete')) {
      const commandStatus = first(response, 'Status');
      const serverId = first(response, 'ServerId');
      if (commandStatus && commandStatus !== '1') {
        throw new Error(`Exchange ${serverId || 'mail'} kalici silme komutunu reddetti: Status ${commandStatus}.`);
      }
    }
    const nextSyncKey = first(result.tree, 'SyncKey');
    if (!nextSyncKey) throw new Error('Exchange silme sonrasi SyncKey degerini vermedi.');
    syncKey = nextSyncKey;
    const verification = await loadMessages(alias, password, loadedFolder.folder);
    const remaining = new Set(verification.messages.map(message => message.id));
    const failed = batch.filter(id => remaining.has(id));
    if (failed.length) throw new Error(`Exchange kalici silme dogrulamasi basarisiz: ${failed.length} mail hâlâ klasörde.`);
    loadedFolder.messages = loadedFolder.messages.filter(message => !batch.includes(message.id));
    deleted += batch.length;
  }
  loadedFolder.syncKey = syncKey;
  return deleted;
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

function crewAttachmentExtension(name) {
  const lowerName = String(name || '').toLowerCase();
  return CREW_ATTACHMENT_EXTENSIONS.find(extension => lowerName.endsWith(extension)) || '';
}

function flightNumberVariants(flightNo) {
  const flightKey = normalizeFlightNumber(flightNo);
  if (!flightKey) throw new Error('Ucus numarasi eksik.');
  if (!/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(flightKey)) throw new Error('Ucus numarasi XQ254 biciminde olmali.');
  const variants = new Set([flightKey]);
  for (const [prefix, alias] of Object.entries(FLIGHT_CODE_ALIASES)) {
    const number = flightKey.startsWith(prefix) ? flightKey.slice(prefix.length) : '';
    if (/^\d{1,5}[A-Z]?$/.test(number)) variants.add(`${alias}${number}`);
  }
  return [...variants];
}

function findFlightAttachments(messages, flightNo) {
  const flightKeys = flightNumberVariants(flightNo);
  const candidates = [];

  for (const message of messages) {
    const subjectKey = searchKey(message.subject);
    const bodyKey = searchKey(message.body);

    for (const attachment of message.attachments || []) {
      const extension = crewAttachmentExtension(attachment.name);
      if (!extension) continue;

      const nameKey = searchKey(attachment.name);
      let score = 0;

      // Filename/subject/body are only hints for ordering. They are NOT matching rules.
      // The actual match is verified after parsing the attachment by flight number only.
      if (flightKeys.some(key => nameKey.includes(key))) score += 50;
      if (flightKeys.some(key => subjectKey.includes(key))) score += 30;
      if (flightKeys.some(key => bodyKey.includes(key))) score += 15;
      if (nameKey.includes('GENDEC')) score += 10;
      if (nameKey.includes('HGBS')) score += 10;
      if (extension === '.xlsx') score += 3;

      candidates.push({ message, attachment, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score || String(b.message.date).localeCompare(String(a.message.date)));
  return candidates;
}
const cors = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};
function json(data, status = 200) { return Response.json(data, { status, headers: cors }); }

function folderPath(value, fallback) {
  const normalized = folderSegments(value || fallback).join('\\');
  if (normalized.length > 300) throw new Error('Mail klasoru yolu cok uzun.');
  return normalized;
}

function normalizeSettings(value = {}, env = {}) {
  return {
    gendec: folderPath(value.gendec || env.GENDEC_FOLDER_PATH || env.GENDEC, DEFAULT_FOLDER_SETTINGS.gendec),
    ldm: folderPath(value.ldm || env.LDM_FOLDER_PATH || env.LDM, DEFAULT_FOLDER_SETTINGS.ldm),
    tripInfo: folderPath(value.tripInfo || env.TRIP_INFO_FOLDER_PATH || env.TRIPINFO, DEFAULT_FOLDER_SETTINGS.tripInfo)
  };
}

async function currentSettings(env, cache) {
  const stored = cache?.getMailSettings ? await cache.getMailSettings() : null;
  return normalizeSettings(stored || {}, env);
}

async function loadConfiguredMessages(alias, password, settings) {
  const records = await folderRecords(alias, password);
  const paths = [...new Set(Object.values(settings))];
  const settled = await Promise.allSettled(paths.map(async path => {
    const folder = targetFolder(records, path);
    return [path, await loadMessages(alias, password, folder)];
  }));
  const byPath = new Map();
  const errors = {};
  settled.forEach((result, index) => {
    const path = paths[index];
    if (result.status === 'fulfilled') byPath.set(path, result.value[1]);
    else errors[path] = result.reason instanceof Error ? result.reason.message : String(result.reason);
  });
  return { byPath, errors, records };
}

function oldMessages(messages, hours, now = Date.now()) {
  const cutoff = now - hours * 60 * 60 * 1000;
  return (messages || []).filter(message => {
    const receivedAt = Date.parse(message.date || '');
    return Number.isFinite(receivedAt) && receivedAt < cutoff;
  });
}

async function cleanOldMail(alias, password, results, previous, hours = DEFAULT_LOOKBACK_HOURS) {
  const now = Date.now();
  const cleanup = {
    at: new Date(now).toISOString(),
    cutoff: new Date(now - hours * 60 * 60 * 1000).toISOString(),
    sourceDeleted: 0,
    trashDeleted: 0,
    errors: []
  };

  for (const [path, loaded] of results.byPath) {
    const ids = oldMessages(loaded.messages, hours, now).map(message => message.id);
    if (!ids.length) continue;
    try {
      cleanup.sourceDeleted += await permanentlyDeleteMessages(alias, password, loaded, ids);
      loaded.messages = loaded.messages.filter(message => !ids.includes(message.id));
    } catch (error) {
      cleanup.errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  cleanup.trashAt = cleanup.at;

  const trashFolder = results.records.find(folder => String(folder.type) === '4');
  if (!trashFolder) {
    cleanup.errors.push('Çöp Kutusu klasörü Exchange tarafından bulunamadı.');
    return cleanup;
  }

  try {
    const trash = await loadMessages(alias, password, trashFolder);
    const trashIds = oldMessages(trash.messages, hours, now)
      .map(message => message.id);
    cleanup.trashDeleted = await permanentlyDeleteMessages(alias, password, trash, trashIds);
  } catch (error) {
    cleanup.errors.push(`Çöp Kutusu: ${error instanceof Error ? error.message : String(error)}`);
  }
  return cleanup;
}

function recentParsed(records, hours, now = Date.now()) {
  const cutoff = now - hours * 60 * 60 * 1000;
  return (records || []).filter(record => {
    const receivedAt = Date.parse(record?.source?.receivedAt || '');
    return Number.isFinite(receivedAt) && receivedAt >= cutoff && receivedAt <= now + 5 * 60 * 1000;
  });
}

function snapshotFrom(results, settings, hours, previous = null, cleanup = null) {
  const cachedAt = new Date().toISOString();
  const recentFor = source => recentMessages(results.byPath.get(settings[source])?.messages || [], hours);
  const samePreviousSetting = source => previous?.settings?.[source] === settings[source];
  const gendecMessages = results.byPath.has(settings.gendec)
    ? recentFor('gendec').map(compactMessage)
    : samePreviousSetting('gendec') ? recentMessages(previous?.gendecMessages || previous?.messages, hours) : [];
  const ldmRecords = results.byPath.has(settings.ldm)
    ? recentFor('ldm').map(message => parseLdmMessage(message, settings.ldm)).filter(Boolean)
    : samePreviousSetting('ldm') ? recentParsed(previous?.parsed?.ldm, hours) : [];
  const tripInfoRecords = results.byPath.has(settings.tripInfo)
    ? recentFor('tripInfo').map(message => parseTripInfoMessage(message, settings.tripInfo)).filter(Boolean)
    : samePreviousSetting('tripInfo') ? recentParsed(previous?.parsed?.tripInfo, hours) : [];
  const folderStatus = Object.fromEntries(Object.entries(settings).map(([source, path]) => {
    const result = results.byPath.get(path);
    return [source, {
      path,
      ok: Boolean(result),
      error: results.errors[path] || null,
      stale: !result && samePreviousSetting(source),
      fetchedMessages: result?.messages?.length || 0,
      pages: result?.pages || 0,
      moreAvailable: Boolean(result?.moreAvailable)
    }];
  }));

  return {
    cacheVersion: 2,
    settings,
    folderStatus,
    messages: gendecMessages,
    gendecMessages,
    parsed: { ldm: ldmRecords, tripInfo: tripInfoRecords },
    flights: buildFlightRecords(ldmRecords, tripInfoRecords),
    lookbackHours: hours,
    cachedAt,
    expiresAt: new Date(Date.now() + MAIL_CACHE_TTL_MS).toISOString(),
    cleanup
  };
}

function snapshotIsFresh(snapshot) {
  return Boolean(snapshot?.cachedAt)
    && Date.now() - Date.parse(snapshot.cachedAt) < MAIL_CACHE_TTL_MS;
}

function flightDataFromSnapshot(snapshot, flightNumber, flightDate, tailNumber) {
  const tail = normalizeTail(tailNumber);
  if (!tail) return null;
  const base = [...(snapshot.flights || [])]
    .filter(item => item.flightNumber === flightNumber && normalizeTail(item.tailNumber) === tail)
    .sort((left, right) => String(right.sources?.tripInfo?.receivedAt || '').localeCompare(String(left.sources?.tripInfo?.receivedAt || '')))[0] || null;
  const ldm = [...(snapshot.parsed?.ldm || [])]
    .filter(item => item.flightNumber === flightNumber && normalizeTail(item.tailNumber) === tail)
    .sort((left, right) => String(right.source?.receivedAt || '').localeCompare(String(left.source?.receivedAt || '')))[0] || null;

  if (!base && !ldm) return null;
  if (!ldm) return base;
  const paxValid = ldm.validations?.paxMatchesMessage === true;
  const confidence = paxValid ? 1 : 0.55;
  const field = value => ({ value, source: ldm.source, confidence, validation: ldm.validations });

  return {
    ...(base || {
      key: `${flightNumber}|${tail}`,
      flightNumber,
      flightDate,
      originPortCode: '',
      destinationPortCode: ldm.destinationPortCode || '',
      fields: { blockFuelKg: { value: null, source: null, confidence: 0, validation: { available: false } } },
      sources: { tripInfo: null },
      validations: { blockFuel: false }
    }),
    tailNumber: base?.tailNumber || ldm.tailNumber,
    cockpitCrew: base?.cockpitCrew ?? ldm.cockpitCrew ?? null,
    cabinCrew: base?.cabinCrew ?? ldm.cabinCrew ?? null,
    fields: {
      ...(base?.fields || {}),
      pax: field(ldm.pax),
      infant: field(ldm.infant)
    },
    sources: { ...(base?.sources || {}), ldm: ldm.source },
    validations: { ...(base?.validations || {}), pax: paxValid }
  };
}

export async function refreshMailCache(env, cache, hours = DEFAULT_LOOKBACK_HOURS) {
  const alias = userAlias(env.EWS_USERNAME);
  if (!env.EWS_PASSWORD) throw new Error('EWS_PASSWORD secret eksik.');
  const settings = await currentSettings(env, cache);
  const previous = cache?.getMailSnapshot ? await cache.getMailSnapshot() : null;
  const results = await loadConfiguredMessages(alias, env.EWS_PASSWORD, settings);
  const cleanup = await cleanOldMail(alias, env.EWS_PASSWORD, results, previous, hours);
  const snapshot = snapshotFrom(results, settings, hours, previous, cleanup);
  if (cache?.saveMailSnapshot) await cache.saveMailSnapshot(snapshot);
  return snapshot;
}

async function getMailSnapshot(env, cache, hours, force = false, runRefresh = null) {
  if (!force && cache?.getMailSnapshot) {
    const stored = await cache.getMailSnapshot();
    if (snapshotIsFresh(stored)) {
      return {
        ...stored,
        messages: recentMessages(stored.gendecMessages || stored.messages, hours),
        gendecMessages: recentMessages(stored.gendecMessages || stored.messages, hours),
        lookbackHours: hours,
        fromCache: true
      };
    }
  }

  const load = () => refreshMailCache(env, cache, hours);
  const snapshot = await (runRefresh ? runRefresh(load) : load());
  return { ...snapshot, fromCache: false };
}

export default {
  async fetch(request, env, services = {}) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/mail(?=\/|$)/, '/api');
    const getSnapshot = (hours, force = false) => getMailSnapshot(env, services.mailCache, hours, force, services.runRefresh);
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
        const settings = await currentSettings(env, services.mailCache);
        const results = await loadConfiguredMessages(alias, password, settings);
        return json({ ok: true, user: alias, settings, errors: results.errors });
      }
      if (route === '/api/settings' && request.method === 'GET') {
        return json({ ok: true, settings: await currentSettings(env, services.mailCache) });
      }
      if (route === '/api/settings' && request.method === 'POST') {
        const input = await request.json();
        const settings = normalizeSettings(input?.settings || input, env);
        if (!services.mailCache?.saveMailSettings) return json({ error: 'Kalici ayar deposu hazir degil.' }, 503);
        await services.mailCache.saveMailSettings(settings);
        await services.mailCache.clearMailSnapshot?.();
        const snapshot = await getSnapshot(DEFAULT_LOOKBACK_HOURS, true);
        return json({ ok: true, settings, cachedAt: snapshot.cachedAt, folderStatus: snapshot.folderStatus });
      }
      if (route === '/api/messages') {
        const hours = lookbackHours(url);
        const snapshot = await getSnapshot(hours, url.searchParams.get('refresh') === '1');
        return json(snapshot);
      }
      if (route === '/api/flight-crew') {
        const flightNo = normalizeFlightNumber(url.searchParams.get('flightNumber'));
        if (!flightNo) return json({ error: 'Uçuş numarası gerekli.' }, 400);
        const hours = lookbackHours(url);
        const cacheOnly = url.searchParams.get('cache') === '1';
        const stored = cacheOnly && services.mailCache?.getMailSnapshot
          ? await services.mailCache.getMailSnapshot()
          : null;
        if (cacheOnly && !stored) {
          return json({ error: 'Mail önbelleği henüz hazır değil. Önce mail verisini yenile.' }, 409);
        }
        const snapshot = cacheOnly
          ? { ...stored, gendecMessages: recentMessages(stored.gendecMessages || stored.messages, hours) }
          : await getSnapshot(hours);
        const candidates = findFlightAttachments(snapshot.gendecMessages || snapshot.messages, flightNo);
        if (!candidates.length) {
          return json({
            error: `Son ${hours} saatte ${flightNo} ucusu icin PDF veya Excel ekip eki bulunamadi.`,
            searchedMessages: (snapshot.gendecMessages || snapshot.messages || []).length,
            folder: snapshot.settings?.gendec || ''
          }, 404);
        }
        const parseErrors = [];
        for (const match of candidates) {
          try {
            const key = attachmentCacheKey(match.message, match.attachment);
            let parsed = await services.mailCache?.getParsedGendec?.(key);
            if (!parsed) {
              const bytes = await fetchAttachment(alias, password, match.attachment.id);
              parsed = await parseGendecAttachment(bytes, match.attachment, { flightNo });
              if (parsed.crews?.length) await services.mailCache?.saveParsedGendec?.(key, parsed);
            }
            if (!parsed.crews?.length || !matchesFlightNumber(parsed, flightNo)) continue;
            return json({
              ok: true, status: 'ready', flightNumber: flightNo, crews: parsed.crews,
              source: { receivedAt: match.message.date, subject: match.message.subject, attachmentName: match.attachment.name }
            });
          } catch (error) {
            parseErrors.push({
              attachmentName: match.attachment.name,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        return json({
          ok: true, status: 'not_found', flightNumber: flightNo, crews: [],
          error: 'GenDec eklerinde istenen sefer numarası doğrulanamadı.',
          parseErrors: parseErrors.slice(0, 5)
        }, 404);
      }
      if (route === '/api/flight-data') {
        const flightNumber = normalizeFlightNumber(url.searchParams.get('flightNumber'));
        const flightDate = normalizeDate(url.searchParams.get('flightDate'));
        const tailNumber = normalizeTail(url.searchParams.get('tailNumber'));
        if (!flightNumber || !flightDate || !tailNumber) return json({ error: 'Ucus numarasi, tarih veya kuyruk gecersiz.' }, 400);
        const snapshot = await getSnapshot(DEFAULT_LOOKBACK_HOURS);
        const flight = flightDataFromSnapshot(snapshot, flightNumber, flightDate, tailNumber);
        return json({
          ok: true,
          status: flight ? 'ready' : 'not_found',
          query: { flightNumber, flightDate, tailNumber },
          flight,
          cachedAt: snapshot.cachedAt,
          folderStatus: snapshot.folderStatus
        });
      }
      if (route === '/api/sync' && request.method === 'POST') {
        const snapshot = await getSnapshot(DEFAULT_LOOKBACK_HOURS, true);
        return json({
          ok: true,
          cachedAt: snapshot.cachedAt,
          expiresAt: snapshot.expiresAt,
          messageCount: snapshot.gendecMessages.length,
          flightCount: snapshot.flights.length,
          lookbackHours: snapshot.lookbackHours
        });
      }
      if (route === '/api/trash/delete' && request.method === 'POST') {
        const input = await request.json();
        const messageId = String(input?.messageId || '').trim();
        if (!messageId) return json({ error: 'messageId eksik.' }, 400);
        const records = await folderRecords(alias, password);
        const trashFolder = records.find(folder => String(folder.type) === '4');
        if (!trashFolder) return json({ error: 'Çöp Kutusu bulunamadı.' }, 404);
        const trash = await loadMessages(alias, password, trashFolder);
        if (!trash.messages.some(message => message.id === messageId)) return json({ error: 'Mail çöp kutusunda bulunamadı.' }, 404);
        const deleted = await permanentlyDeleteMessages(alias, password, trash, [messageId]);
        return json({ ok: deleted === 1, permanentlyDeleted: deleted });
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 502); }
  },
};
