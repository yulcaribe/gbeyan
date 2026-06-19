'use strict';

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────
const MOCK_MODE    = false;   // ← test MOD
const BASE_URL     = 'https://hgbsapi.ticaret.gov.tr';
const KEY_TOKEN    = 'tgs_bearer';
const KEY_USER     = 'tgs_user';
const KEY_HISTORY  = 'tgs_flight_history';
const HGSB_AUTO_REFRESH_MS = 30 * 1000; // 30 saniye

const REQUIRED_COLS = ['A/C', 'GELİŞ', 'GİDİŞ', 'STA', 'STD', 'TIP', 'REG'];



// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
const STATE = {
  token:      null,
  user: { userName: '', taxFirmName: '', taxNumber: '', userType: '', userId: '', userProfileName: '' },
  crewNumber: 6,
  flightDate: todayStr(),
  rows: []
};

let _modalPendingIndex = null;
let _modalForce = false;
let _modalArrManual  = false;
let _modalDepManual  = false;
let _pendingEtaValues   = null;
let _pendingCaptainName = '';
