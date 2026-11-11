/* Utilidades compartilhadas entre a TV e o celular: rede (PeerJS/WebRTC), dados, som. */
(function (root) {
  'use strict';
  var PREFIX = 'magnatas-jogo-v1-';
  var VERSION = '5';   // igual ao version.json; mudar os dois a cada atualização


  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // ?peer=host:porta permite usar um servidor PeerJS próprio (usado nos testes)
  function peerOpts() {
    var o = { debug: 1 }, c = qs('peer');
    if (c) {
      var parts = c.split(':');
      o.host = parts[0]; o.port = Number(parts[1] || 9000); o.path = '/'; o.secure = false;
    }
    return o;
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) { return '$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(n) {
    var h = '<div class="die">';
    for (var i = 0; i < 9; i++) h += '<i' + (PIPS[n].indexOf(i) >= 0 ? ' class="on"' : '') + '></i>';
    return h + '</div>';
  }

  /* Mostra dados "girando" por um instante e depois o resultado final. */
  function animateDice(el, dice, done) {
    var t = 0;
    el.classList.add('rolling');
    var iv = setInterval(function () {
      if (++t >= 9) {
        clearInterval(iv);
        el.classList.remove('rolling');
        el.innerHTML = dieHTML(dice[0]) + dieHTML(dice[1]);
        if (done) done();
        return;
      }
      el.innerHTML = dieHTML(1 + Math.floor(Math.random() * 6)) + dieHTML(1 + Math.floor(Math.random() * 6));
    }, 90);
  }

  var actx = null;
  function beep(freqs, dur) {
    try {
      actx = actx || new (root.AudioContext || root.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime;
      freqs.forEach(function (f, k) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.06, t + k * dur);
        g.gain.exponentialRampToValueAtTime(0.001, t + (k + 1) * dur);
        o.connect(g); g.connect(actx.destination);
        o.start(t + k * dur); o.stop(t + (k + 1) * dur);
      });
    } catch (e) { /* sem áudio */ }
  }

  function wakeLock() {
    function req() {
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
    }
    req();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) req(); });
  }

  /* Confere de tempos em tempos se saiu versão nova do jogo; se saiu, recarrega a página.
     canReload() deixa adiar a recarga para não interromper uma animação. */
  function autoUpdate(canReload) {
    function check() {
      if (!root.fetch) return;
      fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.v && j.v !== VERSION) waitReload();
      }).catch(function () {});
    }
    function waitReload() {
      if (canReload && !canReload()) { setTimeout(waitReload, 3000); return; }
      var u = location.pathname + location.search.replace(/([?&])(nova|v)=[^&]*&?/g, '$1').replace(/[?&]$/, '');
      location.replace(u + (u.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now());
    }
    setTimeout(check, 5000);
    setInterval(check, 60000);
  }

  /* Tira ?nova=1 do endereço depois de usado, para uma recarga não apagar a partida de novo. */
  function dropParam(name) {
    if (!C_qsHas(name) || !root.history || !history.replaceState) return;
    var q = location.search.replace(new RegExp('([?&])' + name + '=[^&]*&?'), '$1').replace(/[?&]$/, '');
    history.replaceState(null, '', location.pathname + q);
  }
  function C_qsHas(name) { return new RegExp('[?&]' + name + '=').test(location.search); }

  /* Mantém a TV acordada: o protetor de tela do Fire TV entra depois de alguns minutos sem usar o controle
     (e no jogo ninguém usa o controle). Um vídeo tocando segura o protetor de tela. */
  function keepAwake() {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 16;
      var x = c.getContext('2d'), v = document.createElement('video');
      if (!c.captureStream) return;
      var tick = 0;
      setInterval(function () { x.fillStyle = (tick++ % 2) ? '#0b1d2a' : '#0c1e2b'; x.fillRect(0, 0, 16, 16); }, 1000);
      v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.loop = true;
      v.srcObject = c.captureStream(1);
      v.style.cssText = 'position:fixed;right:0;bottom:0;width:4px;height:4px;opacity:0.01;pointer-events:none;z-index:-1';
      document.body.appendChild(v);
      function play() { var r = v.play(); if (r && r.catch) r.catch(function () {}); }
      play();
      document.addEventListener('click', play); document.addEventListener('keydown', play);
      setInterval(function () { if (v.paused) play(); }, 15000);
    } catch (e) {}
  }

  /* Só uma aba da TV pode comandar o jogo. Se o jogo for aberto de novo em outra aba,
     a aba antiga se desliga (senão as duas brigam pela sala e os celulares perdem a conexão). */
  function claimTab(onRetire) {
    var me = 't' + Math.random().toString(36).slice(2), K = 'magnatas-tv-owner';
    try { localStorage.setItem(K, me); } catch (e) { return; }
    root.addEventListener('storage', function (ev) {
      if (ev.key !== K || !ev.newValue || ev.newValue === me) return;
      onRetire();
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99;background:#0b1d2a;color:#fff;display:flex;' +
        'align-items:center;justify-content:center;text-align:center;font:28px "Trebuchet MS",Arial,sans-serif;padding:40px';
      d.innerHTML = 'O jogo foi aberto em outra aba.<br>Esta aba foi desligada e pode ser fechada.';
      document.body.appendChild(d);
    });
  }

  /* TV: abre a sala e recebe os celulares.
     Cada celular manda "ping" a cada 4 s; quem fica 20 s calado é dado como desconectado. */
  function host(room, cb) {
    var conns = [], peer = null, stopped = false, retryT = null;
    function count() { cb.count(conns.length); }
    function drop(c) {
      var k = conns.indexOf(c);
      if (k >= 0) { conns.splice(k, 1); count(); }
      try { c.close(); } catch (e) {}
    }
    function again(ms) {
      clearTimeout(retryT);
      retryT = setTimeout(function () { if (!stopped) open(); }, ms);
    }
    function open() {
      try { if (peer) peer.destroy(); } catch (e) {}
      var mine = peer = new Peer(PREFIX + room, peerOpts());
      mine.on('open', function () { if (peer === mine) cb.status('on'); });
      mine.on('connection', function (c) {
        c.last = Date.now();
        c.on('open', function () { c.last = Date.now(); conns.push(c); count(); });
        c.on('data', function (d) {
          c.last = Date.now();
          if (d && d.t === 'ping') { try { c.send({ t: 'pong' }); } catch (e) {} return; }
          cb.data(d, c);
        });
        c.on('close', function () { drop(c); });
        c.on('error', function () { drop(c); });
      });
      mine.on('disconnected', function () {
        if (peer !== mine || mine.destroyed) return;
        cb.status('off');
        // as conexões já abertas com os celulares continuam funcionando; só reabre o canal para novos celulares
        setTimeout(function () { if (peer === mine && !mine.destroyed && mine.disconnected) { try { mine.reconnect(); } catch (e) { again(1000); } } }, 2000);
      });
      mine.on('error', function (e) {
        if (peer !== mine) return;
        if (e.type === 'peer-unavailable') return;
        if (e.type === 'unavailable-id') {
          // outra aba/aparelho está com a sala, ou o servidor ainda não soltou a sala desta TV: tenta de novo
          cb.status('busy'); cb.taken(); again(5000); return;
        }
        cb.status('off');
        if (mine.destroyed || !mine.open) again(3000);
      });
    }
    open();
    setInterval(function () {
      var now = Date.now();
      conns.slice().forEach(function (c) { if (now - c.last > 20000 || !c.open) drop(c); });
    }, 5000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !stopped && peer && (peer.destroyed || peer.disconnected)) again(100);
    });
    return {
      broadcast: function (msg) {
        conns.forEach(function (c) { if (c.open) { try { c.send(msg); } catch (e) {} } });
      },
      stop: function () { stopped = true; clearTimeout(retryT); try { peer.destroy(); } catch (e) {} }
    };
  }

  /* Celular: conecta na sala da TV, confere se a TV continua respondendo e reconecta sozinho se cair.
     Uma ação feita durante a queda fica guardada e é enviada assim que voltar. */
  function client(room, cb) {
    var peer = null, conn = null, timer = null, dead = false, last = 0, pending = null;
    function isOpen() { return !!(conn && conn.open); }
    function retry(ms) {
      if (dead) return;
      conn = null;
      cb.status('off');
      clearTimeout(timer);
      timer = setTimeout(connect, ms === undefined ? 1500 : ms);
    }
    function connect() {
      clearTimeout(timer);
      try { if (peer) peer.destroy(); } catch (e) {}
      conn = null;
      var mine = peer = new Peer(peerOpts());
      var guard = setTimeout(function () { if (peer === mine && !isOpen()) retry(0); }, 10000);
      mine.on('open', function () {
        var c = mine.connect(PREFIX + room, { reliable: true });
        c.on('open', function () {
          if (peer !== mine) return;
          clearTimeout(guard); conn = c; last = Date.now();
          cb.status('on'); cb.open();
          if (pending && Date.now() - pending.at < 30000) { try { c.send(pending.msg); } catch (e) {} }
          pending = null;
        });
        c.on('data', function (d) { if (peer !== mine) return; last = Date.now(); if (d && d.t === 'pong') return; cb.data(d); });
        c.on('close', function () { if (peer === mine) retry(); });
        c.on('error', function () { if (peer === mine) retry(); });
      });
      mine.on('error', function () { if (peer === mine) retry(); });
      mine.on('disconnected', function () { if (peer === mine && !isOpen()) retry(); });
    }
    connect();
    setInterval(function () {
      if (dead || !isOpen()) return;
      if (Date.now() - last > 12000) { retry(0); return; }   // a TV parou de responder
      try { conn.send({ t: 'ping' }); } catch (e) { retry(0); }
    }, 4000);
    function wake() { if (!document.hidden && !dead && (!isOpen() || Date.now() - last > 6000)) retry(0); }
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    return {
      /* true = enviado; false = sem conexão agora (a ação foi guardada e vai ao reconectar) */
      send: function (msg) {
        if (isOpen()) { try { conn.send(msg); return true; } catch (e) {} }
        pending = { msg: msg, at: Date.now() };
        retry(0);
        return false;
      },
      online: isOpen,
      close: function () { dead = true; clearTimeout(timer); try { peer.destroy(); } catch (e) {} }
    };
  }

  root.COMMON = {
    qs: qs, esc: esc, money: money, dieHTML: dieHTML, animateDice: animateDice, beep: beep,
    wakeLock: wakeLock, keepAwake: keepAwake, claimTab: claimTab, host: host, client: client, autoUpdate: autoUpdate, dropParam: dropParam, VERSION: VERSION
  };
})(this);
