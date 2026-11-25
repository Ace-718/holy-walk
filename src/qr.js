/* ═══════════════════════════════════════════════════════════════════
   QR — a small, complete QR encoder in plain JavaScript.

   The app ships as one file and must work with no network at all, so the share
   code cannot come from a CDN. This encodes a URL in byte mode at error-
   correction level M, picks the smallest version that fits (1–10), and returns a
   module matrix. Nothing here needs a DOM.

   Follows ISO/IEC 18004: Reed–Solomon over GF(256), the standard interleaving
   order, all eight masks with the penalty rules, and BCH-coded format/version info.
   ═══════════════════════════════════════════════════════════════════ */

const QR = (function () {
  'use strict';

  /* ── Galois field GF(256), primitive polynomial 0x11d ─────────────── */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function build() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const buf = data.concat(new Array(ecLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = buf[i];
      if (factor === 0) continue;
      for (let j = 0; j < gen.length; j++) {
        buf[i + j] ^= gmul(gen[j], factor);
      }
    }
    return buf.slice(data.length);
  }

  /* ── Version tables ──────────────────────────────────────────────── */
  // [total codewords, EC codewords per block, blocks group 1, data per block g1,
  //  blocks group 2, data per block g2]  — level M, versions 1..10.
  const VERSIONS = {
    1:  [26, 10, 1, 16, 0, 0],
    2:  [44, 16, 1, 28, 0, 0],
    3:  [70, 26, 1, 44, 0, 0],
    4:  [100, 18, 2, 32, 0, 0],
    5:  [134, 24, 2, 43, 0, 0],
    6:  [172, 16, 4, 27, 0, 0],
    7:  [196, 18, 4, 31, 0, 0],
    8:  [242, 22, 2, 38, 2, 39],
    9:  [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44],
  };

  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };

  function dataCodewords(version) {
    const v = VERSIONS[version];
    return v[2] * v[3] + v[4] * v[5];
  }

  function charCountBits(version) {
    return version < 10 ? 8 : 16;
  }

  function pickVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
      const need = 4 + charCountBits(v) + byteLen * 8;
      if (need <= dataCodewords(v) * 8) return v;
    }
    return 0;
  }

  /* ── Bit stream ───────────────────────────────────────────────── */
  function BitStream() {
    this.bits = [];
  }
  BitStream.prototype.put = function (value, len) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };

  function utf8(text) {
    if (window.TextEncoder) return Array.from(new TextEncoder().encode(text));
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function codewordsFor(bytes, version) {
    const total = dataCodewords(version);
    const bs = new BitStream();
    bs.put(4, 4);                               // byte mode
    bs.put(bytes.length, charCountBits(version));  // character count
    for (let i = 0; i < bytes.length; i++) bs.put(bytes[i], 8);

    // terminator, then pad to a whole byte
    const cap = total * 8;
    const term = Math.min(4, cap - bs.bits.length);
    bs.put(0, term);
    while (bs.bits.length % 8 !== 0) bs.bits.push(0);

    const words = [];
    for (let i = 0; i < bs.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bs.bits[i + j];
      words.push(b);
    }
    // alternating pad bytes until the block is full
    let pad = 0xec;
    while (words.length < total) {
      words.push(pad);
      pad = pad === 0xec ? 0x11 : 0xec;
    }
    return words;
  }

  function interleave(words, version) {
    const [, ecLen, b1, d1, b2, d2] = VERSIONS[version];
    const blocks = [];
    let at = 0;
    for (let i = 0; i < b1; i++) {
      const data = words.slice(at, at + d1);
      at += d1;
      blocks.push({ data: data, ec: rsEncode(data, ecLen) });
    }
    for (let i = 0; i < b2; i++) {
      const data = words.slice(at, at + d2);
      at += d2;
      blocks.push({ data: data, ec: rsEncode(data, ecLen) });
    }

    const out = [];
    const maxData = Math.max(d1, d2);
    for (let i = 0; i < maxData; i++) {
      for (let b = 0; b < blocks.length; b++) {
        if (i < blocks[b].data.length) out.push(blocks[b].data[i]);
      }
    }
    for (let i = 0; i < ecLen; i++) {
      for (let b = 0; b < blocks.length; b++) out.push(blocks[b].ec[i]);
    }
    return out;
  }

  /* ── Matrix ──────────────────────────────────────────────────── */
  function makeMatrix(version) {
    const size = version * 4 + 17;
    const modules = [];
    const fn = [];
    for (let r = 0; r < size; r++) {
      modules.push(new Array(size).fill(0));
      fn.push(new Array(size).fill(false));
    }
    return { size: size, modules: modules, fn: fn };
  }

  function setFn(m, r, c, dark) {
    if (r < 0 || c < 0 || r >= m.size || c >= m.size) return;
    m.modules[r][c] = dark ? 1 : 0;
    m.fn[r][c] = true;
  }

  /* A finder is a 7×7 target around (cr, cc): dark 3×3 core, light ring, dark
     outline, then one light module of separator all the way round. */
  function finder(m, cr, cc) {
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const ring = Math.max(Math.abs(dr), Math.abs(dc));
        setFn(m, cr + dr, cc + dc, ring === 3 || ring < 2);
      }
    }
  }

  function alignment(m, version) {
    const pos = ALIGN[version];
    const last = pos.length - 1;
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        // the three finder corners already own these spots
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const ring = Math.max(Math.abs(dr), Math.abs(dc));
            setFn(m, pos[i] + dr, pos[j] + dc, ring !== 1);
          }
        }
      }
    }
  }

  function bchFormat(data) {
    let d = data << 10;
    const gen = 0x537;
    for (let i = 14; i >= 10; i--) {
      if ((d >>> i) & 1) d ^= gen << (i - 10);
    }
    return ((data << 10) | d) ^ 0x5412;
  }

  function bchVersion(version) {
    let d = version << 12;
    const gen = 0x1f25;
    for (let i = 17; i >= 12; i--) {
      if ((d >>> i) & 1) d ^= gen << (i - 12);
    }
    return (version << 12) | d;
  }

  // level M is 00 in the format bits
  function formatBits(mask) {
    return bchFormat((0 << 3) | mask);
  }

  function placeFormat(m, mask) {
    const bits = formatBits(mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    const size = m.size;

    // first copy: down the left side of the top-left finder, then across under it
    for (let i = 0; i <= 5; i++) setFn(m, i, 8, bit(i));
    setFn(m, 7, 8, bit(6));
    setFn(m, 8, 8, bit(7));
    setFn(m, 8, 7, bit(8));
    for (let i = 9; i < 15; i++) setFn(m, 8, 14 - i, bit(i));

    // second copy: bits 0–7 along the bottom of the top-right finder,
    // bits 8–14 down the right of the bottom-left finder
    for (let i = 0; i < 8; i++) setFn(m, 8, size - 1 - i, bit(i));
    for (let i = 8; i < 15; i++) setFn(m, size - 15 + i, 8, bit(i));

    // the always-dark module
    setFn(m, size - 8, 8, true);
  }

  function placeVersion(m, version) {
    if (version < 7) return;
    const bits = bchVersion(version);
    const size = m.size;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(m, a, b, dark);
      setFn(m, b, a, dark);
    }
  }

  function functionPatterns(m, version) {
    const size = m.size;

    for (let i = 0; i < size; i++) {
      setFn(m, 6, i, i % 2 === 0);
      setFn(m, i, 6, i % 2 === 0);
    }

    finder(m, 3, 3);
    finder(m, 3, size - 4);
    finder(m, size - 4, 3);

    alignment(m, version);
    placeVersion(m, version);
    placeFormat(m, 0);          // reserve the area; the real mask is written later
  }

  function placeData(m, words) {
    const size = m.size;
    let bitIndex = 0;
    const totalBits = words.length * 8;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                 // skip the vertical timing column
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const col = right - j;
          const upward = ((right + 1) & 2) === 0;
          const row = upward ? size - 1 - vert : vert;
          if (m.fn[row][col]) continue;
          let dark = false;
          if (bitIndex < totalBits) {
            dark = ((words[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          }
          m.modules[row][col] = dark ? 1 : 0;
          bitIndex++;
        }
      }
    }
  }

  function maskFn(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function applyMask(m, mask) {
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) {
        if (m.fn[r][c]) continue;
        if (maskFn(mask, r, c)) m.modules[r][c] ^= 1;
      }
    }
  }

  /* ── Penalty scoring, ISO/IEC 18004 §8.8.2 ──────────────────── */
  function penalty(m) {
    const size = m.size;
    const mod = m.modules;
    let score = 0;

    // rule 1: runs of five or more in a row
    for (let r = 0; r < size; r++) {
      for (const horizontal of [true, false]) {
        let run = 1;
        for (let i = 1; i < size; i++) {
          const a = horizontal ? mod[r][i] : mod[i][r];
          const b = horizontal ? mod[r][i - 1] : mod[i - 1][r];
          if (a === b) {
            run++;
          } else {
            if (run >= 5) score += 3 + (run - 5);
            run = 1;
          }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
    }

    // rule 2: 2×2 blocks of one colour
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = mod[r][c];
        if (v === mod[r][c + 1] && v === mod[r + 1][c] && v === mod[r + 1][c + 1]) score += 3;
      }
    }

    // rule 3: the finder-like 1:1:3:1:1 pattern with four light modules beside it
    const pattern = [1, 0, 1, 1, 1, 0, 1];
    function matches(line, at) {
      for (let i = 0; i < 7; i++) if (line[at + i] !== pattern[i]) return false;
      let before = true;
      let after = true;
      for (let i = 1; i <= 4; i++) {
        if (at - i >= 0 && line[at - i] !== 0) before = false;
        if (at + 6 + i < line.length && line[at + 6 + i] !== 0) after = false;
      }
      return before || after;
    }
    for (let r = 0; r < size; r++) {
      const row = mod[r];
      const col = mod.map((line) => line[r]);
      for (let i = 0; i + 7 <= size; i++) {
        if (matches(row, i)) score += 40;
        if (matches(col, i)) score += 40;
      }
    }

    // rule 4: distance from a 50/50 balance
    let dark = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) dark += mod[r][c];
    }
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    score += Math.max(0, k) * 10;

    return score;
  }

  function clone(m) {
    return {
      size: m.size,
      modules: m.modules.map((row) => row.slice()),
      fn: m.fn,
    };
  }

  /* ── Public ─────────────────────────────────────────────────── */
  function encode(text) {
    if (!text) return null;
    const bytes = utf8(text);
    const version = pickVersion(bytes.length);
    if (!version) return null;

    const words = interleave(codewordsFor(bytes, version), version);

    const base = makeMatrix(version);
    functionPatterns(base, version);
    placeData(base, words);

    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = clone(base);
      applyMask(m, mask);
      // the format bits name the mask, so they are written after it
      placeFormat(m, mask);
      const score = penalty(m);
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return { size: best.size, modules: best.modules, version: version, mask: bestScore };
  }

  return { encode: encode };
})();
