/**
 * main.js – Electron Hauptprozess v2.1
 * Neu: Favoriten, Chains (Verkettungen) mit Live-Output, Scheduler
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');

const IS_PACKAGED = app.isPackaged;
const APP_DATA   = path.join(app.getPath('appData'), 'PSScriptManager');
const DB_PATH    = path.join(APP_DATA, 'scriptmanager.db');
const LOG_DIR    = path.join(APP_DATA, 'Logs');
const LIB_DIR    = path.join(APP_DATA, 'lib');
const BUILTIN_LIB= IS_PACKAGED ? path.join(process.resourcesPath,'lib') : path.join(__dirname,'lib');

[APP_DATA, LOG_DIR, LIB_DIR].forEach(d => { if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });

if(IS_PACKAGED && fs.existsSync(BUILTIN_LIB)) {
  try {
    fs.readdirSync(BUILTIN_LIB).filter(f=>f.toLowerCase().endsWith('.ps1')).forEach(f=>{
      const dest=path.join(LIB_DIR,f);
      if(!fs.existsSync(dest)) fs.copyFileSync(path.join(BUILTIN_LIB,f),dest);
    });
  } catch(e) { console.error('Builtin-Copy Fehler:',e); }
}

const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = false;

let db             = null;
let mainWindow;
let tray           = null;
let runningProc    = null;
let schedulerTimer = null;
let isQuitting     = false;  // true = echtes Beenden, nicht nur in Tray minimieren

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1280, height:820, minWidth:900, minHeight:600,
    icon: path.join(__dirname,'assets','icon.ico'),
    frame:false, backgroundColor:'#0d0d14',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false }
  });
  mainWindow.loadFile('renderer/index.html');
  if(!IS_PACKAGED) mainWindow.webContents.openDevTools({mode:'detach'});

  // ── Fenster schließen → in Tray minimieren (nicht beenden) ──────────
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      // Beim ersten Minimieren in Tray kurz hinweisen
      if (tray && !app.isPackaged === false) {
        // Nur einmal anzeigen
      }
      showTrayNotification(
        'PS Script Manager läuft im Hintergrund',
        'Scheduler ist aktiv. Über das Tray-Icon wieder öffnen oder beenden.'
      );
    }
  });
}

function createTray() {
  // Icon aus assets/ laden – Fallback auf leeres Icon wenn nicht vorhanden
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon     = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('PS Script Manager');
  updateTrayMenu();

  // Doppelklick → Fenster öffnen
  tray.on('double-click', showWindow);
}

function updateTrayMenu(schedulerInfo) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: '⚡ PS Script Manager',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '📋 Öffnen',
      click: showWindow,
    },
    {
      label: schedulerInfo || '🕐 Scheduler aktiv',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '❌ Beenden',
      click: () => {
        isQuitting = true;
        if (schedulerTimer) clearInterval(schedulerTimer);
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showTrayNotification(title, body) {
  // Nur anzeigen wenn Benachrichtigungen unterstützt werden
  if (!Notification.isSupported()) return;
  // Erste Benachrichtigung nach dem Start unterdrücken
  if (!tray) return;
  new Notification({
    title,
    body,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    silent: true,
  }).show();
}

app.whenReady().then(async () => {
  try { db = await require('./database/db')(DB_PATH); } catch(e) { console.error('DB:',e); }
  createWindow();
  createTray();
  startScheduler();
});

app.on('window-all-closed', () => {
  // Fenster geschlossen → App läuft weiter im Tray (Scheduler bleibt aktiv)
  // Echtes Beenden nur über Tray-Menü → isQuitting = true
  if (process.platform === 'darwin') app.quit();
  // Windows/Linux: nichts tun → App bleibt im Tray
});

app.on('before-quit', () => {
  isQuitting = true;
  if (schedulerTimer) clearInterval(schedulerTimer);
});

function dbReady() { if(!db) throw new Error('DB nicht initialisiert'); return db; }
function send(ch,data) { if(mainWindow?.webContents && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch,data); }

// ── Fenster ───────────────────────────────────────────────────────────────
ipcMain.on('win:minimize', ()=>mainWindow.minimize());
ipcMain.on('app:quit',     ()=>{ isQuitting=true; app.quit(); });
ipcMain.on('win:maximize', ()=>mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize());
ipcMain.on('win:close',    ()=>{ mainWindow.hide(); showTrayNotification('PS Script Manager läuft weiter','Scheduler aktiv. Über das Tray-Icon öffnen oder beenden.'); });

// ── Scripts CRUD ─────────────────────────────────────────────────────────
ipcMain.handle('scripts:getAll',      ()      => dbReady().getAllScripts());
ipcMain.handle('scripts:getFavorites',()      => dbReady().getFavorites());
ipcMain.handle('scripts:getById',     (_e,id) => dbReady().getScriptById(id));
ipcMain.handle('scripts:add',         (_e,s)  => dbReady().addScript(s));
ipcMain.handle('scripts:update',      (_e,s)  => dbReady().updateScript(s));
ipcMain.handle('scripts:delete',      (_e,id) => dbReady().deleteScript(id));
ipcMain.handle('scripts:toggleFav',   (_e,id) => dbReady().toggleFavorit(id));

ipcMain.handle('scripts:readCode',  (_e,fn)     => { try { const p=path.join(LIB_DIR,path.basename(fn)); if(!fs.existsSync(p)) return {success:false,error:'Nicht gefunden: '+p}; return {success:true,code:fs.readFileSync(p,'utf-8')}; } catch(e){return{success:false,error:e.message};} });
ipcMain.handle('scripts:writeCode', (_e,fn,code)=> { try { fs.writeFileSync(path.join(LIB_DIR,path.basename(fn)),code,'utf-8'); return {success:true}; } catch(e){return{success:false,error:e.message};} });

// ── Script ausführen (einzeln, interaktiv) ────────────────────────────────
function spawnScript(script, params, onData, onEnd) {
  const filePath = path.join(LIB_DIR, script.dateiname);
  if(!fs.existsSync(filePath)) { onEnd(-2,'Datei nicht gefunden: '+filePath); return null; }

  const args = ['-ExecutionPolicy','Bypass','-NoProfile','-File',filePath,
    ...(params?params.trim().split(/\s+/).filter(Boolean):[])];

  const proc = cp.spawn('powershell.exe', args, {
    cwd:LIB_DIR, windowsHide:true, stdio:['pipe','pipe','pipe']
  });
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');

  let out='';
  const emit=(text,type)=>{ out+=text; text.split(/\r?\n/).forEach((l,i,a)=>{ if(l!==''||i<a.length-1) onData(l,type); }); };
  proc.stdout.on('data',c=>emit(c,'stdout'));
  proc.stderr.on('data',c=>emit(c,'stderr'));
  proc.on('close', code=>onEnd(code,out));
  proc.on('error', e=>{ onData('❌ '+e.message,'stderr'); onEnd(-1,out); });
  return proc;
}

ipcMain.handle('scripts:run', (_e,id,params) => {
  const d=dbReady(), script=d.getScriptById(id);
  if(!script) return {success:false,error:'Script nicht gefunden'};
  if(runningProc) { try{runningProc.kill();}catch(_){} runningProc=null; }

  send('terminal:start',{id,name:script.name});
  return new Promise(resolve=>{
    runningProc=spawnScript(script,params,
      (line,type)=>send('terminal:data',{line,type}),
      (code,fullOutput)=>{
        runningProc=null;
        const ok=code===0;
        d.logExecution(id,ok?'success':'error',fullOutput);
        d.updateLastRun(id);
        send('terminal:end',{code,success:ok});
        resolve({success:ok,exitCode:code});
      }
    );
    if(!runningProc) resolve({success:false,error:'Spawn fehlgeschlagen'});
  });
});

ipcMain.on('terminal:input',(_e,text)=>{ if(runningProc?.stdin&&!runningProc.stdin.destroyed) try{runningProc.stdin.write(text+'\n');}catch(_){} });
ipcMain.on('terminal:kill', ()=>{ if(runningProc){try{runningProc.kill();}catch(_){} runningProc=null;} });

// ══════════════════════════════════════════════════════════════════════════
//  CHAINS – Verkettungen
// ══════════════════════════════════════════════════════════════════════════
ipcMain.handle('chains:getAll',   ()       => dbReady().getAllChains());
ipcMain.handle('chains:getById',  (_e,id)  => dbReady().getChainById(id));
ipcMain.handle('chains:getSteps', (_e,id)  => dbReady().getChainSteps(id));
ipcMain.handle('chains:add',      (_e,c)   => dbReady().addChain(c));
ipcMain.handle('chains:update',   (_e,c)   => dbReady().updateChain(c));
ipcMain.handle('chains:delete',   (_e,id)  => dbReady().deleteChain(id));
ipcMain.handle('chains:saveSteps',(_e,id,steps)=>dbReady().saveChainSteps(id,steps));

// Chain ausführen – alle Schritte sequenziell, Live-Events pro Schritt
ipcMain.handle('chains:run', (_e,chainId) => {
  const d     = dbReady();
  const chain = d.getChainById(chainId);
  if(!chain) return {success:false,error:'Chain nicht gefunden'};
  const steps = d.getChainSteps(chainId);
  if(!steps.length) return {success:false,error:'Chain hat keine Schritte'};

  // Renderer informieren: Chain startet
  send('chain:start',{ chainId, chainName:chain.name, total:steps.length });

  return new Promise(async resolve=>{
    let chainSuccess=true;
    const allOutput=[];

    for(let i=0; i<steps.length; i++){
      const step   = steps[i];
      const script = d.getScriptById(step.script_id);
      if(!script){ send('chain:stepSkip',{index:i,reason:'Script nicht gefunden'}); continue; }

      // Schritt beginnt
      send('chain:stepStart',{ index:i, total:steps.length, scriptName:script.name, scriptId:script.id });

      // Warten vor dem Schritt – je nach warte_typ
      const warteTyp = step.warte_typ || 'timer';

      if (warteTyp === 'auf_abschluss') {
        // Auf Abschluss des vorherigen Schritts warten ist bereits durch das
        // sequenzielle await oben sichergestellt. Hier: optionale Pause danach.
        if (step.pause_sek > 0) {
          send('chain:data', {index:i, line:`⏳ ${step.pause_sek}s Pause nach vorherigem Schritt…`, type:'info'});
          await new Promise(r => setTimeout(r, step.pause_sek * 1000));
        } else {
          send('chain:data', {index:i, line:`⏸ Starte sobald vorheriger Schritt beendet…`, type:'info'});
          // Kein zusätzlicher Delay — nächster Schritt startet sofort nach Abschluss
        }
      } else {
        // timer: feste Pause in Sekunden
        if (step.pause_sek > 0) {
          send('chain:data', {index:i, line:`⏳ Warte ${step.pause_sek}s vor diesem Schritt…`, type:'info'});
          await new Promise(r => setTimeout(r, step.pause_sek * 1000));
        }
      }

      const stepResult = await new Promise(res=>{
        const proc=spawnScript(script, step.parameter||'',
          (line,type)=>send('chain:data',{index:i,scriptName:script.name,line,type}),
          (code,out)=>{
            const ok=code===0;
            d.logChainExecution(chainId,chain.name,script.id,ok?'success':'error',out);
            d.updateLastRun(script.id);
            allOutput.push({ step:i+1, script:script.name, exitCode:code, output:out });
            res({success:ok,exitCode:code,output:out});
          }
        );
        if(!proc) res({success:false,exitCode:-2});
      });

      send('chain:stepEnd',{ index:i, scriptName:script.name, success:stepResult.success, exitCode:stepResult.exitCode });

      if(!stepResult.success){
        chainSuccess=false;
        if(chain.bei_fehler==='stop'){
          send('chain:data',{index:i,line:`🛑 Chain gestoppt: "${script.name}" fehlgeschlagen (Exit ${stepResult.exitCode})`,type:'stderr'});
          break;
        }
        // bei_fehler === 'weiter': nächster Schritt trotz Fehler
        send('chain:data',{index:i,line:`⚠️ Fehler ignoriert, weiter mit nächstem Schritt…`,type:'info'});
      }
    }

    send('chain:end',{ chainId, chainName:chain.name, success:chainSuccess });
    resolve({ success:chainSuccess, steps:allOutput });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  SCHEDULES – Geplante Ausführungen
// ══════════════════════════════════════════════════════════════════════════
ipcMain.handle('schedules:getAll',   ()      => dbReady().getAllSchedules());
ipcMain.handle('schedules:getById',  (_e,id) => dbReady().getScheduleById(id));
ipcMain.handle('schedules:add',      (_e,s)  => dbReady().addSchedule(s));
ipcMain.handle('schedules:update',   (_e,s)  => dbReady().updateSchedule(s));
ipcMain.handle('schedules:delete',   (_e,id) => dbReady().deleteSchedule(id));

// Scheduler-Ticker: jede Minute prüfen ob ein Schedule fällig ist
function startScheduler() {
  if(schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(checkSchedules, 60_000);
  checkSchedules(); // sofort beim Start prüfen
}

function checkSchedules() {
  if(!db) return;
  const d       = dbReady();
  const active  = d.getActiveSchedules();
  const now     = new Date();
  const nowStr  = now.toISOString().slice(0,16); // "YYYY-MM-DDTHH:MM"

  for(const sched of active){
    let due = false;
    let nextRun = null;

    if(sched.typ==='einmalig' && sched.einmalig_am){
      // Format: "YYYY-MM-DDTHH:MM"
      if(sched.einmalig_am.slice(0,16)===nowStr && !sched.letzter_lauf){
        due=true;
        d.deactivateSchedule(sched.id); // einmalig → danach inaktiv
      }
    } else if(sched.typ==='taeglich' && sched.cron){
      // cron = "HH:MM"
      const [h,m] = sched.cron.split(':').map(Number);
      if(now.getHours()===h && now.getMinutes()===m){
        // Nicht doppelt ausführen in derselben Minute
        if(!sched.letzter_lauf || sched.letzter_lauf.slice(0,16)!==nowStr) due=true;
        const next=new Date(now); next.setDate(next.getDate()+1); next.setHours(h,m,0,0);
        nextRun=next.toISOString().slice(0,16);
      }
    } else if(sched.typ==='woechentlich' && sched.cron){
      // cron = "WOCHENTAG HH:MM"  z.B. "1 08:00" (0=So,1=Mo,...)
      const [dayStr,timeStr] = sched.cron.split(' ');
      const [h,m] = timeStr.split(':').map(Number);
      if(now.getDay()===parseInt(dayStr) && now.getHours()===h && now.getMinutes()===m){
        if(!sched.letzter_lauf || sched.letzter_lauf.slice(0,16)!==nowStr) due=true;
        const next=new Date(now); next.setDate(next.getDate()+7);
        nextRun=next.toISOString().slice(0,16);
      }
    }

    if(due){
      d.updateScheduleRun(sched.id, nextRun);
      send('scheduler:fired', { scheduleId:sched.id, scheduleName:sched.name, targetId:sched.target_id, targetTyp:sched.target_typ });
      showTrayNotification('🕐 Geplante Ausführung', `"${sched.name}" wird jetzt gestartet`);
      updateTrayMenu(`🕐 Zuletzt: ${sched.name}`);

      // Ausführen
      if(sched.target_typ==='script'){
        const script=d.getScriptById(sched.target_id);
        if(script){
          send('terminal:start',{id:script.id,name:`[Geplant] ${script.name}`});
          spawnScript(script,'',
            (line,type)=>send('terminal:data',{line,type}),
            (code,out)=>{ d.logExecution(script.id,code===0?'success':'error',out); d.updateLastRun(script.id); send('terminal:end',{code,success:code===0}); }
          );
        }
      } else if(sched.target_typ==='chain'){
        // Chain-Ausführung via eigenem IPC-Aufruf simulieren
        const chain=d.getChainById(sched.target_id);
        if(chain) ipcMain.emit('chains:run:internal', sched.target_id);
      }
    }
  }
}

// ── Logs ─────────────────────────────────────────────────────────────────
ipcMain.handle('logs:getRecent',      (_e,n)    => dbReady().getRecentLogs(n||200));
ipcMain.handle('logs:getByScript',    (_e,id)   => dbReady().getLogsByScript(id));
ipcMain.handle('logs:getCount',       ()        => ({count:dbReady().getLogCount()}));
ipcMain.handle('logs:clearById',      (_e,id)   => dbReady().clearLogById(id));
ipcMain.handle('logs:clearByScript',  (_e,id)   => dbReady().clearLogsByScript(id));
ipcMain.handle('logs:clearAll',       ()        => dbReady().clearAllLogs());
ipcMain.handle('logs:clearOlderThan', (_e,days) => dbReady().clearOldLogs(days));

// ── lib/ ─────────────────────────────────────────────────────────────────
ipcMain.handle('lib:listFiles', ()=>{ try{ if(!fs.existsSync(LIB_DIR)){fs.mkdirSync(LIB_DIR,{recursive:true});return[];} return fs.readdirSync(LIB_DIR).filter(f=>f.toLowerCase().endsWith('.ps1')).sort(); }catch(e){return[];} });
ipcMain.handle('lib:scanNew',   ()=>{ try{ if(!fs.existsSync(LIB_DIR)) return []; const files=fs.readdirSync(LIB_DIR).filter(f=>f.toLowerCase().endsWith('.ps1')); const known=dbReady().getAllScripts().map(s=>s.dateiname.toLowerCase()); return files.filter(f=>!known.includes(f.toLowerCase())); }catch(e){return[];} });
ipcMain.handle('lib:openFolder',()=>{ if(!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR,{recursive:true}); shell.openPath(LIB_DIR); return {success:true,path:LIB_DIR}; });
ipcMain.handle('lib:importFile',async()=>{ const r=await dialog.showOpenDialog(mainWindow,{title:'PS1 importieren',filters:[{name:'PowerShell',extensions:['ps1']}],properties:['openFile','multiSelections']}); if(r.canceled) return {success:false}; const copied=[]; for(const src of r.filePaths){const dest=path.join(LIB_DIR,path.basename(src));fs.copyFileSync(src,dest);copied.push(path.basename(src));} return {success:true,files:copied}; });
ipcMain.handle('lib:openCsv',   async()=>{ const r=await dialog.showOpenDialog(mainWindow,{title:'CSV importieren',filters:[{name:'CSV',extensions:['csv']}],properties:['openFile']}); if(r.canceled||!r.filePaths[0]) return {success:false}; try{return {success:true,content:fs.readFileSync(r.filePaths[0],'utf-8')};}catch(e){return {success:false,error:e.message};} });

// ── Git-Sync: PS1-Scripte aus Repo aktualisieren ────────────────────────
ipcMain.handle('git:sync', async (_e, repoUrl, branch) => {
  const usedBranch = branch || 'main';
  const results    = { success: false, output: '', newFiles: [], updatedFiles: [] };

  // Git-Ordner enthalten Read-only-Dateien → vor rmSync Flags entfernen
  const rmSafe = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    try { cp.execSync(`attrib -R "${dirPath}\\*.*" /S /D`, { timeout: 10000 }); } catch (_) {}
    fs.rmSync(dirPath, { recursive: true, force: true });
  };

  try { cp.execSync('git --version', { timeout: 5000 }); }
  catch { return { ...results, error: 'Git nicht gefunden. Bitte Git installieren.' }; }

  const tmpDir = path.join(APP_DATA, '_git_tmp');

  try {
    if (fs.existsSync(tmpDir)) rmSafe(tmpDir);

    const out = cp.execSync(
      `git clone --depth 1 --branch ${usedBranch} --filter=blob:none "${repoUrl}" "${tmpDir}"`,
      { encoding: 'utf8', timeout: 60000 }
    );
    results.output = out;

    const tmpLibPath = path.join(tmpDir, 'lib');
    if (!fs.existsSync(tmpLibPath))
      throw new Error('lib/-Ordner im Repo nicht gefunden. Bitte Repo-Struktur prüfen.');

    const ps1s  = fs.readdirSync(tmpLibPath).filter(f => f.toLowerCase().endsWith('.ps1'));
    const before = fs.existsSync(LIB_DIR)
      ? fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.ps1'))
      : [];

    if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
    for (const f of ps1s) fs.copyFileSync(path.join(tmpLibPath, f), path.join(LIB_DIR, f));

    results.newFiles     = ps1s.filter(f => !before.includes(f));
    results.updatedFiles = ps1s.filter(f =>  before.includes(f));
    results.success      = true;
    rmSafe(tmpDir);
    return results;
  } catch (e) {
    try { rmSafe(tmpDir); } catch (_) {}
    return { ...results, error: e.message, output: e.stderr || e.message };
  }
});

ipcMain.handle('git:status', async () => {
  try { cp.execSync('git --version', { timeout: 3000 }); }
  catch { return { available: false, error: 'Git nicht gefunden' }; }

  const gitDir = path.join(LIB_DIR, '.git');
  if (!fs.existsSync(gitDir)) return { available: false, noRepo: true };

  try {
    let trackingBranch = 'main';
    try {
      trackingBranch = cp.execSync(
        'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
        { cwd: LIB_DIR, encoding: 'utf8' }
      ).trim().replace('origin/', '');
    } catch { /* Fallback: main */ }

    cp.execSync(`git fetch origin ${trackingBranch}`, { cwd: LIB_DIR, timeout: 15000 });
    const local  = cp.execSync('git rev-parse HEAD',                       { cwd: LIB_DIR, encoding: 'utf8' }).trim();
    const remote = cp.execSync(`git rev-parse origin/${trackingBranch}`,   { cwd: LIB_DIR, encoding: 'utf8' }).trim();
    const log    = cp.execSync(`git log ${local}..${remote} --oneline`,    { cwd: LIB_DIR, encoding: 'utf8' }).trim();
    return { available: local !== remote, localHash: local.slice(0,7), remoteHash: remote.slice(0,7), commitLog: log, branch: trackingBranch };
  } catch (e) { return { available: false, error: e.message }; }
});

// ── Updates ───────────────────────────────────────────────────────────────
ipcMain.handle('update:check', async()=>{ try{ const r=await autoUpdater.checkForUpdates(); if(!r?.updateInfo) return{available:false}; const c=app.getVersion(),l=r.updateInfo.version; return{available:l!==c,currentVersion:c,latestVersion:l,releaseNotes:r.updateInfo.releaseNotes||''}; }catch(e){return{available:false,error:e.message};} });
ipcMain.handle('update:download',async()=>{ try{ autoUpdater.once('update-downloaded',()=>autoUpdater.quitAndInstall()); await autoUpdater.downloadUpdate(); return{success:true}; }catch(e){return{success:false,error:e.message};} });

// ── Settings IPC ─────────────────────────────────────────────────────────
ipcMain.handle('settings:set', (_e, key, value) => dbReady().setSetting(key, value));
ipcMain.handle('settings:get', (_e, key)        => ({ value: dbReady().getSetting(key) }));

// ── App-Info ──────────────────────────────────────────────────────────────
ipcMain.handle('app:info',()=>({ version:app.getVersion(), dataPath:APP_DATA, libPath:LIB_DIR, builtinLib:BUILTIN_LIB, dbPath:DB_PATH, platform:process.platform }));
