/* Tela da TV: tabuleiro + autoridade do jogo. Não precisa de controle remoto: tudo é feito pelos celulares. */
(function () {
  'use strict';
  var B = BOARD, G = GAME, C = COMMON, esc = C.esc, money = C.money;
  var KEY = 'magnatas-tv-state';
  var board = document.getElementById('board');
  var center = document.getElementById('center');
  var tokensEl = document.getElementById('tokens');

  function newRoom() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ', r = '';
    for (var i = 0; i < 4; i++) r += abc[Math.floor(Math.random() * abc.length)];
    return r;
  }

  var state = null;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (C.qs('nova') || !state || !state.room || !state.players) state = G.newState(C.qs('sala').toUpperCase() || newRoom());
  var retired = false;
  function save() { if (retired) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  save();
  C.dropParam('nova');

  /* ---------- tabuleiro ---------- */
  function rc(i) {
    if (i <= 11) return [1, i + 1];
    if (i <= 17) return [i - 10, 12];
    if (i <= 29) return [8, 30 - i];
    return [37 - i, 1];
  }
  var cells = [];
  B.SPACES.forEach(function (sp, i) {
    var el = document.createElement('div'), p = rc(i);
    el.className = 'cell t-' + sp.t + (p[0] === 1 ? ' top' : '');
    el.style.gridRow = p[0]; el.style.gridColumn = p[1];
    var h = '';
    if (sp.t === 'prop') h += '<div class="band" style="background:' + B.GROUPS[sp.group].color + '"></div>';
    else h += '<div class="icon">' + sp.icon + '</div>';
    h += '<div class="name">' + esc(sp.name) + '</div>';
    if (sp.price) h += '<div class="price">' + money(sp.price) + '</div>';
    if (sp.amount) h += '<div class="price">−' + money(sp.amount) + '</div>';
    if (sp.t === 'start') h += '<div class="price">+' + money(B.SALARY) + '</div>';
    el.innerHTML = h;
    board.appendChild(el);
    cells.push(el);
  });

  center.innerHTML =
    '<div class="head"><div class="logo">MAGNATAS<small>o jogo das cidades</small></div>' +
    '<div id="roominfo"></div></div>' +
    '<div id="lobby"></div>' +
    '<div id="game"><div id="players"></div>' +
    '<div id="stage"><div id="turn"></div><div id="dice" class="dice"></div><div id="status"></div><div id="card"></div></div>' +
    '<div id="log"></div></div>';
  var el = {};
  ['roominfo', 'lobby', 'game', 'players', 'turn', 'dice', 'status', 'card', 'log'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });
  el.dice.innerHTML = C.dieHTML(1) + C.dieHTML(1);

  var joinUrl = (function () {
    var u = location.href.split('?')[0].replace(/[^/]*$/, '') + 'controle.html?sala=' + state.room;
    if (C.qs('peer')) u += '&peer=' + encodeURIComponent(C.qs('peer'));
    return u;
  })();
  var qrSvg = (function () {
    var q = qrcode(0, 'M');
    q.addData(joinUrl); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  })();

  var netOn = false, netBusy = false, phones = 0;
  var shown = {};       // posição exibida de cada peão
  var tokenEls = {};
  var lastRoll = state.rollSeq, lastCard = state.card ? state.card.seq : 0, lastPay = state.pay ? state.pay.seq : 0;
  var animating = false;

  function color(p) { return B.COLORS[p.ci]; }

  function renderCells() {
    cells.forEach(function (c, i) {
      var pr = state.props[i], old = c.querySelector('.own');
      if (old) c.removeChild(old);
      c.classList.toggle('mort', !!(pr && pr.mortgaged));
      if (!pr) { c.style.boxShadow = ''; return; }
      var o = G.P(state, pr.owner), d = document.createElement('div');
      c.style.boxShadow = 'inset 0 0 0 5px ' + color(o);
      d.className = 'own';
      d.style.background = color(o);
      d.innerHTML = pr.mortgaged ? 'HIPOTECA' : (pr.houses === 5 ? '🏨' : new Array(pr.houses + 1).join('🏠')) || esc(o.name);
      c.appendChild(d);
    });
  }

  function placeTokens() {
    var byCell = {};
    state.players.forEach(function (p) {
      if (p.bankrupt || state.phase === 'lobby') return;
      var pos = shown[p.id] === undefined ? p.pos : shown[p.id];
      (byCell[pos] = byCell[pos] || []).push(p);
    });
    Object.keys(tokenEls).forEach(function (id) {
      var p = G.P(state, id);
      if (!p || p.bankrupt || state.phase === 'lobby') { tokensEl.removeChild(tokenEls[id]); delete tokenEls[id]; delete shown[id]; }
    });
    Object.keys(byCell).forEach(function (pos) {
      var list = byCell[pos], p0 = rc(Number(pos));
      list.forEach(function (p, k) {
        var t = tokenEls[p.id];
        if (!t) {
          t = tokenEls[p.id] = document.createElement('div');
          t.className = 'token';
          t.textContent = B.TOKENS[p.ci];
          t.style.borderColor = color(p);
          tokensEl.appendChild(t);
        }
        var cols = Math.min(list.length, 3), row = Math.floor(k / 3), col = k % 3;
        var dx = (col - (cols - 1) / 2) * 46, dy = 17 + (list.length > 3 ? (row - 0.5) * 46 : 0);
        t.style.left = 'calc(' + ((p0[1] - 0.5) / 12 * 100) + '% + ' + dx + 'px)';
        t.style.top = 'calc(' + ((p0[0] - 0.5) / 8 * 100) + '% + ' + dy + 'px)';
        t.classList.toggle('active', state.phase === 'playing' && G.cur(state).id === p.id);
        t.classList.toggle('jailed', !!p.inJail && shown[p.id] === p.pos);
      });
    });
  }

  function statusText() {
    var p = G.cur(state), n = '<b style="color:' + color(p) + '">' + esc(p.name) + '</b>';
    switch (state.step) {
      case 'roll': return n + (p.inJail ? ', você está na cadeia: tente a dupla ou pague a fiança' : ', jogue os dados no celular 🎲');
      case 'buy': return n + ' pode comprar <b>' + esc(B.SPACES[p.pos].name) + '</b> por ' + money(B.SPACES[p.pos].price);
      case 'pay': return n + ' deve pagar <b>' + money(G.pendingTotal(state)) + '</b> — ' + esc(state.pending.reason) + ' 💳';
      default: return n + ': construa, negocie ou encerre a vez';
    }
  }

  function render() {
    var lobby = state.phase === 'lobby';
    el.roominfo.innerHTML = '<span class="dot ' + (netOn ? 'on' : 'off') + '"></span>Sala <b>' + state.room + '</b> · 📱 ' + phones;
    el.lobby.style.display = lobby ? '' : 'none';
    el.game.style.display = lobby ? 'none' : '';
    if (lobby) {
      el.lobby.innerHTML =
        '<div class="qr">' + qrSvg + '</div>' +
        '<div class="how"><h2>Aponte a câmera do celular</h2>' +
        '<p>ou abra <b>' + esc(joinUrl.replace(/^https?:\/\//, '').split('?')[0]) + '</b><br>e digite a sala <span class="code">' + state.room + '</span></p>' +
        '<div class="joined">' + (state.players.length ? state.players.map(function (p) {
          return '<span class="chip" style="border-color:' + color(p) + '">' + B.TOKENS[p.ci] + ' ' + esc(p.name) + '</span>';
        }).join('') : '<i>Nenhum jogador ainda…</i>') + '</div>' +
        '<p class="hint">' + (netBusy ? 'A sala está aberta em outra aba ou aparelho. Tentando de novo…' : netOn ? (state.players.length >= 2 ? 'Toque em <b>Começar</b> no celular!' : 'O celular é a maquininha de cartão e o dado. Dá para jogar todos no mesmo celular.') : 'Conectando à internet…') + '</p></div>';
    } else {
      var cur = G.cur(state);
      el.players.innerHTML = state.players.map(function (p) {
        var props = G.owned(state, p.id).length;
        return '<div class="pl' + (p.bankrupt ? ' out' : '') + (state.phase === 'playing' && cur.id === p.id ? ' cur' : '') + '" style="border-color:' + color(p) + '">' +
          '<span class="tk">' + B.TOKENS[p.ci] + '</span><span class="nm">' + esc(p.name) + (p.inJail ? ' 🚔' : '') + '</span>' +
          '<span class="mn">' + (p.bankrupt ? 'faliu' : money(p.money)) + '</span>' +
          '<span class="pp">🏘️ ' + props + '</span></div>';
      }).join('');
      if (state.phase === 'ended') {
        var w = G.P(state, state.winner);
        el.turn.innerHTML = '🏆 ' + (w ? esc(w.name) + ' venceu!' : 'Fim de jogo');
        el.status.innerHTML = 'Para jogar de novo, toque em <b>Novo jogo</b> no celular.';
      } else {
        el.turn.innerHTML = 'Vez de <span style="color:' + color(cur) + '">' + B.TOKENS[cur.ci] + ' ' + esc(cur.name) + '</span>';
        el.status.innerHTML = statusText();
      }
      el.card.innerHTML = state.card ? '<div class="cardbox"><b>❓ Surpresa</b>' + esc(state.card.text) + '</div>' : '';
      el.log.innerHTML = state.log.slice(-9).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    }
    renderCells();
    placeTokens();
  }

  /* Anima dados e peão quando houve uma jogada nova. */
  function onState() {
    save();
    net.broadcast({ t: 'state', state: state });
    if (state.pay && state.pay.seq !== lastPay) { lastPay = state.pay.seq; C.beep([880, 1320], 0.09); }
    if (state.rollSeq !== lastRoll && state.move && !animating) {
      lastRoll = state.rollSeq;
      var mv = state.move, path = mv.path.slice();
      animating = true;
      render();
      C.beep([300, 380, 300, 420], 0.07);
      C.animateDice(el.dice, state.dice, function step() {
        if (!path.length) { animating = false; syncShown(); render(); cardFx(); return; }
        shown[mv.pid] = path.shift();
        placeTokens();
        setTimeout(step, 210);
      });
      return;
    }
    if (!animating) { syncShown(); cardFx(); }
    render();
  }
  function syncShown() { state.players.forEach(function (p) { shown[p.id] = p.pos; }); }
  function cardFx() {
    if (state.card && state.card.seq !== lastCard) {
      lastCard = state.card.seq;
      el.card.classList.remove('pop');
      void el.card.offsetWidth;
      el.card.classList.add('pop');
    }
  }

  /* ---------- rede ---------- */
  var net = C.host(state.room, {
    status: function (s) { netOn = s === 'on'; netBusy = s === 'busy'; render(); },
    count: function (n) { phones = n; render(); },
    join: function () {},
    taken: function () {
      // Sala ocupada (outra aba aberta, ou o servidor ainda não soltou a sala depois de recarregar).
      // Com a sala vazia, troca o código; senão a própria conexão tenta de novo a cada 5 s.
      if (state.phase === 'lobby' && !state.players.length) { state.room = newRoom(); save(); location.reload(); }
    },
    data: function (d, conn) {
      if (retired || !d || typeof d !== 'object') return;
      if (d.t === 'hello') { conn.device = String(d.device || ''); conn.send({ t: 'state', state: state }); return; }
      if (d.t !== 'act' || !d.a || !conn.device) return;
      var a = d.a;
      if (a.type === 'join' || a.type === 'claim') a.device = conn.device;
      else if (a.pid && a.type !== 'leave') {
        var p = G.P(state, a.pid);
        if (!p || p.device !== conn.device) return;
      }
      if (G.apply(state, a)) onState();
    }
  });

  /* Ajusta o tabuleiro à área realmente visível (o Silk tem barra de endereço e pode dar zoom na página). */
  function fit() {
    var vv = window.visualViewport;
    var w = vv ? vv.width : window.innerWidth, h = vv ? vv.height : window.innerHeight;
    var ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0;
    if (!(w > 0 && h > 0)) return;
    var s = Math.min(w / 1920, h / 1080) * 0.97;
    board.style.transform = 'translate(' + (ox + (w - 1920 * s) / 2) + 'px,' + (oy + (h - 1080 * s) / 2) + 'px) scale(' + s + ')';
  }
  fit();
  window.addEventListener('resize', fit);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fit);
    window.visualViewport.addEventListener('scroll', fit);
  }
  setInterval(fit, 1000);
  // Qualquer clique do controle remoto tenta entrar em tela cheia (esconde a barra do navegador)
  function goFull() {
    var d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
    try { if (f && !(document.fullscreenElement || document.webkitFullscreenElement)) { var r = f.call(d); if (r && r.catch) r.catch(function () {}); } } catch (e) {}
  }
  document.addEventListener('click', goFull);
  document.addEventListener('keydown', goFull);

  syncShown();
  render();
  C.wakeLock();
  C.keepAwake();
  C.claimTab(function () { retired = true; net.stop(); });
  C.autoUpdate(function () { return !animating; });
  // Mantém a tela "viva" e reenvia o estado de tempos em tempos (cura celulares que perderam uma mensagem)
  setInterval(function () { if (!retired) net.broadcast({ t: 'state', state: state }); }, 4000);
})();
