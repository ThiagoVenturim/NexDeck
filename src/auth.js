'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 60 * 1000;
const TICKET_TTL_MS = 30 * 1000;

// Loads the device token from data/secret.json, creating it on first run.
function loadOrCreateToken(dataDir) {
  const file = path.join(dataDir, 'secret.json');
  if (fs.existsSync(file)) {
    const { token } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof token === 'string' && token.length >= 32) return token;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const token = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(file, JSON.stringify({ token }, null, 2), { mode: 0o600 });
  return token;
}

function rotateToken(dataDir) {
  fs.rmSync(path.join(dataDir, 'secret.json'), { force: true });
  return loadOrCreateToken(dataDir);
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createAuth(token) {
  const failures = new Map(); // ip -> { count, since }
  const tickets = new Map(); // ticket -> expiresAt

  function blocked(ip) {
    const f = failures.get(ip);
    if (!f) return false;
    if (Date.now() - f.since > FAILURE_WINDOW_MS) {
      failures.delete(ip);
      return false;
    }
    return f.count >= MAX_FAILURES;
  }

  function fail(ip) {
    const f = failures.get(ip);
    if (!f || Date.now() - f.since > FAILURE_WINDOW_MS) failures.set(ip, { count: 1, since: Date.now() });
    else f.count += 1;
  }

  function bearer(req) {
    const header = req.get('authorization') || '';
    return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  }

  function requireToken(req, res, next) {
    const ip = req.ip;
    if (blocked(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
    const sent = bearer(req);
    if (sent && safeEqual(sent, token)) return next();
    fail(ip);
    return res.status(401).json({ error: 'Nao autorizado. Pareie o aparelho de novo.' });
  }

  // One-time tickets let EventSource (which cannot send headers) open the screen stream.
  function issueTicket() {
    const ticket = crypto.randomBytes(24).toString('base64url');
    tickets.set(ticket, Date.now() + TICKET_TTL_MS);
    return ticket;
  }

  function consumeTicket(ticket) {
    const expires = tickets.get(ticket);
    tickets.delete(ticket);
    return Boolean(expires && expires > Date.now());
  }

  return { requireToken, issueTicket, consumeTicket };
}

module.exports = { loadOrCreateToken, rotateToken, createAuth, safeEqual };
