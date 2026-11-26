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
  // iOS and Android only allow speech that follows a real tap. The first
  // utterance has to be spent inside a gesture, so a question that opens on its
  // own a second later can still be read out.
  let primed = false;

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

  /* Spend the browser's one guaranteed utterance inside a user gesture. Silent,
     because the player should not hear anything yet; it only unlocks the engine. */
  function prime() {
    if (!supported || primed) return;
    primed = true;
    try {
      const u = new window.SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.rate = 1;
      synth.speak(u);
    } catch (e) { /* nothing to unlock */ }
  }

  function stop() {
    if (!supported) return;
    try { synth.cancel(); } catch (e) { /* nothing speaking */ }
  }

  function utterance(text, o, onFail) {
    const u = new window.SpeechSynthesisUtterance(text);
    // A stale or unselectable voice throws here on some Android builds, and an
    // exception at this point used to kill the whole utterance. Fall back to the
    // engine's default voice instead of going silent.
    if (voice) {
      try { u.voice = voice; } catch (e) { voice = null; }
    }
    u.lang = (voice && voice.lang) || 'en-GB';
    u.rate = o.rate || 0.92;      // unhurried, like a reader at a lectern
    u.pitch = o.pitch || 0.98;
    u.volume = o.volume == null ? 1 : o.volume;
    u.onstart = function () {
      if (o.onstart) o.onstart();
    };
    u.onend = function () {
      if (o.onend) o.onend();
    };
    u.onerror = function (ev) {
      // "interrupted"/"canceled" is us stopping it on purpose, not a failure.
      const err = ev && ev.error;
      if (err && err !== 'interrupted' && err !== 'canceled' && onFail) onFail();
      if (o.onerror) o.onerror(ev);
    };
    return u;
  }

  /* Some browsers drop the utterance when speak() follows cancel() in the same
     tick. Retrying on a timer would risk reading the question twice on a phone whose
     voice is merely slow to wake, and hearing it twice is worse than hearing it
     once — so the retry only happens on a real error event. The speaker button on
     the card is always there if a voice does go quiet. */
  function speak(text, opts) {
    if (!supported || !enabled || !text) return false;
    const o = opts || {};
    stop();
    let tries = 0;

    function attempt() {
      tries += 1;
      const u = utterance(text, o, () => {
        if (tries < 2) setTimeout(attempt, 140);
        else if (o.onerror) o.onerror();
      });
      try { synth.speak(u); } catch (e) { return false; }
      return true;
    }

    return attempt();
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
    prime,
    speaking,
    setEnabled,
    isEnabled,
    get voiceName() { return voice ? voice.name : ''; },
  };
})();
