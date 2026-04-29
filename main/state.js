/**
 * main/state.js – Geteilter Zustand des Main-Prozesses
 * Wird von allen IPC-Modulen importiert.
 */

'use strict';

const state = {
  db:             null,   // DB-Instanz (gesetzt nach createDb)
  mainWindow:     null,   // BrowserWindow
  tray:           null,   // Tray
  runningProc:    null,   // aktuell laufender child_process
  schedulerTimer: null,   // setInterval-Handle
  isQuitting:     false,

  // Auth – Session lebt ausschließlich im Main-Prozess
  currentSession: null,   // { id, username, rolle, totp_aktiv, muss_pw_aendern, loginTime }
  inactivityTimer: null,
  pendingTotpSessions: {}, // { [token]: { user, expires } }
};

module.exports = state;
