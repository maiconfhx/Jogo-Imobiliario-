# Magnatas — o jogo das cidades

Jogo de tabuleiro de compra e venda de imóveis para jogar na sala:

- **A TV é o tabuleiro** (funciona no navegador Silk do Fire TV Stick, sem precisar do controle remoto durante o jogo).
- **O celular é a maquininha de cartão e o dado virtual**: joga os dados (toque ou chacoalhe), compra imóveis, "passa o cartão" para pagar aluguel, faz transferências entre jogadores, constrói casas e hotéis.
- De 2 a 6 jogadores. Pode ser **um celular só** passando de mão em mão, ou cada jogador com o seu.

Não tem servidor: é um site estático. A TV e os celulares conversam direto por WebRTC (biblioteca PeerJS). Só é preciso internet.

## Como colocar no ar (GitHub Pages)

1. No GitHub, abra **Settings → Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**, selecione o branch com estes arquivos e a pasta `/ (root)`. Salve.
3. Em 1–2 minutos o jogo fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

(O GitHub Pages gratuito exige repositório público.)

## Como jogar

1. No Fire TV Stick, abra o navegador **Silk** e digite o endereço acima. Dica: salve nos favoritos.
2. A TV mostra um **QR code** e o código da sala (4 letras). Aponte a câmera do celular para o QR code
   (ou abra `.../controle.html` no celular e digite o código).
3. No celular, adicione os jogadores e toque em **Começar jogo**.
4. Na sua vez: **Jogar dados** → o peão anda na TV → compre, pague ou encerre a vez pelo celular.

Se a TV ou o celular forem recarregados, a partida continua de onde parou. Para recomeçar do zero, use
**Menu → Encerrar** no celular (ou abra a TV com `?nova=1` no fim do endereço).

## Regras resumidas

- Todos começam com $ 1.500 e recebem $ 200 ao passar pela Partida.
- Parou em imóvel sem dono: pode comprar. Com dono: paga aluguel na maquininha.
- Grupo de cor completo dobra o aluguel e libera a construção de casas (até 4) e hotel, sempre de forma equilibrada no grupo.
- Transportes: aluguel de $ 25 / 50 / 100 / 200 conforme quantos o dono tem.
- Dupla nos dados joga de novo; três duplas seguidas levam à cadeia.
- Cadeia: tente tirar dupla (até 3 vezes), pague $ 50 de fiança ou use o cartão de habeas corpus.
- Sem dinheiro para pagar? Venda casas (metade do preço) ou hipoteque imóveis (metade do valor; resgate por 55%). Se não der, é falência.
- Negociações são livres: combine na conversa e use **Transferir** (dinheiro) e **Imóveis → Passar** (imóvel).
- Vence quem sobrar.

## Desenvolvimento

- `index.html` + `js/tv3d.js`: tabuleiro 3D (Three.js) e autoridade do jogo (TV). Personagens, dados e construções animados.
- `plano.html` + `js/tv.js`: tabuleiro plano (2D), usado automaticamente se a TV não tiver WebGL.
- `controle.html` + `js/phone.js`: maquininha (celular).
- `js/game.js`: regras; `js/board.js`: casas, preços e cartas.
- Teste das regras: `node test/fuzz.js`.
- Para rodar local: `python3 -m http.server` e abra `http://IP-DO-PC:8000` na TV.

### Publicando uma versão nova

Aumente o número em `version.json` e em `VERSION` (`js/common.js`), e o `?v=` nos arquivos `.html`.
A TV e os celulares abertos conferem o `version.json` a cada minuto e recarregam sozinhos, sem perder a partida.
