/**
 * main/session.js – Session-Management, Auth-Middleware, Audit-Log
 */

'use strict';

const state = require('./state');

// ── Hilfsfunktion: an Renderer senden ────────────────────────────────────────
function send(ch, data) {
  if (state.mainWindow?.webContents && !state.mainWindow.isDestroyed())
    state.mainWindow.webContents.send(ch, data);
}

// ── Inaktivitäts-Timer ────────────────────────────────────────────────────────
function startInactivityTimer() {
  clearInactivityTimer();
  if (!state.currentSession) return;
  const minutes = parseInt(state.db?.getSetting('session_timeout') || '30');
  if (minutes <= 0) return;
  state.inactivityTimer = setTimeout(() => {
    const username = state.currentSession?.username;
    logAudit('session_timeout', 'session', null, { username });
    state.currentSession = null;
    send('auth:sessionExpired', { reason: 'Inaktivität' });
  }, minutes * 60 * 1000);
}

function clearInactivityTimer() {
  if (state.inactivityTimer) { clearTimeout(state.inactivityTimer); state.inactivityTimer = null; }
}

function resetInactivityTimer() {
  if (state.currentSession) startInactivityTimer();
}

// ── Audit-Log ─────────────────────────────────────────────────────────────────
function logAudit(aktion, zielTyp, zielId, details) {
  try {
    if (!state.db) return;
    state.db.addAuditLog({
      userId:   state.currentSession?.id   || null,
      username: state.currentSession?.username || 'System',
      aktion, zielTyp, zielId, details,
    });
  } catch (_) {}
}

// ── Permission-Middleware ─────────────────────────────────────────────────────
function requireSession() {
  if (!state.currentSession) throw new Error('Nicht angemeldet');
}

function requireRole(...roles) {
  requireSession();
  if (!roles.includes(state.currentSession.rolle)) throw new Error('Keine Berechtigung');
}

function requirePermission(scriptId, action) {
  requireSession();
  if (state.currentSession.rolle === 'admin') return;
  if (!state.db.checkPermission(state.currentSession.id, scriptId, action))
    throw new Error('Keine Berechtigung für dieses Script');
}

// ── Sicherer IPC-Wrapper ──────────────────────────────────────────────────────
function secureHandle(ipcMain, channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      resetInactivityTimer();
      return await handler(event, ...args);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

// ── Session-Hilfsfunktionen ───────────────────────────────────────────────────
function sanitizeSession(s) {
  return { id: s.id, username: s.username, rolle: s.rolle, totp_aktiv: s.totp_aktiv, muss_pw_aendern: s.muss_pw_aendern };
}

function dbReady() {
  if (!state.db) throw new Error('DB nicht initialisiert');
  return state.db;
}

module.exports = {
  send,
  startInactivityTimer,
  clearInactivityTimer,
  resetInactivityTimer,
  logAudit,
  requireSession,
  requireRole,
  requirePermission,
  secureHandle,
  sanitizeSession,
  dbReady,
};
