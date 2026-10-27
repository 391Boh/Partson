"""Build the UI subset from the bundled Exo 2 variable font (fonttools+brotli)."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

root = Path(__file__).resolve().parent.parent
font = TTFont(root / 'public/fonts/exo2-variable.woff2')
options = subset.Options()
options.layout_features = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=(list(range(0x180)) + list(range(0x400, 0x460)) +
    [0x490, 0x491] + list(range(0x2000, 0x2070)) + list(range(0x20A0, 0x20D0)) +
    [0x2116, 0x2122, 0x2212, 0xFEFF, 0xFFFD]))
subsetter.subset(font)
# Complete subsetting before instancing: older fontTools lazily drops some
# composite variation entries if these operations are performed in reverse.
font = instantiateVariableFont(font, {'wght': (400, 900)}, inplace=True)
font.flavor = 'woff2'
font.save(root / 'public/fonts/exo2-ui-v1.woff2')
print('Built public/fonts/exo2-ui-v1.woff2')
