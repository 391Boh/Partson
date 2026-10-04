"""Regenerate the UI subset: python3 scripts/subset-ui-font.py (fonttools + brotli).
The full source font remains the fallback for characters outside these ranges.
"""
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parent.parent
options = subset.Options()
options.flavor = "woff2"
font = subset.load_font(str(root / "public/fonts/exo2-variable.woff2"), options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=(
    list(range(0x0000, 0x0530)) + list(range(0x1E00, 0x1F00)) +
    list(range(0x2000, 0x2070)) + list(range(0x20A0, 0x20D0)) +
    [0x2116, 0x2122, 0x2212, 0xFEFF, 0xFFFD]
))
subsetter.subset(font)
subset.save_font(font, str(root / "public/fonts/exo2-latin-cyrillic.woff2"), options)
