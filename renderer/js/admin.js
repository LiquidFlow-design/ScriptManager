'use strict';

// ── ADMIN: BENUTZER ────────────────────────────────────────────────────────────
let userModalMode = 'add'; // 'add' | 'edit'

function openUserModal(user) {
  userModalMode = user ? 'edit' : 'add';
  document.getElementById('user-modal-title').textContent = user ? 'Benutzer bearbeiten' : 'Benutzer anlegen';
  document.getElementById('user-modal-id').value    = user ? user.id    : '';
  document.getElementById('user-modal-name').value  = user ? user.username : '';
  document.getElementById('user-modal-rolle').value = user ? user.rolle : 'user';
  document.getElementById('user-modal-aktiv').checked = user ? !!user.aktiv : true;
  document.getElementById('user-modal-pw').value    = '';
  document.getElementById('user-modal-pw-label').textContent = user ? 'Neues Passwort (leer = nicht ändern)' : 'Temporäres Passwort *';
  setAuthError('user-modal-error', '');
  document.getElementById('modal-user').classList.add('open');
}

function closeUserModal() { document.getElementById('modal-user').classList.remove('open'); }

async function saveUser() {
  setAuthError('user-modal-error', '');
  const id     = document.getElementById('user-modal-id').value;
  const username = document.getElementById('user-modal-name').value.trim();
  const rolle  = document.getElementById('user-modal-rolle').value;
  const aktiv  = document.getElementById('user-modal-aktiv').checked;
  const pw     = document.getElementById('user-modal-pw').value;

  if (!username) return setAuthError('user-modal-error', 'Benutzername erforderlich');

  let r;
  if (userModalMode === 'add') {
    if (!pw) return setAuthError('user-modal-error', 'Passwort erforderlich');
    r = await window.api.users.add({ username, password:pw, rolle, aktiv });
  } else {
    const data = { id:parseInt(id), username, rolle, aktiv, muss_pw_aendern:0 };
    r = await window.api.users.update(data);
    if (r.success && pw) {
      await window.api.users.resetPassword({ userId:parseInt(id), tempPassword:pw });
    }
  }
  if (!r.success) return setAuthError('user-modal-error', r.error || 'Fehler');
  closeUserModal();
  showToast(userModalMode==='add' ? '✔ Benutzer angelegt' : '✔ Benutzer aktualisiert', 'ok');
  await loadUserTable();
}

async function deleteUserConfirm(userId, username) {
  if (!confirm(`Benutzer "${username}" wirklich löschen? Alle Berechtigungen werden entfernt.`)) return;
  const r = await window.api.users.delete(userId);
  if (!r.success) return showToast('Fehler: ' + (r.error||''), 'err');
  showToast('Benutzer gelöscht', 'info');
  await loadUserTable();
}

function openResetPwModal(userId, username) {
  document.getElementById('reset-pw-user-id').value   = userId;
  document.getElementById('reset-pw-username').textContent = username;
  document.getElementById('reset-pw-value').value     = '';
  setAuthError('reset-pw-error', '');
  document.getElementById('modal-reset-pw').classList.add('open');
}
function closeResetPwModal() { document.getElementById('modal-reset-pw').classList.remove('open'); }

async function doResetPw() {
  setAuthError('reset-pw-error', '');
  const userId = parseInt(document.getElementById('reset-pw-user-id').value);
  const tempPassword = document.getElementById('reset-pw-value').value;
  if (!tempPassword) return setAuthError('reset-pw-error', 'Passwort eingeben');
  const r = await window.api.users.resetPassword({ userId, tempPassword });
  if (!r.success) return setAuthError('reset-pw-error', r.error||'Fehler');
  closeResetPwModal();
  showToast('✔ Passwort zurückgesetzt. Benutzer muss beim nächsten Login ein neues setzen.', 'ok');
}

async function loadUserTable() {
  const users = await window.api.users.getAll();
  const tbody = document.getElementById('user-tbody');
  if (!users || !users.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Keine Benutzer gefunden</td></tr>`;
    return;
  }
  const roleLabel = { admin:'🛡️ Admin', user:'👤 User', readonly:'👁 Readonly' };
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escHtml(u.username)}</strong></td>
      <td><span class="role-badge ${u.rolle}">${roleLabel[u.rolle]||u.rolle}</span></td>
      <td><span style="color:${u.aktiv?'var(--green)':'var(--muted)'}">${u.aktiv?'✔ Aktiv':'⏸ Inaktiv'}</span></td>
      <td><span style="color:${u.totp_aktiv?'var(--green)':'var(--muted)'}">${u.totp_aktiv?'🔐 Aktiv':'–'}</span></td>
      <td style="color:var(--muted)">${u.letzter_login ? u.letzter_login.slice(0,16) : '–'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="icon-btn edit-btn" title="Bearbeiten" onclick="openUserModal(${JSON.stringify(u).replace(/"/g,'&quot;')})">✏️</button>
          <button class="icon-btn" title="Passwort zurücksetzen" onclick="openResetPwModal(${u.id},'${escHtml(u.username)}')" style="font-size:13px">🔑</button>
          ${u.id !== currentUser?.id ? `<button class="icon-btn del-btn" title="Löschen" onclick="deleteUserConfirm(${u.id},'${escHtml(u.username)}')">🗑</button>` : ''}
        </div>
      </td>
    </tr>`).join('');

  // Perm-User-Select füllen
  const select = document.getElementById('perm-user-select');
  select.innerHTML = `<option value="">Benutzer wählen…</option>` +
    users.filter(u => u.rolle !== 'admin').map(u =>
      `<option value="${u.id}">${escHtml(u.username)} (${u.rolle})</option>`).join('');
}

// ── ADMIN: BERECHTIGUNGEN ──────────────────────────────────────────────────────
async function loadPermsForUser() {
  const userId = document.getElementById('perm-user-select').value;
  const list   = document.getElementById('perm-list');
  if (!userId) { list.innerHTML = `<div class="empty-state"><div class="icon">🔑</div><p>Benutzer auswählen</p></div>`; return; }
  const perms  = await window.api.perms.getForUser(parseInt(userId));
  const allScripts = await window.api.scripts.getAll();

  // Merge: alle Scripts, Perms drüber legen
  const permMap = {};
  for (const p of perms) permMap[p.script_id] = p;

  list.innerHTML = allScripts.map(s => {
    const p = permMap[s.id] || { darf_sehen:0, darf_ausfuehren:0, darf_bearbeiten:0 };
    return `<div class="perm-row">
      <div><div style="font-weight:700;font-size:13px">${escHtml(s.name)}</div><div style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace">${escHtml(s.dateiname)}</div></div>
      <div style="text-align:center"><button class="perm-toggle ${p.darf_sehen?'on':'off'}" onclick="togglePerm(${userId},${s.id},'sehen',this)">${p.darf_sehen?'✔':''}</button></div>
      <div style="text-align:center"><button class="perm-toggle ${p.darf_ausfuehren?'on':'off'}" onclick="togglePerm(${userId},${s.id},'ausfuehren',this)">${p.darf_ausfuehren?'✔':''}</button></div>
      <div style="text-align:center"><button class="perm-toggle ${p.darf_bearbeiten?'on':'off'}" onclick="togglePerm(${userId},${s.id},'bearbeiten',this)">${p.darf_bearbeiten?'✔':''}</button></div>
      <div></div>
    </div>`;
  }).join('') || `<div class="empty-state"><div class="icon">📭</div><p>Keine Scripts vorhanden</p></div>`;
}

async function togglePerm(userId, scriptId, field, btn) {
  const isOn = btn.classList.contains('on');
  const newVal = !isOn;
  const fieldMap = { sehen:'darf_sehen', ausfuehren:'darf_ausfuehren', bearbeiten:'darf_bearbeiten' };

  // Aktuellen Stand ermitteln
  const perms = await window.api.perms.getForScript(scriptId);
  const existing = perms.find(p => p.user_id == userId) || { darf_sehen:0, darf_ausfuehren:0, darf_bearbeiten:0 };
  const updated = { ...existing, [fieldMap[field]]: newVal?1:0 };
  await window.api.perms.set({ userId:parseInt(userId), scriptId, ...updated });

  btn.classList.toggle('on', newVal);
  btn.classList.toggle('off', !newVal);
  btn.textContent = newVal ? '✔' : '';
}

async function grantAllPerms() {
  const userId = document.getElementById('perm-user-select').value;
  if (!userId) return;
  const allScripts = await window.api.scripts.getAll();
  for (const s of allScripts)
    await window.api.perms.set({ userId:parseInt(userId), scriptId:s.id, darf_sehen:1, darf_ausfuehren:1, darf_bearbeiten:0 });
  showToast('✔ Alle Scripte freigegeben', 'ok');
  loadPermsForUser();
}

async function revokeAllPerms() {
  const userId = document.getElementById('perm-user-select').value;
  if (!userId) return;
  const allScripts = await window.api.scripts.getAll();
  for (const s of allScripts)
    await window.api.perms.set({ userId:parseInt(userId), scriptId:s.id, darf_sehen:0, darf_ausfuehren:0, darf_bearbeiten:0 });
  showToast('Alle Berechtigungen entzogen', 'info');
  loadPermsForUser();
}

// ── ADMIN: AUDIT-LOG ──────────────────────────────────────────────────────────
async function loadAuditLog() {
  const entries = await window.api.audit.getLog(500);
  const tbody   = document.getElementById('audit-tbody');
  if (!entries || !entries.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Keine Einträge</td></tr>`;
    return;
  }
  tbody.innerHTML = entries.map(e => {
    let details = '';
    try { const d = JSON.parse(e.details||'{}'); details = Object.entries(d).map(([k,v])=>`${k}:${v}`).join(', '); } catch(_){}
    return `<tr>
      <td>${e.zeitpunkt||''}</td>
      <td style="color:var(--accent1)">${escHtml(e.username||'')}</td>
      <td><span class="audit-aktion">${escHtml(e.aktion||'')}</span></td>
      <td style="color:var(--muted)">${escHtml(e.ziel_typ||'')}${e.ziel_id?` #${e.ziel_id}`:''}</td>
      <td style="color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(details)}">${escHtml(details)}</td>
    </tr>`;
  }).join('');
}

async function exportAudit() {
  const r = await window.api.audit.exportCsv();
  if (r.success) showToast('✔ CSV exportiert: ' + (r.path||''), 'ok');
  else showToast('Fehler: ' + (r.error||''), 'err');
}

async function clearAuditConfirm() {
  if (!confirm('Alle Audit-Log-Einträge wirklich löschen?')) return;
  await window.api.audit.clear();
  showToast('Audit-Log geleert', 'info');
  loadAuditLog();
}

// ── ADMIN: AUTH-EINSTELLUNGEN ──────────────────────────────────────────────────
async function loadAuthSettings() {
  const get = async (k) => (await window.api.settings.get(k)).value || '';
  document.getElementById('cfg-pw-min').value      = await get('pw_min_laenge')   || '8';
  document.getElementById('cfg-max-vers').value    = await get('max_login_vers')  || '5';
  document.getElementById('cfg-lockout-min').value = await get('lockout_minuten') || '5';
  document.getElementById('cfg-timeout').value     = await get('session_timeout') || '30';
  document.getElementById('cfg-totp-force').checked= (await get('totp_erzwungen')) === '1';
}

async function saveAuthSettings() {
  const btn = document.querySelector('[onclick="saveAuthSettings()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Speichern…'; }

  try {
    const settings = [
      ['pw_min_laenge',   document.getElementById('cfg-pw-min').value],
      ['max_login_vers',  document.getElementById('cfg-max-vers').value],
      ['lockout_minuten', document.getElementById('cfg-lockout-min').value],
      ['session_timeout', document.getElementById('cfg-timeout').value],
      ['totp_erzwungen',  document.getElementById('cfg-totp-force').checked ? '1' : '0'],
    ];

    for (const [key, value] of settings) {
      const r = await window.api.settings.set(key, value);
      if (!r || !r.success) throw new Error(`Fehler beim Speichern von "${key}"`);
    }

    // Sofort zurücklesen zur Verifikation
    await loadAuthSettings();
    showToast('✔ Einstellungen gespeichert und verifiziert', 'ok');
  } catch(e) {
    showToast('Fehler: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Einstellungen speichern'; }
  }
}

// ── ADMIN TAB-SWITCHER ────────────────────────────────────────────────────────
async function switchAdminTab(tab) {
  ['users','perms','audit','authsettings'].forEach(t => {
    document.getElementById(`admin-tab-${t}`).style.display = t===tab ? 'flex' : 'none';
    document.getElementById(`atab-${t}`).classList.toggle('active', t===tab);
  });
  if (tab==='users')        await loadUserTable();
  if (tab==='audit')        await loadAuditLog();
  if (tab==='authsettings') await loadAuthSettings();
}

// Auth-Settings auch beim ersten Öffnen der Admin-Page laden
async function openAdminPage() {
  await switchAdminTab('users');
  // Settings im Hintergrund vorladen damit sie beim Tab-Wechsel sofort da sind
  loadAuthSettings();
}

