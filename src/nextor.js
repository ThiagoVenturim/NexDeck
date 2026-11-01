'use strict';

const { ActionError } = require('./actions');

// Client for the Nextor local service (POST /comando, /falar, /anotar, /conversar).
function createNextorClient({ url, token }, fetchImpl = fetch) {
  const enabled = Boolean(url && token);
  return {
    enabled,
    async send(endpoint, texto) {
      if (!enabled) throw new ActionError('Nextor nao configurado (NEXDECK_NEXTOR_URL e NEXDECK_NEXTOR_TOKEN).', 503);
      let res;
      try {
        res = await fetchImpl(`${url}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Nextor-Token': token },
          body: JSON.stringify({ texto }),
          signal: AbortSignal.timeout(60 * 1000),
        });
      } catch (err) {
        throw new ActionError(`Nextor fora do ar: ${err.message}`, 502);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ActionError(body.erro || `Nextor respondeu ${res.status}`, 502);
      return body;
    },
  };
}

module.exports = { createNextorClient };
