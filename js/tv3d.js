/* Tela da TV em 3D (Three.js): tabuleiro, personagens andando, dados e construções.
   A TV continua sendo a autoridade do jogo; tudo é comandado pelos celulares. */
(function () {
  'use strict';
  var B = BOARD, G = GAME, C = COMMON, T = THREE, esc = C.esc, money = C.money;
  var KEY = 'magnatas-tv-state';
  var stage = document.getElementById('stage'), canvas = document.getElementById('gl');

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    location.replace('plano.html' + location.search);   // sem WebGL: usa o tabuleiro plano
    return;
  }

  function newRoom() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ', r = '';
    for (var i = 0; i < 4; i++) r += abc[Math.floor(Math.random() * abc.length)];
    return r;
  }
  var state = null;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (C.qs('nova') || !state || !state.room || !state.players) state = G.newState(C.qs('sala').toUpperCase() || newRoom());
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  save();
  C.dropParam('nova');

  var el = {};
  ['roominfo', 'lobby', 'game', 'players', 'turn', 'status', 'card', 'log'].forEach(function (id) { el[id] = document.getElementById(id); });
  function color(p) { return B.COLORS[p.ci]; }

  /* ================= geometria do tabuleiro ================= */
  function rc(i) {
    if (i <= 11) return [1, i + 1];
    if (i <= 17) return [i - 10, 12];
    if (i <= 29) return [8, 30 - i];
    return [37 - i, 1];
  }
  function sideOf(i) {
    var p = rc(i);
    if ((p[0] === 1 || p[0] === 8) && (p[1] === 1 || p[1] === 12)) return null;
    return p[0] === 1 ? 'top' : p[0] === 8 ? 'bottom' : p[1] === 1 ? 'left' : 'right';
  }
  var INWARD = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] };
  function cellCenter(i) { var p = rc(i); return new T.Vector3(p[1] - 6.5, 0, p[0] - 4.5); }
  function standPos(i) {
    var v = cellCenter(i), s = sideOf(i);
    if (s && B.SPACES[i].t === 'prop') { v.x -= INWARD[s][0] * 0.13; v.z -= INWARD[s][1] * 0.13; }
    return v;
  }

  /* ================= cena ================= */
  var scene = new T.Scene();
  scene.background = new T.Color(0x0b1d2a);
  var camera = new T.PerspectiveCamera(30, 16 / 9, 0.5, 80);
  var camLook = new T.Vector3(0, 0, 0.5), camLookGoal = new T.Vector3(0, 0, 0.5);
  var CAM_D = 16.3, CAM_E = 64 * Math.PI / 180, camYaw = 0, camZoom = 1, camZoomGoal = 1;
  scene.add(new T.HemisphereLight(0xffffff, 0x5a6a7a, 2.4));
  var sun = new T.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(5, 10, 6);
  scene.add(sun);

  function lam(c, opt) { var m = new T.MeshLambertMaterial({ color: c }); if (opt) for (var k in opt) m[k] = opt[k]; return m; }

  // mesa e base do tabuleiro
  var table = new T.Mesh(new T.CircleGeometry(22, 48), lam(0x12303a));
  table.rotation.x = -Math.PI / 2; table.position.y = -0.36;
  scene.add(table);
  var base = new T.Mesh(new T.BoxGeometry(12.5, 0.34, 8.5), lam(0x5b3a22));
  base.position.y = -0.172;
  scene.add(base);

  /* ---------- textura do tabuleiro (canvas 2D) ---------- */
  var S = 170, tex = document.createElement('canvas');
  tex.width = 12 * S; tex.height = 8 * S;
  var cx = tex.getContext('2d'), FONT = '"Trebuchet MS","Segoe UI",Roboto,Arial,sans-serif';
  var boardTex = new T.CanvasTexture(tex);
  boardTex.colorSpace = T.SRGBColorSpace;
  boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  var top = new T.Mesh(new T.PlaneGeometry(12, 8), new T.MeshBasicMaterial({ map: boardTex }));
  top.rotation.x = -Math.PI / 2;
  scene.add(top);

  function rr(x, y, w, h, r) {
    cx.beginPath();
    cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r);
    cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
  }
  function wrap(text, maxW) {
    var words = text.split(' '), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (line && cx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
    });
    lines.push(line);
    return lines;
  }
  var BG = { start: '#ffd98a', jail: '#ffd98a', free: '#ffd98a', gotojail: '#ffd98a', card: '#d9e8f5', tax: '#ecdcdc', trans: '#e3ead8', prop: '#f6f1e3' };
  function drawBoard() {
    var g = cx.createRadialGradient(6 * S, 3 * S, 50, 6 * S, 4 * S, 6 * S);
    g.addColorStop(0, '#22756c'); g.addColorStop(1, '#0f3b44');
    cx.fillStyle = '#0b1d2a'; cx.fillRect(0, 0, tex.width, tex.height);
    cx.fillStyle = g; rr(S + 4, S + 4, 10 * S - 8, 6 * S - 8, 18); cx.fill();
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    B.SPACES.forEach(function (sp, i) {
      var p = rc(i), x = (p[1] - 1) * S, y = (p[0] - 1) * S, side = sideOf(i), pr = state.props[i], BH = 46;
      cx.fillStyle = BG[sp.t]; rr(x + 3, y + 3, S - 6, S - 6, 12); cx.fill();
      var ax = x + 3, ay = y + 3, aw = S - 6, ah = S - 6;
      if (sp.t === 'prop') {
        cx.save(); rr(x + 3, y + 3, S - 6, S - 6, 12); cx.clip();
        cx.fillStyle = B.GROUPS[sp.group].color;
        if (side === 'top') { cx.fillRect(x, y + S - BH, S, BH); ah -= BH; }
        else if (side === 'bottom') { cx.fillRect(x, y, S, BH); ay += BH; ah -= BH; }
        else if (side === 'left') { cx.fillRect(x + S - BH, y, BH, S); aw -= BH; }
        else { cx.fillRect(x, y, BH, S); ax += BH; aw -= BH; }
        cx.restore();
      }
      var mx = ax + aw / 2, ty = ay + 10;
      cx.fillStyle = '#1c2730';
      if (sp.icon) { cx.font = (side ? 46 : 58) + 'px ' + FONT; cx.fillText(sp.icon, mx, ty + (side ? 26 : 34)); ty += side ? 54 : 70; }
      cx.font = 'bold ' + (aw < 140 ? 21 : 24) + 'px ' + FONT;
      wrap(sp.name, aw - 10).forEach(function (l) { ty += 14; cx.fillText(l, mx, ty); ty += 13; });
      var sub = sp.price ? money(sp.price) : sp.amount ? '−' + money(sp.amount) : sp.t === 'start' ? '+' + money(B.SALARY) : '';
      if (sub) { cx.font = '20px ' + FONT; cx.globalAlpha = 0.7; cx.fillText(sub, mx, ty + 12); cx.globalAlpha = 1; }
      if (pr) {
        var o = G.P(state, pr.owner), oc = color(o);
        if (pr.mortgaged) { cx.fillStyle = 'rgba(40,40,40,0.55)'; rr(x + 3, y + 3, S - 6, S - 6, 12); cx.fill(); }
        cx.strokeStyle = oc; cx.lineWidth = 9; rr(x + 7, y + 7, S - 14, S - 14, 9); cx.stroke();
        cx.font = 'bold 17px ' + FONT;
        var label = pr.mortgaged ? 'HIPOTECA' : o.name, lw = cx.measureText(label).width + 16;
        cx.fillStyle = oc; rr(mx - lw / 2, ay + ah - 30, lw, 22, 8); cx.fill();
        cx.fillStyle = '#10202c'; cx.fillText(label, mx, ay + ah - 18);
      }
    });
    boardTex.needsUpdate = true;
  }

  /* ================= animações (tweens) ================= */
  var tweens = [], clock = 0;
  function tween(dur, fn, done, delay) { tweens.push({ t: -(delay || 0), d: dur, fn: fn, done: done }); }
  function easeOut(k) { return 1 - (1 - k) * (1 - k); }
  function backOut(k) { var c = 2.2; k -= 1; return 1 + k * k * ((c + 1) * k + c); }

  /* ================= personagens ================= */
  var SKIN = [0xf2c9a0, 0xc68642, 0xffdbac, 0x8d5524, 0xe0ac69, 0xf1c27d];
  function mesh(geo, mat, x, y, z) { var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; }
  function makeChar(ci) {
    var g = new T.Group(), col = new T.Color(B.COLORS[ci]), dark = col.clone().multiplyScalar(0.6);
    var body = lam(col), limb = lam(dark), skin = lam(SKIN[ci]), black = lam(0x1b1b1b);
    var legs = [], arms = [];
    [-1, 1].forEach(function (s) {
      var hip = new T.Group(); hip.position.set(s * 0.05, 0.15, 0);
      hip.add(mesh(new T.CylinderGeometry(0.036, 0.036, 0.15, 8), limb, 0, -0.075, 0));
      hip.add(mesh(new T.BoxGeometry(0.075, 0.04, 0.11), black, 0, -0.14, 0.02));
      g.add(hip); legs.push(hip);
      var sh = new T.Group(); sh.position.set(s * 0.125, 0.345, 0);
      sh.add(mesh(new T.CylinderGeometry(0.028, 0.028, 0.15, 8), body, 0, -0.075, 0));
      sh.add(mesh(new T.SphereGeometry(0.034, 8, 6), skin, 0, -0.16, 0));
      sh.rotation.z = s * 0.18;
      g.add(sh); arms.push(sh);
    });
    g.add(mesh(new T.CylinderGeometry(0.085, 0.12, 0.23, 12), body, 0, 0.26, 0));
    var head = new T.Group(); head.position.y = 0.47;
    head.add(mesh(new T.SphereGeometry(0.105, 16, 12), skin));
    head.add(mesh(new T.SphereGeometry(0.017, 8, 6), black, -0.038, 0.012, 0.094));
    head.add(mesh(new T.SphereGeometry(0.017, 8, 6), black, 0.038, 0.012, 0.094));
    head.add(mesh(new T.BoxGeometry(0.045, 0.012, 0.01), lam(0xb03030), 0, -0.04, 0.097));
    var acc, gold = lam(0xffc933);
    switch (ci) {
      case 0: // cartola
        head.add(mesh(new T.CylinderGeometry(0.15, 0.15, 0.015, 16), black, 0, 0.085, 0));
        head.add(mesh(new T.CylinderGeometry(0.085, 0.09, 0.14, 16), black, 0, 0.16, 0));
        head.add(mesh(new T.CylinderGeometry(0.092, 0.092, 0.03, 16), body, 0, 0.11, 0));
        break;
      case 1: // boné
        head.add(mesh(new T.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.02, 0));
        head.add(mesh(new T.BoxGeometry(0.13, 0.014, 0.1), body, 0, 0.045, 0.12));
        break;
      case 2: // coroa
        head.add(mesh(new T.CylinderGeometry(0.085, 0.075, 0.06, 12, 1, true), lam(0xffc933, { side: T.DoubleSide }), 0, 0.11, 0));
        for (var k = 0; k < 6; k++) head.add(mesh(new T.ConeGeometry(0.022, 0.05, 6), gold, Math.cos(k * 1.047) * 0.08, 0.16, Math.sin(k * 1.047) * 0.08));
        break;
      case 3: // chapéu de palha
        head.add(mesh(new T.CylinderGeometry(0.18, 0.19, 0.012, 18), lam(0xe8c66a), 0, 0.075, 0));
        head.add(mesh(new T.SphereGeometry(0.095, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xe8c66a), 0, 0.05, 0));
        head.add(mesh(new T.CylinderGeometry(0.098, 0.098, 0.025, 14), body, 0, 0.085, 0));
        break;
      case 4: // cabelo com laço
        head.add(mesh(new T.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), lam(0x5a2d82), 0, 0.005, -0.012));
        acc = new T.Group(); acc.position.set(0, 0.12, 0);
        [-1, 1].forEach(function (s) { var c = mesh(new T.ConeGeometry(0.045, 0.08, 8), body, s * 0.045, 0, 0); c.rotation.z = s * Math.PI / 2; acc.add(c); });
        acc.add(mesh(new T.SphereGeometry(0.022, 8, 6), gold));
        head.add(acc);
        break;
      default: // gatinho
        head.add(mesh(new T.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), body, 0, 0.004, -0.008));
        [-1, 1].forEach(function (s) { head.add(mesh(new T.ConeGeometry(0.04, 0.08, 4), body, s * 0.065, 0.12, 0)); });
        head.add(mesh(new T.SphereGeometry(0.014, 6, 6), lam(0xff7aa8), 0, -0.012, 0.103));
    }
    g.add(head);
    var sh = mesh(new T.CircleGeometry(0.13, 16), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    g.add(sh);
    // grades da cadeia (aparecem quando o jogador está preso)
    var cage = new T.Group(), bar = lam(0x555f69);
    for (var a = 0; a < 8; a++) cage.add(mesh(new T.CylinderGeometry(0.012, 0.012, 0.66, 6), bar, Math.cos(a * 0.785) * 0.19, 0.33, Math.sin(a * 0.785) * 0.19));
    cage.add(mesh(new T.CylinderGeometry(0.2, 0.2, 0.02, 16), bar, 0, 0.66, 0));
    cage.visible = false;
    g.add(cage);
    g.scale.setScalar(1.25);
    scene.add(g);
    return { g: g, legs: legs, arms: arms, head: head, shadow: sh, cage: cage, cell: 0, busy: false, phase: Math.random() * 6 };
  }
  var chars = {};

  function slotOffset(k, n) {
    var cols = Math.min(n, 3), row = Math.floor(k / 3), col = k % 3;
    return [(col - (cols - 1) / 2) * 0.34, n > 3 ? (row - 0.5) * 0.36 : 0];
  }
  /* Posiciona quem está parado (vários na mesma casa ficam lado a lado). */
  function layoutChars(instant) {
    var lobby = state.phase === 'lobby', byCell = {};
    Object.keys(chars).forEach(function (id) {
      var p = G.P(state, id);
      if (!p || p.bankrupt) { scene.remove(chars[id].g); delete chars[id]; }
    });
    state.players.forEach(function (p, idx) {
      if (p.bankrupt) return;
      var ch = chars[p.id], fresh = !ch;
      if (fresh) { ch = chars[p.id] = makeChar(p.ci); ch.cell = p.pos; }
      ch.fresh = fresh;
      ch.cage.visible = !lobby && !!p.inJail && ch.cell === p.pos && !ch.busy;
      if (lobby) ch.goal = new T.Vector3((idx - (state.players.length - 1) / 2) * 0.95, 0, 2.35);
      else (byCell[ch.cell] = byCell[ch.cell] || []).push(ch);
    });
    Object.keys(byCell).forEach(function (c) {
      byCell[c].forEach(function (ch, k) {
        var o = slotOffset(k, byCell[c].length), v = standPos(Number(c));
        v.x += o[0]; v.z += o[1];
        ch.goal = v;
      });
    });
    Object.keys(chars).forEach(function (id) {
      var ch = chars[id];
      if (ch.busy || !ch.goal) return;
      if (ch.fresh) { ch.g.position.copy(ch.goal); popIn(ch.g, 1.25); return; }
      if (instant) { ch.g.position.copy(ch.goal); return; }
      if (ch.g.position.distanceTo(ch.goal) > 0.01) {
        var a = ch.g.position.clone(), b = ch.goal.clone();
        tween(0.3, function (k) { if (!ch.busy) ch.g.position.lerpVectors(a, b, easeOut(k)); });
      }
    });
  }
  function popIn(obj, s) {
    obj.scale.setScalar(0.01);
    tween(0.5, function (k) { obj.scale.setScalar(s * Math.max(0.01, backOut(k))); });
  }

  /* Anda casa por casa (ou dá um salto grande quando é "teletransporte": cadeia, voltar casas…). */
  function walkPath(ch, path, done) {
    if (!path.length) { ch.busy = false; ch.g.rotation.y = 0; ch.legs[0].rotation.x = ch.legs[1].rotation.x = 0; ch.arms[0].rotation.x = ch.arms[1].rotation.x = 0; done(); return; }
    ch.busy = true; ch.cage.visible = false;
    var from = ch.g.position.clone(), to = standPos(path[0]);
    from.y = 0;
    var far = from.distanceTo(to) > 1.7, dur = far ? 0.75 : 0.25, h = far ? 1.7 : 0.2;
    ch.g.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    tween(dur, function (k) {
      ch.g.position.lerpVectors(from, to, k);
      ch.g.position.y = Math.sin(Math.PI * k) * h;
      var sw = Math.sin(k * Math.PI * 2) * 0.9;
      ch.legs[0].rotation.x = sw; ch.legs[1].rotation.x = -sw;
      ch.arms[0].rotation.x = -sw; ch.arms[1].rotation.x = sw;
      if (far) ch.g.rotation.y += 0.25;
    }, function () {
      ch.cell = path[0];
      if (!far) C.beep([520], 0.025);
      walkPath(ch, path.slice(1), done);
    });
  }

  /* ================= construções ================= */
  var winTex = (function () {
    var c = document.createElement('canvas'); c.width = 128; c.height = 64;
    var x = c.getContext('2d');
    x.fillStyle = '#e9eef4'; x.fillRect(0, 0, 128, 64);
    for (var r = 0; r < 3; r++) for (var q = 0; q < 6; q++) { x.fillStyle = (r + q) % 3 ? '#4a90d9' : '#ffe9a3'; x.fillRect(8 + q * 20, 7 + r * 19, 12, 12); }
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  })();
  function makeHouse(oc) {
    var g = new T.Group();
    g.add(mesh(new T.BoxGeometry(0.2, 0.15, 0.2), lam(0xfff4dc), 0, 0.075, 0));
    var roof = mesh(new T.ConeGeometry(0.17, 0.13, 4), lam(0xc4553a), 0, 0.215, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(mesh(new T.BoxGeometry(0.04, 0.1, 0.04), lam(0x8a3a28), 0.055, 0.23, -0.03));
    g.add(mesh(new T.BoxGeometry(0.05, 0.08, 0.012), lam(oc), 0, 0.04, 0.101));
    g.add(mesh(new T.BoxGeometry(0.045, 0.045, 0.012), lam(0x6bb6e8), 0.062, 0.095, 0.101));
    return g;
  }
  function makeHotel(oc) {
    var g = new T.Group(), wall = new T.MeshLambertMaterial({ map: winTex });
    g.add(mesh(new T.BoxGeometry(0.66, 0.42, 0.2), wall, 0, 0.21, 0));
    g.add(mesh(new T.BoxGeometry(0.7, 0.04, 0.24), lam(oc), 0, 0.44, 0));
    g.add(mesh(new T.BoxGeometry(0.2, 0.09, 0.03), lam(oc), 0, 0.5, 0));
    g.add(mesh(new T.BoxGeometry(0.1, 0.1, 0.02), lam(0x7a4a2a), 0, 0.05, 0.105));
    return g;
  }
  var builds = {};   // casa do tabuleiro -> { level, owner, group }
  function dust(pos) {
    for (var k = 0; k < 7; k++) (function (k) {
      var m = new T.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.8, depthWrite: false });
      var s = mesh(new T.SphereGeometry(0.06, 8, 6), m, pos.x, 0.05, pos.z), a = k * 0.9 + Math.random();
      scene.add(s);
      tween(0.7, function (t) {
        s.position.set(pos.x + Math.cos(a) * t * 0.35, 0.05 + t * 0.25, pos.z + Math.sin(a) * t * 0.35);
        s.scale.setScalar(1 + t * 1.6); m.opacity = 0.8 * (1 - t);
      }, function () { scene.remove(s); s.geometry.dispose(); m.dispose(); });
    })(k);
  }
  function syncBuildings(instant) {
    for (var i = 0; i < B.N; i++) {
      if (B.SPACES[i].t !== 'prop') continue;
      var pr = state.props[i], lvl = pr ? pr.houses : 0, owner = pr ? pr.owner : null, cur = builds[i];
      if (cur && cur.level === lvl && cur.owner === owner) continue;
      var old = cur ? cur.level : 0;
      if (cur) scene.remove(cur.group);
      var grp = new T.Group(), side = sideOf(i), c = cellCenter(i), inw = INWARD[side];
      grp.position.set(c.x + inw[0] * 0.36, 0, c.z + inw[1] * 0.36);
      if (side === 'left' || side === 'right') grp.rotation.y = Math.PI / 2;
      builds[i] = { level: lvl, owner: owner, group: grp };
      scene.add(grp);
      if (!lvl) continue;
      var oc = B.COLORS[G.P(state, owner).ci], items = [];
      if (lvl === 5) items.push(makeHotel(oc));
      else for (var k = 0; k < lvl; k++) { var h = makeHouse(oc); h.position.x = (k - (lvl - 1) / 2) * 0.235; items.push(h); }
      items.forEach(function (it, k) {
        grp.add(it);
        var isNew = !instant && lvl > old && (lvl === 5 || k >= old);
        if (!isNew) return;
        // construção: sobe do chão com poeira
        it.scale.set(1, 0.01, 1);
        var wp = new T.Vector3(); grp.updateMatrixWorld(); it.getWorldPosition(wp);
        dust(wp);
        C.beep([200, 260, 330, 440], 0.08);
        tween(0.9, function (t) { it.scale.set(1, Math.max(0.01, backOut(t)), 1); it.rotation.y = (1 - easeOut(t)) * 1.2; });
      });
    }
  }

  /* ================= dados ================= */
  function pipTex(n) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), P = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n];
    x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#ccc'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 122);
    x.fillStyle = '#c62828';
    P.forEach(function (k) { x.beginPath(); x.arc(30 + (k % 3) * 34, 30 + Math.floor(k / 3) * 34, 12, 0, 7); x.fill(); });
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  var FACE = [3, 4, 1, 6, 2, 5];   // valores nas faces +x, -x, +y, -y, +z, -z
  var dieMats = FACE.map(function (n) { return new T.MeshLambertMaterial({ map: pipTex(n) }); });
  var UP = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };
  var dice = [0, 1].map(function (k) {
    var d = new T.Mesh(new T.BoxGeometry(0.62, 0.62, 0.62), dieMats);
    d.position.set(k ? 0.55 : -0.55, 0.31, 1.75);
    scene.add(d);
    return d;
  });
  function faceQuat(v) {
    var q = new T.Quaternion().setFromEuler(new T.Euler(UP[v][0], 0, UP[v][1]));
    return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.9).multiply(q);
  }
  function rollDice(vals, done) {
    dice.forEach(function (d, k) {
      var qf = faceQuat(vals[k]), axis = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      var x0 = (k ? 1 : -1) * 3.2, x1 = k ? 0.55 : -0.55, spin = new T.Quaternion();
      tween(1.0, function (t) {
        spin.setFromAxisAngle(axis, (1 - t) * (1 - t) * 16);
        d.quaternion.copy(qf).multiply(spin);
        d.position.x = x0 + (x1 - x0) * easeOut(t);
        d.position.y = 0.31 + Math.abs(Math.sin(t * Math.PI * 2.5)) * 1.5 * (1 - t) * (1 - t);
      }, k ? done : null);
    });
  }
  dice.forEach(function (d, k) { d.quaternion.copy(faceQuat(state.dice[k] || 1)); });

  /* ================= moedas voando (pagamentos) ================= */
  var coinGeo = new T.CylinderGeometry(0.075, 0.075, 0.022, 14), coinMat = lam(0xffc933);
  function coins(a, b) {
    for (var k = 0; k < 6; k++) (function (k) {
      var c = mesh(coinGeo, coinMat, a.x, 0.5, a.z);
      c.visible = false; scene.add(c);
      tween(0.7, function (t) {
        c.visible = true;
        c.position.set(a.x + (b.x - a.x) * t, 0.5 + Math.sin(Math.PI * t) * 1.6, a.z + (b.z - a.z) * t);
        c.rotation.set(t * 9, 0, t * 7);
      }, function () { scene.remove(c); }, k * 0.08);
    })(k);
  }
  function payFx(pay) {
    var from = chars[pay.from];
    if (!from) return;
    var a = from.g.position, bank = new T.Vector3(0, 0, 0.3);
    if (pay.to === 'all') Object.keys(chars).forEach(function (id) { if (id !== pay.from) coins(a, chars[id].g.position); });
    else coins(a, pay.to && chars[pay.to] ? chars[pay.to].g.position : bank);
    C.beep([880, 1320], 0.09);
  }

  /* ================= HUD (HTML sobre o 3D) ================= */
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
  var netOn = false, phones = 0;

  function statusText() {
    var p = G.cur(state), n = '<b style="color:' + color(p) + '">' + esc(p.name) + '</b>';
    switch (state.step) {
      case 'roll': return n + (p.inJail ? ', você está na cadeia: tente a dupla ou pague a fiança' : ', jogue os dados no celular 🎲');
      case 'buy': return n + ' pode comprar <b>' + esc(B.SPACES[p.pos].name) + '</b> por ' + money(B.SPACES[p.pos].price);
      case 'pay': return n + ' deve pagar <b>' + money(G.pendingTotal(state)) + '</b> — ' + esc(state.pending.reason) + ' 💳';
      default: return n + ': construa, negocie ou encerre a vez';
    }
  }
  function renderHud() {
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
        '<p class="hint">' + (netOn ? (state.players.length >= 2 ? 'Toque em <b>Começar</b> no celular!' : 'O celular é a maquininha de cartão e o dado.') : 'Conectando à internet…') + '</p></div>';
      return;
    }
    var cur = G.cur(state);
    el.players.innerHTML = state.players.map(function (p) {
      return '<div class="pl' + (p.bankrupt ? ' out' : '') + (state.phase === 'playing' && cur.id === p.id ? ' cur' : '') + '" style="border-color:' + color(p) + '">' +
        '<span class="tk">' + B.TOKENS[p.ci] + '</span><span class="nm">' + esc(p.name) + (p.inJail ? ' 🚔' : '') + '</span>' +
        '<span class="mn">' + (p.bankrupt ? 'faliu' : money(p.money)) + '</span>' +
        '<span class="pp">🏘️ ' + G.owned(state, p.id).length + '</span></div>';
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
    el.log.innerHTML = state.log.slice(-7).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
  }

  /* ================= sincronização com o estado do jogo ================= */
  var lastRoll = state.rollSeq, lastCard = state.card ? state.card.seq : 0, lastPay = state.pay ? state.pay.seq : 0;
  var animating = false, boardSig = '';
  function syncBoardTex() {
    var sig = JSON.stringify(state.props) + '|' + state.players.map(function (p) { return p.name + p.ci; }).join(',');
    if (sig !== boardSig) { boardSig = sig; drawBoard(); }
  }
  function syncCells() { Object.keys(chars).forEach(function (id) { var p = G.P(state, id); if (p && !chars[id].busy) chars[id].cell = p.pos; }); }
  function cardFx() {
    if (state.card && state.card.seq !== lastCard) {
      lastCard = state.card.seq;
      el.card.classList.remove('pop'); void el.card.offsetWidth; el.card.classList.add('pop');
    }
  }
  function onState() {
    save();
    net.broadcast({ t: 'state', state: state });
    syncBoardTex();
    syncBuildings(false);
    if (state.pay && state.pay.seq !== lastPay) { lastPay = state.pay.seq; payFx(state.pay); }
    dice.forEach(function (d) { d.visible = state.phase !== 'lobby'; });
    if (state.rollSeq !== lastRoll && state.move && !animating && chars[state.move.pid]) {
      lastRoll = state.rollSeq;
      var mv = state.move, ch = chars[mv.pid];
      animating = true;
      renderHud();
      C.beep([300, 380, 300, 420], 0.07);
      rollDice(state.dice, function () {
        camZoomGoal = 1;
        walkPath(ch, mv.path.slice(), function () {
          animating = false; camZoomGoal = 1;
          syncCells(); layoutChars(false); renderHud(); cardFx();
        });
      });
      return;
    }
    if (!animating) { syncCells(); layoutChars(false); cardFx(); }
    renderHud();
  }

  /* ================= rede ================= */
  var net = C.host(state.room, {
    status: function (s) { netOn = s === 'on'; renderHud(); },
    count: function (n) { phones = n; renderHud(); },
    join: function () {},
    taken: function () {
      if (state.phase === 'lobby' && !state.players.length) { state.room = newRoom(); save(); }
      setTimeout(function () { location.reload(); }, 3000);
    },
    data: function (d, conn) {
      if (!d || typeof d !== 'object') return;
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

  /* ================= tamanho da tela e laço de desenho ================= */
  var resScale = 1, bufW = 0;
  function fit() {
    var vv = window.visualViewport;
    var w = vv ? vv.width : window.innerWidth, h = vv ? vv.height : window.innerHeight;
    var ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0;
    if (!(w > 0 && h > 0)) return;
    var s = Math.min(w / 1920, h / 1080) * 0.985;
    stage.style.transform = 'translate(' + (ox + (w - 1920 * s) / 2) + 'px,' + (oy + (h - 1080 * s) / 2) + 'px) scale(' + s + ')';
    var want = Math.round(Math.max(960, Math.min(1920, 1920 * s * (window.devicePixelRatio || 1))) * resScale / 16) * 16;
    if (want !== bufW) { bufW = want; renderer.setSize(want, want * 9 / 16, false); }
  }
  fit();
  window.addEventListener('resize', fit);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fit);
    window.visualViewport.addEventListener('scroll', fit);
  }
  setInterval(fit, 1000);
  function goFull() {
    var d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
    try { if (f && !(document.fullscreenElement || document.webkitFullscreenElement)) { var r = f.call(d); if (r && r.catch) r.catch(function () {}); } } catch (e) {}
  }
  document.addEventListener('click', goFull);
  document.addEventListener('keydown', goFull);

  var last = 0, slow = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now; clock += dt;
    // se a TV não estiver dando conta, reduz a resolução do 3D
    if (++frames > 60 && resScale > 0.8) { slow = slow * 0.95 + (dt > 0.045 ? 1 : 0) * 0.05; if (slow > 0.6) { resScale *= 0.75; slow = 0; frames = 0; fit(); } }

    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      var k = Math.min(1, tw.t / tw.d);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }

    var lobby = state.phase === 'lobby', curId = state.phase === 'playing' ? G.cur(state).id : null, focus = null;
    Object.keys(chars).forEach(function (id) {
      var ch = chars[id], t = clock * 1 + ch.phase;
      if (ch.busy) { focus = ch; }
      else {
        var act = id === curId || lobby || id === state.winner;
        ch.g.position.y = act ? Math.abs(Math.sin(t * (id === state.winner ? 6 : 3.2))) * (id === state.winner ? 0.35 : 0.07) : 0;
        ch.head.rotation.y = Math.sin(t * 0.9) * 0.35;
        ch.arms[1].rotation.z = lobby || id === state.winner ? 2.4 + Math.sin(t * 7) * 0.4 : 0.18;   // acena
        if (id === state.winner) ch.g.rotation.y += dt * 3;
        if (id === curId && !focus) focus = ch;
      }
      ch.shadow.position.y = 0.004 - ch.g.position.y / 1.25;
      ch.shadow.scale.setScalar(Math.max(0.5, 1 - ch.g.position.y * 0.4));
    });

    // câmera: gira devagar na sala de espera; no jogo acompanha de leve quem está jogando
    camYaw += ((lobby ? Math.sin(clock * 0.25) * 0.1 : 0) - camYaw) * Math.min(1, dt * 2);
    camLookGoal.set(0, 0, 0.5);   // câmera fixa no jogo, para o painel ficar sempre alinhado ao centro do tabuleiro
    camLook.lerp(camLookGoal, Math.min(1, dt * 2.5));
    camZoom += (camZoomGoal - camZoom) * Math.min(1, dt * 2.5);
    var d = CAM_D / camZoom;
    camera.position.set(camLook.x + Math.sin(camYaw) * Math.cos(CAM_E) * d, Math.sin(CAM_E) * d, camLook.z + Math.cos(camYaw) * Math.cos(CAM_E) * d);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }

  syncBoardTex();
  syncBuildings(true);
  layoutChars(true);
  dice.forEach(function (d) { d.visible = state.phase !== 'lobby'; });
  renderHud();
  requestAnimationFrame(frame);
  C.wakeLock();
  C.autoUpdate(function () { return !animating; });
  setInterval(function () { net.broadcast({ t: 'state', state: state }); }, 5000);
  window.__magnatas = { state: function () { return state; }, apply: function (a) { if (G.apply(state, a)) onState(); } };
})();
