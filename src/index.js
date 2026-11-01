'use strict';

const os = require('os');
const qrcode = require('qrcode-terminal');
const { loadConfig } = require('./config');
const { loadOrCreateToken, rotateToken, createAuth } = require('./auth');
const { createStore, createCustomActions } = require('./store');
const { createAppIndex } = require('./apps');
const { createNextorClient } = require('./nextor');
const runner = require('./runner');
const { createApp } = require('./server');

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal) out.push(i.address);
    }
  }
  // Private ranges first: those are the ones the phone can reach on the same Wi-Fi.
  const isPrivate = (a) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  return out.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}

function main() {
  const config = loadConfig();
  const token = process.argv.includes('--rotate-token') ? rotateToken(config.dataDir) : loadOrCreateToken(config.dataDir);

  const app = createApp({
    config,
    runner,
    auth: createAuth(token),
    store: createStore(config.dataDir),
    custom: createCustomActions(config.dataDir),
    apps: createAppIndex(),
    nextor: createNextorClient(config.nextor),
  });

  app.listen(config.port, config.host, () => {
    const ip = lanAddresses()[0] || 'localhost';
    const pairUrl = `http://${ip}:${config.port}/#pair=${token}`;
    console.log('\nNexDeck rodando.');
    console.log(`  No PC:      http://localhost:${config.port}`);
    console.log(`  Pareamento: aponte a camera do celular para o QR code (mesmo Wi-Fi):\n`);
    qrcode.generate(pairUrl, { small: true });
    console.log(`  Ou abra no celular: ${pairUrl}`);
    console.log('  Nao compartilhe esse link: ele da controle do PC. Para trocar o token: npm start -- --rotate-token');
    console.log(`  Nextor: ${config.nextor.url ? config.nextor.url : 'nao configurado'}`);
    console.log(`  Espelhamento de tela: ${config.screenStream ? 'LIGADO' : 'desligado'}\n`);
  });
}

main();
