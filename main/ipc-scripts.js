/**
 * main/ipc-scripts.js – IPC-Handler für Scripts, Terminal & Lib
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');
const state = require('./state');
const { secureHandle, requireSession, requireRole, requirePermission, logAudit, dbReady } = require('./session');
const { send } = require('./session');
const { showTrayNotification } = require('./tray');

// ── PowerShell Spawn ──────────────────────────────────────────────────────────
function spawnScript(script, params, onData, onEnd) {
  const LIB_DIR = require('./paths').LIB_DIR;
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(LIB_DIR, path.basename(script.dateiname)),
    ...(params ? params.trim().split(/\s+/).filter(Boolean) : []),
  ];
  const proc = cp.spawn('powershell.exe', args, {
    cwd: LIB_DIR, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  let out = '';
  const emit = (text, type) => {
    out += text;
    text.split(/\r?\n/).forEach((l, i, a) => { if (l !== '' || i < a.length - 1) onData(l, type); });
  };
  proc.stdout.on('data', c => emit(c, 'stdout'));
  proc.stderr.on('data', c => emit(c, 'stderr'));
  proc.on('close', code => onEnd(code, out));
  proc.on('error', e => { onData('❌ ' + e.message, 'stderr'); onEnd(-1, out); });
  return proc;
}

function register(ipcMain) {

  // ── Scripts ─────────────────────────────────────────────────────────────
  secureHandle(ipcMain, 'scripts:getAll', () => {
    requireSession();
    const d = dbReady();
    const all = d.getAllScripts();
    if (state.currentSession.rolle === 'admin') return all;
    return all.filter(s => d.checkPermission(state.currentSession.id, s.id, 'darf_sehen'));
  });

  secureHandle(ipcMain, 'scripts:getFavorites', () => {
    requireSession();
    const d = dbReady();
    const favs = d.getFavorites();
    if (state.currentSession.rolle === 'admin') return favs;
    return favs.filter(s => d.checkPermission(state.currentSession.id, s.id, 'darf_sehen'));
  });

  secureHandle(ipcMain, 'scripts:getById', (_e, id) => {
    requirePermission(id, 'darf_sehen');
    return dbReady().getScriptById(id);
  });

  secureHandle(ipcMain, 'scripts:add', (_e, s) => {
    requireRole('admin');
    const result = dbReady().addScript(s);
    if (result.success) logAudit('script_erstellt', 'script', result.id, { name: s.name });
    return result;
  });

  secureHandle(ipcMain, 'scripts:update', (_e, s) => {
    requireRole('admin');
    const result = dbReady().updateScript(s);
    if (result.success) logAudit('script_geaendert', 'script', s.id, { name: s.name });
    return result;
  });

  secureHandle(ipcMain, 'scripts:delete', (_e, id) => {
    requireRole('admin');
    const script = dbReady().getScriptById(id);
    const result = dbReady().deleteScript(id);
    if (result.success) logAudit('script_geloescht', 'script', id, { name: script?.name });
    return result;
  });

  secureHandle(ipcMain, 'scripts:toggleFav', (_e, id) => {
    requirePermission(id, 'darf_sehen');
    return dbReady().toggleFavorit(id);
  });

  secureHandle(ipcMain, 'scripts:readCode', (_e, fn) => {
    requireSession();
    if (state.currentSession.rolle !== 'admin') requireRole('admin');
    try {
      const { LIB_DIR } = require('./paths');
      const p = path.join(LIB_DIR, path.basename(fn));
      if (!fs.existsSync(p)) return { success: false, error: 'Nicht gefunden: ' + p };
      return { success: true, code: fs.readFileSync(p, 'utf-8') };
    } catch (e) { return { success: false, error: e.message }; }
  });

  secureHandle(ipcMain, 'scripts:writeCode', (_e, fn, code) => {
    requireRole('admin');
    try {
      const { LIB_DIR } = require('./paths');
      fs.writeFileSync(path.join(LIB_DIR, path.basename(fn)), code, 'utf-8');
      logAudit('script_code_geaendert', 'script', null, { dateiname: fn });
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Script ausführen ─────────────────────────────────────────────────────
  secureHandle(ipcMain, 'scripts:run', (_e, id, params) => {
    requirePermission(id, 'darf_ausfuehren');
    const d = dbReady(), script = d.getScriptById(id);
    if (!script) return { success: false, error: 'Script nicht gefunden' };
    if (state.runningProc) { try { state.runningProc.kill(); } catch (_) {} state.runningProc = null; }

    logAudit('script_gestartet', 'script', id, { name: script.name, params });
    send('terminal:start', { id, name: script.name });

    return new Promise(resolve => {
      state.runningProc = spawnScript(script, params,
        (line, type) => send('terminal:data', { line, type }),
        (code, output) => {
          state.runningProc = null;
          const ok = code === 0;
          d.logExecution(id, ok ? 'success' : 'error', output);
          d.updateLastRun(id);
          logAudit(ok ? 'script_erfolg' : 'script_fehler', 'script', id, { name: script.name, exitCode: code });
          send('terminal:end', { code, success: ok });
          resolve({ success: ok, exitCode: code });
        }
      );
      if (!state.runningProc) resolve({ success: false, error: 'Spawn fehlgeschlagen' });
    });
  });

  // ── Terminal Input/Kill ──────────────────────────────────────────────────
  ipcMain.on('terminal:input', (_e, text) => {
    if (state.runningProc?.stdin && !state.runningProc.stdin.destroyed)
      try { state.runningProc.stdin.write(text + '\n'); } catch (_) {}
  });
  ipcMain.on('terminal:kill', () => {
    if (state.runningProc) { try { state.runningProc.kill(); } catch (_) {} state.runningProc = null; }
  });

  // ── Logs ─────────────────────────────────────────────────────────────────
  secureHandle(ipcMain, 'logs:getRecent',      (_e, n)   => { requireSession(); return dbReady().getRecentLogs(n); });
  secureHandle(ipcMain, 'logs:getByScript',    (_e, id)  => { requireSession(); return dbReady().getLogsByScript(id); });
  secureHandle(ipcMain, 'logs:getCount',       ()        => { requireSession(); return dbReady().getLogCount(); });
  secureHandle(ipcMain, 'logs:clearById',      (_e, id)  => { requireRole('admin'); return dbReady().clearLogById(id); });
  secureHandle(ipcMain, 'logs:clearByScript',  (_e, id)  => { requireRole('admin'); logAudit('logs_geloescht','logs',id,{}); return dbReady().clearLogsByScript(id); });
  secureHandle(ipcMain, 'logs:clearAll',       ()        => { requireRole('admin'); logAudit('alle_logs_geloescht','logs',null,{}); return dbReady().clearAllLogs(); });
  secureHandle(ipcMain, 'logs:clearOlderThan', (_e, d)   => { requireRole('admin'); return dbReady().clearLogsOlderThan(d); });

  // ── Lib ──────────────────────────────────────────────────────────────────
  secureHandle(ipcMain, 'lib:listFiles', () => {
    requireSession();
    const { LIB_DIR } = require('./paths');
    try {
      if (!fs.existsSync(LIB_DIR)) return { files: [] };
      return { files: fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.ps1')) };
    } catch (e) { return { files: [], error: e.message }; }
  });

  secureHandle(ipcMain, 'lib:scanNew', () => {
    requireSession();
    const { LIB_DIR } = require('./paths');
    const d = dbReady();
    const known = new Set(d.getAllScripts().map(s => s.dateiname));
    try {
      const all = fs.existsSync(LIB_DIR) ? fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.ps1')) : [];
      return { newFiles: all.filter(f => !known.has(f)) };
    } catch (e) { return { newFiles: [], error: e.message }; }
  });

  secureHandle(ipcMain, 'lib:openFolder', () => {
    requireSession();
    const { LIB_DIR } = require('./paths');
    require('electron').shell.openPath(LIB_DIR);
    return { success: true };
  });

  secureHandle(ipcMain, 'lib:importFile', async () => {
    requireRole('admin');
    const { LIB_DIR } = require('./paths');
    const { dialog } = require('electron');
    const r = await dialog.showOpenDialog(state.mainWindow, {
      title: 'PS1-Dateien importieren',
      filters: [{ name: 'PowerShell', extensions: ['ps1'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (r.canceled) return { success: false };
    const copied = [];
    for (const src of r.filePaths) {
      const dest = path.join(LIB_DIR, path.basename(src));
      fs.copyFileSync(src, dest);
      copied.push(path.basename(src));
    }
    logAudit('dateien_importiert', 'lib', null, { dateien: copied });
    return { success: true, files: copied };
  });

  secureHandle(ipcMain, 'lib:openCsv', async () => {
    requireRole('admin');
    const { dialog } = require('electron');
    const r = await dialog.showOpenDialog(state.mainWindow, {
      title: 'CSV importieren',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return { success: false };
    try { return { success: true, content: fs.readFileSync(r.filePaths[0], 'utf-8') }; }
    catch (e) { return { success: false, error: e.message }; }
  });
}

module.exports = { register, spawnScript };
