const PRIVATE_PAGE = String.raw`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Mail Veri Ekranı</title>
  <style>
    :root{color-scheme:light;font-family:Inter,system-ui,-apple-system,sans-serif;color:#172033;background:#eef2f7}*{box-sizing:border-box}body{margin:0;min-height:100vh}.shell{max-width:1500px;margin:auto;padding:24px}
    .gate{min-height:calc(100vh - 48px);display:grid;place-items:center}.gate-card{width:min(400px,100%);padding:24px;border:1px solid #d6dde8;border-radius:14px;background:#fff;box-shadow:0 18px 50px #0f172a16}h1{margin:0 0 18px;font-size:20px}
    .key-row{display:grid;grid-template-columns:1fr auto;gap:8px}input,button{height:40px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 11px;font:inherit}button{background:#172554;color:#fff;font-weight:750;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.error{min-height:18px;margin-top:8px;color:#b91c1c;font-size:12px}.dashboard[hidden],.gate[hidden]{display:none}
    .head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.head h1{margin:0}.head-actions{display:flex;gap:8px}.head-actions button{height:34px;padding:5px 10px;font-size:12px}.secondary{background:#fff;color:#334155}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.stat{padding:12px;border:1px solid #d6dde8;border-radius:10px;background:#fff}.stat span{display:block;color:#64748b;font-size:10px;text-transform:uppercase}.stat strong{display:block;margin-top:3px;font-size:16px}
    .panel{margin-bottom:14px;border:1px solid #d6dde8;border-radius:12px;background:#fff;overflow:hidden}.panel h2{margin:0;padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:15px}.settings{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr)) auto;gap:10px;padding:14px;align-items:end}.settings label{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}.settings input{width:100%;height:36px}.settings button{height:36px}.setting-note{padding:0 14px 12px;color:#64748b;font-size:11px}.table-wrap{overflow:auto;max-height:42vh}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:left;white-space:nowrap}th{position:sticky;top:0;background:#f8fafc;color:#475569;font-size:10px;text-transform:uppercase}.empty{padding:18px;color:#64748b;text-align:center}.ok{color:#15803d}.warn{color:#b45309}.json{max-height:44vh;margin:0;padding:14px;overflow:auto;background:#0f172a;color:#dbeafe;font:11px/1.45 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;word-break:break-word}.parser-bar{margin:0 0 14px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#475569;font-size:12px;font-weight:700}.parser-bar.active{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8}.parser-bar.error{border-color:#fca5a5;background:#fef2f2;color:#b91c1c}.file-link{height:auto;border:0;background:transparent;padding:0;font:inherit;font-weight:800;text-decoration:underline;cursor:pointer}.file-active{color:#15803d}.file-superseded{color:#b91c1c}.file-error{color:#b45309}.file-unparsed{color:#64748b}.state-badge{font-weight:800}.state-active{color:#15803d}.state-superseded{color:#b91c1c}.state-error{color:#b45309}.state-unparsed{color:#64748b}
    @media(max-width:900px){.shell{padding:10px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.settings{grid-template-columns:1fr}.head{align-items:flex-start}.table-wrap{max-height:38vh}}
  </style>
</head>
<body><main class="shell">
  <section class="gate" id="gate"><form class="gate-card" id="gateForm"><h1>Yetkili erişim</h1><div class="key-row"><input id="key" type="password" autocomplete="off" placeholder="API anahtarı" aria-label="API anahtarı" required><button id="open" type="submit">Aç</button></div><div class="error" id="gateError" role="alert"></div></form></section>
  <section class="dashboard" id="dashboard" hidden>
    <div class="head"><h1>Mail cache kayıtları</h1><div class="head-actions"><button id="sync" type="button">Şimdi Tara</button><button id="refresh" class="secondary" type="button">Yenile</button><button id="lock" class="secondary" type="button">Kilitle</button></div></div>
    <div class="parser-bar" id="parserStatus">GenDec parser: beklemede</div>
    <div class="stats" id="stats"></div>
    <section class="panel"><h2>Klasör ayarları</h2><form class="settings" id="settingsForm"><label>GenDec klasörü<input id="gendecFolder" required></label><label>LDM klasörü<input id="ldmFolder" required></label><label>Trip Info klasörü<input id="tripInfoFolder" required></label><button id="saveSettings" type="submit">Kaydet ve Tara</button></form><div class="setting-note" id="settingNote">Klasörleri &gt; ile ayır. Örnek: Gelen Kutusu &gt; SXS &gt; GenDec</div></section>
    <section class="panel"><h2>Uçuş verileri</h2><div class="table-wrap" id="flights"></div></section>
    <section class="panel"><h2>GenDec ekip ekleri</h2><div class="table-wrap" id="genDec"></div></section>
    <section class="panel"><h2>Seçili GenDec · kullanıcı JSON / parser çıktısı</h2><pre class="json" id="gendecDetail">Bir GenDec dosyasına tıkla.</pre></section>
    <section class="panel"><h2>Depolanan JSON</h2><pre class="json" id="jsonData"></pre></section>
  </section>
</main><script>
  (() => {
    let key=''; let lastData=null; let statusTimer=null;
    const gate=document.getElementById('gate'),dashboard=document.getElementById('dashboard'),error=document.getElementById('gateError'),open=document.getElementById('open'),keyInput=document.getElementById('key');
    const text=value=>value==null||value===''?'—':String(value); const date=value=>{const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?text(value):parsed.toLocaleString('tr-TR');};
    const cell=(row,value,className='')=>{const td=row.insertCell();td.textContent=text(value);if(className)td.className=className;};
    async function request(path,options={}){const response=await fetch(path,{cache:'no-store',...options,headers:{Authorization:'Bearer '+key,...(options.headers||{})}});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Erişim reddedildi.');}return response.json();}
    function table(targetId,headers,rows,render){const target=document.getElementById(targetId);target.replaceChildren();if(!rows.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Kayıt yok.';target.appendChild(empty);return;}const el=document.createElement('table'),thead=el.createTHead(),head=thead.insertRow();headers.forEach(label=>{const th=document.createElement('th');th.textContent=label;head.appendChild(th);});const body=el.createTBody();rows.forEach(item=>render(body.insertRow(),item));target.appendChild(el);}
    function showGendecDetail(item){
      document.getElementById('gendecDetail').textContent=JSON.stringify({
        durum:item.state,
        sefer:item.flightNumber||null,
        dosya:item.fileName,
        aktifOlarakKullaniciyaVerilecek:item.state==='active',
        kullaniciyaGidecekJSON:item.clientPayload,
        parserCiktisi:item.parsed,
        hata:item.error
      },null,2);
    }
    function renderParserStatus(parser){
      const el=document.getElementById('parserStatus');
      if(!parser){el.className='parser-bar';el.textContent='GenDec parser: durum alınamadı';return;}
      if(parser.active){
        el.className='parser-bar active';
        el.textContent='GenDec parser çalışıyor: '+(parser.flightNumber?parser.flightNumber+' · ':'')+(parser.fileName||'dosya')+' · başlangıç '+date(parser.startedAt);
      }else if(parser.error){
        el.className='parser-bar error';
        el.textContent='GenDec parser son işlem hatası: '+(parser.fileName||'dosya')+' · '+parser.error;
      }else{
        el.className='parser-bar';
        el.textContent=parser.completedAt?'GenDec parser beklemede · son: '+(parser.fileName||'dosya')+' · '+date(parser.completedAt):'GenDec parser: beklemede';
      }
    }
    async function pollParserStatus(){
      if(!key||dashboard.hidden)return;
      try{const result=await request('/api/admin/parser-status');renderParserStatus(result.parser);}catch(_){}
    }
    function startStatusPolling(){
      if(statusTimer)clearInterval(statusTimer);
      pollParserStatus();
      statusTimer=setInterval(pollParserStatus,1000);
    }
    function render(data,settings){lastData=data;renderParserStatus(data.parserStatus);const stats=document.getElementById('stats');stats.replaceChildren();[['Sürüm',data.version],['Uçuş',data.flights.length],['GenDec',data.genDec.length],['Son tarama',date(data.cachedAt)]].forEach(([label,value])=>{const box=document.createElement('div');box.className='stat';const span=document.createElement('span');span.textContent=label;const strong=document.createElement('strong');strong.textContent=text(value);box.append(span,strong);stats.appendChild(box);});
      document.getElementById('gendecFolder').value=settings.gendec||'';document.getElementById('ldmFolder').value=settings.ldm||'';document.getElementById('tripInfoFolder').value=settings.tripInfo||'';const folderProblems=Object.entries(data.folderStatus||{}).filter(([,status])=>!status.ok);document.getElementById('settingNote').textContent=folderProblems.length?folderProblems.map(([source,status])=>source+': '+(status.error||'klasör okunamadı')).join(' · '):'Klasörler hazır. Gerçek klasör adında / varsa klasör seviyelerini > ile ayır.';
      table('flights',['Tarih','Sefer','Rota','Kuyruk','PAX','INF','Block Yakıt','LDM','Trip Info'],data.flights,(row,item)=>{const pax=item.fields?.pax?.value,inf=item.fields?.infant?.value,fuel=item.fields?.blockFuelKg?.value;cell(row,item.flightDate);cell(row,item.flightNumber);cell(row,[item.originPortCode,item.destinationPortCode].filter(Boolean).join('–'));cell(row,item.tailNumber);cell(row,pax);cell(row,inf);cell(row,fuel);cell(row,item.sources?.ldm?'Var':'Yok',item.sources?.ldm?'ok':'warn');cell(row,item.sources?.tripInfo?'Var':'Yok',item.sources?.tripInfo?'ok':'warn');});
      table('genDec',['Durum','Tarih','Sefer','Konu','Dosya','Parser','Parse zamanı'],data.genDec,(row,item)=>{
        const labels={active:'AKTİF',superseded:'REVİZE',error:'HATA',unparsed:'BEKLİYOR'};
        cell(row,labels[item.state]||item.state,'state-badge state-'+item.state);
        cell(row,date(item.date));
        cell(row,item.flightNumber);
        cell(row,item.subject);
        const td=row.insertCell();const button=document.createElement('button');button.type='button';button.className='file-link file-'+item.state;button.textContent=item.fileName||'Dosya';button.addEventListener('click',()=>showGendecDetail(item));td.appendChild(button);
        cell(row,item.parser);
        cell(row,date(item.parsedAt));
      });
      document.getElementById('jsonData').textContent=JSON.stringify({cachedAt:data.cachedAt,settings:data.settings,folderStatus:data.folderStatus,cleanup:data.cleanup,flights:data.flights,parsed:data.parsed,parserStatus:data.parserStatus,genDec:data.genDec},null,2);
    }
    async function load(){const [data,settingsData]=await Promise.all([request('/api/admin/snapshot'),request('/api/mail/settings')]);render(data,settingsData.settings||data.settings||{});}
    document.getElementById('gateForm').addEventListener('submit',async event=>{event.preventDefault();error.textContent='';open.disabled=true;open.textContent='Kontrol ediliyor…';key=keyInput.value.trim();try{await request('/api/auth/verify');keyInput.value='';gate.hidden=true;dashboard.hidden=false;startStatusPolling();open.textContent='Mailler okunuyor…';await load();}catch(failure){key='';dashboard.hidden=true;gate.hidden=false;if(statusTimer){clearInterval(statusTimer);statusTimer=null;}error.textContent=failure.message;}finally{open.disabled=false;open.textContent='Aç';}});
    document.getElementById('refresh').addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await load();}catch(failure){alert(failure.message);}finally{event.currentTarget.disabled=false;}});
    document.getElementById('sync').addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await request('/api/mail/sync',{method:'POST'});await load();}catch(failure){alert(failure.message);}finally{event.currentTarget.disabled=false;}});
    document.getElementById('settingsForm').addEventListener('submit',async event=>{event.preventDefault();const button=document.getElementById('saveSettings'),note=document.getElementById('settingNote');button.disabled=true;note.textContent='Kaydediliyor ve son 15 saat taranıyor…';try{await request('/api/mail/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gendec:document.getElementById('gendecFolder').value,ldm:document.getElementById('ldmFolder').value,tripInfo:document.getElementById('tripInfoFolder').value})});await load();note.textContent='Klasörler kaydedildi ve cache yenilendi.';}catch(failure){note.textContent=failure.message;}finally{button.disabled=false;}});
    document.getElementById('lock').addEventListener('click',()=>{key='';lastData=null;if(statusTimer){clearInterval(statusTimer);statusTimer=null;}dashboard.hidden=true;gate.hidden=false;keyInput.focus();});
  })();
</script></body></html>`;

export default PRIVATE_PAGE;
