/**
 * main/tray.js – System-Tray Icon & Menü
 */

'use strict';

const { Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs   = require('fs');
const state = require('./state');

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();
  state.tray = new Tray(icon);
  state.tray.setToolTip('PS Script Manager');
  updateTrayMenu();
  state.tray.on('double-click', showWindow);
}

function updateTrayMenu(schedulerInfo) {
  if (!state.tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '⚡ PS Script Manager', enabled: false },
    { type:  'separator' },
    { label: '📋 Öffnen', click: showWindow },
    { label: schedulerInfo || '🕐 Scheduler aktiv', enabled: false },
    { type:  'separator' },
    { label: '❌ Beenden', click: () => {
      state.isQuitting = true;
      if (state.schedulerTimer) clearInterval(state.schedulerTimer);
      require('electron').app.quit();
    }},
  ]);
  state.tray.setContextMenu(menu);
}

function showWindow() {
  if (!state.mainWindow) return;
  if (state.mainWindow.isMinimized()) state.mainWindow.restore();
  state.mainWindow.show();
  state.mainWindow.focus();
}

function showTrayNotification(title, body) {
  if (!Notification.isSupported() || !state.tray) return;
  new Notification({
    title, body,
    icon:   path.join(__dirname, '..', 'assets', 'icon.ico'),
    silent: true,
  }).show();
}

module.exports = { createTray, updateTrayMenu, showWindow, showTrayNotification };
