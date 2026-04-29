'use strict';

const pageTitles={
  scripts:  'Scripts <span>// Bibliothek</span>',
  favorites:'Favoriten <span>// Schnellzugriff</span>',
  chains:   'Verkettungen <span>// Script-Pipelines</span>',
  scheduler:'Scheduler <span>// Geplante Ausführungen</span>',
  logs:     'Logs <span>// Ausführungsprotokoll</span>',
  update:   'Updates <span>// Releases</span>',
  settings: 'Einstellungen <span>// Konfiguration</span>',
  about:    'Info <span>// PS Script Manager v2</span>',
  admin:    'Administration <span>// Benutzer &amp; Berechtigungen</span>',
  profile:  'Mein Profil <span>// Konto &amp; 2FA</span>',
};
const topbarIds={scripts:['search-wrap','btn-add','btn-import-ps1','btn-import-csv','btn-open-lib']};
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.textContent.trim().toLowerCase().startsWith(name.slice(0,4))));
  document.getElementById('page-title').innerHTML=pageTitles[name]||name;
  const show=topbarIds[name]||[];
  ['search-wrap','btn-add','btn-import-ps1','btn-import-csv','btn-open-lib'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=show.includes(id)?'':'none';});
  if(name==='logs')      loadLogs();
  if(name==='favorites') loadFavorites();
  if(name==='chains')    loadChains();
  if(name==='scheduler') loadSchedules();
  if(name==='profile')   openProfilePage();
  if(name==='admin')     openAdminPage();
  if(name==='update') {
    window.api.app.info().then(i => {
      document.getElementById('upd-current').textContent = i.version || '–';
    });
  }
}


document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('term-input').addEventListener('keydown', e=>{
    if(e.key==='Enter'){e.preventDefault();sendTerminalInput();}
  });
  document.getElementById('editor-textarea').addEventListener('input', e=>{
    updateEditorInfo(e.target);
  });
  document.getElementById('editor-textarea').addEventListener('keydown', e=>{
    if(e.key==='Tab'){e.preventDefault();const s=e.target.selectionStart;const v=e.target.value;e.target.value=v.slice(0,s)+'    '+v.slice(e.target.selectionEnd);e.target.selectionStart=e.target.selectionEnd=s+4;}
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveEditorCode();}
  });
  // Login per Enter
  document.getElementById('login-password').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  document.getElementById('login-username').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('login-password').focus(); });
  document.getElementById('setup-password2').addEventListener('keydown',e=>{ if(e.key==='Enter') doSetup(); });
  document.getElementById('totp-code').addEventListener('keydown',e=>{ if(e.key==='Enter') doTotp(); });
  document.getElementById('totp-code').addEventListener('input',e=>{ if(e.target.value.replace(/\s/g,'').length===6) doTotp(); });
});

document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    closeModal(); closeScanModal(); closeChainModal(); closeScheduleModal();
    closeUserModal(); closeResetPwModal();
    if(!document.getElementById('term-close-btn').disabled) closeTerminal();
    if(!document.getElementById('chain-monitor-close').disabled) closeChainMonitor();
    closeEditor();
  }
});


// ── SHOW PAGE (erweitert um profile + admin) ──────────────────────────────────
const PAGE_TITLES = {
  scripts:'Scripts <span>// Bibliothek</span>', favorites:'Favoriten <span>// Schnellstart</span>',
  chains:'Verkettungen <span>// Chains</span>', scheduler:'Scheduler <span>// Geplante Ausführungen</span>',
  logs:'Logs <span>// Ausführungsprotokoll</span>', update:'Updates <span>// App &amp; Scripte</span>',
  settings:'Einstellungen <span>// Design &amp; Config</span>', about:'Info <span>// Über die App</span>',
  admin:'Administration <span>// Benutzer &amp; Berechtigungen</span>',
  profile:'Mein Profil <span>// Konto &amp; 2FA</span>',
};


function openProfilePage() {
  if (!currentUser) return;
  document.getElementById('profile-username').textContent = currentUser.username;
  document.getElementById('profile-avatar').textContent   = currentUser.username[0].toUpperCase();
  const roleMap = { admin:'🛡️ Administrator', user:'👤 Benutzer', readonly:'👁 Nur-Lesen' };
  const roleColor= { admin:'var(--red)', user:'var(--accent1)', readonly:'var(--muted)' };
  document.getElementById('profile-role-badge').innerHTML =
    `<span class="role-badge ${currentUser.rolle}">${roleMap[currentUser.rolle]||currentUser.rolle}</span>`;
  // TOTP-Status
  const totpOn = !!currentUser.totp_aktiv;
  document.getElementById('totp-status-info').innerHTML = totpOn
    ? `<span style="color:var(--green);font-weight:700">✔ 2FA ist aktiviert</span> — dein Konto ist mit Zwei-Faktor-Authentifizierung geschützt.`
    : `<span style="color:var(--muted)">2FA ist nicht aktiviert.</span> Wir empfehlen, 2FA für mehr Sicherheit einzurichten.`;
  document.getElementById('totp-enable-btn').style.display  = totpOn ? 'none' : '';
  document.getElementById('totp-disable-btn').style.display = totpOn ? ''     : 'none';
  document.getElementById('totp-setup-section').style.display = 'none';
}

// ── ERZWUNGENES TOTP-SETUP (beim Login) ──────────────────────────────────────
async function startForcedTotpSetup() {
  showAuthOverlay('auth-force-totp');
  document.getElementById('force-totp-code').value = '';
  setAuthError('force-totp-error', '');

  const r = await window.api.auth.totp.setup();
  if (!r.success) {
    setAuthError('force-totp-error', 'Fehler beim Generieren: ' + (r.error || 'TOTP nicht verfügbar'));
    return;
  }

  document.getElementById('force-totp-secret').textContent = r.secret || '–';
  const qrBox = document.getElementById('force-totp-qr');
  if (r.qrDataUrl) {
    qrBox.innerHTML = `<img src="${r.qrDataUrl}" alt="QR-Code" style="width:180px;height:180px">`;
  } else {
    qrBox.innerHTML = `<div style="padding:12px;font-size:12px;color:#555">QR nicht verfügbar.<br>Bitte Secret manuell eingeben.</div>`;
  }
  setTimeout(() => document.getElementById('force-totp-code').focus(), 100);

  // Auto-Submit wenn 6 Zeichen eingegeben
  document.getElementById('force-totp-code').addEventListener('input', e => {
    if (e.target.value.replace(/\s/g,'').length === 6) doForceTotpConfirm();
  }, { once: true });
}

async function doForceTotpConfirm() {
  setAuthError('force-totp-error', '');
  const code = document.getElementById('force-totp-code').value.replace(/\s/g,'');
  if (code.length !== 6) return setAuthError('force-totp-error', 'Bitte 6-stelligen Code eingeben');

  const btn = document.getElementById('force-totp-btn');
  btn.disabled = true;
  const r = await window.api.auth.totp.confirm({ code });
  btn.disabled = false;

  if (!r.success) {
    setAuthError('force-totp-error', 'Ungültiger Code – bitte erneut versuchen');
    document.getElementById('force-totp-code').value = '';
    document.getElementById('force-totp-code').focus();
    return;
  }

  currentUser.totp_aktiv = 1;
  showToast('✔ 2FA erfolgreich eingerichtet', 'ok');
  hideAllAuthOverlays();
  appStart();
}

async function startTotpSetup() {
  const r = await window.api.auth.totp.setup();
  if (!r.success) return showToast('Fehler: ' + (r.error || 'TOTP nicht verfügbar'), 'err');
  document.getElementById('totp-secret-text').textContent = r.secret || '–';
  const qrBox = document.getElementById('totp-qr-box');
  if (r.qrDataUrl) {
    qrBox.innerHTML = `<img src="${r.qrDataUrl}" alt="QR-Code">`;
  } else {
    qrBox.innerHTML = `<div style="padding:12px;font-size:12px;color:#555">QR nicht verfügbar.<br>Bitte Secret manuell eingeben.</div>`;
  }
  document.getElementById('totp-setup-section').style.display = 'flex';
  document.getElementById('totp-btn-section').style.display = 'none';
  document.getElementById('totp-confirm-code').value = '';
  document.getElementById('totp-confirm-code').focus();
}

async function confirmTotpSetup() {
  const code = document.getElementById('totp-confirm-code').value.replace(/\s/g,'');
  if (code.length !== 6) return showToast('Bitte 6-stelligen Code eingeben', 'err');
  const r = await window.api.auth.totp.confirm({ code });
  if (!r.success) return showToast('Ungültiger Code: ' + (r.error||''), 'err');
  currentUser.totp_aktiv = 1;
  showToast('✔ 2FA erfolgreich aktiviert', 'ok');
  document.getElementById('totp-setup-section').style.display = 'none';
  document.getElementById('totp-btn-section').style.display = 'flex';
  openProfilePage();
}

function cancelTotpSetup() {
  document.getElementById('totp-setup-section').style.display = 'none';
  document.getElementById('totp-btn-section').style.display = 'flex';
}

async function disableMyTotp() {
  if (!confirm('2FA wirklich deaktivieren? Dein Konto wird damit weniger sicher.')) return;
  const r = await window.api.auth.totp.disable({});
  if (!r.success) return showToast('Fehler: ' + (r.error||''), 'err');
  currentUser.totp_aktiv = 0;
  showToast('2FA deaktiviert', 'info');
  openProfilePage();
}

async function changeMyPassword() {
  setAuthError('pw-change-error', '');
  const oldPw = document.getElementById('pw-old').value;
  const newPw = document.getElementById('pw-new').value;
  const newPw2= document.getElementById('pw-new2').value;
  if (!oldPw || !newPw) return setAuthError('pw-change-error', 'Alle Felder ausfüllen');
  if (newPw !== newPw2)  return setAuthError('pw-change-error', 'Neue Passwörter stimmen nicht überein');
  const r = await window.api.auth.changePassword({ oldPassword:oldPw, newPassword:newPw });
  if (!r.success) return setAuthError('pw-change-error', r.error || 'Fehler');
  showToast('✔ Passwort geändert', 'ok');
  document.getElementById('pw-old').value = document.getElementById('pw-new').value = document.getElementById('pw-new2').value = '';
}

