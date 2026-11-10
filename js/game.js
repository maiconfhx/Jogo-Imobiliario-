/* Regras do jogo. O estado é um objeto JSON puro; a TV é a autoridade e aplica as ações vindas dos celulares. */
(function (root) {
  'use strict';
  var B = (typeof module !== 'undefined' && module.exports) ? require('./board.js') : root.BOARD;

  function newState(room) {
    return {
      room: room, phase: 'lobby', players: [], props: {}, turn: 0, step: 'roll',
      dice: [1, 1], rollSeq: 0, dbl: 0, pending: null, card: null, move: null, pay: null,
      deck: [], log: [], seq: 0, nextId: 1, winner: null
    };
  }

  function $(n) { return '$ ' + n; }
  function log(s, msg) { s.log.push(msg); if (s.log.length > 40) s.log.shift(); }
  function cur(s) { return s.players[s.turn]; }
  function P(s, id) {
    for (var i = 0; i < s.players.length; i++) if (s.players[i].id === id) return s.players[i];
    return null;
  }
  function alive(s) { return s.players.filter(function (p) { return !p.bankrupt; }); }
  function owned(s, pid) {
    var r = [];
    for (var i = 0; i < B.N; i++) if (s.props[i] && s.props[i].owner === pid) r.push(i);
    return r;
  }
  function groupOf(i) {
    var g = B.SPACES[i].group, r = [];
    if (!g) return r;
    for (var k = 0; k < B.N; k++) if (B.SPACES[k].group === g) r.push(k);
    return r;
  }
  function hasSet(s, pid, i) {
    var g = groupOf(i);
    return g.length > 0 && g.every(function (k) { return s.props[k] && s.props[k].owner === pid; });
  }
  function groupHouses(s, i) {
    return groupOf(i).map(function (k) { return s.props[k] ? s.props[k].houses : 0; });
  }
  function rentFor(s, i) {
    var sp = B.SPACES[i], pr = s.props[i];
    if (!pr || pr.mortgaged) return 0;
    if (sp.t === 'trans') {
      var n = owned(s, pr.owner).filter(function (k) { return B.SPACES[k].t === 'trans'; }).length;
      return B.TRANS_RENT[n];
    }
    if (pr.houses > 0) return sp.rent * B.HOUSE_MULT[pr.houses];
    return hasSet(s, pr.owner, i) ? sp.rent * 2 : sp.rent;
  }
  function houseCost(i) { return B.GROUPS[B.SPACES[i].group].house; }
  function mortgageValue(i) { return B.SPACES[i].price / 2; }
  function unmortgageCost(i) { return Math.ceil(B.SPACES[i].price * 0.55); }

  function canBuild(s, pid, i) {
    var sp = B.SPACES[i], pr = s.props[i];
    if (sp.t !== 'prop' || !pr || pr.owner !== pid || !hasSet(s, pid, i)) return false;
    if (groupOf(i).some(function (k) { return s.props[k].mortgaged; })) return false;
    if (pr.houses >= 5 || pr.houses > Math.min.apply(null, groupHouses(s, i))) return false;
    return P(s, pid).money >= houseCost(i);
  }
  function canSell(s, pid, i) {
    var pr = s.props[i];
    return !!pr && pr.owner === pid && pr.houses > 0 && pr.houses >= Math.max.apply(null, groupHouses(s, i));
  }
  function groupClear(s, i) {
    return B.SPACES[i].t !== 'prop' || groupHouses(s, i).every(function (h) { return h === 0; });
  }
  function canMortgage(s, pid, i) {
    var pr = s.props[i];
    return !!pr && pr.owner === pid && !pr.mortgaged && groupClear(s, i);
  }
  function pendingTotal(s) {
    if (!s.pending) return 0;
    if (s.pending.to === 'all') return s.pending.amount * (alive(s).length - 1);
    return s.pending.amount;
  }

  function payEvent(s, from, to, amount, label) {
    s.pay = { seq: ++s.seq, from: from, to: to, amount: amount, label: label };
  }
  function finish(s) {
    var p = cur(s);
    s.step = (s.dbl > 0 && !p.inJail && !p.bankrupt) ? 'roll' : 'end';
  }
  function charge(s, amount, to, reason) {
    s.pending = { amount: amount, to: to, reason: reason };
    s.step = 'pay';
  }
  function sendJail(s, p) {
    p.pos = B.JAIL; p.inJail = true; p.jailTurns = 0; s.dbl = 0;
    if (s.move) s.move.path.push(B.JAIL);
    log(s, p.name + ' foi para a cadeia 🚔');
  }
  function walk(s, p, n) {
    for (var k = 0; k < n; k++) {
      p.pos = (p.pos + 1) % B.N;
      s.move.path.push(p.pos);
      if (p.pos === 0) { p.money += B.SALARY; log(s, p.name + ' passou pela Partida: +' + $(B.SALARY)); }
    }
    land(s, p);
  }
  function jump(s, p, pos) { p.pos = pos; s.move.path.push(pos); land(s, p); }
  function advanceTo(s, p, pos) { walk(s, p, (pos - p.pos + B.N) % B.N || B.N); }

  function land(s, p) {
    var i = p.pos, sp = B.SPACES[i], pr = s.props[i];
    if (sp.t === 'prop' || sp.t === 'trans') {
      if (!pr) { log(s, p.name + ' parou em ' + sp.name + ' (à venda por ' + $(sp.price) + ')'); s.step = 'buy'; return; }
      if (pr.owner !== p.id) {
        var o = P(s, pr.owner), r = rentFor(s, i);
        if (r > 0) { log(s, p.name + ' parou em ' + sp.name + ', de ' + o.name); charge(s, r, o.id, 'Aluguel · ' + sp.name); return; }
        log(s, p.name + ' parou em ' + sp.name + ' (hipotecada, sem aluguel)');
      } else log(s, p.name + ' parou em ' + sp.name + ' (sua)');
    } else if (sp.t === 'tax') {
      log(s, p.name + ' parou em ' + sp.name);
      charge(s, sp.amount, null, sp.name); return;
    } else if (sp.t === 'gotojail') {
      sendJail(s, p);
    } else if (sp.t === 'card') {
      drawCard(s, p); return;
    } else {
      log(s, p.name + ' parou em ' + sp.name);
    }
    finish(s);
  }

  function shuffle(n, rng) {
    var a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function drawCard(s, p) {
    if (!s.deck.length) s.deck = shuffle(B.CARDS.length, s._rng || Math.random);
    var c = B.CARDS[s.deck.shift()];
    s.card = { seq: ++s.seq, text: c.text, pid: p.id };
    log(s, '❓ ' + p.name + ': ' + c.text);
    var others = alive(s).filter(function (o) { return o.id !== p.id; });
    switch (c.e) {
      case 'gain': p.money += c.n; break;
      case 'pay': charge(s, c.n, null, 'Surpresa'); return;
      case 'goto': advanceTo(s, p, c.pos); return;
      case 'jail': sendJail(s, p); break;
      case 'jailcard': p.jailCards++; break;
      case 'back': jump(s, p, (p.pos - c.n + B.N) % B.N); return;
      case 'each':
        others.forEach(function (o) { var x = Math.min(o.money, c.n); o.money -= x; p.money += x; });
        break;
      case 'payeach': if (others.length) { charge(s, c.n, 'all', 'Surpresa · para cada jogador'); return; } break;
      case 'repairs':
        var tot = 0;
        owned(s, p.id).forEach(function (k) { var h = s.props[k].houses; tot += h === 5 ? c.hotel : h * c.house; });
        if (tot > 0) { charge(s, tot, null, 'Reforma geral'); return; }
        break;
      case 'transport':
        var k = p.pos;
        do { k = (k + 1) % B.N; } while (B.SPACES[k].t !== 'trans');
        advanceTo(s, p, k); return;
    }
    finish(s);
  }

  function nextTurn(s) {
    var n = s.players.length;
    for (var k = 1; k <= n; k++) {
      var t = (s.turn + k) % n;
      if (!s.players[t].bankrupt) { s.turn = t; break; }
    }
    s.step = 'roll'; s.dbl = 0; s.pending = null;
  }

  function resetPlayer(p) {
    p.money = B.START_MONEY; p.pos = 0; p.inJail = false; p.jailTurns = 0; p.jailCards = 0; p.bankrupt = false;
  }

  /* Aplica uma ação. Retorna true se o estado mudou. */
  function apply(s, a, rng) {
    rng = rng || Math.random;
    s._rng = rng;
    var ok = act(s, a, rng);
    delete s._rng;
    return ok;
  }

  function act(s, a, rng) {
    var p, i, pr, o, c, n;
    switch (a.type) {
      case 'join':
        if (s.phase !== 'lobby' || s.players.length >= B.MAX_PLAYERS) return false;
        var name = String(a.name || '').trim().slice(0, 12);
        if (!name) return false;
        for (c = 0; c < B.COLORS.length; c++) {
          if (!s.players.some(function (q) { return q.ci === c; })) break;
        }
        p = { id: 'p' + (s.nextId++), name: name, ci: c, device: a.device };
        resetPlayer(p);
        s.players.push(p);
        return true;
      case 'leave':
        if (s.phase !== 'lobby') return false;
        n = s.players.length;
        s.players = s.players.filter(function (q) { return q.id !== a.pid; });
        return s.players.length !== n;
      case 'claim':
        p = P(s, a.pid);
        if (!p || !a.device) return false;
        p.device = a.device;
        return true;
      case 'start':
        if (s.phase !== 'lobby' || s.players.length < 2) return false;
        s.players.forEach(resetPlayer);
        s.props = {}; s.phase = 'playing'; s.step = 'roll'; s.dbl = 0; s.pending = null;
        s.card = null; s.move = null; s.pay = null; s.winner = null;
        s.turn = Math.floor(rng() * s.players.length);
        s.deck = shuffle(B.CARDS.length, rng);
        s.log = [];
        log(s, 'Jogo iniciado! ' + cur(s).name + ' começa.');
        return true;
      case 'reset':
        s.phase = 'lobby'; s.props = {}; s.pending = null; s.card = null; s.move = null; s.winner = null; s.log = [];
        s.players.forEach(resetPlayer);
        return true;
    }

    if (s.phase !== 'playing') return false;
    p = P(s, a.pid);
    if (!p || p.bankrupt) return false;
    var isTurn = cur(s).id === p.id;

    switch (a.type) {
      case 'roll':
        if (!isTurn || s.step !== 'roll') return false;
        var d1 = 1 + Math.floor(rng() * 6), d2 = 1 + Math.floor(rng() * 6), dbl = d1 === d2;
        s.dice = [d1, d2]; s.rollSeq++;
        s.move = { seq: ++s.seq, pid: p.id, path: [] };
        log(s, '🎲 ' + p.name + ' tirou ' + d1 + ' + ' + d2 + (dbl ? ' (dupla!)' : ''));
        if (p.inJail) {
          s.dbl = 0;
          if (dbl) { p.inJail = false; p.jailTurns = 0; log(s, p.name + ' saiu da cadeia com a dupla'); walk(s, p, d1 + d2); }
          else if (++p.jailTurns >= 3) { p.inJail = false; p.jailTurns = 0; charge(s, B.BAIL, null, 'Fiança'); }
          else s.step = 'end';
          return true;
        }
        if (dbl) {
          if (++s.dbl === 3) { log(s, 'Três duplas seguidas!'); sendJail(s, p); s.step = 'end'; return true; }
        } else s.dbl = 0;
        walk(s, p, d1 + d2);
        return true;

      case 'jailPay':
        if (!isTurn || s.step !== 'roll' || !p.inJail || p.money < B.BAIL) return false;
        p.money -= B.BAIL; p.inJail = false; p.jailTurns = 0;
        payEvent(s, p.id, null, B.BAIL, 'Fiança');
        log(s, p.name + ' pagou fiança de ' + $(B.BAIL));
        return true;
      case 'jailCard':
        if (!isTurn || s.step !== 'roll' || !p.inJail || p.jailCards < 1) return false;
        p.jailCards--; p.inJail = false; p.jailTurns = 0;
        log(s, p.name + ' usou o habeas corpus');
        return true;

      case 'buy':
        if (!isTurn || s.step !== 'buy') return false;
        i = p.pos; n = B.SPACES[i].price;
        if (p.money < n) return false;
        p.money -= n;
        s.props[i] = { owner: p.id, houses: 0, mortgaged: false };
        payEvent(s, p.id, null, n, 'Compra · ' + B.SPACES[i].name);
        log(s, p.name + ' comprou ' + B.SPACES[i].name + ' por ' + $(n));
        finish(s);
        return true;
      case 'pass':
        if (!isTurn || s.step !== 'buy') return false;
        finish(s);
        return true;

      case 'pay':
        if (!isTurn || s.step !== 'pay') return false;
        n = pendingTotal(s);
        if (p.money < n) return false;
        p.money -= n;
        if (s.pending.to === 'all') {
          alive(s).forEach(function (q) { if (q.id !== p.id) q.money += s.pending.amount; });
        } else if (s.pending.to) P(s, s.pending.to).money += n;
        payEvent(s, p.id, s.pending.to, n, s.pending.reason);
        o = s.pending.to && s.pending.to !== 'all' ? P(s, s.pending.to).name : (s.pending.to === 'all' ? 'os jogadores' : 'o banco');
        log(s, '💳 ' + p.name + ' pagou ' + $(n) + ' para ' + o + ' (' + s.pending.reason + ')');
        s.pending = null;
        finish(s);
        return true;

      case 'bankrupt':
        if (!isTurn || s.step !== 'pay') return false;
        var cred = s.pending.to && s.pending.to !== 'all' ? P(s, s.pending.to) : null;
        owned(s, p.id).forEach(function (k) {
          var q = s.props[k];
          if (q.houses) { p.money += q.houses * houseCost(k) / 2; q.houses = 0; }
          if (cred) q.owner = cred.id; else delete s.props[k];
        });
        if (cred) { cred.money += p.money; cred.jailCards += p.jailCards; }
        p.money = 0; p.jailCards = 0; p.bankrupt = true; p.inJail = false; s.pending = null;
        log(s, '💥 ' + p.name + ' faliu!');
        var al = alive(s);
        if (al.length <= 1) {
          s.phase = 'ended'; s.winner = al[0] ? al[0].id : null;
          if (al[0]) log(s, '🏆 ' + al[0].name + ' venceu o jogo!');
        } else nextTurn(s);
        return true;

      case 'end':
        if (!isTurn || s.step !== 'end') return false;
        nextTurn(s);
        return true;

      case 'build':
        i = a.space;
        if (!isTurn || !canBuild(s, p.id, i)) return false;
        p.money -= houseCost(i); s.props[i].houses++;
        log(s, p.name + ' construiu ' + (s.props[i].houses === 5 ? 'um hotel' : 'uma casa') + ' em ' + B.SPACES[i].name);
        return true;
      case 'sell':
        i = a.space;
        if (!isTurn || !canSell(s, p.id, i)) return false;
        p.money += houseCost(i) / 2; s.props[i].houses--;
        log(s, p.name + ' vendeu uma construção em ' + B.SPACES[i].name);
        return true;
      case 'mortgage':
        i = a.space;
        if (!isTurn || !canMortgage(s, p.id, i)) return false;
        s.props[i].mortgaged = true; p.money += mortgageValue(i);
        log(s, p.name + ' hipotecou ' + B.SPACES[i].name);
        return true;
      case 'unmortgage':
        i = a.space; pr = s.props[i];
        if (!isTurn || !pr || pr.owner !== p.id || !pr.mortgaged || p.money < unmortgageCost(i)) return false;
        pr.mortgaged = false; p.money -= unmortgageCost(i);
        log(s, p.name + ' resgatou a hipoteca de ' + B.SPACES[i].name);
        return true;

      case 'transfer':
        o = P(s, a.to); n = Math.floor(Number(a.amount));
        if (!o || o.bankrupt || o.id === p.id || !(n > 0) || n > p.money) return false;
        p.money -= n; o.money += n;
        payEvent(s, p.id, o.id, n, 'Transferência');
        log(s, '💳 ' + p.name + ' transferiu ' + $(n) + ' para ' + o.name);
        return true;
      case 'giveProp':
        i = a.space; pr = s.props[i]; o = P(s, a.to);
        if (!pr || pr.owner !== p.id || !o || o.bankrupt || o.id === p.id || !groupClear(s, i)) return false;
        pr.owner = o.id;
        log(s, '🤝 ' + p.name + ' passou ' + B.SPACES[i].name + ' para ' + o.name);
        return true;
    }
    return false;
  }

  function netWorth(s, pid) {
    var t = P(s, pid).money;
    owned(s, pid).forEach(function (k) {
      var q = s.props[k];
      t += (q.mortgaged ? 0 : B.SPACES[k].price / 2) + (q.houses ? q.houses * houseCost(k) / 2 : 0);
    });
    return t;
  }

  var G = {
    newState: newState, apply: apply, cur: cur, P: P, owned: owned, hasSet: hasSet, rentFor: rentFor,
    houseCost: houseCost, mortgageValue: mortgageValue, unmortgageCost: unmortgageCost,
    canBuild: canBuild, canSell: canSell, canMortgage: canMortgage, groupClear: groupClear,
    pendingTotal: pendingTotal, netWorth: netWorth, alive: alive
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GAME = G;
})(this);
