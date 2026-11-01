'use strict';

(() => {
  const TOKEN_KEY = 'nexdeck.token';
  const $ = (id) => document.getElementById(id);
  const MEDIA_LABELS = {
    play_pause: 'Play/Pause', next: 'Proxima', previous: 'Anterior',
    volume_up: 'Volume +', volume_down: 'Volume -', mute: 'Mudo',
  };

  const state = { deck: null, catalog: null, page: 0, editing: false, apps: null, editTarget: null };

  // ---------------------------------------------------------------- token
  function readPairingToken() {
    const m = location.hash.match(/pair=([A-Za-z0-9_-]{32,})/);
    if (m) {
      try { localStorage.setItem(TOKEN_KEY, m[1]); } catch { /* private mode */ }
      history.replaceState(null, '', location.pathname);
    }
  }
  const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) showPairing();
    if (!res.ok) {
      const err = new Error(data.error || `Erro ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------------------------------------------------------------- ui helpers
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    children.forEach((c) => node.append(c));
    return node;
  }
  const icon = (name) => el('i', { 'data-lucide': name });
  const refreshIcons = () => window.lucide && window.lucide.createIcons();

  let toastTimer;
  function toast(message, kind = 'ok') {
    const t = $('toast');
    t.textContent = message;
    t.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      const d = $('confirm-dialog');
      $('confirm-text').textContent = message;
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
  }

  function showPairing() {
    $('app').hidden = true;
    $('pair-screen').hidden = false;
    refreshIcons();
  }

  // ---------------------------------------------------------------- render
  function render() {
    const { pages } = state.deck;
    state.page = Math.min(state.page, pages.length - 1);
    const tabs = $('tabs');
    tabs.replaceChildren(...pages.map((p, i) =>
      el('button', { class: `tab${i === state.page ? ' active' : ''}`, text: p.name, onclick: () => { state.page = i; render(); } })));

    const grid = $('grid');
    const buttons = pages[state.page].buttons.map((b) => {
      const card = el('button', { class: 'deck-btn', dataset: { id: b.id } }, [icon(b.icon), el('span', { class: 'label', text: b.label })]);
      card.style.setProperty('--btn-color', b.color);
      card.addEventListener('click', () => (state.editing ? openEditor(b) : press(b, card)));
      return card;
    });
    if (state.editing) {
      buttons.push(el('button', { class: 'deck-btn add', onclick: () => openEditor(null) }, [icon('plus'), el('span', { class: 'label', text: 'Novo botao' })]));
    }
    grid.replaceChildren(...buttons);
    grid.classList.toggle('editing', state.editing);
    $('edit-bar').hidden = !state.editing;
    $('nextor-bar').hidden = state.editing || !state.catalog.nextor;
    refreshIcons();
  }

  async function press(button, card) {
    if (navigator.vibrate) navigator.vibrate(15);
    card.classList.add('busy');
    const run = (confirm) => api(`/buttons/${encodeURIComponent(button.id)}/run`, { method: 'POST', body: { confirm } });
    try {
      let data;
      try {
        data = await run(false);
      } catch (err) {
        if (err.status !== 409) throw err;
        if (!(await confirmDialog(`Confirmar "${button.label}"?`))) return;
        data = await run(true);
      }
      card.classList.add('ok');
      if (data.result && data.result.resposta) toast(data.result.resposta);
    } catch (err) {
      card.classList.add('fail');
      toast(err.message, 'error');
    } finally {
      setTimeout(() => card.classList.remove('busy', 'ok', 'fail'), 450);
    }
  }

  // ---------------------------------------------------------------- swipe
  let touchX = null;
  $('grid').addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].screenX; }, { passive: true });
  $('grid').addEventListener('touchend', (e) => {
    if (touchX === null || state.editing) return;
    const dx = e.changedTouches[0].screenX - touchX;
    touchX = null;
    if (Math.abs(dx) < 60) return;
    const next = state.page + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < state.deck.pages.length) { state.page = next; render(); }
  }, { passive: true });

  // ---------------------------------------------------------------- editor
  function field(labelText, input) {
    return el('label', {}, [labelText, input]);
  }
  function select(name, options, value) {
    const s = el('select', { name });
    options.forEach(([v, t]) => s.append(el('option', { value: v, text: t })));
    if (value !== undefined) s.value = value;
    return s;
  }

  async function appPicker(params) {
    const search = el('input', { type: 'search', placeholder: 'Buscar aplicativo...' });
    const list = el('div', { class: 'app-list' });
    const chosen = el('input', { type: 'hidden', name: 'path', value: params.path || '' });
    const draw = () => {
      const q = search.value.toLowerCase();
      list.replaceChildren(...(state.apps || []).filter((a) => a.name.toLowerCase().includes(q)).slice(0, 60).map((a) =>
        el('button', {
          type: 'button',
          class: `app-item${a.path === chosen.value ? ' active' : ''}`,
          text: a.name,
          onclick: () => {
            chosen.value = a.path;
            if (!$('ed-label').value) $('ed-label').value = a.name.slice(0, 40);
            draw();
          },
        })));
    };
    search.addEventListener('input', draw);
    const box = el('div', {}, [search, list, chosen]);
    if (!state.apps) {
      list.append(el('p', { class: 'muted', text: 'Carregando aplicativos do PC...' }));
      state.apps = await api('/apps').catch(() => []);
    }
    draw();
    return box;
  }

  async function renderParams(type, params = {}) {
    const box = $('ed-params');
    const c = state.catalog;
    const nodes = [];
    if (type === 'app.launch') nodes.push(await appPicker(params));
    if (type === 'url.open') nodes.push(field('Link', el('input', { name: 'url', type: 'url', value: params.url || 'https://', required: '' })));
    if (type === 'media.key') nodes.push(field('Tecla', select('key', c.mediaKeys.map((k) => [k, MEDIA_LABELS[k] || k]), params.key)));
    if (type === 'brightness.step') nodes.push(field('Direcao', select('direction', [['up', 'Aumentar'], ['down', 'Diminuir']], params.direction)));
    if (type === 'nextor.send') {
      nodes.push(field('Tipo', select('endpoint', c.nextorEndpoints.map((e) => [e, e]), params.endpoint || 'comando')));
      nodes.push(field('Texto', el('input', { name: 'texto', maxlength: '500', value: params.texto || '', required: '' })));
    }
    if (type === 'custom.run') {
      nodes.push(c.custom.length
        ? field('Acao do PC', select('id', c.custom.map((a) => [a.id, a.label]), params.id))
        : el('p', { class: 'muted', text: 'Nenhuma acao em data/custom-actions.json no PC.' }));
    }
    box.replaceChildren(...nodes);
  }

  function readParams() {
    const params = {};
    $('ed-params').querySelectorAll('[name]').forEach((i) => { params[i.name] = i.value; });
    return params;
  }

  function editorAction() {
    return { type: $('ed-type').value, params: readParams() };
  }

  async function openEditor(button) {
    state.editTarget = button;
    const types = state.catalog.actions.filter((a) => state.catalog.nextor || !a.type.startsWith('nextor.'));
    $('ed-type').replaceChildren(...types.map((a) => el('option', { value: a.type, text: a.label })));
    $('ed-label').value = button ? button.label : '';
    $('ed-icon').value = button ? button.icon : '';
    $('ed-color').value = button ? button.color : '#334155';
    $('ed-type').value = button ? button.action.type : 'app.launch';
    $('ed-delete').hidden = !button;
    $('editor-dialog').showModal();
    await renderParams($('ed-type').value, button ? button.action.params : {});
  }

  $('ed-type').addEventListener('change', () => renderParams($('ed-type').value));

  $('ed-test').addEventListener('click', async () => {
    const run = (confirm) => api('/actions/test', { method: 'POST', body: { action: editorAction(), confirm } });
    try {
      try { await run(false); } catch (err) {
        if (err.status !== 409) throw err;
        if (!(await confirmDialog('Esta acao precisa de confirmacao. Executar agora?'))) return;
        await run(true);
      }
      toast('Funcionou.');
    } catch (err) { toast(err.message, 'error'); }
  });

  $('ed-delete').addEventListener('click', () => {
    const page = state.deck.pages[state.page];
    page.buttons = page.buttons.filter((b) => b !== state.editTarget);
    $('editor-dialog').close('cancel');
    render();
  });

  $('editor-dialog').addEventListener('close', () => {
    if ($('editor-dialog').returnValue !== 'ok') return;
    const page = state.deck.pages[state.page];
    const label = $('ed-label').value.trim();
    const data = {
      id: state.editTarget ? state.editTarget.id : `b${Date.now().toString(36)}`,
      label,
      icon: $('ed-icon').value.trim().toLowerCase() || 'square',
      color: $('ed-color').value,
      action: editorAction(),
    };
    if (state.editTarget) Object.assign(state.editTarget, data);
    else page.buttons.push(data);
    render();
  });

  // ---------------------------------------------------------------- edit bar
  $('edit-btn').addEventListener('click', async () => {
    if (state.editing) {
      state.deck = await api('/deck'); // discard unsaved changes
      state.editing = false;
    } else {
      state.editing = true;
    }
    render();
  });
  $('page-add').addEventListener('click', () => {
    const name = (prompt('Nome da nova pagina') || '').trim();
    if (!name) return;
    state.deck.pages.push({ name: name.slice(0, 30), buttons: [] });
    state.page = state.deck.pages.length - 1;
    render();
  });
  $('page-rename').addEventListener('click', () => {
    const page = state.deck.pages[state.page];
    const name = (prompt('Novo nome', page.name) || '').trim();
    if (name) { page.name = name.slice(0, 30); render(); }
  });
  $('page-delete').addEventListener('click', async () => {
    if (state.deck.pages.length === 1) return toast('O deck precisa de ao menos uma pagina.', 'error');
    if (!(await confirmDialog(`Excluir a pagina "${state.deck.pages[state.page].name}"?`))) return;
    state.deck.pages.splice(state.page, 1);
    render();
  });
  $('deck-save').addEventListener('click', async () => {
    try {
      const { deck } = await api('/deck', { method: 'PUT', body: state.deck });
      state.deck = deck;
      state.editing = false;
      render();
      toast('Deck salvo no PC.');
    } catch (err) { toast(err.message, 'error'); }
  });

  // ---------------------------------------------------------------- nextor
  $('nextor-bar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('nextor-input');
    const texto = input.value.trim();
    if (!texto) return;
    input.disabled = true;
    try {
      const { result } = await api('/nextor', { method: 'POST', body: { endpoint: 'comando', texto } });
      input.value = '';
      toast(result.resposta || 'Enviado ao Nextor.');
    } catch (err) { toast(err.message, 'error'); } finally { input.disabled = false; }
  });

  // ---------------------------------------------------------------- screen
  let stream = null;
  $('screen-btn').addEventListener('click', async () => {
    try {
      const { ticket } = await api('/screen/ticket', { method: 'POST' });
      stream = new EventSource(`/api/screen?ticket=${encodeURIComponent(ticket)}`);
      stream.onmessage = (e) => { $('screen-img').src = `data:image/jpeg;base64,${e.data}`; };
      $('screen-dialog').showModal();
    } catch (err) { toast(err.message, 'error'); }
  });
  $('screen-dialog').addEventListener('close', () => {
    if (stream) stream.close();
    stream = null;
    $('screen-img').removeAttribute('src');
  });

  // ---------------------------------------------------------------- nextor companion
  const HUMOR = {
    feliz: 'Que bom te ver animado.',
    triste: 'Percebi que voce nao esta bem. Estou aqui.',
    ansioso: 'Vamos com calma, um passo de cada vez.',
    cansado: 'Voce parece cansado. Uma pausa pode ajudar.',
    irritado: 'Dia dificil? Vamos resolver por partes.',
  };
  let petTimer = null;
  let petVisible = false;

  function drawPet(estado) {
    state.petEstado = estado;
    window.Bichinho.render($('pet'), estado);
    document.querySelectorAll('#pet-modos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === estado.modo)));
    $('pet-humor').textContent = HUMOR[estado.emocao_usuario] || '';
  }

  function petSay(text) {
    if (!text) return;
    $('pet-balao').textContent = text;
    $('pet-balao').hidden = false;
  }

  async function refreshPet() {
    try { drawPet(await api('/nextor/estado')); } catch (err) { $('pet-humor').textContent = err.message; }
  }

  function showPet(show) {
    petVisible = show;
    $('pet-view').hidden = !show;
    $('grid').hidden = show;
    $('tabs').hidden = show;
    $('edit-btn').hidden = show;
    $('pet-btn').setAttribute('aria-pressed', String(show));
    if (show) {
      state.editing = false;
      $('edit-bar').hidden = true;
      $('nextor-bar').hidden = true;
      refreshPet();
      petTimer = setInterval(refreshPet, 2500);
      refreshIcons();
    } else {
      clearInterval(petTimer);
      render();
    }
  }

  $('pet-btn').addEventListener('click', () => showPet(!petVisible));

  document.querySelectorAll('#pet-modos button').forEach((b) => b.addEventListener('click', async () => {
    try {
      const r = await api('/nextor/modo', { method: 'POST', body: { modo: b.dataset.modo } });
      drawPet(r.estado);
      petSay([r.frase, ...(r.avisos || [])].join(' '));
    } catch (err) { toast(err.message, 'error'); }
  }));

  $('pet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('pet-input');
    const texto = input.value.trim();
    if (!texto) return;
    input.disabled = true;
    drawPet({ ...(state.petEstado || {}), atividade: 'pensando' });
    try {
      const r = await api('/nextor/conversa', { method: 'POST', body: { texto, falar: $('pet-nest').checked } });
      input.value = '';
      drawPet(r.estado);
      petSay(r.resposta);
      if (r.aviso) toast(r.aviso, 'error');
    } catch (err) { toast(err.message, 'error'); } finally { input.disabled = false; input.focus(); }
  });

  // ---------------------------------------------------------------- start
  async function start() {
    readPairingToken();
    if (!token()) return showPairing();
    try {
      [state.catalog, state.deck] = await Promise.all([api('/catalog'), api('/deck')]);
    } catch (err) {
      if (err.status !== 401) toast(`Sem conexao com o PC: ${err.message}`, 'error');
      return;
    }
    $('pair-screen').hidden = true;
    $('app').hidden = false;
    $('screen-btn').hidden = !state.catalog.screenStream;
    $('pet-btn').hidden = !state.catalog.nextor;
    render();
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  start();
})();
