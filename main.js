/**
 * main.js – Electron Hauptprozess
 * - Interactive Shell: stdin offen, Eingaben via terminal:input weitergeleitet
 * - Script-Editor: scripts:readCode / scripts:writeCode
 * - Live Terminal-Output via terminal:data Events
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');

const IS_PACKAGED = app.isPackaged;
const APP_DATA = path.join(app.getPath('appData'), 'PSScriptManager');
const DB_PATH  = path.join(APP_DATA, 'scriptmanager.db');
const LOG_DIR  = path.join(APP_DATA, 'Logs');

// LIB_DIR: Benutzer-eigene Scripte → immer in %AppData%, schreibbar ohne Admin
// Beim ersten Start werden die eingebauten Scripte (aus resources/lib) dorthin kopiert
const LIB_DIR      = path.join(APP_DATA, 'lib');
const BUILTIN_LIB  = IS_PACKAGED
  ? path.join(process.resourcesPath, 'lib')   // eingebaute Scripte im Installer
  : path.join(__dirname, 'lib');               // Dev-Modus

[APP_DATA, LOG_DIR, LIB_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Eingebaute Scripte beim ersten Start in AppData kopieren (nur falls noch nicht vorhanden)
if (IS_PACKAGED && fs.existsSync(BUILTIN_LIB)) {
  try {
    const builtinFiles = fs.readdirSync(BUILTIN_LIB).filter(f => f.toLowerCase().endsWith('.ps1'));
    for (const f of builtinFiles) {
      const dest = path.join(LIB_DIR, f);
      if (!fs.existsSync(dest)) {                          // nie überschreiben
        fs.copyFileSync(path.join(BUILTIN_LIB, f), dest);
      }
    }
  } catch (e) { console.error('Builtin-Copy Fehler:', e); }
}

const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = false;

let db = null;
let mainWindow;
// Laufender Prozess – nur einer gleichzeitig
let runningProc = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    frame: false,
    backgroundColor: '#0d0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  mainWindow.loadFile('renderer/index.html');
  if (!IS_PACKAGED) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(async () => {
  try { db = await require('./database/db')(DB_PATH); }
  catch (e) { console.error('DB-Fehler:', e); }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function dbReady() {
  if (!db) throw new Error('Datenbank nicht initialisiert');
  return db;
}

// ── Fenster ───────────────────────────────────────────────────────────────
ipcMain.on('win:minimize', () => mainWindow.minimize());
ipcMain.on('win:maximize', () =>
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win:close', () => mainWindow.close());

// ── Scripts CRUD ─────────────────────────────────────────────────────────
ipcMain.handle('scripts:getAll',  ()       => dbReady().getAllScripts());
ipcMain.handle('scripts:getById', (_e, id) => dbReady().getScriptById(id));
ipcMain.handle('scripts:add',     (_e, s)  => dbReady().addScript(s));
ipcMain.handle('scripts:update',  (_e, s)  => dbReady().updateScript(s));
ipcMain.handle('scripts:delete',  (_e, id) => dbReady().deleteScript(id));

// ── Script-Code lesen/schreiben ──────────────────────────────────────────
ipcMain.handle('scripts:readCode', (_e, filename) => {
  try {
    const p = path.join(LIB_DIR, path.basename(filename));
    if (!fs.existsSync(p)) return { success: false, error: 'Datei nicht gefunden: ' + p };
    return { success: true, code: fs.readFileSync(p, 'utf-8') };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('scripts:writeCode', (_e, filename, code) => {
  try {
    const p = path.join(LIB_DIR, path.basename(filename));
    if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
    fs.writeFileSync(p, code, 'utf-8');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Script ausführen – INTERAKTIV mit Live-Output ────────────────────────
// PowerShell wird OHNE -NonInteractive gestartet, stdin bleibt offen.
// Eingaben vom User kommen via 'terminal:input' und werden in stdin geschrieben.
ipcMain.handle('scripts:run', (_e, id, params) => {
  const d      = dbReady();
  const script = d.getScriptById(id);
  if (!script) return { success: false, error: 'Script nicht gefunden' };

  const filePath = path.join(LIB_DIR, script.dateiname);
  if (!fs.existsSync(filePath))
    return { success: false, error: 'PS1-Datei nicht gefunden: ' + filePath };

  // Laufenden Prozess beenden falls noch einer läuft
  if (runningProc) {
    try { runningProc.kill(); } catch (_) {}
    runningProc = null;
  }

  const args = [
    '-ExecutionPolicy', 'Bypass',
    '-NoProfile',
    // KEIN -NonInteractive → Read-Host, Pause etc. funktionieren
    '-File', filePath,
    ...(params ? params.trim().split(/\s+/).filter(Boolean) : [])
  ];

  mainWindow.webContents.send('terminal:start', { id, name: script.name });

  return new Promise((resolve) => {
    const proc = cp.spawn('powershell.exe', args, {
      cwd:         LIB_DIR,
      windowsHide: true,
      // stdin offen halten damit Read-Host Eingaben empfangen kann
      stdio: ['pipe', 'pipe', 'pipe']
    });

    runningProc = proc;
    let fullOutput = '';

    const emit = (text, type) => {
      fullOutput += text;
      // Ausgabe in Zeilen aufteilen, leere überspringen
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        // Letzte Zeile ohne \n = Prompt-Zeile (Read-Host Aufforderung)
        // Diese auch senden damit der User weiß er soll etwas eingeben
        if (line !== '' || i < lines.length - 1)
          mainWindow.webContents.send('terminal:data', { line, type });
      });
    };

    // UTF-8 Encoding für PowerShell-Ausgabe setzen
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', chunk => emit(chunk, 'stdout'));
    proc.stderr.on('data', chunk => emit(chunk, 'stderr'));

    proc.on('close', code => {
      runningProc = null;
      const success = code === 0;
      d.logExecution(id, success ? 'success' : 'error', fullOutput);
      d.updateLastRun(id);
      mainWindow.webContents.send('terminal:end', { code, success });
      resolve({ success, exitCode: code });
    });

    proc.on('error', err => {
      runningProc = null;
      mainWindow.webContents.send('terminal:data', { line: '❌ ' + err.message, type: 'stderr' });
      mainWindow.webContents.send('terminal:end', { code: -1, success: false });
      resolve({ success: false, error: err.message });
    });
  });
});

// ── Terminal-Eingabe (Read-Host) → stdin des laufenden Prozesses ──────────
ipcMain.on('terminal:input', (_e, text) => {
  if (runningProc && runningProc.stdin && !runningProc.stdin.destroyed) {
    try {
      runningProc.stdin.write(text + '\n');
    } catch (_) {}
  }
});

// ── Laufenden Prozess abbrechen ──────────────────────────────────────────
ipcMain.on('terminal:kill', () => {
  if (runningProc) {
    try { runningProc.kill(); } catch (_) {}
    runningProc = null;
  }
});

// ── Logs ─────────────────────────────────────────────────────────────────
ipcMain.handle('logs:getRecent',      (_e, n)   => dbReady().getRecentLogs(n || 200));
ipcMain.handle('logs:getByScript',    (_e, id)  => dbReady().getLogsByScript(id));
ipcMain.handle('logs:getCount',       ()        => ({ count: dbReady().getLogCount() }));
ipcMain.handle('logs:clearById',      (_e, id)  => dbReady().clearLogById(id));
ipcMain.handle('logs:clearByScript',  (_e, id)  => dbReady().clearLogsByScript(id));
ipcMain.handle('logs:clearAll',       ()        => dbReady().clearAllLogs());
ipcMain.handle('logs:clearOlderThan', (_e, days)=> dbReady().clearOldLogs(days));

// ── lib/-Verzeichnis ─────────────────────────────────────────────────────
ipcMain.handle('lib:listFiles', () => {
  try {
    if (!fs.existsSync(LIB_DIR)) { fs.mkdirSync(LIB_DIR, { recursive: true }); return []; }
    return fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.ps1')).sort();
  } catch (e) { return []; }
});

ipcMain.handle('lib:scanNew', () => {
  try {
    if (!fs.existsSync(LIB_DIR)) return [];
    const files = fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.ps1'));
    const known = dbReady().getAllScripts().map(s => s.dateiname.toLowerCase());
    return files.filter(f => !known.includes(f.toLowerCase()));
  } catch (e) { return []; }
});

ipcMain.handle('lib:openFolder', () => {
  if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
  shell.openPath(LIB_DIR);
  return { success: true, path: LIB_DIR };
});

ipcMain.handle('lib:importFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'PS1-Script importieren',
    filters: [{ name: 'PowerShell Scripts', extensions: ['ps1'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return { success: false };
  const copied = [];
  for (const src of result.filePaths) {
    const dest = path.join(LIB_DIR, path.basename(src));
    fs.copyFileSync(src, dest);
    copied.push(path.basename(src));
  }
  return { success: true, files: copied };
});

ipcMain.handle('lib:openCsv', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'scripts.csv importieren',
    filters: [{ name: 'CSV-Dateien', extensions: ['csv'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return { success: false };
  try {
    return { success: true, content: fs.readFileSync(result.filePaths[0], 'utf-8') };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Git-Sync: PS1-Scripte aus Repo aktualisieren ────────────────────────
ipcMain.handle('git:sync', async (_e, repoUrl, branch) => {
  const usedBranch = branch || 'main';
  const results    = { success: false, output: '', newFiles: [], updatedFiles: [] };

  // Git-Ordner enthalten Read-only-Dateien (z.B. .git/objects) → vor rmSync Flags entfernen
  const rmSafe = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    try {
      cp.execSync(`attrib -R "${dirPath}\\*.*" /S /D`, { timeout: 10000 });
    } catch (_) { /* attrib-Fehler ignorieren, rmSync versucht es trotzdem */ }
    fs.rmSync(dirPath, { recursive: true, force: true });
  };

  // Git verfügbar?
  try {
    cp.execSync('git --version', { timeout: 5000 });
  } catch {
    return { ...results, error: 'Git nicht gefunden. Bitte Git installieren.' };
  }

  // Temporärer Klon-Ordner neben LIB_DIR
  const tmpDir = path.join(APP_DATA, '_git_tmp');

  try {
    // Alten tmp-Ordner aufräumen falls vorhanden
    if (fs.existsSync(tmpDir)) rmSafe(tmpDir);

    // Repo flach klonen in tmp (nur aktueller Stand, keine History)
    const out = cp.execSync(
      `git clone --depth 1 --branch ${usedBranch} --filter=blob:none "${repoUrl}" "${tmpDir}"`,
      { encoding: 'utf8', timeout: 60000 }
    );
    results.output = out;

    // Prüfen ob lib/-Unterordner vorhanden
    const tmpLibPath = path.join(tmpDir, 'lib');
    if (!fs.existsSync(tmpLibPath)) {
      throw new Error('lib/-Ordner im Repo nicht gefunden. Bitte Repo-Struktur prüfen.');
    }

    // PS1s aus tmpDir/lib/ nach LIB_DIR kopieren, Diff ermitteln
    const ps1s  = fs.readdirSync(tmpLibPath).filter(f => f.toLowerCase().endsWith('.ps1'));
    const before = fs.existsSync(LIB_DIR)
      ? fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.ps1'))
      : [];

    if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
    for (const f of ps1s) {
      fs.copyFileSync(path.join(tmpLibPath, f), path.join(LIB_DIR, f));
    }

    results.newFiles     = ps1s.filter(f => !before.includes(f));
    results.updatedFiles = ps1s.filter(f =>  before.includes(f));
    results.success      = true;

    // Tmp-Ordner entfernen
    rmSafe(tmpDir);

    return results;
  } catch (e) {
    // Aufräumen auch im Fehlerfall
    try { rmSafe(tmpDir); } catch (_) {}
    return { ...results, error: e.message, output: e.stderr || e.message };
  }
});

ipcMain.handle('git:status', async () => {
  // Gibt lokalen und remote Hash zurück um zu prüfen ob Updates verfügbar
  try {
    cp.execSync('git --version', { timeout: 3000 });
  } catch {
    return { available: false, error: 'Git nicht gefunden' };
  }

  const gitDir = path.join(LIB_DIR, '.git');
  if (!fs.existsSync(gitDir)) return { available: false, noRepo: true };

  try {
    // Branch aus Tracking-Konfiguration lesen (Fallback: main)
    let trackingBranch = 'main';
    try {
      trackingBranch = cp.execSync(
        'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
        { cwd: LIB_DIR, encoding: 'utf8' }
      ).trim().replace('origin/', '');
    } catch { /* Fallback bleibt 'main' */ }

    cp.execSync(`git fetch origin ${trackingBranch}`, { cwd: LIB_DIR, timeout: 15000 });
    const local  = cp.execSync('git rev-parse HEAD',
                               { cwd: LIB_DIR, encoding: 'utf8' }).trim();
    const remote = cp.execSync(`git rev-parse origin/${trackingBranch}`,
                               { cwd: LIB_DIR, encoding: 'utf8' }).trim();
    const log    = cp.execSync(`git log ${local}..${remote} --oneline`,
                               { cwd: LIB_DIR, encoding: 'utf8' }).trim();
    return {
      available:  local !== remote,
      localHash:  local.slice(0, 7),
      remoteHash: remote.slice(0, 7),
      commitLog:  log,
      branch:     trackingBranch,
    };
  } catch (e) {
    return { available: false, error: e.message };
  }
});

// ── Updates ──────────────────────────────────────────────────────────────
ipcMain.handle('update:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) return { available: false };
    const current = app.getVersion();
    const latest  = result.updateInfo.version;
    return { available: latest !== current, currentVersion: current, latestVersion: latest,
             releaseNotes: result.updateInfo.releaseNotes || '' };
  } catch (e) { return { available: false, error: e.message }; }
});

ipcMain.handle('update:download', async () => {
  try {
    autoUpdater.once('update-downloaded', () => autoUpdater.quitAndInstall());
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── App-Info ─────────────────────────────────────────────────────────────
ipcMain.handle('app:info', () => ({
  version:    app.getVersion(),
  dataPath:   APP_DATA,
  libPath:    LIB_DIR,
  builtinLib: BUILTIN_LIB,
  dbPath:     DB_PATH,
  platform:   process.platform,
}));
