(function configureOtoBeyan(global) {
  'use strict';

  global.OTOBEYAN_CONFIG = Object.freeze({
    releaseVersion: '1.7.0',
    workerUrl: 'https://igo.yulcaribe.workers.dev',
    mailLookbackHours: 6
  });
})(globalThis);
