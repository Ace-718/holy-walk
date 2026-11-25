/* ═══════════════════════════════════════════════════════════════════
   BIBLE — the full King James text, one book file at a time.
   The index is tiny; a book only downloads when it is opened, so the
   app starts instantly and the reader still holds all 31,102 verses.
   ═══════════════════════════════════════════════════════════════════ */

const Bible = (function () {
  let index = null;
  const cache = {};
  let current = { book: null, chapter: 1 };
  let pending = null;

  const OT_COUNT = 39;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  async function loadIndex() {
    if (index) return index;
    const res = await fetch('kjv/index.json');
    if (!res.ok) throw new Error('bible index ' + res.status);
    index = await res.json();
    return index;
  }

  async function loadBook(slug) {
    if (cache[slug]) return cache[slug];
    if (pending && pending[slug]) return pending[slug];
    pending = pending || {};
    pending[slug] = fetch('kjv/' + slug + '.json')
      .then((r) => {
        if (!r.ok) throw new Error('book ' + slug + ' ' + r.status);
        return r.json();
      })
      .then((d) => {
        cache[slug] = d;
        return d;
      })
      .finally(() => { delete pending[slug]; });
    return pending[slug];
  }

  function findBook(name) {
    if (!index) return null;
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = norm(name);
    return index.find((b) => norm(b.n) === target) || null;
  }

  /* ── Render the book chooser ── */
  function renderBooks(container, onPick) {
    container.innerHTML = '';
    const grid = el('div', 'book-grid');
    index.forEach((b) => {
      const btn = el('button', 'book-btn', b.n);
      if (current.book === b.n) btn.classList.add('on');
      btn.addEventListener('click', () => onPick(b));
      grid.appendChild(btn);
    });
    container.appendChild(grid);
  }

  function renderChapters(container, book, onPick) {
    container.innerHTML = '';
    const count = Object.keys(book.c).length;
    const grid = el('div', 'chap-grid');
    Object.keys(book.c)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((n) => {
        const btn = el('button', 'chap-btn', String(n));
        if (current.book === book.n && current.chapter === n) btn.classList.add('on');
        btn.addEventListener('click', () => onPick(n));
        grid.appendChild(btn);
      });
    container.appendChild(grid);
    if (count > 0) {
      const note = el('p', 'note', 'King James Version. Tap a chapter number to read.');
      container.appendChild(note);
    }
  }

  function renderPassage(container, book, chapter, highlightVerse) {
    container.innerHTML = '';
    const verses = book.c[String(chapter)] || [];
    if (!verses.length) {
      container.appendChild(el('p', 'note', 'No text for this chapter in the local library.'));
      return;
    }

    const head = el('div', 'reading-head');
    head.appendChild(el('h3', null, book.n + ' ' + chapter));
    head.appendChild(el('span', null, 'KJV'));
    container.appendChild(head);

    verses.forEach((text, i) => {
      const row = el('div', 'verse');
      row.dataset.v = String(i + 1);
      row.appendChild(el('span', 'verse-n', String(i + 1)));
      row.appendChild(el('span', 'verse-text', text));
      if (highlightVerse && i + 1 === highlightVerse) {
        row.classList.add('hit');
        row.id = 'verse-' + (i + 1);
      }
      container.appendChild(row);
    });

    const nav = el('div', 'reader-nav');
    const nums = Object.keys(book.c).map(Number).sort((a, b) => a - b);
    const pos = nums.indexOf(chapter);
    const prev = el('button', null, '‹ ' + (pos > 0 ? 'Chapter ' + nums[pos - 1] : 'Start'));
    prev.disabled = pos <= 0;
    const next = el('button', null, (pos < nums.length - 1 ? 'Chapter ' + nums[pos + 1] : 'End') + ' ›');
    next.disabled = pos >= nums.length - 1;
    nav.appendChild(prev);
    nav.appendChild(next);
    container.appendChild(nav);

    container._nav = { book, nums, pos };
    return { prev, next, nums, pos };
  }

  return {
    loadIndex,
    loadBook,
    findBook,
    renderBooks,
    renderChapters,
    renderPassage,
    get current() { return current; },
    set current(v) { current = v; },
    get index() { return index; },
  };
})();
