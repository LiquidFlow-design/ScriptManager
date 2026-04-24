/**
 * database/db.js – SQLite-Datenbankschicht
 * Neu in v2.1:
 *   - scripts.favorit       → Favoriten-Flag
 *   - chains / chain_steps  → Script-Verkettungen
 *   - schedules             → Geplante Ausführungen
 */

const fs        = require('fs');
const path      = require('path');
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

    -- Script-Verkettungen
    CREATE TABLE IF NOT EXISTS chains (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      beschreibung TEXT    DEFAULT '',
      bei_fehler   TEXT    NOT NULL DEFAULT 'stop',
      erstellt_am  TEXT    NOT NULL,
      geaendert_am TEXT    NOT NULL
    );

    -- Schritte einer Verkettung (geordnet nach position)
    CREATE TABLE IF NOT EXISTS chain_steps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id   INTEGER NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
      script_id  INTEGER NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      position   INTEGER NOT NULL DEFAULT 0,
      parameter  TEXT    DEFAULT '',
      pause_sek  INTEGER DEFAULT 0,
      warte_typ  TEXT    NOT NULL DEFAULT 'timer'
    );

    -- Geplante Ausführungen
    CREATE TABLE IF NOT EXISTS schedules (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      typ          TEXT    NOT NULL,
      target_id    INTEGER NOT NULL,
      target_typ   TEXT    NOT NULL DEFAULT 'script',
      cron         TEXT    DEFAULT NULL,
      einmalig_am  TEXT    DEFAULT NULL,
      aktiv        INTEGER NOT NULL DEFAULT 1,
      letzter_lauf TEXT    DEFAULT NULL,
      naechster_lauf TEXT  DEFAULT NULL,
      erstellt_am  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scripts_kat   ON scripts(kategorie);
    CREATE INDEX IF NOT EXISTS idx_logs_sid      ON logs(script_id);
    CREATE INDEX IF NOT EXISTS idx_logs_time     ON logs(gestartet_am);
    CREATE INDEX IF NOT EXISTS idx_chain_steps   ON chain_steps(chain_id, position);
    CREATE INDEX IF NOT EXISTS idx_schedules_act ON schedules(aktiv);
  `);

  // ── Migration: bestehende DBs auf neues Schema heben ─────────────────
  // ALTER TABLE schlägt still fehl wenn Spalte bereits existiert → catch ignoriert das
  try { db.run(`ALTER TABLE scripts ADD COLUMN favorit INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.run(`ALTER TABLE logs ADD COLUMN chain_id INTEGER DEFAULT NULL`); } catch(_) {}
  try { db.run(`ALTER TABLE logs ADD COLUMN chain_name TEXT DEFAULT NULL`); } catch(_) {}

  // idx_scripts_fav erst NACH der Migration anlegen (Spalte muss existieren)
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_scripts_fav ON scripts(favorit)`); } catch(_) {}
  try { db.run(`ALTER TABLE chain_steps ADD COLUMN warte_typ TEXT NOT NULL DEFAULT 'timer'`); } catch(_) {}

  persist();

  const defaults = { db_version:'3', github_repo:'https://github.com/LiquidFlow-design/ScriptManager.git', github_branch:'main', theme:'dark' };
  for (const [k,v] of Object.entries(defaults)) run(`INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)`,[k,v]);

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
  const getAllSchedules   = ()   => all(`SELECT * FROM schedules ORDER BY name`);
  const getScheduleById   = (id) => get(`SELECT * FROM schedules WHERE id=?`,[id]);
  const getActiveSchedules= ()   => all(`SELECT * FROM schedules WHERE aktiv=1`);

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

  const deleteSchedule    = (id) => { run(`DELETE FROM schedules WHERE id=?`,[id]); return { success:true }; };
  const updateScheduleRun = (id,next) => run(`UPDATE schedules SET letzter_lauf=?,naechster_lauf=? WHERE id=?`,[localNow(),next||null,id]);
  const deactivateSchedule= (id) => run(`UPDATE schedules SET aktiv=0 WHERE id=?`,[id]);

  // ════════════════════════════════════════════════════════════════════════
  //  LOGS
  // ════════════════════════════════════════════════════════════════════════
  const logExecution = (scriptId, status, output) => {
    const s=getScriptById(scriptId);
    run(`INSERT INTO logs (script_id,script_name,status,output,gestartet_am) VALUES (?,?,?,?,?)`,
      [scriptId, s?s.name:'Unbekannt', status, output||'', localNow()]);
  };

  const getRecentLogs    = (limit=200) => all(`SELECT l.*,s.dateiname FROM logs l LEFT JOIN scripts s ON l.script_id=s.id ORDER BY l.gestartet_am DESC LIMIT ?`,[limit]);
  const getLogsByScript  = (id) => all(`SELECT * FROM logs WHERE script_id=? ORDER BY gestartet_am DESC LIMIT 50`,[id]);
  const clearLogById     = (id) => { run(`DELETE FROM logs WHERE id=?`,[id]); return { success:true }; };
  const clearLogsByScript= (id) => { run(`DELETE FROM logs WHERE script_id=?`,[id]); return { success:true }; };
  const clearAllLogs     = ()   => { run(`DELETE FROM logs`); try{run(`DELETE FROM sqlite_sequence WHERE name='logs'`);}catch(_){} return { success:true }; };
  const clearOldLogs     = (d)  => { run(`DELETE FROM logs WHERE gestartet_am < datetime('now','-'||?||' days','localtime')`,[d]); return { success:true }; };
  const getLogCount      = ()   => { const r=get(`SELECT COUNT(*) as n FROM logs`); return r?r.n:0; };

  // ════════════════════════════════════════════════════════════════════════
  //  SETTINGS / CSV
  // ════════════════════════════════════════════════════════════════════════
  const getSetting    = (k)   => { const r=get(`SELECT value FROM settings WHERE key=?`,[k]); return r?r.value:null; };
  const setSetting    = (k,v) => { run(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,[k,v]); return { success:true }; };
  const getAllSettings = ()    => Object.fromEntries(all(`SELECT key,value FROM settings`).map(r=>[r.key,r.value]));

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
  };
};
