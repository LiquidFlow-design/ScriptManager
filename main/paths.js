/**
 * main/paths.js – Zentrale Pfad-Konstanten
 * Wird von allen Main-Modulen importiert.
 */

'use strict';

const { app } = require('electron');
const path    = require('path');

const IS_PACKAGED = app.isPackaged;
const APP_DATA    = path.join(app.getPath('appData'), 'PSScriptManager');
const DB_PATH     = path.join(APP_DATA, 'scriptmanager.db');
const LOG_DIR     = path.join(APP_DATA, 'Logs');
const LIB_DIR     = path.join(APP_DATA, 'lib');
const BUILTIN_LIB = IS_PACKAGED
  ? path.join(process.resourcesPath, 'lib')
  : path.join(__dirname, '..', 'lib');

module.exports = { IS_PACKAGED, APP_DATA, DB_PATH, LOG_DIR, LIB_DIR, BUILTIN_LIB };
