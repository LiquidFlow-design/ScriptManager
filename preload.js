/**
 * preload.js – v2.1
 * Neu: favorites, chains, schedules, chain live-events
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close:    () => ipcRenderer.send('win:close'),
  },

  scripts: {
    getAll:       ()           => ipcRenderer.invoke('scripts:getAll'),
    getFavorites: ()           => ipcRenderer.invoke('scripts:getFavorites'),
    getById:      (id)         => ipcRenderer.invoke('scripts:getById', id),
    add:          (s)          => ipcRenderer.invoke('scripts:add', s),
    update:       (s)          => ipcRenderer.invoke('scripts:update', s),
    delete:       (id)         => ipcRenderer.invoke('scripts:delete', id),
    toggleFav:    (id)         => ipcRenderer.invoke('scripts:toggleFav', id),
    readCode:     (fn)         => ipcRenderer.invoke('scripts:readCode', fn),
    writeCode:    (fn, code)   => ipcRenderer.invoke('scripts:writeCode', fn, code),
    run:          (id, params) => ipcRenderer.invoke('scripts:run', id, params),
  },

  chains: {
    getAll:    ()            => ipcRenderer.invoke('chains:getAll'),
    getById:   (id)          => ipcRenderer.invoke('chains:getById', id),
    getSteps:  (id)          => ipcRenderer.invoke('chains:getSteps', id),
    add:       (c)           => ipcRenderer.invoke('chains:add', c),
    update:    (c)           => ipcRenderer.invoke('chains:update', c),
    delete:    (id)          => ipcRenderer.invoke('chains:delete', id),
    saveSteps: (id, steps)   => ipcRenderer.invoke('chains:saveSteps', id, steps),
    run:       (id)          => ipcRenderer.invoke('chains:run', id),
  },

  schedules: {
    getAll:  ()    => ipcRenderer.invoke('schedules:getAll'),
    getById: (id)  => ipcRenderer.invoke('schedules:getById', id),
    add:     (s)   => ipcRenderer.invoke('schedules:add', s),
    update:  (s)   => ipcRenderer.invoke('schedules:update', s),
    delete:  (id)  => ipcRenderer.invoke('schedules:delete', id),
  },

  logs: {
    getRecent:      (n)    => ipcRenderer.invoke('logs:getRecent', n),
    getByScript:    (id)   => ipcRenderer.invoke('logs:getByScript', id),
    getCount:       ()     => ipcRenderer.invoke('logs:getCount'),
    clearById:      (id)   => ipcRenderer.invoke('logs:clearById', id),
    clearByScript:  (id)   => ipcRenderer.invoke('logs:clearByScript', id),
    clearAll:       ()     => ipcRenderer.invoke('logs:clearAll'),
    clearOlderThan: (days) => ipcRenderer.invoke('logs:clearOlderThan', days),
  },

  lib: {
    listFiles:  () => ipcRenderer.invoke('lib:listFiles'),
    scanNew:    () => ipcRenderer.invoke('lib:scanNew'),
    openFolder: () => ipcRenderer.invoke('lib:openFolder'),
    importFile: () => ipcRenderer.invoke('lib:importFile'),
    openCsv:    () => ipcRenderer.invoke('lib:openCsv'),
  },

  update: {
    check:    () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
  },

  git: {
    status: ()               => ipcRenderer.invoke('git:status'),
    sync:   (url, branch)    => ipcRenderer.invoke('git:sync', url, branch),
  },

  app:      { info: () => ipcRenderer.invoke('app:info') },
  settings: {
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    get: (key)        => ipcRenderer.invoke('settings:get', key),
  },

  tray: {
    // App in Tray minimieren (Fenster ausblenden, Prozess läuft weiter)
    minimize: () => ipcRenderer.send('win:close'),
    // App wirklich beenden
    quit:     () => ipcRenderer.send('app:quit'),
  },

  // ── Terminal Events (einzelnes Script) ──────────────────────────────
  terminal: {
    onStart:   (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('terminal:start',h); return ()=>ipcRenderer.removeListener('terminal:start',h); },
    onData:    (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('terminal:data',h);  return ()=>ipcRenderer.removeListener('terminal:data',h);  },
    onEnd:     (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('terminal:end',h);   return ()=>ipcRenderer.removeListener('terminal:end',h);   },
    sendInput: (t)  => ipcRenderer.send('terminal:input', t),
    kill:      ()   => ipcRenderer.send('terminal:kill'),
  },

  // ── Chain Events (Live-Output der Verkettung) ────────────────────────
  chain: {
    onStart:     (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('chain:start',    h); return ()=>ipcRenderer.removeListener('chain:start',    h); },
    onStepStart: (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('chain:stepStart',h); return ()=>ipcRenderer.removeListener('chain:stepStart',h); },
    onData:      (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('chain:data',     h); return ()=>ipcRenderer.removeListener('chain:data',     h); },
    onStepEnd:   (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('chain:stepEnd',  h); return ()=>ipcRenderer.removeListener('chain:stepEnd',  h); },
    onEnd:       (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('chain:end',      h); return ()=>ipcRenderer.removeListener('chain:end',      h); },
  },

  // ── Scheduler Events ─────────────────────────────────────────────────
  scheduler: {
    onFired: (cb) => { const h=(_e,d)=>cb(d); ipcRenderer.on('scheduler:fired',h); return ()=>ipcRenderer.removeListener('scheduler:fired',h); },
  },
});
