/**
 * main/ipc-system.js – IPC-Handler für Git, App-Update, Settings, App-Info
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');
const state = require('./state');
const { secureHandle, requireSession, requireRole, logAudit, dbReady } = require('./session');

function register(ipcMain, { autoUpdater, APP_DATA, LIB_DIR, app }) {

  // ── Git: Scripte synchronisieren ─────────────────────────────────────────
  secureHandle(ipcMain, 'git:sync', async (_e, repoUrl, branch) => {
    requireRole('admin');
    const usedBranch = branch || 'main';
    const results    = { success: false, output: '', newFiles: [], updatedFiles: [] };

    const rmSafe = (dirPath) => {
      if (!fs.existsSync(dirPath)) return;
      try { cp.execSync(`attrib -R "${dirPath}\\*.*" /S /D`, { timeout: 10000 }); } catch (_) {}
      fs.rmSync(dirPath, { recursive: true, force: true });
    };

    try { cp.execSync('git --version', { timeout: 5000 }); }
    catch { return { ...results, error: 'Git nicht gefunden.' }; }

    const tmpDir = path.join(APP_DATA, '_git_tmp');
    try {
      if (fs.existsSync(tmpDir)) rmSafe(tmpDir);
      const out = cp.execSync(
        `git clone --depth 1 --branch ${usedBranch} --filter=blob:none "${repoUrl}" "${tmpDir}"`,
        { encoding: 'utf8', timeout: 60000 }
      );
      results.output = out;
      const tmpLibPath = path.join(tmpDir, 'lib');
      if (!fs.existsSync(tmpLibPath)) throw new Error('lib/-Ordner im Repo nicht gefunden.');
      const ps1s   = fs.readdirSync(tmpLibPath).filter(f => f.toLowerCase().endsWith('.ps1'));
      const before = fs.existsSync(LIB_DIR) ? fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.ps1')) : [];
      if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
      for (const f of ps1s) fs.copyFileSync(path.join(tmpLibPath, f), path.join(LIB_DIR, f));
      results.newFiles     = ps1s.filter(f => !before.includes(f));
      results.updatedFiles = ps1s.filter(f => before.includes(f));
      results.success      = true;
      rmSafe(tmpDir);
      logAudit('git_sync', 'lib', null, { neue: results.newFiles.length, aktualisiert: results.updatedFiles.length });
      return results;
    } catch (e) {
      try { rmSafe(tmpDir); } catch (_) {}
      return { ...results, error: e.message, output: e.stderr || e.message };
    }
  });

  secureHandle(ipcMain, 'git:status', async () => {
    requireRole('admin');
    try { cp.execSync('git --version', { timeout: 3000 }); } catch { return { available: false, error: 'Git nicht gefunden' }; }
    const gitDir = path.join(LIB_DIR, '.git');
    if (!fs.existsSync(gitDir)) return { available: false, noRepo: true };
    try {
      let trackingBranch = 'main';
      try {
        trackingBranch = cp.execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}',
          { cwd: LIB_DIR, encoding: 'utf8' }).trim().replace('origin/', '');
      } catch (_) {}
      cp.execSync(`git fetch origin ${trackingBranch}`, { cwd: LIB_DIR, timeout: 15000 });
      const local  = cp.execSync('git rev-parse HEAD',                           { cwd: LIB_DIR, encoding: 'utf8' }).trim();
      const remote = cp.execSync(`git rev-parse origin/${trackingBranch}`,       { cwd: LIB_DIR, encoding: 'utf8' }).trim();
      const log    = cp.execSync(`git log ${local}..${remote} --oneline`,        { cwd: LIB_DIR, encoding: 'utf8' }).trim();
      return { available: local !== remote, localHash: local.slice(0, 7), remoteHash: remote.slice(0, 7), commitLog: log, branch: trackingBranch };
    } catch (e) { return { available: false, error: e.message }; }
  });

  // ── App-Update (electron-updater) ─────────────────────────────────────────
  secureHandle(ipcMain, 'update:check', async () => {
    requireRole('admin');
    try {
      const r = await autoUpdater.checkForUpdates();
      if (!r?.updateInfo) return { available: false };
      const c = app.getVersion(), l = r.updateInfo.version;
      return { available: l !== c, currentVersion: c, latestVersion: l, releaseNotes: r.updateInfo.releaseNotes || '' };
    } catch (e) { return { available: false, error: e.message }; }
  });

  secureHandle(ipcMain, 'update:download', async () => {
    requireRole('admin');
    try {
      autoUpdater.once('update-downloaded', () => autoUpdater.quitAndInstall());
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Settings ─────────────────────────────────────────────────────────────
  secureHandle(ipcMain, 'settings:set', (_e, key, value) => {
    requireRole('admin');
    logAudit('einstellung_geaendert', 'settings', null, { key, value });
    return dbReady().setSetting(key, value);
  });

  secureHandle(ipcMain, 'settings:get', (_e, key) => {
    requireSession();
    return { value: dbReady().getSetting(key) };
  });

  // ── App-Info ──────────────────────────────────────────────────────────────
  ipcMain.handle('app:info', () => ({
    version:    app.getVersion(),
    dataPath:   APP_DATA,
    libPath:    LIB_DIR,
    dbPath:     require('./paths').DB_PATH,
    platform:   process.platform,
  }));
}

module.exports = { register };
