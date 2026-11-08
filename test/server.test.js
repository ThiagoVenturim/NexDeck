'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/server');
const { createAuth, loadOrCreateToken, safeEqual } = require('../src/auth');
const { createStore, createCustomActions, DEFAULT_DECK } = require('../src/store');
const { createNextorClient } = require('../src/nextor');
const { isAllowedAppPath } = require('../src/apps');
const { ROOT } = require('../src/config');
const { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXTS } = require('../src/actions');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexdeck-test-'));
const startMenu = path.join(dataDir, 'StartMenu');
fs.mkdirSync(startMenu, { recursive: true });
fs.writeFileSync(path.join(startMenu, 'Editor.lnk'), '');
fs.writeFileSync(
  path.join(dataDir, 'custom-actions.json'),
  JSON.stringify({ backup: { label: 'Backup', command: 'backup.exe', args: ['--fast'] } }),
);

const calls = [];
const runner = {
  run: async (file, args) => { calls.push({ file, args }); return Buffer.from(''); },
  powershell: async (script) => { calls.push({ file: 'powershell.exe', script }); return Buffer.from(''); },
};
const nextorCalls = [];
const fakeFetch = async (url, init) => {
  nextorCalls.push({ url, init });
  if (url.endsWith('/estado')) return new Response(JSON.stringify({ modo: 'normal', expressao: 'neutro' }), { status: 200 });
  if (url.endsWith('/modo')) {
    const { modo } = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, frase: 'Modo ' + modo, avisos: [], estado: { modo } }), { status: 200 });
  }
  if (url.endsWith('/estudos/disciplinas')) {
    return new Response(JSON.stringify({ ok: true, disciplinas: [{ id: 1, nome: 'Calculo' }] }), { status: 200 });
  }
  if (url.endsWith('/estudos/aulas/gravar')) {
    const { disciplina } = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, gravando: true, disciplina, mensagem: 'Gravacao iniciada.' }), { status: 200 });
  }
  if (url.endsWith('/estudos/aulas/parar')) {
    return new Response(JSON.stringify({ ok: true, gravando: false, mensagem: 'Gravacao finalizada.' }), { status: 200 });
  }
  if (url.endsWith('/estudos/aulas/status')) {
    return new Response(JSON.stringify({ ok: true, gravando: true, disciplina: 'Calculo' }), { status: 200 });
  }
  if (url.endsWith('/estudos/resumo')) {
    const { disciplina } = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        ok: true,
        disciplina,
        resumo: 'Resumo sobre derivadas.',
        flashcards: [{ pergunta: 'O que e derivada?', resposta: 'Taxa de variacao.', fonte: 'Aula 1' }],
      }),
      { status: 200 },
    );
  }
  if (url.endsWith('/estudos/quiz/gerar')) {
    const { disciplina } = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        ok: true,
        disciplina,
        questoes: [
          { id: 10, pergunta: 'Qual e o limite?', opcoes: ['0', '1', 'Infinito'], resposta_correta: '1', explicacao: 'Pelo teorema.', fonte: 'Livro' },
        ],
      }),
      { status: 200 },
    );
  }
  if (url.endsWith('/estudos/quiz/responder')) {
    const { questao_id, resposta } = JSON.parse(init.body);
    const correto = resposta === '1';
    return new Response(
      JSON.stringify({
        ok: true,
        correto,
        questao_id,
        resposta_correta: '1',
        explicacao: 'Pelo teorema.',
        fonte: 'Livro',
      }),
      { status: 200 },
    );
  }
  if (url.includes('/estudos/quiz/historico')) {
    return new Response(JSON.stringify({ ok: true, historico: [] }), { status: 200 });
  }
  if (url.endsWith('/estudos/perguntar')) {
    const { disciplina, pergunta } = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, disciplina, resposta: `Resposta para ${pergunta}` }), { status: 200 });
  }
  if (url.includes('/materiais')) {
    return new Response(JSON.stringify({ ok: true, id: 99, status: 'processado' }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true, resposta: 'Feito.' }), { status: 200 });
};

const token = loadOrCreateToken(dataDir);
let base;
let server;

function makeApp({ screenStream = false, platform = 'win32', nextorConfig = { url: 'http://nextor.local:5005', token: 'tk' } } = {}) {
  return createApp({
    config: { root: ROOT, screenStream },
    runner,
    platform,
    auth: createAuth(token),
    store: createStore(dataDir),
    custom: createCustomActions(dataDir),
    apps: { list: () => [{ name: 'Editor', path: path.join(startMenu, 'Editor.lnk') }], isAllowed: (p) => isAllowedAppPath(p, [startMenu]) },
    nextor: createNextorClient(nextorConfig, fakeFetch),
    log: () => {},
  });
}

function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

async function call(urlPath, { method = 'GET', body, auth = token, b = base } = {}) {
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${b}${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

function deckWith(action, extra = {}) {
  return { pages: [{ name: 'P', buttons: [{ id: 'x', label: 'X', icon: 'square', color: '#112233', action, ...extra }] }] };
}

before(async () => {
  server = await listen(makeApp({ screenStream: true }));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('token is persisted and long enough', () => {
  assert.ok(token.length >= 40);
  assert.equal(loadOrCreateToken(dataDir), token);
});

test('health is public, everything else needs the token', async () => {
  assert.equal((await call('/api/health', { auth: null })).status, 200);
  assert.equal((await call('/api/deck', { auth: null })).status, 401);
  assert.equal((await call('/api/deck', { auth: 'wrong-token' })).status, 401);
  const ok = await call('/api/deck');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.pages.length, DEFAULT_DECK.pages.length);
});

test('security headers and no CORS', async () => {
  const res = await call('/api/health', { auth: null });
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('a deck cannot carry an arbitrary shell command', async () => {
  const res = await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'shell', params: { cmd: 'calc.exe' } }) });
  assert.equal(res.status, 400);
  const legacy = await call('/api/deck', { method: 'PUT', body: { pages: [{ name: 'P', buttons: [{ id: 'x', label: 'X', type: 'command', value: 'calc' }] }] } });
  assert.equal(legacy.status, 400);
});

test('apps can only be launched from the Start Menu', async () => {
  const outside = await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'app.launch', params: { path: 'C:\\Windows\\System32\\cmd.exe' } }) });
  assert.equal(outside.status, 400);
  const traversal = await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'app.launch', params: { path: path.join(startMenu, '..', 'evil.lnk') } }) });
  assert.equal(traversal.status, 400);
  const inside = await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'app.launch', params: { path: path.join(startMenu, 'Editor.lnk') } }) });
  assert.equal(inside.status, 200);
  calls.length = 0;
  assert.equal((await call('/api/buttons/x/run', { method: 'POST', body: {} })).status, 200);
  assert.deepEqual(calls[0], { file: 'explorer.exe', args: [path.join(startMenu, 'Editor.lnk')] });
});

test('only http and https links are accepted', async () => {
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows/System32/cmd.exe', 'ms-settings:']) {
    assert.equal((await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'url.open', params: { url } }) })).status, 400, url);
  }
  assert.equal((await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'url.open', params: { url: 'https://example.com' } }) })).status, 200);
});

test('labels, icons and colors are sanitized', async () => {
  const res = await call('/api/deck', {
    method: 'PUT',
    body: deckWith({ type: 'system.lock', params: {} }, { label: `${'a'.repeat(60)}`, icon: '"><img src=x>', color: 'red;background:url(x)' }),
  });
  assert.equal(res.status, 200);
  const b = res.body.deck.pages[0].buttons[0];
  assert.equal(b.label.length, 40);
  assert.equal(b.icon, 'square');
  assert.equal(b.color, '#334155');
});

test('media keys map to fixed key codes', async () => {
  await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'media.key', params: { key: 'play_pause' } }) });
  calls.length = 0;
  await call('/api/buttons/x/run', { method: 'POST', body: {} });
  assert.match(calls[0].script, /\[char\]179\)$/);
  const bad = await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'media.key', params: { key: '179); calc' } }) });
  assert.equal(bad.status, 400);
});

test('shutdown needs an explicit confirmation', async () => {
  await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'system.shutdown', params: {} }) });
  calls.length = 0;
  assert.equal((await call('/api/buttons/x/run', { method: 'POST', body: {} })).status, 409);
  assert.equal(calls.length, 0);
  assert.equal((await call('/api/buttons/x/run', { method: 'POST', body: { confirm: true } })).status, 200);
  assert.deepEqual(calls[0], { file: 'shutdown.exe', args: ['/s', '/t', '30'] });
});

test('custom actions come only from the PC file', async () => {
  assert.equal((await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'custom.run', params: { id: 'nope' } }) })).status, 400);
  await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'custom.run', params: { id: 'backup' } }) });
  calls.length = 0;
  await call('/api/buttons/x/run', { method: 'POST', body: {} });
  assert.deepEqual(calls[0], { file: 'backup.exe', args: ['--fast'] });
});

test('Nextor bridge forwards text with the Nextor token', async () => {
  nextorCalls.length = 0;
  const res = await call('/api/nextor', { method: 'POST', body: { endpoint: 'comando', texto: 'o que tenho hoje' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.result.resposta, 'Feito.');
  assert.equal(nextorCalls[0].url, 'http://nextor.local:5005/comando');
  assert.equal(nextorCalls[0].init.headers['X-Nextor-Token'], 'tk');
  assert.deepEqual(JSON.parse(nextorCalls[0].init.body), { texto: 'o que tenho hoje' });
  assert.equal((await call('/api/nextor', { method: 'POST', body: { endpoint: 'apagar-tudo', texto: 'x' } })).status, 400);
});

test('Nextor disabled answers 503', async () => {
  const s = await listen(makeApp({ nextorConfig: { url: '', token: '' } }));
  const b = `http://127.0.0.1:${s.address().port}`;
  const res = await call('/api/nextor', { method: 'POST', body: { endpoint: 'falar', texto: 'oi' }, b });
  s.close();
  assert.equal(res.status, 503);
});

test('windows actions refuse to run on other systems', async () => {
  const s = await listen(makeApp({ platform: 'linux' }));
  const b = `http://127.0.0.1:${s.address().port}`;
  await call('/api/deck', { method: 'PUT', body: deckWith({ type: 'system.lock', params: {} }), b });
  const res = await call('/api/buttons/x/run', { method: 'POST', body: {}, b });
  s.close();
  assert.equal(res.status, 501);
});

test('screen stream tickets are single use', async () => {
  const { body } = await call('/api/screen/ticket', { method: 'POST' });
  assert.ok(body.ticket);
  const bad = await fetch(`${base}/api/screen?ticket=nope`);
  assert.equal(bad.status, 401);
  const controller = new AbortController();
  const first = await fetch(`${base}/api/screen?ticket=${body.ticket}`, { signal: controller.signal });
  assert.equal(first.status, 200);
  controller.abort();
  const reuse = await fetch(`${base}/api/screen?ticket=${body.ticket}`);
  assert.equal(reuse.status, 401);
});

test('screen stream is off unless enabled', async () => {
  const s = await listen(makeApp({ screenStream: false }));
  const b = `http://127.0.0.1:${s.address().port}`;
  const res = await call('/api/screen/ticket', { method: 'POST', b });
  s.close();
  assert.equal(res.status, 404);
});

test('repeated wrong tokens are rate limited', async () => {
  const s = await listen(makeApp());
  const b = `http://127.0.0.1:${s.address().port}`;
  let last;
  for (let i = 0; i < 11; i += 1) last = await call('/api/deck', { auth: `wrong-${i}`, b });
  const blockedEvenWithToken = await call('/api/deck', { b });
  s.close();
  assert.equal(last.status, 429);
  assert.equal(blockedEvenWithToken.status, 429);
});

test('Nextor companion: state, modes and chat go through fixed routes', async () => {
  nextorCalls.length = 0;
  const estado = await call('/api/nextor/estado');
  assert.equal(estado.status, 200);
  assert.equal(estado.body.modo, 'normal');
  assert.equal(nextorCalls[0].url, 'http://nextor.local:5005/estado');
  assert.equal(nextorCalls[0].init.headers['X-Nextor-Token'], 'tk');

  const modo = await call('/api/nextor/modo', { method: 'POST', body: { modo: 'leitura' } });
  assert.equal(modo.status, 200);
  assert.equal(modo.body.estado.modo, 'leitura');
  assert.equal((await call('/api/nextor/modo', { method: 'POST', body: { modo: '../config' } })).status, 400);

  assert.equal((await call('/api/nextor/identidade', { method: 'POST', body: { identidade: 'siri' } })).status, 400);
  assert.equal((await call('/api/nextor/identidade', { method: 'POST', body: { identidade: 'claude' } })).status, 200);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/identidade');

  const conversa = await call('/api/nextor/conversa', { method: 'POST', body: { texto: '  oi  ', falar: 'sim' } });
  assert.equal(conversa.status, 200);
  assert.deepEqual(JSON.parse(nextorCalls.at(-1).init.body), { texto: 'oi', falar: false });
  assert.equal((await call('/api/nextor/conversa', { method: 'POST', body: { texto: '' } })).status, 400);
  assert.equal((await call('/api/nextor/estado', { auth: null })).status, 401);
});

test('default deck contains Estudos page with configured study buttons', () => {
  const estudosPage = DEFAULT_DECK.pages.find((p) => p.name === 'Estudos');
  assert.ok(estudosPage, 'Estudos page should exist in DEFAULT_DECK');
  assert.equal(estudosPage.buttons.length, 6);
  const actionTypes = estudosPage.buttons.map((b) => b.action.type);
  assert.ok(actionTypes.includes('estudos.gravar_aula'));
  assert.ok(actionTypes.includes('estudos.parar_aula'));
  assert.ok(actionTypes.includes('estudos.resumo'));
  assert.ok(actionTypes.includes('estudos.quiz'));
  assert.ok(actionTypes.includes('estudos.flashcards'));
  assert.ok(actionTypes.includes('estudos.upload_material'));
});

test('estudos actions in catalog execute via Nextor bridge with token', async () => {
  nextorCalls.length = 0;
  calls.length = 0;

  // Recording start
  const recRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.gravar_aula', params: { disciplina: 'Calculo' } } },
  });
  assert.equal(recRes.status, 200);
  assert.equal(recRes.body.result.gravando, true);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/estudos/aulas/gravar');
  assert.equal(nextorCalls.at(-1).init.headers['X-Nextor-Token'], 'tk');

  // Recording stop
  const stopRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.parar_aula', params: {} } },
  });
  assert.equal(stopRes.status, 200);
  assert.equal(stopRes.body.result.gravando, false);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/estudos/aulas/parar');

  // Status
  const statusRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.status_aula', params: {} } },
  });
  assert.equal(statusRes.status, 200);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/estudos/aulas/status');

  // Resumo
  const resumoRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.resumo', params: { disciplina: 'Calculo' } } },
  });
  assert.equal(resumoRes.status, 200);
  assert.ok(resumoRes.body.result.resumo);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/estudos/resumo');

  // Perguntar
  const pergRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.perguntar', params: { disciplina: 'Calculo', pergunta: 'O que e limite?' } } },
  });
  assert.equal(pergRes.status, 200);
  assert.ok(pergRes.body.result.resposta);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/estudos/perguntar');
});

test('estudos quiz and flashcards generation and answer flow', async () => {
  nextorCalls.length = 0;

  // Quiz generation
  const quizRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.quiz', params: { disciplina: 'Calculo', quantidade: 3 } } },
  });
  assert.equal(quizRes.status, 200);
  assert.equal(quizRes.body.result.questoes.length, 1);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/estudos/quiz/gerar');

  // Quiz responder
  const ansRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.quiz_responder', params: { questao_id: 10, resposta: '1' } } },
  });
  assert.equal(ansRes.status, 200);
  assert.equal(ansRes.body.result.correto, true);
  assert.equal(nextorCalls.at(-1).url, 'http://nextor.local:5005/estudos/quiz/responder');

  // Flashcards
  const fcRes = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'estudos.flashcards', params: { disciplina: 'Calculo' } } },
  });
  assert.equal(fcRes.status, 200);
  assert.equal(fcRes.body.result.flashcards.length, 1);
});

test('estudos upload validates allowed types and size limit', async () => {
  // Reject forbidden file extension (.exe)
  const exeRes = await call('/api/actions/test', {
    method: 'POST',
    body: {
      action: {
        type: 'estudos.upload_material',
        params: {
          disciplina: 'Calculo',
          nome: 'trojan.exe',
          mimeType: 'application/x-msdownload',
          dados: Buffer.from('payload').toString('base64'),
        },
      },
    },
  });
  assert.equal(exeRes.status, 400);
  assert.ok(exeRes.body.error.includes('nao permitida'));

  // Reject file exceeding 10 MB limit
  const bigBuffer = Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 0x41);
  const bigRes = await call('/api/actions/test', {
    method: 'POST',
    body: {
      action: {
        type: 'estudos.upload_material',
        params: {
          disciplina: 'Calculo',
          nome: 'grande.pdf',
          mimeType: 'application/pdf',
          dados: bigBuffer.toString('base64'),
        },
      },
    },
  });
  assert.equal(bigRes.status, 400);
  assert.ok(bigRes.body.error.includes('excede o limite de 10 MB'));

  // Reject empty file
  const emptyRes = await call('/api/actions/test', {
    method: 'POST',
    body: {
      action: {
        type: 'estudos.upload_material',
        params: {
          disciplina: 'Calculo',
          nome: 'vazio.txt',
          mimeType: 'text/plain',
          dados: '',
        },
      },
    },
  });
  assert.equal(emptyRes.status, 400);

  // Reject invalid link protocol
  const badUrlRes = await call('/api/actions/test', {
    method: 'POST',
    body: {
      action: {
        type: 'estudos.upload_material',
        params: {
          disciplina: 'Calculo',
          tipo: 'link',
          url: 'ftp://files.example.com/notes.pdf',
        },
      },
    },
  });
  assert.equal(badUrlRes.status, 400);
});

test('estudos upload accepts valid image, pdf, text, and link', async () => {
  nextorCalls.length = 0;

  // Valid image upload
  const imgData = Buffer.from('fake-jpeg-data').toString('base64');
  const imgRes = await call('/api/actions/test', {
    method: 'POST',
    body: {
      action: {
        type: 'estudos.upload_material',
        params: {
          disciplina: 'Calculo',
          titulo: 'Foto do Quadro',
          nome: 'quadro.jpg',
          mimeType: 'image/jpeg',
          dados: imgData,
        },
      },
    },
  });
  assert.equal(imgRes.status, 200);
  assert.ok(nextorCalls.at(-1).url.includes('/estudos/disciplinas/Calculo/materiais'));
  assert.equal(nextorCalls.at(-1).init.headers['X-Nextor-Token'], 'tk');

  // Valid link upload
  const linkRes = await call('/api/actions/test', {
    method: 'POST',
    body: {
      action: {
        type: 'estudos.upload_material',
        params: {
          disciplina: 'Fisica',
          titulo: 'Artigo de Mecanica',
          tipo: 'link',
          url: 'https://exemplo.com/mecanica.pdf',
        },
      },
    },
  });
  assert.equal(linkRes.status, 200);
  assert.ok(nextorCalls.at(-1).url.includes('/estudos/disciplinas/Fisica/materiais'));
  assert.deepEqual(JSON.parse(nextorCalls.at(-1).init.body), {
    origem: 'https://exemplo.com/mecanica.pdf',
    titulo: 'Artigo de Mecanica',
    tipo: 'link',
  });
});

test('timing-safe auth comparison and route protections', async () => {
  // safeEqual comparison
  assert.equal(safeEqual('secret-token-12345', 'secret-token-12345'), true);
  assert.equal(safeEqual('secret-token-12345', 'secret-token-wrong'), false);
  assert.equal(safeEqual('abc', 'abcdef'), false);

  // Unauthenticated calls are rejected
  assert.equal((await call('/api/estudos/disciplinas', { auth: null })).status, 401);
  assert.equal((await call('/api/estudos/aulas/status', { auth: null })).status, 401);
  assert.equal((await call('/api/estudos/quiz/gerar', { method: 'POST', auth: null })).status, 401);
  assert.equal((await call('/api/estudos/upload', { method: 'POST', auth: null })).status, 401);

  // Unknown catalog action is rejected
  const unknownAct = await call('/api/actions/test', {
    method: 'POST',
    body: { action: { type: 'shell.exec', params: { command: 'dir' } } },
  });
  assert.equal(unknownAct.status, 400);

  // Ensure runner was never called for any estudos action
  assert.equal(calls.length, 0, 'No study action should ever invoke runner or powershell');
});
