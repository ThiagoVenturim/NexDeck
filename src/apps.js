'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 5 * 60 * 1000;
const LAUNCHABLE = new Set(['.lnk', '.url', '.exe', '.appref-ms']);
const SKIP = /uninstall|desinstalar|readme|help|ajuda|license|licen[cç]a/i;

function startMenuDirs(env = process.env) {
  const dirs = [];
  if (env.ProgramData) dirs.push(path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  return dirs.map((d) => path.resolve(d));
}

// Only shortcuts that live inside the Start Menu folders can be launched from the phone.
function isAllowedAppPath(candidate, dirs = startMenuDirs()) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  const resolved = path.resolve(candidate);
  if (!LAUNCHABLE.has(path.extname(resolved).toLowerCase())) return false;
  return dirs.some((dir) => {
    const rel = path.relative(dir, resolved);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

function scanApps(dirs = startMenuDirs()) {
  const seen = new Set();
  const apps = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!LAUNCHABLE.has(ext)) continue;
      const name = entry.name.slice(0, -ext.length);
      if (SKIP.test(name) || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      apps.push({ name, path: full });
    }
  };
  dirs.forEach(walk);
  return apps.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function createAppIndex(dirs = startMenuDirs()) {
  let cache = null;
  let cachedAt = 0;
  return {
    list() {
      if (!cache || Date.now() - cachedAt > CACHE_TTL_MS) {
        cache = scanApps(dirs);
        cachedAt = Date.now();
      }
      return cache;
    },
    isAllowed: (p) => isAllowedAppPath(p, dirs),
  };
}

module.exports = { startMenuDirs, isAllowedAppPath, scanApps, createAppIndex };
