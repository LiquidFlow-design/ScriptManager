'use strict';

async function init() {
  loadSavedTheme();

  // Session-Expired-Event registrieren
  window.api.auth.onSessionExpired(() => {
    showToast('⏱ Session abgelaufen — bitte erneut anmelden', 'err');
    currentUser = null;
    scripts = [];
    showAuthOverlay('auth-login');
  });

  // Auth-Start — mit Retry falls DB beim Start noch nicht bereit ist
  let setup = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      setup = await window.api.auth.needsSetup();
      // Nur Setup zeigen wenn explizit needsSetup:true UND kein Fehler
      if (setup && !setup.error) break;
      // Bei Fehler kurz warten und nochmal versuchen
      if (setup?.error) {
        console.warn(`[init] needsSetup Fehler (Versuch ${attempt + 1}):`, setup.error);
        await new Promise(r => setTimeout(r, 300));
      } else {
        break;
      }
    } catch (e) {
      console.error('[init] needsSetup Exception:', e);
      await new Promise(r => setTimeout(r, 300));
    }
  }

  if (setup?.needsSetup === true && !setup?.error) {
    showAuthOverlay('auth-setup');
    setTimeout(() => document.getElementById('setup-username').focus(), 100);
    return;
  }

  // Bestehende Session prüfen (z.B. wenn App aus Tray wieder geöffnet)
  const session = await window.api.auth.getSession();
  if (session.loggedIn) {
    onLoginSuccess(session.user);
  } else {
    showAuthOverlay('auth-login');
    setTimeout(() => document.getElementById('login-username').focus(), 100);
  }
}

// ── APP START (nach erfolgreichem Login) ─────────────────────────────────────
async function appStart() {
  const info = await window.api.app.info();
  const ver  = info.version || '2.0.0';
  ['app-version','sb-version','about-version'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = ver;
  });
  const dp = document.getElementById('cfg-datapath'); if(dp) dp.textContent = info.dataPath || '–';
  const lp = document.getElementById('cfg-libpath');  if(lp) lp.textContent = info.libPath  || '–';
  const dbp= document.getElementById('cfg-dbpath');   if(dbp)dbp.textContent = info.dbPath   || '–';

  await loadScripts();
  if (currentUser?.rolle === 'admin') await scanLib();
  await loadFavorites();
  await loadChains();
  await loadSchedules();
  await loadApiCalls();

  showPage('scripts');

  window.api.scheduler.onFired(d => {
    showToast(`🕐 Geplant gestartet: ${d.scheduleName}`, 'info');
    loadSchedules();
  });
}

// ── SCRIPTS LADEN ────────────────────────────────────────────────────────────
async function loadScripts() {
  scripts = await window.api.scripts.getAll();
  updateStats();
  buildCategoryPills();
  renderScripts();
  // Favoriten-Badge aktualisieren
  const favCount = scripts.filter(s=>s.favorit).length;
  document.getElementById('badge-favs').textContent = favCount;
  document.getElementById('fav-count').textContent  = favCount;

  // Scan-Banner Count ebenfalls aktualisieren
  const remaining = newFiles.filter(f => !scripts.some(s => s.dateiname.toLowerCase() === f.toLowerCase()));
  newFiles = remaining;
  if (remaining.length === 0) {
    document.getElementById('scan-banner').style.display = 'none';
  } else {
    document.getElementById('scan-count').textContent = remaining.length;
  }
}

function updateStats() {
  const active  = scripts.filter(s => s.aktiviert).length;
  const cats    = [...new Set(scripts.map(s => s.kategorie))].length;
  const lastRun = scripts.filter(s => s.letztes_ausfuehren)
    .sort((a,b) => b.letztes_ausfuehren.localeCompare(a.letztes_ausfuehren))[0];
  document.getElementById('stat-total').textContent  = scripts.length;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-cats').textContent   = cats;
  document.getElementById('badge-count').textContent = scripts.length;
  if (lastRun) {
    document.getElementById('stat-lastrun').textContent      = lastRun.name;
    document.getElementById('stat-lastrun-time').textContent = lastRun.letztes_ausfuehren;
  }
}

function buildCategoryPills() {
  const cats = [...new Set(scripts.map(s => s.kategorie))].sort();
  document.getElementById('cat-pills').innerHTML =
    `<span class="pill ${activeCat===''?'active':''}" onclick="filterCat('')" data-cat="">Alle</span>` +
    cats.map(c => `<span class="pill ${activeCat===c?'active':''}" onclick="filterCat('${escHtml(c)}')" data-cat="${escHtml(c)}">${escHtml(c)}</span>`).join('');
  document.getElementById('kat-list').innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');
}

function filterCat(cat) {
  activeCat = cat;
  document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
  renderScripts();
}

function filterScripts() {
  searchTerm = document.getElementById('search-input').value.toLowerCase();
  renderScripts();
}

function renderScripts() {
  const filtered = scripts.filter(s => {
    const mc = !activeCat || s.kategorie === activeCat;
    const mt = !searchTerm || s.name.toLowerCase().includes(searchTerm) ||
               (s.beschreibung||'').toLowerCase().includes(searchTerm) ||
               s.dateiname.toLowerCase().includes(searchTerm);
    return mc && mt;
  });
  const list = document.getElementById('script-list');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>Keine Scripts gefunden</p></div>`;
    return;
  }
  list.innerHTML = filtered.map(s => `
    <div class="script-row ${selectedId===s.id?'selected':''}" onclick="selectScript(${s.id})">
      <span class="row-status ${s.aktiviert?'on':'off'}"></span>
      <div><div class="row-name">${escHtml(s.name)}</div><div class="row-desc">${escHtml(s.beschreibung||'')}</div></div>
      <span class="cat-badge">${escHtml(s.kategorie)}</span>
      <span style="font-size:12px;color:var(--muted)">${escHtml(s.autor||'–')}</span>
      <span class="row-time">${s.letztes_ausfuehren?s.letztes_ausfuehren.slice(0,16):'–'}</span>
      <div class="row-actions">
        <button class="fav-btn" title="Favorit" onclick="event.stopPropagation();toggleFav(${s.id})" style="font-size:16px">${s.favorit?'⭐':'☆'}</button>
        <button class="icon-btn run-btn"  title="Ausführen"  onclick="event.stopPropagation();runScript(${s.id})">▶</button>
        <button class="icon-btn code-btn" title="Code bearbeiten" onclick="event.stopPropagation();openEditor('${escHtml(s.dateiname)}')">📝</button>
        <button class="icon-btn edit-btn" title="Bearbeiten" onclick="event.stopPropagation();openEditModal(${s.id})">✏️</button>
        <button class="icon-btn del-btn"  title="Löschen"    onclick="event.stopPropagation();deleteScript(${s.id})">🗑</button>
      </div>
    </div>`).join('');
}

// ── DETAIL ───────────────────────────────────────────────────────────────────
function selectScript(id) {
  selectedId = id;
  renderScripts();
  const s = scripts.find(x => x.id === id);
  if (!s) return;
  document.getElementById('detail-panel').innerHTML = `
    <div class="detail-body">
      <div class="detail-field"><div class="detail-label">Name</div><div class="detail-value">${escHtml(s.name)}</div></div>
      <div class="detail-field"><div class="detail-label">Datei</div><div class="detail-value" style="font-family:'JetBrains Mono',monospace;color:var(--accent3);font-size:12px">${escHtml(s.dateiname)}</div></div>
      <div class="detail-field"><div class="detail-label">Kategorie</div><div class="detail-value"><span class="cat-badge">${escHtml(s.kategorie)}</span></div></div>
      <div class="detail-field"><div class="detail-label">Beschreibung</div><div class="detail-value" style="color:var(--muted);font-size:13px">${escHtml(s.beschreibung||'–')}</div></div>
      <div class="detail-field"><div class="detail-label">Autor</div><div class="detail-value">${escHtml(s.autor||'–')}</div></div>
      ${s.parameter?`<div class="detail-field"><div class="detail-label">Parameter</div><div class="detail-value" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent1)">${escHtml(s.parameter)}</div></div>`:''}
      <div class="detail-field"><div class="detail-label">Zuletzt ausgeführt</div><div class="detail-value">${s.letztes_ausfuehren||'–'}</div></div>
      <div class="detail-field"><div class="detail-label">Status</div><div class="detail-value" style="color:${s.aktiviert?'var(--green)':'var(--muted)'}">${s.aktiviert?'✅ Aktiviert':'⏸ Deaktiviert'}</div></div>
      <div class="detail-actions">
        <button class="btn btn-green btn-sm"  onclick="runScript(${s.id})">▶ Ausführen</button>
        <button class="btn btn-ghost btn-sm"  onclick="openEditor('${escHtml(s.dateiname)}')">📝 Code bearbeiten</button>
        <button class="btn btn-ghost btn-sm"  onclick="openEditModal(${s.id})">✏️ Bearbeiten</button>
        <button class="btn btn-danger btn-sm" onclick="deleteScript(${s.id})">🗑 Löschen</button>
      </div>
    </div>`;
}

// ── TERMINAL ─────────────────────────────────────────────────────────────────
function openTerminal(name) {
  const body = document.getElementById('term-body');
  document.getElementById('term-title').textContent   = `▶ ${name}`;
  document.getElementById('term-status').textContent  = '● Läuft…';
  document.getElementById('term-status').className    = 'terminal-status running';
  document.getElementById('term-close-btn').disabled  = true;
  document.getElementById('term-close-btn2').disabled = true;
  document.getElementById('term-abort-btn').disabled  = false;
  document.getElementById('term-input').value         = '';
  body.innerHTML = `<div class="t-line info">● Starte: ${escHtml(name)}</div>`;
  document.getElementById('terminal-overlay').classList.add('open');
}

function appendTermLine(line, type) {
  const body = document.getElementById('term-body');
  const div  = document.createElement('div');
  div.className = `t-line${type==='stderr'?' stderr':''}`;
  div.textContent = line;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function terminalDone(success) {
  const status = document.getElementById('term-status');
  status.textContent = success ? '✔ Fertig' : '✘ Fehler';
  status.className   = 'terminal-status ' + (success ? 'ok' : 'err');
  document.getElementById('term-abort-btn').disabled  = true;
  document.getElementById('term-close-btn').disabled  = false;
  document.getElementById('term-close-btn2').disabled = false;
  // Eingabezeile deaktivieren
  document.getElementById('term-input').disabled       = true;
  const endDiv = document.createElement('div');
  endDiv.className   = 't-line ' + (success ? 'ok' : 'stderr');
  endDiv.textContent = success ? '✔ Script erfolgreich beendet.' : '✘ Script mit Fehler oder Abbruch beendet.';
  document.getElementById('term-body').appendChild(endDiv);
  document.getElementById('term-body').scrollTop = document.getElementById('term-body').scrollHeight;
}

function closeTerminal() {
  document.getElementById('terminal-overlay').classList.remove('open');
  document.getElementById('term-input').disabled = false;
  termCleanup.forEach(fn => fn());
  termCleanup = [];
}

function abortScript() {
  window.api.terminal.kill();
  appendTermLine('⏹ Abgebrochen durch Benutzer.', 'stderr');
}

function sendTerminalInput() {
  const input = document.getElementById('term-input');
  const text  = input.value;
  // Eingabe im Terminal anzeigen (Echo)
  appendTermLine('▶ ' + text, 'info');
  window.api.terminal.sendInput(text);
  input.value = '';
  input.focus();
}

function copyTerminalOutput() {
  const lines = [...document.getElementById('term-body').querySelectorAll('.t-line')]
    .map(d => d.textContent).join('\n');
  navigator.clipboard.writeText(lines).then(() => showToast('📋 In Zwischenablage kopiert', 'ok'));
}

// ── SCRIPT AUSFÜHREN ─────────────────────────────────────────────────────────
async function runScript(id) {
  const s = scripts.find(x => x.id === id);
  if (!s) return;
  openTerminal(s.name);
  document.getElementById('term-input').disabled = false;
  document.getElementById('term-input').focus();

  const offData = window.api.terminal.onData(d => appendTermLine(d.line, d.type));
  const offEnd  = window.api.terminal.onEnd(d => {
    terminalDone(d.success);
    loadScripts();
    if (selectedId === id) selectScript(id);
    showToast(d.success ? `✔ ${s.name} abgeschlossen` : `✘ Fehler bei ${s.name}`, d.success?'ok':'err');
  });
  termCleanup = [offData, offEnd];

  window.api.scripts.run(id, s.parameter || '');
}

// ── EDITOR ───────────────────────────────────────────────────────────────────
async function openEditor(filename) {
  editorFilename = filename;
  document.getElementById('editor-title').textContent = filename;
  document.getElementById('editor-status').textContent = '⌛ Lade…';
  document.getElementById('editor-overlay').classList.add('open');
  const r = await window.api.scripts.readCode(filename);
  if (r.success) {
    const ta = document.getElementById('editor-textarea');
    ta.value = r.code;
    updateEditorInfo(ta);
    document.getElementById('editor-status').textContent = '';
  } else {
    document.getElementById('editor-textarea').value = '# Datei nicht gefunden: ' + filename;
    document.getElementById('editor-status').textContent = '✘ ' + (r.error || 'Fehler');
  }
}

function updateEditorInfo(ta) {
  const lines = ta.value.split('\n').length;
  const chars = ta.value.length;
  document.getElementById('editor-info').textContent = `${lines} Zeilen · ${chars} Zeichen`;
}

function closeEditor() { document.getElementById('editor-overlay').classList.remove('open'); }

async function saveEditorCode() {
  const code = document.getElementById('editor-textarea').value;
  const r    = await window.api.scripts.writeCode(editorFilename, code);
  if (r.success) {
    showToast(`💾 ${editorFilename} gespeichert`, 'ok');
    document.getElementById('editor-status').textContent = '✔ Gespeichert';
    setTimeout(() => document.getElementById('editor-status').textContent = '', 2000);
  } else {
    showToast('✘ Speichern fehlgeschlagen: ' + (r.error||''), 'err');
  }
}

// ── MODAL: HINZUFÜGEN / BEARBEITEN ───────────────────────────────────────────
function openAddModal(prefillFilename) {
  document.getElementById('modal-title').textContent  = 'Script hinzufügen';
  document.getElementById('modal-id').value           = '';
  document.getElementById('modal-name').value         = prefillFilename ? prefillFilename.replace(/\.ps1$/i,'') : '';
  document.getElementById('modal-dateiname').value    = prefillFilename || '';
  document.getElementById('modal-kategorie').value    = '';
  document.getElementById('modal-autor').value        = '';
  document.getElementById('modal-beschreibung').value = '';
  document.getElementById('modal-parameter').value    = '';
  document.getElementById('modal-aktiviert').checked  = true;
  document.getElementById('modal-script').classList.add('open');
}

function openEditModal(id) {
  const s = scripts.find(x => x.id === id);
  if (!s) return;
  document.getElementById('modal-title').textContent  = 'Script bearbeiten';
  document.getElementById('modal-id').value           = s.id;
  document.getElementById('modal-name').value         = s.name;
  document.getElementById('modal-dateiname').value    = s.dateiname;
  document.getElementById('modal-kategorie').value    = s.kategorie;
  document.getElementById('modal-autor').value        = s.autor || '';
  document.getElementById('modal-beschreibung').value = s.beschreibung || '';
  document.getElementById('modal-parameter').value    = s.parameter || '';
  document.getElementById('modal-aktiviert').checked  = !!s.aktiviert;
  document.getElementById('modal-script').classList.add('open');
}

function closeModal() { document.getElementById('modal-script').classList.remove('open'); }

async function saveScript() {
  const id   = document.getElementById('modal-id').value;
  const data = {
    name:         document.getElementById('modal-name').value.trim(),
    dateiname:    document.getElementById('modal-dateiname').value.trim(),
    kategorie:    document.getElementById('modal-kategorie').value.trim() || 'Allgemein',
    autor:        document.getElementById('modal-autor').value.trim(),
    beschreibung: document.getElementById('modal-beschreibung').value.trim(),
    parameter:    document.getElementById('modal-parameter').value.trim(),
    aktiviert:    document.getElementById('modal-aktiviert').checked,
  };
  if (!data.name || !data.dateiname) { showToast('Name und Dateiname sind Pflichtfelder', 'err'); return; }
  const r = id
    ? await window.api.scripts.update({ ...data, id: parseInt(id) })
    : await window.api.scripts.add(data);
  if (r.success) {
    showToast(id ? '✔ Script aktualisiert' : '✔ Script hinzugefügt', 'ok');
    closeModal();
    await loadScripts();  // ← Echtzeit-Update Stats
  } else { showToast('✘ Fehler beim Speichern', 'err'); }
}

async function deleteScript(id) {
  const s = scripts.find(x => x.id === id);
  if (!s || !confirm(`Script "${s.name}" wirklich löschen?`)) return;
  const r = await window.api.scripts.delete(id);
  if (r.success) {
    showToast('🗑 Script gelöscht', 'ok');
    if (selectedId === id) { selectedId = null; document.getElementById('detail-panel').innerHTML = `<div class="detail-empty"><div style="font-size:32px;opacity:.3">👆</div><div>Script auswählen</div></div>`; }
    await loadScripts();  // ← Echtzeit-Update Stats
  }
}

// ── LIB SCAN ─────────────────────────────────────────────────────────────────
async function scanLib() {
  const result = await window.api.lib.scanNew();
  newFiles = result.newFiles || [];
  const banner = document.getElementById('scan-banner');
  if (newFiles.length > 0) {
    document.getElementById('scan-count').textContent = newFiles.length;
    banner.style.display = 'flex';
  } else { banner.style.display = 'none'; }
}

function openScanModal() {
  const body = document.getElementById('scan-modal-body');
  body.innerHTML = newFiles.map(f => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent3);flex:1">${escHtml(f)}</span>
      <button class="btn btn-primary btn-sm" onclick="quickRegister('${escHtml(f)}')">＋ Registrieren</button>
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px;padding:8px">Keine neuen Dateien.</div>';
  document.getElementById('modal-scan').classList.add('open');
}

function closeScanModal() { document.getElementById('modal-scan').classList.remove('open'); }

function quickRegister(filename) { closeScanModal(); openAddModal(filename); }

async function registerScannedFiles() {
  let count = 0;
  for (const f of newFiles) {
    const r = await window.api.scripts.add({ name:f.replace(/\.ps1$/i,''), dateiname:f, kategorie:'Allgemein', beschreibung:'', autor:'', parameter:'', aktiviert:true });
    if (r.success) count++;
  }
  showToast(`✔ ${count} Scripts registriert`, 'ok');
  closeScanModal();
  await loadScripts();  // ← Echtzeit-Update Stats + Banner
  await scanLib();
}

// ── CSV IMPORT ───────────────────────────────────────────────────────────────
async function importCsvDialog() {
  const result = await window.api.lib.openCsv();
  if (!result.success) return;
  const lines = result.content.replace(/^\uFEFF/,'').split('\n').map(l=>l.trim()).filter(Boolean).slice(1);
  let imported = 0;
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const [,name,dateiname,kategorie,beschreibung,autor,parameter,aktiviert] = parts;
    if (!name?.trim() || !dateiname?.trim()) continue;
    const r = await window.api.scripts.add({ name:name.trim(), dateiname:dateiname.trim(), kategorie:(kategorie||'').trim()||'Allgemein', beschreibung:(beschreibung||'').trim(), autor:(autor||'').trim(), parameter:(parameter||'').trim(), aktiviert:(aktiviert||'').trim()==='1' });
    if (r.success) imported++;
  }
  showToast(`✔ ${imported} Scripts importiert`, 'ok');
  await loadScripts();  // ← Echtzeit-Update Stats
  await scanLib();
}

// ── LIB-ORDNER ───────────────────────────────────────────────────────────────
async function openLib() { const r = await window.api.lib.openFolder(); if(r.success) showToast('📂 lib-Ordner geöffnet','info'); }
async function importPs1() { const r = await window.api.lib.importFile(); if(r.success){ showToast(`📁 ${r.files.join(', ')} kopiert`,'ok'); await scanLib(); } }


// ── BOOTSTRAP ────────────────────────────────────────────────────────────────
// Startet die App nach dem Laden aller Scripts
init();
