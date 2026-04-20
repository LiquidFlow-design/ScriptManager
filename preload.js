/**
 * preload.js – Sichere Brücke Renderer ↔ Main
 * Neu: terminal.sendInput / terminal.kill für Interactive Shell
 *      scripts.readCode / scripts.writeCode für Editor
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close:    () => ipcRenderer.send('win:close'),
  },

  scripts: {
    getAll:    ()               => ipcRenderer.invoke('scripts:getAll'),
    getById:   (id)             => ipcRenderer.invoke('scripts:getById', id),
    add:       (s)              => ipcRenderer.invoke('scripts:add', s),
    update:    (s)              => ipcRenderer.invoke('scripts:update', s),
    delete:    (id)             => ipcRenderer.invoke('scripts:delete', id),
    readCode:  (filename)       => ipcRenderer.invoke('scripts:readCode', filename),
    writeCode: (filename, code) => ipcRenderer.invoke('scripts:writeCode', filename, code),
    run:       (id, params)     => ipcRenderer.invoke('scripts:run', id, params),
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
    listFiles:  ()  => ipcRenderer.invoke('lib:listFiles'),
    scanNew:    ()  => ipcRenderer.invoke('lib:scanNew'),
    openFolder: ()  => ipcRenderer.invoke('lib:openFolder'),
    importFile: ()  => ipcRenderer.invoke('lib:importFile'),
    openCsv:    ()  => ipcRenderer.invoke('lib:openCsv'),
  },

  update: {
    check:    () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
  },

  git: {
    status: ()                       => ipcRenderer.invoke('git:status'),
    sync:   (repoUrl, branch)        => ipcRenderer.invoke('git:sync', repoUrl, branch),
  },

  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },

  // ── Terminal-Events: Main → Renderer ─────────────────────────────────
  terminal: {
    onStart:    (cb) => { const h = (_e,d) => cb(d); ipcRenderer.on('terminal:start', h); return () => ipcRenderer.removeListener('terminal:start', h); },
    onData:     (cb) => { const h = (_e,d) => cb(d); ipcRenderer.on('terminal:data',  h); return () => ipcRenderer.removeListener('terminal:data',  h); },
    onEnd:      (cb) => { const h = (_e,d) => cb(d); ipcRenderer.on('terminal:end',   h); return () => ipcRenderer.removeListener('terminal:end',   h); },
    // Renderer → Main: Eingabe in stdin schreiben
    sendInput:  (text) => ipcRenderer.send('terminal:input', text),
    // Prozess abbrechen
    kill:       ()     => ipcRenderer.send('terminal:kill'),
  },
});
