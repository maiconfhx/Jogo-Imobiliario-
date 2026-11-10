/* Utilidades compartilhadas entre a TV e o celular: rede (PeerJS/WebRTC), dados, som. */
(function (root) {
  'use strict';
  var PREFIX = 'magnatas-jogo-v1-';

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

  /* TV: abre a sala e recebe os celulares. */
  function host(room, cb) {
    var conns = [], peer;
    function open() {
      peer = new Peer(PREFIX + room, peerOpts());
      peer.on('open', function () { cb.status('on'); });
      peer.on('connection', function (c) {
        c.on('open', function () { conns.push(c); cb.join(c); cb.count(conns.length); });
        c.on('data', function (d) { cb.data(d, c); });
        function drop() {
          var k = conns.indexOf(c);
          if (k >= 0) { conns.splice(k, 1); cb.count(conns.length); }
        }
        c.on('close', drop); c.on('error', drop);
      });
      peer.on('disconnected', function () {
        cb.status('off');
        setTimeout(function () { if (!peer.destroyed) peer.reconnect(); }, 2000);
      });
      peer.on('error', function (e) {
        if (e.type === 'unavailable-id') { cb.taken(); return; }
        if (e.type === 'peer-unavailable') return;
        cb.status('off');
        if (peer.destroyed || !peer.open) setTimeout(function () { try { peer.destroy(); } catch (x) {} open(); }, 3000);
      });
    }
    open();
    return {
      broadcast: function (msg) {
        conns.forEach(function (c) { if (c.open) { try { c.send(msg); } catch (e) {} } });
      }
    };
  }

  /* Celular: conecta na sala da TV e reconecta sozinho se cair. */
  function client(room, cb) {
    var peer = null, conn = null, timer = null, dead = false;
    function retry() {
      if (dead) return;
      cb.status('off');
      clearTimeout(timer);
      timer = setTimeout(connect, 2000);
    }
    function connect() {
      try { if (peer) peer.destroy(); } catch (e) {}
      conn = null;
      var mine = peer = new Peer(peerOpts());
      mine.on('open', function () {
        var c = mine.connect(PREFIX + room, { reliable: true });
        var guard = setTimeout(function () { if (!c.open && peer === mine) retry(); }, 8000);
        c.on('open', function () { clearTimeout(guard); conn = c; cb.status('on'); cb.open(); });
        c.on('data', function (d) { cb.data(d); });
        c.on('close', function () { if (peer === mine) retry(); });
        c.on('error', function () { if (peer === mine) retry(); });
      });
      mine.on('error', function () { if (peer === mine) retry(); });
      mine.on('disconnected', function () { if (peer === mine && !(conn && conn.open)) retry(); });
    }
    connect();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !(conn && conn.open)) connect();
    });
    return {
      send: function (msg) { if (conn && conn.open) { conn.send(msg); return true; } return false; },
      close: function () { dead = true; try { peer.destroy(); } catch (e) {} }
    };
  }

  root.COMMON = {
    qs: qs, esc: esc, money: money, dieHTML: dieHTML, animateDice: animateDice, beep: beep,
    wakeLock: wakeLock, host: host, client: client
  };
})(this);
