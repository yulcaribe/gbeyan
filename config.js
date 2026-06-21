'use strict';

// ─────────────────────────────────────────────
//  App config
// ─────────────────────────────────────────────
const MOCK_MODE    = false;   // ← test MOD
const BASE_URL     = 'https://hgbsapi.ticaret.gov.tr';
const KEY_TOKEN    = 'tgs_bearer';
const KEY_USER     = 'tgs_user';
const KEY_HISTORY  = 'tgs_flight_history';
const HGSB_AUTO_REFRESH_MS = 30 * 1000; // 30 saniye


const REQUIRED_COLS = ['A/C', 'GELİŞ', 'GİDİŞ', 'STA', 'STD', 'TIP', 'REG'];

const NATIONALITY_PREFIX_MAP = {
  'TC':'TR','RA':'RU','LZ':'BG','ER':'MD','YR':'RO',
  'SP':'PL','LY':'LT','9H':'MT','SE':'SE','OM':'SK',
  'LN':'NO','CF':'CA'
};

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
