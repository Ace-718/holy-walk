#!/usr/bin/env python3
"""Emit assets/icon.svg — the Holy Walk angel.

Run with --small for the bolder variant used for every rendered size: fewer,
fatter feathers and a heavier halo ring so the figure survives a 32px favicon.
"""
import math

def feather(root, ang, L, w):
    """A tapered feather from root, pointing along -x then rotated by ang degrees."""
    rx, ry = root
    # local: tip at (-L, 0), widest near 35% of length
    d = (f"M 0 {-w/2:.1f} "
         f"C {-L*0.28:.1f} {-w*0.62:.1f} {-L*0.72:.1f} {-w*0.40:.1f} {-L:.1f} 0 "
         f"C {-L*0.72:.1f} {w*0.40:.1f} {-L*0.28:.1f} {w*0.62:.1f} 0 {w/2:.1f} Z")
    return f'<path d="{d}" transform="translate({rx} {ry}) rotate({ang:.1f})"/>'

def wing(root, mirror):
    """Feathers fanned from the shoulder. ang measured so 0 = straight out."""
    out = []
    n = 9
    for i in range(n):
        t = i / (n - 1)                     # 0 bottom .. 1 top
        # bottom feathers lie almost flat and are short; top ones lift and lengthen
        ang = 6 + 62 * (t ** 0.92)
        L = 118 + 74 * (t ** 0.75)
        w = 30 + 12 * (1 - t)
        out.append(feather(root, ang, L, w))
    return out

LEFT_ROOT = (252, 252)
RIGHT_ROOT = (260, 252)

back = []   # slightly shorter, darker, behind
front = []
for i in range(9):
    pass

# build front feathers explicitly so we can colour two layers
def feather_set(mirror, scale, dx, dy):
    parts = []
    n = N_FEATHERS
    for i in range(n):
        t = i / (n - 1)
        ang = 4 + 64 * (t ** 0.92)
        L = (126 + 76 * (t ** 0.75)) * scale
        w = (34 + 14 * (1 - t)) * scale * FEATHER_W
        root = LEFT_ROOT if mirror < 0 else RIGHT_ROOT
        rx = root[0] + (dx if mirror < 0 else -dx)
        ry = root[1] + dy
        p = feather((rx, ry), ang, L, w)
        if mirror > 0:
            p = p.replace('rotate(', 'scale(-1 1) translate(')  # placeholder
        parts.append(p)
    return parts

def feathers_for(mirror, scale=1.0, dx=0.0, dy=0.0, grad='feather'):
    parts = []
    n = N_FEATHERS
    for i in range(n):
        t = i / (n - 1)
        ang = 4 + 64 * (t ** 0.92)
        L = (126 + 76 * (t ** 0.75)) * scale
        w = (34 + 14 * (1 - t)) * scale * FEATHER_W
        root = LEFT_ROOT if mirror < 0 else RIGHT_ROOT
        rx = root[0] + mirror * dx
        ry = root[1] + dy
        d = (f"M 0 {-w/2:.1f} "
             f"C {-L*0.28:.1f} {-w*0.62:.1f} {-L*0.72:.1f} {-w*0.40:.1f} {-L:.1f} 0 "
             f"C {-L*0.72:.1f} {w*0.40:.1f} {-L*0.28:.1f} {w*0.62:.1f} 0 {w/2:.1f} Z")
        tr = f"translate({rx} {ry})"
        if mirror < 0:
            tr += f" rotate({ang:.1f})"
        else:
            tr += f" scale(-1 1) rotate({ang:.1f})"
        parts.append(f'<path d="{d}" transform="{tr}" fill="url(#{grad})"/>')
    return parts

import sys
BIG = '--small' in sys.argv

N_FEATHERS = 4 if BIG else 9
FEATHER_W = 1.9 if BIG else 1.0
HALO_W = 21 if BIG else 12
SCALE = 1.42 if BIG else 1.0

svg = []
A = svg.append
A('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">')
A('''  <defs>
    <radialGradient id="sky" cx="50%" cy="28%" r="80%">
      <stop offset="0%" stop-color="#233651"/>
      <stop offset="44%" stop-color="#101a2b"/>
      <stop offset="100%" stop-color="#04060b"/>
    </radialGradient>
    <linearGradient id="feather" x1="0.1" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#fff6de"/>
      <stop offset="38%" stop-color="#f2d494"/>
      <stop offset="100%" stop-color="#b2862f"/>
    </linearGradient>
    <linearGradient id="featherIn" x1="0.1" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#dcae55"/>
      <stop offset="100%" stop-color="#6d4d17"/>
    </linearGradient>
    <linearGradient id="robe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff8e6"/>
      <stop offset="40%" stop-color="#f0d79f"/>
      <stop offset="100%" stop-color="#bf953c"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffeec4" stop-opacity=".50"/>
      <stop offset="58%" stop-color="#f0cd7d" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#f0cd7d" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="haloFill" cx="50%" cy="50%" r="50%">
      <stop offset="55%" stop-color="#f6d894" stop-opacity=".34"/>
      <stop offset="100%" stop-color="#f6d894" stop-opacity="0"/>
    </radialGradient>
  </defs>''')
A('  <rect width="512" height="512" rx="114" fill="url(#sky)"/>')
A('  <circle cx="256" cy="232" r="200" fill="url(#glow)"/>')

# back layer wings (slightly offset out/down, darker)
A('  <g opacity=".92">')
for p in feathers_for(-1, scale=0.90, dx=10, dy=16, grad='featherIn'): A('    ' + p)
for p in feathers_for(+1, scale=0.90, dx=10, dy=16, grad='featherIn'): A('    ' + p)
A('  </g>')
# front layer
A('  <g>')
for p in feathers_for(-1, scale=1.0, dx=0, dy=0, grad='feather'): A('    ' + p)
for p in feathers_for(+1, scale=1.0, dx=0, dy=0, grad='feather'): A('    ' + p)
A('  </g>')

A(f'''  <!-- Halo: a ring behind the head, so a rim of gold shows all round it. Drawn before
       the head, never above it — a ring floating clear of the head reads as a visor. -->
  <circle cx="256" cy="164" r="74" fill="url(#haloFill)"/>
  <!-- dark gap, then the ring: without it the gold ring dissolves into the gold wings -->
  <circle cx="256" cy="164" r="54" fill="none" stroke="#080d16" stroke-width="{HALO_W+18}"/>
  <circle cx="256" cy="164" r="54" fill="none" stroke="#e8c884" stroke-width="{HALO_W}"/>
  <circle cx="256" cy="164" r="54" fill="none" stroke="#fff6da" stroke-width="{HALO_W*0.38:.1f}" opacity=".95"/>
  <!-- head: smaller than the halo's inner edge, so a full ring of gold shows round it -->
  <circle cx="256" cy="164" r="27" fill="url(#robe)"/>
  <!-- robe -->
  <!-- arms, held slightly out and down, ending in simple hands -->
  <path d="M212 232 C196 254 190 288 192 318 C204 322 216 314 220 300 C224 276 224 252 222 236 Z" fill="url(#robe)"/>
  <path d="M300 232 C316 254 322 288 320 318 C308 322 296 314 292 300 C288 276 288 252 290 236 Z" fill="url(#robe)"/>
  <!-- the robe: shoulders, then a bell to the hem -->
  <path d="M256 192 C228 192 210 208 206 232 L190 344
           C196 372 316 372 322 344 L306 232 C302 208 284 192 256 192 Z"
        fill="url(#robe)"/>
  <!-- shoulder yoke -->
  <path d="M230 198 Q256 214 282 198" fill="none" stroke="#b98c37" stroke-width="5" opacity=".38"/>
  <!-- folds -->
  <path d="M256 210 V362" stroke="#a87c2c" stroke-width="4.5" opacity=".22" stroke-linecap="round"/>
  <path d="M228 224 L216 358" stroke="#a87c2c" stroke-width="4" opacity=".16" stroke-linecap="round"/>
  <path d="M284 224 L296 358" stroke="#a87c2c" stroke-width="4" opacity=".16" stroke-linecap="round"/>
  <!-- hem -->
  <path d="M190 344 C196 372 316 372 322 344" fill="none" stroke="#fff4d4" stroke-width="6" opacity=".8" stroke-linecap="round"/>
  <!-- stars -->
  <g fill="#ffeec4">
    <circle cx="92" cy="92" r="5" opacity=".9"/>
    <circle cx="422" cy="104" r="4" opacity=".75"/>
    <circle cx="126" cy="410" r="3.6" opacity=".6"/>
    <circle cx="392" cy="398" r="4.6" opacity=".8"/>
    <circle cx="256" cy="470" r="3.8" opacity=".6"/>
    <circle cx="64" cy="252" r="3" opacity=".4"/>
    <circle cx="452" cy="264" r="3" opacity=".4"/>
  </g>
</svg>''')

out = '\n'.join(svg)
if BIG:
    out = out.replace('<g>', '<g transform="translate(256 250) scale(%s) translate(-256 -250)">' % SCALE, 1)
    out = out.replace('<g opacity=".92">', '<g opacity=".92" transform="translate(256 250) scale(%s) translate(-256 -250)">' % SCALE, 1)
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'icon.svg')
open(OUT,'w').write('\n'.join(svg))
print('written')
