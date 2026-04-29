/**
 * main/ipc-api.js – IPC-Handler für API-Calls
 *
 * Unterstützte Auth-Typen: none, basic, apikey_header, apikey_query, bearer
 * Response-Modi: env (Umgebungsvariable), param (CLI-Parameter), file (temp. JSON-Datei)
 */

'use strict';

const https  = require('https');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const cp     = require('child_process');
const state  = require('./state');
const { secureHandle, requireSession, requireRole, requirePermission, logAudit, dbReady } = require('./session');
const { send } = require('./session');
const { LIB_DIR, APP_DATA } = require('./paths');

// ── HTTP-Request ausführen (Promise) ─────────────────────────────────────────
function doRequest(apiCall) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(apiCall.url); }
    catch (e) { return resolve({ ok: false, status: 0, body: '', error: 'Ungültige URL: ' + e.message }); }

    // ── Auth vorbereiten ──────────────────────────────────────────────────
    const authData = apiCall.auth_data
      ? (typeof apiCall.auth_data === 'string' ? JSON.parse(apiCall.auth_data) : apiCall.auth_data)
      : {};
    const headersRaw = apiCall.headers
      ? (typeof apiCall.headers === 'string' ? JSON.parse(apiCall.headers) : apiCall.headers)
      : {};

    const reqHeaders = { ...headersRaw };

    switch (apiCall.auth_typ) {
      case 'basic': {
        const creds = Buffer.from(`${authData.username||''}:${authData.password||''}`).toString('base64');
        reqHeaders['Authorization'] = `Basic ${creds}`;
        break;
      }
      case 'bearer':
        reqHeaders['Authorization'] = `Bearer ${authData.token||''}`;
        break;
      case 'apikey_header':
        reqHeaders[authData.header_name || 'X-Api-Key'] = authData.api_key || '';
        break;
      case 'apikey_query':
        url.searchParams.set(authData.param_name || 'api_key', authData.api_key || '');
        break;
    }

    // ── Body ──────────────────────────────────────────────────────────────
    const method  = (apiCall.methode || 'GET').toUpperCase();
    const hasBody = ['POST','PUT','PATCH'].includes(method) && apiCall.body;
    let bodyData  = null;
    if (hasBody) {
      bodyData = apiCall.body;
      if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
      if (!reqHeaders['Content-Length']) reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const lib     = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  reqHeaders,
      timeout:  30000,
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({
        ok:      res.statusCode >= 200 && res.statusCode < 300,
        status:  res.statusCode,
        headers: res.headers,
        body,
      }));
    });

    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, body: '', error: 'Timeout (30s)' }); });
    req.on('error',  (e) => resolve({ ok: false, status: 0, body: '', error: e.message }));

    if (bodyData) req.write(bodyData);
    req.end();
  });
}

// ── PowerShell-Script mit Response starten ────────────────────────────────────
function spawnScriptWithResponse(script, baseParams, responseBody, responseModus, responseParam, onData, onEnd) {
  const tmpFile = path.join(APP_DATA, `_api_response_${Date.now()}.json`);
  let extraArgs = [];

  if (responseModus === 'param') {
    // Response als CLI-Parameter
    const safe = responseBody.replace(/'/g, "''");
    extraArgs = [`-${responseParam || 'ApiResponse'}`, `'${safe}'`];
  } else if (responseModus === 'file') {
    // Response als JSON-Datei, Pfad als Parameter
    try { fs.writeFileSync(tmpFile, responseBody, 'utf-8'); } catch (_) {}
    extraArgs = [`-${responseParam || 'ApiResponseFile'}`, `'${tmpFile}'`];
  }
  // responseModus === 'env' → über Umgebungsvariable (siehe spawnEnv unten)

  const allParams = [baseParams, ...extraArgs].filter(Boolean).join(' ');

  const scriptPath = path.join(LIB_DIR, path.basename(script.dateiname));
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    ...(allParams ? allParams.trim().split(/\s+/).filter(Boolean) : []),
  ];

  const spawnEnv = { ...process.env };
  if (responseModus === 'env') {
    spawnEnv[responseParam || 'API_RESPONSE'] = responseBody;
  }

  const proc = cp.spawn('powershell.exe', args, {
    cwd: LIB_DIR, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: spawnEnv,
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
  proc.on('close', code => {
    // Temp-Datei aufräumen
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
    onEnd(code, out);
  });
  proc.on('error', e => { onData('❌ ' + e.message, 'stderr'); onEnd(-1, out); });
  return proc;
}

// ── IPC-Handler registrieren ─────────────────────────────────────────────────
function register(ipcMain) {

  // CRUD
  secureHandle(ipcMain, 'api:getAll',    ()      => { requireSession(); return dbReady().getAllApiCalls(); });
  secureHandle(ipcMain, 'api:getById',   (_e,id) => { requireSession(); return dbReady().getApiCallById(id); });

  secureHandle(ipcMain, 'api:add', (_e, a) => {
    requireRole('admin');
    const result = dbReady().addApiCall(a);
    if (result.success) logAudit('api_call_erstellt', 'api_call', result.id, { name: a.name });
    return result;
  });

  secureHandle(ipcMain, 'api:update', (_e, a) => {
    requireRole('admin');
    const result = dbReady().updateApiCall(a);
    if (result.success) logAudit('api_call_geaendert', 'api_call', a.id, { name: a.name });
    return result;
  });

  secureHandle(ipcMain, 'api:delete', (_e, id) => {
    requireRole('admin');
    const item = dbReady().getApiCallById(id);
    const result = dbReady().deleteApiCall(id);
    if (result.success) logAudit('api_call_geloescht', 'api_call', id, { name: item?.name });
    return result;
  });

  // ── Ausführen (manuell, mit Terminal-Events) ────────────────────────────
  secureHandle(ipcMain, 'api:run', (_e, id) => {
    requireSession();
    const d       = dbReady();
    const apiCall = d.getApiCallById(id);
    if (!apiCall) return { success: false, error: 'API-Call nicht gefunden' };

    logAudit('api_call_gestartet', 'api_call', id, { name: apiCall.name });
    send('terminal:start', { id, name: `🌐 ${apiCall.name}` });
    send('terminal:data',  { line: `➤ ${apiCall.methode} ${apiCall.url}`, type: 'info' });

    return new Promise(async (resolve) => {
      // ── HTTP Request ────────────────────────────────────────────────
      const result = await doRequest(apiCall);
      const statusTxt = result.error
        ? `✘ Fehler: ${result.error}`
        : `${result.ok ? '✔' : '✘'} HTTP ${result.status}`;

      send('terminal:data', { line: statusTxt, type: result.ok ? 'stdout' : 'stderr' });

      // Response-Body anzeigen (erste 2000 Zeichen)
      if (result.body) {
        const preview = result.body.length > 2000
          ? result.body.slice(0, 2000) + '\n… (gekürzt)'
          : result.body;
        preview.split('\n').forEach(l => send('terminal:data', { line: l, type: 'stdout' }));
      }

      d.updateApiCallRun(id, result.ok ? 'success' : 'error');
      d.logApiExecution(id, apiCall.name, result.ok ? 'success' : 'error',
        `${statusTxt}\n${result.body || result.error || ''}`);

      // ── Script aufrufen wenn verknüpft ──────────────────────────────
      if (apiCall.script_id && result.ok) {
        const script = d.getScriptById(apiCall.script_id);
        if (script) {
          send('terminal:data', { line: `\n▶ Starte Script: ${script.name}`, type: 'info' });

          state.runningProc = spawnScriptWithResponse(
            script,
            script.parameter || '',
            result.body,
            apiCall.response_modus,
            apiCall.response_param,
            (line, type) => send('terminal:data', { line, type }),
            (code, output) => {
              state.runningProc = null;
              const ok = code === 0;
              d.logExecution(script.id, ok ? 'success' : 'error', output);
              d.updateLastRun(script.id);
              logAudit(ok ? 'script_erfolg' : 'script_fehler', 'script', script.id,
                { name: script.name, via: 'api_call', exitCode: code });
              send('terminal:end', { code, success: ok });
              resolve({ success: ok, apiStatus: result.status, exitCode: code });
            }
          );
          return;
        }
      }

      // Kein Script verknüpft → Terminal schließen
      send('terminal:end', { code: result.ok ? 0 : 1, success: result.ok });
      resolve({ success: result.ok, apiStatus: result.status, body: result.body });
    });
  });

  // ── Nur HTTP-Request testen (ohne Script, für "Testen"-Button) ────────
  secureHandle(ipcMain, 'api:test', async (_e, apiCallData) => {
    requireSession();
    try {
      const result = await doRequest(apiCallData);
      return {
        success:  true,
        ok:       result.ok,
        status:   result.status,
        headers:  result.headers,
        body:     result.body,
        error:    result.error,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

// ── Direkte Ausführung (für Scheduler / Chain-Runner) ─────────────────────────
async function runApiCallDirect(apiCallId, d, onLine) {
  const apiCall = d.getApiCallById(apiCallId);
  if (!apiCall) return { ok: false, error: 'API-Call nicht gefunden' };

  onLine?.(`➤ ${apiCall.methode} ${apiCall.url}`, 'info');
  const result = await doRequest(apiCall);
  const statusTxt = result.error
    ? `✘ Fehler: ${result.error}`
    : `${result.ok ? '✔' : '✘'} HTTP ${result.status}`;

  onLine?.(statusTxt, result.ok ? 'stdout' : 'stderr');
  d.updateApiCallRun(apiCallId, result.ok ? 'success' : 'error');
  d.logApiExecution(apiCallId, apiCall.name, result.ok ? 'success' : 'error',
    `${statusTxt}\n${result.body || result.error || ''}`);

  return { ok: result.ok, status: result.status, body: result.body, error: result.error, apiCall };
}

module.exports = { register, runApiCallDirect, spawnScriptWithResponse };
