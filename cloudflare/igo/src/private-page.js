const PRIVATE_PAGE = String.raw`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Özel Veri Ekranı</title>
  <style>
    :root{color-scheme:light;font-family:Inter,system-ui,-apple-system,sans-serif;color:#172033;background:#eef2f7}
    *{box-sizing:border-box}body{margin:0;min-height:100vh}.shell{max-width:1500px;margin:auto;padding:24px}
    .gate{min-height:calc(100vh - 48px);display:grid;place-items:center}.gate-card{width:min(400px,100%);padding:24px;border:1px solid #d6dde8;border-radius:14px;background:#fff;box-shadow:0 18px 50px #0f172a16}
    h1{margin:0 0 18px;font-size:20px}.key-row{display:grid;grid-template-columns:1fr auto;gap:8px}input,button{height:40px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 11px;font:inherit}button{background:#172554;color:#fff;font-weight:750;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.error{min-height:18px;margin-top:8px;color:#b91c1c;font-size:12px}
    .dashboard[hidden],.gate[hidden]{display:none}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.head h1{margin:0}.head-actions{display:flex;gap:8px}.head-actions button{height:34px;padding:5px 10px;font-size:12px}.secondary{background:#fff;color:#334155}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.stat{padding:12px;border:1px solid #d6dde8;border-radius:10px;background:#fff}.stat span{display:block;color:#64748b;font-size:10px;text-transform:uppercase}.stat strong{display:block;margin-top:3px;font-size:16px}
    .panel{margin-bottom:14px;border:1px solid #d6dde8;border-radius:12px;background:#fff;overflow:hidden}.panel h2{margin:0;padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:15px}.table-wrap{overflow:auto;max-height:42vh}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:left;white-space:nowrap}th{position:sticky;top:0;background:#f8fafc;color:#475569;font-size:10px;text-transform:uppercase}.empty{padding:18px;color:#64748b;text-align:center}.ok{color:#15803d}.warn{color:#b45309}
    @media(max-width:800px){.shell{padding:10px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.head{align-items:flex-start}.table-wrap{max-height:38vh}}
  </style>
</head>
<body>
  <main class="shell">
    <section class="gate" id="gate">
      <form class="gate-card" id="gateForm">
        <h1>Yetkili erişim</h1>
        <div class="key-row"><input id="key" type="password" autocomplete="off" placeholder="API anahtarı" aria-label="API anahtarı" required><button id="open" type="submit">Aç</button></div>
        <div class="error" id="gateError" role="alert"></div>
      </form>
    </section>
    <section class="dashboard" id="dashboard" hidden>
      <div class="head"><h1>Cache kayıtları</h1><div class="head-actions"><button id="refresh" type="button">Yenile</button><button id="lock" class="secondary" type="button">Kilitle</button></div></div>
      <div class="stats" id="stats"></div>
      <section class="panel"><h2>Load Sheet</h2><div class="table-wrap" id="loadSheets"></div></section>
      <section class="panel"><h2>GenDec</h2><div class="table-wrap" id="genDec"></div></section>
    </section>
  </main>
  <script>
    (() => {
      let key = '';
      const gate = document.getElementById('gate');
      const dashboard = document.getElementById('dashboard');
      const error = document.getElementById('gateError');
      const open = document.getElementById('open');
      const keyInput = document.getElementById('key');
      const text = value => value == null || value === '' ? '—' : String(value);
      const date = value => { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? text(value) : parsed.toLocaleString('tr-TR'); };
      const cell = (row, value, className = '') => { const td = row.insertCell(); td.textContent = text(value); if(className) td.className = className; };
      function table(targetId, headers, rows, render) {
        const target = document.getElementById(targetId); target.replaceChildren();
        if (!rows.length) { const empty = document.createElement('div'); empty.className='empty'; empty.textContent='Kayıt yok.'; target.appendChild(empty); return; }
        const el = document.createElement('table'); const thead=el.createTHead(); const head=thead.insertRow();
        headers.forEach(label => { const th=document.createElement('th'); th.textContent=label; head.appendChild(th); });
        const body=el.createTBody(); rows.forEach(item => render(body.insertRow(), item)); target.appendChild(el);
      }
      function render(data) {
        const stats = document.getElementById('stats'); stats.replaceChildren();
        [['Sürüm', data.version], ['Load Sheet', data.loadSheets.length], ['GenDec', data.genDec.length], ['Load Sheet güncelleme', date(data.loadSheetCachedAt)], ['GenDec güncelleme', date(data.genDecCachedAt)]].forEach(([label,value]) => {
          const box=document.createElement('div'); box.className='stat'; const span=document.createElement('span'); span.textContent=label; const strong=document.createElement('strong'); strong.textContent=text(value); box.append(span,strong); stats.appendChild(box);
        });
        table('loadSheets',['Tarih','Sefer','Rota','Kuyruk','PAX','INF','Offblock','EDNO','Durum','Cache'],data.loadSheets,(row,item) => {
          cell(row,item.flightDate); cell(row,item.flightNumber); cell(row,[item.departurePortCode,item.arrivalPortCode].filter(Boolean).join('–')); cell(row,item.tailNumber); cell(row,item.pax); cell(row,item.infant); cell(row,item.offBlockFuelKg); cell(row,item.edno); cell(row,item.finalized?'Signed':'Açık',item.finalized?'ok':'warn'); cell(row,date(item.cachedAt));
        });
        table('genDec',['Tarih','Konu','Gönderen','PDF'],data.genDec,(row,item) => {
          cell(row,date(item.date)); cell(row,item.subject); cell(row,item.from); cell(row,(item.attachments||[]).map(file=>file.name).join(', '));
        });
      }
      async function load() {
        const response = await fetch('/api/admin/snapshot',{cache:'no-store',headers:{Authorization:'Bearer '+key}});
        if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Erişim reddedildi.');}
        render(await response.json());
      }
      document.getElementById('gateForm').addEventListener('submit', async event => {
        event.preventDefault(); error.textContent=''; open.disabled=true; key=keyInput.value.trim();
        try { await load(); keyInput.value=''; gate.hidden=true; dashboard.hidden=false; }
        catch (failure) { key=''; error.textContent=failure.message; }
        finally { open.disabled=false; }
      });
      document.getElementById('refresh').addEventListener('click', async event => { event.currentTarget.disabled=true; try{await load();}catch(failure){alert(failure.message);}finally{event.currentTarget.disabled=false;} });
      document.getElementById('lock').addEventListener('click', () => { key=''; dashboard.hidden=true; gate.hidden=false; keyInput.focus(); });
    })();
  </script>
</body>
</html>`;

export default PRIVATE_PAGE;
