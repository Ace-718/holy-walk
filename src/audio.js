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

  /* ── Ambient bed: a slow, breathing drone tuned per scene ── */
  function bed(scene) {
    const c = ensure();
    if (!c) return;
    stopBed();

    const chords = {
      'red-sea': [NOTE.A2, NOTE.C3, NOTE.E3, NOTE.A3],
      'ark': [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.C4],
      'jericho': [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.D4],
      'elah': [NOTE.D3, NOTE.A3, NOTE.E4, NOTE.A4],
      'carmel': [NOTE.A2, NOTE.E3, NOTE.A3, NOTE.C4],
      'nineveh': [NOTE.C3, NOTE.G3, NOTE.D4, NOTE.E4],
      'den': [NOTE.A2, NOTE.D3, NOTE.E3, NOTE.A3],
      'jordan': [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.C5],
    };
    const notes = chords[scene] || chords['red-sea'];

    bedGain.gain.cancelScheduledValues(c.currentTime);
    bedGain.gain.setValueAtTime(0.0001, c.currentTime);
    bedGain.gain.linearRampToValueAtTime(0.075, c.currentTime + 2.4);

    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const filter = c.createBiquadFilter();

      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (i - 1.5) * 4;

      filter.type = 'lowpass';
      filter.frequency.value = 720;
      filter.Q.value = 0.6;

      g.gain.value = i === 0 ? 0.24 : 0.1;

      lfo.frequency.value = 0.055 + i * 0.021;
      lfoGain.gain.value = 0.055;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);

      osc.connect(filter);
      filter.connect(g);
      g.connect(bedGain);
      osc.start();
      lfo.start();
      bedNodes.push(osc, lfo);
    });
  }

  function stopBed() {
    if (!ctx) return;
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
