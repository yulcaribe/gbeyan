'use strict';

// ─────────────────────────────────────────────
//  LOG-IN PARCASI
// ─────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('inputUser').value.trim();
  const password = document.getElementById('inputPass').value.trim();
  const btn = document.getElementById('loginBtn');

  const userTypeEl = document.getElementById('loginUserType');
  const selectedUserType = (userTypeEl?.value || 'MUK').trim();

  if (!username || !password) {
    showLoginAlert('Kullanıcı adı ve şifre boş bırakılamaz.', 'error');
    return;
  }

  if (!selectedUserType) {
    showLoginAlert('Kullanıcı tipi seçilmelidir.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor...';
  clearLoginAlert();

  try {
    const res = await apiCall('POST', '/api/Account/Login?api-version=1.0', {
      userName: username,
      userPassword: password,
      userType: selectedUserType
    });

    const d = res.data;

    const token = d.userToken;

    const user = {
      userName:        d.userName        ?? '',
      taxFirmName:     d.taxFirmName     ?? '',
      taxNumber:       d.taxNumber       ?? '',
      userType:        d.userType        ?? selectedUserType,
      userId:          d.userId          ?? '',
      userProfileName: d.userProfileName ?? ''
    };

    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_USER, JSON.stringify(user));

    STATE.token = token;
    STATE.user  = user;

    showMainScreen();
  } catch (err) {
    if (!err.message.includes('401')) {
      showLoginAlert(err.message, 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
}

function logout() {
  stopHGSBAutoRefresh();

  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
  STATE.token = null;
  STATE.user  = { userName:'', taxFirmName:'', taxNumber:'', userType:'', userId:'', userProfileName:'' };
  STATE.rows  = [];
  showLoginScreen();
}

// ─────────────────────────────────────────────
//  Screen switching
// ─────────────────────────────────────────────
function showLoginScreen(msg) {
  document.getElementById('mainSection').style.display = 'none';
  document.getElementById('loginSection').style.display = 'flex';
  if (msg) showLoginAlert(msg, 'warning');
}

async function showMainScreen() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainSection').style.display  = 'block';

  await refreshHistoryFromSheet();

  pruneOldHistory();
  renderUserInfo();
  initToolbar();
  openHistoryModal();
}

async function showMainScreen() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainSection').style.display  = 'block';

  await refreshHistoryFromSheet();

  pruneOldHistory();
  renderUserInfo();
  initToolbar();
  openHistoryModal();

  startHGSBAutoRefresh();
}




function showLoginAlert(msg, type = 'error') {
  document.getElementById('loginAlert').innerHTML =
    `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
}

function clearLoginAlert() {
  document.getElementById('loginAlert').innerHTML = '';
}

function showGlobalAlert(msg, type = 'info') {
  document.getElementById('globalAlert').innerHTML =
    `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { document.getElementById('globalAlert').innerHTML = ''; }, 5000);
}

// ─────────────────────────────────────────────
//  User info header
// ─────────────────────────────────────────────
function renderUserInfo() {
  const u = STATE.user;
  const initial = (u.userName || '?')[0].toUpperCase();
  document.getElementById('avatarInitial').textContent = initial;
  document.getElementById('uiUserName').textContent = u.userName || '—';
  document.getElementById('uiUserSub').textContent =
    [u.taxFirmName, u.userProfileName].filter(Boolean).join(' · ');
}
