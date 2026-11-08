'use strict';

const { ActionError } = require('./actions');

const MODOS = ['normal', 'estudo', 'trabalho', 'tranquilidade', 'leitura'];
const IDENTIDADES = ['nextor', 'claude', 'agy'];

// Client for the Nextor local service. Only fixed routes are reachable from the phone.
function createNextorClient({ url, token }, fetchImpl = fetch) {
  const enabled = Boolean(url && token);

  async function call(method, route, body, isFormData = false) {
    if (!enabled) throw new ActionError('Nextor nao configurado (NEXDECK_NEXTOR_URL e NEXDECK_NEXTOR_TOKEN).', 503);
    let res;
    try {
      const headers = { 'X-Nextor-Token': token };
      let reqBody;
      if (isFormData) {
        reqBody = body;
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        reqBody = JSON.stringify(body);
      }
      res = await fetchImpl(`${url}${route}`, {
        method,
        headers,
        body: reqBody,
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
    identidade(nome) {
      if (!IDENTIDADES.includes(nome)) throw new ActionError(`Identidade invalida. Use: ${IDENTIDADES.join(', ')}.`);
      return call('POST', '/identidade', { identidade: nome });
    },
    conversa(texto, falar = false) {
      if (typeof texto !== 'string' || !texto.trim()) throw new ActionError('Mensagem vazia.');
      if (texto.length > 500) throw new ActionError('Mensagem passa de 500 caracteres.');
      return call('POST', '/conversa', { texto: texto.trim(), falar: falar === true });
    },
    estudosDisciplinas: () => call('GET', '/estudos/disciplinas'),
    estudosGravarAula: (disciplina) => call('POST', '/estudos/aulas/gravar', { disciplina }),
    estudosPararAula: () => call('POST', '/estudos/aulas/parar', {}),
    estudosStatusAula: () => call('GET', '/estudos/aulas/status'),
    estudosResumo: (disciplina, alvo) => call('POST', '/estudos/resumo', { disciplina, alvo: alvo || '', gerar_flashcards: true }),
    estudosQuizGerar: (disciplina, quantidade = 3) => call('POST', '/estudos/quiz/gerar', { disciplina, quantidade }),
    estudosQuizResponder: (questaoId, resposta) => call('POST', '/estudos/quiz/responder', { questao_id: questaoId, resposta }),
    estudosQuizHistorico: (disciplina) => call('GET', `/estudos/quiz/historico${disciplina ? `?disciplina=${encodeURIComponent(disciplina)}` : ''}`),
    estudosPerguntar: (disciplina, pergunta) => call('POST', '/estudos/perguntar', { disciplina, pergunta }),
    estudosImportarLink: (disciplina, urlLink, titulo = '') =>
      call('POST', `/estudos/disciplinas/${encodeURIComponent(disciplina)}/materiais`, { origem: urlLink, titulo, tipo: 'link' }),
    estudosImportarArquivo: (disciplina, nomeArquivo, buffer, mimeType = 'application/octet-stream', titulo = '') => {
      const form = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      form.append('arquivo', blob, nomeArquivo);
      if (titulo) form.append('titulo', titulo);
      return call('POST', `/estudos/disciplinas/${encodeURIComponent(disciplina)}/materiais`, form, true);
    },
  };
}

module.exports = { createNextorClient, MODOS, IDENTIDADES };
