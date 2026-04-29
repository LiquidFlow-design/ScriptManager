/**
 * main.js – Electron Hauptprozess v3.1
 * Nur noch Bootstrap, Fenster, App-Lifecycle.
 * Alle IPC-Handler und Logik → main/*.js
 */

'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Pfade & geteilter Zustand ────────────────────────────────────────────────
const { APP_DATA, DB_PATH, LOG_DIR, LIB_DIR, BUILTIN_LIB, IS_PACKAGED } = require('./main/paths');
const state   = require('./main/state');

// ── Verzeichnisse anlegen ────────────────────────────────────────────────────
[APP_DATA, LOG_DIR, LIB_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Eingebaute PS1-Scripte beim ersten Start kopieren (nicht überschreiben)
if (IS_PACKAGED && fs.existsSync(BUILTIN_LIB)) {
  try {
    fs.readdirSync(BUILTIN_LIB)
      .filter(f => f.toLowerCase().endsWith('.ps1'))
      .forEach(f => {
        const dest = path.join(LIB_DIR, f);
        if (!fs.existsSync(dest)) fs.copyFileSync(path.join(BUILTIN_LIB, f), dest);
      });
  } catch (e) { console.error('Builtin-Copy Fehler:', e); }
}

// ── Auto-Updater ─────────────────────────────────────────────────────────────
const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = false;

// ── Module registrieren ──────────────────────────────────────────────────────
const { createTray, showTrayNotification } = require('./main/tray');
const { startScheduler }                   = require('./main/ipc-scheduler');

require('./main/ipc-auth')     .register(ipcMain);
require('./main/ipc-scripts')  .register(ipcMain);
require('./main/ipc-chains')   .register(ipcMain);
require('./main/ipc-scheduler').register(ipcMain);
require('./main/ipc-system')   .register(ipcMain, { autoUpdater, APP_DATA, LIB_DIR, app });
require('./main/ipc-api')      .register(ipcMain);

// ── Fenster ──────────────────────────────────────────────────────────────────
function createWindow() {
  state.mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    frame: false, backgroundColor: '#0d0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  state.mainWindow.loadFile('renderer/index.html');
  if (!IS_PACKAGED) state.mainWindow.webContents.openDevTools({ mode: 'detach' });

  state.mainWindow.on('close', e => {
    if (!state.isQuitting) {
      e.preventDefault();
      state.mainWindow.hide();
      showTrayNotification('PS Script Manager läuft im Hintergrund', 'Scheduler ist aktiv. Über das Tray-Icon wieder öffnen.');
    }
  });
}

// ── Fenster-Controls ─────────────────────────────────────────────────────────
ipcMain.on('win:minimize', () => state.mainWindow.minimize());
ipcMain.on('win:maximize', () => state.mainWindow.isMaximized() ? state.mainWindow.unmaximize() : state.mainWindow.maximize());
ipcMain.on('win:close',    () => { state.mainWindow.hide(); showTrayNotification('PS Script Manager läuft weiter', 'Über das Tray-Icon öffnen.'); });
ipcMain.on('app:quit',     () => { state.isQuitting = true; app.quit(); });

// ── App-Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try { state.db = await require('./database/db')(DB_PATH); }
  catch (e) { console.error('DB Fehler:', e); }

  createWindow();
  createTray();
  startScheduler();
});

app.on('window-all-closed', () => { if (process.platform === 'darwin') app.quit(); });
app.on('before-quit', () => {
  state.isQuitting = true;
  if (state.schedulerTimer) clearInterval(state.schedulerTimer);
});
