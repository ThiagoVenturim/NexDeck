# Arquitetura

```
celular (PWA)  --HTTP + token-->  servidor Node (Express)  --spawn sem shell-->  Windows
                                        |
                                        +--HTTP + token-->  Nextor (Python, Nest Mini)
```

| Arquivo | Papel |
|---|---|
| `src/index.js` | Inicia o servidor, gera o token e mostra o QR code de pareamento |
| `src/config.js` | Le o `.env` e as variaveis `NEXDECK_*` |
| `src/auth.js` | Token de pareamento, limite de tentativas, tickets do espelhamento |
| `src/actions.js` | Catalogo de acoes: validacao e execucao de cada tipo |
| `src/store.js` | Deck (paginas e botoes) em `data/deck.json` e acoes personalizadas |
| `src/apps.js` | Lista os atalhos do Menu Iniciar e valida caminhos |
| `src/runner.js` | Executa programas sem shell, com timeout |
| `src/nextor.js` | Cliente da API do Nextor |
| `src/screen.js` | Espelhamento da tela por Server-Sent Events |
| `src/server.js` | Rotas da API, cabecalhos de seguranca e erros |
| `public/` | PWA: interface, editor, service worker |

## Nova acao

1. Adicione o tipo em `CATALOG` (`src/actions.js`) com `label`, `validate` e `run`.
   `validate` recebe os parametros vindos do celular e devolve so o que e permitido.
2. Se precisar de campos no editor, adicione em `renderParams` (`public/app.js`).
3. Escreva um teste em `test/` cobrando a validacao e o comando executado.

Os dados locais ficam em `data/` (fora do git): `secret.json`, `deck.json`,
`custom-actions.json`.
