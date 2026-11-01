'use strict';

// Repository checks: JavaScript syntax and no emojis in tracked text files.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const TEXT = /\.(js|json|md|html|css|svg|yml|yaml|ps1|vbs|txt)$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'data'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

let failed = false;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (file.endsWith('.js')) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      failed = true;
      console.error(`syntax: ${rel}\n${err.stderr}`);
    }
  }
  if (TEXT.test(file) && rel !== 'package-lock.json') {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) {
        failed = true;
        console.error(`emoji: ${rel}:${i + 1}`);
      }
    });
  }
}
if (failed) process.exit(1);
console.log('checks ok');
