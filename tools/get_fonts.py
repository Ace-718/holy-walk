"""Download latin-subset woff2 faces and emit src/fonts.css with base64 data URIs."""
import re
import re, os, base64, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
WANT = [
    ("Cormorant Garamond", "ital,wght@0,600;0,700;1,600"),
    ("Archivo", "wght@400;500;600;700"),
]
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "fonts.css")

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()

rules, seen = [], {}
for fam, spec in WANT:
    css = fetch(f"https://fonts.googleapis.com/css2?family={fam.replace(' ', '+')}:{spec}&display=swap").decode()
    # each @font-face is preceded by a subset comment
    for m in re.finditer(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S):
        subset, body = m.group(1), m.group(2)
        if subset != "latin":
            continue
        style = re.search(r"font-style:\s*(\w+)", body).group(1)
        weight = re.search(r"font-weight:\s*([\d ]+);", body).group(1).strip()
        src = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
        if src not in seen:
            seen[src] = base64.b64encode(fetch(src)).decode()
        rules.append(
            "@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2');}" % (fam, style, weight, seen[src])
        )

with open(OUT, "w") as f:
    f.write("\n".join(rules) + "\n")
print(len(rules), "faces,", os.path.getsize(OUT) // 1024, "KB")
