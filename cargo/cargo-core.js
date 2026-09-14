/*
 * Version: v1.6.0e
 * Cargo manifest management.
 * Manual entry lives here; PDF and Excel parsers can be added as separate files later.
 */
'use strict';

(function initCargoManifest(global) {
  const CARGO_TYPES_PATH = '/api/Lookups/CargoTypes?api-version=1.0';
  const CARGO_SET_PATH = '/api/Flight/SetCargos?api-version=1.0';

  function cargoDeletePath(id, baseId) {
    return `/api/Flight/DeleteCargo?id=${encodeURIComponent(id)}&baseId=${encodeURIComponent(baseId)}&api-version=1.0`;
  }

  const state = {
    baseId: '',
    detail: null,
    types: [],
    rows: [],
    deletedCargoIds: [],
    initialCount: 0,
    cargosLoaded: false,
    cargoLoadError: '',
    typeLoadError: '',
    airDecKnown: false,
    airDecHasCargo: false,
    airDecData: null,
    airDecError: '',
    updateAirDec: false,
    saving: false,
    dirty: false,
    loadRevision: 0,
    saveRevision: 0
  };

  function cargoGetPath(baseId) {
    return `/api/Flight/GetCargos?baseId=${encodeURIComponent(baseId)}&api-version=1.0`;
  }

  function airDecGetPath(baseId) {
    return `/api/Flight/GetAirDec?baseId=${encodeURIComponent(baseId)}&api-version=1.0`;
  }

  function callApi(method, path, body) {
    if (typeof apiCall !== 'function') {
      return Promise.reject(new Error('API bağlantısı hazır değil. Sayfayı yenileyip tekrar dene.'));
    }
    return apiCall(method, path, body);
  }

  function currentFlightDetail() {
    try {
      return typeof _currentFlightDetail !== 'undefined' ? _currentFlightDetail : null;
    } catch (_) {
      return null;
    }
  }

  function currentFlightBaseId() {
    try {
      return typeof _currentFlightBaseId !== 'undefined' ? _currentFlightBaseId : '';
    } catch (_) {
      return '';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function normalizeCode(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3);
  }

  function normalizeText(value) {
    return String(value ?? '').trim();
  }

  function parseDecimal(value) {
    const raw = String(value ?? '').trim().replace(/\s+/g, '');
    if (!raw || !/^\d[\d.,]*$/.test(raw)) return NaN;

    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    let normalized = raw;

    if (lastComma >= 0 && lastDot >= 0) {
      const decimalSeparator = lastComma > lastDot ? ',' : '.';
      const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
      const parts = raw.split(decimalSeparator);
      if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return NaN;

      const groups = parts[0].split(groupingSeparator);
      if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(group => !/^\d{3}$/.test(group)))) {
        return NaN;
      }
      if (groups.some(group => !/^\d+$/.test(group))) return NaN;
      normalized = `${groups.join('')}.${parts[1]}`;
    } else if (lastComma >= 0) {
      if ((raw.match(/,/g) || []).length !== 1) return NaN;
      normalized = raw.replace(',', '.');
    } else if (lastDot >= 0 && (raw.match(/\./g) || []).length !== 1) {
      return NaN;
    }

    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return NaN;
    return Number(normalized);
  }

  function normalizeCargoTypes(response) {
    const source = Array.isArray(response)
      ? response
      : Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.items)
          ? response.data.items
          : Array.isArray(response?.items)
            ? response.items
            : [];

    const seen = new Set();
    return source.reduce((items, item) => {
      const value = normalizeCode(item?.value ?? item?.code);
      if (!value || seen.has(value)) return items;
      seen.add(value);
      items.push({
        value,
        label: normalizeText(item?.label ?? item?.text),
        optionalLabel: item?.optionalLabel ?? null
      });
      return items;
    }, []);
  }

  function normalizeCargoList(response) {
    const source = Array.isArray(response)
      ? response
      : Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.cargos)
          ? response.data.cargos
          : Array.isArray(response?.data?.items)
            ? response.data.items
            : Array.isArray(response?.cargos)
              ? response.cargos
              : [];

    return source.map(item => ({
      ...item,
      id: normalizeText(item?.id),
      cargoTypeCode: normalizeCode(item?.cargoTypeCode),
      awbNumber: normalizeText(item?.awbNumber),
      goodDesc: normalizeText(item?.goodDesc),
      portOrgCode: normalizeCode(item?.portOrgCode),
      portDesCode: normalizeCode(item?.portDesCode),
      portTraCode: normalizeCode(item?.portTraCode),
      grossKgm: item?.grossKgm ?? '',
      numOfPsc: item?.numOfPsc ?? ''
    }));
  }

  async function getCargos(baseId) {
    if (!baseId) throw new Error('Kargo sorgusu için baseId bulunamadı.');
    const response = await callApi('GET', cargoGetPath(baseId));
    return normalizeCargoList(response);
  }

  function emptyRow() {
    const detail = state.detail || {};
    return {
      id: '',
      cargoTypeCode: '',
      awbNumber: '',
      goodDesc: '',
      portOrgCode: normalizeCode(detail.departurePortCode),
      portDesCode: normalizeCode(detail.arrivalPortCode),
      portTraCode: '',
      grossKgm: '',
      numOfPsc: '',
      handlingCodes: [],
      isOfficialUse: false
    };
  }

  function overlayElement() {
    return document.getElementById('cargoManifestOverlay');
  }

  function bodyElement() {
    return document.getElementById('cargoManifestBody');
  }

  function saveButton() {
    return document.getElementById('cargoManifestSaveBtn');
  }

  function setSaving(saving) {
    state.saving = saving;
    const overlay = overlayElement();
    overlay?.querySelectorAll('input, button').forEach(control => {
      control.disabled = saving;
    });
    const button = saveButton();
    if (!button) return;
    button.disabled = saving;
    button.textContent = saving ? 'Kaydediliyor...' : 'Manifestoyu Kaydet';
  }

  function setStatus(type, message) {
    const element = document.getElementById('cargoManifestStatus');
    if (!element) return;
    element.className = 'modal-status-line';
    element.textContent = '';
    if (!type || !message) return;
    element.classList.add('show', type);
    element.textContent = message;
  }

  function typeLabel(code) {
    const match = state.types.find(item => item.value === normalizeCode(code));
    return match?.label || '';
  }

  function typeOptionsHtml() {
    return state.types.map(item => (
      `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label || item.value)}</option>`
    )).join('');
  }

  function formatDecimal(value) {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
  }

  function warningHtml() {
    const warnings = [];

    if (!state.airDecKnown) {
      warnings.push(`
        <div class="alert alert-warning cargo-alert">
          Hava Yolu Beyanındaki <strong>Kargo Var</strong> seçimi henüz yapılmamış veya okunamamış olabilir.
          Manifest girişine devam edebilirsin; Hava Yolu Beyanını daha sonra açıp güncelleyebilirsin.
        </div>`);
    } else if (!state.airDecHasCargo) {
      warnings.push(`
        <div class="alert alert-warning cargo-alert">
          Hava Yolu Beyanında <strong>Kargo Var: Hayır</strong> görünüyor.
          Bu yalnızca bir uyarıdır; manifest girişine devam edip beyanı daha sonra güncelleyebilirsin.
        </div>`);
    }

    if (state.cargoLoadError) {
      warnings.push(`
        <div class="alert alert-error cargo-alert">
          Mevcut kargolar sorgulanamadı: ${escapeHtml(state.cargoLoadError)}
          Yeni satır girebilirsin; kaydetmeden önce mevcut kayıtların üzerine yazma riski ayrıca sorulacaktır.
        </div>`);
    }

    if (state.typeLoadError) {
      warnings.push(`
        <div class="alert alert-warning cargo-alert">
          Kargo tipleri alınamadı: ${escapeHtml(state.typeLoadError)} Kod alanına üç harfli tipi elle girebilirsin.
        </div>`);
    }

    const protectedCount = state.rows.filter(row => row?.isOfficialUse || (Array.isArray(row?.handlingCodes) && row.handlingCodes.length)).length;
    if (protectedCount) {
      warnings.push(`
        <div class="alert alert-warning cargo-alert">
          ${protectedCount} mevcut kayıtta resmi kullanım veya handling code bilgisi bulunuyor.
          Kaydetmeden önce bu satırları dikkatle kontrol et.
        </div>`);
    }

    return warnings.join('');
  }

  function rowHtml(row, index) {
    const typeDescription = typeLabel(row.cargoTypeCode) || row.cargoTypeText || '';
    const metadata = [];
    if (row.isOfficialUse) metadata.push('Resmi kullanım');
    if (Array.isArray(row.handlingCodes) && row.handlingCodes.length) metadata.push(`${row.handlingCodes.length} handling code`);

    return `
      <article class="cargo-card" data-cargo-index="${index}">
        <div class="cargo-card-head">
          <div>
            <strong>Kargo #${index + 1}</strong>
            ${row.id ? `<span class="cargo-record-id">Kayıtlı · ${escapeHtml(row.id)}</span>` : '<span class="cargo-record-new">Yeni kayıt</span>'}
          </div>
          <button type="button" class="cargo-remove-btn" onclick="CargoManifest.removeRow(${index})" aria-label="Kargo satırını kaldır">
            Satırı Kaldır
          </button>
        </div>

        ${metadata.length ? `<div class="cargo-row-warning">⚠️ ${escapeHtml(metadata.join(' · '))}</div>` : ''}

        <div class="cargo-grid">
          <div class="cargo-field cargo-field-wide">
            <label for="cargoType_${index}">Kargo Tipi *</label>
            <input id="cargoType_${index}" list="cargoTypeOptions" maxlength="3"
              value="${escapeHtml(row.cargoTypeCode)}" placeholder="Örn: PER"
              oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);CargoManifest.updateField(${index},'cargoTypeCode',this.value)">
            <small>${escapeHtml(typeDescription || 'Kod yazarak listede arayabilirsin.')}</small>
          </div>

          <div class="cargo-field">
            <label for="cargoAwb_${index}">AWB Numarası</label>
            <input id="cargoAwb_${index}" type="text" value="${escapeHtml(row.awbNumber)}" placeholder="Örn: 123123"
              oninput="CargoManifest.updateField(${index},'awbNumber',this.value)">
          </div>

          <div class="cargo-field cargo-field-wide">
            <label for="cargoDesc_${index}">Eşya Açıklaması</label>
            <input id="cargoDesc_${index}" type="text" value="${escapeHtml(row.goodDesc)}" placeholder="Örn: ÇİÇEK"
              oninput="CargoManifest.updateField(${index},'goodDesc',this.value)">
          </div>

          <div class="cargo-field">
            <label for="cargoOrg_${index}">Kalkış Meydanı *</label>
            <input id="cargoOrg_${index}" type="text" maxlength="3" value="${escapeHtml(row.portOrgCode)}"
              oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);CargoManifest.updateField(${index},'portOrgCode',this.value)">
          </div>

          <div class="cargo-field">
            <label for="cargoDes_${index}">Varış Meydanı *</label>
            <input id="cargoDes_${index}" type="text" maxlength="3" value="${escapeHtml(row.portDesCode)}"
              oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);CargoManifest.updateField(${index},'portDesCode',this.value)">
          </div>

          <div class="cargo-field">
            <label for="cargoTra_${index}">Transfer Meydanı</label>
            <input id="cargoTra_${index}" type="text" maxlength="3" value="${escapeHtml(row.portTraCode)}" placeholder="Opsiyonel"
              oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);CargoManifest.updateField(${index},'portTraCode',this.value)">
          </div>

          <div class="cargo-field">
            <label for="cargoGross_${index}">Brüt KG *</label>
            <input id="cargoGross_${index}" type="text" inputmode="decimal" value="${escapeHtml(row.grossKgm)}" placeholder="0,00"
              oninput="CargoManifest.updateField(${index},'grossKgm',this.value)">
          </div>

          <div class="cargo-field">
            <label for="cargoPieces_${index}">Parça / Kap *</label>
            <input id="cargoPieces_${index}" type="number" min="1" step="1" value="${escapeHtml(row.numOfPsc)}" placeholder="1"
              oninput="CargoManifest.updateField(${index},'numOfPsc',this.value)">
          </div>
        </div>
      </article>`;
  }

  function render() {
    const body = bodyElement();
    if (!body) return;

    body.innerHTML = `
      ${warningHtml()}
      <div class="cargo-toolbar">
        <div>
          <strong>${state.rows.length} kargo satırı</strong>
          <span>Değişiklikler yalnız “Manifestoyu Kaydet” ile HGBS'ye gönderilir.</span>
        </div>
        <div class="cargo-toolbar-actions">
          <button type="button" class="btn btn-outline" onclick="CargoManifest.reload()">↻ Yenile</button>
          <button type="button" class="btn btn-secondary" onclick="CargoManifest.addRow()">+ Kargo Ekle</button>
        </div>
      </div>

      <datalist id="cargoTypeOptions">${typeOptionsHtml()}</datalist>

      <div class="cargo-list">
        ${state.rows.length
          ? state.rows.map(rowHtml).join('')
          : `<div class="cargo-empty">
               Bu uçuş için formda kargo satırı yok.
               <button type="button" class="btn btn-secondary" onclick="CargoManifest.addRow()">+ İlk Kargoyu Ekle</button>
             </div>`}
      </div>

      <label class="cargo-airdec-option" for="cargoUpdateAirDec">
        <input id="cargoUpdateAirDec" type="checkbox" ${state.updateAirDec ? 'checked' : ''}
          onchange="CargoManifest.setUpdateAirDec(this.checked)">
        <span>
          <strong>HAVA YOLU BEYAN FORMUNU CGO MANİFESTOSUNA GÖRE GÜNCELLE</strong>
          <small>
            Opsiyoneldir ve varsayılan olarak kapalıdır. Manifest boşsa “Kargo Var: Hayır”; doluysa toplam kap ve KG bilgisi uçuş yönüne göre güncellenir.
          </small>
        </span>
      </label>

      <div id="cargoManifestStatus" class="modal-status-line"></div>`;

    setSaving(state.saving);
  }

  function renderLoading() {
    const body = bodyElement();
    if (!body) return;
    body.innerHTML = `
      <div class="cargo-loading">
        <span class="spinner"></span>
        Kargo tipleri ve mevcut manifest sorgulanıyor...
      </div>`;
  }

  function addRow() {
    if (state.saving) return;
    state.rows.push(emptyRow());
    state.dirty = true;
    render();
    const index = state.rows.length - 1;
    document.getElementById(`cargoType_${index}`)?.focus();
  }

  function removeRow(index) {
    if (state.saving) return;
    const row = state.rows[index];
    if (!row) return;

    const cargoId = normalizeText(row.id);
    if (cargoId && !state.deletedCargoIds.includes(cargoId)) {
      state.deletedCargoIds.push(cargoId);
    }

    state.rows.splice(index, 1);
    state.dirty = true;
    render();
    setStatus('info', cargoId
      ? 'Kayıtlı satır kaldırıldı. Manifestoyu kaydettiğinde HGBS kaydı da silinecek.'
      : 'Yeni satır formdan kaldırıldı.');
  }

  function updateField(index, field, value) {
    if (state.saving) return;
    const row = state.rows[index];
    if (!row) return;
    state.dirty = true;

    if (['cargoTypeCode', 'portOrgCode', 'portDesCode', 'portTraCode'].includes(field)) {
      row[field] = normalizeCode(value);
      if (field === 'cargoTypeCode') {
        const note = document.querySelector(`[data-cargo-index="${index}"] #cargoType_${index} + small`);
        if (note) note.textContent = typeLabel(row[field]) || 'Listede olmayan bir kod girildi.';
      }
      return;
    }

    if (['awbNumber', 'goodDesc', 'grossKgm', 'numOfPsc'].includes(field)) {
      row[field] = value;
    }
  }

  function setUpdateAirDec(checked) {
    if (state.saving) return;
    state.updateAirDec = !!checked;
  }

  function isBlankRow(row) {
    return !normalizeText(row.cargoTypeCode) &&
      !normalizeText(row.awbNumber) &&
      !normalizeText(row.goodDesc) &&
      !normalizeText(row.grossKgm) &&
      !normalizeText(row.numOfPsc);
  }

  function validateRows(rows) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const number = index + 1;
      const type = normalizeCode(row.cargoTypeCode);
      const origin = normalizeCode(row.portOrgCode);
      const destination = normalizeCode(row.portDesCode);
      const transfer = normalizeCode(row.portTraCode);
      const gross = parseDecimal(row.grossKgm);
      const pieces = Number(row.numOfPsc);

      if (!/^[A-Z0-9]{3}$/.test(type)) return `Kargo #${number}: üç karakterli kargo tipi seçmelisin.`;
      if (state.types.length && !state.types.some(item => item.value === type)) {
        return `Kargo #${number}: “${type}” kargo tipi resmi seçenek listesinde bulunmuyor.`;
      }
      if (!/^[A-Z0-9]{3}$/.test(origin)) return `Kargo #${number}: geçerli bir kalkış meydanı gir.`;
      if (!/^[A-Z0-9]{3}$/.test(destination)) return `Kargo #${number}: geçerli bir varış meydanı gir.`;
      if (row.portTraCode && !/^[A-Z0-9]{3}$/.test(transfer)) return `Kargo #${number}: transfer meydanı üç karakter olmalı.`;
      if (!Number.isFinite(gross) || gross <= 0) return `Kargo #${number}: brüt KG sıfırdan büyük olmalı.`;
      if (!Number.isInteger(pieces) || pieces <= 0) return `Kargo #${number}: parça/kap adedi pozitif tam sayı olmalı.`;
    }
    return '';
  }

  function payloadRow(row) {
    return {
      id: normalizeText(row.id),
      cargoTypeCode: normalizeCode(row.cargoTypeCode),
      awbNumber: normalizeText(row.awbNumber),
      goodDesc: normalizeText(row.goodDesc),
      portOrgCode: normalizeCode(row.portOrgCode),
      portDesCode: normalizeCode(row.portDesCode),
      portTraCode: normalizeCode(row.portTraCode),
      grossKgm: parseDecimal(row.grossKgm),
      numOfPsc: Number(row.numOfPsc)
    };
  }

  async function updateAirDecFromCargos(cargos) {
    if (typeof global.updateAirDecCargoFromManifest !== 'function') {
      throw new Error('Hava Yolu Beyanı güncelleme bağlantısı hazır değil.');
    }
    return global.updateAirDecCargoFromManifest(
      state.baseId,
      state.detail,
      cargos,
      state.airDecData
    );
  }

  async function save() {
    if (state.saving || !state.baseId) return;

    const meaningfulRows = state.rows.filter(row => !isBlankRow(row));
    const shouldUpdateAirDec = state.updateAirDec;
    const pendingDeleteIds = [...state.deletedCargoIds];
    const validationError = validateRows(meaningfulRows);

    if (validationError) {
      setStatus('error', validationError);
      return;
    }

    if (!meaningfulRows.length && !state.initialCount && !pendingDeleteIds.length && !shouldUpdateAirDec) {
      setStatus('info', 'Kaydedilecek bir kargo satırı bulunmuyor. Önce kargo ekle.');
      return;
    }

    if (!state.cargosLoaded) {
      const continueWithoutList = global.confirm(
        'Mevcut manifest sorgulanamadı. Bu şekilde kaydetmek daha önce girilmiş kayıtları etkileyebilir. Yine de devam etmek istiyor musun?'
      );
      if (!continueWithoutList) return;
    }

    if (!meaningfulRows.length && state.initialCount) {
      const clearManifest = global.confirm(
        'Manifestteki tüm satırlar kaldırıldı. Kayıtlı kargolar HGBS’den silinecek. Devam etmek istiyor musun?'
      );
      if (!clearManifest) return;
    }

    const payload = {
      baseId: state.baseId,
      cargos: meaningfulRows.map(payloadRow)
    };

    const requestedBaseId = payload.baseId;
    const revision = ++state.saveRevision;

    setSaving(true);

    setStatus('info', shouldUpdateAirDec
      ? 'Kargo manifestosu ve Hava Yolu Beyanı güncelleniyor...'
      : pendingDeleteIds.length
        ? `${pendingDeleteIds.length} kargo siliniyor, manifest güncelleniyor...`
        : `${payload.cargos.length} kargo kaydediliyor...`);

    try {
      let deletedCount = 0;

      // SetCargos mevcut kaydı otomatik silmediği için kaldırılan kayıtları ayrı ayrı sil.
      for (const cargoId of pendingDeleteIds) {
        await callApi('DELETE', cargoDeletePath(cargoId, requestedBaseId));

        if (revision !== state.saveRevision || requestedBaseId !== state.baseId) return;

        deletedCount += 1;
        state.deletedCargoIds = state.deletedCargoIds.filter(id => id !== cargoId);
      }

      // Manifestte kalan/yeni kayıtları kaydet.
      // Liste tamamen boşsa DELETE işlemleri yeterlidir.
      if (payload.cargos.length) {
        await callApi('PUT', CARGO_SET_PATH, payload);

        if (revision !== state.saveRevision || requestedBaseId !== state.baseId) return;
      }

      // DELETE/PUT sonrası serverdaki gerçek manifesti tekrar oku.
      const savedRows = await getCargos(requestedBaseId);

      if (revision !== state.saveRevision || requestedBaseId !== state.baseId) return;

      let airDecUpdateError = '';

      if (shouldUpdateAirDec) {
        try {
          // AirDec'i formdaki payload yerine HGBS'deki gerçek kalan listeye göre güncelle.
          const airDecResponse = await updateAirDecFromCargos(savedRows);

          if (revision !== state.saveRevision || requestedBaseId !== state.baseId) return;

          state.airDecKnown = true;
          state.airDecHasCargo = savedRows.length > 0;
          state.airDecData = airDecResponse?.data ?? airDecResponse ?? state.airDecData;

        } catch (error) {
          airDecUpdateError = error.message || String(error);
        }
      }

      state.rows = savedRows;
      state.initialCount = savedRows.length;
      state.cargosLoaded = true;
      state.cargoLoadError = '';
      state.dirty = false;

      if (!airDecUpdateError) {
        state.updateAirDec = false;
      }

      render();

      const manifestParts = [];

      if (deletedCount) {
        manifestParts.push(`${deletedCount} kargo silindi`);
      }

      manifestParts.push(savedRows.length
        ? `${savedRows.length} kargo kaydı başarıyla kaydedildi`
        : 'Manifest boş olarak güncellendi');

      const manifestResultText = `${manifestParts.join('. ')}.`;

      if (airDecUpdateError) {
        setStatus(
          'error',
          `${manifestResultText} Ancak Hava Yolu Beyanı güncellenemedi: ${airDecUpdateError}`
        );

      } else {
        const totalPieces = savedRows.reduce(
          (sum, cargo) => sum + (Number(cargo.numOfPsc) || 0),
          0
        );

        const totalKgm = savedRows.reduce(
          (sum, cargo) => sum + (parseDecimal(cargo.grossKgm) || 0),
          0
        );

        const airDecNote = shouldUpdateAirDec
          ? savedRows.length
            ? ` Hava Yolu Beyanı Kargo Var: Evet, ${totalPieces} kap ve ${formatDecimal(totalKgm)} KG olarak güncellendi.`
            : ' Hava Yolu Beyanı Kargo Var: Hayır olarak güncellendi.'
          : '';

        setStatus(
          'success',
          `${manifestResultText}${airDecNote}`
        );
      }

      if (typeof showGlobalAlert === 'function') {
        showGlobalAlert(
          airDecUpdateError
            ? `${manifestResultText} Hava Yolu Beyanı güncellenemedi: ${airDecUpdateError}`
            : manifestResultText,
          airDecUpdateError ? 'error' : 'info'
        );
      }

    } catch (error) {
      if (revision === state.saveRevision && requestedBaseId === state.baseId) {
        setStatus(
          'error',
          `Kargo manifestosu güncellenemedi: ${error.message || error}`
        );
      }

    } finally {
      if (revision === state.saveRevision && requestedBaseId === state.baseId) {
        setSaving(false);
      }
    }
  }

  async function load() {
    const revision = ++state.loadRevision;
    const requestedBaseId = state.baseId;

    state.cargoLoadError = '';
    state.typeLoadError = '';
    state.airDecError = '';
    state.cargosLoaded = false;
    state.deletedCargoIds = [];
    state.airDecKnown = false;
    state.airDecHasCargo = false;
    state.airDecData = null;

    renderLoading();
    setSaving(false);

    const [typesResult, cargosResult, airDecResult] = await Promise.allSettled([
      callApi('GET', CARGO_TYPES_PATH),
      getCargos(state.baseId),
      callApi('GET', airDecGetPath(state.baseId))
    ]);

    if (revision !== state.loadRevision || requestedBaseId !== state.baseId) return;

    if (typesResult.status === 'fulfilled') {
      state.types = normalizeCargoTypes(typesResult.value);
      if (!state.types.length) {
        state.typeLoadError = 'Servis boş seçenek listesi döndürdü.';
      }
    } else {
      state.types = [];
      state.typeLoadError = typesResult.reason?.message || String(typesResult.reason || 'Bilinmeyen hata');
    }

    if (cargosResult.status === 'fulfilled') {
      state.rows = cargosResult.value;
      state.initialCount = state.rows.length;
      state.cargosLoaded = true;
    } else {
      state.rows = [];
      state.initialCount = 0;
      state.cargoLoadError = cargosResult.reason?.message || String(cargosResult.reason || 'Bilinmeyen hata');
    }

    const airDecData = airDecResult.status === 'fulfilled'
      ? (airDecResult.value?.data ?? airDecResult.value)
      : null;

    if (airDecData && Object.prototype.hasOwnProperty.call(airDecData, 'hasCargo')) {
      state.airDecKnown = true;
      state.airDecHasCargo = !!airDecData.hasCargo;
      state.airDecData = airDecData;
    } else if (airDecResult.status === 'rejected') {
      state.airDecError = airDecResult.reason?.message || String(airDecResult.reason || '');
    }

    if (!state.rows.length) {
      state.rows.push(emptyRow());
    }

    state.dirty = false;
    render();
  }

  async function reload() {
    if (state.saving) return;

    if (state.dirty && !global.confirm(
      'Kaydedilmemiş değişiklikler var. HGBS kayıtlarını yeniden yüklemek istiyor musun?'
    )) {
      return;
    }

    await load();
  }

  async function open() {
    if (state.saving) return;

    const detail = currentFlightDetail();
    const baseId = normalizeText(detail?.baseId || currentFlightBaseId());
    const overlay = overlayElement();

    if (!overlay) {
      global.alert('Kargo Manifestosu popupı bulunamadı. Sayfayı yenileyip tekrar dene.');
      return;
    }

    if (!detail || !baseId) {
      global.alert('Önce uçuş detayını getirmen gerekiyor.');
      return;
    }

    state.baseId = baseId;
    state.detail = detail;
    state.types = [];
    state.rows = [];
    state.deletedCargoIds = [];
    state.initialCount = 0;
    state.dirty = false;
    state.updateAirDec = false;
    state.airDecData = null;

    const subtitle = [
      detail.flightNumber,
      detail.tailNumber,
      [detail.departurePortCode, detail.arrivalPortCode].filter(Boolean).join(' → ')
    ].filter(Boolean).join(' · ');

    const subtitleElement = document.getElementById('cargoManifestSubtitle');

    if (subtitleElement) {
      subtitleElement.textContent = subtitle;
    }

    overlay.classList.remove('hidden');
    ensureStyles();

    await load();
  }

  function close() {
    const overlay = overlayElement();

    if (!overlay || overlay.classList.contains('hidden')) return;
    if (state.saving) return;

    if (state.dirty && !global.confirm(
      'Kaydedilmemiş kargo değişiklikleri var. Popupı kapatmak istiyor musun?'
    )) {
      return;
    }

    overlay.classList.add('hidden');
  }

  function ensureStyles() {
    if (document.getElementById('cargoManifestStyles')) return;

    const style = document.createElement('style');

    style.id = 'cargoManifestStyles';

    style.textContent = `
      #cargoManifestOverlay .modal-card { max-width: 980px; width: 96%; }
      #cargoManifestOverlay .modal-header { background: #9a3412; }
      #cargoManifestOverlay .modal-body { max-height: 72vh; overflow-y: auto; }
      #cargoManifestOverlay .modal-footer { gap: 8px; flex-wrap: wrap; }
      #cargoManifestOverlay .modal-footer .btn-primary { width: auto; min-width: 180px; }
      .cargo-alert { margin-bottom: 10px; }
      .cargo-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .cargo-toolbar > div:first-child { display: flex; flex-direction: column; gap: 2px; }
      .cargo-toolbar strong { font-size: 13px; color: #1e293b; }
      .cargo-toolbar span { font-size: 11px; color: #64748b; }
      .cargo-toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .cargo-list { display: flex; flex-direction: column; gap: 12px; }
      .cargo-card { border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; padding: 13px; }
      .cargo-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
      .cargo-card-head > div { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .cargo-record-id, .cargo-record-new { font-size: 10px; border-radius: 999px; padding: 2px 7px; }
      .cargo-record-id { color: #475569; background: #e2e8f0; }
      .cargo-record-new { color: #166534; background: #dcfce7; }
      .cargo-remove-btn { border: 0; background: transparent; color: #dc2626; cursor: pointer; font-size: 12px; font-weight: 600; padding: 5px; }
      .cargo-remove-btn:hover { text-decoration: underline; }
      .cargo-row-warning { padding: 7px 9px; border-radius: 6px; background: #fef3c7; color: #92400e; font-size: 11px; margin-bottom: 10px; }
      .cargo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .cargo-field { display: flex; flex-direction: column; gap: 4px; }
      .cargo-field-wide { grid-column: span 2; }
      .cargo-field label { color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }
      .cargo-field input { width: 100%; min-width: 0; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #1e293b; font: inherit; padding: 9px 10px; outline: none; }
      .cargo-field input:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,.12); }
      .cargo-field small { min-height: 15px; color: #64748b; font-size: 10px; }
      .cargo-empty { border: 1px dashed #cbd5e1; border-radius: 10px; color: #64748b; padding: 26px; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; text-align: center; }
      .cargo-loading { min-height: 150px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #64748b; }
      .cargo-airdec-option { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; border: 1px solid #fdba74; border-radius: 9px; background: #fff7ed; color: #7c2d12; padding: 12px; cursor: pointer; }
      .cargo-airdec-option input { width: 17px; height: 17px; margin-top: 1px; accent-color: #9a3412; flex: 0 0 auto; }
      .cargo-airdec-option span { display: flex; flex-direction: column; gap: 3px; }
      .cargo-airdec-option strong { font-size: 12px; line-height: 1.35; }
      .cargo-airdec-option small { color: #9a3412; font-size: 11px; line-height: 1.4; }
      #cargoManifestStatus { margin-top: 12px; }

      @media (max-width: 720px) {
        .cargo-grid { grid-template-columns: 1fr 1fr; }
        .cargo-field-wide { grid-column: span 2; }
        .cargo-toolbar { align-items: stretch; flex-direction: column; }
        .cargo-toolbar-actions .btn { flex: 1; justify-content: center; }
      }

      @media (max-width: 480px) {
        .cargo-grid { grid-template-columns: 1fr; }
        .cargo-field-wide { grid-column: span 1; }
        .cargo-card-head { align-items: flex-start; }
        #cargoManifestOverlay .modal-footer .btn { flex: 1; justify-content: center; }
      }
    `;

    document.head.appendChild(style);
  }

  function bindOverlay() {
    const overlay = overlayElement();

    if (!overlay || overlay.dataset.cargoBound === 'true') return;

    overlay.dataset.cargoBound = 'true';

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
  }

  global.CargoManifest = Object.freeze({
    open,
    close,
    reload,
    addRow,
    removeRow,
    updateField,
    setUpdateAirDec,
    save,
    getCargos
  });

  ensureStyles();
  bindOverlay();

})(globalThis);
