#!/usr/bin/env python3
"""Bundle src/ into a single self-contained index.html.

The KJV library stays as separate files under kjv/ and is fetched on demand,
so the app shell stays small and the Bible reader can hold all 31,102 verses.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")

# Order matters: these are concatenated inside one IIFE.
JS_ORDER = [
    "verses.js",
    "stages.js",
    "audio.js",
    "speech.js",
    "qr.js",
    "scenes.js",
    "engine.js",
    "bible.js",
    "ui.js",
    "boot.js",
]

PLACEHOLDER = re.compile(r"(?:<!--|/\*)\s*@(\w+)\s*(?:-->|\*/)")


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def main():
    shell = read("shell.html")
    css = read("fonts.css") + "\n" + read("style.css")

    js_parts = []
    for name in JS_ORDER:
        body = read(name).strip()
        js_parts.append(f"/* ---------- {name} ---------- */\n{body}")
    js = "(function(){\n'use strict';\n" + "\n\n".join(js_parts) + "\n})();"

    def sub(m):
        key = m.group(1)
        if key == "CSS":
            return css
        if key == "JS":
            return js
        raise SystemExit(f"unknown placeholder @{key}")

    out = PLACEHOLDER.sub(sub, shell)
    dest = os.path.join(ROOT, "index.html")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(out)

    size = os.path.getsize(dest)
    print(f"index.html  {size / 1024:.1f} KB")

    # Guard: the bundle must not reach for the network at runtime.
    for pattern in ("cdn.tailwindcss", "fonts.googleapis", "fonts.gstatic", "unpkg.com", "jsdelivr"):
        if pattern in out:
            print(f"  ! external dependency leaked into bundle: {pattern}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
