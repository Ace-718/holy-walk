/* ═══════════════════════════════════════════════════════════════════
   ENGINE — canvas, pilgrim, gates, and the walk.

   The pilgrim holds a fixed place on screen; the world answers to
   `progress`. Tapping Forward raises the target, the pilgrim walks to it,
   and if a gate stands there the question card opens on arrival.
   ═══════════════════════════════════════════════════════════════════ */

const Engine = (function () {
  const { clamp, lerp, easeOut, easeInOut } = Scenes;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const state = {
    stage: null,
    progress: 0,
    target: 0,
    walking: false,
    gatesPassed: [],
    miracle: 0,
    miracleActive: false,
    time: 0,
    paused: false,
    reduced: false,
    dust: [],
    sparks: [],
    stepAcc: 0,
    w: 0, h: 0, dpr: 1,
  };

  let raf = 0;
  let last = 0;
  let hooks = {};

  /* ── Sizing ── */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = Math.max(1, Math.round(rect.width));
    state.h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => clamp(Math.round(amt > 0 ? c + (255 - c) * amt : c + c * amt), 0, 255);
    return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  /* ═══════════════════════════════════════════════════════════════
     PILGRIM — a robed figure in profile, facing the destination
     ═══════════════════════════════════════════════════════════════ */
  function drawPilgrim(cx, baseY, scale, fig, phase, walking, miracle) {
    const s = scale;
    const swing = walking ? Math.sin(phase) : Math.sin(phase * 0.3) * 0.2;
    const bob = walking ? Math.abs(Math.sin(phase)) * s * 0.026 : Math.sin(phase * 0.5) * s * 0.005;

    ctx.save();
    ctx.translate(cx, baseY - bob);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.beginPath();
    ctx.ellipse(0, 1, s * 0.32, s * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';

    // back leg
    ctx.strokeStyle = '#221a16';
    ctx.lineWidth = s * 0.072;
    ctx.beginPath();
    ctx.moveTo(-s * 0.028, -s * 0.35);
    ctx.lineTo(-s * 0.028 - swing * s * 0.14, -s * 0.018);
    ctx.stroke();

    // cloak, swept back from the shoulders
    ctx.fillStyle = fig.cloak;
    ctx.beginPath();
    ctx.moveTo(-s * 0.095, -s * 0.71);
    ctx.quadraticCurveTo(-s * 0.33 - swing * s * 0.055, -s * 0.45, -s * 0.24 - swing * s * 0.075, -s * 0.025);
    ctx.lineTo(s * 0.045, -s * 0.025);
    ctx.quadraticCurveTo(-s * 0.028, -s * 0.41, -s * 0.095, -s * 0.71);
    ctx.closePath();
    ctx.fill();

    // robe, tapered from the shoulders to the hem
    const rg = ctx.createLinearGradient(s * 0.1, -s * 0.73, s * 0.1, 0);
    rg.addColorStop(0, fig.robe);
    rg.addColorStop(1, shade(fig.robe, -0.34));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(-s * 0.105, -s * 0.71);
    ctx.quadraticCurveTo(s * 0.02, -s * 0.775, s * 0.11, -s * 0.69);
    ctx.quadraticCurveTo(s * 0.155, -s * 0.35, s * 0.125 + swing * s * 0.02, -s * 0.018);
    ctx.lineTo(-s * 0.115 + swing * s * 0.02, -s * 0.018);
    ctx.quadraticCurveTo(-s * 0.155, -s * 0.37, -s * 0.105, -s * 0.71);
    ctx.closePath();
    ctx.fill();

    // fold
    ctx.strokeStyle = 'rgba(0,0,0,.2)';
    ctx.lineWidth = Math.max(0.8, s * 0.014);
    ctx.beginPath();
    ctx.moveTo(s * 0.008, -s * 0.63);
    ctx.quadraticCurveTo(s * 0.028, -s * 0.35, s * 0.004 + swing * s * 0.014, -s * 0.045);
    ctx.stroke();

    // front leg
    ctx.strokeStyle = '#2a221b';
    ctx.lineWidth = s * 0.072;
    ctx.beginPath();
    ctx.moveTo(s * 0.018, -s * 0.35);
    ctx.lineTo(s * 0.018 + swing * s * 0.14, -s * 0.018);
    ctx.stroke();

    // sash
    ctx.strokeStyle = 'rgba(217,169,78,.68)';
    ctx.lineWidth = Math.max(1.1, s * 0.023);
    ctx.beginPath();
    ctx.moveTo(-s * 0.115, -s * 0.495);
    ctx.lineTo(s * 0.115, -s * 0.45);
    ctx.stroke();

    // neck
    ctx.strokeStyle = fig.skin;
    ctx.lineWidth = s * 0.048;
    ctx.beginPath();
    ctx.moveTo(s * 0.012, -s * 0.73);
    ctx.lineTo(s * 0.018, -s * 0.79);
    ctx.stroke();

    // head
    ctx.fillStyle = fig.skin;
    ctx.beginPath();
    ctx.arc(s * 0.022, -s * 0.845, s * 0.083, 0, Math.PI * 2);
    ctx.fill();

    // head cloth
    ctx.fillStyle = shade(fig.cloak, 0.14);
    ctx.beginPath();
    ctx.arc(s * 0.022, -s * 0.858, s * 0.088, Math.PI * 0.92, Math.PI * 2.08);
    ctx.fill();

    // beard
    if (fig.beard) {
      ctx.fillStyle = 'rgba(214,209,199,.76)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.032, -s * 0.835);
      ctx.quadraticCurveTo(s * 0.028, -s * 0.715, s * 0.078, -s * 0.825);
      ctx.quadraticCurveTo(s * 0.018, -s * 0.79, -s * 0.032, -s * 0.835);
      ctx.closePath();
      ctx.fill();
    }

    // staff
    if (fig.staff) {
      ctx.strokeStyle = '#6b5334';
      ctx.lineWidth = Math.max(1.4, s * 0.027);
      ctx.beginPath();
      ctx.moveTo(s * 0.175, -s * 0.87);
      ctx.lineTo(s * 0.205, s * 0.012);
      ctx.stroke();
      if (miracle > 0.05) {
        ctx.fillStyle = 'rgba(244,212,146,' + (0.35 + miracle * 0.65) + ')';
        ctx.beginPath();
        ctx.arc(s * 0.175, -s * 0.87, Math.max(1.3, s * 0.023), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /* ═══════════════════════════════════════════════════════════════
     GATE — a curtain of light across the road ahead.

     It stands between the pilgrim and the destination, on the road, so it
     reads as the thing blocking the way. Once answered it dissolves.
     ═══════════════════════════════════════════════════════════════ */
  function drawGate(gate, passed, w, h, time) {
    if (passed) return;

    const pulse = 0.5 + Math.sin(time * 2.1) * 0.5;
    const x = w * Scenes.GATE_X;
    const top = h * (Scenes.GROUND - 0.13);
    const bot = h * (Scenes.GROUND + 0.012);
    const halfW = w * 0.075;

    // a low, wide curtain of light standing across the road
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(244,212,146,0)');
    g.addColorStop(0.3, 'rgba(244,212,146,' + (0.05 + pulse * 0.035) + ')');
    g.addColorStop(0.85, 'rgba(246,220,164,' + (0.1 + pulse * 0.05) + ')');
    g.addColorStop(1, 'rgba(244,212,146,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - halfW, top);
    ctx.quadraticCurveTo(x - halfW * 0.94, (top + bot) / 2, x - halfW * 0.9, bot);
    ctx.lineTo(x + halfW * 0.9, bot);
    ctx.quadraticCurveTo(x + halfW * 0.94, (top + bot) / 2, x + halfW, top);
    ctx.closePath();
    ctx.fill();

    // fine vertical threads, brightest at the foot
    for (let i = -4; i <= 4; i++) {
      const fx = x + i * halfW * 0.22;
      const falloff = 1 - Math.abs(i) / 5.4;
      const a = (0.1 + pulse * 0.13) * falloff;
      ctx.strokeStyle = 'rgba(246,224,170,' + a + ')';
      ctx.lineWidth = i === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(fx, top + h * 0.03);
      ctx.lineTo(fx, bot);
      ctx.stroke();
    }

    // a seam of light along the ground where the curtain meets the road
    const seam = ctx.createLinearGradient(x - halfW, 0, x + halfW, 0);
    seam.addColorStop(0, 'rgba(246,224,170,0)');
    seam.addColorStop(0.5, 'rgba(248,230,180,' + (0.5 + pulse * 0.35) + ')');
    seam.addColorStop(1, 'rgba(246,224,170,0)');
    ctx.strokeStyle = seam;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - halfW, bot);
    ctx.lineTo(x + halfW, bot);
    ctx.stroke();
  }

  /* ═══════════════════════════════════════════════════════════════
     Particles
     ═══════════════════════════════════════════════════════════════ */
  function spawnDust(x, y, colour) {
    if (state.dust.length > 55) return;
    state.dust.push({
      x: x, y: y,
      vx: -0.22 - Math.random() * 0.6,
      vy: -0.12 - Math.random() * 0.4,
      life: 1,
      r: 1 + Math.random() * 2.2,
      colour: colour,
    });
  }

  function spawnSpark(x, y) {
    if (state.sparks.length > 70) return;
    state.sparks.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -0.65 - Math.random() * 1.6,
      life: 1,
      r: 0.9 + Math.random() * 1.7,
    });
  }

  function stepParticles(dt) {
    for (let i = state.dust.length - 1; i >= 0; i--) {
      const d = state.dust[i];
      d.x += d.vx * dt * 60;
      d.y += d.vy * dt * 60;
      d.vy += 0.006;
      d.life -= dt * 1.5;
      if (d.life <= 0) state.dust.splice(i, 1);
    }
    for (let i = state.sparks.length - 1; i >= 0; i--) {
      const s = state.sparks[i];
      s.x += s.vx * dt * 60;
      s.y += s.vy * dt * 60;
      s.vy += 0.016;
      s.life -= dt * 0.85;
      if (s.life <= 0) state.sparks.splice(i, 1);
    }
  }

  function drawParticles() {
    state.dust.forEach(function (d) {
      ctx.globalAlpha = Math.max(0, d.life) * 0.32;
      ctx.fillStyle = d.colour;
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(0.4, d.r * d.life), 0, Math.PI * 2);
      ctx.fill();
    });
    state.sparks.forEach(function (s) {
      ctx.globalAlpha = Math.max(0, s.life) * 0.9;
      ctx.fillStyle = '#f6d99a';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    });
    ctx.globalAlpha = 1;
  }

  /* ═══════════════════════════════════════════════════════════════
     The frame
     ═══════════════════════════════════════════════════════════════ */
  function render(dt) {
    const w = state.w;
    const h = state.h;
    const stage = state.stage;
    if (!stage || !w || !h) return;

    state.time += dt;

    if (state.walking) {
      const before = state.progress;
      state.progress = Math.min(state.target, state.progress + dt * 0.42);

      if (state.progress > before) {
        // count real footsteps rather than frames, so the tally reads honestly
        state.stepAcc += (state.progress - before) * 42;
        while (state.stepAcc >= 1) {
          state.stepAcc -= 1;
          if (hooks.onStep) hooks.onStep();
        }
        const groundY = h * Scenes.GROUND;
        if (Math.random() < (state.progress - before) * 22) {
          spawnDust(w * Scenes.PILGRIM_X - 5 + Math.random() * 9, groundY - 1, stage.palette.land);
        }
      }

      if (state.progress >= state.target - 0.0005) {
        state.walking = false;
        if (hooks.onArrive) hooks.onArrive(state.progress);
      }
    }

    if (state.miracleActive) {
      state.miracle = Math.min(1, state.miracle + dt * 0.44);
      const groundY = h * Scenes.GROUND;
      for (let i = 0; i < 2; i++) {
        spawnSpark(w * (0.45 + Math.random() * 0.4), groundY - h * 0.12 * state.miracle);
      }
      if (state.miracle >= 1) {
        state.miracleActive = false;
        if (hooks.onMiracleDone) hooks.onMiracleDone();
      }
    }

    stepParticles(dt);

    ctx.clearRect(0, 0, w, h);
    Scenes.draw(ctx, w, h, stage, state.progress, state.miracle, state.time);

    const groundY = h * Scenes.GROUND;

    stage.gates.forEach(function (gate, i) {
      drawGate(gate, state.gatesPassed[i], w, h, state.time);
    });

    drawParticles();

    const scale = Math.min(w, h) * 0.14;
    const phase = state.time * (state.walking ? 7.4 : 0.75);
    drawPilgrim(w * Scenes.PILGRIM_X, groundY, scale, stage.figure, phase, state.walking, state.miracle);

    if (state.miracle > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(
        w * Scenes.PILGRIM_X, groundY - scale * 0.6, 0,
        w * Scenes.PILGRIM_X, groundY - scale * 0.6, scale * 2.6
      );
      g.addColorStop(0, 'rgba(244,212,146,' + (0.14 * state.miracle) + ')');
      g.addColorStop(1, 'rgba(244,212,146,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ── Loop ── */
  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!state.paused) render(dt);
    raf = requestAnimationFrame(loop);
  }

  /* ── Public ── */
  function init(h) {
    hooks = h || {};
    resize();
    state.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 160); });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
    cancelAnimationFrame(raf);
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function load(stage) {
    state.stage = stage;
    state.progress = 0;
    state.target = 0;
    state.walking = false;
    state.miracle = 0;
    state.miracleActive = false;
    state.gatesPassed = stage.gates.map(function () { return false; });
    state.dust = [];
    state.sparks = [];
    state.stepAcc = 0;
  }

  function walkTo(target) {
    state.target = clamp(target, 0, 1);
    if (state.target > state.progress) state.walking = true;
  }

  function passGate(i) { state.gatesPassed[i] = true; }
  function miracle() { state.miracleActive = true; }
  function pause(on) { state.paused = on; }

  function reset() {
    state.progress = 0;
    state.target = 0;
    state.walking = false;
    state.miracle = 0;
    state.miracleActive = false;
    state.stepAcc = 0;
    if (state.stage) state.gatesPassed = state.stage.gates.map(function () { return false; });
  }

  function nextGate() {
    if (!state.stage) return null;
    for (let i = 0; i < state.stage.gates.length; i++) {
      if (!state.gatesPassed[i]) return state.stage.gates[i];
    }
    return null;
  }

  return {
    init: init, load: load, walkTo: walkTo, passGate: passGate,
    miracle: miracle, reset: reset, pause: pause, nextGate: nextGate,
    get progress() { return state.progress; },
    get walking() { return state.walking; },
    get miracleLevel() { return state.miracle; },
  };
})();
