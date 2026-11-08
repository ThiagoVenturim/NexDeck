'use strict';

const express = require('express');
const path = require('path');
const { ActionError, MEDIA_KEYS, NEXTOR_ENDPOINTS, describeCatalog, runAction, validateAction } = require('./actions');
const { validateDeck } = require('./store');
const { streamScreen } = require('./screen');
const { version } = require('../package.json');

const LUCIDE = path.join(path.dirname(require.resolve('lucide/package.json')), 'dist', 'umd', 'lucide.min.js');

function securityHeaders(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}

// deps: { auth, store, apps, custom, nextor, runner, config, platform, log }
function createApp(deps) {
  const { auth, store, apps, custom, nextor, config } = deps;
  const log = deps.log || ((...a) => console.log(new Date().toISOString(), ...a));
  const ctx = { runner: deps.runner, apps, custom, nextor, platform: deps.platform || process.platform };

  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '15mb' }));
  app.use(express.static(path.join(config.root, 'public'), { index: 'index.html' }));
  app.get('/vendor/lucide.min.js', (req, res) => res.sendFile(LUCIDE));

  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'NexDeck', version }));

  // Screen stream authenticates with a one-time ticket because EventSource cannot send headers.
  app.get('/api/screen', (req, res) => {
    if (!config.screenStream) return res.status(404).json({ error: 'Espelhamento de tela desligado.' });
    if (!auth.consumeTicket(String(req.query.ticket || ''))) return res.status(401).json({ error: 'Ticket invalido.' });
    log('screen stream aberto por', req.ip);
    streamScreen(req, res, ctx.runner);
  });

  const api = express.Router();
  api.use(auth.requireToken);

  api.get('/deck', (req, res) => res.json(store.get()));

  api.put('/deck', (req, res) => {
    const deck = validateDeck(req.body, ctx);
    store.save(deck);
    log('deck salvo por', req.ip);
    res.json({ ok: true, deck });
  });

  api.get('/catalog', (req, res) =>
    res.json({
      actions: describeCatalog(),
      mediaKeys: Object.keys(MEDIA_KEYS),
      nextorEndpoints: NEXTOR_ENDPOINTS,
      nextor: nextor.enabled,
      screenStream: config.screenStream,
      custom: custom.list(),
    }),
  );

  api.get('/apps', (req, res) => res.json(ctx.platform === 'win32' ? apps.list() : []));

  api.post('/buttons/:id/run', async (req, res) => {
    const button = store.findButton(req.params.id);
    if (!button) throw new ActionError('Botao nao encontrado.', 404);
    log('acao', button.id, button.action.type, 'por', req.ip);
    const result = await runAction(button.action, ctx, { confirmed: req.body?.confirm === true });
    const isBridge = button.action.type.startsWith('nextor.') || button.action.type.startsWith('estudos.');
    res.json({ ok: true, button: button.id, result: isBridge ? result : undefined });
  });

  // Runs a catalog action without saving a button (used by the "Testar" button in the editor).
  api.post('/actions/test', async (req, res) => {
    const action = validateAction(req.body?.action, ctx);
    log('teste', action.type, 'por', req.ip);
    const result = await runAction(action, ctx, { confirmed: req.body?.confirm === true });
    const isBridge = action.type.startsWith('nextor.') || action.type.startsWith('estudos.');
    res.json({ ok: true, result: isBridge ? result : undefined });
  });

  api.post('/nextor', async (req, res) => {
    const result = await runAction({ type: 'nextor.send', params: req.body }, ctx);
    res.json({ ok: true, result });
  });

  // The Nextor companion ("bichinho"): state, modes and on-screen chat.
  api.get('/nextor/estado', async (req, res) => res.json(await nextor.estado()));
  api.post('/nextor/modo', async (req, res) => res.json(await nextor.modo(req.body?.modo)));
  api.post('/nextor/identidade', async (req, res) => res.json(await nextor.identidade(req.body?.identidade)));
  api.post('/nextor/conversa', async (req, res) => res.json(await nextor.conversa(req.body?.texto, req.body?.falar)));

  // Nextor study bridge endpoints
  api.get('/estudos/disciplinas', async (req, res) => res.json(await nextor.estudosDisciplinas()));
  api.get('/estudos/aulas/status', async (req, res) => res.json(await nextor.estudosStatusAula()));
  api.post('/estudos/aulas/gravar', async (req, res) => {
    const result = await runAction({ type: 'estudos.gravar_aula', params: req.body }, ctx);
    res.json({ ok: true, result });
  });
  api.post('/estudos/aulas/parar', async (req, res) => {
    const result = await runAction({ type: 'estudos.parar_aula', params: req.body }, ctx);
    res.json({ ok: true, result });
  });
  api.post('/estudos/resumo', async (req, res) => {
    const result = await runAction({ type: 'estudos.resumo', params: req.body }, ctx);
    res.json({ ok: true, result });
  });
  api.post('/estudos/quiz/gerar', async (req, res) => {
    const result = await runAction({ type: 'estudos.quiz', params: req.body }, ctx);
    res.json({ ok: true, result });
  });
  api.post('/estudos/quiz/responder', async (req, res) => {
    const result = await runAction({ type: 'estudos.quiz_responder', params: req.body }, ctx);
    res.json({ ok: true, result });
  });
  api.get('/estudos/quiz/historico', async (req, res) => {
    res.json(await nextor.estudosQuizHistorico(req.query.disciplina));
  });
  api.post('/estudos/perguntar', async (req, res) => {
    const result = await runAction({ type: 'estudos.perguntar', params: req.body }, ctx);
    res.json({ ok: true, result });
  });
  api.post('/estudos/upload', async (req, res) => {
    const result = await runAction({ type: 'estudos.upload_material', params: req.body }, ctx);
    res.json({ ok: true, result });
  });

  api.post('/screen/ticket', (req, res) => {
    if (!config.screenStream) return res.status(404).json({ error: 'Espelhamento de tela desligado.' });
    res.json({ ticket: auth.issueTicket() });
  });

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota inexistente.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ActionError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalido.' });
    log('erro', err.stack || err);
    res.status(500).json({ error: 'Erro ao executar a acao no PC.' });
  });

  return app;
}

module.exports = { createApp };
