/**
 * database/db.js – SQLite-Datenbankschicht v3.0
 * NEU: Auth-System (users, permissions, audit_log), TOTP-2FA-Support
 */

const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const initSqlJs = require('sql.js');
const { app }   = require('electron');

function getWasmPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'sql-wasm.wasm');
  return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

function localNow() {
  const d = new Date(), pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Passwort-Hashing via PBKDF2 (Node built-in crypto, kein npm-Paket) ──────
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.pbkdf2Sync(password, s, 100000, 64, 'sha512').toString('hex');
  return { hash: h, salt: s };
}

function verifyPassword(password, hash, salt) {
  const { hash: h } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}

module.exports = async function createDb(dbPath) {
  const SQL = await initSqlJs({ locateFile: () => getWasmPath() });
  let db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  function persist() { fs.writeFileSync(dbPath, Buffer.from(db.export())); }

  function all(sql, params=[]) {
    const stmt=db.prepare(sql); stmt.bind(params);
    const rows=[]; while(stmt.step()) rows.push(stmt.getAsObject());
    stmt.free(); return rows;
  }
  function get(sql,params=[]) { return all(sql,params)[0]; }
  function run(sql,params=[]) { db.run(sql,params); persist(); }
  function insert(sql,params=[]) {
    db.run(sql,params);
    const id=db.exec('SELECT last_insert_rowid()')[0]?.values[0][0]??null;
    persist(); return id;
  }

  // ── Schema ────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS scripts (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      name               TEXT    NOT NULL,
      dateiname          TEXT    NOT NULL,
      kategorie          TEXT    NOT NULL DEFAULT 'Allgemein',
      beschreibung       TEXT    DEFAULT '',
      autor              TEXT    DEFAULT '',
      parameter          TEXT    DEFAULT '',
      aktiviert          INTEGER NOT NULL DEFAULT 1,
      favorit            INTEGER NOT NULL DEFAULT 0,
      letztes_ausfuehren TEXT    DEFAULT NULL,
      erstellt_am        TEXT    NOT NULL,
      geaendert_am       TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id    INTEGER,
      script_name  TEXT,
      chain_id     INTEGER DEFAULT NULL,
      chain_name   TEXT    DEFAULT NULL,
      status       TEXT    NOT NULL,
      output       TEXT    DEFAULT '',
      gestartet_am TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS chains (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      beschreibung TEXT    DEFAULT '',
      bei_fehler   TEXT    NOT NULL DEFAULT 'stop',
      erstellt_am  TEXT    NOT NULL,
      geaendert_am TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chain_steps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id   INTEGER NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
      script_id  INTEGER NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      position   INTEGER NOT NULL DEFAULT 0,
      parameter  TEXT    DEFAULT '',
      pause_sek  INTEGER DEFAULT 0,
      warte_typ  TEXT    NOT NULL DEFAULT 'timer'
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      typ            TEXT    NOT NULL,
      target_id      INTEGER NOT NULL,
      target_typ     TEXT    NOT NULL DEFAULT 'script',
      cron           TEXT    DEFAULT NULL,
      einmalig_am    TEXT    DEFAULT NULL,
      aktiv          INTEGER NOT NULL DEFAULT 1,
      letzter_lauf   TEXT    DEFAULT NULL,
      naechster_lauf TEXT    DEFAULT NULL,
      erstellt_am    TEXT    NOT NULL
    );

    -- ════════════════════════════════════════════════════════════════════
    --  AUTH: Benutzer
    -- ════════════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      username          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash     TEXT    NOT NULL,
      salt              TEXT    NOT NULL,
      rolle             TEXT    NOT NULL DEFAULT 'user',
      aktiv             INTEGER NOT NULL DEFAULT 1,
      muss_pw_aendern   INTEGER NOT NULL DEFAULT 0,
      totp_secret       TEXT    DEFAULT NULL,
      totp_aktiv        INTEGER NOT NULL DEFAULT 0,
      login_versuche    INTEGER NOT NULL DEFAULT 0,
      gesperrt_bis      TEXT    DEFAULT NULL,
      letzter_login     TEXT    DEFAULT NULL,
      erstellt_am       TEXT    NOT NULL,
      geaendert_am      TEXT    NOT NULL
    );

    -- ════════════════════════════════════════════════════════════════════
    --  AUTH: Berechtigungen (pro User + Script)
    --  NULL bei user_id = gilt für ALLE non-admin User (Gruppenregel)
    -- ════════════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS permissions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
      script_id        INTEGER NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      darf_sehen       INTEGER NOT NULL DEFAULT 1,
      darf_ausfuehren  INTEGER NOT NULL DEFAULT 0,
      darf_bearbeiten  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, script_id)
    );

    -- ════════════════════════════════════════════════════════════════════
    --  AUTH: Audit-Log
    -- ════════════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER,
      username  TEXT,
      aktion    TEXT    NOT NULL,
      ziel_typ  TEXT    DEFAULT NULL,
      ziel_id   INTEGER DEFAULT NULL,
      details   TEXT    DEFAULT NULL,
      zeitpunkt TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scripts_kat   ON scripts(kategorie);
    CREATE INDEX IF NOT EXISTS idx_logs_sid      ON logs(script_id);
    CREATE INDEX IF NOT EXISTS idx_logs_time     ON logs(gestartet_am);
    CREATE INDEX IF NOT EXISTS idx_chain_steps   ON chain_steps(chain_id, position);
    CREATE INDEX IF NOT EXISTS idx_schedules_act ON schedules(aktiv);
    CREATE INDEX IF NOT EXISTS idx_users_name    ON users(username);
    CREATE INDEX IF NOT EXISTS idx_audit_time    ON audit_log(zeitpunkt);
    CREATE INDEX IF NOT EXISTS idx_perms_uid     ON permissions(user_id, script_id);
  `);

  // ── Migrationen ───────────────────────────────────────────────────────────
  const migrations = [
    `ALTER TABLE scripts    ADD COLUMN favorit INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE logs       ADD COLUMN chain_id INTEGER DEFAULT NULL`,
    `ALTER TABLE logs       ADD COLUMN chain_name TEXT DEFAULT NULL`,
    `ALTER TABLE chain_steps ADD COLUMN warte_typ TEXT NOT NULL DEFAULT 'timer'`,
    `CREATE INDEX IF NOT EXISTS idx_scripts_fav ON scripts(favorit)`,
  ];
  for (const m of migrations) { try { db.run(m); } catch(_) {} }

  persist();

  const defaults = {
    db_version:    '4',
    github_repo:   'https://github.com/LiquidFlow-design/ScriptManager.git',
    github_branch: 'main',
    theme:         'dark',
    // Auth-Defaults
    pw_min_laenge:   '8',
    pw_ablauf_tage:  '0',   // 0 = nie
    session_timeout: '30',  // Minuten Inaktivität bis Auto-Logout
    max_login_vers:  '5',   // Fehlversuche bis Lockout
    lockout_minuten: '5',
    totp_erzwungen:  '0',   // 0 = optional, 1 = für alle Pflicht
  };
  for (const [k,v] of Object.entries(defaults))
    run(`INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)`,[k,v]);

  // ════════════════════════════════════════════════════════════════════════
  //  USER MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════

  const getUserCount    = ()       => { const r=get(`SELECT COUNT(*) as n FROM users`); return r?r.n:0; };
  const getUserByName   = (name)   => get(`SELECT * FROM users WHERE username=? COLLATE NOCASE`,[name]);
  const getUserById     = (id)     => get(`SELECT * FROM users WHERE id=?`,[id]);
  const getAllUsers      = ()       => all(`SELECT id,username,rolle,aktiv,muss_pw_aendern,totp_aktiv,letzter_login,erstellt_am,geaendert_am FROM users ORDER BY username`);

  const createUser = ({ username, password, rolle='user', muss_pw_aendern=0 }) => {
    if (!username || !password) return { success:false, error:'Benutzername und Passwort erforderlich' };
    if (getUserByName(username)) return { success:false, error:'Benutzername bereits vergeben' };
    const { hash, salt } = hashPassword(password);
    const now = localNow();
    const id = insert(
      `INSERT INTO users (username,password_hash,salt,rolle,aktiv,muss_pw_aendern,erstellt_am,geaendert_am)
       VALUES (?,?,?,?,1,?,?,?)`,
      [username, hash, salt, rolle, muss_pw_aendern?1:0, now, now]
    );
    return { success:true, id };
  };

  const updateUser = ({ id, username, rolle, aktiv, muss_pw_aendern }) => {
    run(`UPDATE users SET username=?,rolle=?,aktiv=?,muss_pw_aendern=?,geaendert_am=? WHERE id=?`,
      [username, rolle, aktiv?1:0, muss_pw_aendern?1:0, localNow(), id]);
    return { success:true };
  };

  const deleteUser = (id) => {
    run(`DELETE FROM users WHERE id=?`,[id]);
    run(`DELETE FROM permissions WHERE user_id=?`,[id]);
    return { success:true };
  };

  const changePassword = (userId, newPassword) => {
    const { hash, salt } = hashPassword(newPassword);
    run(`UPDATE users SET password_hash=?,salt=?,muss_pw_aendern=0,geaendert_am=? WHERE id=?`,
      [hash, salt, localNow(), userId]);
    return { success:true };
  };

  const resetPassword = (userId, tempPassword) => {
    const { hash, salt } = hashPassword(tempPassword);
    run(`UPDATE users SET password_hash=?,salt=?,muss_pw_aendern=1,geaendert_am=? WHERE id=?`,
      [hash, salt, localNow(), userId]);
    return { success:true };
  };

  // ── Login mit Lockout-Schutz ──────────────────────────────────────────────
  const loginUser = (username, password) => {
    const user = getUserByName(username);
    if (!user) return { success:false, error:'Ungültige Anmeldedaten' };
    if (!user.aktiv) return { success:false, error:'Konto deaktiviert' };

    // Lockout prüfen
    if (user.gesperrt_bis) {
      const locked = new Date(user.gesperrt_bis);
      if (new Date() < locked) {
        const verbleibend = Math.ceil((locked - new Date()) / 60000);
        return { success:false, error:`Konto gesperrt. Bitte ${verbleibend} Minute(n) warten.`, locked:true };
      }
      // Lockout abgelaufen → zurücksetzen
      run(`UPDATE users SET login_versuche=0,gesperrt_bis=NULL WHERE id=?`,[user.id]);
    }

    if (!verifyPassword(password, user.password_hash, user.salt)) {
      const maxVers   = parseInt(getSetting('max_login_vers') || '5');
      const lockoutMin= parseInt(getSetting('lockout_minuten') || '5');
      const versuche  = (user.login_versuche || 0) + 1;

      if (versuche >= maxVers) {
        const sperreEnde = new Date(Date.now() + lockoutMin * 60 * 1000).toISOString();
        run(`UPDATE users SET login_versuche=?,gesperrt_bis=? WHERE id=?`,[versuche, sperreEnde, user.id]);
        return { success:false, error:`Zu viele Fehlversuche. Konto für ${lockoutMin} Minuten gesperrt.`, locked:true };
      }
      run(`UPDATE users SET login_versuche=? WHERE id=?`,[versuche, user.id]);
      return { success:false, error:`Ungültige Anmeldedaten (${versuche}/${maxVers} Versuche)` };
    }

    // Passwort korrekt → Versuche zurücksetzen, Login-Zeit aktualisieren
    run(`UPDATE users SET login_versuche=0,gesperrt_bis=NULL,letzter_login=? WHERE id=?`,[localNow(), user.id]);

    return {
      success: true,
      user: {
        id:              user.id,
        username:        user.username,
        rolle:           user.rolle,
        totp_aktiv:      user.totp_aktiv   === 1 ? 1 : 0,  // SQLite Integer explizit normalisieren
        muss_pw_aendern: user.muss_pw_aendern === 1 ? 1 : 0,
      }
    };
  };

  // ════════════════════════════════════════════════════════════════════════
  //  TOTP (2FA) – Shared-Secret speichern/löschen, Validierung via main.js
  // ════════════════════════════════════════════════════════════════════════

  const setTotpSecret  = (userId, secret) => {
    run(`UPDATE users SET totp_secret=?,totp_aktiv=1,geaendert_am=? WHERE id=?`,[secret, localNow(), userId]);
    return { success:true };
  };

  const disableTotp    = (userId) => {
    run(`UPDATE users SET totp_secret=NULL,totp_aktiv=0,geaendert_am=? WHERE id=?`,[localNow(), userId]);
    return { success:true };
  };

  const getTotpSecret  = (userId) => {
    const r = get(`SELECT totp_secret FROM users WHERE id=?`,[userId]);
    return r ? r.totp_secret : null;
  };

  // ════════════════════════════════════════════════════════════════════════
  //  PERMISSIONS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Gibt alle Permissions für einen User zurück.
   * Logik: user_id=NULL = Gruppenregel (gilt für alle non-admin).
   * user_id-spezifische Regel schlägt Gruppenregel.
   */
  const getPermissionsForUser = (userId) => {
    // Gruppenregeln + eigene Regeln
    const rows = all(
      `SELECT p.*, s.name as script_name, s.dateiname, s.kategorie
       FROM permissions p JOIN scripts s ON p.script_id=s.id
       WHERE p.user_id=? OR p.user_id IS NULL
       ORDER BY p.user_id ASC`,  // NULL zuerst, dann user-spezifisch
      [userId]
    );
    // Deduplizieren: user-spezifische Regel überschreibt Gruppenregel
    const map = {};
    for (const r of rows) map[r.script_id] = r;
    return Object.values(map);
  };

  const getPermissionsForScript = (scriptId) =>
    all(`SELECT p.*,u.username FROM permissions p LEFT JOIN users u ON p.user_id=u.id WHERE p.script_id=?`,[scriptId]);

  const setPermission = ({ userId, scriptId, darf_sehen, darf_ausfuehren, darf_bearbeiten }) => {
    run(`INSERT INTO permissions (user_id,script_id,darf_sehen,darf_ausfuehren,darf_bearbeiten)
         VALUES (?,?,?,?,?)
         ON CONFLICT(user_id,script_id) DO UPDATE SET
           darf_sehen=excluded.darf_sehen,
           darf_ausfuehren=excluded.darf_ausfuehren,
           darf_bearbeiten=excluded.darf_bearbeiten`,
      [userId??null, scriptId, darf_sehen?1:0, darf_ausfuehren?1:0, darf_bearbeiten?1:0]);
    return { success:true };
  };

  const deletePermission = (userId, scriptId) => {
    run(`DELETE FROM permissions WHERE user_id=? AND script_id=?`,[userId??null, scriptId]);
    return { success:true };
  };

  /**
   * Prüft ob ein User eine bestimmte Aktion auf einem Script darf.
   * Admins: immer true. readonly: niemals ausführen/bearbeiten.
   */
  const checkPermission = (userId, scriptId, action) => {
    const user = getUserById(userId);
    if (!user) return false;
    if (user.rolle === 'admin') return true;
    if (user.rolle === 'readonly') {
      return action === 'darf_sehen';
    }
    // user-Rolle: Berechtigung aus permissions-Tabelle
    const perms = getPermissionsForUser(userId);
    const p = perms.find(r => r.script_id === scriptId);
    if (!p) return false; // kein Eintrag → kein Zugriff
    return !!p[action];
  };

  // ════════════════════════════════════════════════════════════════════════
  //  AUDIT LOG
  // ════════════════════════════════════════════════════════════════════════

  const addAuditLog = ({ userId, username, aktion, zielTyp=null, zielId=null, details=null }) => {
    insert(`INSERT INTO audit_log (user_id,username,aktion,ziel_typ,ziel_id,details,zeitpunkt)
            VALUES (?,?,?,?,?,?,?)`,
      [userId||null, username||'System', aktion, zielTyp, zielId, details ? JSON.stringify(details) : null, localNow()]);
  };

  const getAuditLog  = (limit=500) => all(`SELECT * FROM audit_log ORDER BY zeitpunkt DESC LIMIT ?`,[limit]);
  const clearAuditLog= ()          => { run(`DELETE FROM audit_log`); return { success:true }; };

  // ════════════════════════════════════════════════════════════════════════
  //  SCRIPTS
  // ════════════════════════════════════════════════════════════════════════
  const getAllScripts    = ()   => all(`SELECT * FROM scripts ORDER BY kategorie, name`);
  const getFavorites     = ()   => all(`SELECT * FROM scripts WHERE favorit=1 ORDER BY name`);
  const getScriptById    = (id) => get(`SELECT * FROM scripts WHERE id=?`,[id]);

  const addScript = (s) => {
    const now=localNow();
    const id=insert(
      `INSERT INTO scripts (name,dateiname,kategorie,beschreibung,autor,parameter,aktiviert,favorit,erstellt_am,geaendert_am)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [s.name||'',s.dateiname||'',s.kategorie||'Allgemein',s.beschreibung||'',s.autor||'',s.parameter||'',
       s.aktiviert!==undefined?(s.aktiviert?1:0):1, s.favorit?1:0, now,now]);
    return { success:true, id };
  };

  const updateScript = (s) => {
    run(`UPDATE scripts SET name=?,dateiname=?,kategorie=?,beschreibung=?,autor=?,parameter=?,aktiviert=?,favorit=?,geaendert_am=? WHERE id=?`,
      [s.name||'',s.dateiname||'',s.kategorie||'Allgemein',s.beschreibung||'',s.autor||'',s.parameter||'',
       s.aktiviert!==undefined?(s.aktiviert?1:0):1, s.favorit?1:0, localNow(),s.id]);
    return { success:true };
  };

  const deleteScript  = (id) => { run(`DELETE FROM scripts WHERE id=?`,[id]); return { success:true }; };
  const updateLastRun = (id) => run(`UPDATE scripts SET letztes_ausfuehren=? WHERE id=?`,[localNow(),id]);
  const toggleFavorit = (id) => {
    run(`UPDATE scripts SET favorit = CASE WHEN favorit=1 THEN 0 ELSE 1 END WHERE id=?`,[id]);
    const s = getScriptById(id);
    return { success:true, favorit: s ? s.favorit : 0 };
  };

  // ════════════════════════════════════════════════════════════════════════
  //  CHAINS
  // ════════════════════════════════════════════════════════════════════════
  const getAllChains  = ()   => all(`SELECT * FROM chains ORDER BY name`);
  const getChainById  = (id) => get(`SELECT * FROM chains WHERE id=?`,[id]);
  const getChainSteps = (chainId) => all(
    `SELECT cs.*, s.name as script_name, s.dateiname, s.beschreibung
     FROM chain_steps cs JOIN scripts s ON cs.script_id=s.id
     WHERE cs.chain_id=? ORDER BY cs.position`, [chainId]);

  const addChain = (c) => {
    const now=localNow();
    const id=insert(`INSERT INTO chains (name,beschreibung,bei_fehler,erstellt_am,geaendert_am) VALUES (?,?,?,?,?)`,
      [c.name||'',c.beschreibung||'',c.bei_fehler||'stop',now,now]);
    return { success:true, id };
  };

  const updateChain = (c) => {
    run(`UPDATE chains SET name=?,beschreibung=?,bei_fehler=?,geaendert_am=? WHERE id=?`,
      [c.name||'',c.beschreibung||'',c.bei_fehler||'stop',localNow(),c.id]);
    return { success:true };
  };

  const deleteChain = (id) => { run(`DELETE FROM chains WHERE id=?`,[id]); return { success:true }; };

  const saveChainSteps = (chainId, steps) => {
    run(`DELETE FROM chain_steps WHERE chain_id=?`,[chainId]);
    steps.forEach((s,i) => {
      insert(`INSERT INTO chain_steps (chain_id,script_id,position,parameter,pause_sek,warte_typ) VALUES (?,?,?,?,?,?)`,
        [chainId, s.script_id, i, s.parameter||'', s.pause_sek||0, s.warte_typ||'timer']);
    });
    run(`UPDATE chains SET geaendert_am=? WHERE id=?`,[localNow(),chainId]);
    return { success:true };
  };

  const logChainExecution = (chainId, chainName, scriptId, status, output) => {
    run(`INSERT INTO logs (script_id,script_name,chain_id,chain_name,status,output,gestartet_am) VALUES (?,?,?,?,?,?,?)`,
      [scriptId, getScriptById(scriptId)?.name||'?', chainId, chainName, status, output||'', localNow()]);
  };

  // ════════════════════════════════════════════════════════════════════════
  //  SCHEDULES
  // ════════════════════════════════════════════════════════════════════════
  const getAllSchedules    = ()   => all(`SELECT * FROM schedules ORDER BY name`);
  const getScheduleById    = (id) => get(`SELECT * FROM schedules WHERE id=?`,[id]);
  const getActiveSchedules = ()   => all(`SELECT * FROM schedules WHERE aktiv=1`);

  const addSchedule = (s) => {
    const now=localNow();
    const id=insert(`INSERT INTO schedules (name,typ,target_id,target_typ,cron,einmalig_am,aktiv,naechster_lauf,erstellt_am) VALUES (?,?,?,?,?,?,?,?,?)`,
      [s.name||'',s.typ||'einmalig',s.target_id,s.target_typ||'script',s.cron||null,s.einmalig_am||null,1,s.naechster_lauf||null,now]);
    return { success:true, id };
  };

  const updateSchedule = (s) => {
    run(`UPDATE schedules SET name=?,typ=?,target_id=?,target_typ=?,cron=?,einmalig_am=?,aktiv=?,naechster_lauf=? WHERE id=?`,
      [s.name||'',s.typ||'einmalig',s.target_id,s.target_typ||'script',s.cron||null,s.einmalig_am||null,s.aktiv?1:0,s.naechster_lauf||null,s.id]);
    return { success:true };
  };

  const deleteSchedule     = (id)    => { run(`DELETE FROM schedules WHERE id=?`,[id]); return { success:true }; };
  const updateScheduleRun  = (id,nx) => run(`UPDATE schedules SET letzter_lauf=?,naechster_lauf=? WHERE id=?`,[localNow(),nx||null,id]);
  const deactivateSchedule = (id)    => run(`UPDATE schedules SET aktiv=0 WHERE id=?`,[id]);

  // ════════════════════════════════════════════════════════════════════════
  //  LOGS
  // ════════════════════════════════════════════════════════════════════════
  const logExecution = (scriptId, status, output) => {
    const s=getScriptById(scriptId);
    run(`INSERT INTO logs (script_id,script_name,status,output,gestartet_am) VALUES (?,?,?,?,?)`,
      [scriptId, s?s.name:'Unbekannt', status, output||'', localNow()]);
  };

  const getRecentLogs     = (limit=200) => all(`SELECT l.*,s.dateiname FROM logs l LEFT JOIN scripts s ON l.script_id=s.id ORDER BY l.gestartet_am DESC LIMIT ?`,[limit]);
  const getLogsByScript   = (id) => all(`SELECT * FROM logs WHERE script_id=? ORDER BY gestartet_am DESC LIMIT 50`,[id]);
  const clearLogById      = (id) => { run(`DELETE FROM logs WHERE id=?`,[id]); return { success:true }; };
  const clearLogsByScript = (id) => { run(`DELETE FROM logs WHERE script_id=?`,[id]); return { success:true }; };
  const clearAllLogs      = ()   => { run(`DELETE FROM logs`); try{run(`DELETE FROM sqlite_sequence WHERE name='logs'`);}catch(_){} return { success:true }; };
  const clearOldLogs      = (d)  => { run(`DELETE FROM logs WHERE gestartet_am < datetime('now','-'||?||' days','localtime')`,[d]); return { success:true }; };
  const getLogCount       = ()   => { const r=get(`SELECT COUNT(*) as n FROM logs`); return r?r.n:0; };

  // ════════════════════════════════════════════════════════════════════════
  //  SETTINGS / CSV
  // ════════════════════════════════════════════════════════════════════════
  const getSetting     = (k)   => { const r=get(`SELECT value FROM settings WHERE key=?`,[k]); return r?r.value:null; };
  const setSetting     = (k,v) => { run(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,[k,v]); return { success:true }; };
  const getAllSettings  = ()    => Object.fromEntries(all(`SELECT key,value FROM settings`).map(r=>[r.key,r.value]));

  const importFromCsv = (csv) => {
    const lines=csv.replace(/^\uFEFF/,'').split('\n').map(l=>l.trim()).filter(Boolean);
    if(lines.length<2) return { imported:0 };
    let imported=0;
    for(const line of lines.slice(1)){
      const [,name,dateiname,kategorie,beschreibung,autor,parameter,aktiviert]=line.split(';');
      if(!name?.trim()||!dateiname?.trim()) continue;
      addScript({name:name.trim(),dateiname:dateiname.trim(),kategorie:(kategorie||'').trim()||'Allgemein',
        beschreibung:(beschreibung||'').trim(),autor:(autor||'').trim(),parameter:(parameter||'').trim(),aktiviert:(aktiviert||'').trim()==='1'});
      imported++;
    }
    return { imported };
  };

  return {
    // ── Auth ──────────────────────────────────────────────────────────────
    getUserCount, getUserByName, getUserById, getAllUsers,
    createUser, updateUser, deleteUser, changePassword, resetPassword, loginUser,
    // TOTP
    setTotpSecret, disableTotp, getTotpSecret,
    // Permissions
    getPermissionsForUser, getPermissionsForScript, setPermission, deletePermission, checkPermission,
    // Audit
    addAuditLog, getAuditLog, clearAuditLog,
    // Scripts
    getAllScripts, getFavorites, getScriptById, addScript, updateScript, deleteScript, updateLastRun, toggleFavorit,
    // Chains
    getAllChains, getChainById, getChainSteps, addChain, updateChain, deleteChain, saveChainSteps, logChainExecution,
    // Schedules
    getAllSchedules, getScheduleById, getActiveSchedules, addSchedule, updateSchedule, deleteSchedule, updateScheduleRun, deactivateSchedule,
    // Logs
    logExecution, getRecentLogs, getLogsByScript, clearLogById, clearLogsByScript, clearAllLogs, clearOldLogs, getLogCount,
    // Settings
    getSetting, setSetting, getAllSettings, importFromCsv,
    // Intern (für main.js Permission-Check)
    _hashPassword: hashPassword,
    _verifyPassword: verifyPassword,
  };
};
