'use strict';

function formatPauseSek(sek) {
  sek = parseInt(sek) || 0;
  if (sek === 0)    return '0s';
  if (sek < 60)     return sek + 's';
  const m = Math.floor(sek / 60);
  const s = sek % 60;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
}

function showToast(msg,type='info'){const c=document.getElementById('toasts');const t=document.createElement('div');t.className=`toast ${type}`;t.innerHTML=`<span>${type==='ok'?'✔':type==='err'?'✘':'ℹ'}</span><span>${msg}</span>`;c.appendChild(t);setTimeout(()=>t.remove(),3500);}
function escHtml(str){if(!str)return'';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function now(){return new Date().toLocaleTimeString('de-DE');}
