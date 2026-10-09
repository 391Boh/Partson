# Контроль пам'яті next-server і росту route-cache — план (до погодження)

Стан на 2026-10-07 ~20:55. Нічого з цього на сервері не застосовано.

## Що встановлено (код Next.js 16.3.8 у `node_modules/next/dist`)

- `.next/server/route-cache/<APP_PAGE|APP_ROUTE|PAGES>/<sha256 маршруту>/$<шлях>.{html,meta,rsc}` +
  `<шлях>.segments/` — **стандартний** дисковий ISR-кеш Next.js:
  `server/lib/route-cache-key.js` (`ROUTE_CACHE_DIRECTORY = 'route-cache'`),
  `server/lib/incremental-cache/file-system-cache.js`.
- Пише: `set()` після кожного рендеру/ревалідації та `promoteSeed()` — копію build-пререндеру
  з `.next/server/app` при першому читанні. **Нічого не видаляє**; обмеження розміру є лише для
  кешу в пам'яті (`cacheMaxMemorySize`, типово 50 МБ). Запис на диск вимикається тільки
  `experimental.isrFlushToDisk` (типово `true`).
- Читання: якщо основного файлу немає — fallback на build-seed або новий рендер; будь-яка помилка
  читання → `return null` (промах кешу). Отже route-cache — **відновлюваний кеш**; потрібні для
  роботи `.next/server/app`, `.next/server/chunks`, `.next/static`, маніфести — їх не чіпати.
- `next start` не форкає окремий процес (`server/lib/start-server.js`: лише
  `process.title = 'next-server (v16.3.8)'`). Через `npm run start:web` PM2 керує й міряє npm
  (~12 МБ), а next-server (300–700 МБ) — онук поза `max_memory_restart`.

## Що підготовлено (локально перевірено)

1. `scripts/prune-route-cache.mjs` — тримає route-cache у межах розміру/віку.
   - Відбір: спершу записи старші за `--max-age-hours`, потім найстаріші за mtime до `--max-mb`.
   - Видалення **не атомарне**: основний `.html`/`.body` першим (читач бачить промах), далі
     `.meta`/`.rsc`/`.json`/`.segments` послідовно.
   - Паралельні записи Next.js: запис, змінений після сканування або молодший за
     `--min-age-seconds` (120), пропускається (`skippedBusy`); «сироти» (файли без основного) рахуються
     окремо й видаляються лише старші за `--orphan-grace-minutes` (60).
   - Розмір після очищення **вимірюється** повторним обходом (`after (measured)`).
   - Lock-файл `.next/server/route-cache.prune.lock` (живий власник → пропуск; мертвий → перехоплення);
     у cron додатково `flock -n`, якщо він є на сервері.
   - Коди виходу: 0 успіх/пропуск через lock, 1 помилки видалення, 2 неправильні аргументи/шлях,
     3 каталог недоступний.
2. `ecosystem.config.js` — `partson-web` запускає `node_modules/next/dist/bin/next start -p 3000`
   (`interpreter: 'node'`) замість `npm run start:web`; env, ліміти, логи без змін; `partson-auth` без змін.
3. `scripts/ops/install-route-cache-prune-cron.sh` — повторюване встановлення cron: блок між
   маркерами замінюється, не дублюється; резервна копія crontab і diff; зупинка при пошкоджених маркерах;
   `REMOVE=1` прибирає лише свій блок.
4. `scripts/ops/switch-pm2-app.sh` — перезапуск одного застосунку PM2 з **автоматичним відкатом**:
   preflight (файли, назва `*.config.js`, застосунок запущений), резервна копія `dump.pm2`, старт нового
   конфігу, очікування порту, перевірка «PID = next-server, без дочірніх», контрольні URL; за будь-якої
   невдачі — запуск попереднього конфігу, `pm2 save` не виконується. Інші застосунки PM2 не
   перезапускаються (перевірка `pm_uptime`). Коди: 0 перемкнено, 1 невдача + відкат, 2 невдача і відкат
   не піднявся, 3 preflight (нічого не змінено).

### Результати локальних перевірок

| Перевірка | Результат |
|---|---|
| Чужий шлях / неправильні аргументи / немає каталогу | exit 2 / 2 / 3 |
| Lock живого процесу / застарілий lock | пропуск, кеш не змінено / перехоплено, lock прибрано |
| Сироти (стара, свіжа) | стара видалена, свіжа збережена й показана |
| `--min-age-seconds` більше віку записів | 32 вибрано, 0 видалено, `skippedBusy=32` |
| Помилка видалення (каталог без прав) | exit 1, шлях у stderr |
| `--dry-run` | файлів до/після 228/228, прогноз 4,8 МБ |
| Очищення між перезапусками Next (без кешу в пам'яті) | 12/12 URL: статус (200/308/404), title, canonical правильні; помилок у лозі 0 |
| Паралельне навантаження, 12 URL × 4 потоки, очищення щосекунди | 11 352 запити, 0 неочікуваних статусів, 54 запуски, 0 помилок |
| 300 різних сторінок × 4 потоки, очищення щосекунди | 299×200, 1×500 — тимчасова недоступність 1С (`AutoModelBreakdownUnavailableError`); повтор без очищення 3×200; 309 видалено, 0 помилок; у кінці 0 сиріт |
| Cron-інсталятор: 2 запуски / зміна параметрів / REMOVE / зламані маркери | 1 блок / блок замінено / вміст як був байт-у-байт / STOP |
| switch-pm2-app: неправильна назва конфігу | exit 3, процес і збережений список без змін |
| switch-pm2-app: зламаний новий конфіг | автовідкат на npm-варіант, сайт 200, exit 1, збережений список без змін |
| switch-pm2-app: правильний новий конфіг | контрольні URL 200/200/200/308/404, PID = next-server, 0 дочірніх, PM2 162 МБ ≈ RSS 161 МБ, `pm2 save`, exit 0 |

Перевірено під PM2 6.0.14 (як на сервері) на локальній production-збірці.

## Місце

- Зараз (активний реліз `/var/www/Partson-design-release-20261007`): route-cache 1 704 МБ,
  3 759 записів; вільно ~960 МБ (98 %). Органічний ріст ~3 МБ/15 хв (Googlebot), під час
  інтенсивного обходу — до ~0,4 ГБ/год.
- Ліміт 600 МБ / 48 год: перший запуск звільнить ≈1,1 ГБ → вільно ≈2,0 ГБ; далі route-cache ≤ 600 МБ
  (+ приріст між запусками кожні 15 хв).
- Нові файли < 20 КБ, перезбірка не потрібна (`.next` не змінюється).
- Неактивні релізи: `/var/www/Partson` route-cache 510 МБ, `/var/www/Partson-release-20261007` 82 МБ —
  **не чіпаються** без окремого рішення (на відкат не впливають: кеш відновлюваний).

## Застосування (окреме погодження)

Кожен крок має обов'язкову зупинку; `set -euo pipefail` перериває виконання на першій помилці.

```bash
# 0. Локально: коміт і push лише цих файлів
git add ecosystem.config.js scripts/prune-route-cache.mjs scripts/ops/install-route-cache-prune-cron.sh \
  scripts/ops/switch-pm2-app.sh docs/seo/server-cache-memory-runbook.md
git diff --cached --stat && git commit && git push origin seo-release-20261007
NEW=$(git rev-parse HEAD)

ssh partson-prod                       # потрібен доступ (див. «Доступ»)
set -euo pipefail
A=/var/www/Partson-design-release-20261007
NEW=<повний sha з кроку 0>
ALLOWED='^(ecosystem\.config\.js|scripts/prune-route-cache\.mjs|scripts/ops/install-route-cache-prune-cron\.sh|scripts/ops/switch-pm2-app\.sh|docs/seo/[^/]+)$'
cd "$A"
OLD=$(git rev-parse HEAD)

# 1. ЗУПИНКА: робоче дерево не чисте
[ -z "$(git status --porcelain)" ] || { echo "STOP: робоче дерево не чисте"; git status --short; exit 1; }
# 2. ЗУПИНКА: коміт не нащадок поточного або змінює файли поза списком
git fetch -q origin seo-release-20261007
git merge-base --is-ancestor "$OLD" "$NEW" || { echo "STOP: $NEW не нащадок $OLD"; exit 1; }
EXTRA=$(git diff --name-only "$OLD" "$NEW" | grep -vE "$ALLOWED" || true)
[ -z "$EXTRA" ] || { echo "STOP: файли поза погодженим списком:"; echo "$EXTRA"; exit 1; }
git diff --name-only "$OLD" "$NEW"
# конфіг для відкату (назва *.config.js — інакше PM2 запустить його як скрипт)
git show "$OLD":ecosystem.config.js > ecosystem.before-direct-next.config.js
git checkout -q --detach "$NEW"          # .next не змінюється, перезбірка не потрібна

# 3. Кеш: dry-run, потім очищення (ненульовий exit → зупинка)
node scripts/prune-route-cache.mjs --max-mb 600 --max-age-hours 48 --dry-run
node scripts/prune-route-cache.mjs --max-mb 600 --max-age-hours 48
df -Pm / | awk 'NR==2{print "free="$4"MB"}'

# 4. Cron (повторювано, без дублювання; резервна копія в /root)
APP_DIR="$A" bash scripts/ops/install-route-cache-prune-cron.sh

# 5. PM2: лише partson-web, автоматичний відкат при невдачі
APP_DIR="$A" ROLLBACK_ECOSYSTEM=ecosystem.before-direct-next.config.js bash scripts/ops/switch-pm2-app.sh
# exit 0 → далі; exit 1 → автоматично повернуто старий запуск, ЗУПИНКА; exit 2 → ручне втручання; exit 3 → нічого не змінено
```

## Перевірки після перемикання (ЗУПИНКА → відкат, якщо не пройшли)

```bash
FAIL=0
for c in "/|200" "/katalog|200" "/auto/skoda/fabia-i|200" "/product/filtr-povitryanyy-megane-02-af1912|200" \
         "/manufacturers/alpha|308" "/manufacturers/nonexistent-xyz|404"; do
  code=$(curl -s -o /dev/null -m 60 -w "%{http_code}" "https://partson.shop${c%%|*}")
  [ "$code" = "${c##*|}" ] && echo "ok $code ${c%%|*}" || { echo "FAIL $code ${c%%|*}"; FAIL=1; }
done
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.status,"mem="+Math.round(p.monit.memory/1048576)+"MB","restarts="+p.pm2_env.restart_time,"uptime="+p.pm2_env.pm_uptime)})'
tail -3 "$A/logs/web-error.log"; tail -2 "$A/logs/route-cache-prune.log" 2>/dev/null || true
[ "$FAIL" = 0 ] || echo "STOP: живі перевірки не пройшли — виконати відкат PM2 нижче"
```

## Відкат

```bash
cd /var/www/Partson-design-release-20261007
# PM2: назад до npm-запуску (лише partson-web)
pm2 delete partson-web && pm2 start ecosystem.before-direct-next.config.js --only partson-web
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/robots.txt   # очікується 200, тоді:
pm2 save
# Cron очищення — прибрати лише свій блок
APP_DIR="$PWD" REMOVE=1 bash scripts/ops/install-route-cache-prune-cron.sh
# Код — повернути попередній коміт (за потреби)
git checkout -q --detach 1bf01917b7ac0fda73117adddeb6cd4b9bfd9289
```

`switch-pm2-app.sh` для відкату до npm не використовується: його перевірка «PID = next-server,
0 дочірніх» для npm-запуску свідомо не пройде, і скрипт повернув би прямий запуск.
Очищений route-cache не відновлюється — сторінки повертаються з build-seed або новим рендером.

## Доступ

Станом на 2026-10-09 IP цього Mac змінився (`176.104.191.118`), а порт 22 сервера з нього недоступний;
ключ `partson-prod` у `authorized_keys` обмежений `from="176.104.191.19"`. Перед застосуванням оновіть
дозвіл (firewall і/або `from=`) або виконайте команди самостійно.

## Ризики й рішення

- Тепер 800 МБ **справді** діє на next-server. Під інтенсивним обходом RSS сягав 690 МБ; перевищення
  дасть автоматичний перезапуск (~3 с 502). Відстежувати `restarts`; за частих перезапусків —
  окремо обговорити ліміт або навантаження.
- `--max-old-space-size=1024` обмежує лише купу JS, не весь RSS.
- Cron очищення прив'язаний до шляху активного релізу — оновлювати при кожному перемиканні
  (як cron фіду).
- Альтернатива на майбутнє: `experimental.isrFlushToDisk: false` (лише пам'ять, LRU 50 МБ) — менше
  диска, але більше рендерів і запитів до 1С; експериментальна опція, потребує збірки.
