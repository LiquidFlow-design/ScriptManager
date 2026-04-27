/**
 * main.js – Electron Hauptprozess v3.0
 * NEU: Auth-System (Login, Session, Rollen), TOTP 2FA, Permissions, Audit-Log
 *
 * TOTP-Abhängigkeit: npm install otpauth qrcode
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path   = require('path');
const fs     = require('fs');
const cp     = require('child_process');
const crypto = require('crypto');

// TOTP & QR – werden lazy geladen (falls nicht installiert: graceful degradation)
let OTPAuth = null;
let QRCode  = null;
try { OTPAuth = require('otpauth'); }  catch(_) { console.warn('[AUTH] otpauth nicht gefunden – TOTP deaktiviert'); }
try { QRCode  = require('qrcode'); }   catch(_) { console.warn('[AUTH] qrcode nicht gefunden – QR-Anzeige deaktiviert'); }

const IS_PACKAGED = app.isPackaged;
const APP_DATA    = path.join(app.getPath('appData'), 'PSScriptManager');
const DB_PATH     = path.join(APP_DATA, 'scriptmanager.db');
const LOG_DIR     = path.join(APP_DATA, 'Logs');
const LIB_DIR     = path.join(APP_DATA, 'lib');
const BUILTIN_LIB = IS_PACKAGED ? path.join(process.resourcesPath,'lib') : path.join(__dirname,'lib');

[APP_DATA, LOG_DIR, LIB_DIR].forEach(d => { if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });

if(IS_PACKAGED && fs.existsSync(BUILTIN_LIB)) {
  try {
    fs.readdirSync(BUILTIN_LIB).filter(f=>f.toLowerCase().endsWith('.ps1')).forEach(f=>{
      const dest=path.join(LIB_DIR,f);
      if(!fs.existsSync(dest)) fs.copyFileSync(path.join(BUILTIN_LIB,f),dest);
    });
  } catch(e) { console.error('Builtin-Copy Fehler:',e); }
}

const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = false;

let db             = null;
let mainWindow;
let tray           = null;
let runningProc    = null;
let schedulerTimer = null;
let isQuitting     = false;

// ════════════════════════════════════════════════════════════════════════
//  SESSION – lebt ausschließlich im Main-Prozess (niemals im Renderer!)
// ════════════════════════════════════════════════════════════════════════
let currentSession = null;   // { id, username, rolle, totp_aktiv, muss_pw_aendern, loginTime }
let inactivityTimer = null;

function startInactivityTimer() {
  clearInactivityTimer();
  if (!currentSession) return;
  const minutes = parseInt(db?.getSetting('session_timeout') || '30');
  if (minutes <= 0) return;
  inactivityTimer = setTimeout(() => {
    const username = currentSession?.username;
    logAudit('session_timeout', 'session', null, { username });
    currentSession = null;
    send('auth:sessionExpired', { reason: 'Inaktivität' });
  }, minutes * 60 * 1000);
}

function clearInactivityTimer() {
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
}

function resetInactivityTimer() {
  if (currentSession) startInactivityTimer();
}

function logAudit(aktion, zielTyp, zielId, details) {
  try {
    if (!db) return;
    db.addAuditLog({
      userId:   currentSession?.id || null,
      username: currentSession?.username || 'System',
      aktion, zielTyp, zielId, details
    });
  } catch(_) {}
}

// ── Permission-Middleware ─────────────────────────────────────────────────
function requireSession() {
  if (!currentSession) throw new Error('Nicht angemeldet');
}

function requireRole(...roles) {
  requireSession();
  if (!roles.includes(currentSession.rolle)) throw new Error('Keine Berechtigung');
}

function requirePermission(scriptId, action) {
  requireSession();
  if (currentSession.rolle === 'admin') return; // Admin darf alles
  if (!db.checkPermission(currentSession.id, scriptId, action))
    throw new Error('Keine Berechtigung für dieses Script');
}

// Wrapper: sicherer IPC-Handler mit automatischer Session-Prüfung
function secureHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      resetInactivityTimer();
      return await handler(event, ...args);
    } catch(e) {
      return { success:false, error: e.message };
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  FENSTER & TRAY
// ════════════════════════════════════════════════════════════════════════
function createWindow() {
  mainWindow = new BrowserWindow({
    width:1280, height:820, minWidth:900, minHeight:600,
    icon: path.join(__dirname,'assets','icon.ico'),
    frame:false, backgroundColor:'#0d0d14',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false }
  });
  mainWindow.loadFile('renderer/index.html');
  if(!IS_PACKAGED) mainWindow.webContents.openDevTools({mode:'detach'});

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      showTrayNotification('PS Script Manager läuft im Hintergrund','Scheduler ist aktiv. Über das Tray-Icon wieder öffnen.');
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname,'assets','icon.ico');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({width:16,height:16})
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('PS Script Manager');
  updateTrayMenu();
  tray.on('double-click', showWindow);
}

function updateTrayMenu(schedulerInfo) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label:'⚡ PS Script Manager', enabled:false },
    { type:'separator' },
    { label:'📋 Öffnen', click:showWindow },
    { label: schedulerInfo || '🕐 Scheduler aktiv', enabled:false },
    { type:'separator' },
    { label:'❌ Beenden', click:() => { isQuitting=true; if(schedulerTimer) clearInterval(schedulerTimer); app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showTrayNotification(title, body) {
  if (!Notification.isSupported() || !tray) return;
  new Notification({ title, body, icon:path.join(__dirname,'assets','icon.ico'), silent:true }).show();
}

function send(ch, data) {
  if (mainWindow?.webContents && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data);
}

// ════════════════════════════════════════════════════════════════════════
//  APP START
// ════════════════════════════════════════════════════════════════════════
app.whenReady().then(async () => {
  try { db = await require('./database/db')(DB_PATH); } catch(e) { console.error('DB:',e); }
  createWindow();
  createTray();
  startScheduler();
});

app.on('window-all-closed', () => { if(process.platform==='darwin') app.quit(); });
app.on('before-quit', () => { isQuitting=true; if(schedulerTimer) clearInterval(schedulerTimer); });

function dbReady() { if(!db) throw new Error('DB nicht initialisiert'); return db; }

// ── Fenster-Controls ──────────────────────────────────────────────────────
ipcMain.on('win:minimize', ()=>mainWindow.minimize());
ipcMain.on('app:quit',     ()=>{ isQuitting=true; app.quit(); });
ipcMain.on('win:maximize', ()=>mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize());
ipcMain.on('win:close',    ()=>{ mainWindow.hide(); showTrayNotification('PS Script Manager läuft weiter','Über das Tray-Icon öffnen.'); });

// ════════════════════════════════════════════════════════════════════════
//  AUTH – Login / Session / Ersteinrichtung
// ════════════════════════════════════════════════════════════════════════

// Prüfen ob Ersteinrichtung nötig (kein Admin vorhanden)
ipcMain.handle('auth:needsSetup', () => {
  try { return { needsSetup: dbReady().getUserCount() === 0 }; }
  catch(e) { return { error: e.message }; }
});

// Ersteinrichtung – Admin-Konto anlegen
ipcMain.handle('auth:setup', async (_e, { username, password }) => {
  try {
    const d = dbReady();
    if (d.getUserCount() > 0) return { success:false, error:'Ersteinrichtung bereits abgeschlossen' };
    const result = d.createUser({ username, password, rolle:'admin', muss_pw_aendern:0 });
    if (!result.success) return result;
    logAudit('admin_erstellt', 'user', result.id, { username });
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// Login – Schritt 1: Username + Passwort
ipcMain.handle('auth:login', async (_e, { username, password }) => {
  try {
    const d = dbReady();
    const result = d.loginUser(username, password);
    if (!result.success) {
      logAudit('login_fehlgeschlagen', 'user', null, { username, grund: result.error });
      return result;
    }

    // 2FA prüfen — totp_aktiv kommt aus SQLite als Integer (0/1), explizit casten
    if (result.user.totp_aktiv == 1) {
      // Session noch nicht öffnen – warte auf TOTP-Bestätigung
      const pendingToken = crypto.randomBytes(16).toString('hex');
      pendingTotpSessions[pendingToken] = { user: result.user, expires: Date.now() + 5 * 60 * 1000 };
      return { success:true, requires2FA:true, pendingToken, username: result.user.username };
    }

    // 2FA global erzwungen? Prüfen ob User noch kein TOTP eingerichtet hat
    // Admin ist bewusst ausgenommen – verhindert Selbstaussperrung
    const totpErzwungen = d.getSetting('totp_erzwungen') === '1';
    if (totpErzwungen && result.user.totp_aktiv != 1 && result.user.rolle !== 'admin') {
      // Session öffnen, aber Frontend wird zum TOTP-Setup gezwungen
      currentSession = { ...result.user, loginTime: Date.now() };
      startInactivityTimer();
      logAudit('login_totp_setup_erzwungen', 'user', result.user.id, { username });
      return { success:true, user: sanitizeSession(currentSession), requiresTotpSetup: true };
    }

    // Normaler Login – Session öffnen
    currentSession = { ...result.user, loginTime: Date.now() };
    startInactivityTimer();
    logAudit('login_erfolgreich', 'user', result.user.id, { username });
    return { success:true, user: sanitizeSession(currentSession) };
  } catch(e) { return { success:false, error:e.message }; }
});

// Temporäre TOTP-Pending-Sessions (warten auf 2. Faktor)
const pendingTotpSessions = {};

// Login – Schritt 2: TOTP-Code bestätigen
ipcMain.handle('auth:verifyTotp', async (_e, { pendingToken, code }) => {
  try {
    const pending = pendingTotpSessions[pendingToken];
    if (!pending || Date.now() > pending.expires) {
      delete pendingTotpSessions[pendingToken];
      return { success:false, error:'Session abgelaufen. Bitte erneut anmelden.' };
    }

    if (!OTPAuth) return { success:false, error:'TOTP-Modul nicht verfügbar (otpauth nicht installiert)' };

    const secret = dbReady().getTotpSecret(pending.user.id);
    const totp   = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    const valid  = totp.validate({ token: code.replace(/\s/g,''), window:1 }) !== null;

    if (!valid) {
      logAudit('totp_fehlgeschlagen', 'user', pending.user.id, { username: pending.user.username });
      return { success:false, error:'Ungültiger Authenticator-Code' };
    }

    delete pendingTotpSessions[pendingToken];
    currentSession = { ...pending.user, loginTime: Date.now() };
    startInactivityTimer();
    logAudit('login_erfolgreich_2fa', 'user', pending.user.id, { username: pending.user.username });
    return { success:true, user: sanitizeSession(currentSession) };
  } catch(e) { return { success:false, error:e.message }; }
});

// Logout
ipcMain.handle('auth:logout', () => {
  logAudit('logout', 'session', null, { username: currentSession?.username });
  clearInactivityTimer();
  currentSession = null;
  return { success:true };
});

// Aktuelle Session abfragen (z.B. nach App-Neustart aus Tray)
ipcMain.handle('auth:getSession', () => {
  return currentSession ? { loggedIn:true, user: sanitizeSession(currentSession) } : { loggedIn:false };
});

// Passwort ändern (eigenes Konto)
secureHandle('auth:changePassword', async (_e, { oldPassword, newPassword }) => {
  requireSession();
  const d    = dbReady();
  const user = d.getUserById(currentSession.id);
  if (!d._verifyPassword(oldPassword, user.password_hash, user.salt))
    return { success:false, error:'Aktuelles Passwort falsch' };
  const minLen = parseInt(d.getSetting('pw_min_laenge') || '8');
  if (newPassword.length < minLen) return { success:false, error:`Passwort muss mindestens ${minLen} Zeichen haben` };
  d.changePassword(currentSession.id, newPassword);
  currentSession.muss_pw_aendern = 0;
  logAudit('passwort_geaendert', 'user', currentSession.id, {});
  return { success:true };
});

function sanitizeSession(s) {
  return { id:s.id, username:s.username, rolle:s.rolle, totp_aktiv:s.totp_aktiv, muss_pw_aendern:s.muss_pw_aendern };
}

// ════════════════════════════════════════════════════════════════════════
//  TOTP EINRICHTUNG (für eingeloggten User)
// ════════════════════════════════════════════════════════════════════════

// Neues TOTP-Secret generieren + QR-URI zurückgeben
secureHandle('auth:totp:setup', async () => {
  requireSession();
  if (!OTPAuth) return { success:false, error:'otpauth Modul nicht installiert. Bitte: npm install otpauth qrcode' };

  const secret = new OTPAuth.Secret();
  const totp   = new OTPAuth.TOTP({
    // Kein Leerzeichen im issuer → Authy generiert saubereres Icon
    issuer: 'PSScriptManager',
    label:  `PSScriptManager:${currentSession.username}`,
    secret,
    algorithm: 'SHA1',   // Standard – kompatibel mit allen Authenticator-Apps
    digits:    6,
    period:    30,
  });
  const uri = totp.toString();

  // Secret temporär in der Session halten bis Bestätigung
  currentSession._pendingTotpSecret = secret.base32;

  let qrDataUrl = null;
  if (QRCode) {
    try {
      // App-Icon als Logo in QR-Mitte einbetten
      const iconPath = path.join(__dirname, 'assets', 'icon-32.png');
      const hasIcon  = fs.existsSync(iconPath);

      // QR-Code mit Branding-Farben + hoher Fehlerkorrektur (H) generieren
      // Fehlerkorrektur H (30%) nötig damit Logo + QR-Code zusammen noch lesbar sind
      const qrOpts = {
        errorCorrectionLevel: 'H',
        width:  320,
        margin: 2,
        color: {
          dark:  '#7c6af7',   // Accent-Farbe der App (lila)
          light: '#ffffff',
        },
      };

      if (hasIcon) {
        // Mit Logo in der Mitte via jimp/canvas – falls nicht verfügbar: Fallback
        try {
          const { createCanvas, loadImage } = require('canvas');
          const qrBuffer = await QRCode.toBuffer(uri, { ...qrOpts, type: 'png' });

          const qrImg   = await loadImage(qrBuffer);
          const logoImg = await loadImage(iconPath);

          const size   = qrOpts.width;
          const canvas = createCanvas(size, size);
          const ctx    = canvas.getContext('2d');

          // QR-Code zeichnen
          ctx.drawImage(qrImg, 0, 0, size, size);

          // Logo zentriert einbetten (20% der QR-Größe)
          const logoSize = Math.floor(size * 0.20);
          const logoX    = Math.floor((size - logoSize) / 2);
          const logoY    = Math.floor((size - logoSize) / 2);

          // Weißer Hintergrund hinter Logo (damit QR-Code drum herum lesbar bleibt)
          const pad = 6;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(logoX - pad, logoY - pad, logoSize + pad*2, logoSize + pad*2, 8);
          ctx.fill();

          ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);

          qrDataUrl = canvas.toDataURL('image/png');
        } catch(_) {
          // canvas nicht installiert → QR ohne Logo aber mit Farbe
          qrDataUrl = await QRCode.toDataURL(uri, qrOpts);
        }
      } else {
        // Kein Icon vorhanden → QR mit Farbe, ohne Logo
        qrDataUrl = await QRCode.toDataURL(uri, qrOpts);
      }
    } catch(_) {
      // Letzter Fallback: Standard-QR ohne jegliche Optionen
      try { qrDataUrl = await QRCode.toDataURL(uri); } catch(__) {}
    }
  }

  return { success:true, uri, qrDataUrl, secret: secret.base32 };
});

// TOTP-Einrichtung bestätigen (User gibt einmal den Code ein)
secureHandle('auth:totp:confirm', async (_e, { code }) => {
  requireSession();
  if (!OTPAuth) return { success:false, error:'otpauth nicht installiert' };
  const pendingSecret = currentSession._pendingTotpSecret;
  if (!pendingSecret) return { success:false, error:'Keine ausstehende TOTP-Einrichtung' };

  const totp  = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(pendingSecret) });
  const valid = totp.validate({ token: code.replace(/\s/g,''), window:1 }) !== null;
  if (!valid) return { success:false, error:'Code ungültig – bitte erneut versuchen' };

  dbReady().setTotpSecret(currentSession.id, pendingSecret);
  currentSession.totp_aktiv = 1;
  delete currentSession._pendingTotpSecret;
  logAudit('totp_aktiviert', 'user', currentSession.id, {});
  return { success:true };
});

// TOTP deaktivieren (nur Admin oder eigenes Konto)
secureHandle('auth:totp:disable', async (_e, { userId }) => {
  requireSession();
  const targetId = userId || currentSession.id;
  if (targetId !== currentSession.id) requireRole('admin');
  dbReady().disableTotp(targetId);
  if (targetId === currentSession.id) currentSession.totp_aktiv = 0;
  logAudit('totp_deaktiviert', 'user', targetId, { durch: currentSession.username });
  return { success:true };
});

// ════════════════════════════════════════════════════════════════════════
//  USER MANAGEMENT (nur Admin)
// ════════════════════════════════════════════════════════════════════════

secureHandle('users:getAll', () => {
  requireRole('admin');
  return dbReady().getAllUsers();
});

secureHandle('users:add', (_e, userData) => {
  requireRole('admin');
  const d = dbReady();
  const minLen = parseInt(d.getSetting('pw_min_laenge') || '8');
  if (!userData.password || userData.password.length < minLen)
    return { success:false, error:`Passwort muss mindestens ${minLen} Zeichen haben` };
  const result = d.createUser({ ...userData, muss_pw_aendern:1 });
  if (result.success) logAudit('user_erstellt', 'user', result.id, { username: userData.username, rolle: userData.rolle });
  return result;
});

secureHandle('users:update', (_e, userData) => {
  requireRole('admin');
  // Eigene Rolle darf Admin nicht auf non-admin setzen (Aussperrschutz)
  if (userData.id === currentSession.id && userData.rolle !== 'admin')
    return { success:false, error:'Du kannst deine eigene Admin-Rolle nicht entfernen' };
  const result = dbReady().updateUser(userData);
  if (result.success) logAudit('user_geaendert', 'user', userData.id, { aenderungen: userData });
  return result;
});

secureHandle('users:delete', (_e, userId) => {
  requireRole('admin');
  if (userId === currentSession.id) return { success:false, error:'Du kannst deinen eigenen Account nicht löschen' };
  const user = dbReady().getUserById(userId);
  const result = dbReady().deleteUser(userId);
  if (result.success) logAudit('user_geloescht', 'user', userId, { username: user?.username });
  return result;
});

secureHandle('users:resetPassword', (_e, { userId, tempPassword }) => {
  requireRole('admin');
  const d = dbReady();
  const minLen = parseInt(d.getSetting('pw_min_laenge') || '8');
  if (!tempPassword || tempPassword.length < minLen)
    return { success:false, error:`Passwort muss mindestens ${minLen} Zeichen haben` };
  const result = d.resetPassword(userId, tempPassword);
  if (result.success) logAudit('passwort_zurueckgesetzt', 'user', userId, { durch: currentSession.username });
  return result;
});

// ════════════════════════════════════════════════════════════════════════
//  PERMISSIONS (nur Admin)
// ════════════════════════════════════════════════════════════════════════

secureHandle('perms:getForScript', (_e, scriptId) => {
  requireRole('admin');
  return dbReady().getPermissionsForScript(scriptId);
});

secureHandle('perms:getForUser', (_e, userId) => {
  requireRole('admin');
  return dbReady().getPermissionsForUser(userId);
});

secureHandle('perms:set', (_e, perm) => {
  requireRole('admin');
  const result = dbReady().setPermission(perm);
  if (result.success) logAudit('permission_geaendert', 'script', perm.scriptId, { userId: perm.userId, ...perm });
  return result;
});

secureHandle('perms:delete', (_e, { userId, scriptId }) => {
  requireRole('admin');
  return dbReady().deletePermission(userId, scriptId);
});

// ════════════════════════════════════════════════════════════════════════
//  AUDIT LOG (nur Admin)
// ════════════════════════════════════════════════════════════════════════

secureHandle('audit:getLog', (_e, limit) => {
  requireRole('admin');
  return dbReady().getAuditLog(limit || 500);
});

secureHandle('audit:clear', () => {
  requireRole('admin');
  logAudit('audit_log_geleert', 'audit', null, {});
  return dbReady().clearAuditLog();
});

secureHandle('audit:exportCsv', async () => {
  requireRole('admin');
  try {
    const entries = dbReady().getAuditLog(10000);
    const header  = 'Zeitpunkt;Benutzer;Aktion;Ziel-Typ;Ziel-ID;Details\n';
    const rows    = entries.map(e =>
      `${e.zeitpunkt};${e.username};${e.aktion};${e.ziel_typ||''};${e.ziel_id||''};${e.details||''}`
    ).join('\n');
    const csvPath = path.join(APP_DATA, `audit_${Date.now()}.csv`);
    fs.writeFileSync(csvPath, '\uFEFF' + header + rows, 'utf-8');
    shell.openPath(csvPath);
    return { success:true, path:csvPath };
  } catch(e) { return { success:false, error:e.message }; }
});

// ════════════════════════════════════════════════════════════════════════
//  SCRIPTS CRUD – mit Session + Permission-Check
// ════════════════════════════════════════════════════════════════════════

secureHandle('scripts:getAll', () => {
  requireSession();
  const d = dbReady();
  const all = d.getAllScripts();
  if (currentSession.rolle === 'admin') return all;
  // Für non-admins: nur sichtbare Scripte zurückgeben
  return all.filter(s => d.checkPermission(currentSession.id, s.id, 'darf_sehen'));
});

secureHandle('scripts:getFavorites', () => {
  requireSession();
  const d = dbReady();
  const favs = d.getFavorites();
  if (currentSession.rolle === 'admin') return favs;
  return favs.filter(s => d.checkPermission(currentSession.id, s.id, 'darf_sehen'));
});

secureHandle('scripts:getById', (_e, id) => {
  requirePermission(id, 'darf_sehen');
  return dbReady().getScriptById(id);
});

secureHandle('scripts:add', (_e, s) => {
  requireRole('admin');
  const result = dbReady().addScript(s);
  if (result.success) logAudit('script_erstellt', 'script', result.id, { name: s.name });
  return result;
});

secureHandle('scripts:update', (_e, s) => {
  requireRole('admin');
  const result = dbReady().updateScript(s);
  if (result.success) logAudit('script_geaendert', 'script', s.id, { name: s.name });
  return result;
});

secureHandle('scripts:delete', (_e, id) => {
  requireRole('admin');
  const script = dbReady().getScriptById(id);
  const result = dbReady().deleteScript(id);
  if (result.success) logAudit('script_geloescht', 'script', id, { name: script?.name });
  return result;
});

secureHandle('scripts:toggleFav', (_e, id) => {
  requirePermission(id, 'darf_sehen');
  return dbReady().toggleFavorit(id);
});

secureHandle('scripts:readCode', (_e, fn) => {
  requireSession();
  // Code-Lesen nur für Admin oder explizit erlaubte
  if (currentSession.rolle !== 'admin') requireRole('admin');
  try {
    const p = path.join(LIB_DIR, path.basename(fn));
    if (!fs.existsSync(p)) return { success:false, error:'Nicht gefunden: '+p };
    return { success:true, code: fs.readFileSync(p,'utf-8') };
  } catch(e) { return { success:false, error:e.message }; }
});

secureHandle('scripts:writeCode', (_e, fn, code) => {
  requireRole('admin');
  try {
    fs.writeFileSync(path.join(LIB_DIR, path.basename(fn)), code, 'utf-8');
    logAudit('script_code_geaendert', 'script', null, { dateiname: fn });
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Script ausführen ───────────────────────────────────────────────────────
secureHandle('scripts:run', (_e, id, params) => {
  requirePermission(id, 'darf_ausfuehren');
  const d = dbReady(), script = d.getScriptById(id);
  if (!script) return { success:false, error:'Script nicht gefunden' };
  if (runningProc) { try{runningProc.kill();}catch(_){} runningProc=null; }

  logAudit('script_gestartet', 'script', id, { name: script.name, params });
  send('terminal:start', { id, name:script.name });

  return new Promise(resolve => {
    runningProc = spawnScript(script, params,
      (line,type)  => send('terminal:data', {line,type}),
      (code,output) => {
        runningProc = null;
        const ok = code === 0;
        d.logExecution(id, ok?'success':'error', output);
        d.updateLastRun(id);
        logAudit(ok?'script_erfolg':'script_fehler', 'script', id, { name:script.name, exitCode:code });
        send('terminal:end', {code, success:ok});
        resolve({ success:ok, exitCode:code });
      }
    );
    if (!runningProc) resolve({ success:false, error:'Spawn fehlgeschlagen' });
  });
});

ipcMain.on('terminal:input', (_e,text) => { if(runningProc?.stdin&&!runningProc.stdin.destroyed) try{runningProc.stdin.write(text+'\n');}catch(_){} });
ipcMain.on('terminal:kill',  ()         => { if(runningProc){try{runningProc.kill();}catch(_){} runningProc=null;} });

// ════════════════════════════════════════════════════════════════════════
//  CHAINS
// ════════════════════════════════════════════════════════════════════════

secureHandle('chains:getAll',    ()         => { requireSession(); return dbReady().getAllChains(); });
secureHandle('chains:getById',   (_e,id)    => { requireSession(); return dbReady().getChainById(id); });
secureHandle('chains:getSteps',  (_e,id)    => { requireSession(); return dbReady().getChainSteps(id); });
secureHandle('chains:add',       (_e,c)     => { requireRole('admin'); return dbReady().addChain(c); });
secureHandle('chains:update',    (_e,c)     => { requireRole('admin'); return dbReady().updateChain(c); });
secureHandle('chains:delete',    (_e,id)    => { requireRole('admin'); return dbReady().deleteChain(id); });
secureHandle('chains:saveSteps', (_e,id,st) => { requireRole('admin'); return dbReady().saveChainSteps(id,st); });

secureHandle('chains:run', (_e, chainId) => {
  requireSession();
  const d     = dbReady();
  const chain = d.getChainById(chainId);
  if (!chain) return { success:false, error:'Chain nicht gefunden' };
  const steps = d.getChainSteps(chainId);
  if (!steps.length) return { success:false, error:'Chain hat keine Schritte' };

  // Berechtigungsprüfung für alle Schritte
  if (currentSession.rolle !== 'admin') {
    for (const step of steps) {
      if (!d.checkPermission(currentSession.id, step.script_id, 'darf_ausfuehren'))
        return { success:false, error:`Keine Berechtigung für Script "${step.script_name}" in dieser Chain` };
    }
  }

  logAudit('chain_gestartet', 'chain', chainId, { name: chain.name });
  send('chain:start', { chainId, chainName:chain.name, total:steps.length });

  return new Promise(async resolve => {
    let chainSuccess = true;
    const allOutput  = [];

    for (let i=0; i<steps.length; i++) {
      const step   = steps[i];
      const script = d.getScriptById(step.script_id);
      if (!script) { send('chain:stepSkip',{index:i,reason:'Script nicht gefunden'}); continue; }

      send('chain:stepStart', { index:i, total:steps.length, scriptName:script.name, scriptId:script.id });

      const warteTyp = step.warte_typ || 'timer';
      if (warteTyp === 'auf_abschluss') {
        if (step.pause_sek > 0) {
          send('chain:data', {index:i, line:`⏳ ${step.pause_sek}s Pause…`, type:'info'});
          await new Promise(r=>setTimeout(r, step.pause_sek*1000));
        }
      } else {
        if (step.pause_sek > 0) {
          send('chain:data', {index:i, line:`⏳ Warte ${step.pause_sek}s…`, type:'info'});
          await new Promise(r=>setTimeout(r, step.pause_sek*1000));
        }
      }

      const stepResult = await new Promise(res => {
        const proc = spawnScript(script, step.parameter||'',
          (line,type) => send('chain:data',{index:i,scriptName:script.name,line,type}),
          (code,out) => {
            const ok = code===0;
            d.logChainExecution(chainId,chain.name,script.id,ok?'success':'error',out);
            d.updateLastRun(script.id);
            allOutput.push({step:i+1,script:script.name,exitCode:code,output:out});
            res({success:ok,exitCode:code,output:out});
          }
        );
        if (!proc) res({success:false,exitCode:-2});
      });

      send('chain:stepEnd', { index:i, scriptName:script.name, success:stepResult.success, exitCode:stepResult.exitCode });

      if (!stepResult.success) {
        chainSuccess = false;
        if (chain.bei_fehler==='stop') {
          send('chain:data',{index:i,line:`🛑 Chain gestoppt: "${script.name}" fehlgeschlagen`,type:'stderr'});
          break;
        }
        send('chain:data',{index:i,line:`⚠️ Fehler ignoriert, weiter…`,type:'info'});
      }
    }

    send('chain:end', { chainId, chainName:chain.name, success:chainSuccess });
    resolve({ success:chainSuccess, steps:allOutput });
  });
});

// ════════════════════════════════════════════════════════════════════════
//  SCHEDULES
// ════════════════════════════════════════════════════════════════════════
secureHandle('schedules:getAll',  ()      => { requireSession(); return dbReady().getAllSchedules(); });
secureHandle('schedules:getById', (_e,id) => { requireSession(); return dbReady().getScheduleById(id); });
secureHandle('schedules:add',     (_e,s)  => { requireRole('admin'); return dbReady().addSchedule(s); });
secureHandle('schedules:update',  (_e,s)  => { requireRole('admin'); return dbReady().updateSchedule(s); });
secureHandle('schedules:delete',  (_e,id) => { requireRole('admin'); return dbReady().deleteSchedule(id); });

// ════════════════════════════════════════════════════════════════════════
//  SCHEDULER TICKER
// ════════════════════════════════════════════════════════════════════════
function spawnScript(script, params, onData, onEnd) {
  const filePath = path.join(LIB_DIR, script.dateiname);
  if (!fs.existsSync(filePath)) { onEnd(-2,'Datei nicht gefunden: '+filePath); return null; }
  const args = ['-ExecutionPolicy','Bypass','-NoProfile','-File',filePath,
    ...(params ? params.trim().split(/\s+/).filter(Boolean) : [])];
  const proc = cp.spawn('powershell.exe', args, { cwd:LIB_DIR, windowsHide:true, stdio:['pipe','pipe','pipe'] });
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  let out='';
  const emit=(text,type)=>{ out+=text; text.split(/\r?\n/).forEach((l,i,a)=>{ if(l!==''||i<a.length-1) onData(l,type); }); };
  proc.stdout.on('data', c=>emit(c,'stdout'));
  proc.stderr.on('data', c=>emit(c,'stderr'));
  proc.on('close', code=>onEnd(code,out));
  proc.on('error', e=>{ onData('❌ '+e.message,'stderr'); onEnd(-1,out); });
  return proc;
}

function startScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(checkSchedules, 60_000);
  checkSchedules();
}

function checkSchedules() {
  if (!db) return;
  const d      = dbReady();
  const active = d.getActiveSchedules();
  const now    = new Date();
  const nowStr = now.toISOString().slice(0,16);

  for (const sched of active) {
    let due=false, nextRun=null;

    if (sched.typ==='einmalig' && sched.einmalig_am) {
      if (sched.einmalig_am.slice(0,16)===nowStr && !sched.letzter_lauf) {
        due=true; d.deactivateSchedule(sched.id);
      }
    } else if (sched.typ==='taeglich' && sched.cron) {
      const [h,m]=sched.cron.split(':').map(Number);
      if (now.getHours()===h && now.getMinutes()===m) {
        if (!sched.letzter_lauf||sched.letzter_lauf.slice(0,16)!==nowStr) due=true;
        const next=new Date(now); next.setDate(next.getDate()+1); next.setHours(h,m,0,0);
        nextRun=next.toISOString().slice(0,16);
      }
    } else if (sched.typ==='woechentlich' && sched.cron) {
      const [dayStr,timeStr]=sched.cron.split(' ');
      const [h,m]=timeStr.split(':').map(Number);
      if (now.getDay()===parseInt(dayStr)&&now.getHours()===h&&now.getMinutes()===m) {
        if (!sched.letzter_lauf||sched.letzter_lauf.slice(0,16)!==nowStr) due=true;
        const next=new Date(now); next.setDate(next.getDate()+7);
        nextRun=next.toISOString().slice(0,16);
      }
    }

    if (due) {
      d.updateScheduleRun(sched.id, nextRun);
      send('scheduler:fired', { scheduleId:sched.id, scheduleName:sched.name, targetId:sched.target_id, targetTyp:sched.target_typ });
      showTrayNotification('🕐 Geplante Ausführung', `"${sched.name}" wird jetzt gestartet`);
      updateTrayMenu(`🕐 Zuletzt: ${sched.name}`);

      if (sched.target_typ==='script') {
        const script = d.getScriptById(sched.target_id);
        if (script) {
          send('terminal:start',{id:script.id,name:`[Geplant] ${script.name}`});
          spawnScript(script,'',
            (line,type)=>send('terminal:data',{line,type}),
            (code,out)=>{ d.logExecution(script.id,code===0?'success':'error',out); d.updateLastRun(script.id); send('terminal:end',{code,success:code===0}); }
          );
        }
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
//  LOGS
// ════════════════════════════════════════════════════════════════════════
secureHandle('logs:getRecent',      (_e,n)    => { requireSession(); return dbReady().getRecentLogs(n||200); });
secureHandle('logs:getByScript',    (_e,id)   => { requireSession(); return dbReady().getLogsByScript(id); });
secureHandle('logs:getCount',       ()        => { requireSession(); return { count:dbReady().getLogCount() }; });
secureHandle('logs:clearById',      (_e,id)   => { requireRole('admin'); return dbReady().clearLogById(id); });
secureHandle('logs:clearByScript',  (_e,id)   => { requireRole('admin'); return dbReady().clearLogsByScript(id); });
secureHandle('logs:clearAll',       ()        => { requireRole('admin'); return dbReady().clearAllLogs(); });
secureHandle('logs:clearOlderThan', (_e,days) => { requireRole('admin'); return dbReady().clearOldLogs(days); });

// ════════════════════════════════════════════════════════════════════════
//  LIB / GIT / UPDATES / SETTINGS / APP
// ════════════════════════════════════════════════════════════════════════
secureHandle('lib:listFiles',  ()  => { requireRole('admin'); try{ return fs.existsSync(LIB_DIR)?fs.readdirSync(LIB_DIR).filter(f=>f.toLowerCase().endsWith('.ps1')).sort():[]; }catch(e){return[];} });
secureHandle('lib:scanNew',    ()  => { requireRole('admin'); try{ const files=fs.readdirSync(LIB_DIR).filter(f=>f.toLowerCase().endsWith('.ps1')); const known=dbReady().getAllScripts().map(s=>s.dateiname.toLowerCase()); return files.filter(f=>!known.includes(f.toLowerCase())); }catch(e){return[];} });
secureHandle('lib:openFolder', ()  => { requireRole('admin'); if(!fs.existsSync(LIB_DIR))fs.mkdirSync(LIB_DIR,{recursive:true}); shell.openPath(LIB_DIR); return {success:true,path:LIB_DIR}; });
secureHandle('lib:importFile', async() => {
  requireRole('admin');
  const r=await dialog.showOpenDialog(mainWindow,{title:'PS1 importieren',filters:[{name:'PowerShell',extensions:['ps1']}],properties:['openFile','multiSelections']});
  if(r.canceled) return {success:false};
  const copied=[]; for(const src of r.filePaths){const dest=path.join(LIB_DIR,path.basename(src));fs.copyFileSync(src,dest);copied.push(path.basename(src));}
  logAudit('dateien_importiert', 'lib', null, { dateien: copied });
  return {success:true,files:copied};
});
secureHandle('lib:openCsv', async() => {
  requireRole('admin');
  const r=await dialog.showOpenDialog(mainWindow,{title:'CSV importieren',filters:[{name:'CSV',extensions:['csv']}],properties:['openFile']});
  if(r.canceled||!r.filePaths[0]) return {success:false};
  try{return {success:true,content:fs.readFileSync(r.filePaths[0],'utf-8')};}catch(e){return {success:false,error:e.message};}
});

secureHandle('git:sync', async (_e, repoUrl, branch) => {
  requireRole('admin');
  const usedBranch = branch||'main';
  const results    = { success:false, output:'', newFiles:[], updatedFiles:[] };
  const rmSafe     = (dirPath) => { if(!fs.existsSync(dirPath))return; try{cp.execSync(`attrib -R "${dirPath}\\*.*" /S /D`,{timeout:10000});}catch(_){} fs.rmSync(dirPath,{recursive:true,force:true}); };
  try { cp.execSync('git --version',{timeout:5000}); } catch { return {...results,error:'Git nicht gefunden.'}; }
  const tmpDir = path.join(APP_DATA,'_git_tmp');
  try {
    if(fs.existsSync(tmpDir)) rmSafe(tmpDir);
    const out=cp.execSync(`git clone --depth 1 --branch ${usedBranch} --filter=blob:none "${repoUrl}" "${tmpDir}"`,{encoding:'utf8',timeout:60000});
    results.output=out;
    const tmpLibPath=path.join(tmpDir,'lib');
    if(!fs.existsSync(tmpLibPath)) throw new Error('lib/-Ordner im Repo nicht gefunden.');
    const ps1s=fs.readdirSync(tmpLibPath).filter(f=>f.toLowerCase().endsWith('.ps1'));
    const before=fs.existsSync(LIB_DIR)?fs.readdirSync(LIB_DIR).filter(f=>f.toLowerCase().endsWith('.ps1')):[];
    if(!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR,{recursive:true});
    for(const f of ps1s) fs.copyFileSync(path.join(tmpLibPath,f),path.join(LIB_DIR,f));
    results.newFiles=ps1s.filter(f=>!before.includes(f));
    results.updatedFiles=ps1s.filter(f=>before.includes(f));
    results.success=true;
    rmSafe(tmpDir);
    logAudit('git_sync', 'lib', null, { neue: results.newFiles.length, aktualisiert: results.updatedFiles.length });
    return results;
  } catch(e) { try{rmSafe(tmpDir);}catch(_){} return {...results,error:e.message,output:e.stderr||e.message}; }
});

secureHandle('git:status', async () => {
  requireRole('admin');
  try { cp.execSync('git --version',{timeout:3000}); } catch { return {available:false,error:'Git nicht gefunden'}; }
  const gitDir=path.join(LIB_DIR,'.git');
  if(!fs.existsSync(gitDir)) return {available:false,noRepo:true};
  try {
    let trackingBranch='main';
    try { trackingBranch=cp.execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}',{cwd:LIB_DIR,encoding:'utf8'}).trim().replace('origin/',''); }catch{}
    cp.execSync(`git fetch origin ${trackingBranch}`,{cwd:LIB_DIR,timeout:15000});
    const local=cp.execSync('git rev-parse HEAD',{cwd:LIB_DIR,encoding:'utf8'}).trim();
    const remote=cp.execSync(`git rev-parse origin/${trackingBranch}`,{cwd:LIB_DIR,encoding:'utf8'}).trim();
    const log=cp.execSync(`git log ${local}..${remote} --oneline`,{cwd:LIB_DIR,encoding:'utf8'}).trim();
    return {available:local!==remote,localHash:local.slice(0,7),remoteHash:remote.slice(0,7),commitLog:log,branch:trackingBranch};
  } catch(e) { return {available:false,error:e.message}; }
});

secureHandle('update:check',    async () => { requireRole('admin'); try{ const r=await autoUpdater.checkForUpdates(); if(!r?.updateInfo) return{available:false}; const c=app.getVersion(),l=r.updateInfo.version; return{available:l!==c,currentVersion:c,latestVersion:l,releaseNotes:r.updateInfo.releaseNotes||''}; }catch(e){return{available:false,error:e.message};} });
secureHandle('update:download', async () => { requireRole('admin'); try{ autoUpdater.once('update-downloaded',()=>autoUpdater.quitAndInstall()); await autoUpdater.downloadUpdate(); return{success:true}; }catch(e){return{success:false,error:e.message};} });

secureHandle('settings:set', (_e, key, value) => {
  requireRole('admin');
  logAudit('einstellung_geaendert', 'settings', null, { key, value });
  return dbReady().setSetting(key, value);
});
secureHandle('settings:get', (_e, key) => {
  requireSession();
  return { value: dbReady().getSetting(key) };
});

ipcMain.handle('app:info', () => ({ version:app.getVersion(), dataPath:APP_DATA, libPath:LIB_DIR, builtinLib:BUILTIN_LIB, dbPath:DB_PATH, platform:process.platform }));
