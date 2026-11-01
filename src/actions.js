'use strict';

const os = require('os');
const path = require('path');

class ActionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MEDIA_KEYS = {
  volume_up: 175,
  volume_down: 174,
  mute: 173,
  next: 176,
  previous: 177,
  play_pause: 179,
};

const NEXTOR_ENDPOINTS = ['comando', 'falar', 'anotar', 'conversar'];

function text(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim()) throw new ActionError(`Campo "${field}" obrigatorio.`);
  if (value.length > max) throw new ActionError(`Campo "${field}" passa de ${max} caracteres.`);
  return value.trim();
}

function oneOf(value, options, field) {
  if (!options.includes(value)) throw new ActionError(`Campo "${field}" deve ser um de: ${options.join(', ')}.`);
  return value;
}

function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

// Every action a button can trigger. The phone can only pick a type from this
// list and fill in validated parameters: it can never send a raw command.
const CATALOG = {
  'app.launch': {
    label: 'Abrir aplicativo',
    validate(p, ctx) {
      const appPath = text(p.path, 'path', 400);
      if (!ctx.apps.isAllowed(appPath)) throw new ActionError('Aplicativo fora do Menu Iniciar.');
      return { path: appPath };
    },
    run: (p, ctx) => ctx.runner.run('explorer.exe', [p.path]),
  },
  'url.open': {
    label: 'Abrir site',
    validate(p) {
      let url;
      try {
        url = new URL(text(p.url, 'url', 2000));
      } catch {
        throw new ActionError('URL invalida.');
      }
      if (!['http:', 'https:'].includes(url.protocol)) throw new ActionError('Apenas links http ou https.');
      return { url: url.href };
    },
    run: (p, ctx) => ctx.runner.run('explorer.exe', [p.url]),
  },
  'media.key': {
    label: 'Midia e volume',
    validate: (p) => ({ key: oneOf(p.key, Object.keys(MEDIA_KEYS), 'key') }),
    run: (p, ctx) =>
      ctx.runner.powershell(`(New-Object -ComObject WScript.Shell).SendKeys([char]${MEDIA_KEYS[p.key]})`),
  },
  'system.lock': {
    label: 'Bloquear o PC',
    validate: () => ({}),
    run: (p, ctx) => ctx.runner.run('rundll32.exe', ['user32.dll,LockWorkStation']),
  },
  'system.show_desktop': {
    label: 'Mostrar area de trabalho',
    validate: () => ({}),
    run: (p, ctx) => ctx.runner.powershell('(New-Object -ComObject Shell.Application).ToggleDesktop()'),
  },
  'system.sleep': {
    label: 'Suspender',
    confirm: true,
    validate: () => ({}),
    run: (p, ctx) =>
      ctx.runner.powershell(
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)',
      ),
  },
  'system.shutdown': {
    label: 'Desligar (em 30 s)',
    confirm: true,
    validate: () => ({}),
    run: (p, ctx) => ctx.runner.run('shutdown.exe', ['/s', '/t', '30']),
  },
  'system.cancel_shutdown': {
    label: 'Cancelar desligamento',
    validate: () => ({}),
    run: (p, ctx) => ctx.runner.run('shutdown.exe', ['/a']),
  },
  'brightness.step': {
    label: 'Brilho',
    validate: (p) => ({ direction: oneOf(p.direction, ['up', 'down'], 'direction') }),
    run: (p, ctx) => {
      const delta = p.direction === 'up' ? 10 : -10;
      return ctx.runner.powershell(
        '$b = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness; ' +
          `$n = [Math]::Max(0, [Math]::Min(100, $b + (${delta}))); ` +
          'Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | ' +
          'Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = $n } | Out-Null',
      );
    },
  },
  'screenshot.save': {
    label: 'Captura de tela',
    validate: () => ({}),
    run: (p, ctx) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(ctx.picturesDir || path.join(os.homedir(), 'Pictures'), `NexDeck_${stamp}.png`);
      return ctx.runner.powershell(
        'Add-Type -AssemblyName System.Windows.Forms, System.Drawing; ' +
          '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ' +
          '$img = New-Object System.Drawing.Bitmap $b.Width, $b.Height; ' +
          '$g = [System.Drawing.Graphics]::FromImage($img); ' +
          '$g.CopyFromScreen($b.X, $b.Y, 0, 0, $img.Size); ' +
          `$img.Save(${psQuote(file)}, [System.Drawing.Imaging.ImageFormat]::Png); ` +
          '$g.Dispose(); $img.Dispose()',
      );
    },
  },
  'nextor.send': {
    label: 'Enviar ao Nextor',
    validate: (p) => ({
      endpoint: oneOf(p.endpoint, NEXTOR_ENDPOINTS, 'endpoint'),
      texto: text(p.texto, 'texto'),
    }),
    run: (p, ctx) => ctx.nextor.send(p.endpoint, p.texto),
  },
  'custom.run': {
    label: 'Acao personalizada (definida no PC)',
    validate(p, ctx) {
      const id = text(p.id, 'id', 64);
      if (!ctx.custom.get(id)) throw new ActionError(`Acao personalizada "${id}" nao existe em data/custom-actions.json.`);
      return { id };
    },
    run: (p, ctx) => {
      const def = ctx.custom.get(p.id);
      if (!def) throw new ActionError('Acao personalizada removida.', 404);
      return ctx.runner.run(def.command, def.args || []);
    },
  },
};

function validateAction(action, ctx) {
  if (!action || typeof action !== 'object') throw new ActionError('Acao ausente.');
  const def = CATALOG[action.type];
  if (!def) throw new ActionError(`Tipo de acao desconhecido: ${action.type}`);
  return { type: action.type, params: def.validate(action.params || {}, ctx) };
}

async function runAction(action, ctx, { confirmed = false } = {}) {
  const valid = validateAction(action, ctx);
  const def = CATALOG[valid.type];
  if (def.confirm && !confirmed) throw new ActionError('Esta acao precisa de confirmacao.', 409);
  if (ctx.platform !== 'win32' && !valid.type.startsWith('nextor.')) {
    throw new ActionError('Esta acao so funciona no Windows.', 501);
  }
  return def.run(valid.params, ctx);
}

function describeCatalog() {
  return Object.entries(CATALOG).map(([type, def]) => ({ type, label: def.label, confirm: Boolean(def.confirm) }));
}

module.exports = { CATALOG, MEDIA_KEYS, NEXTOR_ENDPOINTS, ActionError, validateAction, runAction, describeCatalog };
