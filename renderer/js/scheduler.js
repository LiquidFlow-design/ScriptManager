'use strict';

// ── SCHEDULER ────────────────────────────────────────────────────────────────
async function loadSchedules() {
  const schedules=await window.api.schedules.getAll();
  const el=document.getElementById('schedule-list');
  if(!schedules.length){ el.innerHTML='<div class="empty-state"><div class="icon">🕐</div><p>Noch keine geplanten Ausführungen.</p></div>'; return; }
  el.innerHTML=schedules.map(s=>`
    <div class="schedule-row">
      <div>
        <div style="font-weight:700;font-size:13px">${escHtml(s.name)}</div>
        <div style="font-size:11px;color:var(--muted)">${s.target_typ==='chain'?'🔗':'📜'} ${escHtml(getTargetName(s.target_id,s.target_typ))}</div>
      </div>
      <span class="sched-badge ${s.typ}">${s.typ}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)">${formatSchedTime(s)}</span>
      <span style="font-size:11px;color:var(--muted)">${s.letzter_lauf?s.letzter_lauf.slice(0,16):'–'}</span>
      <div style="display:flex;gap:6px">
        <button class="icon-btn edit-btn" onclick="openScheduleModal(${s.id})" title="Bearbeiten">✏️</button>
        <button class="icon-btn del-btn"  onclick="deleteSchedule(${s.id})" title="Löschen">🗑</button>
      </div>
    </div>`).join('');
}

function getTargetName(id,typ) {
  if(typ==='chain'){ const c=chains.find(x=>x.id===id); return c?c.name:'–'; }
  const s=scripts.find(x=>x.id===id); return s?s.name:'–';
}

function formatSchedTime(s) {
  if(s.typ==='einmalig') return s.einmalig_am?s.einmalig_am.slice(0,16):'–';
  if(s.typ==='taeglich') return s.cron||'–';
  if(s.typ==='woechentlich'){ const [day,time]=(s.cron||'').split(' '); const days=['So','Mo','Di','Mi','Do','Fr','Sa']; return `${days[parseInt(day)]||'?'} ${time||''}`; }
  return '–';
}

async function openScheduleModal(id) {
  document.getElementById('sched-modal-id').value='';
  document.getElementById('sched-name').value='';
  document.getElementById('sched-typ').value='einmalig';
  document.getElementById('sched-target-typ').value='script';
  updateSchedTargetList();
  updateSchedForm();

  if(id){
    const s=await window.api.schedules.getById(id);
    if(s){
      document.getElementById('sched-modal-id').value=s.id;
      document.getElementById('sched-name').value=s.name;
      document.getElementById('sched-typ').value=s.typ;
      document.getElementById('sched-target-typ').value=s.target_typ||'script';
      updateSchedTargetList();
      document.getElementById('sched-target-id').value=s.target_id;
      updateSchedForm();
      if(s.typ==='einmalig') document.getElementById('sched-einmalig-am').value=s.einmalig_am||'';
      if(s.typ==='taeglich') document.getElementById('sched-taeglich-time').value=s.cron||'';
      if(s.typ==='woechentlich'){ const [d,t]=(s.cron||'').split(' '); document.getElementById('sched-wochentag').value=d||'1'; document.getElementById('sched-woech-time').value=t||''; }
    }
    document.getElementById('schedule-modal-title').textContent='Zeitplan bearbeiten';
  } else {
    document.getElementById('schedule-modal-title').textContent='Ausführung planen';
  }
  document.getElementById('modal-schedule').classList.add('open');
}

function closeScheduleModal() { document.getElementById('modal-schedule').classList.remove('open'); }

function updateSchedTargetList() {
  const typ=document.getElementById('sched-target-typ').value;
  const sel=document.getElementById('sched-target-id');
  if(typ==='chain'){ sel.innerHTML=chains.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join(''); }
  else { sel.innerHTML=scripts.map(s=>`<option value="${s.id}">${escHtml(s.name)}</option>`).join(''); }
}

function updateSchedForm() {
  const typ=document.getElementById('sched-typ').value;
  document.getElementById('sched-field-einmalig').style.display    =typ==='einmalig'?'':'none';
  document.getElementById('sched-field-taeglich').style.display    =typ==='taeglich'?'':'none';
  document.getElementById('sched-field-woechentlich').style.display=typ==='woechentlich'?'':'none';
}

async function saveSchedule() {
  const id   =document.getElementById('sched-modal-id').value;
  const name =document.getElementById('sched-name').value.trim();
  const typ  =document.getElementById('sched-typ').value;
  const targetId  =parseInt(document.getElementById('sched-target-id').value);
  const targetTyp =document.getElementById('sched-target-typ').value;
  if(!name||!targetId){ showToast('Name und Ziel sind Pflichtfelder','err'); return; }

  let cron=null, einmaligAm=null, naechster=null;
  if(typ==='einmalig'){ einmaligAm=document.getElementById('sched-einmalig-am').value; naechster=einmaligAm; }
  if(typ==='taeglich'){ cron=document.getElementById('sched-taeglich-time').value; }
  if(typ==='woechentlich'){ const d=document.getElementById('sched-wochentag').value; const t=document.getElementById('sched-woech-time').value; cron=`${d} ${t}`; }

  const data={name,typ,target_id:targetId,target_typ:targetTyp,cron,einmalig_am:einmaligAm,naechster_lauf:naechster};
  if(id){ await window.api.schedules.update({...data,id:parseInt(id),aktiv:1}); }
  else   { await window.api.schedules.add(data); }
  showToast(id?'✔ Zeitplan aktualisiert':'✔ Zeitplan erstellt','ok');
  closeScheduleModal();
  await loadSchedules();
}

async function deleteSchedule(id) {
  if(!confirm('Zeitplan löschen?')) return;
  await window.api.schedules.delete(id);
  showToast('🗑 Zeitplan gelöscht','ok');
  await loadSchedules();
}

