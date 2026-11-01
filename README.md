# NexDeck

Transforme o celular em um stream deck do seu PC Windows, pela rede local, com
seguranca. Botoes para abrir aplicativos e sites, controlar midia e volume,
brilho, captura de tela, bloquear ou desligar o PC, e uma ponte com o
[Nextor](https://github.com/ThiagoVenturim/Nextor), o assistente de voz que usa o
Google Nest Mini.

- Sem app de loja: e um PWA. Abra no Chrome do celular e instale na tela inicial.
- Pareamento por QR code: so o celular pareado consegue usar.
- Nenhum comando arbitrario: o celular so escolhe acoes de um catalogo fechado.
- Varias paginas, editor de botoes no proprio celular, confirmacao para acoes perigosas.

## Como usar

Requisitos: Windows 10 ou 11 e [Node.js](https://nodejs.org) 20 ou mais novo.

```powershell
git clone https://github.com/ThiagoVenturim/NexDeck.git
cd NexDeck
npm install
npm start
```

O terminal mostra um QR code. Com o celular na mesma rede Wi-Fi, aponte a camera
para ele (ou abra o link que aparece logo abaixo). Pronto: o celular fica pareado.
No Chrome, use "Instalar aplicativo" para abrir em tela cheia como um app.

Para iniciar junto com o Windows, sem janela:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\startup.ps1 -Install
```

Na primeira vez o Windows pode perguntar se o Node.js pode usar a rede: permita
apenas em **redes privadas**.

## Acoes disponiveis

| Acao | O que faz |
|---|---|
| Abrir aplicativo | Abre qualquer atalho do Menu Iniciar (lista com busca no celular) |
| Abrir site | Abre um link http ou https no navegador padrao |
| Midia e volume | Play/pause, proxima, anterior, volume +/-, mudo |
| Brilho | Aumenta ou diminui o brilho da tela do notebook |
| Captura de tela | Salva um PNG na pasta Imagens |
| Mostrar area de trabalho, Bloquear | Atalhos do sistema |
| Suspender, Desligar (em 30 s), Cancelar desligamento | Pedem confirmacao no celular |
| Enviar ao Nextor | Manda um comando, uma nota ou uma frase para o Nextor falar no Nest |
| Acao personalizada | Roda um programa definido **so no PC**, em `data/custom-actions.json` |

Exemplo de acao personalizada (`data/custom-actions.json`):

```json
{
  "backup": { "label": "Backup", "command": "C:/Ferramentas/backup.exe", "args": ["--rapido"] }
}
```

O programa roda sem shell, com os argumentos exatamente como estao no arquivo.

## Configuracao

Copie `.env.example` para `.env`. As opcoes principais:

| Variavel | Padrao | Para que serve |
|---|---|---|
| `NEXDECK_PORT` | `3210` | Porta do servidor |
| `NEXDECK_HOST` | `0.0.0.0` | `127.0.0.1` deixa acessivel so no proprio PC |
| `NEXDECK_SCREEN_STREAM` | `false` | Ver a tela do PC no celular |
| `NEXDECK_NEXTOR_URL` | vazio | Endereco do Nextor, ex.: `http://localhost:5005` |
| `NEXDECK_NEXTOR_TOKEN` | vazio | O mesmo `NEXTOR_TOKEN` do Nextor |

Trocar o token de pareamento (desconecta todos os celulares): `npm start -- --rotate-token`.

## Integracao com o Nextor

Os dois projetos conversam pela rede local, cada um com o seu token:

- **NexDeck para Nextor:** botoes e a barra "Fale com o Nextor" enviam texto para
  `/comando`, `/falar`, `/anotar` ou `/conversar` do Nextor. Ex.: um botao "Meu dia"
  faz o Nest Mini ler a agenda.
- **Nextor para NexDeck:** o Nextor pode apertar botoes do deck por voz
  ("no computador, bloquear"), chamando `POST /api/buttons/<id>/run` com o token do NexDeck.

Detalhes em [docs/NEXTOR.md](docs/NEXTOR.md).

## Seguranca

Este projeto controla o seu computador, entao foi desenhado para nao abrir brechas.
Leia [docs/SEGURANCA.md](docs/SEGURANCA.md). O resumo:

- Toda a API exige o token de pareamento; tentativas erradas sao bloqueadas por um minuto.
- O celular nunca envia comandos de terminal: so tipos de acao do catalogo, com parametros validados.
- Nada de tunel publico. Para usar fora de casa, use uma VPN (por exemplo Tailscale), nunca abra porta no roteador.
- O espelhamento de tela vem desligado.

## Desenvolvimento

```powershell
npm test        # testes (node:test), sem rede e sem executar nada no PC
npm run check   # sintaxe e verificacao de emojis
npm run dev     # reinicia ao salvar
```

Estrutura em [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Contribuicoes: [CONTRIBUTING.md](CONTRIBUTING.md).

## Licenca

[MIT](LICENSE)
