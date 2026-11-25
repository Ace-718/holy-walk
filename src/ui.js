/* ═══════════════════════════════════════════════════════════════════
   UI — state machine, question flow, drawers, persistence.
   One rule holds the whole game together: you cannot walk past a gate
   you have not answered. Gates are checked on arrival, not on tap.
   ═══════════════════════════════════════════════════════════════════ */

const UI = (function () {
  const $ = (id) => document.getElementById(id);

  const SAVE_KEY = 'path-of-prophets-v1';

  const app = {
    stageIndex: 0,
    gateIndex: 0,          // which gate is currently in play
    solved: [],            // per-stage array of booleans
    streak: 0,
    steps: 0,
    sound: true,
    busy: false,           // true while a card is up or walking
    complete: false,
    lastSlot: -1,          // slot the right answer used last, so it can move
    // Set while a finished stage replays its arrival, so the completion card can
    // be held back until the walk into the landmark is actually done.
    awaitingArrival: false,
  };

  let bible = { tab: 'read', view: 'chapters', book: null, chapter: 1, highlight: 0 };

  /* ═══════════════════════════════════════════════════════════════
     Persistence
     ═══════════════════════════════════════════════════════════════ */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        stageIndex: app.stageIndex,
        solved: app.solved,
        streak: app.streak,
        steps: app.steps,
        sound: app.sound,
      }));
    } catch (e) { /* private mode, storage full — play on */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d.stageIndex === 'number') app.stageIndex = Scenes.clamp(d.stageIndex, 0, STAGES.length - 1);
      if (Array.isArray(d.solved)) app.solved = d.solved;
      if (typeof d.streak === 'number') app.streak = d.streak;
      if (typeof d.steps === 'number') app.steps = d.steps;
      if (typeof d.sound === 'boolean') app.sound = d.sound;
    } catch (e) { /* start fresh */ }
  }

  function solvedFor(i) {
    if (!app.solved) app.solved = STAGES.map(() => []);
    if (!app.solved[i]) app.solved[i] = [];
    return app.solved[i];
  }

  function stageDone(i) {
    const s = solvedFor(i);
    return STAGES[i].gates.every((_, g) => s[g]);
  }

  function firstStageUndone() {
    for (let i = 0; i < STAGES.length; i++) if (!stageDone(i)) return i;
    return 0;
  }

  /* ═══════════════════════════════════════════════════════════════
     Toast
     ═══════════════════════════════════════════════════════════════ */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ═══════════════════════════════════════════════════════════════
     HUD
     ═══════════════════════════════════════════════════════════════ */
  function paintHud() {
    const stage = STAGES[app.stageIndex];
    $('stage-num').textContent = stage.numeral;
    $('stage-name').textContent = stage.name;
    $('stage-sub').textContent = stage.place;
    appEl.dataset.stage = stage.id;

    // path track
    const nodes = $('track-nodes');
    nodes.innerHTML = '';
    STAGES.forEach((s, i) => {
      const n = document.createElement('div');
      n.className = 'track-node';
      if (stageDone(i)) n.classList.add('done');
      else if (i === app.stageIndex) n.classList.add('now');
      n.title = s.name;
      nodes.appendChild(n);
    });

    // The bar answers to the walk as well as to the answers: the current
    // journey fills as the pilgrim covers the road, so every tap moves it.
    const done = STAGES.filter((_, i) => stageDone(i)).length;
    const within = stageDone(app.stageIndex) ? 0 : Engine.progress;
    const pct = ((done + within) / STAGES.length) * 100;
    $('track-fill').style.width = Scenes.clamp(pct, 2, 100) + '%';
    $('track-pct').textContent = Math.round(pct) + '%';

    // streak
    $('streak-count').textContent = String(app.streak);
    $('streak').classList.toggle('hot', app.streak >= 3);

    // steps
    $('steps-count').textContent = String(app.steps);

    // sound
    $('sound-btn').setAttribute('aria-pressed', String(app.sound));
  }

  function caption(text, keep) {
    const c = $('caption');
    const t = $('caption-text');
    if (!text) {
      c.classList.add('gone');
      return;
    }
    t.innerHTML = text;
    c.classList.remove('gone');
    if (!keep) {
      clearTimeout(caption._t);
      caption._t = setTimeout(() => c.classList.add('gone'), 4200);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     Stage loading
     ═══════════════════════════════════════════════════════════════ */
  function enterStage(i, opts) {
    const options = opts || {};
    app.stageIndex = i;
    app.complete = false;
    app.busy = false;
    app.gateIndex = 0;
    app.awaitingArrival = false;

    const stage = STAGES[i];
    Engine.load(stage);
    Engine.pause(false);
    Audio.bed(stage.scene);

    // resume a stage that was partly solved
    const solved = solvedFor(i);
    let furthest = 0;
    solved.forEach((ok, g) => {
      if (ok) {
        Engine.passGate(g);
        furthest = Math.max(furthest, stage.gates[g].at);
      }
    });

    if (options.fresh) {
      app.solved[i] = [];
      Engine.reset();
      furthest = 0;
    } else if (furthest > 0) {
      Engine.walkTo(furthest);
    }

    paintHud();
    closeAll();
    hideCard('question');
    hideCard('complete');

    if (stageDone(i) && !options.replay) {
      // He is already at the landmark, not at the far end of the road, so put him
      // where the finale starts and let it carry him in. Walking to 1 first sent
      // him past the ark and then dragged him back to it.
      const fin = Scenes.finaleFor(stage.scene);
      app.awaitingArrival = !!fin;
      if (fin) {
        Engine.placeAt(Scenes.progressAtX(fin.x));
        Engine.miracle();
        setTimeout(() => Engine.beginFinale(), 700);
      } else {
        Engine.walkTo(1);
        Engine.miracle();
      }
      app.complete = true;
      caption('This journey is already walked. Tap Forward to walk it again.', true);
      if (!fin) setTimeout(() => showComplete(true), 2200);
    } else {
      caption(stage.intro);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     Forward
     ═══════════════════════════════════════════════════════════════ */
  function forwardTarget() {
    const stage = STAGES[app.stageIndex];
    const solved = solvedFor(app.stageIndex);
    for (let g = 0; g < stage.gates.length; g++) {
      if (!solved[g]) return { at: stage.gates[g].at, gate: g };
    }
    return { at: 1, gate: null };
  }

  function step() {
    if (app.busy || app.complete) return;
    // The finale walk is not steerable: he is already on his way in.
    if (Engine.finaleT > 0) return;
    const stage = STAGES[app.stageIndex];
    const { at, gate } = forwardTarget();

    // mid-stride: let the current one finish before taking another
    if (Engine.walking) return;

    if (Engine.progress >= at - 0.005) {
      // standing at the gate: open it
      if (gate != null) openQuestion(gate);
      else finishStage();
      return;
    }

    // one tap, one stride toward the gate
    Engine.stride(at);
    Audio.resume();

    // The approach line is about arriving at the obstacle, so it comes up as he
    // closes on the first gate, not on the very first tap.
    const firstGate = stage.gates[0];
    const near = Engine.progress >= firstGate.at - 0.30 && Engine.progress < firstGate.at - 0.005;
    if (near) caption(stage.approach);
  }

  /* ═══════════════════════════════════════════════════════════════
     Question card
     ═══════════════════════════════════════════════════════════════ */
  function showCard(which) {
    Speech.stop();
    clearSpeaking();
    $('question-overlay').hidden = which !== 'question';
    $('complete-overlay').hidden = which !== 'complete';
    // the card says everything the caption would, and the overlay dims it anyway
    $('caption').classList.toggle('gone', !!which);
    frameForCard(which);
  }

  function hideCard(which) {
    if (which === 'question') $('question-overlay').hidden = true;
    if (which === 'complete') $('complete-overlay').hidden = true;
    frameForCard(null);
  }

  /* A question sheet covers the lower half of the scene, right where the pilgrim
     stands. Ask the camera to lift by whatever the sheet actually occupies, so he
     stays in sight while he is being asked. */
  function frameForCard(which) {
    if (!which) { Engine.setLift(0); return; }
    const overlay = $(which + '-overlay');
    const card = overlay && overlay.querySelector('.card');
    if (!card) { Engine.setLift(0); return; }
    const stage = $('stage');
    const sceneRect = stage.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const covered = Math.max(0, sceneRect.bottom - cardRect.top);
    // leave a little headroom so his head is never on the card's edge
    Engine.setLift(Math.min(covered + 10, sceneRect.height * 0.55));
  }

  /* ═══════════════════════════════════════════════════════════════
     Option order

     The right answer is stored as an index into the authored list, which
     would otherwise always sit in the first slot. Shuffle the display order
     every time the card opens, and keep the answer out of the slot it used
     last, so tapping A out of habit never works twice running.
     ═══════════════════════════════════════════════════════════════ */
  function shuffleOptions(gate) {
    const n = gate.options.length;
    const order = gate.options.map(function (_, i) { return i; });

    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }

    // if the answer landed in the same slot as the previous question, move it
    if (n > 1 && order.indexOf(gate.correct) === app.lastSlot) {
      const from = order.indexOf(gate.correct);
      const to = (from + 1 + Math.floor(Math.random() * (n - 1))) % n;
      const t = order[to];
      order[to] = order[from];
      order[from] = t;
    }

    app.lastSlot = order.indexOf(gate.correct);
    return order;
  }

  const SPEAKER_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 010 7" />' +
    '</svg>';

  /* Read something aloud and light up the button that asked for it. One helper
     for every speaker on the card, so the playing state is always in step. */
  let speakingEl = null;

  function clearSpeaking() {
    if (speakingEl) speakingEl.classList.remove('playing');
    speakingEl = null;
  }

  function sayAloud(text, el) {
    if (!Speech.supported) {
      toast('This browser cannot read aloud.');
      return;
    }
    // tapping the speaker again stops it
    if (speakingEl === el && Speech.speaking()) {
      Speech.stop();
      clearSpeaking();
      return;
    }
    clearSpeaking();
    if (!text) return;
    speakingEl = el || null;
    if (el) el.classList.add('playing');
    Speech.speak(text, { onend: clearSpeaking, onerror: clearSpeaking });
  }

  function plainText(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* The whole question, read the way a reader would: reference, question,
     then each answer lettered in turn. */
  function narrationFor(gate, stage) {
    const letters = ['A', 'B', 'C', 'D'];
    const parts = [stage.ref + '. ' + gate.prompt];
    app.order.forEach((source, slot) => {
      parts.push(letters[slot] + '. ' + gate.options[source]);
    });
    return parts.join(' ');
  }

  function openQuestion(gateIndex) {
    const stage = STAGES[app.stageIndex];
    const gate = stage.gates[gateIndex];
    if (!gate) return;

    app.busy = true;
    app.gateIndex = gateIndex;
    Engine.pause(true);

    $('q-ref').textContent = stage.ref + ' · ' + gate.label;
    $('q-prompt').textContent = gate.prompt;

    const opts = $('q-options');
    opts.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];
    const order = shuffleOptions(gate);
    app.order = order;

    order.forEach((source, slot) => {
      const btn = document.createElement('button');
      btn.className = 'opt';
      btn.type = 'button';
      btn.dataset.pick = String(source);
      btn.style.animationDelay = (slot * 55) + 'ms';
      const key = document.createElement('span');
      key.className = 'opt-key';
      key.textContent = letters[slot];
      const label = document.createElement('span');
      label.className = 'opt-text';
      label.textContent = gate.options[source];

      // A speaker on the row itself: read just this answer, so a player can
      // hear the choices one at a time instead of the whole card.
      const say = document.createElement('span');
      say.className = 'hear-mini';
      say.setAttribute('role', 'button');
      say.setAttribute('tabindex', '0');
      say.setAttribute('aria-label', 'Read this answer aloud');
      say.innerHTML = SPEAKER_SVG;
      const speakOption = (e) => {
        e.stopPropagation();
        sayAloud(label.textContent, say);
      };
      say.addEventListener('click', speakOption);
      say.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); speakOption(e); }
      });

      btn.appendChild(key);
      btn.appendChild(label);
      btn.appendChild(say);
      btn.addEventListener('click', () => answer(source, gate, btn));
      opts.appendChild(btn);
    });

    $('q-feedback').hidden = true;
    $('q-feedback').className = 'feedback';
    $('q-foot').hidden = true;

    // the card-level speaker reads reference, question and every answer
    const hear = $('q-hear');
    hear.onclick = () => sayAloud(narrationFor(gate, stage), hear);

    showCard('question');
    $('q-prompt').scrollIntoView({ block: 'nearest' });
  }

  function answer(pick, gate, btn) {
    if (app.busy === 'resolved') return;

    const opts = $('q-options');
    const buttons = Array.from(opts.querySelectorAll('.opt'));

    if (pick === gate.correct) {
      app.busy = 'resolved';
      buttons.forEach((b) => {
        b.disabled = true;
        if (Number(b.dataset.pick) === gate.correct) b.classList.add('right');
        else b.classList.add('faded');
      });

      const firstTry = !btn.dataset.retried;
      if (firstTry) {
        app.streak += 1;
        app.steps += 0;
      }
      Audio.chime();
      haptic([12, 40, 18]);

      const fb = $('q-feedback');
      fb.className = 'feedback';
      fb.hidden = false;
      $('q-feedback-text').innerHTML =
        'The way opens. <em>' + gate.verse + '</em> — tap to read it in the Bible.';
      $('q-verse-btn').onclick = () => openVerse(gate.verse);

      const fbHear = $('q-feedback-hear');
      const fbWords = 'The way opens. ' + gate.verse + '.';
      fbHear.onclick = () => sayAloud(fbWords, fbHear);
      sayAloud(fbWords, fbHear);

      $('q-foot').hidden = false;
      $('q-next-btn').textContent = 'Walk on';
      $('q-next-btn').onclick = () => resolveGate(gate, app.gateIndex);
      $('q-retry-btn').hidden = true;

      paintHud();
      save();
    } else {
      btn.classList.add('wrong');
      btn.dataset.retried = '1';
      app.streak = 0;
      Audio.thud();
      haptic([18, 30, 18]);

      const fb = $('q-feedback');
      fb.className = 'feedback bad';
      fb.hidden = false;
      $('q-feedback-text').innerHTML = gate.wrong;
      $('q-verse-btn').onclick = () => openVerse(gate.verse);

      const fbHear = $('q-feedback-hear');
      const fbWords = plainText(gate.wrong);
      fbHear.onclick = () => sayAloud(fbWords, fbHear);

      paintHud();
      save();
    }
  }

  function resolveGate(gate, gateIndex) {
    hideCard('question');
    Engine.passGate(gateIndex);
    Engine.pause(false);
    Audio.rumble();
    haptic([10, 26, 10]);

    const solved = solvedFor(app.stageIndex);
    solved[gateIndex] = true;
    save();
    paintHud();

    const stage = STAGES[app.stageIndex];
    const allSolved = stage.gates.every((_, i) => solved[i]);

    // On the last gate the rest of the stage is a cutscene: lock the controls so
    // a tap cannot skip past the walk into the landmark.
    app.busy = allSolved;

    if (allSolved) {
      caption(stage.miracle, true);
      // The miracle opens the way first; when it has finished, onMiracleDone
      // sends him walking into it. Doing it in that order means he never walks
      // through water that is still parting or a wall that is still falling.
      setTimeout(() => Engine.miracle(), 420);
    } else {
      caption('The way is open. Walk on.');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     Completion
     ═══════════════════════════════════════════════════════════════ */
  function finishStage() {
    if (app.complete) return;
    app.complete = true;
    app.busy = true;
    Engine.pause(true);
    Audio.chime();
    haptic([14, 50, 14, 50, 24]);
    paintHud();
    save();
    setTimeout(() => showComplete(false), 700);
  }

  function showComplete(already) {
    const stage = STAGES[app.stageIndex];
    $('c-title').textContent = already ? 'Already walked' : stage.doneTitle;
    $('c-summary').textContent = stage.doneSummary;

    const verseText = VERSES[stage.doneVerse] || '';
    const q = $('c-verse');
    q.innerHTML = '';
    q.appendChild(document.createTextNode('“' + verseText + '”'));
    const cite = document.createElement('cite');
    cite.textContent = stage.doneVerse;
    q.appendChild(cite);

    const last = app.stageIndex === STAGES.length - 1;
    $('c-next-btn').textContent = last ? 'Walk the first again' : 'Next prophet';

    showCard('complete');
  }

  function nextStage() {
    hideCard('complete');
    Engine.pause(false);
    app.busy = false;
    app.complete = false;

    const last = app.stageIndex === STAGES.length - 1;
    const next = last ? firstStageUndone() : (app.stageIndex + 1) % STAGES.length;
    enterStage(next);
  }

  function replayStage() {
    hideCard('complete');
    Engine.pause(false);
    app.solved[app.stageIndex] = [];
    app.busy = false;
    app.complete = false;
    save();
    enterStage(app.stageIndex, { fresh: true });
    caption('Walking again from the start.');
  }

  /* ═══════════════════════════════════════════════════════════════
     Stages drawer
     ═══════════════════════════════════════════════════════════════ */
  function openStages() {
    const list = $('stages-list');
    list.innerHTML = '';

    STAGES.forEach((s, i) => {
      const row = document.createElement('button');
      row.className = 'stage-row';
      if (i === app.stageIndex) row.classList.add('current');
      if (stageDone(i)) row.classList.add('done');

      const seal = document.createElement('span');
      seal.className = 'row-seal';
      seal.textContent = s.numeral;

      const body = document.createElement('span');
      body.className = 'row-body';
      const nm = document.createElement('span');
      nm.className = 'row-name';
      nm.textContent = s.name;
      const pl = document.createElement('span');
      pl.className = 'row-place';
      pl.textContent = s.place;
      const rf = document.createElement('span');
      rf.className = 'row-ref';
      rf.textContent = s.ref;
      body.appendChild(nm);
      body.appendChild(pl);
      body.appendChild(rf);

      row.appendChild(seal);
      row.appendChild(body);

      if (stageDone(i)) {
        const mark = document.createElement('span');
        mark.className = 'row-mark';
        mark.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
        row.appendChild(mark);
      }

      row.addEventListener('click', () => {
        closeSheet('stages-overlay');
        if (i !== app.stageIndex) enterStage(i);
      });

      list.appendChild(row);
    });

    openSheet('stages-overlay');
  }

  /* ═══════════════════════════════════════════════════════════════
     Bible drawer
     ═══════════════════════════════════════════════════════════════ */
  async function openBible(verseRef) {
    openSheet('bible-overlay');
    setTab('read');

    try {
      await Bible.loadIndex();
    } catch (e) {
      $('bible-read').innerHTML = '<p class="note">The Bible library could not be loaded.</p>';
      return;
    }

    if (verseRef) {
      // "Exodus 14:16" -> book "Exodus", chapter 14, verse 16
      const m = verseRef.match(/^(.+?)\s+(\d+):(\d+)$/);
      if (m) {
        const found = Bible.findBook(m[1]);
        if (found) {
          bible.book = found;
          bible.chapter = Number(m[2]);
          bible.highlight = Number(m[3]);
          bible.view = 'reading';
          renderBible();
          return;
        }
      }
    }

    bible.view = 'chapters';
    renderBible();
  }

  function setTab(tab) {
    bible.tab = tab;
    $('tab-read').classList.toggle('is-on', tab === 'read');
    $('tab-themes').classList.toggle('is-on', tab === 'themes');
    $('tab-read').setAttribute('aria-selected', String(tab === 'read'));
    $('tab-themes').setAttribute('aria-selected', String(tab === 'themes'));
    $('bible-read').hidden = tab !== 'read';
    $('bible-themes').hidden = tab !== 'themes';
    if (tab === 'themes') renderThemes();
  }

  async function renderBible() {
    const host = $('bible-read');
    if (bible.view === 'books') {
      Bible.renderBooks(host, async (b) => {
        bible.book = b;
        bible.view = 'chapters';
        // the index holds a chapter COUNT, so open the first chapter of the text
        try {
          const data = await Bible.loadBook(b.s);
          bible.chapter = Number(Object.keys(data.c).map(Number).sort((x, y) => x - y)[0]);
        } catch (e) {
          bible.chapter = 1;
        }
        renderBible();
      });
      return;
    }

    if (!bible.book) {
      bible.view = 'books';
      return renderBible();
    }

    // make sure the book text is loaded
    host.innerHTML = '<p class="note">Loading scripture…</p>';
    let data;
    try {
      data = await Bible.loadBook(bible.book.s);
    } catch (e) {
      host.innerHTML = '<p class="note">That book could not be loaded. Check your connection and try again.</p>';
      return;
    }

    if (bible.view === 'chapters') {
      Bible.current = { book: data.n, chapter: bible.chapter };
      Bible.renderChapters(host, data, (ch) => {
        bible.chapter = ch;
        bible.view = 'reading';
        renderBible();
      });
      return;
    }

    const hl = bible.highlight;
    bible.highlight = 0;
    Bible.current = { book: data.n, chapter: bible.chapter };
    const nav = Bible.renderPassage(host, data, bible.chapter, hl);

    nav.prev.addEventListener('click', () => {
      bible.chapter = nav.nums[nav.pos - 1];
      renderBible();
    });
    nav.next.addEventListener('click', () => {
      bible.chapter = nav.nums[nav.pos + 1];
      renderBible();
    });

    if (hl) {
      const target = host.querySelector('.verse.hit');
      if (target) setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    } else {
      host.scrollTop = 0;
    }

    // a way back out to the book list
    const back = document.createElement('button');
    back.className = 'link-btn';
    back.style.marginTop = '12px';
    back.textContent = '‹ All books';
    back.addEventListener('click', () => {
      bible.view = 'books';
      renderBible();
    });
    host.appendChild(back);
  }

  const THEME_ICONS = {
    rest: '<svg viewBox="0 0 24 24"><path d="M12 3v18M8 8h8"/><circle cx="12" cy="17" r="2"/></svg>',
    temple: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M6 17h11a4 4 0 000-8 6 6 0 00-11.6 1.8A3.2 3.2 0 006 17z"/></svg>',
    angel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><path d="M12 10v11M7 21l5-6 5 6M6 8l-2-4M18 8l2-4"/></svg>',
    sword: '<svg viewBox="0 0 24 24"><path d="M18 3l3 3-9 9-3-3zM9 15l-5 5M6 12l6 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.4A4 4 0 0112 8a4 4 0 017 2.6C19 15.4 12 20 12 20z"/></svg>',
    scroll: '<svg viewBox="0 0 24 24"><path d="M6 4h11a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M8 9h7M8 13h7"/></svg>',
    water: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.4 6 10.4A6 6 0 016 13.4C6 9.4 12 3 12 3z"/></svg>',
  };

  function renderThemes() {
    const host = $('bible-themes');
    host.innerHTML = '';

    const intro = document.createElement('p');
    intro.className = 'note';
    intro.style.margin = '0 0 12px';
    intro.style.paddingTop = '0';
    intro.style.borderTop = '0';
    intro.textContent = 'Short summaries of themes Seventh-day Adventists read through the whole Bible. Every reference opens the King James text.';
    host.appendChild(intro);

    THEMES.forEach((theme) => {
      const d = document.createElement('details');
      d.className = 'theme';

      const sum = document.createElement('summary');
      const icon = document.createElement('span');
      icon.innerHTML = THEME_ICONS[theme.icon] || THEME_ICONS.scroll;
      icon.style.display = 'contents';
      sum.appendChild(icon);
      sum.appendChild(document.createTextNode(theme.title));
      d.appendChild(sum);

      const body = document.createElement('div');
      body.className = 'theme-body';
      theme.body.forEach((para) => {
        const p = document.createElement('p');
        p.textContent = para;
        body.appendChild(p);
      });

      const refs = document.createElement('div');
      refs.className = 'refs';
      theme.refs.forEach((ref) => {
        const chip = document.createElement('button');
        chip.className = 'ref-chip';
        chip.textContent = ref;
        chip.addEventListener('click', () => openVerse(ref));
        refs.appendChild(chip);
      });
      body.appendChild(refs);
      d.appendChild(body);

      host.appendChild(d);
    });

    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Scripture quoted is the King James Version. Theme summaries are original writing, not quotations from any church publication.';
    host.appendChild(note);
  }

  function openVerse(ref) {
    closeSheet('bible-overlay');
    // reopen straight into the passage
    bible = { tab: 'read', view: 'reading', book: null, chapter: 1, highlight: 0 };
    openBible(ref);
  }

  /* ═══════════════════════════════════════════════════════════════
     Sheets
     ═══════════════════════════════════════════════════════════════ */
  function openSheet(id) {
    $(id).hidden = false;
    Engine.pause(true);
  }

  function closeSheet(id) {
    $(id).hidden = true;
    if ($('question-overlay').hidden && $('complete-overlay').hidden) {
      Engine.pause(false);
    }
  }

  function closeAll() {
    ['stages-overlay', 'bible-overlay'].forEach((id) => { $(id).hidden = true; });
  }

  /* ═══════════════════════════════════════════════════════════════
     Wiring
     ═══════════════════════════════════════════════════════════════ */
  let appEl = null;

  function haptic(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* not supported */ }
    }
  }

  function bind() {
    $('forward-btn').addEventListener('click', step);

    // hold-to-walk: repeated steps while the button is held
    const fwd = $('forward-btn');
    let holdTimer = 0;
    let holdInterval = 0;
    const startHold = () => {
      fwd.classList.add('is-down');
      holdTimer = setTimeout(() => {
        holdInterval = setInterval(step, 340);
      }, 460);
    };
    const endHold = () => {
      fwd.classList.remove('is-down');
      clearTimeout(holdTimer);
      clearInterval(holdInterval);
    };
    fwd.addEventListener('pointerdown', startHold);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => fwd.addEventListener(ev, endHold));

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === ' ') {
        const anyOpen = !$('question-overlay').hidden || !$('complete-overlay').hidden;
        if (anyOpen) return;
        e.preventDefault();
        step();
      }
      if (e.key === 'Escape') closeAll();
    });

    $('stage-btn').addEventListener('click', openStages);
    $('stages-close').addEventListener('click', () => closeSheet('stages-overlay'));
    $('stages-overlay').addEventListener('click', (e) => {
      if (e.target === $('stages-overlay')) closeSheet('stages-overlay');
    });

    $('bible-btn').addEventListener('click', () => openBible());
    $('bible-close').addEventListener('click', () => closeSheet('bible-overlay'));
    $('bible-overlay').addEventListener('click', (e) => {
      if (e.target === $('bible-overlay')) closeSheet('bible-overlay');
    });

    $('tab-read').addEventListener('click', () => setTab('read'));
    $('tab-themes').addEventListener('click', () => setTab('themes'));

    $('sound-btn').addEventListener('click', () => {
      app.sound = !app.sound;
      Audio.setEnabled(app.sound);
      if (app.sound) {
        Audio.resume();
        Audio.bed(STAGES[app.stageIndex].scene);
      } else {
        Audio.stopBed();
      }
      paintHud();
      save();
    });

    $('c-next-btn').addEventListener('click', nextStage);
    $('c-replay-btn').addEventListener('click', replayStage);

    // question card dismissal is not allowed by tapping the scrim:
    // the gate has to be answered.
    $('question-overlay').addEventListener('click', (e) => {
      if (e.target === $('question-overlay')) {
        toast('Answer the question to open the way.');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     Boot
     ═══════════════════════════════════════════════════════════════ */
  function start() {
    appEl = $('app');
    load();
    if (!app.solved) app.solved = STAGES.map(() => []);

    Audio.setEnabled(app.sound);

    Engine.init({
      onStep: () => {
        app.steps += 1;
        if (app.steps % 2 === 0) Audio.step();
        if (app.steps % 3 === 0) paintHud();
      },
      onArrive: (progress) => {
        const { gate } = forwardTarget();
        if (gate != null && Engine.progress >= STAGES[app.stageIndex].gates[gate].at - 0.006) {
          openQuestion(gate);
        }
      },
      onMiracleDone: () => {
        // The way is open. Now he walks into it. If a scene has no finale
        // geometry, fall back to the old behaviour and finish the stage.
        if (!Engine.beginFinale()) setTimeout(() => finishStage(), 700);
      },
      onFinaleDone: () => {
        if (app.awaitingArrival) {
          app.awaitingArrival = false;
          setTimeout(() => showComplete(true), 500);
          return;
        }
        setTimeout(() => finishStage(), 600);
      },
    });

    bind();
    paintHud();

    // begin at the furthest unfinished stage
    enterStage(app.stageIndex, { resume: true });

    // first gesture unlocks audio
    const unlock = () => {
      Audio.resume();
      if (app.sound) Audio.bed(STAGES[app.stageIndex].scene);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // visibility: pause the loop when hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) Engine.pause(true);
      else if ($('question-overlay').hidden && $('complete-overlay').hidden) Engine.pause(false);
    });
  }

  return { start, toast };
})();
