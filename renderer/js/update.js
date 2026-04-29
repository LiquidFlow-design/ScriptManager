'use strict';

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

