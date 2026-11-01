# Seguranca

O NexDeck executa acoes no seu PC a partir do celular. Isto descreve o que ele
protege e o que fica por sua conta.

## O que mudou em relacao a versao antiga (strem_deck)

| Antes | Agora |
|---|---|
| Sem autenticacao: qualquer aparelho na rede usava | Token de pareamento obrigatorio em toda a API |
| `POST /api/buttons` gravava comandos de terminal e `/api/execute` os rodava | O celular so escolhe acoes de um catalogo fechado; nada de comando livre |
| `cors()` liberado para qualquer site | Sem CORS: um site aberto no seu navegador nao consegue chamar a API |
| Tunel publico (localtunnel) aberto a cada inicio | Removido. Acesso remoto so por VPN |
| Espelhamento de tela sem senha | Desligado por padrao, e exige token mais ticket de uso unico |
| Nomes de apps inseridos com `innerHTML` | Todo texto e renderizado como texto (sem XSS) |
| Desligar sem confirmacao, imediato | Confirmacao no celular e 30 s para cancelar |
| Scripts de CDN sem versao (`lucide@latest`) | Bibliotecas servidas localmente, CSP restrita |

## Como o pareamento funciona

1. Na primeira execucao o servidor gera um token aleatorio de 256 bits e guarda em
   `data/secret.json` (fora do git).
2. O QR code leva para `http://<ip-do-pc>:3210/#pair=<token>`. O token vai no
   fragmento (`#`), que o navegador nao envia ao servidor nem grava em logs.
3. O PWA guarda o token e o envia em `Authorization: Bearer` em cada chamada.
4. A comparacao do token e feita em tempo constante. Dez tentativas erradas em um
   minuto bloqueiam o IP por um minuto.

Quem tiver o link de pareamento controla o PC. Se ele vazar, rode
`npm start -- --rotate-token` e pareie de novo.

## Catalogo de acoes

Cada botao guarda `{ type, params }`. O servidor valida o tipo e cada parametro
antes de salvar e de novo antes de executar:

- Aplicativos: so atalhos dentro das pastas do Menu Iniciar (sem `..`, sem caminhos soltos).
- Links: so `http` e `https`.
- Teclas de midia, brilho, endpoints do Nextor: listas fechadas.
- Programas rodam sem shell (`spawn` com lista de argumentos).
- Acoes personalizadas so existem se estiverem em `data/custom-actions.json`, que
  so pode ser editado no proprio PC.

## O que fica por sua conta

- Use o NexDeck so em redes que voce confia (casa). Em rede publica, feche-o.
- No firewall do Windows, permita o Node.js apenas em redes privadas.
- O trafego na rede local e HTTP: alguem na mesma rede pode ver o token passando.
  Para uso fora de casa use uma VPN, que cifra tudo.
- Ligue o espelhamento de tela so quando precisar.

Vulnerabilidades: reporte de forma privada, veja [SECURITY.md](../SECURITY.md).
