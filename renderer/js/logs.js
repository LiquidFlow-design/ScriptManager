'use strict';

// ── LOGS ─────────────────────────────────────────────────────────────────────
let allLogs = [];

async function loadLogs() {
  allLogs = await window.api.logs.getRecent(500);
  renderLogs();
}

function renderLogs() {
  const search    = (document.getElementById('log-search')?.value || '').toLowerCase();
  const statusFil = document.getElementById('log-filter-status')?.value || '';

  const filtered = allLogs.filter(l => {
    const ms = !statusFil || l.status === statusFil;
    const mt = !search   ||
      (l.script_name||'').toLowerCase().includes(search) ||
      (l.output||'').toLowerCase().includes(search);
    return ms && mt;
  });

  document.getElementById('log-count-badge').textContent = `${filtered.length} Einträge`;

  const tbody = document.getElementById('log-tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:24px">Keine Logs gefunden</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const statusCls = l.status==='success' ? 'log-ok' : l.status==='error' ? 'log-err' : 'log-info';
    const statusIcon = l.status==='success' ? '✔' : l.status==='error' ? '✘' : '●';
    const preview = escHtml((l.output||'').replace(/\s+/g,' ').slice(0,120));
    return `<tr>
      <td style="padding:0 8px"><input type="checkbox" class="log-chk" data-id="${l.id}" style="accent-color:var(--accent1)"></td>
      <td style="font-size:11px;white-space:nowrap">${l.gestartet_am||'–'}</td>
      <td style="font-weight:600">${escHtml(l.script_name||'–')}</td>
      <td class="${statusCls}">${statusIcon} ${l.status}</td>
      <td class="log-output-cell" onclick="openLogDetail(${l.id})" title="Klicken für Vollausgabe">${preview||'–'}</td>
      <td><button class="log-row-del" onclick="deleteSingleLog(${l.id})" title="Diesen Log löschen">🗑</button></td>
    </tr>`;
  }).join('');
}

// Einzelnen Log löschen (direkt aus Tabelle)
async function deleteSingleLog(id) {
  await window.api.logs.clearById(id);
  allLogs = allLogs.filter(l => l.id !== id);
  renderLogs();
  showToast('🗑 Log gelöscht', 'ok');
}

// Log-Detail Modal öffnen
let detailLogId = null;
function openLogDetail(id) {
  const l = allLogs.find(x => x.id === id);
  if (!l) return;
  detailLogId = id;
  const statusCls  = l.status==='success'?'log-ok':l.status==='error'?'log-err':'log-info';
  const statusIcon = l.status==='success'?'✔':l.status==='error'?'✘':'●';
  document.getElementById('log-detail-body').innerHTML = `
    <div class="log-detail-meta">
      <div class="log-detail-field"><div class="log-detail-label">Zeitpunkt</div><div class="log-detail-value" style="font-family:'JetBrains Mono',monospace;font-size:12px">${l.gestartet_am||'–'}</div></div>
      <div class="log-detail-field"><div class="log-detail-label">Script</div><div class="log-detail-value">${escHtml(l.script_name||'–')}</div></div>
      <div class="log-detail-field"><div class="log-detail-label">Datei</div><div class="log-detail-value" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent3)">${escHtml(l.dateiname||'–')}</div></div>
      <div class="log-detail-field"><div class="log-detail-label">Status</div><div class="log-detail-value ${statusCls}">${statusIcon} ${l.status}</div></div>
    </div>
    <div class="log-detail-field">
      <div class="log-detail-label">Ausgabe</div>
      <pre class="log-output-pre">${escHtml(l.output||'(keine Ausgabe)')}</pre>
    </div>`;
  document.getElementById('modal-log-detail').classList.add('open');
}

function closeLogDetail() { document.getElementById('modal-log-detail').classList.remove('open'); }

async function deleteLogFromDetail() {
  if (detailLogId === null) return;
  await window.api.logs.clearById(detailLogId);
  allLogs = allLogs.filter(l => l.id !== detailLogId);
  renderLogs();
  closeLogDetail();
  showToast('🗑 Log gelöscht', 'ok');
}

// Bereinigen-Modal
async function openClearLogsModal() {
  const r = await window.api.logs.getCount();
  document.getElementById('clear-log-count').textContent = r.count;
  document.getElementById('modal-clear-logs').classList.add('open');
}
function closeClearLogsModal() { document.getElementById('modal-clear-logs').classList.remove('open'); }

async function clearLogsOlder(days) {
  await window.api.logs.clearOlderThan(days);
  closeClearLogsModal();
  showToast(`🗑 Logs älter als ${days} Tage gelöscht`, 'ok');
  await loadLogs();
}

async function clearAllLogsConfirm() {
  if (!confirm('Wirklich ALLE Logs unwiderruflich löschen?')) return;
  await window.api.logs.clearAll();
  allLogs = [];
  renderLogs();
  closeClearLogsModal();
  showToast('🗑 Alle Logs gelöscht', 'ok');
}

// ── UPDATE ───────────────────────────────────────────────────────────────────
function appendToLog(elId, msg, cls='info') {
  const el = document.getElementById(elId);
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'log-line ' + cls;
  d.textContent = msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}
function updLog(msg,cls='info') { appendToLog('upd-log', msg, cls); }
function gitLog(msg,cls='info') { appendToLog('git-log', msg, cls); }

// ── App-Update ────────────────────────────────────────────────────────────
async function checkUpdate() {
  const btn = document.getElementById('btn-check-upd');
  btn.disabled = true; btn.textContent = '⌛ Prüfe…';
  updLog(`[${now()}] Prüfe auf neue App-Version…`, 'cmd');
  try {
    const r = await window.api.update.check();
    document.getElementById('upd-current').textContent = r.currentVersion || '–';
    document.getElementById('upd-latest').textContent  = r.latestVersion  || '–';
    if (r.available) {
      document.getElementById('btn-run-upd').disabled        = false;
      document.getElementById('badge-updates').style.display = '';
      updLog(`[${now()}] ⬇ Neue Version verfügbar: v${r.latestVersion}`, 'warn');
      showToast(`⬇ App-Update v${r.latestVersion} verfügbar`, 'info');
    } else if (r.error) {
      updLog(`[${now()}] Fehler: ${r.error}`, 'err');
      showToast('✘ Update-Check fehlgeschlagen', 'err');
    } else {
      updLog(`[${now()}] ✔ App ist aktuell (v${r.currentVersion})`, 'ok');
      showToast('✔ App ist aktuell', 'ok');
    }
  } catch(e) { updLog(`Fehler: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = '🔍 Auf neue Version prüfen';
}

async function runUpdate() {
  document.getElementById('btn-run-upd').disabled = true;
  updLog(`[${now()}] Lade neue Version herunter…`, 'cmd');
  const r = await window.api.update.download();
  if (r.success) {
    updLog(`[${now()}] ✔ Download abgeschlossen. App startet neu…`, 'ok');
    showToast('✔ Update wird installiert, App startet neu', 'ok');
  } else {
    updLog(`[${now()}] Fehler: ${r.error || '?'}`, 'err');
    document.getElementById('btn-run-upd').disabled = false;
  }
}

// ── Git-Script-Update ─────────────────────────────────────────────────────
async function checkGitStatus() {
  const btn = document.getElementById('btn-git-check');
  btn.disabled = true; btn.textContent = '⌛ Prüfe…';
  gitLog(`[${now()}] Prüfe Git-Status…`, 'cmd');
  try {
    const r = await window.api.git.status();
    if (r.noRepo) {
      gitLog(`[${now()}] ℹ Noch kein Git-Repo. Klicke "Scripte aktualisieren" für erstes Klonen.`, 'warn');
      document.getElementById('git-local-hash').textContent  = 'kein Repo';
      document.getElementById('git-remote-hash').textContent = '–';
    } else if (r.error) {
      gitLog(`[${now()}] Fehler: ${r.error}`, 'err');
      showToast('✘ Git-Status fehlgeschlagen', 'err');
    } else {
      document.getElementById('git-local-hash').textContent  = r.localHash  || '–';
      document.getElementById('git-remote-hash').textContent = r.remoteHash || '–';
      if (r.available) {
        gitLog(`[${now()}] ⬇ Neue Commits verfügbar:`, 'warn');
        (r.commitLog || '').split('\n').filter(Boolean).forEach(line =>
          gitLog('  ' + line, 'warn'));
        showToast('⬇ Neue PS1-Scripts verfügbar', 'info');
      } else {
        gitLog(`[${now()}] ✔ Scripts sind aktuell`, 'ok');
        showToast('✔ Scripts sind aktuell', 'ok');
      }
    }
  } catch(e) { gitLog(`Fehler: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = '🔍 Status prüfen';
}

async function runGitSync() {
  const btn     = document.getElementById('btn-git-sync');
  const repoUrl = document.getElementById('git-repo-url').value.trim();
  const branch  = document.getElementById('git-branch').value.trim() || 'main';
  if (!repoUrl) { showToast('Bitte Repository-URL eingeben', 'err'); return; }

  btn.disabled = true; btn.textContent = '⌛ Synchronisiere…';
  gitLog(`[${now()}] Starte Git-Sync von ${repoUrl} (${branch})…`, 'cmd');

  try {
    const r = await window.api.git.sync(repoUrl, branch);
    if (r.success) {
      gitLog(`[${now()}] ✔ Sync erfolgreich`, 'ok');
      if (r.newFiles?.length)     gitLog(`  Neue Scripte: ${r.newFiles.join(', ')}`, 'ok');
      if (r.updatedFiles?.length) gitLog(`  Aktualisiert: ${r.updatedFiles.length} Datei(en)`, 'info');
      if (r.output) r.output.split('\n').filter(Boolean).forEach(l => gitLog('  ' + l, 'info'));
      showToast(`✔ Scripts synchronisiert${r.newFiles?.length ? ` (${r.newFiles.length} neu)` : ''}`, 'ok');
      // Scan-Banner aktualisieren falls neue PS1-Dateien aufgetaucht sind
      await scanLib();
    } else {
      gitLog(`[${now()}] ✘ Fehler: ${r.error || '?'}`, 'err');
      if (r.output) r.output.split('\n').filter(Boolean).forEach(l => gitLog('  ' + l, 'err'));
      showToast('✘ Git-Sync fehlgeschlagen', 'err');
    }
  } catch(e) { gitLog(`Fehler: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = '⬇ Scripte aktualisieren';
}

