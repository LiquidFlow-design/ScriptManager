'use strict';

// ── CHAINS ────────────────────────────────────────────────────────────────────
let chains = [];
let selectedChainId = null;
let chainBuilderSteps = [];  // [{script_id, script_name, parameter, pause_sek}]
let chainMonitorCleanup = [];

async function loadChains() {
  chains = await window.api.chains.getAll();
  document.getElementById('badge-chains').textContent = chains.length;
  renderChains();
}

function renderChains() {
  const el = document.getElementById('chain-list');
  if(!chains.length){ el.innerHTML='<div class="empty-state"><div class="icon">🔗</div><p>Noch keine Verkettungen.</p></div>'; return; }
  el.innerHTML = chains.map(c=>`
    <div class="script-row ${selectedChainId===c.id?'selected':''}" onclick="selectChain(${c.id})">
      <span class="row-status on"></span>
      <div><div class="row-name">${escHtml(c.name)}</div><div class="row-desc">${escHtml(c.beschreibung||'')}</div></div>
      <span class="cat-badge">${c.bei_fehler==='stop'?'🛑 Stop':'▶ Weiter'}</span>
      <span style="font-size:12px;color:var(--muted)"></span>
      <span class="row-time"></span>
      <div class="row-actions">
        <button class="icon-btn run-btn"  title="Ausführen"  onclick="event.stopPropagation();runChainById(${c.id})">▶</button>
        <button class="icon-btn edit-btn" title="Bearbeiten" onclick="event.stopPropagation();openChainModal(${c.id})">✏️</button>
        <button class="icon-btn del-btn"  title="Löschen"    onclick="event.stopPropagation();deleteChain(${c.id})">🗑</button>
      </div>
    </div>`).join('');
}

async function selectChain(id) {
  selectedChainId = id;
  renderChains();
  const chain = chains.find(c=>c.id===id);
  const steps = await window.api.chains.getSteps(id);
  document.getElementById('chain-detail-title').textContent = `🔗 ${chain.name}`;
  document.getElementById('chain-detail-actions').style.display = '';
  document.getElementById('chain-detail-panel').innerHTML = `
    <div class="detail-body">
      <div class="detail-field"><div class="detail-label">Beschreibung</div><div class="detail-value" style="color:var(--muted)">${escHtml(chain.beschreibung||'–')}</div></div>
      <div class="detail-field"><div class="detail-label">Bei Fehler</div><div class="detail-value">${chain.bei_fehler==='stop'?'🛑 Stoppen':'▶ Weiter ausführen'}</div></div>
      <div class="detail-field"><div class="detail-label">Schritte (${steps.length})</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
          ${steps.length?steps.map((s,i)=>`
            <div class="chain-step-row">
              <div class="chain-step-num">${i+1}</div>
              <div class="chain-step-info">
                <div>${escHtml(s.script_name)}</div>
                <div class="chain-step-sub">${escHtml(s.dateiname)}${s.parameter?` · ${escHtml(s.parameter)}`:''} · ${s.warte_typ==='auf_abschluss'?'⏸ Warten auf Abschluss':'⏱ ' + formatPauseSek(s.pause_sek) + ' Pause'}</div>
              </div>
            </div>`).join(''):'<div style="color:var(--muted);font-size:13px">Keine Schritte.</div>'}
        </div>
      </div>
    </div>`;
}

// Chain-Modal
async function openChainModal(id) {
  chainBuilderSteps = [];
  document.getElementById('chain-modal-id').value        = id||'';
  document.getElementById('chain-modal-title').textContent= id?'Verkettung bearbeiten':'Verkettung erstellen';
  document.getElementById('chain-modal-name').value      = '';
  document.getElementById('chain-modal-beschreibung').value='';
  document.getElementById('chain-modal-fehler').value    = 'stop';

  // Script-Dropdown befüllen
  document.getElementById('chain-script-select').innerHTML =
    scripts.map(s=>`<option value="${s.id}">${escHtml(s.name)}</option>`).join('');

  if(id){
    const c=chains.find(x=>x.id===id);
    if(c){ document.getElementById('chain-modal-name').value=c.name; document.getElementById('chain-modal-beschreibung').value=c.beschreibung||''; document.getElementById('chain-modal-fehler').value=c.bei_fehler||'stop'; }
    const steps=await window.api.chains.getSteps(id);
    chainBuilderSteps=steps.map(s=>({script_id:s.script_id,script_name:s.script_name,dateiname:s.dateiname||'',parameter:s.parameter||'',pause_sek:s.pause_sek||0,warte_typ:s.warte_typ||'auf_abschluss'}));
  }
  renderChainBuilder();
  document.getElementById('modal-chain').classList.add('open');
}

function closeChainModal() { document.getElementById('modal-chain').classList.remove('open'); }

function addChainStep() {
  const sel    = document.getElementById('chain-script-select');
  const id     = parseInt(sel.value);
  const sname  = sel.options[sel.selectedIndex]?.text || '';
  const params = document.getElementById('chain-step-params').value.trim();
  if (!id) { showToast('Bitte ein Script auswaehlen', 'err'); return; }
  chainBuilderSteps.push({ script_id: id, script_name: sname, parameter: params, pause_sek: 0, warte_typ: 'auf_abschluss' });
  document.getElementById('chain-step-params').value = '';
  renderChainBuilder();
}

function removeChainStep(i) { chainBuilderSteps.splice(i,1); renderChainBuilder(); }

function moveChainStep(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= chainBuilderSteps.length) return;
  [chainBuilderSteps[i], chainBuilderSteps[j]] = [chainBuilderSteps[j], chainBuilderSteps[i]];
  renderChainBuilder();
}

function updateChainStepPause(i, val, source) {
  // source: 'slider' | 'input' (woher kommt der Wert)
  let sek = parseInt(val) || 0;
  // Eingabe ist in Minuten wenn source='input', sonst Sekunden
  if (source === 'input') sek = Math.min(Math.round(parseFloat(val) * 60) || 0, 3600);
  sek = Math.max(0, Math.min(sek, 3600));
  chainBuilderSteps[i].pause_sek = sek;

  // Slider synchronisieren
  const slider = document.getElementById('chain-slider-' + i);
  if (slider && source !== 'slider') slider.value = sek;

  // Minuten-Eingabe synchronisieren
  const inp = document.getElementById('chain-min-input-' + i);
  if (inp && source !== 'input') {
    const min = sek / 60;
    inp.value = sek === 0 ? '0' : Number.isInteger(min) ? min : min.toFixed(1);
  }

  // Track-Farbe: zeigt gefüllten Anteil lila
  if (slider) {
    const pct = (sek / 3600) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent1) ${pct}%, var(--border) ${pct}%)`;
  }

  // Info-Zeile aktualisieren
  const info = document.getElementById('chain-pause-info-' + i);
  if (info) {
    const wt = chainBuilderSteps[i].warte_typ;
    info.textContent = wt === 'auf_abschluss'
      ? '⏸ Nächster Schritt startet wenn dieser fertig ist' + (sek > 0 ? ` + ${formatPauseSek(sek)} Zusatzpause` : '')
      : sek === 0 ? '▶ Sofort starten (keine Pause)'
                  : '⏱ ' + formatPauseSek(sek) + ' warten vor diesem Schritt';
  }
}

function updateChainStepWarteTyp(i, val) {
  chainBuilderSteps[i].warte_typ = val;
  renderChainBuilder();
}

function updateChainStepParam(i, val) {
  chainBuilderSteps[i].parameter = val;
}

function renderChainBuilder() {
  const el      = document.getElementById('chain-steps-builder');
  const hint    = document.getElementById('chain-empty-hint');
  const counter = document.getElementById('chain-step-counter');
  const n       = chainBuilderSteps.length;
  if (counter) counter.textContent = n;
  if (!n) {
    el.innerHTML = '';
    if (hint) hint.style.display = '';
    return;
  }
  if (hint) hint.style.display = 'none';

  el.innerHTML = chainBuilderSteps.map((s, i) => {
    const isFirst = i === 0;
    const isLast  = i === n - 1;
    return `
    <div style="display:flex;align-items:stretch;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:10px;overflow:hidden" id="chain-step-${i}">

      <!-- Linke Seite: Schrittnummer + Pfeile -->
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;padding:12px 10px;background:rgba(124,106,247,.1);border-right:1px solid var(--border);flex-shrink:0;min-width:46px">
        <div style="width:22px;height:22px;border-radius:50%;background:var(--accent1);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">${i+1}</div>
        <button onclick="moveChainStep(${i},-1)" title="Nach oben" ${isFirst?'disabled':''} style="background:transparent;border:none;cursor:${isFirst?'default':'pointer'};color:${isFirst?'rgba(100,116,139,.3)':'var(--muted)'};font-size:12px;padding:2px 4px;border-radius:4px;line-height:1">&#x25B2;</button>
        <button onclick="moveChainStep(${i},1)"  title="Nach unten" ${isLast?'disabled':''} style="background:transparent;border:none;cursor:${isLast?'default':'pointer'};color:${isLast?'rgba(100,116,139,.3)':'var(--muted)'};font-size:12px;padding:2px 4px;border-radius:4px;line-height:1">&#x25BC;</button>
      </div>

      <!-- Body -->
      <div style="flex:1;padding:12px 14px;display:flex;flex-direction:column;gap:10px;min-width:0">
        <!-- Script-Name -->
        <div>
          <span style="font-size:10px;color:var(--accent1);font-family:'JetBrains Mono',monospace;margin-right:6px;font-weight:600">SCHRITT ${i+1}</span>
          <span style="font-weight:700;font-size:13px">${escHtml(s.script_name)}</span>
        </div>

        <!-- Parameter -->
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Parameter</div>
          <input style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:7px;padding:5px 10px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:11px;outline:none"
                 value="${escHtml(s.parameter)}"
                 placeholder="z.B. -Verbose (optional)"
                 oninput="updateChainStepParam(${i}, this.value)"
                 spellcheck="false">
        </div>

        <!-- Warte-Typ Toggle + optionaler Pause-Slider -->
        <div style="display:flex;flex-direction:column;gap:8px">

          <!-- Toggle: Auf Abschluss / Timer -->
          <div style="display:flex;gap:6px">
            <button onclick="updateChainStepWarteTyp(${i},'auf_abschluss')"
                    style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid ${s.warte_typ==='auf_abschluss'?'var(--accent1)':'var(--border)'};background:${s.warte_typ==='auf_abschluss'?'rgba(124,106,247,.2)':'var(--card)'};color:${s.warte_typ==='auf_abschluss'?'var(--accent1)':'var(--muted)'};cursor:pointer;font-family:var(--font-ui,'Syne'),sans-serif;font-size:11px;font-weight:700;transition:all .2s">
              ⏸ Auf Abschluss warten
            </button>
            <button onclick="updateChainStepWarteTyp(${i},'timer')"
                    style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid ${s.warte_typ==='timer'?'var(--accent1)':'var(--border)'};background:${s.warte_typ==='timer'?'rgba(124,106,247,.2)':'var(--card)'};color:${s.warte_typ==='timer'?'var(--accent1)':'var(--muted)'};cursor:pointer;font-family:var(--font-ui,'Syne'),sans-serif;font-size:11px;font-weight:700;transition:all .2s">
              ⏱ Feste Pause
            </button>
          </div>

          <!-- Pause: Slider + Minuten-Eingabe -->
          <div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">
              ${s.warte_typ==='auf_abschluss'?'Zusätzliche Pause danach':'Pause vor Schritt'}
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <!-- Slider 0–3600s -->
              <input type="range" id="chain-slider-${i}" min="0" max="3600" step="30" value="${s.pause_sek}"
                     oninput="updateChainStepPause(${i}, this.value, 'slider')"
                     style="-webkit-appearance:none;flex:1;height:6px;border-radius:3px;outline:none;cursor:pointer;background:linear-gradient(to right, var(--accent1) ${(s.pause_sek/3600*100).toFixed(1)}%, var(--border) ${(s.pause_sek/3600*100).toFixed(1)}%)">
              <!-- Minuten-Eingabe -->
              <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                <input type="number" id="chain-min-input-${i}"
                       min="0" max="60" step="0.5"
                       value="${s.pause_sek===0?'0':Number.isInteger(s.pause_sek/60)?(s.pause_sek/60).toString():(s.pause_sek/60).toFixed(1)}"
                       oninput="updateChainStepPause(${i}, this.value, 'input')"
                       style="width:58px;background:var(--card);border:1px solid var(--border);border-radius:7px;padding:4px 8px;color:var(--accent1);font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;text-align:right;outline:none;-moz-appearance:textfield"
                       title="Minuten eingeben (max. 60 min)">
                <span style="font-size:11px;color:var(--muted)">min</span>
              </div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:5px;padding:0 2px" id="chain-pause-info-${i}">
              ${s.warte_typ==='auf_abschluss'
                ? '⏸ Nächster Schritt startet wenn dieser fertig ist' + (s.pause_sek>0?` + ${formatPauseSek(s.pause_sek)} Zusatzpause`:'')
                : s.pause_sek===0 ? '▶ Sofort starten (keine Pause)' : '⏱ ' + formatPauseSek(s.pause_sek) + ' warten vor diesem Schritt'}
            </div>
            <div style="font-size:10px;color:rgba(100,116,139,.5);margin-top:2px;padding:0 2px">max. 60 min</div>
          </div>
        </div>
      </div>

      <!-- Rechts: Loeschen -->
      <div style="padding:12px 10px;display:flex;align-items:flex-start">
        <button onclick="removeChainStep(${i})" title="Schritt entfernen"
                style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;background:transparent;color:var(--muted);font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .2s"
                onmouseenter="this.style.background='rgba(248,113,113,.2)';this.style.color='var(--red)'"
                onmouseleave="this.style.background='transparent';this.style.color='var(--muted)'">&#x1F5D1;</button>
      </div>
    </div>`;
  }).join('');
}

// ===== OLD renderChainBuilder placeholder removed =====
function _old_renderChainBuilder_removed() {}

async function saveChain() {
  const id   = document.getElementById('chain-modal-id').value;
  const name = document.getElementById('chain-modal-name').value.trim();
  if(!name){ showToast('Name ist Pflichtfeld','err'); return; }
  const data = { name, beschreibung:document.getElementById('chain-modal-beschreibung').value.trim(), bei_fehler:document.getElementById('chain-modal-fehler').value };
  let chainId;
  if(id){
    await window.api.chains.update({...data,id:parseInt(id)});
    chainId=parseInt(id);
  } else {
    const r=await window.api.chains.add(data);
    chainId=r.id;
  }
  await window.api.chains.saveSteps(chainId, chainBuilderSteps);
  showToast(id?'✔ Verkettung aktualisiert':'✔ Verkettung erstellt','ok');
  closeChainModal();
  await loadChains();
  if(chainId) selectChain(chainId);
}

async function deleteChain(id) {
  if(!confirm('Verkettung wirklich löschen?')) return;
  await window.api.chains.delete(id);
  showToast('🗑 Verkettung gelöscht','ok');
  if(selectedChainId===id){ selectedChainId=null; document.getElementById('chain-detail-panel').innerHTML='<div class="detail-empty"><div style="font-size:32px;opacity:.3">👆</div><div>Verkettung auswählen</div></div>'; document.getElementById('chain-detail-actions').style.display='none'; }
  await loadChains();
}

function runSelectedChain() { if(selectedChainId) runChainById(selectedChainId); }
function editSelectedChain() { if(selectedChainId) openChainModal(selectedChainId); }

// Chain ausführen mit Live-Monitor
async function runChainById(chainId) {
  const chain = chains.find(c=>c.id===chainId);
  if(!chain) return;
  const steps = await window.api.chains.getSteps(chainId);
  if(!steps.length){ showToast('Chain hat keine Schritte','err'); return; }

  // Monitor öffnen
  openChainMonitor(chain.name, steps);

  // IPC-Listener
  const offStart    = window.api.chain.onStart(d    => { updateChainProgress(0,d.total); });
  const offStepStart= window.api.chain.onStepStart(d=> { setChainStepStatus(d.index,'running'); updateChainProgress(d.index,d.total); });
  const offData     = window.api.chain.onData(d     => { appendChainStepOutput(d.index, d.line, d.type); });
  const offStepEnd  = window.api.chain.onStepEnd(d  => { setChainStepStatus(d.index, d.success?'ok':'err'); updateChainProgress(d.index+1, steps.length); });
  const offEnd      = window.api.chain.onEnd(d      => {
    chainMonitorDone(d.success);
    loadScripts();
    chainMonitorCleanup.forEach(fn=>fn());
    chainMonitorCleanup=[];
    showToast(d.success?`✔ Chain "${chain.name}" fertig`:`✘ Chain "${chain.name}" mit Fehler`,'ok');
  });
  chainMonitorCleanup=[offStart,offStepStart,offData,offStepEnd,offEnd];

  window.api.chains.run(chainId);
}

function openChainMonitor(name, steps) {
  document.getElementById('chain-monitor-title').textContent = `🔗 ${name}`;
  document.getElementById('chain-monitor-status').textContent='● Läuft…';
  document.getElementById('chain-monitor-status').className='terminal-status running';
  document.getElementById('chain-monitor-close').disabled=true;
  document.getElementById('chain-monitor-close2').disabled=true;
  document.getElementById('chain-progress-fill').style.width='0%';
  document.getElementById('chain-progress-text').textContent=`0 / ${steps.length}`;

  // Schritte rendern
  document.getElementById('chain-monitor-steps').innerHTML = steps.map((s,i)=>`
    <div class="monitor-step" id="monitor-step-${i}">
      <div class="monitor-step-icon waiting" id="monitor-icon-${i}">◯</div>
      <div class="monitor-step-body">
        <div class="monitor-step-name">${escHtml(s.script_name)}</div>
        <div class="monitor-step-output" id="monitor-out-${i}"></div>
      </div>
      <button class="icon-btn" onclick="toggleMonitorOutput(${i})" title="Ausgabe ein/ausblenden" style="color:var(--muted);flex-shrink:0">⊞</button>
    </div>`).join('');

  document.getElementById('chain-monitor-overlay').classList.add('open');
}

function toggleMonitorOutput(i) {
  document.getElementById('monitor-out-'+i)?.classList.toggle('visible');
}

function setChainStepStatus(i, status) {
  const icon=document.getElementById('monitor-icon-'+i);
  if(!icon) return;
  const map={waiting:['◯','waiting'],running:['▶','running'],ok:['✔','ok'],err:['✘','err'],skip:['–','skip']};
  const [txt,cls]=map[status]||['◯','waiting'];
  icon.textContent=txt; icon.className='monitor-step-icon '+cls;
}

function appendChainStepOutput(i, line, type) {
  const el=document.getElementById('monitor-out-'+i);
  if(!el||!line) return;
  const d=document.createElement('div');
  d.className=type==='stderr'?'t-stderr':'';
  d.textContent=line;
  el.appendChild(d);
  el.scrollTop=el.scrollHeight;
  el.classList.add('visible');
}

function updateChainProgress(done, total) {
  const pct=total>0?Math.round((done/total)*100):0;
  document.getElementById('chain-progress-fill').style.width=pct+'%';
  document.getElementById('chain-progress-text').textContent=`${done} / ${total}`;
}

function chainMonitorDone(success) {
  const s=document.getElementById('chain-monitor-status');
  s.textContent=success?'✔ Fertig':'✘ Fehler';
  s.className='terminal-status '+(success?'ok':'err');
  document.getElementById('chain-monitor-close').disabled=false;
  document.getElementById('chain-monitor-close2').disabled=false;
}

function closeChainMonitor() {
  document.getElementById('chain-monitor-overlay').classList.remove('open');
  chainMonitorCleanup.forEach(fn=>fn());
  chainMonitorCleanup=[];
}

function copyChainOutput() {
  const lines=[...document.querySelectorAll('.monitor-step-output div')].map(d=>d.textContent).join('\n');
  navigator.clipboard.writeText(lines).then(()=>showToast('📋 Kopiert','ok'));
}

