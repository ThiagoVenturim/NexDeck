'use strict';

const { ActionError } = require('./actions');

const MODOS = ['normal', 'estudo', 'trabalho', 'tranquilidade', 'leitura'];

// Client for the Nextor local service. Only fixed routes are reachable from the phone.
function createNextorClient({ url, token }, fetchImpl = fetch) {
  const enabled = Boolean(url && token);

  async function call(method, route, body) {
    if (!enabled) throw new ActionError('Nextor nao configurado (NEXDECK_NEXTOR_URL e NEXDECK_NEXTOR_TOKEN).', 503);
    let res;
    try {
      res = await fetchImpl(`${url}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Nextor-Token': token },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(90 * 1000),
      });
    } catch (err) {
      throw new ActionError(`Nextor fora do ar: ${err.message}`, 502);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ActionError(data.erro || `Nextor respondeu ${res.status}`, 502);
    return data;
  }

  return {
    enabled,
    // /comando, /falar, /anotar, /conversar (validated by the action catalog)
    send: (endpoint, texto) => call('POST', `/${endpoint}`, { texto }),
    estado: () => call('GET', '/estado'),
    modo(modo) {
      if (!MODOS.includes(modo)) throw new ActionError(`Modo invalido. Use: ${MODOS.join(', ')}.`);
      return call('POST', '/modo', { modo });
    },
    conversa(texto, falar = false) {
      if (typeof texto !== 'string' || !texto.trim()) throw new ActionError('Mensagem vazia.');
      if (texto.length > 500) throw new ActionError('Mensagem passa de 500 caracteres.');
      return call('POST', '/conversa', { texto: texto.trim(), falar: falar === true });
    },
  };
}

module.exports = { createNextorClient, MODOS };
