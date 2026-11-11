/* Celular: maquininha de cartão + dados. Um celular pode controlar vários jogadores (é só passar a maquininha). */
(function () {
  'use strict';
  var B = BOARD, G = GAME, C = COMMON, esc = C.esc, money = C.money;
  var app = document.getElementById('app'), overlay = document.getElementById('overlay');

  var device = localStorage.getItem('magnatas-device');
  if (!device) { device = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('magnatas-device', device); }

  var room = C.qs('sala').toUpperCase().replace(/[^A-Z]/g, '');
  var state = null, online = false, net = null;
  var ui = { tab: 'play', view: null, amount: '', to: null, give: null, confirm: null };
  var lastRoll = -1, lastPay = -1, lastTurn = null, rolling = false;

  function send(a) {
    if (!net) return;
    if (!net.send({ t: 'act', a: a })) flash('Reconectando com a TV…<br><small>Sua ação será enviada assim que voltar.</small>', 'bad', 2500);
  }
  function mine() { return state.players.filter(function (p) { return p.device === device; }); }
  function color(p) { return B.COLORS[p.ci]; }
  function tag(p) { return '<span class="who" style="border-color:' + color(p) + '">' + B.TOKENS[p.ci] + ' ' + esc(p.name) + '</span>'; }

  /* ---------- avisos estilo maquininha ---------- */
  var flashTimer = null;
  function flash(html, cls, ms) {
    overlay.className = 'show ' + (cls || '');
    overlay.innerHTML = '<div class="slip">' + html + '</div>';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { overlay.className = ''; }, ms || 1500);
  }
  overlay.addEventListener('click', function () { overlay.className = ''; });

  /* ---------- telas ---------- */
  function header() {
    return '<header><span><i class="dot ' + (online ? 'on' : 'off') + '"></i>' + (room ? 'Sala ' + esc(room) : 'Sem sala') +
      '</span><b>MAGNATAS</b></header>' + (state && !online ? '<div class="offline">Reconectando com a TV…</div>' : '');
  }

  function viewRoom() {
    return header() + '<div class="pad"><div class="lcd"><small>MAQUININHA</small><div class="big">Digite a sala</div>' +
      '<small>O código de 4 letras aparece na TV</small></div>' +
      '<input id="room" class="inp code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD">' +
      '<button class="btn go" data-a="room">CONECTAR</button></div>';
  }

  function viewLobby() {
    var m = mine(), full = state.players.length >= B.MAX_PLAYERS;
    var h = header() + '<div class="pad"><div class="lcd"><small>SALA DE ESPERA</small><div class="big">' + state.players.length +
      ' jogador' + (state.players.length === 1 ? '' : 'es') + '</div><small>Cada um pode usar seu celular, ou todos usam este</small></div>';
    h += '<div class="list">' + state.players.map(function (p) {
      var own = p.device === device;
      return '<div class="row">' + tag(p) + (own ? '<button class="mini" data-a="leave" data-p="' + p.id + '">remover</button>' : '<small>outro celular</small>') + '</div>';
    }).join('') + '</div>';
    if (!full) {
      h += '<input id="name" class="inp" maxlength="12" autocomplete="off" placeholder="Nome do jogador">' +
        '<button class="btn" data-a="join">+ ADICIONAR JOGADOR' + (m.length ? ' NESTE CELULAR' : '') + '</button>';
    }
    h += state.players.length >= 2 ? '<button class="btn go" data-a="start">COMEÇAR JOGO</button>'
      : '<p class="note">Adicione pelo menos 2 jogadores.</p>';
    return h + '</div>';
  }

  function lcd(v) {
    var where = B.SPACES[v.pos].name + (v.inJail ? ' (preso)' : '');
    return '<div class="lcd" style="border-color:' + color(v) + '"><small>' + B.TOKENS[v.ci] + ' ' + esc(v.name) + ' · ' + esc(where) +
      (v.jailCards ? ' · 🎫×' + v.jailCards : '') + '</small><div class="big">' + money(v.money) + '</div><small>SALDO</small></div>';
  }

  function propCard(i) {
    var sp = B.SPACES[i], h = '<div class="deed">';
    if (sp.t === 'prop') {
      h += '<div class="band" style="background:' + B.GROUPS[sp.group].color + '">' + esc(sp.name) + '</div>' +
        '<table><tr><td>Aluguel</td><td>' + money(sp.rent) + '</td></tr>' +
        '<tr><td>Com o grupo completo</td><td>' + money(sp.rent * 2) + '</td></tr>';
      for (var k = 1; k <= 5; k++) h += '<tr><td>' + (k === 5 ? 'Hotel' : k + ' casa' + (k > 1 ? 's' : '')) + '</td><td>' + money(sp.rent * B.HOUSE_MULT[k]) + '</td></tr>';
      h += '<tr><td>Cada casa custa</td><td>' + money(G.houseCost(i)) + '</td></tr></table>';
    } else {
      h += '<div class="band" style="background:#5d6d7e">' + sp.icon + ' ' + esc(sp.name) + '</div><table>';
      for (var n = 1; n <= 4; n++) h += '<tr><td>Com ' + n + ' transporte' + (n > 1 ? 's' : '') + '</td><td>' + money(B.TRANS_RENT[n]) + '</td></tr>';
      h += '</table>';
    }
    return h + '</div>';
  }

  function tabPlay(v) {
    var cur = G.cur(state), h = '';
    if (state.phase === 'ended') {
      var w = G.P(state, state.winner);
      return '<div class="msg">🏆<br>' + (w ? esc(w.name) + ' venceu!' : 'Fim de jogo') + '</div><button class="btn go" data-a="reset">NOVO JOGO</button>';
    }
    h += '<div class="dice" id="dice">' + C.dieHTML(state.dice[0]) + C.dieHTML(state.dice[1]) + '</div>';
    if (v.bankrupt) return h + '<div class="msg">💥 ' + esc(v.name) + ' faliu.</div>';
    if (cur.id !== v.id) {
      h += '<div class="msg">Vez de ' + tag(cur) + '</div>';
      if (cur.device === device) h += '<button class="btn" data-a="view" data-p="' + cur.id + '">PASSAR A MAQUININHA PARA ' + esc(cur.name.toUpperCase()) + '</button>';
      return h + lastLog();
    }
    if (rolling) return h + '<div class="msg">Rolando…</div>';
    switch (state.step) {
      case 'roll':
        if (v.inJail) {
          h += '<div class="msg">🚔 Você está na cadeia (tentativa ' + (v.jailTurns + 1) + ' de 3)</div>' +
            '<button class="btn go" data-a="roll">🎲 TENTAR DUPLA</button>' +
            '<button class="btn" data-a="jailPay"' + (v.money < B.BAIL ? ' disabled' : '') + '>💳 PAGAR FIANÇA ' + money(B.BAIL) + '</button>';
          if (v.jailCards) h += '<button class="btn" data-a="jailCard">🎫 USAR HABEAS CORPUS</button>';
        } else {
          h += '<button class="btn go huge" data-a="roll">🎲 JOGAR DADOS</button>' +
            '<p class="note">' + (state.dbl ? 'Dupla! Jogue de novo.' : 'Toque no botão ou chacoalhe o celular.') + '</p>';
        }
        break;
      case 'buy':
        var sp = B.SPACES[v.pos];
        h += propCard(v.pos) +
          '<button class="btn go" data-a="buy"' + (v.money < sp.price ? ' disabled' : '') + '>💳 COMPRAR POR ' + money(sp.price) + '</button>' +
          '<button class="btn ghost" data-a="pass">NÃO COMPRAR</button>';
        if (v.money < sp.price) h += '<p class="note">Saldo insuficiente para comprar.</p>';
        break;
      case 'pay':
        var tot = G.pendingTotal(state), pd = state.pending;
        var dest = pd.to === 'all' ? 'Todos os jogadores' : (pd.to ? esc(G.P(state, pd.to).name) : 'Banco');
        h += '<div class="bill"><small>' + esc(pd.reason) + '</small><div class="val">' + money(tot) + '</div><small>para: <b>' + dest + '</b></small></div>';
        if (v.money >= tot) h += '<button class="btn pay" data-a="pay">💳 PASSAR O CARTÃO</button>';
        else {
          h += '<div class="msg bad">SALDO INSUFICIENTE<br><small>Faltam ' + money(tot - v.money) + '. Venda casas ou hipoteque em “Imóveis”.</small></div>' +
            '<button class="btn danger" data-a="ask" data-c="bankrupt">DECLARAR FALÊNCIA</button>';
        }
        break;
      default:
        h += '<button class="btn go" data-a="end">✔ ENCERRAR A VEZ</button>' +
          '<p class="note">Antes de encerrar você pode construir em “Imóveis”.</p>';
    }
    return h + lastLog();
  }
  function lastLog() {
    return '<div class="log">' + state.log.slice(-3).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
  }

  function tabProps(v) {
    var list = G.owned(state, v.id), myTurn = G.cur(state).id === v.id && state.phase === 'playing';
    if (!list.length) return '<div class="msg">' + esc(v.name) + ' ainda não tem imóveis.</div>';
    var h = myTurn ? '' : '<p class="note warn">Construir e hipotecar só na sua vez de jogar.</p>';
    list.forEach(function (i) {
      var sp = B.SPACES[i], pr = state.props[i];
      var bg = sp.t === 'prop' ? B.GROUPS[sp.group].color : '#5d6d7e';
      h += '<div class="prop"><div class="ptitle"><i style="background:' + bg + '"></i><b>' + esc(sp.name) + '</b>' +
        '<span>' + (pr.mortgaged ? 'HIPOTECADO' : (pr.houses === 5 ? '🏨' : new Array(pr.houses + 1).join('🏠')) + ' aluguel ' + money(G.rentFor(state, i))) + '</span></div>';
      if (ui.give === i) {
        h += '<div class="pbtns">Passar para: ' + G.alive(state).filter(function (o) { return o.id !== v.id; }).map(function (o) {
          return '<button class="mini" data-a="giveTo" data-p="' + o.id + '">' + esc(o.name) + '</button>';
        }).join('') + '<button class="mini" data-a="give" data-i="-1">cancelar</button></div>';
      } else {
        h += '<div class="pbtns">';
        var why = '';
        if (sp.t === 'prop' && pr.houses < 5) {
          why = myTurn ? G.buildBlock(state, v.id, i) : '';
          h += '<button class="mini build" data-a="build" data-i="' + i + '"' + (myTurn && !why ? '' : ' disabled') + '>' +
            (pr.houses === 4 ? '+🏨 Hotel ' : '+🏠 Casa ') + money(G.houseCost(i)) + '</button>';
        }
        if (sp.t === 'prop' && pr.houses) h += '<button class="mini" data-a="sell" data-i="' + i + '"' + (myTurn && G.canSell(state, v.id, i) ? '' : ' disabled') + '>−🏠 +' + money(G.houseCost(i) / 2) + '</button>';
        if (pr.mortgaged) h += '<button class="mini" data-a="unmortgage" data-i="' + i + '"' + (myTurn && v.money >= G.unmortgageCost(i) ? '' : ' disabled') + '>Resgatar ' + money(G.unmortgageCost(i)) + '</button>';
        else h += '<button class="mini" data-a="mortgage" data-i="' + i + '"' + (myTurn && G.canMortgage(state, v.id, i) ? '' : ' disabled') + '>Hipotecar +' + money(G.mortgageValue(i)) + '</button>';
        if (G.groupClear(state, i)) h += '<button class="mini" data-a="give" data-i="' + i + '">Passar 🤝</button>';
        h += '</div>';
        if (why) h += '<div class="why">' + esc(why) + '</div>';
      }
      h += '</div>';
    });
    return h;
  }

  function tabPix(v) {
    var others = G.alive(state).filter(function (o) { return o.id !== v.id; });
    var n = Number(ui.amount || 0);
    var h = '<div class="bill"><small>TRANSFERIR</small><div class="val">' + money(n) + '</div></div><div class="dest">';
    others.forEach(function (o) {
      h += '<button class="mini' + (ui.to === o.id ? ' sel' : '') + '" data-a="to" data-p="' + o.id + '" style="border-color:' + color(o) + '">' + B.TOKENS[o.ci] + ' ' + esc(o.name) + '</button>';
    });
    h += '</div><div class="keys">';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].forEach(function (k) {
      h += '<button class="key' + (k === 'C' ? ' kc' : '') + '" data-a="key" data-k="' + k + '">' + k + '</button>';
    });
    h += '</div><button class="btn pay" data-a="transfer"' + (n > 0 && n <= v.money && ui.to && !v.bankrupt ? '' : ' disabled') + '>💳 ENVIAR</button>';
    if (n > v.money) h += '<p class="note">Saldo insuficiente.</p>';
    return h;
  }

  function tabMenu() {
    var h = '<h3>Placar (patrimônio)</h3><div class="list">' + state.players.slice().sort(function (a, b) {
      return G.netWorth(state, b.id) - G.netWorth(state, a.id);
    }).map(function (p) {
      return '<div class="row">' + tag(p) + '<b>' + (p.bankrupt ? 'faliu' : money(G.netWorth(state, p.id))) + '</b></div>';
    }).join('') + '</div>';
    var others = state.players.filter(function (p) { return p.device !== device && !p.bankrupt; });
    if (others.length) {
      h += '<h3>Assumir jogador de outro celular</h3><p class="note">Use se o celular de alguém descarregou.</p><div class="dest">' + others.map(function (p) {
        return '<button class="mini" data-a="ask" data-c="claim" data-p="' + p.id + '">' + esc(p.name) + '</button>';
      }).join('') + '</div>';
    }
    var free = G.freeBuild(state);
    h += '<h3>Regra de construção</h3><div class="dest">' +
      '<button class="mini' + (free ? ' sel' : '') + '" data-a="rules" data-k="livre">Em qualquer imóvel</button>' +
      '<button class="mini' + (!free ? ' sel' : '') + '" data-a="rules" data-k="grupo">Só com o grupo completo</button></div>' +
      '<p class="note">' + (free ? 'Dá para construir em qualquer imóvel seu.' : 'Regra clássica: precisa de todos os imóveis da cor e construir por igual.') + '</p>';
    h += '<h3>Partida</h3><button class="btn danger" data-a="ask" data-c="reset">ENCERRAR E VOLTAR À SALA DE ESPERA</button>';
    return h;
  }

  function viewGame() {
    var m = mine();
    if (!m.length) {
      return header() + '<div class="pad"><div class="msg">O jogo já começou.<br><small>Para controlar um jogador por este celular, escolha abaixo.</small></div><div class="dest">' +
        state.players.filter(function (p) { return !p.bankrupt; }).map(function (p) {
          return '<button class="mini" data-a="ask" data-c="claim" data-p="' + p.id + '">' + esc(p.name) + '</button>';
        }).join('') + '</div>' + confirmBox() + '</div>';
    }
    var v = G.P(state, ui.view);
    if (!v || v.device !== device) { v = m[0]; ui.view = v.id; }
    var h = header() + '<div class="pad">';
    if (m.length > 1) {
      h += '<div class="chips">' + m.map(function (p) {
        return '<button class="chip' + (p.id === v.id ? ' sel' : '') + (G.cur(state).id === p.id ? ' turn' : '') + '" data-a="view" data-p="' + p.id + '" style="border-color:' + color(p) + '">' + B.TOKENS[p.ci] + ' ' + esc(p.name) + '</button>';
      }).join('') + '</div>';
    }
    h += lcd(v) + confirmBox();
    h += '<div class="tab">' + (ui.tab === 'play' ? tabPlay(v) : ui.tab === 'props' ? tabProps(v) : ui.tab === 'pix' ? tabPix(v) : tabMenu()) + '</div></div>';
    h += '<nav>' + [['play', '🎲', 'Jogada'], ['props', '🏘️', 'Imóveis'], ['pix', '💸', 'Transferir'], ['menu', '☰', 'Menu']].map(function (t) {
      return '<button data-a="tab" data-k="' + t[0] + '"' + (ui.tab === t[0] ? ' class="sel"' : '') + '><span>' + t[1] + '</span>' + t[2] + '</button>';
    }).join('') + '</nav>';
    return h;
  }

  function confirmBox() {
    if (!ui.confirm) return '';
    var c = ui.confirm, txt = c.c === 'bankrupt' ? 'Declarar falência? Você sai do jogo.'
      : c.c === 'reset' ? 'Encerrar a partida atual para todos?'
      : 'Controlar ' + esc((G.P(state, c.p) || {}).name || '') + ' por este celular?';
    return '<div class="confirm"><p>' + txt + '</p><button class="btn danger" data-a="yes">SIM</button><button class="btn ghost" data-a="no">CANCELAR</button></div>';
  }

  function render() {
    var keep = {}, focus = document.activeElement && document.activeElement.id;
    ['name', 'room'].forEach(function (id) { var e = document.getElementById(id); if (e) keep[id] = e.value; });
    app.innerHTML = !room ? viewRoom()
      : !state ? header() + '<div class="pad"><div class="msg"><div class="spin"></div>Conectando à TV…<br><small>Confira se a TV está com o jogo aberto na sala ' + esc(room) + '.</small></div><button class="btn ghost" data-a="chroom">TROCAR DE SALA</button></div>'
      : state.phase === 'lobby' ? viewLobby() : viewGame();
    Object.keys(keep).forEach(function (id) { var e = document.getElementById(id); if (e) e.value = keep[id]; });
    if (focus) { var f = document.getElementById(focus); if (f) f.focus(); }
  }

  /* ---------- eventos da TV ---------- */
  function onState(s) {
    var first = !state;
    state = s;
    if (first) { lastRoll = s.rollSeq; lastPay = s.pay ? s.pay.seq : 0; }
    if (s.phase !== 'lobby') {
      var cur = G.cur(s);
      // quando a vez muda para um jogador deste celular, a maquininha já mostra ele
      if (cur.id !== lastTurn) { lastTurn = cur.id; if (cur.device === device) { ui.view = cur.id; ui.tab = 'play'; ui.give = null; } }
    }
    if (s.pay && s.pay.seq !== lastPay) {
      lastPay = s.pay.seq;
      var from = G.P(s, s.pay.from), to = s.pay.to && s.pay.to !== 'all' ? G.P(s, s.pay.to) : null;
      if (from && from.device === device) {
        C.beep([1200, 1600], 0.09);
        flash('<div class="ok">✔</div><b>APROVADO</b><div class="v">' + money(s.pay.amount) + '</div><small>' + esc(s.pay.label) + '</small>', 'good');
      } else if ((to && to.device === device) || (s.pay.to === 'all' && mine().length)) {
        C.beep([900, 1200, 1500], 0.07);
        flash('<div class="ok">＋</div><b>RECEBIDO</b><div class="v">' + money(s.pay.to === 'all' ? s.pay.amount / Math.max(1, G.alive(s).length - 1) : s.pay.amount) + '</div><small>de ' + esc(from ? from.name : '') + '</small>', 'good');
      }
    }
    var newRoll = s.rollSeq !== lastRoll;
    lastRoll = s.rollSeq;
    if (newRoll && s.move && G.P(s, s.move.pid) && G.P(s, s.move.pid).device === device && ui.tab === 'play') {
      rolling = true;
      render();
      var d = document.getElementById('dice');
      if (d) C.animateDice(d, s.dice, function () { rolling = false; render(); });
      else rolling = false;
      setTimeout(function () { if (rolling) { rolling = false; render(); } }, 1500);
      return;
    }
    render();
  }

  function connect() {
    if (net) net.close();
    state = null; online = false;
    if (!room) { render(); return; }
    net = C.client(room, {
      status: function (s) { online = s === 'on'; render(); },
      open: function () { net.send({ t: 'hello', device: device }); },
      data: function (d) { if (d && d.t === 'state') onState(d.state); }
    });
    render();
  }

  /* ---------- toques ---------- */
  app.addEventListener('click', function (ev) {
    var t = ev.target;
    while (t && t !== app && !(t.getAttribute && t.getAttribute('data-a'))) t = t.parentNode;
    if (!t || t === app || t.disabled) return;
    var a = t.getAttribute('data-a'), pid = t.getAttribute('data-p'), i = Number(t.getAttribute('data-i')), k = t.getAttribute('data-k');
    C.beep([700], 0.03);
    switch (a) {
      case 'room':
        var r = document.getElementById('room').value.toUpperCase().replace(/[^A-Z]/g, '');
        if (r.length === 4) { room = r; history.replaceState(null, '', location.pathname + '?sala=' + r + (C.qs('peer') ? '&peer=' + encodeURIComponent(C.qs('peer')) : '')); connect(); }
        return;
      case 'chroom': room = ''; if (net) net.close(); net = null; render(); return;
      case 'join':
        var nm = document.getElementById('name');
        if (nm.value.trim()) { send({ type: 'join', name: nm.value }); nm.value = ''; }
        else nm.focus();
        return;
      case 'leave': send({ type: 'leave', pid: pid }); return;
      case 'start': askMotion(); send({ type: 'start' }); return;
      case 'tab': ui.tab = k; ui.give = null; ui.confirm = null; break;
      case 'view': ui.view = pid; ui.give = null; ui.amount = ''; ui.to = null; break;
      case 'roll': askMotion(); send({ type: 'roll', pid: ui.view }); return;
      case 'jailPay': case 'jailCard': case 'buy': case 'pass': case 'pay': case 'end':
        send({ type: a, pid: ui.view }); return;
      case 'build': case 'sell': case 'mortgage': case 'unmortgage':
        send({ type: a, pid: ui.view, space: i }); return;
      case 'give': ui.give = i >= 0 ? i : null; break;
      case 'giveTo': send({ type: 'giveProp', pid: ui.view, space: ui.give, to: pid }); ui.give = null; break;
      case 'to': ui.to = pid; break;
      case 'key':
        if (k === 'C') ui.amount = '';
        else if (k === '⌫') ui.amount = ui.amount.slice(0, -1);
        else if (ui.amount.length < 6) ui.amount = String(Number(ui.amount + k));
        if (ui.amount === '0') ui.amount = '';
        break;
      case 'transfer':
        send({ type: 'transfer', pid: ui.view, to: ui.to, amount: Number(ui.amount) });
        ui.amount = '';
        break;
      case 'reset': send({ type: 'reset' }); return;
      case 'rules': send({ type: 'rules', build: k }); return;
      case 'ask': ui.confirm = { c: t.getAttribute('data-c'), p: pid }; break;
      case 'no': ui.confirm = null; break;
      case 'yes':
        var c = ui.confirm; ui.confirm = null;
        if (c.c === 'bankrupt') send({ type: 'bankrupt', pid: ui.view });
        else if (c.c === 'reset') { send({ type: 'reset' }); ui.tab = 'play'; }
        else send({ type: 'claim', pid: c.p });
        break;
    }
    render();
  });
  app.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var b = app.querySelector(ev.target.id === 'room' ? '[data-a=room]' : '[data-a=join]');
    if (b) b.click();
  });

  /* ---------- chacoalhar para jogar os dados ---------- */
  var motionAsked = false, lastShake = 0;
  function onMotion(e) {
    var g = e.accelerationIncludingGravity;
    if (!g || !state || state.phase !== 'playing' || ui.tab !== 'play' || rolling) return;
    var mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    if (mag < 28 || Date.now() - lastShake < 2000) return;
    var cur = G.cur(state);
    if (state.step === 'roll' && cur.id === ui.view && cur.device === device && !cur.inJail) {
      lastShake = Date.now();
      send({ type: 'roll', pid: cur.id });
    }
  }
  function askMotion() {
    if (motionAsked) return;
    motionAsked = true;
    try {
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(function (r) { if (r === 'granted') window.addEventListener('devicemotion', onMotion); }).catch(function () {});
      }
    } catch (e) {}
  }
  if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission !== 'function') window.addEventListener('devicemotion', onMotion);

  C.wakeLock();
  C.autoUpdate(function () { return !rolling && !ui.confirm; });
  connect();
})();
