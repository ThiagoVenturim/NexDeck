'use strict';

const fs = require('fs');
const path = require('path');
const { ActionError, validateAction } = require('./actions');

const MAX_PAGES = 8;
const MAX_BUTTONS = 24;
const ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const ICON = /^[a-z0-9-]{1,40}$/;

const DEFAULT_DECK = {
  pages: [
    {
      name: 'Midia',
      buttons: [
        { id: 'play', label: 'Play/Pause', icon: 'play', color: '#11998e', action: { type: 'media.key', params: { key: 'play_pause' } } },
        { id: 'prev', label: 'Anterior', icon: 'skip-back', color: '#11998e', action: { type: 'media.key', params: { key: 'previous' } } },
        { id: 'next', label: 'Proxima', icon: 'skip-forward', color: '#11998e', action: { type: 'media.key', params: { key: 'next' } } },
        { id: 'vol_down', label: 'Vol -', icon: 'volume-1', color: '#0072ff', action: { type: 'media.key', params: { key: 'volume_down' } } },
        { id: 'vol_up', label: 'Vol +', icon: 'volume-2', color: '#0072ff', action: { type: 'media.key', params: { key: 'volume_up' } } },
        { id: 'mute', label: 'Mudo', icon: 'volume-x', color: '#0072ff', action: { type: 'media.key', params: { key: 'mute' } } },
      ],
    },
    {
      name: 'Sistema',
      buttons: [
        { id: 'desktop', label: 'Area de trabalho', icon: 'monitor', color: '#4a00e0', action: { type: 'system.show_desktop', params: {} } },
        { id: 'screenshot', label: 'Captura', icon: 'camera', color: '#f12711', action: { type: 'screenshot.save', params: {} } },
        { id: 'bright_down', label: 'Brilho -', icon: 'sun-dim', color: '#f5af19', action: { type: 'brightness.step', params: { direction: 'down' } } },
        { id: 'bright_up', label: 'Brilho +', icon: 'sun', color: '#f5af19', action: { type: 'brightness.step', params: { direction: 'up' } } },
        { id: 'lock', label: 'Bloquear', icon: 'lock', color: '#330867', action: { type: 'system.lock', params: {} } },
        { id: 'shutdown', label: 'Desligar', icon: 'power', color: '#b31217', action: { type: 'system.shutdown', params: {} } },
      ],
    },
    {
      name: 'Nextor',
      buttons: [
        { id: 'nextor_dia', label: 'Meu dia', icon: 'calendar', color: '#8e2de2', action: { type: 'nextor.send', params: { endpoint: 'comando', texto: 'o que tenho hoje' } } },
        { id: 'nextor_noticias', label: 'Noticias', icon: 'newspaper', color: '#8e2de2', action: { type: 'nextor.send', params: { endpoint: 'comando', texto: 'noticias' } } },
      ],
    },
  ],
};

function cleanButton(b, ctx, seen) {
  if (!b || typeof b !== 'object') throw new ActionError('Botao invalido.');
  if (!ID.test(b.id || '')) throw new ActionError(`Id de botao invalido: ${b.id}`);
  if (seen.has(b.id)) throw new ActionError(`Id de botao repetido: ${b.id}`);
  seen.add(b.id);
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, 40) : '';
  if (!label) throw new ActionError(`Botao ${b.id} sem nome.`);
  return {
    id: b.id,
    label,
    icon: ICON.test(b.icon || '') ? b.icon : 'square',
    color: COLOR.test(b.color || '') ? b.color : '#334155',
    action: validateAction(b.action, ctx),
  };
}

// Validates a whole deck coming from the phone before it touches the disk.
function validateDeck(deck, ctx) {
  if (!deck || !Array.isArray(deck.pages) || deck.pages.length === 0) throw new ActionError('Deck sem paginas.');
  if (deck.pages.length > MAX_PAGES) throw new ActionError(`No maximo ${MAX_PAGES} paginas.`);
  const seen = new Set();
  return {
    pages: deck.pages.map((page) => {
      const name = typeof page?.name === 'string' ? page.name.trim().slice(0, 30) : '';
      if (!name) throw new ActionError('Pagina sem nome.');
      const buttons = Array.isArray(page.buttons) ? page.buttons : [];
      if (buttons.length > MAX_BUTTONS) throw new ActionError(`No maximo ${MAX_BUTTONS} botoes por pagina.`);
      return { name, buttons: buttons.map((b) => cleanButton(b, ctx, seen)) };
    }),
  };
}

function createStore(dataDir) {
  const file = path.join(dataDir, 'deck.json');
  let cache = null;
  return {
    get() {
      if (!cache) {
        cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : structuredClone(DEFAULT_DECK);
      }
      return cache;
    },
    save(deck) {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(deck, null, 2));
      fs.renameSync(tmp, file);
      cache = deck;
    },
    findButton(id) {
      for (const page of this.get().pages) {
        const b = page.buttons.find((x) => x.id === id);
        if (b) return b;
      }
      return null;
    },
  };
}

// Custom actions are defined only on the PC, in data/custom-actions.json:
// { "backup": { "label": "Backup", "command": "C:/tools/backup.exe", "args": ["--fast"] } }
function createCustomActions(dataDir) {
  const file = path.join(dataDir, 'custom-actions.json');
  const load = () => {
    if (!fs.existsSync(file)) return {};
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = {};
    for (const [id, def] of Object.entries(raw)) {
      if (ID.test(id) && typeof def?.command === 'string' && (!def.args || Array.isArray(def.args))) {
        out[id] = { label: String(def.label || id).slice(0, 40), command: def.command, args: (def.args || []).map(String) };
      }
    }
    return out;
  };
  return {
    get: (id) => load()[id] || null,
    list: () => Object.entries(load()).map(([id, d]) => ({ id, label: d.label })),
  };
}

module.exports = { DEFAULT_DECK, validateDeck, createStore, createCustomActions };
