from pathlib import Path
text = Path('app/page.tsx').read_text()
marker = "              {/* گ÷گçگَ‘?‘'گ?گ?گٌگü گ+گ>گ?گَ */}"
print('marker found', marker in text)
print('count:', text.count(marker))
