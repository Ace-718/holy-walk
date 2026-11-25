# Holy Walk — a Red Sea Bible journey

An offline, single-file Bible journey game. Eight prophets, sixteen questions,
every verse quoted word for word from the King James Version, and the complete
66-book KJV bundled for reading.

Live at **https://holy-walk.zlauder.dev** and **https://ace-718.github.io/holy-walk/**

## What it is

You walk a road toward a landmark — the Red Sea, the ark, Jericho's wall, the
valley of Elah, Carmel's altar, the road to Nineveh, the lions' den, the Jordan.
Each journey has two gates. A gate opens only when you answer a question from the
passage, and answering it plays the miracle: the sea splits into walls of water,
the wall of Jericho falls flat, the giant comes down, fire falls on the altar.

There is no timer, no fail state, and no network call. Wrong answers explain
themselves and let you try again; a hint always points at the verse.

## The Bible

The reader holds all 66 books, 1,189 chapters and 31,102 verses of the KJV,
loaded a book at a time so the first paint stays small. Every reference in the
game — and every study theme — opens the actual text at that verse.

The eight study themes (Sabbath, the sanctuary, the Second Coming, the three
angels, the great controversy, righteousness by faith, the prophetic gift,
baptism and mission) are short original summaries written for this app. They are
not quotations from any church publication, and the app says so.

## How it is built

| Path | What it is |
| --- | --- |
| `index.html` | The whole app: one file, fonts inlined, no external requests |
| `src/` | The sources that `tools/build.py` inlines into `index.html` |
| `kjv/` | 66 book files plus an index, fetched on demand by the reader |
| `assets/` | The angel app icon, rendered at every size a home screen asks for |
| `manifest.webmanifest` | Lets the app install to a phone home screen as "Holy Walk" |
| `tools/build.py` | Bundles `src/` into the single `index.html` |
| `tools/gen_verses.py` | Regenerates `src/verses.js` from the KJV (generated, do not edit) |
| `tools/get_fonts.py` | Fetches the latin woff2 faces and emits them as data URIs |

Rebuild after editing anything in `src/`:

```sh
python3 tools/build.py
```

The scene art is drawn procedurally on a canvas. The sound is synthesised with
the Web Audio API — no audio files ship. The fonts are inlined. The only images
are the angel icon in `assets/`, generated from `assets/icon.svg`:

```sh
# render every icon size from the vector source
node tools/build-icons.mjs
```

## Credits

Scripture quotations are from the King James Version (public domain).
