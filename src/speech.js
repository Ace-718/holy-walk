/* ═══════════════════════════════════════════════════════════════════
   SPEECH — read the question, the answers and the scripture aloud.

   The Web Speech API is in every modern mobile browser, so this costs
   nothing to ship and needs no network. Voices load asynchronously, so the
   first call waits for them rather than silently doing nothing.
   ═══════════════════════════════════════════════════════════════════ */

const Speech = (function () {
  const synth = window.speechSynthesis || null;
  const supported = !!(synth && window.SpeechSynthesisUtterance);

  let voice = null;
  let enabled = true;
  let current = null;

  // A warmer narrator is a better fit than the default system voice. Prefer a
  // known-good English voice, then any English one.
  const PREFERRED = [
    'Google UK English Male', 'Google US English', 'Daniel', 'Arthur',
    'Microsoft Guy', 'Microsoft Ryan', 'Samantha', 'Karen', 'Moira',
  ];

  function pickVoice() {
    if (!supported) return;
    const voices = synth.getVoices() || [];
    if (!voices.length) return;
    const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang || ''));
    const pool = english.length ? english : voices;
    for (const name of PREFERRED) {
      const hit = pool.find((v) => (v.name || '').indexOf(name) >= 0);
      if (hit) { voice = hit; return; }
    }
    voice = pool.find((v) => v.localService) || pool[0];
  }

  if (supported) {
    pickVoice();
    synth.addEventListener('voiceschanged', pickVoice);
    // Safari populates the list a beat after load
    setTimeout(pickVoice, 600);
  }

  function stop() {
    if (!supported) return;
    try { synth.cancel(); } catch (e) { /* nothing speaking */ }
  }

  function speak(text, opts) {
    if (!supported || !enabled || !text) return false;
    const o = opts || {};
    stop();
    const u = new window.SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = (voice && voice.lang) || 'en-GB';
    u.rate = o.rate || 0.92;      // unhurried, like a reader at a lectern
    u.pitch = o.pitch || 0.98;
    u.volume = o.volume == null ? 1 : o.volume;
    if (o.onend) u.onend = o.onend;
    if (o.onstart) u.onstart = o.onstart;
    if (o.onerror) u.onerror = o.onerror;
    current = u;
    synth.speak(u);
    return true;
  }

  function speaking() {
    return !!(supported && synth.speaking);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!on) stop();
  }

  function isEnabled() { return enabled; }

  return {
    supported,
    speak,
    stop,
    speaking,
    setEnabled,
    isEnabled,
    get voiceName() { return voice ? voice.name : ''; },
  };
})();
