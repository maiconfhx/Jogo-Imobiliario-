/* Dados do tabuleiro: 36 casas num retângulo 12 x 8 (sentido horário a partir do canto superior esquerdo). */
(function (root) {
  'use strict';

  var GROUPS = {
    A: { color: '#8d5a3b', house: 50 },
    B: { color: '#4fc3f7', house: 50 },
    C: { color: '#e667af', house: 100 },
    D: { color: '#f39c2d', house: 100 },
    E: { color: '#e5483f', house: 150 },
    F: { color: '#f2d43d', house: 150 },
    G: { color: '#3fae5a', house: 200 },
    H: { color: '#3f62d8', house: 200 }
  };

  function prop(name, group, price, rent) { return { t: 'prop', name: name, group: group, price: price, rent: rent }; }
  function trans(name, icon) { return { t: 'trans', name: name, icon: icon, price: 150 }; }
  function card() { return { t: 'card', name: 'Surpresa', icon: '❓' }; }

  var SPACES = [
    { t: 'start', name: 'Partida', icon: '🚩' },
    prop('Macapá', 'A', 60, 4),
    card(),
    prop('Boa Vista', 'A', 70, 6),
    { t: 'tax', name: 'Imposto', icon: '🧾', amount: 200 },
    trans('Aeroporto', '✈️'),
    prop('Teresina', 'B', 100, 8),
    prop('São Luís', 'B', 100, 8),
    prop('Aracaju', 'B', 120, 10),
    card(),
    prop('Natal', 'C', 140, 12),
    { t: 'jail', name: 'Cadeia', icon: '🚔' },
    prop('Maceió', 'C', 140, 12),
    prop('João Pessoa', 'C', 160, 14),
    trans('Rodoviária', '🚌'),
    prop('Belém', 'D', 180, 16),
    prop('Manaus', 'D', 180, 16),
    prop('Cuiabá', 'D', 200, 18),
    { t: 'free', name: 'Férias', icon: '🏖️' },
    prop('Goiânia', 'E', 220, 20),
    prop('Vitória', 'E', 220, 20),
    card(),
    prop('Recife', 'E', 240, 22),
    trans('Porto', '🚢'),
    prop('Fortaleza', 'F', 260, 24),
    prop('Salvador', 'F', 260, 24),
    prop('Curitiba', 'F', 280, 26),
    card(),
    prop('Porto Alegre', 'G', 300, 28),
    { t: 'gotojail', name: 'Vá para a cadeia', icon: '👮' },
    prop('Belo Horizonte', 'G', 300, 28),
    prop('Brasília', 'G', 320, 30),
    trans('Ferrovia', '🚆'),
    prop('Rio de Janeiro', 'H', 360, 38),
    { t: 'tax', name: 'Taxa de luxo', icon: '💎', amount: 100 },
    prop('São Paulo', 'H', 400, 50)
  ];

  // Multiplicador do aluguel por nº de casas (5 = hotel)
  var HOUSE_MULT = [1, 4, 12, 28, 34, 40];
  var TRANS_RENT = [0, 25, 50, 100, 200];

  var CARDS = [
    { text: 'Você ganhou um concurso de culinária! Receba $ 100.', e: 'gain', n: 100 },
    { text: 'Restituição do imposto de renda. Receba $ 150.', e: 'gain', n: 150 },
    { text: 'Vendeu seu carro velho. Receba $ 80.', e: 'gain', n: 80 },
    { text: 'Herança de um tio distante. Receba $ 200.', e: 'gain', n: 200 },
    { text: 'Seu investimento rendeu. Receba $ 50.', e: 'gain', n: 50 },
    { text: 'Multa por excesso de velocidade. Pague $ 60.', e: 'pay', n: 60 },
    { text: 'Conta do hospital. Pague $ 100.', e: 'pay', n: 100 },
    { text: 'Conserto do telhado. Pague $ 120.', e: 'pay', n: 120 },
    { text: 'Mensalidade da escola. Pague $ 50.', e: 'pay', n: 50 },
    { text: 'Avance até a Partida e receba seu salário.', e: 'goto', pos: 0 },
    { text: 'Vá direto para a cadeia, sem passar pela Partida.', e: 'jail' },
    { text: 'Habeas corpus! Guarde este cartão para sair da cadeia.', e: 'jailcard' },
    { text: 'Errou o caminho. Volte 3 casas.', e: 'back', n: 3 },
    { text: 'É seu aniversário! Receba $ 40 de cada jogador.', e: 'each', n: 40 },
    { text: 'Você pagou a rodada. Pague $ 30 a cada jogador.', e: 'payeach', n: 30 },
    { text: 'Reforma geral: pague $ 30 por casa e $ 100 por hotel.', e: 'repairs', house: 30, hotel: 100 },
    { text: 'Viagem de negócios: avance até o próximo transporte.', e: 'transport' },
    { text: 'Fim de semana em São Paulo: avance até lá.', e: 'goto', pos: 35 }
  ];

  var COLORS = ['#ff5252', '#40c4ff', '#ffd740', '#69f0ae', '#e040fb', '#ff9e40'];
  var TOKENS = ['🚗', '🎩', '🐶', '🚀', '🦄', '⚽'];

  var B = {
    GROUPS: GROUPS, SPACES: SPACES, CARDS: CARDS, COLORS: COLORS, TOKENS: TOKENS,
    HOUSE_MULT: HOUSE_MULT, TRANS_RENT: TRANS_RENT,
    N: SPACES.length, JAIL: 11, SALARY: 200, START_MONEY: 1500, BAIL: 50, MAX_PLAYERS: 6
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.BOARD = B;
})(this);
