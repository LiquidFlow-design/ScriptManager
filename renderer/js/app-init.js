/**
 * renderer/js/app-init.js – App-Bootstrap (DOMContentLoaded)
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Keyboard-Shortcuts registrieren
  setupKeyboardShortcuts();

  // Session-Expired Event registrieren
  setupSessionExpiredHandler();

  // Scheduler:fired Event registrieren
  setupSchedulerFiredHandler();

  // Gespeichertes Theme laden
  await loadSavedTheme();
  await loadCustomCss();

  // Einstellungsseite vorbelegen
  await loadSettingsPage();

  // Event-Listener für Auth-Felder (Enter-Taste)
  document.getElementById('login-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-username')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-password').focus(); });
  document.getElementById('setup-password2')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
  document.getElementById('totp-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') doTotp(); });
  document.getElementById('totp-code')?.addEventListener('input',   e => { if (e.target.value.replace(/\s/g, '').length === 6) doTotp(); });

  // Suche
  document.getElementById('search-input')?.addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderScripts();
  });

  // Terminal Enter
  document.getElementById('term-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendTerminalInput(); });

  // App-Info
  try {
    const info = await window.api.app.info();
    const verEl = document.getElementById('sb-version');
    const aboutVer = document.getElementById('about-version');
    if (verEl)    verEl.textContent    = info.version || '?';
    if (aboutVer) aboutVer.textContent = info.version || '?';

    // Git-URL aus Settings vorbelegen
    const gitUrlEl = document.getElementById('git-repo-url');
    if (gitUrlEl) {
      const r = await window.api.settings.get('github_repo');
      if (r?.value) gitUrlEl.value = r.value;
    }
    const gitBranchEl = document.getElementById('git-branch');
    if (gitBranchEl) {
      const r = await window.api.settings.get('github_branch');
      if (r?.value) gitBranchEl.value = r.value;
    }
  } catch (_) {}

  // Auth-Flow starten
  try {
    const setup = await window.api.auth.needsSetup();
    if (setup.needsSetup) {
      showAuthOverlay('auth-setup');
      return;
    }
    const session = await window.api.auth.getSession();
    if (session.loggedIn) {
      onLoginSuccess(session.user, false);
    } else {
      showAuthOverlay('auth-login');
    }
  } catch (e) {
    console.error('Auth-Init Fehler:', e);
    showAuthOverlay('auth-login');
  }
});
