/* Teste de regras: joga milhares de partidas aleatórias e confere que nada quebra e o dinheiro nunca fica negativo. */
var G = require('../js/game.js'), B = require('../js/board.js');
var seed = 12345;
function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rng() * a.length)]; }
var ended = 0, steps = 0;
for (var g = 0; g < 300; g++) {
  var s = G.newState('TEST'), n = 2 + Math.floor(rng() * 5);
  for (var i = 0; i < n; i++) G.apply(s, { type: 'join', name: 'J' + i, device: 'd' }, rng);
  if (!G.apply(s, { type: 'start' }, rng)) throw new Error('start');
  for (var t = 0; t < 6000 && s.phase === 'playing'; t++) {
    var p = G.cur(s), own = G.owned(s, p.id), a;
    var r = rng();
    if (r < 0.15 && own.length) a = { type: pick(['build', 'build', 'sell', 'mortgage', 'unmortgage']), pid: p.id, space: pick(own) };
    else if (r < 0.17) a = { type: 'transfer', pid: p.id, to: pick(s.players).id, amount: Math.floor(rng() * 50) };
    else if (r < 0.18 && own.length) a = { type: 'giveProp', pid: p.id, space: pick(own), to: pick(s.players).id };
    else if (s.step === 'roll') a = { type: p.inJail ? pick(['roll', 'jailPay', 'jailCard']) : 'roll', pid: p.id };
    else if (s.step === 'buy') a = { type: rng() < 0.8 ? 'buy' : 'pass', pid: p.id };
    else if (s.step === 'pay') {
      a = { type: 'pay', pid: p.id };
      if (p.money < G.pendingTotal(s)) {
        var sellable = own.filter(function (k) { return G.canSell(s, p.id, k); });
        var mort = own.filter(function (k) { return G.canMortgage(s, p.id, k); });
        a = sellable.length ? { type: 'sell', pid: p.id, space: sellable[0] } : mort.length ? { type: 'mortgage', pid: p.id, space: mort[0] } : { type: 'bankrupt', pid: p.id };
      }
    } else a = { type: 'end', pid: p.id };
    G.apply(s, a, rng); steps++;
    JSON.stringify(s);
    s.players.forEach(function (q) {
      if (!(q.money >= 0) || q.money !== Math.floor(q.money)) throw new Error('dinheiro inválido ' + q.money);
      if (q.pos < 0 || q.pos >= B.N) throw new Error('posição');
    });
    Object.keys(s.props).forEach(function (k) {
      var pr = s.props[k], o = G.P(s, pr.owner);
      if (!o || o.bankrupt) throw new Error('dono inválido');
      if (pr.houses < 0 || pr.houses > 5 || (pr.houses && pr.mortgaged)) throw new Error('casas');
    });
    if (s._rng) throw new Error('_rng vazou');
  }
  if (s.phase === 'ended') { ended++; if (!s.winner) throw new Error('sem vencedor'); }
}
console.log('ok —', steps, 'ações,', ended, 'de 300 partidas terminaram');
