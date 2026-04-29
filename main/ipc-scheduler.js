/**
 * main/ipc-scheduler.js – Scheduler-Loop + IPC-Handler für Schedules
 */

'use strict';

const state = require('./state');
const { secureHandle, requireSession, requireRole, logAudit, dbReady } = require('./session');
const { send } = require('./session');
const { showTrayNotification, updateTrayMenu } = require('./tray');

// ── Scheduler ─────────────────────────────────────────────────────────────────
function startScheduler() {
  if (state.schedulerTimer) clearInterval(state.schedulerTimer);
  state.schedulerTimer = setInterval(checkSchedules, 60_000);
  checkSchedules();
}

function checkSchedules() {
  if (!state.db) return;
  const d      = dbReady();
  const active = d.getActiveSchedules();
  const now    = new Date();
  const nowStr = now.toISOString().slice(0, 16);

  for (const sched of active) {
    let due = false, nextRun = null;

    if (sched.typ === 'einmalig' && sched.einmalig_am) {
      if (sched.einmalig_am.slice(0, 16) === nowStr && !sched.letzter_lauf) {
        due = true;
        d.deactivateSchedule(sched.id);
      }
    } else if (sched.typ === 'taeglich' && sched.cron) {
      const [h, m] = sched.cron.split(':').map(Number);
      if (now.getHours() === h && now.getMinutes() === m) {
        if (!sched.letzter_lauf || sched.letzter_lauf.slice(0, 16) !== nowStr) due = true;
        const next = new Date(now); next.setDate(next.getDate() + 1); next.setHours(h, m, 0, 0);
        nextRun = next.toISOString().slice(0, 16);
      }
    } else if (sched.typ === 'woechentlich' && sched.cron) {
      const [dayStr, timeStr] = sched.cron.split(' ');
      const [h, m] = timeStr.split(':').map(Number);
      if (now.getDay() === parseInt(dayStr) && now.getHours() === h && now.getMinutes() === m) {
        if (!sched.letzter_lauf || sched.letzter_lauf.slice(0, 16) !== nowStr) due = true;
        const next = new Date(now); next.setDate(next.getDate() + 7);
        nextRun = next.toISOString().slice(0, 16);
      }
    }

    if (due) {
      d.updateScheduleRun(sched.id, nextRun);
      send('scheduler:fired', {
        scheduleId: sched.id, scheduleName: sched.name,
        targetId: sched.target_id, targetTyp: sched.target_typ,
      });
      showTrayNotification('🕐 Geplante Ausführung', `"${sched.name}" wird jetzt gestartet`);
      updateTrayMenu(`🕐 Zuletzt: ${sched.name}`);

      if (sched.target_typ === 'script') {
        const script = d.getScriptById(sched.target_id);
        if (script) {
          const { spawnScript } = require('./ipc-scripts');
          send('terminal:start', { id: script.id, name: `[Geplant] ${script.name}` });
          spawnScript(
            script, '',
            (line, type) => send('terminal:data', { line, type }),
            (code, out) => {
              d.logExecution(script.id, code === 0 ? 'success' : 'error', out);
              d.updateLastRun(script.id);
              send('terminal:end', { code, success: code === 0 });
            }
          );
        }
      } else if (sched.target_typ === 'chain') {
        // Chain über ipcMain intern triggern
        const chainHandlerModule = require('./ipc-chains');
        // Direkt ausführen (simuliert ipcMain.invoke intern)
        // Wir rufen die DB-Logik direkt auf statt IPC-Roundtrip
        _runChainDirect(sched.target_id, d);
      } else if (sched.target_typ === 'api') {
        // API-Call zeitgesteuert ausführen
        const { runApiCallDirect, spawnScriptWithResponse } = require('./ipc-api');
        runApiCallDirect(sched.target_id, d, (line, type) => send('terminal:data', { line, type }))
          .then(result => {
            send('terminal:end', { code: result.ok ? 0 : 1, success: result.ok });
            if (result.ok && result.apiCall?.script_id) {
              const script = d.getScriptById(result.apiCall.script_id);
              if (script) {
                send('terminal:start', { id: script.id, name: `[API→Script] ${script.name}` });
                spawnScriptWithResponse(
                  script, script.parameter || '',
                  result.body,
                  result.apiCall.response_modus,
                  result.apiCall.response_param,
                  (line, type) => send('terminal:data', { line, type }),
                  (code, out) => {
                    d.logExecution(script.id, code === 0 ? 'success' : 'error', out);
                    d.updateLastRun(script.id);
                    send('terminal:end', { code, success: code === 0 });
                  }
                );
              }
            }
          });
      }
    }
  }
}

function _runChainDirect(chainId, d) {
  const chain = d.getChainById(chainId);
  if (!chain) return;
  const steps = d.getChainSteps(chainId);
  if (!steps.length) return;
  const { spawnScript } = require('./ipc-scripts');

  send('chain:start', { chainId, chainName: chain.name, total: steps.length });
  logAudit('chain_gestartet_geplant', 'chain', chainId, { name: chain.name });

  (async () => {
    let chainSuccess = true;
    for (let i = 0; i < steps.length; i++) {
      const step   = steps[i];
      const script = d.getScriptById(step.script_id);
      if (!script) continue;
      send('chain:stepStart', { index: i, scriptId: script.id, scriptName: script.name, total: steps.length });
      const { ok, out } = await new Promise(res => {
        spawnScript(script, step.parameter || '',
          (line, type) => send('chain:data', { index: i, line, type }),
          (code, o)    => res({ ok: code === 0, out: o })
        );
      });
      d.logChainExecution(chainId, chain.name, script.id, ok ? 'success' : 'error', out);
      d.updateLastRun(script.id);
      send('chain:stepEnd', { index: i, scriptName: script.name, success: ok });
      if (!ok && chain.bei_fehler === 'stop') { chainSuccess = false; break; }
      if (i < steps.length - 1 && step.pause_sek > 0 && step.warte_typ !== 'skip')
        await new Promise(r => setTimeout(r, step.pause_sek * 1000));
    }
    send('chain:end', { chainId, success: chainSuccess });
  })();
}

// ── IPC-Handler ───────────────────────────────────────────────────────────────
function register(ipcMain) {
  secureHandle(ipcMain, 'schedules:getAll',  ()       => { requireSession(); return dbReady().getAllSchedules(); });
  secureHandle(ipcMain, 'schedules:getById', (_e, id) => { requireSession(); return dbReady().getScheduleById(id); });

  secureHandle(ipcMain, 'schedules:add', (_e, s) => {
    requireRole('admin');
    const result = dbReady().addSchedule(s);
    if (result.success) logAudit('schedule_erstellt', 'schedule', result.id, { name: s.name });
    return result;
  });

  secureHandle(ipcMain, 'schedules:update', (_e, s) => {
    requireRole('admin');
    const result = dbReady().updateSchedule(s);
    if (result.success) logAudit('schedule_geaendert', 'schedule', s.id, { name: s.name });
    return result;
  });

  secureHandle(ipcMain, 'schedules:delete', (_e, id) => {
    requireRole('admin');
    logAudit('schedule_geloescht', 'schedule', id, {});
    return dbReady().deleteSchedule(id);
  });
}

module.exports = { register, startScheduler };
