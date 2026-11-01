'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// Minimal .env loader so the project has no dependency just for this.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value).toLowerCase());
}

function loadConfig(overrides = {}) {
  loadEnvFile(path.join(ROOT, '.env'));
  const env = process.env;
  const dataDir = overrides.dataDir || env.NEXDECK_DATA_DIR || path.join(ROOT, 'data');
  return {
    root: ROOT,
    host: env.NEXDECK_HOST || '0.0.0.0',
    port: Number(env.NEXDECK_PORT || 3210),
    dataDir,
    // Screen streaming exposes everything on the screen, so it is opt-in.
    screenStream: bool(env.NEXDECK_SCREEN_STREAM, false),
    nextor: {
      url: (env.NEXDECK_NEXTOR_URL || '').replace(/\/+$/, ''),
      token: env.NEXDECK_NEXTOR_TOKEN || '',
    },
    ...overrides,
  };
}

module.exports = { loadConfig, ROOT };
