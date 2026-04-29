'use strict';

// ── STATE ────────────────────────────────────────────────────────────────────
let scripts    = [];
let activeCat  = '';
let searchTerm = '';
let selectedId = null;
let newFiles   = [];
let termCleanup = [];
let editorFilename = '';

// Auth-State
let currentUser = null;   // { id, username, rolle, totp_aktiv, muss_pw_aendern }
let pendingTotpToken = null;

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────
function showAuthOverlay(id) {
  ['auth-setup','auth-login','auth-totp','auth-changepw','auth-force-totp'].forEach(oid => {
    document.getElementById(oid).classList.toggle('hidden', oid !== id);
  });
}

function hideAllAuthOverlays() {
  ['auth-setup','auth-login','auth-totp','auth-changepw','auth-force-totp'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
}

function setAuthError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('visible', !!msg);
  el.style.display = msg ? 'block' : 'none';
}

// ── AUTH FLOWS ────────────────────────────────────────────────────────────────
async function doSetup() {
  setAuthError('setup-error', '');
  const username = document.getElementById('setup-username').value.trim();
  const pw       = document.getElementById('setup-password').value;
  const pw2      = document.getElementById('setup-password2').value;
  if (!username || !pw) return setAuthError('setup-error', 'Alle Pflichtfelder ausfüllen');
  if (pw !== pw2)        return setAuthError('setup-error', 'Passwörter stimmen nicht überein');
  if (pw.length < 8)     return setAuthError('setup-error', 'Passwort muss mindestens 8 Zeichen haben');
  document.getElementById('setup-btn').disabled = true;
  const r = await window.api.auth.setup({ username, password: pw });
  document.getElementById('setup-btn').disabled = false;
  if (!r.success) return setAuthError('setup-error', r.error || 'Fehler');
  showAuthOverlay('auth-login');
  showToast('Admin-Konto erstellt. Bitte anmelden.', 'ok');
}

async function doLogin() {
  setAuthError('login-error', '');
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return setAuthError('login-error', 'Bitte alle Felder ausfüllen');
  document.getElementById('login-btn').disabled = true;
  const r = await window.api.auth.login({ username, password });
  document.getElementById('login-btn').disabled = false;
  if (!r.success) return setAuthError('login-error', r.error || 'Anmeldung fehlgeschlagen');
  if (r.requires2FA) {
    pendingTotpToken = r.pendingToken;
    document.getElementById('totp-login-user').textContent = `2FA für: ${r.username}`;
    document.getElementById('totp-code').value = '';
    showAuthOverlay('auth-totp');
    setTimeout(() => document.getElementById('totp-code').focus(), 100);
    return;
  }
  onLoginSuccess(r.user, r.requiresTotpSetup);
}

async function doTotp() {
  setAuthError('totp-error', '');
  const code = document.getElementById('totp-code').value.replace(/\s/g,'');
  if (code.length !== 6) return setAuthError('totp-error', 'Bitte 6-stelligen Code eingeben');
  document.getElementById('totp-btn').disabled = true;
  const r = await window.api.auth.verifyTotp({ pendingToken: pendingTotpToken, code });
  document.getElementById('totp-btn').disabled = false;
  if (!r.success) return setAuthError('totp-error', r.error || 'Ungültiger Code');
  pendingTotpToken = null;
  onLoginSuccess(r.user, r.requiresTotpSetup);
}

function backToLogin() {
  pendingTotpToken = null;
  document.getElementById('login-password').value = '';
  showAuthOverlay('auth-login');
}

async function doChangePw() {
  setAuthError('changepw-error', '');
  const oldPw = document.getElementById('changepw-old').value;
  const newPw = document.getElementById('changepw-new').value;
  const newPw2= document.getElementById('changepw-new2').value;
  if (!oldPw || !newPw) return setAuthError('changepw-error', 'Alle Felder ausfüllen');
  if (newPw !== newPw2)  return setAuthError('changepw-error', 'Neue Passwörter stimmen nicht überein');
  const r = await window.api.auth.changePassword({ oldPassword: oldPw, newPassword: newPw });
  if (!r.success) return setAuthError('changepw-error', r.error || 'Fehler');
  currentUser.muss_pw_aendern = 0;
  hideAllAuthOverlays();
  showToast('✔ Passwort erfolgreich geändert', 'ok');
}

function onLoginSuccess(user, requiresTotpSetup) {
  currentUser = user;
  updateSidebarUser();
  if (user.muss_pw_aendern) {
    showAuthOverlay('auth-changepw');
    return;
  }
  if (requiresTotpSetup) {
    startForcedTotpSetup();
    return;
  }
  hideAllAuthOverlays();
  appStart();
}

async function doLogout() {
  await window.api.auth.logout();
  currentUser = null;

  // ── UI komplett zurücksetzen ──────────────────────────────────────────
  scripts = [];

  // Script-Liste leeren
  const scriptList = document.getElementById('script-list');
  if (scriptList) scriptList.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Nicht angemeldet</p></div>';

  // Stats nullen
  ['stat-total','stat-active','stat-cats'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '0';
  });
  document.getElementById('stat-lastrun').textContent = '–';
  document.getElementById('stat-lastrun-time').textContent = '–';
  document.getElementById('badge-count').textContent = '0';
  document.getElementById('badge-favs').textContent  = '0';

  // Detail-Panel leeren
  const dp = document.getElementById('detail-panel');
  if (dp) dp.innerHTML = '<div class="detail-empty"><div style="font-size:32px;opacity:.3">👆</div><div>Script auswählen</div></div>';

  // Logs, Favorites, Chains leeren
  const favList = document.getElementById('fav-list');
  if (favList) favList.innerHTML = '<div class="empty-state"><div class="icon">⭐</div><p>Nicht angemeldet</p></div>';
  const chainList = document.getElementById('chain-list');
  if (chainList) chainList.innerHTML = '<div class="empty-state"><div class="icon">🔗</div><p>Nicht angemeldet</p></div>';
  const logTbody = document.getElementById('log-tbody');
  if (logTbody) logTbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:20px">Nicht angemeldet</td></tr>';

  // Scan-Banner ausblenden
  const banner = document.getElementById('scan-banner');
  if (banner) banner.style.display = 'none';

  // Sidebar-User zurücksetzen
  document.getElementById('sidebar-avatar').textContent   = '?';
  document.getElementById('sidebar-username').textContent = '–';
  document.getElementById('sidebar-userrole').textContent = '–';
  document.getElementById('nav-admin').style.display      = 'none';

  // Zur Scripts-Page wechseln (damit nach Re-Login die richtige Page aktiv ist)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-scripts')?.classList.add('active');

  // Login anzeigen
  document.getElementById('login-password').value = '';
  document.getElementById('login-username').value = '';
  showAuthOverlay('auth-login');
  setTimeout(() => document.getElementById('login-username').focus(), 100);
}

function updateSidebarUser() {
  if (!currentUser) return;
  const initial = (currentUser.username || '?')[0].toUpperCase();
  document.getElementById('sidebar-avatar').textContent   = initial;
  document.getElementById('sidebar-username').textContent = currentUser.username;
  document.getElementById('sidebar-userrole').textContent =
    currentUser.rolle === 'admin' ? '🛡️ Administrator' :
    currentUser.rolle === 'readonly' ? '👁 Nur-Lesen' : '👤 Benutzer';
  document.getElementById('nav-admin').style.display = currentUser.rolle === 'admin' ? 'flex' : 'none';
}

// ── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  loadSavedTheme();

  // Session-Expired-Event registrieren
  window.api.auth.onSessionExpired(() => {
    showToast('⏱ Session abgelaufen — bitte erneut anmelden', 'err');
    currentUser = null;
    scripts = [];
    showAuthOverlay('auth-login');
  });

  // Auth-Start
  const setup = await window.api.auth.needsSetup();
  if (setup.needsSetup) {
    showAuthOverlay('auth-setup');
    setTimeout(() => document.getElementById('setup-username').focus(), 100);
    return;
  }

  // Bestehende Session prüfen (z.B. wenn App aus Tray wieder geöffnet)
  const session = await window.api.auth.getSession();
  if (session.loggedIn) {
    onLoginSuccess(session.user);
  } else {
    showAuthOverlay('auth-login');
    setTimeout(() => document.getElementById('login-username').focus(), 100);
  }
}

