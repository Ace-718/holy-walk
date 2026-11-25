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

    const done = STAGES.filter((_, i) => stageDone(i)).length;
    const solvedNow = solvedFor(app.stageIndex).filter(Boolean).length;
    const within = solvedNow / stage.gates.length;
    const pct = ((done + (stageDone(app.stageIndex) ? 0 : within)) / STAGES.length) * 100;
    $('track-fill').style.width = Scenes.clamp(pct, 2, 100) + '%';

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
      Engine.walkTo(1);
      Engine.miracle();
      app.complete = true;
      caption('This journey is already walked. Tap Forward to walk it again.', true);
      setTimeout(() => showComplete(true), 1400);
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
    const stage = STAGES[app.stageIndex];
    const { at, gate } = forwardTarget();

    // already walking toward that point
    if (Engine.walking) return;

    if (Engine.progress >= at - 0.005) {
      // standing at the gate: open it
      if (gate != null) openQuestion(gate);
      else finishStage();
      return;
    }

    Engine.walkTo(at);
    Audio.resume();
    if (Engine.progress < 0.06) caption(stage.approach);
  }

  /* ═══════════════════════════════════════════════════════════════
     Question card
     ═══════════════════════════════════════════════════════════════ */
  function showCard(which) {
    $('question-overlay').hidden = which !== 'question';
    $('complete-overlay').hidden = which !== 'complete';
  }
  function hideCard(which) {
    if (which === 'question') $('question-overlay').hidden = true;
    if (which === 'complete') $('complete-overlay').hidden = true;
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
    gate.options.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt';
      btn.type = 'button';
      btn.style.animationDelay = (i * 55) + 'ms';
      const key = document.createElement('span');
      key.className = 'opt-key';
      key.textContent = letters[i];
      const label = document.createElement('span');
      label.className = 'opt-text';
      label.textContent = text;
      btn.appendChild(key);
      btn.appendChild(label);
      btn.addEventListener('click', () => answer(i, gate, btn));
      opts.appendChild(btn);
    });

    $('q-feedback').hidden = true;
    $('q-feedback').className = 'feedback';
    $('q-foot').hidden = true;

    showCard('question');
    $('q-prompt').scrollIntoView({ block: 'nearest' });
  }

  function answer(pick, gate, btn) {
    if (app.busy === 'resolved') return;

    const opts = $('q-options');
    const buttons = Array.from(opts.querySelectorAll('.opt'));

    if (pick === gate.correct) {
      app.busy = 'resolved';
      buttons.forEach((b, i) => {
        b.disabled = true;
        if (i === gate.correct) b.classList.add('right');
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

    app.busy = false;

    if (allSolved) {
      caption(stage.miracle, true);
      setTimeout(() => {
        Engine.walkTo(1);
        Engine.miracle();
      }, 420);
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
        setTimeout(() => finishStage(), 500);
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
