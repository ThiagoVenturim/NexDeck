'use strict';

const { spawn } = require('child_process');

const TIMEOUT_MS = 15 * 1000;

// Runs a program WITHOUT a shell: arguments are passed as a list, so nothing
// coming from a request can be interpreted as shell syntax.
function run(file, args = [], { timeout = TIMEOUT_MS, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false, windowsHide: true });
    const out = [];
    const err = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${file} excedeu ${timeout / 1000}s`));
    }, timeout);
    if (capture) child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // explorer.exe returns 1 even when it succeeds.
      if (code === 0 || file.toLowerCase() === 'explorer.exe') {
        resolve(Buffer.concat(out));
      } else {
        reject(new Error(Buffer.concat(err).toString().trim() || `${file} saiu com codigo ${code}`));
      }
    });
  });
}

function powershell(script, opts) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], opts);
}

module.exports = { run, powershell };
