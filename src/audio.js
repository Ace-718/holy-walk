/* ═══════════════════════════════════════════════════════════════════
   AUDIO — everything synthesized with WebAudio, nothing to download.
   A soft drone bed per scene, footsteps, and a bell for right answers.
   ═══════════════════════════════════════════════════════════════════ */

const Audio = (function () {
  let ctx = null;
  let master = null;
  let bedGain = null;
  let enabled = true;
  let bedNodes = [];

  const NOTE = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, E5: 659.25 };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.85 : 0;
    master.connect(ctx.destination);
    bedGain = ctx.createGain();
    bedGain.gain.value = 0;
    bedGain.connect(master);
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function setEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05);
  }

  /* ── The score ─────────────────────────────────────────────────
     A slow heroic theme rather than a drone: a low string pad under a
     French-horn line that climbs, with a soft war drum underneath. All
     synthesized, so the app stays fully offline.
     ─────────────────────────────────────────────────────────────── */
  const SCORE = {
    // Each journey has its own horn line, written in scale degrees.
    'red-sea': { root: 146.83, horn: [0, 5, 7, 12, 7, 5], mode: [0, 2, 3, 5, 7, 8, 10] },
    ark:       { root: 130.81, horn: [0, 3, 7, 10, 7, 3], mode: [0, 2, 3, 5, 7, 8, 10] },
    jericho:   { root: 164.81, horn: [0, 4, 7, 12, 11, 7], mode: [0, 2, 4, 5, 7, 9, 11] },
    elah:      { root: 146.83, horn: [0, 7, 12, 16, 12, 7], mode: [0, 2, 4, 5, 7, 9, 11] },
    carmel:    { root: 130.81, horn: [0, 5, 8, 12, 8, 5], mode: [0, 2, 3, 5, 7, 8, 10] },
    nineveh:   { root: 155.56, horn: [0, 4, 7, 12, 9, 7], mode: [0, 2, 3, 5, 7, 9, 10] },
    den:       { root: 146.83, horn: [0, 3, 7, 8, 7, 3], mode: [0, 2, 3, 5, 7, 8, 10] },
    jordan:    { root: 130.81, horn: [0, 4, 7, 12, 7, 4], mode: [0, 2, 4, 5, 7, 9, 11] },
  };

  const BEAT = 0.92;          // a slow march
  const PHRASE = 8;            // beats per phrase
  let scoreTimer = null;
  let scoreScene = null;
  let nextPhraseAt = 0;
  let phraseIndex = 0;

  function degree(root, mode, step) {
    const oct = Math.floor(step / mode.length);
    const deg = mode[((step % mode.length) + mode.length) % mode.length];
    return root * Math.pow(2, oct) * Math.pow(2, deg / 12);
  }

  /* A horn: two detuned saws through a low-pass that opens as the note swells.
     Reads as brass at low level without shipping a single sample. */
  function horn(c, freq, at, dur, level, dest) {
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(420, at);
    lp.frequency.linearRampToValueAtTime(1500, at + dur * 0.30);
    lp.frequency.linearRampToValueAtTime(600, at + dur);

    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + Math.min(0.22, dur * 0.3));
    g.gain.setValueAtTime(level, at + dur * 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    [0, -6].forEach((cents) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = cents;
      osc.connect(lp);
      osc.start(at);
      osc.stop(at + dur + 0.04);
    });
    lp.connect(g);
    g.connect(dest);
  }

  /* A war drum: a pitched sine that falls away, plus a filtered noise skin. */
  function drum(c, at, level, dest) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.42);
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.62);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + 0.64);

    const len = Math.floor(c.sampleRate * 0.18);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 190;
    bp.Q.value = 0.8;
    const ng = c.createGain();
    ng.gain.value = level * 0.5;
    src.connect(bp); bp.connect(ng); ng.connect(dest);
    src.start(at);
  }

  /* One phrase: pad chord, then the horn line over it, with drums on the pulse. */
  function schedulePhrase(c, scene, at) {
    const cfg = SCORE[scene] || SCORE['red-sea'];
    const root = cfg.root;
    const lift = phraseIndex % 2 === 1;

    // Pad: root, fifth and octave, held across the whole phrase
    [0, 4, 7].forEach((step, i) => {
      const f = degree(root, cfg.mode, step + (lift ? 2 : 0)) / 2;
      const osc = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = f;
      osc.detune.value = (i - 1) * 5;
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.10 : 0.055, at + 1.6);
      g.gain.setValueAtTime(i === 0 ? 0.10 : 0.055, at + PHRASE * BEAT - 1.4);
      g.gain.linearRampToValueAtTime(0.0001, at + PHRASE * BEAT);
      osc.connect(lp); lp.connect(g); g.connect(bedGain);
      osc.start(at);
      osc.stop(at + PHRASE * BEAT + 0.05);
    });

    // The horn line: each note a beat and a half, so the phrase breathes.
    const line = cfg.horn;
    line.forEach((step, i) => {
      const t = at + i * BEAT * 1.18;
      const f = degree(root, cfg.mode, step + (lift ? 2 : 0));
      horn(c, f, t, BEAT * 1.5, i === 0 ? 0.085 : 0.062, bedGain);
    });

    // Drums mark the pulse, lightly, like a procession in the distance.
    for (let i = 0; i < PHRASE; i += 2) {
      drum(c, at + i * BEAT, i === 0 ? 0.16 : 0.075, bedGain);
    }
  }

  /* Schedule phrases a little ahead of the clock, then let a timer top it up. */
  function pumpScore() {
    if (!ctx || !enabled || !scoreScene) return;
    const horizon = ctx.currentTime + 2.5;
    while (nextPhraseAt < horizon) {
      schedulePhrase(ctx, scoreScene, nextPhraseAt);
      nextPhraseAt += PHRASE * BEAT;
      phraseIndex += 1;
    }
  }

  function bed(scene) {
    const c = ensure();
    if (!c) return;
    const sameScene = scoreScene === scene && scoreTimer;
    scoreScene = scene;
    if (sameScene) return;

    stopBed();
    bedGain.gain.cancelScheduledValues(c.currentTime);
    bedGain.gain.setValueAtTime(0.0001, c.currentTime);
    bedGain.gain.linearRampToValueAtTime(0.62, c.currentTime + 3.2);

    phraseIndex = 0;
    nextPhraseAt = c.currentTime + 0.35;
    pumpScore();

    clearInterval(scoreTimer);
    scoreTimer = setInterval(pumpScore, 700);
  }

  function stopBed() {
    if (!ctx) return;
    clearInterval(scoreTimer);
    scoreTimer = null;
    scoreScene = null;
    bedGain.gain.cancelScheduledValues(ctx.currentTime);
    bedGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    const nodes = bedNodes;
    bedNodes = [];
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch (e) { /* already stopped */ } }), 900);
  }

  /* ── Footstep: filtered noise burst ── */
  function step() {
    const c = ensure();
    if (!c || !enabled) return;
    const dur = 0.11;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620 + Math.random() * 260;
    bp.Q.value = 1.1;
    const g = c.createGain();
    g.gain.value = 0.05;
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start();
  }

  /* ── Bell for a correct answer: two struck tones a fifth apart ── */
  function chime() {
    const c = ensure();
    if (!c || !enabled) return;
    [[NOTE.C5, 0], [NOTE.G4, 0.1], [NOTE.E5, 0.22]].forEach(([f, delay]) => {
      const t = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 1.6);
    });
  }

  /* ── Low thud for a wrong answer ── */
  function thud() {
    const c = ensure();
    if (!c || !enabled) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(132, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(58, c.currentTime + 0.28);
    g.gain.setValueAtTime(0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.34);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(c.currentTime + 0.36);
  }

  /* ── Rumble when the gate opens ── */
  function rumble() {
    const c = ensure();
    if (!c || !enabled) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, c.currentTime);
    lp.frequency.linearRampToValueAtTime(1100, c.currentTime + 0.9);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(42, c.currentTime);
    osc.frequency.linearRampToValueAtTime(88, c.currentTime + 1.1);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.linearRampToValueAtTime(0.11, c.currentTime + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.6);
    osc.connect(lp);
    lp.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(c.currentTime + 1.7);
  }

  return { resume, setEnabled, bed, stopBed, step, chime, thud, rumble };
})();
