'use strict';

// ─────────────────────────────────────────────
//  Modal
// ─────────────────────────────────────────────
function openModal(index, force) {
  const row = STATE.rows[index];
  _modalPendingIndex = index;
  _modalForce = force;
  _modalArrManual = false;
  _modalDepManual = false;

  document.getElementById('modalCrewInput').value = STATE.crewNumber;
  document.getElementById('modalCaptainName').value = '';
  document.getElementById('modalWarningBanner').style.display = force ? 'block' : 'none';
  document.getElementById('modalSubtitle').textContent =
    `${row.type} / ${row.flightNo} / ${row.departureAirport} → ${row.arrivalAirport}`;

  setModalEtaDefaults(row);
  setModalFieldVisibility(row);
  setModalStatus('', '');
  document.getElementById('payloadWrap').style.display = 'none';
  document.getElementById('payloadToggleIcon').textContent = '▶';
  const btn = document.getElementById('modalConfirmBtn');
  btn.disabled = false;
  btn.textContent = 'Gönder →';
  btn.onclick = () => confirmAndSend();
  updateModalPreview();

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('modalCrewInput').focus();
}

function setModalEtaDefaults(row) {
  const today = getRowFlightDate(row);
  const time  = normalizeCsvTimeForInput(row.time);
  const m3 = subtractHoursFromDateTime(today, time, 3);
  const p3 = subtractHoursFromDateTime(today, time, -3);

  document.getElementById('modalArrEtaDate').value = today;
  document.getElementById('modalArrEtaTime').value = time;
  document.getElementById('modalDepEtaDate').value = today;
  document.getElementById('modalDepEtaTime').value = time;

  if (row.type === 'GİDİŞ') {
    document.getElementById('modalActualDepDate').value = today;
    document.getElementById('modalActualDepTime').value = time;
    document.getElementById('modalActualArrDate').value = p3.date;
    document.getElementById('modalActualArrTime').value = p3.time;
  } else {
    document.getElementById('modalActualArrDate').value = today;
    document.getElementById('modalActualArrTime').value = time;
    document.getElementById('modalActualDepDate').value = m3.date;
    document.getElementById('modalActualDepTime').value = m3.time;
  }
}

function setModalFieldVisibility(row) {
  const isArr = row.type === 'GELİŞ';
  document.querySelectorAll('.modal-arr-eta').forEach(el => { el.style.display = isArr ? '' : 'none'; });
  document.querySelectorAll('.modal-dep-eta').forEach(el => { el.style.display = isArr ? 'none' : ''; });

  if (isArr) {
    document.getElementById('lblActualArrDate').textContent = 'Gerçek Varış Tarihi';
    document.getElementById('lblActualArrTime').textContent = 'Gerçek Varış Saati';
    document.getElementById('lblActualDepDate').innerHTML = 'Gerçek Kalkış Tarihi <small>(ETA−3s)</small>';
    document.getElementById('lblActualDepTime').innerHTML = 'Gerçek Kalkış Saati <small>(ETA−3s)</small>';
  } else {
    document.getElementById('lblActualArrDate').innerHTML = 'Gerçek Varış Tarihi <small>(ETA+3s)</small>';
    document.getElementById('lblActualArrTime').innerHTML = 'Gerçek Varış Saati <small>(ETA+3s)</small>';
    document.getElementById('lblActualDepDate').textContent = 'Gerçek Kalkış Tarihi';
    document.getElementById('lblActualDepTime').textContent = 'Gerçek Kalkış Saati';
  }
}

function getModalEtaValues() {
  return {
    arrivalDateEta:   document.getElementById('modalArrEtaDate').value,
    arrivalTimeEta:   document.getElementById('modalArrEtaTime').value,
    actualArrDate:    document.getElementById('modalActualArrDate').value,
    actualArrTime:    document.getElementById('modalActualArrTime').value,
    actualDepDate:    document.getElementById('modalActualDepDate').value,
    actualDepTime:    document.getElementById('modalActualDepTime').value,
    departureDateEta: document.getElementById('modalDepEtaDate').value,
    departureTimeEta: document.getElementById('modalDepEtaTime').value
  };
}

function validateModalEtaValues(row, eta) {
  const fail = (message, focusId) => ({ isValid: false, message, focusId });
  if (row.type === 'GELİŞ') {
    if (!eta.arrivalDateEta)  return fail('Geliş ETA tarihi doldurulmalıdır.',     'modalArrEtaDate');
    if (!eta.arrivalTimeEta)  return fail('Geliş ETA saati doldurulmalıdır.',      'modalArrEtaTime');
    if (!eta.actualArrDate)   return fail('Gerçek varış tarihi doldurulmalıdır.',  'modalActualArrDate');
    if (!eta.actualArrTime)   return fail('Gerçek varış saati doldurulmalıdır.',   'modalActualArrTime');
    if (!eta.actualDepDate)   return fail('Gerçek kalkış tarihi doldurulmalıdır.', 'modalActualDepDate');
    if (!eta.actualDepTime)   return fail('Gerçek kalkış saati doldurulmalıdır.',  'modalActualDepTime');
  } else {
    if (!eta.departureDateEta) return fail('Gidiş ETA tarihi doldurulmalıdır.',    'modalDepEtaDate');
    if (!eta.departureTimeEta) return fail('Gidiş ETA saati doldurulmalıdır.',     'modalDepEtaTime');
    if (!eta.actualDepDate)    return fail('Gerçek kalkış tarihi doldurulmalıdır.','modalActualDepDate');
    if (!eta.actualDepTime)    return fail('Gerçek kalkış saati doldurulmalıdır.', 'modalActualDepTime');
    if (!eta.actualArrDate)    return fail('Gerçek varış tarihi doldurulmalıdır.', 'modalActualArrDate');
    if (!eta.actualArrTime)    return fail('Gerçek varış saati doldurulmalıdır.',  'modalActualArrTime');
  }
  return { isValid: true, message: '', focusId: '' };
}

function syncModalArrDerived() {
  const d = document.getElementById('modalArrEtaDate').value;
  const t = document.getElementById('modalArrEtaTime').value;
  if (!_modalArrManual) {
    document.getElementById('modalActualArrDate').value = d;
    document.getElementById('modalActualArrTime').value = t;
  }
  if (!_modalDepManual) {
    const m3 = subtractHoursFromDateTime(d, t, 3);
    document.getElementById('modalActualDepDate').value = m3.date;
    document.getElementById('modalActualDepTime').value = m3.time;
  }
}

function syncModalDepDerived() {
  const d = document.getElementById('modalDepEtaDate').value;
  const t = document.getElementById('modalDepEtaTime').value;
  if (!_modalDepManual) {
    document.getElementById('modalActualDepDate').value = d;
    document.getElementById('modalActualDepTime').value = t;
  }
  if (!_modalArrManual) {
    const p3 = subtractHoursFromDateTime(d, t, -3);
    document.getElementById('modalActualArrDate').value = p3.date;
    document.getElementById('modalActualArrTime').value = p3.time;
  }
}

function onModalCrewInput(val) {
  const n = parseInt(val, 10);
  if (!Number.isNaN(n) && n >= 0) {
    STATE.crewNumber = n;
    const el = document.getElementById('crewInput');
    if (el) el.value = n;
  }
  updateModalPreview();
}

function updateModalPreview() {
  const row = STATE.rows[_modalPendingIndex];
  if (!row) return;

  const crewNum     = parseInt(document.getElementById('modalCrewInput').value, 10);
  const captainName = document.getElementById('modalCaptainName').value.trim();
  const eta         = getModalEtaValues();
  const nat         = getNationalityCode(row.reg);

  document.getElementById('modalSummary').innerHTML =
    buildModalSummary(row, Number.isNaN(crewNum) ? '—' : crewNum, captainName, nat, eta);

  const pre = document.getElementById('modalPayloadPre');
  if (Number.isNaN(crewNum) || crewNum < 0) {
    pre.textContent = 'Geçerli bir crew sayısı giriniz.';
    return;
  }
  const v = validateModalEtaValues(row, eta);
  if (!v.isValid) {
    pre.textContent = 'Önizleme için ' + v.message;
    return;
  }
  try {
    pre.textContent = JSON.stringify(buildPayload(row, crewNum, captainName, eta), null, 2);
  } catch (e) {
    pre.textContent = 'Hata: ' + e.message;
  }
}

function buildModalSummary(row, crewNum, captainName, nat, eta) {
  const isArr   = row.type === 'GELİŞ';
  const etaDate = isArr ? eta.arrivalDateEta    : eta.departureDateEta;
  const etaTime = isArr ? eta.arrivalTimeEta    : eta.departureTimeEta;
  const items = [
    ['Tip',           `${row.type} (${isArr ? 'GLS' : 'GDS'})`],
    ['Tarih',         toHgbDate(getRowFlightDate(row))],
    ['Uçuş No',       row.flightNo],
    ['Güzergah',      `${row.departureAirport}→${row.arrivalAirport}`],
    ['CSV Saat',      row.time],
    [isArr ? 'Geliş ETA' : 'Gidiş ETA', `${etaDate||'—'} ${etaTime||''}`],
    ['Gerçek Varış',  `${eta.actualArrDate||'—'} ${eta.actualArrTime||''}`],
    ['Gerçek Kalkış', `${eta.actualDepDate||'—'} ${eta.actualDepTime||''}`],
    ['Uçak Tipi',     row.hgsbAircraftType],
    ['REG',           row.reg],
    ['Milliyet',      nat],
    ['Crew',          crewNum],
    ['Kaptan',        captainName || '—'],
    ['Mükellef',      STATE.user.taxFirmName],
    ['Yetkili',       STATE.user.userName]
  ];
  return items.map(([l, v]) =>
    `<div class="summary-item"><span>${escapeHtml(l)}</span><strong>${escapeHtml(String(v))}</strong></div>`
  ).join('');
}

function togglePayloadPreview() {
  const wrap = document.getElementById('payloadWrap');
  const icon = document.getElementById('payloadToggleIcon');
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  icon.textContent   = isOpen ? '▶' : '▼';
}

function setModalStatus(type, message) {
  const el = document.getElementById('modalStatusLine');
  if (!el) return;
  el.className = 'modal-status-line';
  if (!type || !message) { el.textContent = ''; return; }
  el.classList.add('show', type);
  el.textContent = message;
}

function confirmAndSend() {
  const index = _modalPendingIndex;
  const force = _modalForce;
  const row   = STATE.rows[index];
  if (!row) return;

  const crewNum     = parseInt(document.getElementById('modalCrewInput').value, 10);
  const captainName = document.getElementById('modalCaptainName').value.trim();
  const eta         = getModalEtaValues();

  if (Number.isNaN(crewNum) || crewNum < 0) {
    setModalStatus('error', 'Crew sayısı geçerli bir sayı olmalıdır.');
    document.getElementById('modalCrewInput').focus();
    return;
  }
  const v = validateModalEtaValues(row, eta);
  if (!v.isValid) {
    setModalStatus('error', v.message);
    document.getElementById(v.focusId)?.focus();
    return;
  }

  STATE.crewNumber    = crewNum;
  _pendingEtaValues   = eta;
  _pendingCaptainName = captainName;

  const btn = document.getElementById('modalConfirmBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor...';
  }
  setModalStatus('info', 'HGSB\'ye gönderiliyor...');

  sendFlight(index, force).then(ok => {
    closeModal();
    if (ok) {
      openSuccessModal(index);
    } else {
      openErrorModal(index);
    }
  });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  _modalPendingIndex = null;
  setModalStatus('', '');
}

// ─────────────────────────────────────────────
//  Send
// ─────────────────────────────────────────────
async function sendFlight(index, force = false) {
  const row = STATE.rows[index];
  if (row._status === 'already_sent' && !force) return false;
  if (row._status === 'sending') return false;

  row._status = 'sending';
  updateRow(index);

  try {
    const eta     = _pendingEtaValues   ?? buildDefaultEtaValues(row);
    const captain = _pendingCaptainName ?? '';
    const crew    = STATE.crewNumber;
    const payload = buildPayload(row, crew, captain, eta);

    let apiId;
    if (MOCK_MODE) {
      await delay(400);
      apiId = 'mock-' + Math.random().toString(36).slice(2, 10);
    } else {
      const data = await apiCall('PUT', '/api/Flight/SetFlight?api-version=1.0', payload);
      apiId = data?.data?.baseId ?? data?.data?.id ?? data?.data ?? '';
    }

    row._status = 'success';
    row._result = { apiId };
    markAsSent(row.id, { flightDate: getRowFlightDate(row), flightNo: row.flightNo, type: row.type, reg: row.reg, apiId });
    updateRow(index);
    return true;

  } catch (err) {
    if (!err.message.includes('401')) {
      row._status = 'error';
      row._error  = err.message;
    }
    updateRow(index);
    return false;
  }
}
