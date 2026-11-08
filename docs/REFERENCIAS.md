# Referencias e diferencial do NexDeck

Projetos parecidos (open source e privados), o diferencial do NexDeck e o que melhorar com base neles. Pesquisa de 2026-11-08; verifique cada projeto antes de usar.

## Parecidos

### Open source
- **Macro Deck** (Apache 2.0): macro pad para Windows/macOS/Linux; cliente web gratis no navegador de qualquer celular na mesma rede, app Android/iOS opcional (pago).
- **MiniDeck** (AGPL-3.0): transforma o celular em painel de controle do PC.
- **Stream-Pi**: roda em Windows/Mac/Linux/Android.
- **BitFocus Companion**: stream deck virtual, forte em producao de video.

### Privados / fechados
- **Elgato Stream Deck** (hardware) e **Stream Deck Mobile**: a referencia do genero.
- **Deckboard**: transforma o celular em macro pad do PC; freemium/proprietario.
- **Touch Portal**, **Macropad apps** varios: fechados.

## Nosso diferencial
- **Seguranca como valor central**: o prototipo tinha RCE sem auth exposto por tunel; o NexDeck tem token de pareamento por QR (fragmento), **catalogo fechado de acoes** (nunca comando de shell vindo do celular), spawn sem shell, sem CORS, sem tunel (remoto so por VPN), confirmacao para acoes perigosas.
- **Ponte com o Nextor**: o deck chama acoes do assistente (comando, falar, estudos) e o Nextor aperta botoes; pagina Estudos, quiz/flashcards e envio de material com OCR no PC.
- **PWA** sem app obrigatorio, no mesmo padrao do portfolio.

## O que melhorar aprendendo com eles
- **Catalogo rico de acoes e plugins** (Macro Deck/Companion): mais acoes prontas (midia, janelas, OBS), sempre pelo catalogo validado.
- **Editor visual de layout** por perfil (Stream Deck/Touch Portal): arrastar botoes, varias paginas, icones.
- **Deck multiplataforma** (Macro Deck roda em varios SOs): hoje foca Windows; avaliar macOS/Linux.
- **App companion** opcional (como Macro Deck/Deckboard) alem do PWA, sem abrir mao da seguranca.
- **Perfis por app em foco** (muda os botoes conforme o app ativo no PC).

## Sources
- https://macro-deck.app/
- https://alternativeto.net/software/deckboard/about
- https://alternativeto.net/software/minideck/about/
- https://alternativeto.net/software/streampi
