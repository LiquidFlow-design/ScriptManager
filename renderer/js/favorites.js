'use strict';

// ── FAVORITEN ────────────────────────────────────────────────────────────────
async function loadFavorites() {
  const favs = await window.api.scripts.getFavorites();
  const el   = document.getElementById('fav-list');
  if(!favs.length){ el.innerHTML='<div class="empty-state"><div class="icon">⭐</div><p>Noch keine Favoriten. Klicke den ☆-Button in der Script-Liste.</p></div>'; return; }
  el.innerHTML = favs.map(s=>`
    <div class="script-row" onclick="selectScript(${s.id});showPage('scripts')">
      <span class="row-status ${s.aktiviert?'on':'off'}"></span>
      <div><div class="row-name">${escHtml(s.name)}</div><div class="row-desc">${escHtml(s.beschreibung||'')}</div></div>
      <span class="cat-badge">${escHtml(s.kategorie)}</span>
      <span style="font-size:12px;color:var(--muted)">${escHtml(s.autor||'–')}</span>
      <span class="row-time">${s.letztes_ausfuehren?s.letztes_ausfuehren.slice(0,16):'–'}</span>
      <div class="row-actions">
        <button class="fav-btn" title="Favorit entfernen" onclick="event.stopPropagation();toggleFav(${s.id})" style="font-size:16px">⭐</button>
        <button class="icon-btn run-btn" title="Ausführen" onclick="event.stopPropagation();runScript(${s.id})">▶</button>
      </div>
    </div>`).join('');
}

async function toggleFav(id) {
  const r = await window.api.scripts.toggleFav(id);
  await loadScripts();
  await loadFavorites();
  showToast(r.favorit ? '⭐ Als Favorit markiert' : '☆ Favorit entfernt', 'info');
}

