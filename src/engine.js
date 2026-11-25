/* ═══════════════════════════════════════════════════════════════════
   ENGINE — canvas, pilgrim, gates, and the walk.

   The pilgrim holds a fixed place on screen; the world answers to
   `progress`. Tapping Forward raises the target, the pilgrim walks to it,
   and if a gate stands there the question card opens on arrival.
   ═══════════════════════════════════════════════════════════════════ */

const Engine = (function () {
  const { clamp, lerp, easeOut, easeInOut } = Scenes;

  // Road covered by one tap, and how fast the pilgrim covers it. At 0.085 the
  // first gate (0.42) takes five taps, so the walk itself is part of the game.
  const STRIDE = 0.135;
  const WALK_SPEED = 0.20;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const state = {
    stage: null,
    progress: 0,
    lift: 0,
    liftTarget: 0,
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

    // ── Gait ──────────────────────────────────────────────────
    // One stride per 2π of phase. Thighs swing in antiphase; a knee only bends
    // while its leg is travelling forward, which is what keeps the walk from
    // looking like a pendulum.
    const amp = walking ? 0.44 : 0;
    const nearThigh = amp * Math.sin(phase);
    const farThigh = amp * Math.sin(phase + Math.PI);
    // A knee bends while its leg travels forward. Bending it on the backward
    // swing is what made the walk read as moonwalking.
    const nearKnee = walking ? 1.05 * Math.max(0, Math.cos(phase)) : 0.05;
    const farKnee = walking ? 1.05 * Math.max(0, Math.cos(phase + Math.PI)) : 0.05;

    // the body rises at mid-stance and drops at double support
    const bob = walking
      ? -Math.abs(Math.cos(phase)) * s * 0.014
      : Math.sin(phase * 0.5) * s * 0.004;
    const lean = walking ? 0.045 : 0.02;

    const hipX = 0;
    const hipY = -s * 0.455;
    const thighLen = s * 0.222;
    const shinLen = s * 0.215;

    function joints(thigh, knee) {
      const kx = hipX + Math.sin(thigh) * thighLen;
      const ky = hipY + Math.cos(thigh) * thighLen;
      const shinAngle = thigh - knee;
      return {
        kx: kx, ky: ky,
        ax: kx + Math.sin(shinAngle) * shinLen,
        ay: ky + Math.cos(shinAngle) * shinLen,
        foot: shinAngle,
      };
    }

    ctx.save();
    ctx.translate(cx, baseY + bob);
    // The figure is authored facing right. He crosses the frame right-to-left,
    // so mirror him or he walks backwards the whole way.
    ctx.scale(-1, 1);
    ctx.rotate(lean * 0.35);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── Shadow, softened and offset by the light ────────────────
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.30);
    sh.addColorStop(0, 'rgba(0,0,0,.5)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.30, s * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();

    /* ── Cloak, trailing behind ─────────────────────────────── */
    const flutter = Math.sin(phase * 1.6) * s * 0.012 * (walking ? 1 : 0.3);
    const cg = ctx.createLinearGradient(-s * 0.06, -s * 0.78, -s * 0.30, -s * 0.20);
    cg.addColorStop(0, fig.cloak);
    cg.addColorStop(1, shade(fig.cloak, -0.45));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(-s * 0.055, -s * 0.765);
    ctx.quadraticCurveTo(-s * 0.20, -s * 0.60, -s * 0.215 - flutter, -s * 0.30);
    ctx.quadraticCurveTo(-s * 0.16 - flutter, -s * 0.255, -s * 0.105 - flutter * 0.5, -s * 0.315);
    ctx.quadraticCurveTo(-s * 0.10, -s * 0.58, -s * 0.045, -s * 0.70);
    ctx.closePath();
    ctx.fill();

    /* ── Far leg (behind the body, drawn darker) ─────────────── */
    function drawLeg(j, colour, shadeAmt, footAmt) {
      const skin = shade(colour, shadeAmt);
      ctx.strokeStyle = skin;
      ctx.lineWidth = s * 0.070;
      ctx.beginPath();
      ctx.moveTo(hipX - s * 0.012, hipY);
      ctx.lineTo(j.kx - s * 0.012, j.ky);
      ctx.stroke();
      ctx.lineWidth = s * 0.055;
      ctx.beginPath();
      ctx.moveTo(j.kx - s * 0.012, j.ky);
      ctx.lineTo(j.ax - s * 0.012, j.ay);
      ctx.stroke();

      // foot, flat to the ground when planted
      const fx = j.ax - s * 0.012;
      const lift = Math.max(0, -j.ay / (s * 0.02)) * 0;
      ctx.fillStyle = shade(fig.skin, footAmt);
      ctx.beginPath();
      ctx.moveTo(fx - s * 0.012, j.ay - lift - s * 0.020);
      ctx.quadraticCurveTo(fx + s * 0.052, j.ay - lift - s * 0.026, fx + s * 0.062, j.ay - lift - s * 0.004);
      ctx.quadraticCurveTo(fx + s * 0.058, j.ay - lift + s * 0.008, fx - s * 0.012, j.ay - lift + s * 0.006);
      ctx.closePath();
      ctx.fill();
    }

    const farJ = joints(farThigh, farKnee);
    drawLeg(farJ, fig.cloak, -0.28, -0.20);

    /* ── Far arm, swinging opposite the far leg ───────────────── */
    // The far arm swings with the near leg.
    const armSwing = walking ? 0.36 * Math.sin(phase) : 0.05;
    const shX = s * 0.012;
    const shY = -s * 0.735;
    const upper = s * 0.155;
    const fore = s * 0.145;
    const elbowX = shX + Math.sin(armSwing) * upper;
    const elbowY = shY + Math.cos(armSwing) * upper;
    const handAngle = armSwing - 0.28;
    const handX = elbowX + Math.sin(handAngle) * fore;
    const handY = elbowY + Math.cos(handAngle) * fore;

    ctx.strokeStyle = shade(fig.robe, -0.42);
    ctx.lineWidth = s * 0.050;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    /* ── Tunic ──────────────────────────────────────────────── */
    const tg = ctx.createLinearGradient(-s * 0.09, -s * 0.74, s * 0.10, -s * 0.30);
    tg.addColorStop(0, shade(fig.robe, 0.10));
    tg.addColorStop(0.55, fig.robe);
    tg.addColorStop(1, shade(fig.robe, -0.34));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-s * 0.088, -s * 0.755);                       // left shoulder
    ctx.quadraticCurveTo(s * 0.012, -s * 0.80, s * 0.098, -s * 0.745); // over the shoulder
    ctx.quadraticCurveTo(s * 0.115, -s * 0.60, s * 0.098, -s * 0.475); // down the side
    // skirt of the tunic, swaying with the stride
    ctx.quadraticCurveTo(s * 0.115 + nearThigh * s * 0.10, -s * 0.38, s * 0.078 + nearThigh * s * 0.055, -s * 0.275);
    ctx.lineTo(-s * 0.072 + nearThigh * s * 0.05, -s * 0.278);
    ctx.quadraticCurveTo(-s * 0.108, -s * 0.40, -s * 0.098, -s * 0.50);
    ctx.quadraticCurveTo(-s * 0.098, -s * 0.64, -s * 0.088, -s * 0.755);
    ctx.closePath();
    ctx.fill();

    // a fold down the front, and a hem shadow
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = Math.max(0.7, s * 0.010);
    ctx.beginPath();
    ctx.moveTo(s * 0.045, -s * 0.70);
    ctx.quadraticCurveTo(s * 0.062, -s * 0.48, s * 0.052 + nearThigh * s * 0.05, -s * 0.285);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath();
    ctx.moveTo(-s * 0.072 + nearThigh * s * 0.05, -s * 0.283);
    ctx.lineTo(s * 0.076 + nearThigh * s * 0.055, -s * 0.280);
    ctx.stroke();

    /* ── Belt ──────────────────────────────────────────────── */
    ctx.strokeStyle = 'rgba(150,110,52,.9)';
    ctx.lineWidth = Math.max(1.1, s * 0.026);
    ctx.beginPath();
    ctx.moveTo(-s * 0.092, -s * 0.500);
    ctx.lineTo(s * 0.098, -s * 0.492);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,196,124,.95)';
    ctx.beginPath();
    ctx.arc(s * 0.052, -s * 0.494, Math.max(0.8, s * 0.016), 0, Math.PI * 2);
    ctx.fill();

    /* ── Near leg, in front ─────────────────────────────────── */
    const nearJ = joints(nearThigh, nearKnee);
    drawLeg(nearJ, fig.robe, -0.06, 0);

    /* ── Neck and head in profile ───────────────────────────── */
    ctx.strokeStyle = fig.skin;
    ctx.lineWidth = s * 0.046;
    ctx.beginPath();
    ctx.moveTo(s * 0.006, -s * 0.765);
    ctx.lineTo(s * 0.014, -s * 0.805);
    ctx.stroke();

    const hx = s * 0.020;
    const hy = -s * 0.868;
    const hr = s * 0.081;

    // skull, with the jaw tapering toward the chin
    const sg = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.4, hr * 0.2, hx, hy, hr * 1.25);
    sg.addColorStop(0, shade(fig.skin, 0.16));
    sg.addColorStop(1, shade(fig.skin, -0.12));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(hx + hr * 0.30, hy - hr * 0.92);
    ctx.quadraticCurveTo(hx + hr * 1.02, hy - hr * 0.55, hx + hr * 0.96, hy + hr * 0.10);
    ctx.quadraticCurveTo(hx + hr * 0.80, hy + hr * 0.72, hx + hr * 0.22, hy + hr * 0.92); // chin
    ctx.quadraticCurveTo(hx - hr * 0.86, hy + hr * 0.86, hx - hr * 0.94, hy + hr * 0.02);
    ctx.quadraticCurveTo(hx - hr * 0.90, hy - hr * 0.78, hx + hr * 0.30, hy - hr * 0.92);
    ctx.closePath();
    ctx.fill();

    // Beard. Hangs from the jawline and below the chin. Anything drawn over the
    // middle of the face reads as a mask at this size, so the face stays clear.
    if (fig.beard) {
      const bg = ctx.createLinearGradient(0, hy + hr * 0.35, 0, hy + hr * 2.2);
      bg.addColorStop(0, 'rgba(112,102,86,.97)');
      bg.addColorStop(0.5, 'rgba(88,80,66,.97)');
      bg.addColorStop(1, 'rgba(58,52,42,.95)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.30, hy + hr * 0.62);          // behind the jaw
      ctx.quadraticCurveTo(hx + hr * 0.10, hy + hr * 0.50, hx + hr * 0.52, hy + hr * 0.74); // jawline
      ctx.quadraticCurveTo(hx + hr * 0.46, hy + hr * 1.30, hx + hr * 0.20, hy + hr * 2.10); // point
      ctx.quadraticCurveTo(hx - hr * 0.10, hy + hr * 1.40, hx - hr * 0.36, hy + hr * 0.92);
      ctx.closePath();
      ctx.fill();

      // moustache, a short bar under the nose
      ctx.beginPath();
      ctx.moveTo(hx + hr * 0.82, hy + hr * 0.26);
      ctx.quadraticCurveTo(hx + hr * 0.40, hy + hr * 0.24, hx + hr * 0.10, hy + hr * 0.46);
      ctx.quadraticCurveTo(hx + hr * 0.44, hy + hr * 0.54, hx + hr * 0.80, hy + hr * 0.44);
      ctx.closePath();
      ctx.fill();

      // strands
      ctx.strokeStyle = 'rgba(160,150,132,.30)';
      ctx.lineWidth = Math.max(0.4, s * 0.004);
      for (let i = 0; i < 3; i++) {
        const f = i / 2;
        ctx.beginPath();
        ctx.moveTo(hx + hr * (0.34 - f * 0.36), hy + hr * 0.86);
        ctx.quadraticCurveTo(hx + hr * (0.30 - f * 0.32), hy + hr * 1.40, hx + hr * (0.18 - f * 0.14), hy + hr * 1.94);
        ctx.stroke();
      }
    }

    // nose, small and drawn last so it sits on top of the beard
    ctx.fillStyle = shade(fig.skin, 0.06);
    ctx.beginPath();
    ctx.moveTo(hx + hr * 0.72, hy - hr * 0.22);
    ctx.quadraticCurveTo(hx + hr * 1.20, hy + hr * 0.10, hx + hr * 0.74, hy + hr * 0.30);
    ctx.closePath();
    ctx.fill();

    // An eye and a brow. The old soft ellipse across the face read as a
    // blindfold at phone size; a lit eye makes the profile read as a face.
    ctx.fillStyle = 'rgba(38,26,18,.88)';
    ctx.beginPath();
    ctx.ellipse(hx + hr * 0.52, hy - hr * 0.10, hr * 0.115, hr * 0.085, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(58,42,30,.75)';
    ctx.lineWidth = Math.max(0.7, s * 0.011);
    ctx.beginPath();
    ctx.moveTo(hx + hr * 0.26, hy - hr * 0.30);
    ctx.quadraticCurveTo(hx + hr * 0.54, hy - hr * 0.40, hx + hr * 0.80, hy - hr * 0.28);
    ctx.stroke();

    // hair: a close cap swept back from the brow
    const hg = ctx.createLinearGradient(hx - hr, hy - hr, hx + hr * 0.5, hy);
    hg.addColorStop(0, shade(fig.cloak, 0.12));
    hg.addColorStop(1, shade(fig.cloak, -0.20));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(hx + hr * 0.62, hy - hr * 0.52);              // hairline at the brow
    ctx.quadraticCurveTo(hx + hr * 0.24, hy - hr * 1.08, hx - hr * 0.50, hy - hr * 0.84);
    ctx.quadraticCurveTo(hx - hr * 1.06, hy - hr * 0.22, hx - hr * 0.90, hy + hr * 0.40);
    ctx.quadraticCurveTo(hx - hr * 0.80, hy - hr * 0.02, hx - hr * 0.64, hy - hr * 0.34);
    ctx.quadraticCurveTo(hx - hr * 0.24, hy - hr * 0.66, hx + hr * 0.62, hy - hr * 0.52);
    ctx.closePath();
    ctx.fill();

    /* ── Near arm, and the staff it carries ───────────────────── */
    // With a staff the arm is held out to the side, so the shaft stands clear of
    // the face instead of running up through it.
    // The near arm swings with the far leg, so it opposes the near one.
    const nearSwing = fig.staff
      ? 0.52 + (walking ? 0.06 * Math.sin(phase) : 0)
      : (walking ? 0.36 * Math.sin(phase + Math.PI) : 0.05);
    const nShX = s * 0.030;
    const nShY = -s * 0.732;
    const nElbowX = nShX + Math.sin(nearSwing) * upper;
    const nElbowY = nShY + Math.cos(nearSwing) * upper;
    const nHandAngle = nearSwing - (fig.staff ? 0.10 : 0.30);
    const nHandX = nElbowX + Math.sin(nHandAngle) * fore;
    const nHandY = nElbowY + Math.cos(nHandAngle) * fore;

    ctx.strokeStyle = shade(fig.robe, -0.12);
    ctx.lineWidth = s * 0.048;
    ctx.beginPath();
    ctx.moveTo(nShX, nShY);
    ctx.lineTo(nElbowX, nElbowY);
    ctx.lineTo(nHandX, nHandY);
    ctx.stroke();

    ctx.fillStyle = fig.skin;
    ctx.beginPath();
    ctx.arc(nHandX, nHandY, Math.max(1.0, s * 0.026), 0, Math.PI * 2);
    ctx.fill();

    if (fig.staff) {
      // the staff is planted ahead of the walker and tips with each stride
      const tilt = (walking ? 0.03 + Math.sin(phase) * 0.03 : 0.02);
      const bx = nHandX;
      const by = nHandY;
      const topX = bx + Math.sin(tilt) * s * 0.80;
      const topY = by - Math.cos(tilt) * s * 0.80;

      ctx.strokeStyle = '#6a5334';
      ctx.lineWidth = Math.max(1.2, s * 0.024);
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(bx, 0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(180,150,96,.55)';
      ctx.lineWidth = Math.max(0.5, s * 0.007);
      ctx.beginPath();
      ctx.moveTo(topX + s * 0.006, topY);
      ctx.lineTo(bx + s * 0.006, 0);
      ctx.stroke();

      if (miracle > 0.05) {
        const gg = ctx.createRadialGradient(topX, topY, 0, topX, topY, s * 0.11);
        gg.addColorStop(0, 'rgba(248,224,166,' + (0.55 + miracle * 0.45) + ')');
        gg.addColorStop(1, 'rgba(248,224,166,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(topX, topY, s * 0.11, 0, Math.PI * 2);
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

    const pulse = 0.5 + Math.sin(time * 1.7) * 0.5;
    // The gate stands on the road at the spot the walker reaches it. Offset
    // left so he stops at its near edge instead of standing inside the mist.
    const bot = h * (Scenes.GROUND + 0.010);
    const rise = h * 0.26;
    const halfW = w * 0.10;
    // The walker travels right to left, so the mist is set just ahead of him:
    // its near edge meets the spot where he stops.
    const x = w * Scenes.pilgrimX(gate.at) - halfW * 0.95;

    // A bank of luminous mist standing across the road. Built from soft radial
    // blobs rather than lines or a rectangle, so it has no edge to read as an
    // object and no top line to read as a panel.
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const f = i / 8;
      const bx = x + (f - 0.5) * halfW * 1.6;
      const edge = Math.max(0, 1 - Math.abs(f - 0.5) * 2.0);
      const by = bot - rise * (0.34 + Math.sin(f * 3.1 + time * 0.7) * 0.08);
      const r = halfW * (0.60 + Math.sin(f * 5.0) * 0.10);

      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, 'rgba(252,234,186,' + ((0.17 + pulse * 0.08) * edge).toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(248,224,164,' + ((0.09 + pulse * 0.05) * edge).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(244,212,146,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(bx, by, r, rise * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // soft vertical shafts of light, fading out at both ends
    for (let i = -3; i <= 3; i++) {
      const fx = x + i * halfW * 0.30;
      const edge = 1 - Math.abs(i) / 4.2;
      const a = (0.07 + pulse * 0.05) * edge;
      const shaft = ctx.createLinearGradient(0, bot - rise, 0, bot);
      shaft.addColorStop(0, 'rgba(252,234,186,0)');
      shaft.addColorStop(0.45, 'rgba(252,234,186,' + (a * 0.7).toFixed(3) + ')');
      shaft.addColorStop(1, 'rgba(252,234,186,' + a.toFixed(3) + ')');
      ctx.strokeStyle = shaft;
      ctx.lineWidth = Math.max(2, w * 0.016);
      ctx.beginPath();
      ctx.moveTo(fx, bot - rise);
      ctx.lineTo(fx, bot);
      ctx.stroke();
    }
    ctx.restore();

    // the ground it stands on, lit from within
    const seam = ctx.createLinearGradient(x - halfW, 0, x + halfW, 0);
    seam.addColorStop(0, 'rgba(246,224,170,0)');
    seam.addColorStop(0.5, 'rgba(252,238,196,' + (0.42 + pulse * 0.26) + ')');
    seam.addColorStop(1, 'rgba(246,224,170,0)');
    ctx.strokeStyle = seam;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - halfW, bot);
    ctx.quadraticCurveTo(x, bot - h * 0.006, x + halfW, bot);
    ctx.stroke();

    // a few slow motes rising out of it
    for (let i = 0; i < 6; i++) {
      const t = (time * 0.16 + i / 6) % 1;
      const mx = x + Math.sin(i * 2.4 + time * 0.5) * halfW * 0.8;
      const my = bot - rise * t;
      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.fillStyle = '#f8e2b0';
      ctx.beginPath();
      ctx.arc(mx, my, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

    if (state.walking && !state.paused) {
      const before = state.progress;
      state.progress = Math.min(state.target, state.progress + dt * WALK_SPEED);

      if (state.progress > before) {
        // count real footsteps rather than frames, so the tally reads honestly
        state.stepAcc += (state.progress - before) * 42;
        while (state.stepAcc >= 1) {
          state.stepAcc -= 1;
          if (hooks.onStep) hooks.onStep();
        }
        const groundY = h * Scenes.GROUND;
        if (Math.random() < (state.progress - before) * 22) {
          spawnDust(w * Scenes.pilgrimX(state.progress) + 4 + Math.random() * 9, groundY - 1, stage.palette.land);
        }
      }

      if (state.progress >= state.target - 0.0005) {
        state.walking = false;
        if (hooks.onArrive) hooks.onArrive(state.progress);
      }
    }

    if (state.miracleActive && !state.paused) {
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

    if (!state.paused) stepParticles(dt);

    // The camera eases up when a question sheet covers the bottom of the scene,
    // so the pilgrim and the gate stay in view while he is being asked.
    state.lift += (state.liftTarget - state.lift) * Math.min(1, dt * 7);
    const lift = state.lift;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(0, -lift);

    Scenes.draw(ctx, w, h, stage, state.progress, state.miracle, state.time);

    const groundY = h * Scenes.GROUND;

    stage.gates.forEach(function (gate, i) {
      drawGate(gate, state.gatesPassed[i], w, h, state.time);
    });

    drawParticles();

    // Big enough to read the gait on a phone. At 0.14 the figure was a speck and
    // all the walk-cycle work was invisible.
    const scale = Math.min(w, h) * 0.23;
    const phase = state.time * (state.walking ? 7.4 : 0.75);
    const px = w * Scenes.pilgrimX(state.progress);
    drawPilgrim(px, groundY, scale, stage.figure, phase, state.walking, state.miracle);
    ctx.restore();

    // The strip the camera uncovered: continue the last drawn row downward, so the
    // ground runs to the bottom edge instead of ending in a flat band.
    if (lift > 1) {
      const srcY = Math.max(0, h - lift - 1);
      try {
        ctx.drawImage(canvas, 0, Math.round(srcY * state.dpr), canvas.width, 1,
          0, srcY, w, lift + 1);
      } catch (e) {
        ctx.fillStyle = stage.palette.land;
        ctx.fillRect(0, srcY, w, lift + 1);
      }
    }

    if (state.miracle > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(
        px, groundY - scale * 0.6, 0,
        px, groundY - scale * 0.6, scale * 2.6
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
    // Keep painting while a card is open: the walk is frozen inside render(),
    // but the camera still eases up so the pilgrim stays in view.
    render(dt);
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

  /* One Forward tap = one stride. The gate is reached after several of them, so
     the walk is something you do rather than a jump cut to the question. */
  function stride(limit) {
    const stop = clamp(limit, 0, 1);
    const next = Math.min(stop, state.progress + STRIDE);
    if (next > state.progress + 0.0005) {
      state.target = next;
      state.walking = true;
      return true;
    }
    return false;
  }

  /* When a question sheet covers the bottom of the scene, pull the ground line up
     by that many CSS pixels so the pilgrim stays in view while he is being asked. */
  function setLift(px) {
    state.liftTarget = Math.max(0, px || 0);
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
    init: init, load: load, walkTo: walkTo, stride: stride, passGate: passGate,
    miracle: miracle, reset: reset, pause: pause, nextGate: nextGate,
    get progress() { return state.progress; },
    setLift: setLift,
    get walking() { return state.walking; },
    get miracleLevel() { return state.miracle; },
  };
})();
