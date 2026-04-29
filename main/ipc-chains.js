/**
 * main/ipc-chains.js – IPC-Handler für Chains (Verkettungen)
 */

'use strict';

const state = require('./state');
const { secureHandle, requireSession, requireRole, logAudit, dbReady } = require('./session');
const { send } = require('./session');

function register(ipcMain) {
  const { spawnScript } = require('./ipc-scripts');
  const { LIB_DIR }     = require('./paths');

  secureHandle(ipcMain, 'chains:getAll',    ()          => { requireSession(); return dbReady().getAllChains(); });
  secureHandle(ipcMain, 'chains:getById',   (_e, id)    => { requireSession(); return dbReady().getChainById(id); });
  secureHandle(ipcMain, 'chains:getSteps',  (_e, id)    => { requireSession(); return dbReady().getChainSteps(id); });
  secureHandle(ipcMain, 'chains:add',       (_e, c)     => { requireRole('admin'); return dbReady().addChain(c); });
  secureHandle(ipcMain, 'chains:update',    (_e, c)     => { requireRole('admin'); return dbReady().updateChain(c); });
  secureHandle(ipcMain, 'chains:delete',    (_e, id)    => { requireRole('admin'); return dbReady().deleteChain(id); });
  secureHandle(ipcMain, 'chains:saveSteps', (_e, id, st) => { requireRole('admin'); return dbReady().saveChainSteps(id, st); });

  secureHandle(ipcMain, 'chains:run', (_e, chainId) => {
    requireSession();
    const d     = dbReady();
    const chain = d.getChainById(chainId);
    if (!chain) return { success: false, error: 'Chain nicht gefunden' };
    const steps = d.getChainSteps(chainId);
    if (!steps.length) return { success: false, error: 'Chain hat keine Schritte' };

    // Berechtigungsprüfung für alle Schritte
    if (state.currentSession.rolle !== 'admin') {
      for (const step of steps) {
        if (!d.checkPermission(state.currentSession.id, step.script_id, 'darf_ausfuehren'))
          return { success: false, error: `Keine Berechtigung für Script "${step.script_name}" in dieser Chain` };
      }
    }

    logAudit('chain_gestartet', 'chain', chainId, { name: chain.name });
    send('chain:start', { chainId, chainName: chain.name, total: steps.length });

    return new Promise(async resolve => {
      let chainSuccess = true;
      const allOutput  = [];

      for (let i = 0; i < steps.length; i++) {
        const step   = steps[i];
        const script = d.getScriptById(step.script_id);
        if (!script) {
          send('chain:stepEnd', { index: i, success: false, error: 'Script nicht gefunden' });
          if (chain.bei_fehler === 'stop') { chainSuccess = false; break; }
          continue;
        }

        send('chain:stepStart', { index: i, scriptId: script.id, scriptName: script.name, total: steps.length });

        const stepOutput = await new Promise(res => {
          const lines = [];
          spawnScript(
            script, step.parameter || '',
            (line, type) => { lines.push(line); send('chain:data', { index: i, line, type }); },
            (code, out) => {
              const ok = code === 0;
              d.logChainExecution(chainId, chain.name, script.id, ok ? 'success' : 'error', out);
              d.updateLastRun(script.id);
              send('chain:stepEnd', { index: i, scriptName: script.name, success: ok, exitCode: code });
              res({ ok, out });
            }
          );
        });

        allOutput.push(stepOutput.out);
        if (!stepOutput.ok) {
          chainSuccess = false;
          if (chain.bei_fehler === 'stop') break;
        }

        // Pause zwischen Schritten
        if (i < steps.length - 1 && step.pause_sek > 0 && step.warte_typ !== 'skip') {
          await new Promise(r => setTimeout(r, step.pause_sek * 1000));
        }
      }

      logAudit(chainSuccess ? 'chain_erfolg' : 'chain_fehler', 'chain', chainId, { name: chain.name });
      send('chain:end', { chainId, success: chainSuccess, output: allOutput.join('\n') });
      resolve({ success: chainSuccess });
    });
  });
}

module.exports = { register };
