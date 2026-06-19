'use strict';

// ── Hava Yolu Beyan — modal ──────────────────────────────────────
let _hvbDeclareIndex = null;

function hvbYesNo(value) {
  return value ? 'Evet' : 'Hayır';
}

function hvbReadonlySection(title, body) {
  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.05em;margin-bottom:4px">${title}</div>
      ${body}
    </div>`;
}

function hvbReadonlyRow(label, value) {
  return `<div class="modal-row"><span class="lbl">${escapeHtml(label)}</span><span class="val">${escapeHtml(value ?? '—')}</span></div>`;
}

const HVB_READONLY_CREW_TYPE_LABELS = {
  CM: 'KABİN AMİRİ',
  CP: 'KAPTAN PİLOT',
  FO: '1. YARDIMCI PİLOT',
  SO: '2. YARDIMCI PİLOT',
  TO: '3. YARDIMCI PİLOT',
  FE: 'UÇUŞ MÜHENDİSİ',
  CA: 'KABİN GÖREVLİSİ',
  LM: 'YÜK SORUMLUSU',
  FC: 'MÜRETTEBAT'
};

function getCrewField(item, keys) {
  for (const key of keys) {
    if (item && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
      return item[key];
    }
  }
  return '';
}

function buildHvbCrewReadonlyHtml(list, errorMessage) {
  if (errorMessage) {
    return hvbReadonlySection('Ekip Listesi', `
      <div class="alert alert-warning" style="margin:0">
        Ekip listesi sorgulanamadı: ${escapeHtml(errorMessage)}
      </div>
    `);
  }

  if (!Array.isArray(list) || !list.length) {
    return hvbReadonlySection('Ekip Listesi', `
      ${hvbReadonlyRow('Kayıtlı Ekip Sayısı', 0)}
      <div style="font-size:13px;color:#64748b;padding-top:8px">Bu uçuş için sistemde kayıtlı ekip bulunamadı.</div>
    `);
  }

  const cards = list.map((item, i) => {
    const typeCode = String(getCrewField(item, ['crewTypeCode', 'typeCode', 'crewType', 'positionCode'])).toUpperCase();
    const typeText = getCrewField(item, ['crewTypeText', 'typeText', 'positionText']) || HVB_READONLY_CREW_TYPE_LABELS[typeCode] || '';
    const name = getCrewField(item, ['name', 'firstName', 'givenName']);
    const surname = getCrewField(item, ['surname', 'lastName', 'familyName']);
    const fullName = [name, surname].filter(Boolean).join(' ') || getCrewField(item, ['nameSurname', 'fullName', 'crewName']);
    const nationality = getCrewField(item, ['nationalityCode', 'nationalityText', 'nationality']);
    const identityCode = getCrewField(item, ['identityCode', 'documentTypeCode', 'documentType']);
    const identityNumber = getCrewField(item, ['identityNumber', 'passportNumber', 'documentNumber']);

    return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:10px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px">
          <strong style="font-size:13px;color:#1e293b">#${i + 1} ${escapeHtml(fullName || 'İsimsiz Ekip')}</strong>
          <span style="font-size:12px;color:#64748b">${escapeHtml(typeCode + (typeText ? ' - ' + typeText : ''))}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12px;color:#475569">
          <div><strong>Milliyet:</strong> ${escapeHtml(nationality || '—')}</div>
          <div><strong>Belge:</strong> ${escapeHtml([identityCode, identityNumber].filter(Boolean).join(' / ') || '—')}</div>
        </div>
      </div>`;
  }).join('');

  return hvbReadonlySection('Ekip Listesi', `
    ${hvbReadonlyRow('Kayıtlı Ekip Sayısı', list.length)}
    ${cards}
  `);
}

function buildHvbReadonlyHtml(d, row, crewList = [], crewError = '') {
  const isDeparture = d.flightTypeCode === 'GDS';
  const statusLine = [d.statusCode, d.statusText].filter(Boolean).join(' — ') || getHGBSStatusLabel(row);

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div class="alert alert-info" style="margin-bottom:0">
      Bu ekran bilgi amaçlıdır. Alanlar değiştirilemez. Onayla ve Gönder dersen uçuş Gümrüğe Sunuldu durumuna alınır.
    </div>

    ${hvbReadonlySection('Uçuş Bilgisi', `
      ${hvbReadonlyRow('Durum', statusLine)}
      ${hvbReadonlyRow('Kayıt No', d.recordNumber || '—')}
      ${hvbReadonlyRow('Referans No', d.referenceNumber || '—')}
      ${hvbReadonlyRow('Uçuş No', d.flightNumber || row?.flightNo || '—')}
      ${hvbReadonlyRow('Tip', d.flightTypeText || d.flightTypeCode || row?.type || '—')}
      ${hvbReadonlyRow('Kuyruk / REG', d.tailNumber || row?.reg || '—')}
      ${hvbReadonlyRow('Kalkış', `${d.departurePortText || ''} (${d.departurePortCode || row?.departureAirport || '—'})`)}
      ${hvbReadonlyRow('Varış', `${d.arrivalPortText || ''} (${d.arrivalPortCode || row?.arrivalAirport || '—'})`)}
      ${hvbReadonlyRow('Şirket', d.companyInfo || d.companyCode || '—')}
    `)}

    ${hvbReadonlySection('Ekip Bilgisi', `
      ${hvbReadonlyRow('Kaptan', d.captainNameSurname || '—')}
      ${hvbReadonlyRow('Crew Sayısı', d.crewNumber ?? STATE.crewNumber ?? '—')}
      ${hvbReadonlyRow('Kayıtlı Ekip Sayısı', Array.isArray(crewList) ? crewList.length : 0)}
      ${hvbReadonlyRow('Mükellef', d.declarant || STATE.user.taxFirmName || '—')}
      ${hvbReadonlyRow('Yetkili', d.authAgentNameSurname || STATE.user.userName || '—')}
    `)}

    ${buildHvbCrewReadonlyHtml(crewList, crewError)}

    ${hvbReadonlySection('Hava Yolu Beyan Formu', `
      ${hvbReadonlyRow('Seferin İç Hat Devamı Var Mı?', hvbYesNo(_hvbState.isFlightContinue))}
      ${_hvbState.isFlightContinue ? hvbReadonlyRow('Sonraki İç Hat İstasyonu', _hvbState.nextAirPortCode || '—') : ''}
      ${hvbReadonlyRow('İç Hat Uçuşa Mı Kaydırıldı?', hvbYesNo(_hvbState.isFlightChangeInternalLine))}
      ${hvbReadonlyRow('Divert Edilmiş Mi?', hvbYesNo(_hvbState.isDivert))}
      ${hvbReadonlyRow('Acil İniş Mi?', hvbYesNo(_hvbState.isEmergencyLand))}
      ${hvbReadonlyRow('Kargo Var Mı?', hvbYesNo(_hvbState.hasCargo))}
      ${hvbReadonlyRow(isDeparture ? 'Uçağa Yüklenecek Gümrüksüz Satış Eşyası Var Mı?' : 'Uçaktan İndirilecek Gümrüksüz Satış Eşyası Var Mı?', hvbYesNo(_hvbState.hasDutyFree))}
      ${hvbReadonlyRow('Manifestoya Ve Özet Beyana Kaydedilmeyen Eşya Var Mı?', hvbYesNo(_hvbState.hasUndecCargo))}
      ${hvbReadonlyRow(isDeparture ? 'Uçağa Yüklenecek İkram Malzemesi Var Mı?' : 'Uçaktan İndirilecek İkram Malzemesi Var Mı?', hvbYesNo(_hvbState.hasCatering))}
      ${hvbReadonlyRow(isDeparture ? 'Uçağa Yüklenecek ve Yolculara Verilecek İkram Harici Eşya Var Mı?' : 'Uçaktan İndirilecek ve Yolculara Dağıtılmamış İkram Harici Eşya Var Mı?', hvbYesNo(_hvbState.hasOutOfCatering))}
      ${hvbReadonlyRow('Yolcu Var Mı?', hvbYesNo(_hvbState.hasPassenger))}
    `)}

    ${hvbReadonlySection('Yolcu / Yük / Yakıt', `
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Yolcu Sayısı' : 'Bu Limana Çıkarılacak Yolcu Sayısı', isDeparture ? _hvbState.passengerLoadThisPort : _hvbState.passengerUnloadThisPort)}
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Bebek Yolcu Sayısı' : 'Bu Limana Çıkarılacak Bebek Yolcu Sayısı', isDeparture ? _hvbState.passengerBabyLoadThisPort : _hvbState.passengerBabyUnloadThisPort)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Yolcu Sayısı', _hvbState.passengerUnloadOtherPort)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Bebek Yolcu Sayısı', _hvbState.passengerBabyUnloadOtherPort)}
      ${hvbReadonlyRow('Yakıt Miktarı Milli KG', _hvbState.fuelNational)}
      ${hvbReadonlyRow('Yakıt Miktarı Yabancı KG', _hvbState.fuelForeign)}
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Yük Kap Adedi' : 'Bu Limana Çıkarılacak Yük Kap Adedi', isDeparture ? _hvbState.cargoLoadThisPortUnit : _hvbState.cargoUnloadThisPortUnit)}
      ${hvbReadonlyRow(isDeparture ? 'Bu Limandan Aldığı Yük KG' : 'Bu Limana Çıkarılacak Yük KG', isDeparture ? _hvbState.cargoLoadThisPortKgm : _hvbState.cargoUnloadThisPortKgm)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Yük Kap Adedi', _hvbState.cargoUnloadOtherPortUnit)}
      ${hvbReadonlyRow('Başka Limana Çıkarılacak Yük KG', _hvbState.cargoUnloadOtherPortKgm)}
      ${hvbReadonlyRow('Açıklama / Diğer Hususlar', _hvbState.otherIssues || 'NILL')}
    `)}
  </div>`;
}

async function openDeclareHavayoluBeyanModal(index) {
  const row = STATE.rows[index];
  if (!row) return;

  const apiId = getRowApiId(row);
  if (!apiId) {
    alert('Beyan için HGBS API ID bulunamadı. Önce HGBS kayıtlarını yenile.');
    return;
  }

  _hvbDeclareIndex = index;
  _currentFlightBaseId = apiId;
  _currentFlightDetail = null;
  hvbInitState();

  const declareButtonText = isWithdrawnFlight(row) ? 'Tekrar Beyan Et' : 'Onayla ve Gönder';
  const btn = document.querySelector('#havayoluBeyanOverlay .btn-primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = declareButtonText;
    btn.onclick = () => submitHavayoluBeyanStatusAction();
  }

  document.getElementById('hvbModalSubtitle').textContent = `${row.type} / ${row.flightNo} / ${row.departureAirport} → ${row.arrivalAirport}`;
  document.getElementById('hvbModalBody').innerHTML =
    `<div style="text-align:center;padding:40px 0;color:#64748b;font-size:13px">Hava yolu beyan formu yükleniyor...</div>`;
  document.getElementById('havayoluBeyanOverlay').classList.remove('hidden');

  try {
    const flightRes = await apiCall('GET', `/api/Flight/GetFlight?baseId=${encodeURIComponent(apiId)}&api-version=1.0`);
    const detail = flightRes?.data || flightRes;

    if (!detail) {
      throw new Error('HGBS uçuş detayı boş döndü.');
    }

    _currentFlightDetail = detail;

    try {
      const airDecRes = await apiCall('GET', `/api/Flight/GetAirDec?baseId=${encodeURIComponent(apiId)}&api-version=1.0`);
      if (airDecRes && airDecRes.data) hvbPopulateFromApi(airDecRes.data);
    } catch (_) {
      // Hava yolu beyan kaydı yoksa default değerlerle bilgi ekranı gösterilir.
    }

    let crewList = [];
    let crewError = '';
    try {
      if (typeof CREW_GET_ENDPOINT === 'function' && typeof normalizeApiCrewList === 'function') {
        const crewRes = await apiCall('GET', CREW_GET_ENDPOINT(apiId));
        crewList = normalizeApiCrewList(crewRes);
      }
    } catch (crewErr) {
      crewError = crewErr.message || String(crewErr);
    }

    document.getElementById('hvbModalSubtitle').textContent = [detail.tailNumber, detail.departurePortCode, detail.arrivalPortCode].filter(Boolean).join(' · ');
    document.getElementById('hvbModalBody').innerHTML = buildHvbReadonlyHtml(detail, row, crewList, crewError);

    if (btn) btn.disabled = false;

  } catch (err) {
    document.getElementById('hvbModalBody').innerHTML = `
      <div class="alert alert-error" style="margin-bottom:0">
        ${escapeHtml(err.message)}
      </div>`;
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
