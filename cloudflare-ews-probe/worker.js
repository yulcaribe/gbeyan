/*
 * TGS Exchange ActiveSync -> browser JSON API
 * Version: v1.5.5b
 * Username and password arrive from the browser for each request.
 * They are not stored by the Worker. Add Cloudflare Access / a real login before public use.
 */
const EAS = 'https://posta.tgs.aero/Microsoft-Server-ActiveSync';
const DOMAIN = 'tgs';
const DEVICE_ID = 'BeyanMailClient01';
const DEVICE_TYPE = 'BeyanWeb';
const TARGET_FOLDER_PATH = ['SXS', 'GenDec'];
const WINDOW_SIZE = 100;
const MAX_SYNC_PAGES = 5;

const CLIENT_HTML = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SXS GenDec Mail Testi</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#172033;font:14px system-ui,-apple-system,Segoe UI,sans-serif}
    main{max-width:980px;margin:30px auto;padding:0 16px}.card{background:#fff;border:1px solid #dbe3ef;border-radius:14px;box-shadow:0 5px 20px #0f172a12;padding:20px}
    h1{margin:0 0 6px;font-size:24px}p{color:#64748b;margin:0 0 16px}.login{display:flex;gap:8px;flex-wrap:wrap}
    input,button{font:inherit;border-radius:8px;padding:10px 12px}input{border:1px solid #cbd5e1;flex:1;min-width:220px}button{border:0;background:#166534;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:wait}
    #search{display:none;margin-top:10px;width:100%}#status{padding:12px 0;color:#475569}.mail{border-top:1px solid #e2e8f0;padding:14px 0}.mail h3{margin:0 0 4px;font-size:15px}.meta{font-size:12px;color:#64748b}.body{margin-top:8px;white-space:pre-wrap;max-height:90px;overflow:hidden;color:#475569}
    .attachments{margin-top:8px;display:flex;gap:7px;flex-wrap:wrap}.attachment{background:#e8f1ff;color:#174ea6;border:1px solid #bfd3f7;padding:7px 9px;font-weight:600}.empty{padding:24px;text-align:center;color:#64748b}
  </style>
</head>
<body><main><section class="card">
  <h1>SXS / GenDec Mail Testi</h1>
  <p>Kullanıcı adı ve parola saklanmaz. Bu sayfa yalnızca <b>SXS\\GenDec</b> klasörünü okur.</p>
  <div class="login"><input id="username" autocomplete="username" placeholder="TGS kullanıcı adı (ör. ma056814)"><input id="password" type="password" autocomplete="current-password" placeholder="Exchange mail parolası"><button id="load">Mailleri Getir</button></div>
  <input id="search" type="search" placeholder="Konu, gönderen veya PDF adı ara">
  <div id="status"></div><div id="messages"></div>
</section></main>
<script>
  var state={messages:[]};
  function el(id){return document.getElementById(id)}
  function clean(value){return String(value||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function username(){return el('username').value.trim()}
  function password(){return el('password').value}
  function headers(){return {'X-Exchange-User':username(),'X-Exchange-Password':password()}}
  function render(){
    var q=el('search').value.toLocaleLowerCase('tr-TR');
    var list=state.messages.filter(function(m){return !q||(String(m.subject)+' '+String(m.from)+' '+(m.attachments||[]).map(function(a){return a.name}).join(' ')).toLocaleLowerCase('tr-TR').includes(q)});
    el('messages').innerHTML=list.map(function(m){
      var files=(m.attachments||[]).map(function(a){return '<button class="attachment" data-id="'+encodeURIComponent(a.id)+'" data-name="'+encodeURIComponent(a.name)+'">📎 '+clean(a.name)+'</button>'}).join('');
      return '<article class="mail"><h3>'+clean(m.subject||'(Konu yok)')+'</h3><div class="meta">'+clean(m.from)+' · '+clean(m.date)+'</div>'+(m.body?'<div class="body">'+clean(m.body)+'</div>':'')+'<div class="attachments">'+files+'</div></article>';
    }).join('')||'<div class="empty">Uyan mail bulunamadı.</div>';
  }
  el('search').addEventListener('input',render);
  el('load').addEventListener('click',async function(){
    if(!username()){el('status').textContent='TGS kullanıcı adını gir.';return}
    if(!password()){el('status').textContent='Parolayı gir.';return}
    var button=el('load');button.disabled=true;el('status').textContent='SXS / GenDec okunuyor...';el('messages').innerHTML='';
    try{var r=await fetch('/api/messages',{headers:headers(),cache:'no-store'});var data=await r.json();if(!r.ok)throw new Error(data.error||('HTTP '+r.status));state.messages=data.messages||[];el('search').style.display='block';el('status').textContent=(data.folder||'SXS\\GenDec')+': '+state.messages.length+' mail bulundu.'+(data.moreAvailable?' İlk '+data.limit+' kayıt gösteriliyor; daha fazlası var.':'');render()}catch(e){el('status').textContent='Hata: '+e.message}finally{button.disabled=false}
  });
  el('messages').addEventListener('click',async function(event){
    var button=event.target.closest('.attachment');if(!button)return;button.disabled=true;
    var name=decodeURIComponent(button.dataset.name),id=button.dataset.id;
    try{var r=await fetch('/api/attachment?id='+id+'&name='+encodeURIComponent(name),{headers:headers(),cache:'no-store'});if(!r.ok){var data=await r.json().catch(function(){return {}});throw new Error(data.error||('HTTP '+r.status))}var blob=await r.blob();var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1000)}catch(e){alert('Ek indirilemedi: '+e.message)}finally{button.disabled=false}
  });
</script></body></html>`;

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
function flightDateKeys(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Ucus tarihi YYYY-MM-DD formatinda olmali.');
  const [, year, month, day] = match;
  const monthName = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(month) - 1];
  if (!monthName) throw new Error('Ucus tarihi gecersiz.');
  return [`${year}${month}${day}`, `${day}${month}${year}`, `${day}${monthName}${year}`, `${day}${monthName}`];
}
function findFlightPdf(messages, flightNo, isoDate) {
  const flightKey = searchKey(flightNo);
  if (!flightKey) throw new Error('Ucus numarasi eksik.');
  const dateKeys = flightDateKeys(isoDate);
  const candidates = [];

  for (const message of messages) {
    const subjectKey = searchKey(message.subject);
    const bodyKey = searchKey(message.body);
    const mailDateMatch = String(message.date || '').slice(0, 10) === isoDate;

    for (const attachment of message.attachments || []) {
      if (!String(attachment.name || '').toLowerCase().endsWith('.pdf')) continue;
      const nameKey = searchKey(attachment.name);
      const flightMatch = nameKey.includes(flightKey) || subjectKey.includes(flightKey) || bodyKey.includes(flightKey);
      const attachmentDateMatch = dateKeys.some(key => nameKey.includes(key));
      const subjectDateMatch = dateKeys.some(key => subjectKey.includes(key));
      const bodyDateMatch = dateKeys.some(key => bodyKey.includes(key));
      const dateMatch = attachmentDateMatch || subjectDateMatch || bodyDateMatch || mailDateMatch;
      if (!flightMatch || !dateMatch) continue;

      let score = 0;
      if (nameKey.includes(flightKey)) score += 50;
      if (attachmentDateMatch) score += 50;
      if (subjectKey.includes(flightKey)) score += 30;
      if (subjectDateMatch) score += 30;
      if (bodyKey.includes(flightKey)) score += 15;
      if (bodyDateMatch) score += 15;
      if (mailDateMatch) score += 5;
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
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Exchange-User, X-Exchange-Password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Attachment-Name, X-Mail-Subject, Content-Disposition',
  'Cache-Control': 'no-store'
};
function json(data, status = 200) { return Response.json(data, { status, headers: cors }); }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const enteredUser = request.headers.get('X-Exchange-User');
    const password = request.headers.get('X-Exchange-Password');
    try {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(CLIENT_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/api/health') return json({ ok: true, version: 'v1.5.5b', protocol: 'Exchange ActiveSync 14.1', login: `${DOMAIN}\\kullanici`, folder: TARGET_FOLDER_PATH.join('\\') });
      const alias = userAlias(enteredUser);
      if (!password) return json({ error: 'Mail parolasini gir.' }, 401);
      if (url.pathname === '/api/login') {
        await targetFolder(alias, password);
        return json({ ok: true, user: alias, folder: TARGET_FOLDER_PATH.join('\\') });
      }
      if (url.pathname === '/api/messages') {
        const result = await loadMessages(alias, password);
        return json({
          folder: TARGET_FOLDER_PATH.join('\\'),
          messages: result.messages,
          syncKey: result.syncKey,
          pages: result.pages,
          moreAvailable: result.moreAvailable,
          limit: result.limit
        });
      }
      if (url.pathname === '/api/flight-pdf') {
        const flightNo = url.searchParams.get('flightNo');
        const flightDate = url.searchParams.get('date');
        const result = await loadMessages(alias, password);
        const match = findFlightPdf(result.messages, flightNo, flightDate);
        if (!match) {
          return json({
            error: `${flightDate} tarihli ${flightNo} ucusu icin PDF eki bulunamadi.`,
            searchedMessages: result.messages.length,
            moreAvailable: result.moreAvailable
          }, 404);
        }
        const bytes = await fetchAttachment(alias, password, match.attachment.id);
        return fileResponse(bytes, match.attachment.name, {
          'X-Mail-Subject': encodeURIComponent(String(match.message.subject || ''))
        });
      }
      if (url.pathname === '/api/attachment') {
        const attachmentId = url.searchParams.get('id');
        const name = url.searchParams.get('name') || 'attachment';
        if (!attachmentId) return json({ error: 'id eksik.' }, 400);
        const fileBytes = await fetchAttachment(alias, password, attachmentId);
        return fileResponse(fileBytes, name);
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 502); }
  },
};
