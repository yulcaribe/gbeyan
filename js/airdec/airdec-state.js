'use strict';

// ── Hava Yolu Beyan — state ──────────────────────────────────────
let _hvbState = {};

function hvbInitState() {
  _hvbState = {
    isFlightContinue:          false,
    isFlightChangeInternalLine:false,
    isDivert:                  false,
    isEmergencyLand:           false,
    hasCargo:                  false,
    hasDutyFree:               false,
    hasUndecCargo:             false,
    hasCatering:               false,
    hasOutOfCatering:          false,
    hasPassenger:              true,
    nextAirPortCode:           '',
    passengerUnloadThisPort:      0,
    passengerBabyUnloadThisPort:  0,
    passengerLoadThisPort:        0,
    passengerBabyLoadThisPort:    0,
    passengerUnloadOtherPort:     0,
    passengerBabyUnloadOtherPort: 0,
    fuelNational:  0,
    fuelForeign:   0,
    otherIssues:   'NILL',
    cargoLoadThisPortUnit:    0,
    cargoUnloadThisPortUnit:  0,
    cargoUnloadOtherPortUnit: 0,
    cargoLoadThisPortKgm:     0,
    cargoUnloadThisPortKgm:   0,
    cargoUnloadOtherPortKgm:  0,
  };
}

function hvbSetToggle(key, val) {
  _hvbState[key] = val;
  const evetBtn  = document.getElementById('hvb_' + key + '_evet');
  const hayirBtn = document.getElementById('hvb_' + key + '_hayir');
  if (evetBtn && hayirBtn) {
    if (val) {
      evetBtn.style.background  = '#1e3a5f'; evetBtn.style.color  = '#fff';
      hayirBtn.style.background = '#e2e8f0'; hayirBtn.style.color = '#64748b';
    } else {
      hayirBtn.style.background = '#1e3a5f'; hayirBtn.style.color = '#fff';
      evetBtn.style.background  = '#e2e8f0'; evetBtn.style.color  = '#64748b';
    }
  }
  if (key === 'hasPassenger') {
    const pf = document.getElementById('hvbPassengerFields');
    if (pf) pf.style.display = val ? 'grid' : 'none';
  }
  if (key === 'hasCargo') {
    const cf = document.getElementById('hvbCargoFields');
    if (cf) cf.style.display = val ? 'grid' : 'none';
  }
  if (key === 'isFlightContinue') {
    const nf = document.getElementById('hvbNextAirportFields');
    if (nf) nf.style.display = val ? 'grid' : 'none';
    if (!val) _hvbState.nextAirPortCode = '';
  }
}

function hvbUpdateInt(key, raw) {
  const n = parseInt(raw, 10);
  _hvbState[key] = isNaN(n) ? 0 : n;
}

function hvbUpdateText(key, raw, opts = {}) {
  let value = String(raw ?? '').trim();
  if (opts.uppercase) value = value.toUpperCase().replace(/\s+/g, '');
  _hvbState[key] = value;
}
