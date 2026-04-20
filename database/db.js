/**
 * database/db.js  –  SQLite-Datenbankschicht
 *
 * Verwendet sql.js (reines JavaScript, KEIN C++ / Windows SDK nötig).
 * Kein better-sqlite3, kein node-gyp, kein Visual Studio Build Tools Problem.
 *
 * Tabellen:
 *   scripts   – Script-Einträge (ersetzt scripts.csv)
 *   logs      – Ausführungsprotokoll
 *   settings  – App-Einstellungen Key/Value
 */

const fs        = require('fs');
const path      = require('path');
const initSqlJs = require('sql.js');
const { app }   = require('electron');

// ── WASM-Pfad: unterscheidet Dev vs. gepackte App ────────────────────────
// In package.json → extraResources wird sql-wasm.wasm nach resources/ kopiert
function getWasmPath() {
  if (app.isPackaged) {
    // Installiert: C:\Program Files\PS Script Manager\resources\sql-wasm.wasm
    return path.join(process.resourcesPath, 'sql-wasm.wasm');
  }
  // Dev: node_modules/sql.js/dist/sql-wasm.wasm
  return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

// ── Lokale Datetime-Formatierung ─────────────────────────────────────────
function localNow() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ════════════════════════════════════════════════════════════════════════════
//  Factory-Funktion  (async wegen WASM-Initialisierung)
//  Aufruf in main.js:  const db = await createDb(dbPath);
// ════════════════════════════════════════════════════════════════════════════
module.exports = async function createDb(dbPath) {

  const SQL = await initSqlJs({ locateFile: () => getWasmPath() });

  // Bestehende DB-Datei laden oder neue erstellen
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  // ── Datei auf Festplatte schreiben (nach jeder schreibenden Operation) ──
  function persist() {
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  }

  // ── Abfrage-Helfer ────────────────────────────────────────────────────

  /** SELECT → Array von Objekten */
  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  /** SELECT → erstes Ergebnis oder undefined */
  function get(sql, params = []) {
    return all(sql, params)[0];
  }

  /** INSERT / UPDATE / DELETE */
  function run(sql, params = []) {
    db.run(sql, params);
    persist();
  }

  /** INSERT → gibt neue ID zurück */
  function insert(sql, params = []) {
    db.run(sql, params);
    const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? null;
    persist();
    return id;
  }

  // ── Schema ────────────────────────────────────────────────────────────
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
      letztes_ausfuehren TEXT    DEFAULT NULL,
      erstellt_am        TEXT    NOT NULL,
      geaendert_am       TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id    INTEGER,
      script_name  TEXT,
      status       TEXT NOT NULL,
      output       TEXT DEFAULT '',
      gestartet_am TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scripts_kat ON scripts(kategorie);
    CREATE INDEX IF NOT EXISTS idx_logs_sid    ON logs(script_id);
    CREATE INDEX IF NOT EXISTS idx_logs_time   ON logs(gestartet_am);
  `);
  persist();

  // ── Standard-Einstellungen ────────────────────────────────────────────
  const defaults = {
    db_version:    '2',
    github_repo:   'https://github.com/LiquidFlow-design/Scripte.git',
    github_branch: 'main',
    theme:         'dark',
  };
  for (const [k, v] of Object.entries(defaults)) {
    run(`INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)`, [k, v]);
  }

  // ════════════════════════════════════════════════════════════════════
  //  SCRIPTS
  // ════════════════════════════════════════════════════════════════════

  const getAllScripts = () =>
    all(`SELECT * FROM scripts ORDER BY kategorie, name`);

  const getScriptById = (id) =>
    get(`SELECT * FROM scripts WHERE id=?`, [id]);

  const addScript = (s) => {
    const now = localNow();
    const id  = insert(
      `INSERT INTO scripts
         (name,dateiname,kategorie,beschreibung,autor,parameter,aktiviert,erstellt_am,geaendert_am)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        s.name         || '',
        s.dateiname    || '',
        s.kategorie    || 'Allgemein',
        s.beschreibung || '',
        s.autor        || '',
        s.parameter    || '',
        s.aktiviert !== undefined ? (s.aktiviert ? 1 : 0) : 1,
        now, now,
      ]
    );
    return { success: true, id };
  };

  const updateScript = (s) => {
    run(
      `UPDATE scripts SET
         name=?,dateiname=?,kategorie=?,beschreibung=?,
         autor=?,parameter=?,aktiviert=?,geaendert_am=?
       WHERE id=?`,
      [
        s.name         || '',
        s.dateiname    || '',
        s.kategorie    || 'Allgemein',
        s.beschreibung || '',
        s.autor        || '',
        s.parameter    || '',
        s.aktiviert !== undefined ? (s.aktiviert ? 1 : 0) : 1,
        localNow(),
        s.id,
      ]
    );
    return { success: true };
  };

  const deleteScript = (id) => {
    run(`DELETE FROM scripts WHERE id=?`, [id]);
    return { success: true };
  };

  const updateLastRun = (id) =>
    run(`UPDATE scripts SET letztes_ausfuehren=? WHERE id=?`, [localNow(), id]);

  // ════════════════════════════════════════════════════════════════════
  //  LOGS
  // ════════════════════════════════════════════════════════════════════

  const logExecution = (scriptId, status, output) => {
    const s = getScriptById(scriptId);
    run(
      `INSERT INTO logs (script_id,script_name,status,output,gestartet_am) VALUES (?,?,?,?,?)`,
      [scriptId, s ? s.name : 'Unbekannt', status, output || '', localNow()]
    );
  };

  const getRecentLogs = (limit = 100) =>
    all(
      `SELECT l.*, s.dateiname
       FROM logs l LEFT JOIN scripts s ON l.script_id=s.id
       ORDER BY l.gestartet_am DESC LIMIT ?`,
      [limit]
    );

  const getLogsByScript = (scriptId) =>
    all(
      `SELECT * FROM logs WHERE script_id=? ORDER BY gestartet_am DESC LIMIT 50`,
      [scriptId]
    );

  // ════════════════════════════════════════════════════════════════════
  //  SETTINGS
  // ════════════════════════════════════════════════════════════════════

  const getSetting = (key) => {
    const row = get(`SELECT value FROM settings WHERE key=?`, [key]);
    return row ? row.value : null;
  };

  const setSetting = (key, value) => {
    run(
      `INSERT INTO settings(key,value) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [key, value]
    );
    return { success: true };
  };

  const getAllSettings = () => {
    const rows = all(`SELECT key, value FROM settings`);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  };

  // ════════════════════════════════════════════════════════════════════
  //  CSV-IMPORT  (einmalige Migration von scripts.csv)
  // ════════════════════════════════════════════════════════════════════

  const importFromCsv = (csvContent) => {
    const lines = csvContent
      .replace(/^\uFEFF/, '')       // BOM entfernen
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return { imported: 0 };
    let imported = 0;
    for (const line of lines.slice(1)) {    // Header-Zeile überspringen
      const [, name, dateiname, kategorie, beschreibung, autor, parameter, aktiviert] = line.split(';');
      if (!name || !dateiname) continue;
      addScript({
        name:         name.trim(),
        dateiname:    dateiname.trim(),
        kategorie:    (kategorie    || '').trim() || 'Allgemein',
        beschreibung: (beschreibung || '').trim(),
        autor:        (autor        || '').trim(),
        parameter:    (parameter    || '').trim(),
        aktiviert:    (aktiviert    || '').trim() === '1',
      });
      imported++;
    }
    return { imported };
  };

  // ════════════════════════════════════════════════════════════════════
  //  LOG MANAGEMENT
  // ════════════════════════════════════════════════════════════════════

  // Einzelnen Log-Eintrag löschen
  const clearLogById = (id) => {
    run(`DELETE FROM logs WHERE id=?`, [id]);
    return { success: true };
  };

  // Alle Logs eines Scripts löschen
  const clearLogsByScript = (scriptId) => {
    run(`DELETE FROM logs WHERE script_id=?`, [scriptId]);
    return { success: true };
  };

  // Alle Logs löschen
  const clearAllLogs = () => {
    run(`DELETE FROM logs`);
    // SQLite: AUTOINCREMENT Counter zurücksetzen
    run(`DELETE FROM sqlite_sequence WHERE name='logs'`);
    return { success: true };
  };

  // Logs älter als N Tage löschen
  const clearOldLogs = (days) => {
    run(
      `DELETE FROM logs WHERE gestartet_am < datetime('now', '-' || ? || ' days', 'localtime')`,
      [days]
    );
    return { success: true };
  };

  // Anzahl aller Logs
  const getLogCount = () => {
    const row = get(`SELECT COUNT(*) as n FROM logs`);
    return row ? row.n : 0;
  };

  // ── Öffentliche API ───────────────────────────────────────────────────
  return {
    getAllScripts, getScriptById, addScript, updateScript, deleteScript, updateLastRun,
    logExecution,  getRecentLogs, getLogsByScript,
    clearLogById,  clearLogsByScript, clearAllLogs, clearOldLogs, getLogCount,
    getSetting,    setSetting,    getAllSettings,
    importFromCsv,
  };
};
