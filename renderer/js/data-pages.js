/**
 * renderer/js/data-pages.js – Scheduler, Logs, Update-Page, Admin-Page
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  SCHEDULER
// ══════════════════════════════════════════════════════════════════════════════

async function loadSchedules() {
  const schedules = await window.api.schedules.getAll();
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (!schedules.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🕐</div><p>Noch keine Zeitpläne angelegt.</p></div>';
    return;
  }
  el.innerHTML = schedules.map(s => `
    <div class="script-row">
      <span class="row-status ${s.aktiv ? 'on' : 'off'}"></span>
      <div>
        <div class="row-name">${escHtml(s.name)}</div>
        <div class="row-desc">${formatScheduleType(s)}</div>
      </div>
      <span class="cat-badge">${escHtml(s.target_typ === 'chain' ? '🔗 Chain' : '📄 Script')}</span>
      <span class="row-time">${s.letzter_lauf ? s.letzter_lauf.slice(0, 16) : '–'}</span>
      <div class="row-actions">
        <button class="icon-btn edit-btn" title="Bearbeiten" onclick="openScheduleModal(${s.id})">✏️</button>
        <button class="icon-btn del-btn"  title="Löschen"    onclick="deleteSchedule(${s.id})">🗑</button>
      </div>
    </div>`).join('');
}

function formatScheduleType(s) {
  if (s.typ === 'einmalig')    return `Einmalig: ${s.einmalig_am ? s.einmalig_am.slice(0, 16) : '–'}`;
  if (s.typ === 'taeglich')    return `Täglich: ${s.cron || '–'}`;
  if (s.typ === 'woechentlich') {
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const [day, time] = (s.cron || '').split(' ');
    return `Wöchentlich: ${days[parseInt(day)] || '?'} ${time || ''}`;
  }
  return s.typ || '–';
}

function closeScheduleModal() {
  document.getElementById('schedule-modal-overlay')?.classList.remove('open');
}

async function openScheduleModal(id = null) {
  const s = id ? await window.api.schedules.getById(id) : null;
  document.getElementById('sched-modal-id').value     = s?.id    || '';
  document.getElementById('sched-name').value         = s?.name  || '';
  document.getElementById('sched-typ').value          = s?.typ   || 'einmalig';
  document.getElementById('sched-target-typ').value   = s?.target_typ || 'script';
  document.getElementById('sched-target-id').value    = s?.target_id || '';
  document.getElementById('sched-cron').value         = s?.cron  || '';
  document.getElementById('sched-einmalig').value     = s?.einmalig_am ? s.einmalig_am.slice(0, 16) : '';
  document.getElementById('schedule-modal-overlay')?.classList.add('open');
}

async function saveSchedule() {
  const id = document.getElementById('sched-modal-id').value;
  const data = {
    name:        document.getElementById('sched-name').value.trim(),
    typ:         document.getElementById('sched-typ').value,
    target_typ:  document.getElementById('sched-target-typ').value,
    target_id:   parseInt(document.getElementById('sched-target-id').value),
    cron:        document.getElementById('sched-cron').value.trim() || null,
    einmalig_am: document.getElementById('sched-einmalig').value   || null,
    aktiv:       1,
  };
  if (!data.name || !data.target_id) return showToast('Name und Ziel sind Pflichtfelder', 'err');
  const r = id
    ? await window.api.schedules.update({ ...data, id: parseInt(id) })
    : await window.api.schedules.add(data);
  if (!r.success) return showToast('Fehler: ' + (r.error || ''), 'err');
  showToast(id ? '✔ Zeitplan aktualisiert' : '✔ Zeitplan erstellt', 'ok');
  closeScheduleModal();
  await loadSchedules();
}

async function deleteSchedule(id) {
  if (!confirm('Zeitplan löschen?')) return;
  await window.api.schedules.delete(id);
  showToast('🗑 Zeitplan gelöscht', 'ok');
  await loadSchedules();
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGS
// ══════════════════════════════════════════════════════════════════════════════

async function loadLogs() {
  const logs = await window.api.logs.getRecent(200);
  const el   = document.getElementById('log-list');
  if (!el) return;
  if (!logs.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">📜</div><p>Noch keine Einträge.</p></div>';
    return;
  }
  el.innerHTML = logs.map(l => `
    <div class="log-row ${l.status}" onclick="toggleLogDetail(this)">
      <span class="log-status-dot ${l.status}"></span>
      <div style="flex:1">
        <div class="row-name">${escHtml(l.script_name || l.chain_name || '?')}${l.chain_name ? ` <span style="font-size:11px;color:var(--muted)">(Chain: ${escHtml(l.chain_name)})</span>` : ''}</div>
        <div class="row-desc">${escHtml(l.gestartet_am || '')}</div>
      </div>
      <span class="cat-badge ${l.status === 'success' ? 'green' : 'red'}">${l.status === 'success' ? '✔ OK' : '✘ Fehler'}</span>
      <button class="icon-btn del-btn" title="Löschen" onclick="event.stopPropagation();deleteLog(${l.id})">🗑</button>
    </div>
    <div class="log-detail" style="display:none">
      <pre style="margin:0;padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);white-space:pre-wrap;word-break:break-all;background:var(--surface);border-top:1px solid var(--border)">${escHtml(l.output || '(kein Output)')}</pre>
    </div>`).join('');
}

function toggleLogDetail(row) {
  const detail = row.nextElementSibling;
  if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
}

async function deleteLog(id) {
  await window.api.logs.clearById(id);
  showToast('🗑 Log-Eintrag gelöscht', 'ok');
  await loadLogs();
}

function closeClearLogsModal() {
  document.getElementById('clear-logs-modal-overlay')?.classList.remove('open');
}

async function clearAllLogsConfirm() {
  await window.api.logs.clearAll();
  showToast('🗑 Alle Logs gelöscht', 'ok');
  closeClearLogsModal();
  await loadLogs();
}

// ══════════════════════════════════════════════════════════════════════════════
//  UPDATE-PAGE
// ══════════════════════════════════════════════════════════════════════════════

function updLog(msg, type = 'info') {
  const log = document.getElementById('upd-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className   = 'log-line ' + type;
  el.textContent = msg;
  log.appendChild(el);
  log.scrollTop  = log.scrollHeight;
}

function gitLog(msg, type = 'info') {
  const log = document.getElementById('git-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className   = 'log-line ' + type;
  el.textContent = msg;
  log.appendChild(el);
  log.scrollTop  = log.scrollHeight;
}

async function checkAppUpdate() {
  const btn = document.getElementById('btn-check-upd');
  btn.disabled = true; btn.textContent = '⌛ Prüfe…';
  updLog(`[${now()}] Prüfe auf neue Version…`, 'cmd');
  try {
    const r = await window.api.update.check();
    if (r.error) {
      updLog(`[${now()}] Fehler: ${r.error}`, 'err');
      showToast('✘ Update-Prüfung fehlgeschlagen', 'err');
    } else if (r.available) {
      updLog(`[${now()}] ⬆ Neue Version verfügbar: v${r.latestVersion}`, 'warn');
      document.getElementById('upd-latest').textContent = r.latestVersion;
      document.getElementById('btn-run-upd').style.display = '';
      showToast(`⬆ Neue Version v${r.latestVersion} verfügbar`, 'info');
    } else {
      updLog(`[${now()}] ✔ App ist aktuell (v${r.currentVersion})`, 'ok');
      showToast('✔ App ist aktuell', 'ok');
    }
  } catch (e) { updLog(`Fehler: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = '🔍 Prüfen';
}

async function downloadUpdate() {
  const btn = document.getElementById('btn-run-upd');
  btn.disabled = true; btn.textContent = '⌛ Lade herunter…';
  updLog(`[${now()}] Lade Update herunter…`, 'cmd');
  try {
    const r = await window.api.update.download();
    if (r.success) {
      updLog(`[${now()}] ✔ Update heruntergeladen. App wird beim nächsten Start aktualisiert.`, 'ok');
      showToast('✔ Update heruntergeladen – bitte App neustarten', 'ok');
    } else {
      updLog(`[${now()}] ✘ Fehler: ${r.error || '?'}`, 'err');
    }
  } catch (e) { updLog(`Fehler: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = '⬇ Update installieren';
}

async function checkGitStatus() {
  const btn = document.getElementById('btn-git-check');
  btn.disabled = true; btn.textContent = '⌛ Prüfe…';
  gitLog(`[${now()}] Prüfe Git-Status…`, 'cmd');
  try {
    const r = await window.api.git.status();
    if (r.noRepo) {
      gitLog(`[${now()}] ℹ Noch kein Git-Repo. Klicke "Scripte aktualisieren" für erstes Klonen.`, 'warn');
      document.getElementById('git-local-hash').textContent  = 'kein Repo';
      document.getElementById('git-remote-hash').textContent = '–';
    } else if (r.error) {
      gitLog(`[${now()}] Fehler: ${r.error}`, 'err');
      showToast('✘ Git-Status fehlgeschlagen', 'err');
    } else {
      document.getElementById('git-local-hash').textContent  = r.localHash  || '–';
      document.getElementById('git-remote-hash').textContent = r.remoteHash || '–';
      if (r.available) {
        gitLog(`[${now()}] ⬇ Neue Commits verfügbar:`, 'warn');
        (r.commitLog || '').split('\n').filter(Boolean).forEach(line => gitLog('  ' + line, 'warn'));
        showToast('⬇ Neue PS1-Scripts verfügbar', 'info');
      } else {
        gitLog(`[${now()}] ✔ Scripts sind aktuell`, 'ok');
        showToast('✔ Scripts sind aktuell', 'ok');
      }
    }
  } catch (e) { gitLog(`Fehler: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = '🔍 Status prüfen';
}

async function runGitSync() {
  const btn     = document.getElementById('btn-git-sync');
  const repoUrl = document.getElementById('git-repo-url').value.trim();
  const branch  = document.getElementById('git-branch').value.trim() || 'main';
  if (!repoUrl) { showToast('Bitte Repository-URL eingeben', 'err'); return; }
  btn.disabled = true; btn.textContent = '⌛ Synchronisiere…';
  gitLog(`[${now()}] Starte Git-Sync von ${repoUrl} (${branch})…`, 'cmd');
  try {
    const r = await window.api.git.sync(repoUrl, branch);
    if (r.success) {
      gitLog(`[${now()}] ✔ Sync erfolgreich`, 'ok');
      if (r.newFiles?.length)     gitLog(`  Neue Scripte: ${r.newFiles.join(', ')}`, 'ok');
      if (r.updatedFiles?.length) gitLog(`  Aktualisiert: ${r.updatedFiles.length} Datei(en)`, 'info');
      showToast(`✔ Scripts synchronisiert${r.newFiles?.length ? ` (${r.newFiles.length} neu)` : ''}`, 'ok');
      await scanLib();
    } else {
      gitLog(`[${now()}] ✘ Fehler: ${r.error || '?'}`, 'err');
      showToast('✘ Git-Sync fehlgeschlagen', 'err');
    }
  } catch (e) { gitLog(`Fehler: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = '⬇ Scripte aktualisieren';
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════════════════════════════════════

let userModalMode = 'add';

async function openAdminPage() {
  if (!currentUser || currentUser.rolle !== 'admin') return;
  const users = await window.api.users.getAll();
  const el    = document.getElementById('admin-user-list');
  if (!el) return;
  el.innerHTML = users.map(u => `
    <div class="script-row">
      <div class="sidebar-user-avatar" style="width:32px;height:32px;font-size:14px;flex-shrink:0">${escHtml(u.username[0].toUpperCase())}</div>
      <div style="flex:1">
        <div class="row-name">${escHtml(u.username)}</div>
        <div class="row-desc">${{ admin: '🛡️ Admin', user: '👤 Benutzer', readonly: '👁 Nur-Lesen' }[u.rolle] || u.rolle}</div>
      </div>
      <span class="cat-badge ${u.aktiv ? '' : 'red'}">${u.aktiv ? '● Aktiv' : '○ Deaktiviert'}</span>
      ${u.totp_aktiv ? '<span style="font-size:12px;color:var(--green)">🔐 2FA</span>' : ''}
      <div class="row-actions">
        <button class="icon-btn edit-btn" onclick="openUserModal(${JSON.stringify(u).replace(/"/g,'&quot;')})">✏️</button>
        <button class="icon-btn" onclick="openResetPwModal(${u.id})" title="PW zurücksetzen">🔑</button>
        <button class="icon-btn del-btn" onclick="deleteUser(${u.id})" title="Löschen">🗑</button>
      </div>
    </div>`).join('');

  // Audit-Log
  const auditLog = await window.api.audit.getLog(100);
  const auditEl  = document.getElementById('audit-log-list');
  if (auditEl) {
    auditEl.innerHTML = auditLog.map(e => `
      <div class="log-row">
        <span style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;min-width:130px">${e.zeitpunkt || ''}</span>
        <span style="font-size:12px;font-weight:600;min-width:100px">${escHtml(e.username)}</span>
        <span style="font-size:12px;color:var(--accent1)">${escHtml(e.aktion)}</span>
        <span style="font-size:11px;color:var(--muted)">${e.ziel_typ ? `${e.ziel_typ}#${e.ziel_id || '?'}` : ''}</span>
      </div>`).join('');
  }
}

function closeUserModal()   { document.getElementById('user-modal-overlay')?.classList.remove('open'); }
function closeResetPwModal(){ document.getElementById('resetpw-modal-overlay')?.classList.remove('open'); }

function openUserModal(user) {
  userModalMode = user ? 'edit' : 'add';
  document.getElementById('user-modal-title').textContent  = user ? 'Benutzer bearbeiten' : 'Benutzer anlegen';
  document.getElementById('user-modal-id').value     = user ? user.id       : '';
  document.getElementById('user-modal-name').value   = user ? user.username : '';
  document.getElementById('user-modal-rolle').value  = user ? user.rolle    : 'user';
  document.getElementById('user-modal-aktiv').checked = user ? !!user.aktiv : true;
  document.getElementById('user-modal-pw').value     = '';
  document.getElementById('user-modal-overlay')?.classList.add('open');
}

async function saveUser() {
  const id   = document.getElementById('user-modal-id').value;
  const data = {
    username: document.getElementById('user-modal-name').value.trim(),
    rolle:    document.getElementById('user-modal-rolle').value,
    aktiv:    document.getElementById('user-modal-aktiv').checked ? 1 : 0,
    password: document.getElementById('user-modal-pw').value,
  };
  if (!data.username) return showToast('Benutzername ist Pflichtfeld', 'err');
  if (!id && !data.password) return showToast('Passwort ist bei neuen Benutzern Pflichtfeld', 'err');
  const r = id
    ? await window.api.users.update({ ...data, id: parseInt(id) })
    : await window.api.users.add(data);
  if (!r.success) return showToast('Fehler: ' + (r.error || ''), 'err');
  showToast(id ? '✔ Benutzer aktualisiert' : '✔ Benutzer angelegt', 'ok');
  closeUserModal();
  openAdminPage();
}

async function deleteUser(id) {
  if (!confirm('Benutzer wirklich löschen?')) return;
  const r = await window.api.users.delete(id);
  if (!r.success) return showToast('Fehler: ' + (r.error || ''), 'err');
  showToast('🗑 Benutzer gelöscht', 'ok');
  openAdminPage();
}

let resetPwUserId = null;
function openResetPwModal(id) {
  resetPwUserId = id;
  document.getElementById('reset-pw-input').value = '';
  document.getElementById('resetpw-modal-overlay')?.classList.add('open');
}

async function saveResetPw() {
  const pw = document.getElementById('reset-pw-input').value;
  if (!pw || pw.length < 8) return showToast('Passwort muss mindestens 8 Zeichen haben', 'err');
  const r = await window.api.users.resetPassword({ userId: resetPwUserId, newPassword: pw });
  if (!r.success) return showToast('Fehler: ' + (r.error || ''), 'err');
  showToast('✔ Passwort zurückgesetzt', 'ok');
  closeResetPwModal();
}
