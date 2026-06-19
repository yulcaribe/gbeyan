'use strict';

async function submitHavayoluBeyanStatusAction() {
  const index = _hvbDeclareIndex;
  const row = STATE.rows[index];
  const apiId = getRowApiId(row) || _currentFlightBaseId;

  if (!row || !apiId) {
    alert('Beyan için HGBS API ID bulunamadı.');
    return;
  }

  const btn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    if (MOCK_MODE) {
      await delay(400);
    } else {
      await apiCall('POST', '/api/AirBase/StatusActionAgency?api-version=1.0', {
        id: apiId,
        action: 'GUMRUGESUNULDU',
        actionComment: '-'
      });
    }

    closeHavayoluBeyanModal();
    showGlobalAlert(`${row.flightNo} beyan edildi.`, 'info');
    await refreshRowsAfterHGBSAction();

  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText || 'Onayla ve Gönder'; }
  }
}

async function submitHavayoluBeyanStatusAction() {
  const index = _hvbDeclareIndex;
  const row = STATE.rows[index];
  const apiId = getRowApiId(row) || _currentFlightBaseId;

  if (!row || !apiId) {
    alert('Beyan için HGBS API ID bulunamadı.');
    return;
  }

  const btn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    if (MOCK_MODE) {
      await delay(400);
    } else {
      await apiCall('POST', '/api/AirBase/StatusActionAgency?api-version=1.0', {
        id: apiId,
        action: 'GUMRUGESUNULDU',
        actionComment: '-'
      });
    }

    closeHavayoluBeyanModal();
    showGlobalAlert(`${row.flightNo} beyan edildi.`, 'info');
    await refreshRowsAfterHGBSAction();

  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText || 'Onayla ve Gönder'; }
  }
}

async function openHavayoluBeyanModal() {
  const d = _currentFlightDetail;
  if (!d) return;

  hvbInitState();

  const subtitle = [d.tailNumber, d.departurePortCode, d.arrivalPortCode].filter(Boolean).join(' · ');
  const hvbBtn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  if (hvbBtn) {
    hvbBtn.disabled = false;
    hvbBtn.textContent = 'Gönder';
    hvbBtn.onclick = () => submitHavayoluBeyan();
  }
  document.getElementById('hvbModalSubtitle').textContent = subtitle;
  document.getElementById('hvbModalBody').innerHTML =
    `<div style="text-align:center;padding:40px 0;color:#64748b;font-size:13px">Yükleniyor...</div>`;
  document.getElementById('havayoluBeyanOverlay').classList.remove('hidden');

  try {
    const res = await apiCall('GET', `/api/Flight/GetAirDec?baseId=${encodeURIComponent(_currentFlightBaseId)}&api-version=1.0`);
    if (res && res.data) hvbPopulateFromApi(res.data);
  } catch (_) {
    // Kayıt yoksa veya hata varsa default state ile devam et
  }

  document.getElementById('hvbModalBody').innerHTML = buildHvbFormHtml(d);
}

function hvbPopulateFromApi(data) {
  const boolKeys = [
    'isFlightContinue','isFlightChangeInternalLine','isDivert','isEmergencyLand',
    'hasCargo','hasDutyFree','hasUndecCargo','hasCatering','hasOutOfCatering','hasPassenger',
  ];
  const intKeys = [
    'passengerUnloadThisPort','passengerBabyUnloadThisPort',
    'passengerLoadThisPort','passengerBabyLoadThisPort',
    'passengerUnloadOtherPort','passengerBabyUnloadOtherPort',
    'fuelNational','fuelForeign',
    'cargoLoadThisPortUnit','cargoUnloadThisPortUnit','cargoUnloadOtherPortUnit',
    'cargoLoadThisPortKgm','cargoUnloadThisPortKgm','cargoUnloadOtherPortKgm',
  ];
  boolKeys.forEach(k => { if (data[k] !== undefined) _hvbState[k] = !!data[k]; });
  intKeys.forEach(k  => { if (data[k] !== undefined) _hvbState[k] = parseInt(data[k], 10) || 0; });
  if (data.nextAirPortCode !== undefined) _hvbState.nextAirPortCode = String(data.nextAirPortCode || '').toUpperCase().replace(/\s+/g, '');
  if (data.otherIssues !== undefined) _hvbState.otherIssues = data.otherIssues || 'NILL';
}

function closeHavayoluBeyanModal() {
  document.getElementById('havayoluBeyanOverlay').classList.add('hidden');
  _hvbDeclareIndex = null;
}

function buildHvbFormHtml(d) {
  // toggle — durumu _hvbState'ten okur
  const tog = (label, key) => {
    const active = _hvbState[key];
    const on  = 'background:#1e3a5f;color:#fff';
    const off = 'background:#e2e8f0;color:#64748b';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <span style="font-size:13px;font-weight:500;color:#1e293b;flex:1">${label}</span>
        <div style="display:flex;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;flex-shrink:0">
          <button type="button" id="hvb_${key}_evet" onclick="hvbSetToggle('${key}',true)"
            style="padding:5px 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;${active ? on : off}">Evet</button>
          <button type="button" id="hvb_${key}_hayir" onclick="hvbSetToggle('${key}',false)"
            style="padding:5px 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;${!active ? on : off}">Hayır</button>
        </div>
      </div>`;
  };

  // sayı alanı — değeri _hvbState'ten okur
  const numField = (label, key) => `
    <div style="display:flex;flex-direction:column;gap:4px">
      <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${label}</label>
      <input type="number" min="0" step="1" value="${_hvbState[key] ?? 0}"
        oninput="hvbUpdateInt('${key}',this.value)"
        style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:100%">
    </div>`;

  const section = (title, body) => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.05em;margin-bottom:4px">${title}</div>
      ${body}
    </div>`;

  const isDeparture      = d.flightTypeCode === 'GDS';
  const passengerDisplay = _hvbState.hasPassenger ? 'grid' : 'none';
  const cargoDisplay     = _hvbState.hasCargo     ? 'grid' : 'none';
  const nextAirportDisplay = _hvbState.isFlightContinue ? 'grid' : 'none';
  const cargoFields = isDeparture
    ? `
      ${numField('Bu Limandan Aldığı Yük (Kap Adedi)',        'cargoLoadThisPortUnit')}
      ${numField('Başka Limana Çıkarılacak Yük (Kap Adedi)',  'cargoUnloadOtherPortUnit')}
      ${numField('Bu Limandan Aldığı Yük (KG)',               'cargoLoadThisPortKgm')}
      ${numField('Başka Limana Çıkarılacak Yük (KG)',         'cargoUnloadOtherPortKgm')}
    `
    : `
      ${numField('Bu Limana Çıkarılacak Yük (Kap Adedi)',     'cargoUnloadThisPortUnit')}
      ${numField('Başka Limana Çıkarılacak Yük (Kap Adedi)',  'cargoUnloadOtherPortUnit')}
      ${numField('Bu Limana Çıkarılacak Yük (KG)',            'cargoUnloadThisPortKgm')}
      ${numField('Başka Limana Çıkarılacak Yük (KG)',         'cargoUnloadOtherPortKgm')}
    `;

  return `<div style="display:flex;flex-direction:column;gap:14px">

    ${section('Sefer Bilgisi', `
      <div class="modal-row" style="border-top:none"><span class="lbl">Kuyruk No</span><span class="val">${escapeHtml(d.tailNumber||'—')}</span></div>
      <div class="modal-row"><span class="lbl">Kalkış</span><span class="val">${escapeHtml((d.departurePortText||''))} (${escapeHtml(d.departurePortCode||'')})</span></div>
      <div class="modal-row"><span class="lbl">Varış</span><span class="val">${escapeHtml((d.arrivalPortText||''))} (${escapeHtml(d.arrivalPortCode||'')})</span></div>
      <div class="modal-row"><span class="lbl">Kayıt No</span><span class="val">${escapeHtml(d.recordNumber||'—')}</span></div>`)}

    ${section('Beyan Bilgileri', `
      ${tog('Seferin İç Hat Devamı Var Mı?',   'isFlightContinue')}
      <div id="hvbNextAirportFields" style="display:${nextAirportDisplay};grid-template-columns:1fr;gap:10px;margin-top:10px;margin-bottom:4px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Sonraki İç Hat İstasyonu</label>
          <input type="text" maxlength="3" value="${escapeHtml(_hvbState.nextAirPortCode || '')}"
            oninput="this.value=this.value.toUpperCase().replace(/[^A-Z]/g,'');hvbUpdateText('nextAirPortCode',this.value,{uppercase:true})"
            placeholder="ESB"
            style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:100%;text-transform:uppercase">
        </div>
      </div>
      ${tog('İç Hat Uçuşa Mı Kaydırıldı?',     'isFlightChangeInternalLine')}
      ${tog('Divert Edilmiş Mi?',               'isDivert')}
      ${tog('Acil İniş Mi?',                    'isEmergencyLand')}`)}

    ${section('Yük & İkram', `
      ${tog('Kargo Var Mı?', 'hasCargo')}
      <div id="hvbCargoFields" style="display:${cargoDisplay};grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;margin-bottom:4px">
        ${cargoFields}
      </div>
      ${tog(isDeparture ? 'Uçağa Yüklenecek Gümrüksüz Satış Eşyası Var Mı?' : 'Uçaktan İndirilecek Gümrüksüz Satış Eşyası Var Mı?', 'hasDutyFree')}
      ${tog('Manifestoya Ve Özet Beyana Kaydedilmeyen Eşya Var Mı?',                   'hasUndecCargo')}
      ${tog(isDeparture ? 'Uçağa Yüklenecek İkram Malzemesi Var Mı?' : 'Uçaktan İndirilecek İkram Malzemesi Var Mı?', 'hasCatering')}
      ${tog(isDeparture ? 'Uçağa Yüklenecek ve Yolculara Verilecek İkram Harici Eşya Var Mı?' : 'Uçaktan İndirilecek ve Yolculara Dağıtılmamış İkram Harici Eşya Var Mı?', 'hasOutOfCatering')}`)}

    ${section('Yolcu', `
      ${tog('Yolcu Var Mı?', 'hasPassenger')}
      <div id="hvbPassengerFields" style="display:${passengerDisplay};grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        ${isDeparture
          ? numField('Bu Limandan Aldığı Yolcu Sayısı',       'passengerLoadThisPort')
          : numField('Bu Limana Çıkarılacak Yolcu Sayısı',    'passengerUnloadThisPort')}
        ${isDeparture
          ? numField('Bu Limandan Aldığı Bebek Yolcu Sayısı', 'passengerBabyLoadThisPort')
          : numField('Bu Limana Çıkarılacak Bebek Yolcu Sayısı', 'passengerBabyUnloadThisPort')}
        ${numField('Başka Limana Çıkarılacak Yolcu Sayısı',      'passengerUnloadOtherPort')}
        ${numField('Başka Limana Çıkarılacak Bebek Yolcu Sayısı','passengerBabyUnloadOtherPort')}
      </div>`)}

    ${section('Yakıt', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
        ${numField(isDeparture ? 'Gidişte Beyan Edilen Yakıt Miktarı (Milli) KG'   : 'Gelişte Beyan Edilen Yakıt Miktarı (Milli) KG',   'fuelNational')}
        ${numField(isDeparture ? 'Gidişte Beyan Edilen Yakıt Miktarı (Yabancı) KG' : 'Gelişte Beyan Edilen Yakıt Miktarı (Yabancı) KG', 'fuelForeign')}
      </div>`)}

    ${section('Açıklama', `
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
        <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Açıklama / Diğer Hususlar</label>
        <textarea rows="4"
          oninput="_hvbState.otherIssues=this.value"
          style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical;font-family:inherit;width:100%">${escapeHtml(_hvbState.otherIssues||'NILL')}</textarea>
      </div>`)}

  </div>`;
}

async function submitHavayoluBeyan() {
  const d      = _currentFlightDetail || {};
  const isDep  = d.flightTypeCode === 'GDS';
  const nextAirPortCode = _hvbState.isFlightContinue
    ? String(_hvbState.nextAirPortCode || '').trim().toUpperCase().replace(/\s+/g, '')
    : '';

  if (_hvbState.isFlightContinue && !/^[A-Z]{3}$/.test(nextAirPortCode)) {
    alert('İç hat devamı için 3 harfli sonraki istasyon kodu gir.');
    return;
  }

  const payload = {
    // Kullanıcı girdileri
    isFlightContinue:          _hvbState.isFlightContinue,
    isFlightChangeInternalLine:_hvbState.isFlightChangeInternalLine,
    isDivert:                  _hvbState.isDivert,
    isEmergencyLand:           _hvbState.isEmergencyLand,
    hasCargo:                  _hvbState.hasCargo,
    hasDutyFree:               _hvbState.hasDutyFree,
    hasUndecCargo:             _hvbState.hasUndecCargo,
    hasCatering:               _hvbState.hasCatering,
    hasOutOfCatering:          _hvbState.hasOutOfCatering,
    hasPassenger:              _hvbState.hasPassenger,
    // Geliş: bu limana çıkarılacak | Gidiş: bu limandan alınan
    passengerUnloadThisPort:      (!isDep && _hvbState.hasPassenger) ? _hvbState.passengerUnloadThisPort     : null,
    passengerBabyUnloadThisPort:  (!isDep && _hvbState.hasPassenger) ? _hvbState.passengerBabyUnloadThisPort : null,
    passengerLoadThisPort:        (isDep  && _hvbState.hasPassenger) ? _hvbState.passengerLoadThisPort       : null,
    passengerBabyLoadThisPort:    (isDep  && _hvbState.hasPassenger) ? _hvbState.passengerBabyLoadThisPort   : null,
    passengerUnloadOtherPort:     _hvbState.hasPassenger ? _hvbState.passengerUnloadOtherPort     : null,
    passengerBabyUnloadOtherPort: _hvbState.hasPassenger ? _hvbState.passengerBabyUnloadOtherPort : null,
    fuelNational:  _hvbState.fuelNational,
    fuelForeign:   _hvbState.fuelForeign,
    otherIssues:   _hvbState.otherIssues || 'NILL',
    // Kargo alt alanları — hasCargo false ise null
    cargoUnloadThisPortUnit:  (_hvbState.hasCargo && !isDep) ? _hvbState.cargoUnloadThisPortUnit  : null,
    cargoLoadThisPortUnit:    (_hvbState.hasCargo && isDep)  ? _hvbState.cargoLoadThisPortUnit    : null,
    cargoUnloadOtherPortUnit: _hvbState.hasCargo             ? _hvbState.cargoUnloadOtherPortUnit : null,
    cargoUnloadThisPortKgm:   (_hvbState.hasCargo && !isDep) ? _hvbState.cargoUnloadThisPortKgm   : null,
    cargoLoadThisPortKgm:     (_hvbState.hasCargo && isDep)  ? _hvbState.cargoLoadThisPortKgm     : null,
    cargoUnloadOtherPortKgm:  _hvbState.hasCargo             ? _hvbState.cargoUnloadOtherPortKgm  : null,
    // Statik / uçuştan türetilen alanlar
    afterDecCatering:   false,
    afterDecFuel:       false,
    nextAirPortCode,
    nextDepartureDate:  null,
    nextDepartureTime:  '',
    preAirPortCode:     null,
    flightTypeCode:     d.flightTypeCode || '',
    id:                 '',
    baseId:             _currentFlightBaseId || '',
    seals:              [],
  };

  const btn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    await apiCall('PUT', '/api/Flight/SetAirDec?api-version=1.0', payload);
    closeHavayoluBeyanModal();
    alert('Hava Yolu Beyan Formu başarıyla gönderildi.');
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

function openErrorModal(index) {
  const row = STATE.rows[index];
  if (!row) return;

  const lines = (row._error || 'Bilinmeyen hata')
    .split(/,\s*|\n/)
    .map(s => s.trim())
    .filter(Boolean);

  document.getElementById('errorModalBody').innerHTML =
    lines.map(l => `<div class="error-item">${escapeHtml(l)}</div>`).join('');

  document.getElementById('errorOverlay').classList.remove('hidden');
}

function closeErrorModal() {
  document.getElementById('errorOverlay').classList.add('hidden');
}
