# Integracao com o Nextor

O [Nextor](https://github.com/ThiagoVenturim/Nextor) e o assistente pessoal que fala
pelo Google Nest Mini. NexDeck e Nextor rodam no mesmo PC (ou na mesma rede) e se
falam por HTTP, cada um com o seu token.

## NexDeck chamando o Nextor

No `.env` do NexDeck:

```
NEXDECK_NEXTOR_URL=http://localhost:5005
NEXDECK_NEXTOR_TOKEN=<o mesmo valor de NEXTOR_TOKEN no .env do Nextor>
```

Com isso:

- Aparece a barra "Fale com o Nextor" no deck: o texto vai para `/comando`, o
  roteador do Nextor decide (agenda, noticias, anotar, conversar) e a resposta e
  falada no Nest e mostrada no celular.
- O editor de botoes ganha a acao "Enviar ao Nextor", com quatro tipos:
  `comando`, `falar`, `anotar` e `conversar`. Exemplos prontos no deck padrao:
  "Meu dia" e "Noticias".

## O bichinho do Nextor no celular

Com a ponte configurada, aparece um botao de carinha no topo do deck. Ele abre o rosto do Nextor
(um painel de LEDs em pixel art) com:

- o humor que o Nextor percebeu na conversa e a reacao do bichinho;
- os modos Estudo (mochila), Trabalho (gravata borboleta), Tranquilidade (olhos relaxados) e Leitura (oculos),
  que tambem ajustam o brilho da tela do PC e as luzes pelo Home Assistant, se configurado;
- uma caixa para conversar; marque "no Nest" para ouvir a resposta no alto-falante.

O NexDeck so repassa tres chamadas fixas para o Nextor: `GET /estado`, `POST /modo` (modo validado) e
`POST /conversa` (texto de ate 500 caracteres).

## Nextor chamando o NexDeck

No `.env` do Nextor:

```
NEXTOR_DECK_URL=http://localhost:3210
NEXTOR_DECK_TOKEN=<token de data/secret.json do NexDeck>
```

O Nextor entende frases como "no computador, bloquear" ou "deck play": procura um
botao do deck com esse nome e o aperta via `POST /api/buttons/<id>/run`. Acoes que
pedem confirmacao (desligar, suspender) nao sao disparadas por voz.

## Contrato da API usada pelo Nextor

| Chamada | Uso |
|---|---|
| `GET /api/deck` | Lista paginas e botoes (para achar o botao pelo nome) |
| `POST /api/buttons/<id>/run` | Aperta o botao. Corpo `{}`; `{"confirm": true}` so para acoes confirmadas |

Todas exigem `Authorization: Bearer <token do NexDeck>`.
