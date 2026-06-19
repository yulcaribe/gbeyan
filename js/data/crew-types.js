'use strict';

const CREW_TYPE_LABELS = {
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

const GENDEC_TYPE_MAP = {
  CP: 'CP',
  CPT: 'CP',
  CAPT: 'CP',
  PIC: 'CP',

  FO: 'FO',
  SO: 'SO',
  TO: 'TO',
  FE: 'FE',

  CM: 'CM',
  SCCM: 'CM',

  CA: 'CA',
  CCM: 'CA',
  ACM: 'CA',

  LM: 'LM',
  FC: 'FC'
};

const GENDEC_ROLE_PATTERN = '(?:CP|FO|SO|TO|FE|CM|CA|LM|FC|SCCM|CCM\\d*|CCM|ACM\\d*|ACM|CPT|CAPT|PIC)';

const GENDER_CODES = new Set(['M', 'F', 'MALE', 'FEMALE']);
