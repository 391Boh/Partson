"""Regenerate the static TTF fonts used by OG image routes: python3 scripts/build-og-fonts.py
(fonttools + brotli). next/og (satori) reads TTF/OTF/WOFF but not WOFF2 or
variable fonts, so the site's Exo 2 subset is pinned to fixed weights here.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parent.parent
out_dir = root / "assets/og"
out_dir.mkdir(parents=True, exist_ok=True)

for weight in (600, 800):
    font = TTFont(str(root / "public/fonts/exo2-latin-cyrillic.woff2"))
    static = instantiateVariableFont(font, {"wght": weight})
    static.flavor = None
    static.save(str(out_dir / f"exo2-{weight}.ttf"))
    print(f"exo2-{weight}.ttf")
