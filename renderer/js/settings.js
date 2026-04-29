'use strict';

// ── FONT SYSTEM ──────────────────────────────────────────────────────────────
function applyFont(name, save=true) {
  document.documentElement.style.setProperty('--font-ui', `'${name}'`);
  document.querySelectorAll('.font-card').forEach(c => c.classList.toggle('active', c.dataset.font === name));
  document.querySelectorAll('.font-check').forEach(c => c.textContent = '');
  const check = document.getElementById('fc-' + name);
  if (check) check.textContent = '✔';
  if (save) try { localStorage.setItem('psm_font', name); } catch(_) {}
}

function loadSavedFont() {
  try {
    const saved = localStorage.getItem('psm_font');
    if (saved) {
      // Prüfen ob es eine custom Schrift ist
      const customFonts = JSON.parse(localStorage.getItem('psm_custom_fonts') || '[]');
      const isCustom = customFonts.some(f => f.name === saved);
      if (isCustom) {
        // Erst @font-face injizieren, dann anwenden
        const fontData = customFonts.find(f => f.name === saved);
        if (fontData) injectFontFace(fontData.name, fontData.dataUrl, fontData.format);
      }
      applyFont(saved, false);
      renderCustomFontList();
    }
  } catch(_) {}
}

// ── Custom Font Import ────────────────────────────────────────────────────────
function fontDragOver(e) {
  e.preventDefault();
  document.getElementById('font-drop-zone')?.classList.add('drop-zone-active');
}
function fontDragLeave(e) {
  document.getElementById('font-drop-zone')?.classList.remove('drop-zone-active');
}
function fontDrop(e) {
  e.preventDefault();
  document.getElementById('font-drop-zone')?.classList.remove('drop-zone-active');
  const files = [...e.dataTransfer.files].filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f.name));
  if (files.length) importFontFiles(files);
}

function importFontFiles(files) {
  if (!files || !files.length) return;
  const fileArr = Array.isArray(files) ? files : [...files];
  let done = 0;
  fileArr.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl  = e.target.result;
      const ext      = file.name.split('.').pop().toLowerCase();
      const fontName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 _-]/g,'');
      const format   = ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext;

      // @font-face in DOM injizieren
      injectFontFace(fontName, dataUrl, format);

      // In localStorage speichern
      try {
        const fonts = JSON.parse(localStorage.getItem('psm_custom_fonts') || '[]');
        if (!fonts.find(f => f.name === fontName)) {
          fonts.push({ name: fontName, dataUrl, format, file: file.name });
          localStorage.setItem('psm_custom_fonts', JSON.stringify(fonts));
        }
      } catch(err) { showToast('✘ Schrift zu groß für Speicher: ' + file.name, 'err'); }

      done++;
      if (done === fileArr.length) {
        renderCustomFontList();
        // Automatisch erste importierte Schrift anwenden
        applyFont(fontName);
        showToast(`✔ ${done} Schrift(en) importiert`, 'ok');
      }
    };
    reader.readAsDataURL(file);
  });
}

function injectFontFace(name, dataUrl, format) {
  const styleId = 'ff-' + name.replace(/\s/g,'-');
  if (document.getElementById(styleId)) return; // bereits injiziert
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `@font-face { font-family: '${name}'; src: url('${dataUrl}') format('${format}'); font-weight: normal; font-style: normal; }`;
  document.head.appendChild(style);
}

function renderCustomFontList() {
  const container = document.getElementById('custom-font-list');
  if (!container) return;
  try {
    const fonts = JSON.parse(localStorage.getItem('psm_custom_fonts') || '[]');
    if (!fonts.length) { container.innerHTML = ''; return; }
    const currentFont = localStorage.getItem('psm_font') || 'Syne';
    container.innerHTML = fonts.map(f => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1px solid ${currentFont===f.name?'var(--accent1)':'var(--border)'};border-radius:9px">
        <div style="font-family:'${f.name}',sans-serif;font-size:18px;font-weight:700;flex-shrink:0">Ag</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:'${f.name}',sans-serif;font-size:13px;font-weight:700">${f.name}</div>
          <div style="font-size:10px;color:var(--muted)">${f.file} · Eigene Schrift</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="applyFont('${f.name}')" style="${currentFont===f.name?'border-color:var(--accent1);color:var(--accent1)':''}">
          ${currentFont===f.name?'✔ Aktiv':'Verwenden'}
        </button>
        <button class="icon-btn del-btn" onclick="removeCustomFont('${f.name}')" title="Schrift entfernen" style="color:var(--muted)">🗑</button>
      </div>`).join('');
  } catch(_) {}
}

function removeCustomFont(name) {
  try {
    let fonts = JSON.parse(localStorage.getItem('psm_custom_fonts') || '[]');
    fonts = fonts.filter(f => f.name !== name);
    localStorage.setItem('psm_custom_fonts', JSON.stringify(fonts));
    // Style-Element entfernen
    const el = document.getElementById('ff-' + name.replace(/\s/g,'-'));
    if (el) el.remove();
    // Falls aktuell aktiv → zu Syne wechseln
    if (localStorage.getItem('psm_font') === name) applyFont('Syne');
    renderCustomFontList();
    showToast('🗑 Schrift entfernt', 'ok');
  } catch(_) {}
}

// ── LOGO SYSTEM ───────────────────────────────────────────────────────────────
let logoMode = 'emoji';   // 'emoji' | 'image'
let pendingLogoDataUrl = null;  // geladene aber noch nicht gespeicherte Bild-URL

function setLogoType(type) {
  logoMode = type;
  document.getElementById('logo-emoji-section').style.display = type === 'emoji' ? '' : 'none';
  document.getElementById('logo-image-section').style.display = type === 'image' ? '' : 'none';
  // Toggle-Button Styles
  const btnEmoji = document.getElementById('logo-type-emoji');
  const btnImage = document.getElementById('logo-type-image');
  if (btnEmoji) {
    btnEmoji.style.borderColor  = type==='emoji' ? 'var(--accent1)' : 'var(--border)';
    btnEmoji.style.background   = type==='emoji' ? 'rgba(124,106,247,.2)' : 'var(--card)';
    btnEmoji.style.color        = type==='emoji' ? 'var(--accent1)' : 'var(--muted)';
  }
  if (btnImage) {
    btnImage.style.borderColor  = type==='image' ? 'var(--accent1)' : 'var(--border)';
    btnImage.style.background   = type==='image' ? 'rgba(124,106,247,.2)' : 'var(--card)';
    btnImage.style.color        = type==='image' ? 'var(--accent1)' : 'var(--muted)';
  }
}

function previewLogo() {
  const text = document.getElementById('logo-text-input')?.value || 'ScriptMgr';
  const prev = document.getElementById('logo-preview-text');
  if (prev) prev.textContent = text;
  if (logoMode === 'emoji') {
    const icon  = document.getElementById('logo-icon-input')?.value || '⚡';
    const prevBox = document.getElementById('logo-preview-box');
    if (prevBox) {
      prevBox.style.background = 'linear-gradient(135deg,var(--accent1),var(--accent2))';
      prevBox.innerHTML = icon;
    }
  }
}

function setLogoEmoji(emoji) {
  const inp = document.getElementById('logo-icon-input');
  if (inp) { inp.value = emoji; previewLogo(); }
}

// ── Bild-Drag & Drop ─────────────────────────────────────────────────────────
function logoDragOver(e) {
  e.preventDefault();
  document.getElementById('logo-drop-zone')?.classList.add('drop-zone-active');
}
function logoDragLeave(e) {
  document.getElementById('logo-drop-zone')?.classList.remove('drop-zone-active');
}
function logoDrop(e) {
  e.preventDefault();
  document.getElementById('logo-drop-zone')?.classList.remove('drop-zone-active');
  const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
  if (file) importLogoFile(file);
}

function importLogoFile(file) {
  if (!file) return;
  const maxMB = 2;
  if (file.size > maxMB * 1024 * 1024) {
    showToast(`✘ Bild zu groß (max. ${maxMB} MB)`, 'err');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingLogoDataUrl = e.target.result;
    // Vorschau im Drop-Zone zeigen
    const img   = document.getElementById('logo-drop-img');
    const hint  = document.getElementById('logo-drop-hint');
    const prev  = document.getElementById('logo-drop-preview');
    const prevBox = document.getElementById('logo-preview-box');
    if (img)  img.src = pendingLogoDataUrl;
    if (hint) hint.style.display = 'none';
    if (prev) prev.style.display = '';
    // Sidebar-Vorschau aktualisieren
    if (prevBox) {
      prevBox.style.background = 'transparent';
      prevBox.style.border     = '1px solid var(--border)';
      prevBox.innerHTML        = `<img src="${pendingLogoDataUrl}" style="width:100%;height:100%;object-fit:contain;border-radius:10px">`;
    }
    const status = document.getElementById('logo-img-status');
    if (status) status.textContent = `✔ ${file.name} geladen — klicke "Logo übernehmen"`;
  };
  reader.readAsDataURL(file);
}

function applyLogoImage() {
  if (!pendingLogoDataUrl) { showToast('Bitte zuerst ein Bild auswählen', 'err'); return; }
  // In Sidebar anwenden
  const logoIcon = document.getElementById('logo-icon');
  if (logoIcon) {
    logoIcon.style.background = 'transparent';
    logoIcon.style.border     = '1px solid var(--border)';
    logoIcon.innerHTML        = `<img src="${pendingLogoDataUrl}" style="width:100%;height:100%;object-fit:contain;border-radius:10px">`;
  }
  // Speichern
  try {
    localStorage.setItem('psm_logo_type', 'image');
    localStorage.setItem('psm_logo_image', pendingLogoDataUrl);
    showToast('✔ Logo gespeichert', 'ok');
  } catch(e) {
    showToast('✘ Bild zu groß für localStorage — bitte kleineres Bild verwenden', 'err');
  }
}

function clearLogoImage() {
  pendingLogoDataUrl = null;
  try {
    localStorage.removeItem('psm_logo_image');
    localStorage.setItem('psm_logo_type', 'emoji');
  } catch(_) {}
  // Drop-Zone zurücksetzen
  const img  = document.getElementById('logo-drop-img');
  const hint = document.getElementById('logo-drop-hint');
  const prev = document.getElementById('logo-drop-preview');
  if (img)  img.src = '';
  if (hint) hint.style.display = '';
  if (prev) prev.style.display = 'none';
  const status = document.getElementById('logo-img-status');
  if (status) status.textContent = '';
  // Zurück zu Emoji
  const saved = localStorage.getItem('psm_logo_icon') || '⚡';
  const logoIcon = document.getElementById('logo-icon');
  if (logoIcon) {
    logoIcon.style.background = 'linear-gradient(135deg,var(--accent1),var(--accent2))';
    logoIcon.style.border     = 'none';
    logoIcon.innerHTML        = saved;
  }
  showToast('🗑 Logo-Bild entfernt', 'ok');
}

function saveLogo() {
  const text = document.getElementById('logo-text-input')?.value || 'ScriptMgr';
  const logoText = document.getElementById('logo-text');
  if (logoText) logoText.textContent = text;
  try { localStorage.setItem('psm_logo_text', text); } catch(_) {}

  if (logoMode === 'emoji') {
    const icon     = document.getElementById('logo-icon-input')?.value || '⚡';
    const logoIcon = document.getElementById('logo-icon');
    if (logoIcon) {
      logoIcon.style.background = 'linear-gradient(135deg,var(--accent1),var(--accent2))';
      logoIcon.style.border     = 'none';
      logoIcon.innerHTML        = icon;
    }
    try { localStorage.setItem('psm_logo_icon', icon); localStorage.setItem('psm_logo_type','emoji'); } catch(_) {}
  }
  showToast('✔ Logo gespeichert', 'ok');
}

function resetLogo() {
  clearLogoImage();
  document.getElementById('logo-icon-input').value = '⚡';
  document.getElementById('logo-text-input').value = 'ScriptMgr';
  previewLogo();
  saveLogo();
  showToast('↺ Logo zurückgesetzt', 'ok');
}

// Standard-Logo (eingebettet als Base64)
const DEFAULT_LOGO_DATAURL = 'data:image/png;base64,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';

function loadSavedLogo() {
  try {
    const type  = localStorage.getItem('psm_logo_type')  || 'image';
    const text  = localStorage.getItem('psm_logo_text')  || 'ScriptMgr';
    const icon  = localStorage.getItem('psm_logo_icon')  || '⚡';
    // Kein gespeichertes Bild → Default-Logo verwenden
    const image = localStorage.getItem('psm_logo_image') || DEFAULT_LOGO_DATAURL;

    // Text
    const logoText = document.getElementById('logo-text');
    const textInp  = document.getElementById('logo-text-input');
    if (logoText) logoText.textContent  = text;
    if (textInp)  textInp.value         = text;

    const logoIcon = document.getElementById('logo-icon');
    if (type === 'image' && image) {
      // Bild-Logo
      if (logoIcon) {
        logoIcon.style.background = 'transparent';
        logoIcon.style.border     = '1px solid var(--border)';
        logoIcon.innerHTML        = `<img src="${image}" style="width:100%;height:100%;object-fit:contain;border-radius:10px">`;
      }
      // Settings-Sektion vorbereiten
      pendingLogoDataUrl = image;
      logoMode = 'image';
      const imgEl  = document.getElementById('logo-drop-img');
      const hint   = document.getElementById('logo-drop-hint');
      const prevEl = document.getElementById('logo-drop-preview');
      const prevBox= document.getElementById('logo-preview-box');
      if (imgEl)  imgEl.src = image;
      if (hint)   hint.style.display  = 'none';
      if (prevEl) prevEl.style.display = '';
      if (prevBox) {
        prevBox.style.background = 'transparent';
        prevBox.style.border     = '1px solid var(--border)';
        prevBox.innerHTML = `<img src="${image}" style="width:100%;height:100%;object-fit:contain;border-radius:10px">`;
      }
    } else {
      // Emoji-Logo
      if (logoIcon) {
        logoIcon.style.background = 'linear-gradient(135deg,var(--accent1),var(--accent2))';
        logoIcon.style.border     = 'none';
        logoIcon.innerHTML        = icon;
      }
      const iconInp  = document.getElementById('logo-icon-input');
      const prevBox  = document.getElementById('logo-preview-box');
      if (iconInp) iconInp.value    = icon;
      if (prevBox) { prevBox.style.background='linear-gradient(135deg,var(--accent1),var(--accent2))'; prevBox.innerHTML=icon; }
    }
  } catch(_) {}
}

// ── CUSTOM CSS ────────────────────────────────────────────────────────────────

// CSS-Template als eingebetteter String (wird beim Download als Datei geliefert)
const CSS_TEMPLATE = `/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║          PS SCRIPT MANAGER — CSS CUSTOMIZATION TEMPLATE                 ║
 * ║          Für den "Eigenes CSS"-Editor in den Einstellungen               ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  VERWENDUNG                                                              ║
 * ║  1. Einstellungen → 💻 Eigenes CSS                                       ║
 * ║  2. Gewünschte Abschnitte kopieren und Werte anpassen                    ║
 * ║  3. "▶ Anwenden & Speichern" klicken                                     ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  HINWEISE                                                                ║
 * ║  • Eigenes CSS überschreibt alle Theme-Einstellungen                     ║
 * ║  • CSS-Variablen aus :root sind überall verwendbar                       ║
 * ║  • Änderungen sind sofort sichtbar (Live-Vorschau)                       ║
 * ║  • Wird in localStorage gespeichert — überlebt App-Neustarts             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */


/* ══════════════════════════════════════════════════════════════════════════
   1. CSS-VARIABLEN (Farben, Schrift, Radius)
   ══════════════════════════════════════════════════════════════════════════
   Alle Variablen die im gesamten UI verwendet werden.
   Änderungen hier wirken auf ALLE Elemente gleichzeitig.
   ────────────────────────────────────────────────────────────────────────── */
:root {

  /* ── Hintergründe (von dunkel nach hell gestaffelt) ─────────────────── */
  --bg:       #0d0d14;   /* Haupt-Hintergrund (hinter allem) */
  --surface:  #13131f;   /* Sidebar, Topbar, Modal-Header */
  --card:     #181828;   /* Karten, Panels, Script-Zeilen */
  --border:   #252540;   /* Alle Trennlinien und Rahmen */

  /* ── Akzentfarben ───────────────────────────────────────────────────── */
  --accent1:  #7c6af7;   /* Primär: aktive Nav, Buttons, Badges, Slider */
  --accent2:  #c084fc;   /* Sekundär: Gradient-Endfarbe, Logo */
  --accent3:  #38bdf8;   /* Info: Terminal-Titel, Code-Pfade, Links */

  /* ── Status-Farben ──────────────────────────────────────────────────── */
  --green:    #34d399;   /* Erfolg, aktiver Status-Punkt */
  --red:      #f87171;   /* Fehler, Löschen, stderr */
  --yellow:   #fbbf24;   /* Warnung, laufender Prozess */

  /* ── Text ───────────────────────────────────────────────────────────── */
  --text:     #e2e8f0;   /* Haupt-Text */
  --muted:    #64748b;   /* Sekundär-Text, Labels, Platzhalter */

  /* ── Layout ─────────────────────────────────────────────────────────── */
  --radius:   14px;      /* Eckenrundung für Karten, Buttons, Modals */
  --font-ui:  'Syne';    /* UI-Schriftart (überschreibt Font-Auswahl) */
}


/* ══════════════════════════════════════════════════════════════════════════
   2. EIGENE THEMES
   ══════════════════════════════════════════════════════════════════════════
   Vollständige Theme-Definitionen zum Kopieren und Anpassen.
   Einfach umbenennen (z.B. "custom") und in :root aktivieren — oder
   direkt die :root-Variablen oben überschreiben.
   ────────────────────────────────────────────────────────────────────────── */

/* ── Beispiel: Eigenes "Neon Cyberpunk" Theme ───────────────────────────── */
/*
:root {
  --font-ui:  'Space Grotesk';
  --bg:       #020206;
  --surface:  #080812;
  --card:     #0d0d1e;
  --border:   #1a1a3a;
  --accent1:  #00f5ff;
  --accent2:  #bf00ff;
  --accent3:  #00ff88;
  --green:    #00ff88;
  --red:      #ff003c;
  --yellow:   #ffff00;
  --text:     #e8f4ff;
  --muted:    #4a5a8a;
  --radius:   4px;
}
*/

/* ── Beispiel: "Warm Coffee" Theme ─────────────────────────────────────── */
/*
:root {
  --font-ui:  'Nunito';
  --bg:       #12090a;
  --surface:  #1c1010;
  --card:     #221515;
  --border:   #352020;
  --accent1:  #d97706;
  --accent2:  #f59e0b;
  --accent3:  #fcd34d;
  --green:    #34d399;
  --red:      #f87171;
  --yellow:   #fbbf24;
  --text:     #fef3c7;
  --muted:    #8a7060;
  --radius:   8px;
}
*/

/* ── Beispiel: "Minimal Slate" Hell-Theme ───────────────────────────────── */
/*
:root {
  --font-ui:  'Inter';
  --bg:       #f8fafc;
  --surface:  #ffffff;
  --card:     #f1f5f9;
  --border:   #e2e8f0;
  --accent1:  #6366f1;
  --accent2:  #8b5cf6;
  --accent3:  #0ea5e9;
  --green:    #16a34a;
  --red:      #dc2626;
  --yellow:   #d97706;
  --text:     #0f172a;
  --muted:    #64748b;
  --radius:   8px;
}
body::before { display: none; }
.topbar { background: rgba(248,250,252,.95); }
*/


/* ══════════════════════════════════════════════════════════════════════════
   3. LAYOUT-ANPASSUNGEN
   ══════════════════════════════════════════════════════════════════════════ */

/* Sidebar breiter/schmaler */
/*
.sidebar { width: 260px; }
*/

/* Sidebar ohne Hintergrund-Trennung (nahtlos mit Hintergrund) */
/*
.sidebar { border-right: none; background: var(--bg); }
*/

/* Kompaktere Abstände in der Nav */
/*
.nav-item { padding: 7px 10px; font-size: 12px; }
.nav-section { padding: 8px 8px 2px; }
*/

/* Titelleiste höher */
/*
.titlebar { height: 46px; }
*/

/* Topbar höher mit mehr Padding */
/*
.topbar { height: 68px; padding: 0 32px; }
*/

/* Content-Bereich mit mehr Innenabstand */
/*
.content { padding: 32px 36px; gap: 24px; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   4. SIDEBAR & NAVIGATION
   ══════════════════════════════════════════════════════════════════════════ */

/* Aktiver Nav-Eintrag: linke Markierungslinie statt Hintergrund */
/*
.nav-item.active {
  background: transparent;
  border-left: 3px solid var(--accent1);
  border-radius: 0 9px 9px 0;
  padding-left: 9px;
}
*/

/* Nav-Einträge beim Hover mit Slide-Effekt */
/*
.nav-item { transition: all .15s ease; }
.nav-item:hover { padding-left: 16px; }
.nav-item.active { padding-left: 16px; }
*/

/* Logo-Bereich: eigene Hintergrundfarbe */
/*
.logo { background: rgba(124,106,247,.08); margin: 0 12px 12px; border-radius: var(--radius); padding: 14px 12px; border-bottom: none; }
*/

/* Sidebar-Footer ausblenden */
/*
.sidebar-footer { display: none; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   5. BUTTONS
   ══════════════════════════════════════════════════════════════════════════ */

/* Buttons ganz eckig (kein Radius) */
/*
.btn { border-radius: 0; }
*/

/* Primär-Button: anderer Farbverlauf */
/*
.btn-primary {
  background: linear-gradient(135deg, var(--accent1), var(--accent3));
}
*/

/* Primär-Button: flaches Design ohne Gradient */
/*
.btn-primary {
  background: var(--accent1);
  box-shadow: none;
}
.btn-primary:hover {
  background: var(--accent2);
  transform: none;
  box-shadow: none;
}
*/

/* Ghost-Buttons mit rundem Rand */
/*
.btn-ghost { border-radius: 20px; }
*/

/* Größere Buttons */
/*
.btn { padding: 10px 20px; font-size: 14px; }
.btn-sm { padding: 7px 14px; font-size: 12px; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   6. KARTEN & PANELS
   ══════════════════════════════════════════════════════════════════════════ */

/* Stat-Karten: farbige Akzent-Linie oben ausblenden */
/*
.stat-card::before { display: none; }
*/

/* Stat-Karten: eigene Akzent-Linie links statt oben */
/*
.stat-card::before {
  width: 3px; height: 100%;
  top: 0; left: 0; right: auto;
  background: var(--accent1);
}
*/

/* Panel-Header mit leichtem Gradient */
/*
.panel-header {
  background: linear-gradient(to right, rgba(124,106,247,.06), transparent);
}
*/

/* Panels ohne Border, nur Schatten */
/*
.panel {
  border: none;
  box-shadow: 0 4px 24px rgba(0,0,0,.3);
}
*/

/* Script-Zeilen: kompakter */
/*
.script-row { padding: 9px 16px; }
*/

/* Script-Zeilen: beim Hover mit linker Akzentlinie */
/*
.script-row:hover { border-left: 3px solid var(--accent1); padding-left: 17px; }
.script-row.selected { border-left: 3px solid var(--accent1); }
*/


/* ══════════════════════════════════════════════════════════════════════════
   7. MODALS & OVERLAYS
   ══════════════════════════════════════════════════════════════════════════ */

/* Modal mit stärkerem Blur */
/*
.modal-overlay { backdrop-filter: blur(12px); }
*/

/* Modal mit Glassmorphism-Effekt */
/*
.modal {
  background: rgba(24,24,40,.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(124,106,247,.2);
}
*/

/* Modal-Titel farbig */
/*
.modal-title { color: var(--accent1); }
*/

/* Breitere Modals */
/*
.modal { width: 600px; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   8. TERMINAL
   ══════════════════════════════════════════════════════════════════════════ */

/* Terminal-Schriftgröße anpassen */
/*
.terminal-body { font-size: 13px; line-height: 1.8; }
*/

/* Terminal-Hintergrund heller */
/*
.terminal-window { background: #0f0f1a; }
.terminal-body { color: #d4d4d4; }
*/

/* Terminal-Prompt-Farbe */
/*
.terminal-prompt { color: var(--green); }
*/

/* Terminal größer */
/*
.terminal-window { width: 960px; height: 640px; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   9. KATEGORIE-BADGES & STATUS-INDIKATOREN
   ══════════════════════════════════════════════════════════════════════════ */

/* Eckige statt runde Badges */
/*
.cat-badge { border-radius: 4px; }
.nav-badge { border-radius: 4px; }
*/

/* Größere Kategorie-Badges */
/*
.cat-badge { font-size: 12px; padding: 4px 12px; }
*/

/* Status-Punkt pulsierend (aktive Scripts) */
/*
.row-status.on {
  animation: pulse-dot 2s ease infinite;
}
@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,.6); }
  50%       { box-shadow: 0 0 0 4px rgba(52,211,153,0); }
}
*/


/* ══════════════════════════════════════════════════════════════════════════
   10. SCROLL-LEISTEN
   ══════════════════════════════════════════════════════════════════════════ */

/* Dünnere Scrollbar */
/*
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent1); }
*/

/* Scrollbar ausblenden */
/*
::-webkit-scrollbar { display: none; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   11. HINTERGRUND-EFFEKTE
   ══════════════════════════════════════════════════════════════════════════ */

/* Ambient-Glow ausblenden (für saubereres Look) */
/*
body::before { display: none; }
*/

/* Eigener Hintergrund-Effekt (Noise-Texture aus CSS) */
/*
body::after {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  opacity: .03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px;
}
*/

/* Topbar: Glassmorphism ohne Blur für bessere Performance */
/*
.topbar { backdrop-filter: none; background: rgba(13,13,20,.95); }
*/


/* ══════════════════════════════════════════════════════════════════════════
   12. TYPOGRAFIE
   ══════════════════════════════════════════════════════════════════════════ */

/* Monospace-Schrift auch für UI (Tech-Look) */
/*
:root { --font-ui: 'JetBrains Mono'; }
body { letter-spacing: -0.3px; }
*/

/* Größere Basis-Schriftgröße */
/*
body { font-size: 14px; }
.nav-item { font-size: 14px; }
.btn { font-size: 14px; }
*/

/* Panel-Titel farbig */
/*
.panel-title { color: var(--accent1); }
.topbar-title { color: var(--text); }
.topbar-title span { color: var(--accent2); }
*/


/* ══════════════════════════════════════════════════════════════════════════
   13. CHAIN-MONITOR & FORTSCHRITTSBALKEN
   ══════════════════════════════════════════════════════════════════════════ */

/* Fortschrittsbalken: rund statt abgeschnitten */
/*
#chain-progress-fill { border-radius: 3px; }
*/

/* Monitor-Schritt: kompakter */
/*
.monitor-step { padding: 8px 0; }
.monitor-step-name { font-size: 12px; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   14. FORMULARE & EINGABEFELDER
   ══════════════════════════════════════════════════════════════════════════ */

/* Eingabefelder: anderer Fokus-Stil */
/*
.form-input:focus {
  border-color: var(--accent1);
  box-shadow: 0 0 0 3px rgba(124,106,247,.15);
}
*/

/* Dropdown-Pfeile ausblenden */
/*
select.form-input { -webkit-appearance: none; appearance: none; }
*/

/* Labels größer */
/*
.form-label { font-size: 12px; letter-spacing: 0.5px; }
*/


/* ══════════════════════════════════════════════════════════════════════════
   15. FERTIGES BEISPIEL-THEME: "Matrix"
   ══════════════════════════════════════════════════════════════════════════
   Einfach den Kommentar-Block entfernen zum Aktivieren.
   ────────────────────────────────────────────────────────────────────────── */
/*
:root {
  --font-ui:  'JetBrains Mono';
  --bg:       #000800;
  --surface:  #000d00;
  --card:     #001200;
  --border:   #003300;
  --accent1:  #00cc44;
  --accent2:  #00ff55;
  --accent3:  #66ff99;
  --green:    #00ff55;
  --red:      #ff3333;
  --yellow:   #ccff00;
  --text:     #ccffcc;
  --muted:    #336633;
  --radius:   2px;
}
body::before {
  background:
    radial-gradient(ellipse 60% 40% at 20% 10%, rgba(0,200,50,.08) 0%, transparent 60%),
    radial-gradient(ellipse 50% 50% at 80% 80%, rgba(0,255,80,.05) 0%, transparent 60%);
}
.nav-item.active {
  background: rgba(0,204,68,.15);
  color: var(--accent1);
  border-left: 2px solid var(--accent1);
  border-radius: 0 9px 9px 0;
}
.stat-card::before { background: var(--accent1); }
.btn-primary { background: transparent; border: 1px solid var(--accent1); color: var(--accent1); }
.btn-primary:hover { background: rgba(0,204,68,.15); box-shadow: 0 0 12px rgba(0,204,68,.3); }
*/
`;;

// Dark Geometric Theme (portiert von uiux-design.css)
const DARK_GEOMETRIC_THEME = `/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   PS SCRIPT MANAGER — THEME: "Dark Geometric"                           ║
 * ║   Portiert von uiux-design.css auf App-Selektoren                       ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  Originales Design: Sehr dunkles Türkis-Schwarz, sattes Grün,           ║
 * ║  geometrische Akzente, Bebas Neue / Inter Typografie                    ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  VERWENDUNG: Einstellungen → Eigenes CSS → Einfügen → Anwenden          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */


/* ══════════════════════════════════════════════════════════════════════════
   1. SCHRIFTART (Google Fonts via @font-face — CSP-konform)
   ══════════════════════════════════════════════════════════════════════════
   Bebas Neue für Headlines, Inter für UI — via Google Fonts Link im Head
   bereits geladen. Hier wird die Variable gesetzt.
   ────────────────────────────────────────────────────────────────────────── */
:root {
  --font-ui: 'Inter';
}


/* ══════════════════════════════════════════════════════════════════════════
   2. FARBEN & CSS-VARIABLEN
   ══════════════════════════════════════════════════════════════════════════
   Alle App-Variablen auf das Dark Geometric Farbschema gemappt.
   ────────────────────────────────────────────────────────────────────────── */
:root {
  /* Hintergründe — sehr dunkles Türkis-Schwarz */
  --bg:      #020d09;
  --surface: #041510;
  --card:    #071a10;
  --border:  rgba(255, 255, 255, 0.10);

  /* Akzentfarben — sattes Grün als Primär, Gelb als Highlight */
  --accent1: #3ab86a;
  --accent2: #2ea05a;
  --accent3: #86efac;

  /* Status */
  --green:   #3ab86a;
  --red:     #f87171;
  --yellow:  #e0eb4a;

  /* Text */
  --text:    #ffffff;
  --muted:   #8fb8a4;

  /* Radius — eckiger für den Geometric-Look */
  --radius:  6px;
}


/* ══════════════════════════════════════════════════════════════════════════
   3. HINTERGRUND — Großer zentraler Grün-Glow
   ══════════════════════════════════════════════════════════════════════════ */
body {
  background-color: #020d09;
  background-image:
    radial-gradient(ellipse 90% 80% at 65% 45%,
      rgba(15, 90, 55, 0.55) 0%,
      rgba(8, 55, 35, 0.25) 40%,
      transparent 70%),
    radial-gradient(ellipse 50% 45% at 5% 90%,
      rgba(5, 50, 28, 0.30) 0%,
      transparent 65%),
    linear-gradient(160deg, #020d09 0%, #041a0f 50%, #061e12 100%);
}

/* App-eigener Ambient-Glow: durch das neue Hintergrundbild ersetzen */
body::before {
  background: none;
}


/* ══════════════════════════════════════════════════════════════════════════
   4. TITELLEISTE
   ══════════════════════════════════════════════════════════════════════════ */
.titlebar {
  background: rgba(2, 13, 9, 0.90);
  border-bottom: 1px solid rgba(58, 184, 106, 0.08);
  backdrop-filter: blur(14px);
}

.titlebar-title {
  color: rgba(143, 184, 164, 0.7);
  letter-spacing: 0.08em;
}


/* ══════════════════════════════════════════════════════════════════════════
   5. SIDEBAR & NAVIGATION
   ══════════════════════════════════════════════════════════════════════════ */
.sidebar {
  background: rgba(4, 21, 16, 0.95);
  border-right: 1px solid rgba(58, 184, 106, 0.10);
}

.logo {
  border-bottom: 1px solid rgba(58, 184, 106, 0.10);
}

.logo-icon {
  background: linear-gradient(135deg, #3ab86a, #2a9a52);
  box-shadow: 0 0 14px rgba(58, 184, 106, 0.30);
}

.logo-text {
  font-family: 'Bebas Neue', var(--font-ui), sans-serif;
  font-size: 18px;
  letter-spacing: 0.1em;
}

/* Nav-Sektions-Label */
.nav-section {
  color: rgba(58, 184, 106, 0.45);
  letter-spacing: 0.15em;
}

/* Nav-Einträge */
.nav-item {
  color: #8fb8a4;
  border-radius: 999px;
  letter-spacing: 0.03em;
  transition: all 0.15s ease;
}

.nav-item:hover {
  background: rgba(58, 184, 106, 0.08);
  color: #ffffff;
  padding-left: 16px;
}

/* Aktiver Eintrag: Pill-Shape mit Grün */
.nav-item.active {
  background: rgba(58, 184, 106, 0.14);
  color: #3ab86a;
  border: 1px solid rgba(58, 184, 106, 0.25);
  border-radius: 999px;
}

/* Nav-Badge: Gelb statt Lila */
.nav-badge {
  background: #e0eb4a;
  color: #0a0a0a;
  border-radius: 999px;
  font-weight: 700;
}

/* Sidebar Footer */
.sidebar-footer {
  border-top: 1px solid rgba(58, 184, 106, 0.08);
  color: #3a5a4a;
}

.status-dot {
  background: #3ab86a;
  box-shadow: 0 0 8px rgba(58, 184, 106, 0.6);
}


/* ══════════════════════════════════════════════════════════════════════════
   6. TOPBAR
   ══════════════════════════════════════════════════════════════════════════ */
.topbar {
  background: rgba(2, 13, 9, 0.85);
  border-bottom: 1px solid rgba(58, 184, 106, 0.08);
  backdrop-filter: blur(14px);
}

.topbar-title {
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* "// Konfiguration" in Grün-Kursiv */
.topbar-title span {
  color: #3ab86a;
  font-style: italic;
  font-weight: 400;
}


/* ══════════════════════════════════════════════════════════════════════════
   7. BUTTONS
   ══════════════════════════════════════════════════════════════════════════ */

/* Primär-Button: Gelb (wie CTA im Original) */
.btn-primary {
  background: #e0eb4a;
  color: #0a0a0a;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 11px;
  box-shadow: 0 0 18px rgba(224, 235, 74, 0.35);
  border: none;
}

.btn-primary:hover {
  background: #e8ff50;
  color: #0a0a0a;
  transform: translateY(-1px);
  box-shadow: 0 0 26px rgba(224, 235, 74, 0.55);
}

/* Ghost-Button: Grün-Outline */
.btn-ghost {
  background: transparent;
  color: #3ab86a;
  border: 1px solid rgba(58, 184, 106, 0.40);
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.btn-ghost:hover {
  background: rgba(58, 184, 106, 0.10);
  border-color: #3ab86a;
  color: #3ab86a;
  box-shadow: 0 0 12px rgba(58, 184, 106, 0.20);
}

/* Danger-Button */
.btn-danger {
  background: rgba(248, 113, 113, 0.10);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 999px;
}

.btn-danger:hover {
  background: rgba(248, 113, 113, 0.20);
}

/* Grün-Button */
.btn-green {
  background: rgba(58, 184, 106, 0.12);
  color: #3ab86a;
  border: 1px solid rgba(58, 184, 106, 0.30);
  border-radius: 999px;
}

.btn-green:hover {
  background: rgba(58, 184, 106, 0.22);
  box-shadow: 0 0 12px rgba(58, 184, 106, 0.25);
}

/* Icon-Buttons */
.icon-btn:hover {
  background: rgba(58, 184, 106, 0.10);
}

.icon-btn.run-btn:hover  { background: rgba(58, 184, 106, 0.18); }
.icon-btn.del-btn:hover  { background: rgba(248, 113, 113, 0.18); }
.icon-btn.edit-btn:hover { background: rgba(58, 184, 106, 0.12); }


/* ══════════════════════════════════════════════════════════════════════════
   8. KARTEN & PANELS
   ══════════════════════════════════════════════════════════════════════════ */
.panel {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.panel-header {
  background: linear-gradient(to right, rgba(58, 184, 106, 0.06), transparent);
  border-bottom: 1px solid rgba(58, 184, 106, 0.08);
}

.panel-title { color: #3ab86a; }

/* Stat-Karten: Grüne Akzentlinie links */
.stat-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.stat-card::before {
  width: 3px;
  height: 100%;
  top: 0; left: 0; right: auto;
  background: linear-gradient(to bottom, #3ab86a, #2a9a52);
}

.stat-value { color: #ffffff; }

/* Script-Zeilen */
.script-row:hover {
  background: rgba(58, 184, 106, 0.04);
  border-left: 2px solid #3ab86a;
  padding-left: 18px;
  transition: all 0.12s ease;
}

.script-row.selected {
  background: rgba(58, 184, 106, 0.08);
  border-left: 2px solid #3ab86a;
  padding-left: 18px;
}

/* Kategorie-Badges: Grün statt Lila */
.cat-badge {
  background: rgba(58, 184, 106, 0.12);
  color: #3ab86a;
  border: 1px solid rgba(58, 184, 106, 0.20);
  border-radius: 999px;
}

/* Kategorie-Pills */
.pill.active {
  background: rgba(58, 184, 106, 0.15);
  border-color: #3ab86a;
  color: #3ab86a;
}

.pill:hover {
  border-color: #3ab86a;
  color: #3ab86a;
}


/* ══════════════════════════════════════════════════════════════════════════
   9. FORMULARE & EINGABEFELDER
   ══════════════════════════════════════════════════════════════════════════ */
.form-input {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.10);
}

.form-input:focus {
  border-color: #3ab86a;
  box-shadow: 0 0 0 3px rgba(58, 184, 106, 0.12);
}

.search-box {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.10);
}


/* ══════════════════════════════════════════════════════════════════════════
   10. MODALS
   ══════════════════════════════════════════════════════════════════════════ */
.modal {
  background: rgba(4, 21, 16, 0.92);
  border: 1px solid rgba(58, 184, 106, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.modal-overlay {
  backdrop-filter: blur(8px);
}

.modal-title { color: #3ab86a; }

.modal-header {
  border-bottom: 1px solid rgba(58, 184, 106, 0.10);
}

.modal-footer {
  border-top: 1px solid rgba(58, 184, 106, 0.10);
}


/* ══════════════════════════════════════════════════════════════════════════
   11. TERMINAL
   ══════════════════════════════════════════════════════════════════════════ */
.terminal-window {
  background: #010804;
  border: 1px solid rgba(58, 184, 106, 0.12);
}

.terminal-header {
  background: rgba(4, 21, 16, 0.95);
  border-bottom: 1px solid rgba(58, 184, 106, 0.10);
}

.terminal-title { color: #3ab86a; }
.terminal-body  { color: #a8d5b5; font-size: 12.5px; line-height: 1.75; }
.terminal-prompt { color: #e0eb4a; }

.terminal-input-row {
  background: rgba(2, 13, 9, 0.7);
  border-top: 1px solid rgba(58, 184, 106, 0.08);
}


/* ══════════════════════════════════════════════════════════════════════════
   12. EDITOR (Script-Code-Editor)
   ══════════════════════════════════════════════════════════════════════════ */
.editor-window {
  background: #041510;
  border: 1px solid rgba(58, 184, 106, 0.12);
}

.editor-header {
  background: rgba(4, 21, 16, 0.95);
  border-bottom: 1px solid rgba(58, 184, 106, 0.10);
}

.editor-title  { color: #3ab86a; }
.editor-textarea { background: #010804; color: #a8d5b5; }


/* ══════════════════════════════════════════════════════════════════════════
   13. STATUS-INDIKATOREN
   ══════════════════════════════════════════════════════════════════════════ */

/* Pulsierender Grün-Dot */
.row-status.on {
  background: #3ab86a;
  box-shadow: 0 0 0 0 rgba(58, 184, 106, 0.6);
  animation: pulse-green 2s ease infinite;
}

@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0 0   rgba(58, 184, 106, 0.6); }
  50%       { box-shadow: 0 0 0 5px rgba(58, 184, 106, 0);   }
}


/* ══════════════════════════════════════════════════════════════════════════
   14. CHAIN-MONITOR & FORTSCHRITTSBALKEN
   ══════════════════════════════════════════════════════════════════════════ */
.terminal-overlay {
  backdrop-filter: blur(8px);
}

.chain-monitor-overlay .terminal-window {
  border: 1px solid rgba(58, 184, 106, 0.15);
}

#chain-progress-fill {
  background: linear-gradient(to right, #3ab86a, #e0eb4a);
  border-radius: 3px;
}


/* ══════════════════════════════════════════════════════════════════════════
   15. LOGS & TABELLEN
   ══════════════════════════════════════════════════════════════════════════ */
.log-table td {
  border-bottom-color: rgba(58, 184, 106, 0.06);
}

.log-table tr:hover td {
  background: rgba(58, 184, 106, 0.04);
}

.log-ok   { color: #3ab86a; }
.log-err  { color: #f87171; }
.log-info { color: #86efac; }


/* ══════════════════════════════════════════════════════════════════════════
   16. SETTINGS-SEKTIONEN
   ══════════════════════════════════════════════════════════════════════════ */
.settings-section {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(58, 184, 106, 0.08);
}

.settings-section-title {
  color: #3ab86a;
  letter-spacing: 0.03em;
}

.code-path { color: #86efac; }

/* Theme-Kacheln */
.theme-card:hover {
  border-color: #3ab86a;
  box-shadow: 0 8px 24px rgba(58, 184, 106, 0.15);
}

.theme-card.active {
  border-color: #3ab86a;
  box-shadow: 0 0 0 3px rgba(58, 184, 106, 0.20);
}


/* ══════════════════════════════════════════════════════════════════════════
   17. UPDATE-LOG & GIT-LOG
   ══════════════════════════════════════════════════════════════════════════ */
.update-log {
  background: rgba(1, 8, 4, 0.8);
  border: 1px solid rgba(58, 184, 106, 0.08);
}

.update-log .log-line.ok   { color: #3ab86a; }
.update-log .log-line.cmd  { color: #86efac; }
.update-log .log-line.warn { color: #e0eb4a; }
.update-log .log-line.err  { color: #f87171; }
.update-log .log-line.info { color: #3a5a4a; }


/* ══════════════════════════════════════════════════════════════════════════
   18. SCAN-BANNER & LEERE ZUSTÄNDE
   ══════════════════════════════════════════════════════════════════════════ */
.scan-banner {
  background: rgba(58, 184, 106, 0.06);
  border: 1px solid rgba(58, 184, 106, 0.20);
}

.scan-banner .scan-count { color: #3ab86a; }

.empty-state .icon { opacity: 0.25; }


/* ══════════════════════════════════════════════════════════════════════════
   19. SCROLLBAR
   ══════════════════════════════════════════════════════════════════════════ */
::-webkit-scrollbar            { width: 4px; }
::-webkit-scrollbar-track      { background: transparent; }
::-webkit-scrollbar-thumb      { background: rgba(58, 184, 106, 0.20); border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #3ab86a; }


/* ══════════════════════════════════════════════════════════════════════════
   20. TEXT-SELEKTION
   ══════════════════════════════════════════════════════════════════════════ */
::selection {
  background: rgba(58, 184, 106, 0.25);
  color: #ffffff;
}


/* ══════════════════════════════════════════════════════════════════════════
   21. SCHRIFTART-HEADING-STIL (Panel- & Modul-Titel mit Bebas Neue)
   ══════════════════════════════════════════════════════════════════════════ */
.topbar-title,
.panel-title,
.settings-section-title,
.modal-title {
  font-family: 'Bebas Neue', var(--font-ui), sans-serif;
  letter-spacing: 0.08em;
  font-weight: 400;
}
`;

function loadThemePreset(id) {
  const themes = { 'dark-geometric': DARK_GEOMETRIC_THEME };
  const code = themes[id];
  if (!code) return;
  const ta = document.getElementById('custom-css-input');
  if (!ta) return;
  if (ta.value.trim() && !confirm('Aktuellen CSS-Inhalt überschreiben?')) return;
  ta.value = code;
  previewCustomCss();
  showPage('settings');
  setTimeout(() => { ta.scrollIntoView({ behavior:'smooth', block:'center' }); ta.focus(); }, 100);
  showToast('🎨 Dark Geometric geladen — Anwenden & Speichern klicken', 'info');
}

function downloadThemePreset(id) {
  const names  = { 'dark-geometric': 'PSScriptManager_Dark-Geometric.css' };
  const themes = { 'dark-geometric': DARK_GEOMETRIC_THEME };
  const code   = themes[id];
  const name   = names[id] || id + '.css';
  if (!code) return;
  const blob = new Blob([code], { type: 'text/css' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('⬇ ' + name + ' heruntergeladen', 'ok');
}

function downloadCssTemplate() {
  const blob = new Blob([CSS_TEMPLATE], { type: 'text/css' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'PSScriptManager_CSS_Template.css';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('⬇ CSS Template heruntergeladen', 'ok');
}

function loadCssTemplate() {
  const ta = document.getElementById('custom-css-input');
  if (!ta) return;
  if (ta.value.trim() && !confirm('Aktuellen CSS-Inhalt mit dem Template überschreiben?')) return;
  ta.value = CSS_TEMPLATE;
  previewCustomCss();
  const status = document.getElementById('custom-css-status');
  if (status) { status.textContent = '✔ Template geladen — klicke "Anwenden & Speichern"'; status.style.color = 'var(--accent1)'; }
  showToast('📄 CSS Template geladen', 'info');
  // Scroll zum Editor
  ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ta.focus();
}

function exportCurrentCss() {
  const code = document.getElementById('custom-css-input')?.value || '';
  if (!code.trim()) { showToast('Kein CSS zum Exportieren', 'err'); return; }
  const blob = new Blob([code], { type: 'text/css' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'PSScriptManager_Custom.css';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('⬆ CSS exportiert', 'ok');
}
function previewCustomCss() {
  const code = document.getElementById('custom-css-input')?.value || '';
  ensureCustomCssLast(code);
}

function applyCustomCss() {
  const code   = document.getElementById('custom-css-input')?.value || '';
  ensureCustomCssLast(code);
  const el     = document.getElementById('custom-css-style');
  const status = document.getElementById('custom-css-status');
  if (el) el.textContent = code;
  try {
    localStorage.setItem('psm_custom_css', code);
    if (status) {
      status.textContent = '✔ Gespeichert & angewendet';
      status.style.color = 'var(--green)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    }
    showToast('✔ CSS angewendet', 'ok');
  } catch(e) {
    if (status) { status.textContent = '✘ ' + e.message; status.style.color = 'var(--red)'; }
  }
}

function clearCustomCss() {
  if (!confirm('Eigenes CSS wirklich löschen?')) return;
  document.getElementById('custom-css-input').value = '';
  ensureCustomCssLast('');
  try { localStorage.removeItem('psm_custom_css'); } catch(_) {}
  showToast('🗑 CSS gelöscht', 'ok');
}

// Snippet in Editor einfügen UND sofort live anwenden (kein manuelles Speichern nötig)
function insertAndApply(snippet) {
  insertCssSnippet(snippet);
  // Sofort ins Style-Tag schreiben (live preview)
  const code = document.getElementById('custom-css-input')?.value || '';
  ensureCustomCssLast(code);
  // Kurzen Info-Text zeigen was geändert wurde
  const info = document.getElementById('chip-preview-info');
  if (info) {
    // Erste Regel aus dem Snippet extrahieren
    const match = snippet.match(/^([^{]+)\s*\{([^}]+)\}/);
    if (match) {
      const selector = match[1].trim();
      const props    = match[2].trim().replace(/\s+/g,' ');
      info.textContent = `✔ Angewendet: ${selector} { ${props.length > 60 ? props.slice(0,60)+'…' : props} }`;
      info.style.color = 'var(--accent1)';
    } else {
      info.textContent = '✔ Angewendet';
      info.style.color = 'var(--accent1)';
    }
    clearTimeout(info._timer);
    info._timer = setTimeout(() => { info.textContent = ''; }, 3500);
  }
}

function insertCssSnippet(snippet) {
  const ta = document.getElementById('custom-css-input');
  if (!ta) return;
  const pos = ta.selectionStart;
  const val = ta.value;
  ta.value = val.slice(0,pos) + (pos > 0 && val[pos-1] !== '\n' ? '\n' : '') + snippet + '\n' + val.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + snippet.length + 1;
  ta.focus();
  previewCustomCss();
}

function loadSavedCustomCss() {
  try {
    const saved = localStorage.getItem('psm_custom_css');
    if (saved) {
      const ta = document.getElementById('custom-css-input');
      if (ta) ta.value = saved;
      // Style-Tag immer ans Ende des head verschieben bevor befüllen
      ensureCustomCssLast(saved);
    }
  } catch(_) {}
}

// Stellt sicher dass das custom-css-style Tag existiert und als letztes im <head> liegt
function ensureCustomCssLast(code) {
  let el = document.getElementById('custom-css-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'custom-css-style';
    document.head.appendChild(el);
  } else {
    // Ans Ende des head verschieben falls es nicht schon dort ist
    if (el !== document.head.lastElementChild) {
      document.head.appendChild(el); // verschiebt es ans Ende
    }
  }
  if (code !== undefined) el.textContent = code;
  return el;
}

// ── THEME SYSTEM ─────────────────────────────────────────────────────────────
const THEME_DEFAULTS = {
  dark:     { accent1:'#7c6af7', accent2:'#c084fc', radius:'14' },
  midnight: { accent1:'#a78bfa', accent2:'#e879f9', radius:'14' },
  ocean:    { accent1:'#0ea5e9', accent2:'#38bdf8',  radius:'14' },
  forest:   { accent1:'#22c55e', accent2:'#4ade80',  radius:'14' },
  sunset:   { accent1:'#f43f5e', accent2:'#fb7185',  radius:'14' },
  light:    { accent1:'#7c6af7', accent2:'#c084fc',  radius:'14' },
};

let currentTheme = 'dark';

function applyTheme(name, save=true) {
  currentTheme = name;
  document.documentElement.setAttribute('data-theme', name);

  // Alle Theme-Kacheln aktualisieren
  document.querySelectorAll('.theme-card').forEach(c => {
    const isActive = c.dataset.theme === name;
    c.classList.toggle('active', isActive);
  });
  document.querySelectorAll('.theme-check').forEach(c => c.textContent='');
  const check = document.getElementById('tc-' + name);
  if (check) check.textContent = '✔';

  // Picker-Werte auf Theme-Defaults setzen (falls nicht custom)
  const def = THEME_DEFAULTS[name] || THEME_DEFAULTS.dark;
  setPickerValues(def.accent1, def.accent2, def.radius);

  // In DB speichern
  if (save) {
    window.api.app.info().then(() => {
      // settings via IPC speichern
      window.api.settings?.set('theme', name);
    });
    // Fallback: localStorage als Cache
    try { localStorage.setItem('psm_theme', name); } catch(_) {}
  }
}

function setPickerValues(a1, a2, radius) {
  const p1 = document.getElementById('accent1-picker');
  const h1 = document.getElementById('accent1-hex');
  const p2 = document.getElementById('accent2-picker');
  const h2 = document.getElementById('accent2-hex');
  const rs  = document.getElementById('radius-slider');
  const rv  = document.getElementById('radius-val');
  if (p1) p1.value = a1;
  if (h1) h1.value = a1;
  if (p2) p2.value = a2;
  if (h2) h2.value = a2;
  if (rs) {
    rs.value = radius;
    const pct = (parseInt(radius)/24*100).toFixed(1);
    rs.style.background = `linear-gradient(to right,var(--accent1) ${pct}%,var(--border) ${pct}%)`;
  }
  if (rv) rv.textContent = radius + 'px';
}

function applyAccentColor(which, value) {
  document.documentElement.style.setProperty('--' + which, value);
  const hex = document.getElementById(which + '-hex');
  if (hex) hex.value = value;
  saveCustomColors();
}

function applyAccentColorHex(which, value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  document.documentElement.style.setProperty('--' + which, value);
  const picker = document.getElementById(which + '-picker');
  if (picker) picker.value = value;
  saveCustomColors();
}

function applyRadius(value) {
  document.documentElement.style.setProperty('--radius', value + 'px');
  const rv = document.getElementById('radius-val');
  if (rv) rv.textContent = value + 'px';
  const rs = document.getElementById('radius-slider');
  if (rs) {
    const pct = (parseInt(value)/24*100).toFixed(1);
    rs.style.background = `linear-gradient(to right,var(--accent1) ${pct}%,var(--border) ${pct}%)`;
  }
  try { localStorage.setItem('psm_radius', value); } catch(_) {}
}

function saveCustomColors() {
  try {
    const a1 = document.getElementById('accent1-picker')?.value;
    const a2 = document.getElementById('accent2-picker')?.value;
    if (a1) localStorage.setItem('psm_accent1', a1);
    if (a2) localStorage.setItem('psm_accent2', a2);
  } catch(_) {}
}

function resetAccentColors() {
  const def = THEME_DEFAULTS[currentTheme] || THEME_DEFAULTS.dark;
  document.documentElement.style.removeProperty('--accent1');
  document.documentElement.style.removeProperty('--accent2');
  setPickerValues(def.accent1, def.accent2, def.radius);
  try { localStorage.removeItem('psm_accent1'); localStorage.removeItem('psm_accent2'); } catch(_) {}
  showToast('✔ Akzentfarben zurückgesetzt', 'ok');
}

function loadSavedTheme() {
  loadSavedFont();
  loadSavedLogo();
  // Custom Fonts werden in loadSavedFont geladen
  loadSavedCustomCss();
  // Theme aus localStorage laden (schnell, kein IPC nötig beim Start)
  try {
    const saved   = localStorage.getItem('psm_theme')   || 'dark';
    const a1      = localStorage.getItem('psm_accent1');
    const a2      = localStorage.getItem('psm_accent2');
    const radius  = localStorage.getItem('psm_radius');

    applyTheme(saved, false);

    if (a1) { document.documentElement.style.setProperty('--accent1', a1); const p=document.getElementById('accent1-picker'); const h=document.getElementById('accent1-hex'); if(p)p.value=a1; if(h)h.value=a1; }
    if (a2) { document.documentElement.style.setProperty('--accent2', a2); const p=document.getElementById('accent2-picker'); const h=document.getElementById('accent2-hex'); if(p)p.value=a2; if(h)h.value=a2; }
    if (radius) applyRadius(radius);
  } catch(_) {
    applyTheme('dark', false);
  }
}

