'use strict';

function buildCrewPayload() {
  const crews = _crewParsedList.map(crew => ({
    id: '',
    crewTypeCode: normalizeCrewExcelType(crew.crewTypeCode),
    dateOfBirth: crewDateForApi(crew.dateOfBirth),
    identityCode: normalizeCode(crew.identityCode),
    identityNumber: normalizeIdentityNumber(crew.identityNumber),
    name: normalizePersonName(crew.name),
    surname: normalizePersonName(crew.surname),
    nationalityCode: normalizeNationality(crew.nationalityCode)
  }));

  return {
    baseId: _currentFlightBaseId,
    crews
  };
}

function validateCrewPayload(payload) {
  if (!payload.baseId) {
    return 'Uçuş baseId bulunamadı. Önce uçuş detayını getir.';
  }

  if (!payload.crews.length) {
    return 'Gönderilecek ekip yok.';
  }

  for (let i = 0; i < payload.crews.length; i++) {
    const c = payload.crews[i];

    if (!c.crewTypeCode) {
      return `${i + 1}. satırda görev tipi boş.`;
    }

    if (!c.name) {
      return `${i + 1}. satırda ad boş.`;
    }

    if (!c.surname) {
      return `${i + 1}. satırda soyad boş.`;
    }
  }

  return '';
}

function clearCrewDraftAfterSubmit() {
  _crewPdfFile = null;
  _crewParsedList = [];

  const inputArea = document.getElementById('crewInputArea');
  if (inputArea) inputArea.style.display = 'none';

  const previewBox = document.getElementById('crewPreviewBox');
  const previewBody = document.getElementById('crewPreviewBody');

  if (previewBox) previewBox.style.display = 'none';
  if (previewBody) previewBody.innerHTML = '';

  hideCrewSubmitButton();
}

async function submitCrewBeyan() {
  const btn = document.getElementById('crewSubmitBtn');

  const payload = buildCrewPayload();
  const validationError = validateCrewPayload(payload);

  if (validationError) {
    setCrewStatus('error', validationError);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor...';
  }

  setCrewStatus('info', 'Ekip beyanı HGSB’ye gönderiliyor...');

  try {
    const res = await apiCall('PUT', CREW_SET_ENDPOINT, payload);

    const savedList = normalizeApiCrewList(res);
    _crewExistingList = savedList;

    setCrewStatus('success', `Ekip beyanı gönderildi. ${savedList.length || payload.crews.length} kişi kaydedildi.`);

    clearCrewDraftAfterSubmit();
    renderExistingCrews(savedList.length ? savedList : payload.crews);

  } catch (err) {
    console.error(err);

    if (!err.message.includes('401')) {
      setCrewStatus('error', 'Ekip beyanı gönderilemedi: ' + err.message);
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Onayla ve Gönder';
    }
  }
}
