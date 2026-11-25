/* ═══════════════════════════════════════════════════════════════════
   SCENES — procedural landscapes.

   One perspective for every journey, so the game always reads the same way:

       0.00 ┌──────────────────────────┐
             │  sky: stars, moon, glow  │
       0.42 ├──────────────────────────┤ horizon
             │  far: sea, valley, city  │  ← the landmark stands here
       0.68 ├──────────────────────────┤ far shore
             │  near: the road you walk │  ← the pilgrim stands here
       1.00 └──────────────────────────┘

   Left to right the picture is a journey: pilgrim → gate → destination.
   `progress` grows the landmark and slides the road markers past, so tapping
   Forward reads as walking toward the thing that blocks the way.
   ═══════════════════════════════════════════════════════════════════ */

const Scenes = (function () {

  const HORIZON = 0.40;
  const FAR_Y = 0.70;
  const GROUND = 0.86;
  const PILGRIM_X = 0.28;
  const GATE_X = 0.52;
  const AXIS_X = 0.74;

  /* ── Deterministic RNG (mulberry32) ── */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ── Layered silhouette ridge, filled with a gradient so it reads as
        distant land rather than a flat cut-out ── */
  function ridge(ctx, w, baseY, amp, seed, hex, alpha, roughness) {
    const r = rng(seed);
    const rough = roughness == null ? 0.5 : roughness;
    const pts = [];
    let x = -4;
    pts.push([x, baseY + amp * 0.6]);
    while (x < w + 30) {
      x += 20 + r() * 46;
      pts.push([x, baseY - r() * amp + (r() - 0.5) * amp * rough]);
    }
    pts.push([w + 4, baseY + amp]);

    const g = ctx.createLinearGradient(0, baseY - amp, 0, baseY + amp);
    g.addColorStop(0, rgba(hex, alpha));
    g.addColorStop(0.62, rgba(hex, alpha * 0.82));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-4, baseY + amp);
    pts.forEach(function (pt) { ctx.lineTo(pt[0], pt[1]); });
    ctx.lineTo(w + 4, baseY + amp + 600);
    ctx.lineTo(-4, baseY + amp + 600);
    ctx.closePath();
    ctx.fill();
  }

  function stars(ctx, w, h, count, seed, alpha) {
    const r = rng(seed);
    const limit = h * HORIZON;
    ctx.fillStyle = '#e2ebf7';
    for (let i = 0; i < count; i++) {
      const x = r() * w;
      const y = r() * r() * limit;
      ctx.globalAlpha = alpha * (0.22 + r() * 0.78);
      ctx.beginPath();
      ctx.arc(x, y, 0.35 + r() * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function glow(ctx, x, y, r, hex, alpha) {
    if (r <= 0 || alpha <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(hex, alpha));
    g.addColorStop(0.5, rgba(hex, alpha * 0.34));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── Haze on the horizon: the thing that gives depth ── */
  function haze(ctx, w, h, hy, hex, alpha) {
    const g = ctx.createLinearGradient(0, hy - h * 0.14, 0, hy + h * 0.05);
    g.addColorStop(0, rgba(hex, 0));
    g.addColorStop(0.72, rgba(hex, alpha));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, hy - h * 0.14, w, h * 0.2);
  }

  /* ── The near bank, with a lit road running to the destination ── */
  function bank(ctx, w, h, top, bottom, road) {
    const y0 = h * FAR_Y;

    // the bank's top edge stays below the waterline, so the sea is never cut
    // by a hard diagonal at the edge of the frame
    const g = ctx.createLinearGradient(0, y0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, y0 + h * 0.024);
    ctx.bezierCurveTo(w * 0.3, y0 + h * 0.006, w * 0.66, y0 + h * 0.026, w, y0 + h * 0.012);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // a soft band of shadow where the bank meets the water
    const shade = ctx.createLinearGradient(0, y0, 0, y0 + h * 0.05);
    shade.addColorStop(0, 'rgba(0,0,0,.22)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, y0, w, h * 0.05);

    if (!road) return;
    const rg = ctx.createLinearGradient(0, y0, 0, h);
    rg.addColorStop(0, rgba(road, 0.012));
    rg.addColorStop(1, rgba(road, 0.075));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(w * PILGRIM_X - w * 0.045, h * (GROUND + 0.012));
    ctx.lineTo(w * AXIS_X - w * 0.016, y0 + h * 0.012);
    ctx.lineTo(w * AXIS_X + w * 0.016, y0 + h * 0.012);
    ctx.lineTo(w * PILGRIM_X + w * 0.11, h * (GROUND + 0.012));
    ctx.closePath();
    ctx.fill();
  }


  /* ── Mid-ground: a rolling slope with scattered rock, filling the band
        between the horizon and the far bank ── */
  function midground(ctx, w, h, hex, alpha, seed) {
    const hy = h * HORIZON;
    const farY = h * FAR_Y;
    const r = rng(seed);

    const g = ctx.createLinearGradient(0, hy, 0, farY);
    g.addColorStop(0, rgba(hex, alpha * 0.55));
    g.addColorStop(1, rgba(hex, alpha));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, farY);
    ctx.lineTo(0, hy + (farY - hy) * 0.34);
    let x = 0;
    while (x < w) {
      x += 30 + r() * 70;
      ctx.lineTo(x, hy + (farY - hy) * (0.18 + r() * 0.34));
    }
    ctx.lineTo(w, farY);
    ctx.closePath();
    ctx.fill();

    // a few boulders catching the light
    for (let i = 0; i < 16; i++) {
      const bx = r() * w;
      const by = hy + (farY - hy) * (0.4 + r() * 0.55);
      const bw = w * (0.006 + r() * 0.02);
      ctx.fillStyle = rgba(hex, alpha * (0.5 + r() * 0.5));
      ctx.beginPath();
      ctx.ellipse(bx, by, bw, bw * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Soft dark corners that frame the picture without adding clutter ── */
  function foreground(ctx, w, h, hex, seed) {
    const g = ctx.createLinearGradient(0, h * 0.9, 0, h);
    g.addColorStop(0, rgba(hex, 0));
    g.addColorStop(1, rgba(hex, 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.9, w, h * 0.1);
  }

  /* ═══════════════════════════════════════════════════════════════
     RED SEA — the sea parts into two walls of water
     ═══════════════════════════════════════════════════════════════ */
  function redSea(ctx, w, h, hy, p, m, t) {
    stars(ctx, w, h, 100, 11, 0.9);

    const moonX = w * 0.85;
    const moonY = hy * 0.3;
    glow(ctx, moonX, moonY, w * 0.3, '#cfe2f5', 0.13);
    ctx.fillStyle = 'rgba(238,245,254,.95)';
    ctx.beginPath();
    ctx.arc(moonX, moonY, Math.min(w, h) * 0.032, 0, Math.PI * 2);
    ctx.fill();

    ridge(ctx, w, hy - h * 0.002, h * 0.03, 3, '#2b405c', 0.75, 0.7);
    ridge(ctx, w, hy + h * 0.022, h * 0.018, 7, '#162335', 0.9, 0.8);
    haze(ctx, w, h, hy, '#6a9dc6', 0.15);

    const seaTop = hy + h * 0.024;
    const farY = h * FAR_Y;
    const sg = ctx.createLinearGradient(0, seaTop, 0, farY);
    sg.addColorStop(0, '#1a4664');
    sg.addColorStop(0.45, '#112e46');
    sg.addColorStop(1, '#0a1c2c');
    ctx.fillStyle = sg;
    ctx.fillRect(0, seaTop, w, farY - seaTop);

    const calm = m;
    ctx.lineWidth = 1;
    for (let i = 0; i < 13; i++) {
      const k = (i + 1) / 13;
      const yy = seaTop + (farY - seaTop) * Math.pow(k, 1.9);
      ctx.strokeStyle = 'rgba(150,198,230,' + (0.15 * (1 - calm * 0.8) * (0.35 + k)) + ')';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 18) {
        const amp = (0.6 + k * 2.2) * (1 - calm);
        const y = yy + Math.sin(x * 0.055 + t * 1.25 + i * 0.9) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const gg = ctx.createLinearGradient(0, seaTop, 0, farY);
    gg.addColorStop(0, 'rgba(152,196,232,.2)');
    gg.addColorStop(1, 'rgba(152,196,232,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(moonX - w * 0.03, seaTop);
    ctx.lineTo(moonX + w * 0.03, seaTop);
    ctx.lineTo(moonX + w * 0.13, farY);
    ctx.lineTo(moonX - w * 0.13, farY);
    ctx.closePath();
    ctx.fill();

    const open = easeOut(clamp(m * 1.7, 0, 1));
    if (open > 0.01) {
      const axis = w * AXIS_X;

      // The corridor crosses the sea only, from the far shore to the water's edge.
      // Beyond that the dry road on the bank takes over.
      const halfTop = w * 0.003 + w * 0.008 * open;
      const halfBot = w * 0.003 + w * 0.10 * open;

      const floor = ctx.createLinearGradient(0, seaTop, 0, farY);
      floor.addColorStop(0, 'rgba(88,72,52,.92)');
      floor.addColorStop(1, 'rgba(50,40,30,.98)');
      ctx.fillStyle = floor;
      ctx.beginPath();
      ctx.moveTo(axis - halfTop, seaTop);
      ctx.lineTo(axis + halfTop, seaTop);
      ctx.lineTo(axis + halfBot, farY);
      ctx.lineTo(axis - halfBot, farY);
      ctx.closePath();
      ctx.fill();

      const sheen = ctx.createLinearGradient(0, seaTop, 0, farY);
      sheen.addColorStop(0, 'rgba(162,200,222,.22)');
      sheen.addColorStop(1, 'rgba(162,200,222,0)');
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.moveTo(axis - halfTop * 0.6, seaTop);
      ctx.lineTo(axis + halfTop * 0.6, seaTop);
      ctx.lineTo(axis + halfBot * 0.5, farY);
      ctx.lineTo(axis - halfBot * 0.5, farY);
      ctx.closePath();
      ctx.fill();

      [-1, 1].forEach(function (side) {
        const xTop = axis + side * halfTop;
        const xBot = axis + side * halfBot;
        const wobble = Math.sin(t * 0.8 + side) * h * 0.004 * open;

        // inner face of the wall: a smooth curve bulging into the corridor
        const face = function (f) {
          // f runs 0 at the far shore to 1 at the near water's edge
          return xTop + side * (halfBot - halfTop) * f
                 + side * Math.sin(f * Math.PI) * w * 0.012 * open;
        };

        // crest: the same curve, lifted by a height that grows toward the viewer
        const crestAt = function (f) {
          const rise = h * (0.085 + 0.055 * f) * open;
          const jag = Math.sin(f * 11 + t * 1.1 + side * 2) * h * 0.009 * open
                    + Math.sin(f * 29 + t * 1.9) * h * 0.004 * open;
          return seaTop - rise + jag + wobble * f;
        };

        const wg = ctx.createLinearGradient(0, seaTop - h * 0.2 * open, 0, farY);
        wg.addColorStop(0, 'rgba(170,220,244,.55)');
        wg.addColorStop(0.28, 'rgba(86,156,196,.76)');
        wg.addColorStop(0.72, 'rgba(44,104,142,.86)');
        wg.addColorStop(1, 'rgba(24,66,98,.92)');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(face(1), farY);
        for (let k = 1; k >= 0; k -= 0.05) {
          const f = k;
          ctx.lineTo(face(f), lerp(seaTop, crestAt(f), 1));
        }
        // across the top of the wall, away from the corridor: the wall stays
        // tall as it recedes, with only a shallow undulation along the crest
        const topY = crestAt(1);
        for (let k = 0; k <= 1; k += 0.1) {
          const undulate = Math.sin(k * 6 + side + t * 0.7) * h * 0.006 * open;
          ctx.lineTo(face(k) + side * w * (0.018 + 0.062 * k), topY + undulate);
        }
        ctx.lineTo(face(1) + side * w * 0.08, farY);
        ctx.closePath();
        ctx.fill();

        // a lit rim along the crest, so the top edge catches the moon
        ctx.strokeStyle = 'rgba(214,244,255,' + (0.55 * open) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k <= 1.001; k += 0.05) {
          const px = face(k);
          const py = crestAt(k);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // verticals of falling water on the inner face
        const r = rng(side < 0 ? 501 : 502);
        ctx.strokeStyle = 'rgba(222,246,255,' + (0.16 * open) + ')';
        ctx.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
          const f = r();
          const sx = face(f) - side * r() * w * 0.01;
          const top = crestAt(f) + h * 0.01;
          const len = h * (0.03 + r() * 0.1) * open;
          ctx.beginPath();
          ctx.moveTo(sx, top);
          ctx.lineTo(sx, top + len);
          ctx.stroke();
        }

        // foam where the wall meets the water at the foot of the corridor
        ctx.fillStyle = 'rgba(206,240,255,' + (0.22 * open) + ')';
        ctx.beginPath();
        ctx.ellipse(face(1), farY - h * 0.003, w * 0.018, h * 0.006, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    bank(ctx, w, h, '#1e2839', '#0c1320', '#d9a94e');
    foreground(ctx, w, h, '#080d15', 61);

    const r = rng(23);
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = r() * w;
      const by = h * (FAR_Y + 0.05) + r() * h * (1 - FAR_Y - 0.09);
      const bh = h * (0.028 + r() * 0.045);
      const sway = Math.sin(t * 1.15 + i) * 4;
      ctx.strokeStyle = 'rgba(56,76,66,' + (0.28 + r() * 0.22) + ')';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.quadraticCurveTo(x + sway * 0.5, by - bh * 0.6, x + sway, by - bh);
      ctx.stroke();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ARK — a storm, and a great timber hull
     ═══════════════════════════════════════════════════════════════ */
  function ark(ctx, w, h, hy, p, m, t) {
    const r = rng(31);
    for (let i = 0; i < 14; i++) {
      const cx = r() * w;
      const cy = r() * hy * 0.95;
      const rw = w * (0.16 + r() * 0.26);
      const rh = h * (0.028 + r() * 0.042);
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rw);
      cg.addColorStop(0, 'rgba(66,74,86,.32)');
      cg.addColorStop(1, 'rgba(66,74,86,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ridge(ctx, w, hy + h * 0.028, h * 0.045, 5, '#222831', 0.9, 0.6);
    haze(ctx, w, h, hy, '#7f8b95', 0.12);

    const farY = h * FAR_Y;
    const fg = ctx.createLinearGradient(0, hy, 0, farY);
    fg.addColorStop(0, 'rgba(32,40,50,.92)');
    fg.addColorStop(1, 'rgba(20,26,34,.97)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, hy, w, farY - hy);

    ctx.strokeStyle = 'rgba(154,180,204,.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 50; i++) {
      const rx = ((i * 89 + t * 340) % (w + 90)) - 45;
      const ry = ((i * 61 + t * 760) % (farY + 70)) - 35;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + 14);
      ctx.stroke();
    }

    const scale = 0.8 + easeOut(clamp(p * 1.3, 0, 1)) * 0.4;
    const ax = w * AXIS_X;
    const ay = farY - h * 0.012;
    const aw = Math.min(w, h * 1.6) * 0.4 * scale;
    const ah = aw * 0.52;
    const open = clamp(m * 1.4, 0, 1);

    // hull: a deep, curved boat rather than a box
    const hg = ctx.createLinearGradient(0, ay - ah * 0.1, 0, ay + ah * 0.7);
    hg.addColorStop(0, '#55401f');
    hg.addColorStop(0.5, '#3c2c17');
    hg.addColorStop(1, '#1f150c');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(ax - aw * 0.52, ay - ah * 0.16);
    ctx.quadraticCurveTo(ax - aw * 0.5, ay + ah * 0.5, ax - aw * 0.3, ay + ah * 0.66);
    ctx.quadraticCurveTo(ax, ay + ah * 0.78, ax + aw * 0.3, ay + ah * 0.66);
    ctx.quadraticCurveTo(ax + aw * 0.5, ay + ah * 0.5, ax + aw * 0.52, ay - ah * 0.16);
    ctx.closePath();
    ctx.fill();

    // gunwale highlight
    ctx.strokeStyle = 'rgba(168,132,82,.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ax - aw * 0.52, ay - ah * 0.16);
    ctx.quadraticCurveTo(ax - aw * 0.5, ay + ah * 0.5, ax - aw * 0.3, ay + ah * 0.66);
    ctx.stroke();

    // planking
    ctx.strokeStyle = 'rgba(128,98,58,.34)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const yy = ay - ah * 0.16 + ah * 0.17 * i;
      const inset = aw * 0.05 * i;
      ctx.beginPath();
      ctx.moveTo(ax - aw * 0.52 + inset, yy);
      ctx.lineTo(ax + aw * 0.52 - inset, yy);
      ctx.stroke();
    }

    // the long house on the deck
    
    
    ctx.fillStyle = '#46321c';
    ctx.fillRect(ax - aw * 0.3, ay - ah * 0.48, aw * 0.6, ah * 0.34);

    // roof, peaked along the length
    ctx.fillStyle = '#2c2013';
    ctx.beginPath();
    ctx.moveTo(ax - aw * 0.35, ay - ah * 0.48);
    ctx.lineTo(ax, ay - ah * 0.72);
    ctx.lineTo(ax + aw * 0.35, ay - ah * 0.48);
    ctx.closePath();
    ctx.fill();

    const lit = 0.3 + open * 0.5;
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      ctx.fillStyle = 'rgba(246,216,152,' + lit + ')';
      ctx.fillRect(ax + i * aw * 0.085 - aw * 0.014, ay - ah * 0.4, aw * 0.028, ah * 0.1);
    }

    if (open > 0.02) glow(ctx, ax, ay - ah * 0.16, aw * 0.4, '#f4d492', 0.32 * open);
    ctx.fillStyle = open > 0.02 ? 'rgba(248,222,166,' + (0.55 + open * 0.42) + ')' : '#1b1208';
    ctx.beginPath();
    ctx.moveTo(ax - aw * 0.045, ay + ah * 0.02);
    ctx.lineTo(ax - aw * 0.045, ay - ah * 0.26);
    ctx.quadraticCurveTo(ax, ay - ah * 0.36, ax + aw * 0.045, ay - ah * 0.26);
    ctx.lineTo(ax + aw * 0.045, ay + ah * 0.02);
    ctx.closePath();
    ctx.fill();

    bank(ctx, w, h, '#242b34', '#0f1318', '#d9a94e');
    foreground(ctx, w, h, '#0a0d11', 67);
  }

  /* ═══════════════════════════════════════════════════════════════
     JERICHO — the wall falls flat
     ═══════════════════════════════════════════════════════════════ */
  function jericho(ctx, w, h, hy, p, m, t) {
    stars(ctx, w, h, 64, 43, 0.62);
    glow(ctx, w * AXIS_X, hy * 0.88, w * 0.55, '#d9a94e', 0.07);
    ridge(ctx, w, hy + h * 0.016, h * 0.045, 9, '#322426', 0.88, 0.66);
    haze(ctx, w, h, hy, '#c08a54', 0.13);

    const farY = h * FAR_Y;
    const vg = ctx.createLinearGradient(0, hy, 0, farY);
    vg.addColorStop(0, '#33272a');
    vg.addColorStop(1, '#1e181b');
    ctx.fillStyle = vg;
    ctx.fillRect(0, hy, w, farY - hy);

    const collapse = easeInOut(clamp(m * 1.4, 0, 1));
    const scale = 0.8 + easeOut(clamp(p * 1.25, 0, 1)) * 0.35;
    const wallX = w * AXIS_X;
    const wallW = Math.min(w, h * 1.6) * 0.5 * scale;
    const wallH = h * 0.23 * scale;

    ctx.save();
    ctx.translate(0, wallH * collapse * 0.66);

    const wg = ctx.createLinearGradient(0, farY - wallH, 0, farY);
    wg.addColorStop(0, '#75603f');
    wg.addColorStop(0.55, '#584631');
    wg.addColorStop(1, '#3a2d1f');
    ctx.fillStyle = wg;
    ctx.fillRect(wallX - wallW / 2, farY - wallH, wallW, wallH);

    ctx.strokeStyle = 'rgba(28,21,15,.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 7; i++) {
      const yy = farY - wallH + (wallH / 7) * i;
      ctx.beginPath();
      ctx.moveTo(wallX - wallW / 2, yy);
      ctx.lineTo(wallX + wallW / 2, yy);
      ctx.stroke();
    }

    ctx.fillStyle = '#66512f';
    const merlons = 15;
    for (let i = 0; i < merlons; i++) {
      if (i % 2) continue;
      ctx.fillRect(
        wallX - wallW / 2 + (wallW / merlons) * i,
        farY - wallH - h * 0.02 * scale,
        (wallW / merlons) * 0.62,
        h * 0.022 * scale
      );
    }

    [-0.48, 0.48].forEach(function (sx) {
      const tw = wallW * 0.1;
      const tx = wallX + wallW * sx;
      ctx.fillStyle = '#55432e';
      ctx.fillRect(tx - tw / 2, farY - wallH * 1.26, tw, wallH * 1.26);
      ctx.fillStyle = '#66512f';
      for (let i = 0; i < 3; i++) {
        if (i % 2) continue;
        ctx.fillRect(tx - tw / 2 + (tw / 3) * i, farY - wallH * 1.26 - h * 0.016 * scale, (tw / 3) * 0.64, h * 0.018 * scale);
      }
    });

    const gateOpen = m > 0.35;
    if (gateOpen) glow(ctx, wallX, farY - wallH * 0.3, wallW * 0.24, '#f4d492', 0.32);
    ctx.fillStyle = gateOpen ? 'rgba(248,222,166,' + (0.4 + m * 0.5) + ')' : '#1c140e';
    ctx.beginPath();
    ctx.moveTo(wallX - wallW * 0.05, farY);
    ctx.lineTo(wallX - wallW * 0.05, farY - wallH * 0.5);
    ctx.quadraticCurveTo(wallX, farY - wallH * 0.76, wallX + wallW * 0.05, farY - wallH * 0.5);
    ctx.lineTo(wallX + wallW * 0.05, farY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (collapse > 0.04) {
      const rr = rng(77);
      ctx.fillStyle = 'rgba(117,96,63,' + (0.62 * collapse) + ')';
      for (let i = 0; i < 30; i++) {
        const bx = wallX - wallW / 2 + rr() * wallW;
        const drop = ((t * 50 + rr() * 260) % 170) * collapse;
        ctx.fillRect(bx, farY - wallH * 0.4 + drop, 2.5 + rr() * 5, 2 + rr() * 3.5);
      }
      glow(ctx, wallX, farY - wallH * 0.28, wallW * 0.5, '#8a6a44', 0.2 * collapse);
    }

    midground(ctx, w, h, '#3a2a2c', 0.75, 211);
    bank(ctx, w, h, '#2b2329', '#120f14', '#d9a94e');
    foreground(ctx, w, h, '#0a0708', 79);
  }

  /* ═══════════════════════════════════════════════════════════════
     ELAH — a giant on the far ridge
     ═══════════════════════════════════════════════════════════════ */
  function elah(ctx, w, h, hy, p, m, t) {
    stars(ctx, w, h, 50, 57, 0.42);
    glow(ctx, w * 0.22, hy * 0.96, w * 0.5, '#b9cbb0', 0.1);

    ridge(ctx, w, hy - h * 0.016, h * 0.075, 13, '#32443f', 0.78, 0.6);
    ridge(ctx, w, hy + h * 0.018, h * 0.04, 21, '#22302f', 0.9, 0.7);
    haze(ctx, w, h, hy, '#9fb59c', 0.11);

    const farY = h * FAR_Y;
    const vg = ctx.createLinearGradient(0, hy, 0, farY);
    vg.addColorStop(0, '#35423f');
    vg.addColorStop(1, '#1c2425');
    ctx.fillStyle = vg;
    ctx.fillRect(0, hy, w, farY - hy);

    const fall = easeInOut(clamp(m * 1.6, 0, 1));
    const scale = 0.9 + easeOut(clamp(p * 1.25, 0, 1)) * 0.5;
    const gx = w * AXIS_X;
    const gy = h * FAR_Y - h * 0.015;
    const gh = h * 0.30 * scale;

    ctx.save();
    ctx.translate(gx, gy);
    // collapse in place: sink and squash rather than swinging off the frame
    ctx.rotate(fall * 0.16);
    ctx.scale(1 + fall * 0.1, 1 - fall * 0.72);

    // spear, planted in the ground
    ctx.strokeStyle = 'rgba(138,128,106,.95)';
    ctx.lineWidth = Math.max(1.8, gh * 0.035);
    ctx.beginPath();
    ctx.moveTo(gh * 0.26, -gh * 1.06);
    ctx.lineTo(gh * 0.4, gh * 0.05);
    ctx.stroke();
    // spear head
    ctx.fillStyle = 'rgba(168,158,132,.95)';
    ctx.beginPath();
    ctx.moveTo(gh * 0.26, -gh * 1.16);
    ctx.lineTo(gh * 0.2, -gh * 1.0);
    ctx.lineTo(gh * 0.32, -gh * 1.0);
    ctx.closePath();
    ctx.fill();

    // legs
    ctx.strokeStyle = '#2f343b';
    ctx.lineWidth = gh * 0.075;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-gh * 0.055, -gh * 0.3);
    ctx.lineTo(-gh * 0.08, 0);
    ctx.moveTo(gh * 0.045, -gh * 0.3);
    ctx.lineTo(gh * 0.07, 0);
    ctx.stroke();

    // tunic
    const bg = ctx.createLinearGradient(0, -gh * 0.78, 0, -gh * 0.2);
    bg.addColorStop(0, '#4e555e');
    bg.addColorStop(1, '#282d34');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-gh * 0.1, -gh * 0.74);
    ctx.quadraticCurveTo(0, -gh * 0.82, gh * 0.1, -gh * 0.74);
    ctx.lineTo(gh * 0.115, -gh * 0.26);
    ctx.lineTo(-gh * 0.115, -gh * 0.26);
    ctx.closePath();
    ctx.fill();

    // shield on the near arm
    ctx.fillStyle = '#6d5a3c';
    ctx.beginPath();
    ctx.ellipse(-gh * 0.12, -gh * 0.5, gh * 0.075, gh * 0.2, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(196,178,138,.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // shoulders and arms
    ctx.strokeStyle = '#3b414a';
    ctx.lineWidth = gh * 0.055;
    ctx.beginPath();
    ctx.moveTo(-gh * 0.09, -gh * 0.7);
    ctx.lineTo(-gh * 0.11, -gh * 0.48);
    ctx.moveTo(gh * 0.09, -gh * 0.7);
    ctx.lineTo(gh * 0.2, -gh * 0.56);
    ctx.stroke();

    // neck and head
    ctx.strokeStyle = '#4a4f57';
    ctx.lineWidth = gh * 0.04;
    ctx.beginPath();
    ctx.moveTo(0, -gh * 0.8);
    ctx.lineTo(0, -gh * 0.86);
    ctx.stroke();
    ctx.fillStyle = '#454a52';
    ctx.beginPath();
    ctx.arc(0, -gh * 0.92, gh * 0.072, 0, Math.PI * 2);
    ctx.fill();

    // bronze helmet with a crest
    ctx.fillStyle = '#7a6038';
    ctx.beginPath();
    ctx.arc(0, -gh * 0.94, gh * 0.082, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-gh * 0.082, -gh * 0.95, gh * 0.164, gh * 0.045);
    ctx.fillStyle = '#9a7c46';
    ctx.beginPath();
    ctx.ellipse(0, -gh * 1.03, gh * 0.055, gh * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    midground(ctx, w, h, '#37494a', 0.7, 223);
    bank(ctx, w, h, '#2e3738', '#151b1c', '#d9a94e');
    foreground(ctx, w, h, '#0a0f10', 83);

    const r = rng(91);
    ctx.lineCap = 'round';
    for (let i = 0; i < 44; i++) {
      const x = r() * w;
      const y = h * (FAR_Y + 0.03) + r() * h * (1 - FAR_Y - 0.06);
      const bh = 4 + r() * 10;
      ctx.strokeStyle = 'rgba(128,146,114,.28)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 2, y - bh * 0.62, x + 3.5 + r() * 3, y - bh);
      ctx.stroke();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CARMEL — fire on the altar
     ═══════════════════════════════════════════════════════════════ */
  function carmel(ctx, w, h, hy, p, m, t) {
    stars(ctx, w, h, 58, 63, 0.5);
    glow(ctx, w * AXIS_X, hy, w * 0.7, '#e8863c', 0.06 + m * 0.22);

    ridge(ctx, w, hy - h * 0.01, h * 0.07, 17, '#36261c', 0.9, 0.65);
    ridge(ctx, w, hy + h * 0.02, h * 0.035, 29, '#281c14', 0.96, 0.75);
    haze(ctx, w, h, hy, '#d98a4a', 0.14);

    const farY = h * FAR_Y;
    const vg = ctx.createLinearGradient(0, hy, 0, farY);
    vg.addColorStop(0, '#36271d');
    vg.addColorStop(1, '#1d1611');
    ctx.fillStyle = vg;
    ctx.fillRect(0, hy, w, farY - hy);

    const scale = 0.55 + easeOut(clamp(p * 1.25, 0, 1)) * 0.65;
    const ax = w * AXIS_X;
    const ay = farY - h * 0.008;
    const aw = Math.min(w, h) * 0.2 * scale;
    const ah = h * 0.085 * scale;

    ctx.fillStyle = '#2b2118';
    ctx.fillRect(ax - aw * 0.82, ay - ah * 0.05, aw * 1.64, ah * 0.14);

    for (let i = 0; i < 3; i++) {
      const sw = aw * (1 - i * 0.19);
      const sh = ah * 0.32;
      const sg = ctx.createLinearGradient(0, ay - sh * (i + 1), 0, ay - sh * i);
      sg.addColorStop(0, '#755b45');
      sg.addColorStop(1, '#4c3a2a');
      ctx.fillStyle = sg;
      ctx.fillRect(ax - sw / 2, ay - sh * (i + 1) - ah * 0.05, sw, sh);
    }

    ctx.fillStyle = '#4a3a2c';
    ctx.fillRect(ax - aw * 0.95, ay - ah * 0.16, aw * 1.9, ah * 0.16);

    if (m > 0.02) {
      const f = clamp(m * 1.5, 0, 1);
      glow(ctx, ax, ay - ah * 0.7, aw * 1.7, '#ffae4a', 0.48 * f);
      const r = rng(101);
      for (let i = 0; i < 26; i++) {
        const fx = ax + (r() - 0.5) * aw * 0.9;
        const fh = (h * 0.045 + r() * h * 0.14) * f;
        const flick = 0.62 + Math.sin(t * 7.4 + i * 1.8) * 0.38;
        const base = ay - ah * 0.42;
        const tip = base - fh * flick;
        const fg = ctx.createLinearGradient(fx, base, fx, tip);
        fg.addColorStop(0, 'rgba(255,220,140,.9)');
        fg.addColorStop(0.45, 'rgba(246,140,52,.62)');
        fg.addColorStop(1, 'rgba(180,68,26,0)');
        ctx.fillStyle = fg;
        const fw = aw * 0.055;
        ctx.beginPath();
        ctx.moveTo(fx - fw, base);
        ctx.quadraticCurveTo(fx - fw * 0.3, base - (base - tip) * 0.55, fx, tip);
        ctx.quadraticCurveTo(fx + fw * 0.3, base - (base - tip) * 0.55, fx + fw, base);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,222,152,.85)';
      for (let i = 0; i < 22; i++) {
        const sx = ax + (r() - 0.5) * aw * 1.6;
        const sy = ay - ah * 0.6 - ((t * 62 + r() * 240) % (h * 0.32)) * f;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    }

    midground(ctx, w, h, '#3d2c1e', 0.72, 227);
    bank(ctx, w, h, '#30251c', '#17110d', '#d9a94e');
    foreground(ctx, w, h, '#0b0806', 97);
  }

  /* ═══════════════════════════════════════════════════════════════
     NINEVEH — the ship, then the city on the far bank
     ═══════════════════════════════════════════════════════════════ */
  function nineveh(ctx, w, h, hy, p, m, t) {
    stars(ctx, w, h, 54, 83, 0.46);
    glow(ctx, w * 0.2, hy * 0.42, w * 0.3, '#8ec0d0', 0.1);

    const farY = h * FAR_Y;

    const cityA = clamp(m * 1.35, 0, 1);
    if (cityA > 0.02) {
      ctx.globalAlpha = cityA;
      const r = rng(131);
      const bx = w * 0.86;
      const by = hy + h * 0.01;
      for (let i = 0; i < 14; i++) {
        const bw = w * (0.016 + r() * 0.028);
        const bh = h * (0.022 + r() * 0.06);
        const bg = ctx.createLinearGradient(0, by - bh, 0, by);
        bg.addColorStop(0, '#506472');
        bg.addColorStop(1, '#2b3943');
        ctx.fillStyle = bg;
        ctx.fillRect(bx + (r() - 0.5) * w * 0.26, by - bh, bw, bh);
      }
      ctx.globalAlpha = 1;
    }

    ridge(ctx, w, hy + h * 0.008, h * 0.028, 71, '#1e2e38', 0.9, 0.7);
    haze(ctx, w, h, hy, '#7fb2c6', 0.14);

    const seaTop = hy + h * 0.018;
    const sg = ctx.createLinearGradient(0, seaTop, 0, farY);
    sg.addColorStop(0, '#285666');
    sg.addColorStop(0.5, '#1b3d4a');
    sg.addColorStop(1, '#102631');
    ctx.fillStyle = sg;
    ctx.fillRect(0, seaTop, w, farY - seaTop);

    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const k = (i + 1) / 12;
      const yy = seaTop + (farY - seaTop) * Math.pow(k, 1.7);
      ctx.strokeStyle = 'rgba(128,184,206,' + (0.2 * (0.32 + k)) + ')';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const y = yy + Math.sin(x * 0.06 + t * 1.15 + i * 0.8) * (0.6 + k * 2.2);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const scale = 0.55 + easeOut(clamp(p * 1.3, 0, 1)) * 0.65;
    const sx = w * lerp(0.52, 0.70, easeOut(clamp(p, 0, 1)));
    const sy = farY - h * 0.05;
    const sw = Math.min(w, h) * 0.28 * scale;

    ctx.fillStyle = '#3d2c1e';
    ctx.beginPath();
    ctx.moveTo(sx - sw / 2, sy);
    ctx.quadraticCurveTo(sx, sy + sw * 0.22, sx + sw / 2, sy);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#6f5438';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, sy - sw * 0.62);
    ctx.stroke();

    const billow = Math.sin(t * 1.5) * sw * 0.04;
    ctx.fillStyle = 'rgba(216,206,180,.76)';
    ctx.beginPath();
    ctx.moveTo(sx, sy - sw * 0.6);
    ctx.quadraticCurveTo(sx + sw * 0.34 + billow, sy - sw * 0.36, sx + sw * 0.03, sy - sw * 0.05);
    ctx.closePath();
    ctx.fill();

    bank(ctx, w, h, '#1e2c33', '#0b1418', '#d9a94e');
    foreground(ctx, w, h, '#070d10', 107);
  }

  /* ═══════════════════════════════════════════════════════════════
     DEN — the sealed stone rolls away
     ═══════════════════════════════════════════════════════════════ */
  function den(ctx, w, h, hy, p, m, t) {
    stars(ctx, w, h, 88, 151, 0.78);
    glow(ctx, w * AXIS_X, hy * 0.82, w * 0.8, '#b0a0d8', 0.04 + m * 0.15);

    ridge(ctx, w, hy - h * 0.002, h * 0.05, 33, '#2a2238', 0.92, 0.6);
    ridge(ctx, w, hy + h * 0.022, h * 0.03, 47, '#1d1928', 0.97, 0.7);
    haze(ctx, w, h, hy, '#8a7eb8', 0.11);

    const farY = h * FAR_Y;
    const vg = ctx.createLinearGradient(0, hy, 0, farY);
    vg.addColorStop(0, '#231d30');
    vg.addColorStop(1, '#141020');
    ctx.fillStyle = vg;
    ctx.fillRect(0, hy, w, farY - hy);

    const scale = 0.55 + easeOut(clamp(p * 1.25, 0, 1)) * 0.65;
    const dx = w * AXIS_X;
    const dy = farY - h * 0.006;
    const dw = Math.min(w, h) * 0.26 * scale;
    const dh = h * 0.115 * scale;
    const rolled = easeInOut(clamp(m * 1.45, 0, 1));

    ctx.fillStyle = '#2c2440';
    ctx.beginPath();
    ctx.ellipse(dx, dy - dh * 0.3, dw * 1.45, dh * 1.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    const og = ctx.createRadialGradient(dx, dy, 0, dx, dy, dw * 0.9);
    og.addColorStop(0, '#030207');
    og.addColorStop(0.68, 'rgba(10,8,18,.92)');
    og.addColorStop(1, 'rgba(10,8,18,0)');
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.ellipse(dx, dy, dw * 0.84, dh * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(92,82,122,.42)';
    ctx.lineWidth = Math.max(3, dh * 0.12);
    ctx.beginPath();
    ctx.ellipse(dx, dy, dw * 0.9, dh * 1.02, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    if (rolled > 0.12) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(dx, dy, dx - w * 0.6, dy);
      lg.addColorStop(0, 'rgba(200,188,248,' + (0.34 * rolled) + ')');
      lg.addColorStop(1, 'rgba(200,188,248,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(dx - dw * 0.5, dy - dh * 0.36);
      ctx.lineTo(dx - w * 0.6, dy - dh * 2);
      ctx.lineTo(dx - w * 0.6, dy + dh * 2);
      ctx.lineTo(dx - dw * 0.5, dy + dh * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (rolled < 0.65) {
      const a = (1 - rolled / 0.65) * (0.42 + Math.sin(t * 2.1) * 0.12);
      ctx.fillStyle = 'rgba(234,194,98,' + a + ')';
      [-1, 1].forEach(function (s) {
        ctx.beginPath();
        ctx.arc(dx + s * dw * 0.2, dy + dh * 0.02, Math.max(1, dw * 0.024), 0, Math.PI * 2);
        ctx.fill();
      });
    }

    const stoneX = dx + dw * 0.8 + dw * 1.6 * rolled;
    const stoneY = dy + dh * 0.12;
    ctx.save();
    ctx.translate(stoneX, stoneY);
    ctx.rotate(rolled * 0.9);
    const sg = ctx.createRadialGradient(-dw * 0.1, -dh * 0.1, 0, 0, 0, dw * 0.62);
    sg.addColorStop(0, '#4d4566');
    sg.addColorStop(1, '#29233a');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, 0, dw * 0.58, dh * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(144,132,180,.32)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    midground(ctx, w, h, '#2a2338', 0.7, 229);
    bank(ctx, w, h, '#201b2c', '#0d0a14', '#d9a94e');
    foreground(ctx, w, h, '#06040a', 113);
  }

  /* ═══════════════════════════════════════════════════════════════
     JORDAN — the heavens open, the dove descends
     ═══════════════════════════════════════════════════════════════ */
  function jordan(ctx, w, h, hy, p, m, t) {
    stars(ctx, w, h, 80, 173, 0.58);

    const open = clamp(m * 1.25, 0, 1);
    glow(ctx, w * AXIS_X, hy * 0.62, w * 0.85, '#f4e1b4', 0.05 + open * 0.3);

    if (open > 0.04) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const x0 = w * AXIS_X + (i - 4) * w * 0.028;
        const spread = (i - 4) * w * 0.05;
        const lg = ctx.createLinearGradient(x0, 0, x0 + spread, hy * 1.15);
        lg.addColorStop(0, 'rgba(255,244,208,' + (0.24 * open) + ')');
        lg.addColorStop(1, 'rgba(255,244,208,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(x0 - w * 0.012, 0);
        ctx.lineTo(x0 + w * 0.012, 0);
        ctx.lineTo(x0 + spread + w * 0.05, hy * 1.15);
        ctx.lineTo(x0 + spread - w * 0.05, hy * 1.15);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    ridge(ctx, w, hy - h * 0.004, h * 0.038, 61, '#222e3a', 0.9, 0.7);
    haze(ctx, w, h, hy, '#bcd0dc', 0.14);

    const farY = h * FAR_Y;
    const rTop = hy + h * 0.01;
    const rg = ctx.createLinearGradient(0, rTop, 0, farY);
    rg.addColorStop(0, '#33505f');
    rg.addColorStop(0.5, '#24414f');
    rg.addColorStop(1, '#16303a');
    ctx.fillStyle = rg;
    ctx.fillRect(0, rTop, w, farY - rTop);

    const lg2 = ctx.createLinearGradient(0, rTop, 0, farY);
    lg2.addColorStop(0, 'rgba(244,225,180,' + (0.16 + open * 0.2) + ')');
    lg2.addColorStop(1, 'rgba(244,225,180,0)');
    ctx.fillStyle = lg2;
    ctx.beginPath();
    ctx.moveTo(w * AXIS_X - w * 0.04, rTop);
    ctx.lineTo(w * AXIS_X + w * 0.04, rTop);
    ctx.lineTo(w * AXIS_X + w * 0.15, farY);
    ctx.lineTo(w * AXIS_X - w * 0.15, farY);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 1;
    for (let i = 0; i < 11; i++) {
      const k = (i + 1) / 11;
      const yy = rTop + (farY - rTop) * Math.pow(k, 1.5);
      ctx.strokeStyle = 'rgba(178,206,220,' + (0.15 * (0.4 + k)) + ')';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 20) {
        const y = yy + Math.sin(x * 0.055 + t * 1.05 + i * 0.7) * (0.6 + k * 1.8);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (open > 0.08) {
      const dy = lerp(hy * 0.55, hy + h * 0.06, easeOut(open));
      const dx = w * AXIS_X + Math.sin(t * 0.85) * w * 0.022;
      const s = Math.min(w, h) * 0.026;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.globalAlpha = 0.55 + open * 0.45;
      glow(ctx, 0, 0, s * 3.4, '#fff4d8', 0.3);
      ctx.fillStyle = '#fbf7ec';
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.54, 0, 0, Math.PI * 2);
      ctx.fill();
      const flap = Math.sin(t * 4.2) * 0.34;
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.42, -s * 0.26 - flap * s * 0.4, s * 0.6, s * 0.23, side * 0.52, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    bank(ctx, w, h, '#243139', '#0f171b', '#d9a94e');
    foreground(ctx, w, h, '#070c0f', 131);

    const r = rng(191);
    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side < 0 ? r() * w * 0.15 : w - r() * w * 0.15;
      const y = h * (FAR_Y + 0.02) + r() * h * (1 - FAR_Y - 0.05);
      const bh = h * (0.032 + r() * 0.055);
      const sway = Math.sin(t * 1.3 + i) * 5;
      ctx.strokeStyle = 'rgba(112,124,84,.38)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway * 0.55, y - bh * 0.6, x + sway, y - bh);
      ctx.stroke();
    }
  }

  const DRAW = {
    'red-sea': redSea,
    'ark': ark,
    'jericho': jericho,
    'elah': elah,
    'carmel': carmel,
    'nineveh': nineveh,
    'den': den,
    'jordan': jordan,
  };

  function sky(ctx, w, h, stage) {
    const hy = h * HORIZON;
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, stage.palette.sky[0]);
    g.addColorStop(1, stage.palette.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hy + 2);
  }

  return {
    rng: rng,
    lerp: lerp,
    clamp: clamp,
    easeOut: easeOut,
    easeInOut: easeInOut,
    HORIZON: HORIZON,
    FAR_Y: FAR_Y,
    GROUND: GROUND,
    PILGRIM_X: PILGRIM_X,
    GATE_X: GATE_X,
    AXIS_X: AXIS_X,
    draw: function (ctx, w, h, stage, progress, miracle, time) {
      const hy = h * HORIZON;
      sky(ctx, w, h, stage);
      const fn = DRAW[stage.scene] || redSea;
      fn(ctx, w, h, hy, progress, miracle, time);

      // Unify sky and land across the horizon: a soft band of the sky colour
      // laid over the seam, so the two never meet at a hard edge.
      const blend = ctx.createLinearGradient(0, hy - h * 0.09, 0, hy + h * 0.09);
      blend.addColorStop(0, rgba(stage.palette.sky[1], 0.0));
      blend.addColorStop(0.45, rgba(stage.palette.sky[1], 0.32));
      blend.addColorStop(0.62, rgba(stage.palette.sky[1], 0.22));
      blend.addColorStop(1, rgba(stage.palette.sky[1], 0.0));
      ctx.fillStyle = blend;
      ctx.fillRect(0, hy - h * 0.09, w, h * 0.18);
      return hy;
    },
  };
})();
