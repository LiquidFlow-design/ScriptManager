/**
 * main/ipc-auth.js – IPC-Handler für Auth, Benutzer, Berechtigungen, Audit, TOTP
 */

'use strict';

const crypto = require('crypto');
const state  = require('./state');
const {
  secureHandle, requireSession, requireRole,
  logAudit, sanitizeSession, dbReady, startInactivityTimer,
} = require('./session');

let OTPAuth = null;
let QRCode  = null;
try { OTPAuth = require('otpauth'); } catch (_) { console.warn('[AUTH] otpauth nicht gefunden – TOTP deaktiviert'); }
try { QRCode  = require('qrcode');  } catch (_) { console.warn('[AUTH] qrcode nicht gefunden – QR-Anzeige deaktiviert'); }

function register(ipcMain) {

  // ── Ersteinrichtung ─────────────────────────────────────────────────────
  ipcMain.handle('auth:needsSetup', () => {
    try {
      const count = dbReady().getUserCount();
      return { needsSetup: count === 0 };
    } catch (e) {
      // DB noch nicht bereit oder anderer Fehler → kein Setup anzeigen
      console.error('[auth:needsSetup] Fehler:', e.message);
      return { needsSetup: false, error: e.message };
    }
  });

  ipcMain.handle('auth:setup', async (_e, { username, password }) => {
    try {
      const d = dbReady();
      if (d.getUserCount() > 0) return { success: false, error: 'Ersteinrichtung bereits abgeschlossen' };
      const result = d.createUser({ username, password, rolle: 'admin', muss_pw_aendern: 0 });
      if (!result.success) return result;
      logAudit('admin_erstellt', 'user', result.id, { username });
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Login Schritt 1: Passwort ───────────────────────────────────────────
  ipcMain.handle('auth:login', async (_e, { username, password }) => {
    try {
      const d = dbReady();
      const result = d.loginUser(username, password);
      if (!result.success) {
        logAudit('login_fehlgeschlagen', 'user', null, { username, grund: result.error });
        return result;
      }

      if (result.user.totp_aktiv == 1) {
        const pendingToken = crypto.randomBytes(16).toString('hex');
        state.pendingTotpSessions[pendingToken] = { user: result.user, expires: Date.now() + 5 * 60 * 1000 };
        return { success: true, requires2FA: true, pendingToken, username: result.user.username };
      }

      const totpErzwungen = d.getSetting('totp_erzwungen') === '1';
      if (totpErzwungen && result.user.totp_aktiv != 1 && result.user.rolle !== 'admin') {
        state.currentSession = { ...result.user, loginTime: Date.now() };
        startInactivityTimer();
        logAudit('login_totp_setup_erzwungen', 'user', result.user.id, { username });
        return { success: true, user: sanitizeSession(state.currentSession), requiresTotpSetup: true };
      }

      state.currentSession = { ...result.user, loginTime: Date.now() };
      startInactivityTimer();
      logAudit('login_erfolgreich', 'user', result.user.id, { username });
      return { success: true, user: sanitizeSession(state.currentSession) };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Login Schritt 2: TOTP ───────────────────────────────────────────────
  ipcMain.handle('auth:verifyTotp', async (_e, { pendingToken, code }) => {
    try {
      const pending = state.pendingTotpSessions[pendingToken];
      if (!pending || Date.now() > pending.expires) {
        delete state.pendingTotpSessions[pendingToken];
        return { success: false, error: 'Session abgelaufen. Bitte erneut anmelden.' };
      }
      if (!OTPAuth) return { success: false, error: 'TOTP-Modul nicht verfügbar (otpauth nicht installiert)' };
      const secret = dbReady().getTotpSecret(pending.user.id);
      const totp   = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
      const valid  = totp.validate({ token: code.replace(/\s/g, ''), window: 1 }) !== null;
      if (!valid) {
        logAudit('totp_fehlgeschlagen', 'user', pending.user.id, { username: pending.user.username });
        return { success: false, error: 'Ungültiger Authenticator-Code' };
      }
      delete state.pendingTotpSessions[pendingToken];
      state.currentSession = { ...pending.user, loginTime: Date.now() };
      startInactivityTimer();
      logAudit('login_erfolgreich_2fa', 'user', pending.user.id, { username: pending.user.username });
      return { success: true, user: sanitizeSession(state.currentSession) };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Logout / Session ────────────────────────────────────────────────────
  ipcMain.handle('auth:logout', () => {
    logAudit('logout', 'session', null, { username: state.currentSession?.username });
    const { clearInactivityTimer } = require('./session');
    clearInactivityTimer();
    state.currentSession = null;
    return { success: true };
  });

  ipcMain.handle('auth:getSession', () =>
    state.currentSession
      ? { loggedIn: true,  user: sanitizeSession(state.currentSession) }
      : { loggedIn: false });

  // ── Passwort ändern (eigenes Konto) ────────────────────────────────────
  secureHandle(ipcMain, 'auth:changePassword', async (_e, { oldPassword, newPassword }) => {
    requireSession();
    const d    = dbReady();
    const user = d.getUserById(state.currentSession.id);
    if (!d._verifyPassword(oldPassword, user.password_hash, user.salt))
      return { success: false, error: 'Aktuelles Passwort falsch' };
    const minLen = parseInt(d.getSetting('pw_min_laenge') || '8');
    if (newPassword.length < minLen) return { success: false, error: `Passwort muss mindestens ${minLen} Zeichen haben` };
    d.changePassword(state.currentSession.id, newPassword);
    state.currentSession.muss_pw_aendern = 0;
    logAudit('passwort_geaendert', 'user', state.currentSession.id, {});
    return { success: true };
  });

  // ── TOTP Setup / Confirm / Disable ────────────────────────────────────
  secureHandle(ipcMain, 'auth:totp:setup', async () => {
    requireSession();
    if (!OTPAuth) return { success: false, error: 'otpauth Modul nicht installiert' };
    const secret = new OTPAuth.Secret();
    const totp   = new OTPAuth.TOTP({ issuer: 'PSScriptManager', label: state.currentSession.username, secret });
    const uri    = totp.toString();
    let qrDataUrl = null;
    if (QRCode) { try { qrDataUrl = await QRCode.toDataURL(uri); } catch (_) {} }
    state.db.setTotpSecret(state.currentSession.id, secret.base32);
    return { success: true, secret: secret.base32, qrDataUrl };
  });

  secureHandle(ipcMain, 'auth:totp:confirm', async (_e, { code }) => {
    requireSession();
    if (!OTPAuth) return { success: false, error: 'otpauth Modul nicht installiert' };
    const secret = dbReady().getTotpSecret(state.currentSession.id);
    if (!secret) return { success: false, error: 'Kein TOTP-Secret vorhanden' };
    const totp  = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    const valid = totp.validate({ token: code.replace(/\s/g, ''), window: 1 }) !== null;
    if (!valid) return { success: false, error: 'Ungültiger Code' };
    state.db.setTotpSecret(state.currentSession.id, secret);
    state.currentSession.totp_aktiv = 1;
    logAudit('totp_aktiviert', 'user', state.currentSession.id, {});
    return { success: true };
  });

  secureHandle(ipcMain, 'auth:totp:disable', async () => {
    requireSession();
    dbReady().disableTotp(state.currentSession.id);
    state.currentSession.totp_aktiv = 0;
    logAudit('totp_deaktiviert', 'user', state.currentSession.id, {});
    return { success: true };
  });

  // ── Benutzerverwaltung (Admin only) ───────────────────────────────────
  secureHandle(ipcMain, 'users:getAll', () => {
    requireRole('admin');
    return dbReady().getAllUsers();
  });

  secureHandle(ipcMain, 'users:add', (_e, data) => {
    requireRole('admin');
    const result = dbReady().createUser(data);
    if (result.success) logAudit('user_erstellt', 'user', result.id, { username: data.username });
    return result;
  });

  secureHandle(ipcMain, 'users:update', (_e, data) => {
    requireRole('admin');
    const result = dbReady().updateUser(data);
    if (result.success) logAudit('user_geaendert', 'user', data.id, { username: data.username });
    return result;
  });

  secureHandle(ipcMain, 'users:delete', (_e, id) => {
    requireRole('admin');
    if (id === state.currentSession.id) return { success: false, error: 'Eigenen Account nicht löschbar' };
    const result = dbReady().deleteUser(id);
    if (result.success) logAudit('user_geloescht', 'user', id, {});
    return result;
  });

  secureHandle(ipcMain, 'users:resetPassword', (_e, { userId, newPassword }) => {
    requireRole('admin');
    const d      = dbReady();
    const minLen = parseInt(d.getSetting('pw_min_laenge') || '8');
    if (newPassword.length < minLen) return { success: false, error: `Passwort muss mindestens ${minLen} Zeichen haben` };
    d.changePassword(userId, newPassword);
    d.setMustChangePassword(userId, true);
    logAudit('passwort_zurueckgesetzt', 'user', userId, {});
    return { success: true };
  });

  // ── Berechtigungen ─────────────────────────────────────────────────────
  secureHandle(ipcMain, 'perms:getForScript', (_e, scriptId) => {
    requireRole('admin');
    return dbReady().getPermissionsForScript(scriptId);
  });

  secureHandle(ipcMain, 'perms:getForUser', (_e, userId) => {
    requireRole('admin');
    return dbReady().getPermissionsForUser(userId);
  });

  secureHandle(ipcMain, 'perms:set', (_e, perm) => {
    requireRole('admin');
    logAudit('berechtigung_gesetzt', 'permission', perm.scriptId, { userId: perm.userId });
    return dbReady().setPermission(perm);
  });

  secureHandle(ipcMain, 'perms:delete', (_e, { userId, scriptId }) => {
    requireRole('admin');
    logAudit('berechtigung_geloescht', 'permission', scriptId, { userId });
    return dbReady().deletePermission(userId, scriptId);
  });

  // ── Audit-Log ──────────────────────────────────────────────────────────
  secureHandle(ipcMain, 'audit:getLog', (_e, limit) => {
    requireRole('admin');
    return dbReady().getAuditLog(limit);
  });

  secureHandle(ipcMain, 'audit:clear', () => {
    requireRole('admin');
    logAudit('audit_log_geleert', 'audit', null, {});
    return dbReady().clearAuditLog();
  });

  secureHandle(ipcMain, 'audit:exportCsv', async () => {
    requireRole('admin');
    const { dialog } = require('electron');
    const entries = dbReady().getAuditLog(10000);
    const header  = 'Zeitpunkt,Benutzer,Aktion,Ziel-Typ,Ziel-ID,Details\n';
    const rows    = entries.map(e =>
      [e.zeitpunkt, e.username, e.aktion, e.ziel_typ||'', e.ziel_id||'', e.details||'']
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    ).join('\n');
    const r = await dialog.showSaveDialog(state.mainWindow, {
      title: 'Audit-Log exportieren', defaultPath: 'audit-log.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (r.canceled) return { success: false };
    require('fs').writeFileSync(r.filePath, '\uFEFF' + header + rows, 'utf-8');
    return { success: true };
  });
}

module.exports = { register };
