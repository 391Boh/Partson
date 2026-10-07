# Публікація SEO-релізу partson.shop — план на погодження

Стан на 2026-10-07. **Нічого не виконано.** Кожен блок «ДІЯ» — лише після вашого «так».

## Підтверджена конфігурація продакшну (з вашого підсумку)

| Що | Значення |
|---|---|
| Директорія | `/var/www/Partson` |
| Процеси PM2 | `partson-web` (:3000), `partson-auth` (:3001) |
| Коміт продакшну | `94042613c7922c5a13d4524644aa61fa11d37d46` (`9404261`) |
| nginx | `/etc/nginx/conf.d/partson.conf` |
| `/_next/static/` | `alias /var/www/Partson/.next/static/` — **з диска старої директорії** |
| merchant-feed.xml | `alias` на файл у старій директорії |
| `/styles` | окремого правила немає → проксі на Next.js → `public/styles` активного релізу |
| Диск | вільно 4,1 ГБ (88 %) |

Повний текстовий вивід сервера в повідомленні не з'явився (лише підсумок), тому точні рядки
`location`/`alias` нижче перевіряються командою перед зміною, а не беруться з припущення.

## 1. Склад релізу відносно продакшну (`9404261` → реліз)

**A. Коміт `8ac9300` (уже в `origin/main`, ще не на продакшні) — не SEO, адмінка товарів:**
- `app/api/product-update-description/route.ts`: перед збереженням опису перевіряє актуальний артикул
  у 1С; якщо 1С не відповідає — 503 «Опис не змінено» (раніше зберігало зі старим артикулом).
- `app/api/product-update/route.ts`: відповіді 1С з `updated:false` / `error` / текстом вважаються помилкою
  (раніше не-JSON 2xx — успіх).
- `app/lib/catalog-server.ts`: опція `lookupFields` оголошена, але всередині не використовується —
  на сайт не впливає (зауваження: задуманий «пошук лише за кодом» не діє).
- `scripts/test-product-*.mjs`: тести, у збірку не потрапляють.
- `package-lock.json` між `9404261` і релізом **ідентичний**.

**B. SEO-зміни (цей реліз):**
`app/api/group-item-producers/route.ts`, `app/auto/[brand]/[model]/page.tsx`,
`app/groups/[slug]/[itemSlug]/page.tsx`, `app/katalog/page.tsx`, `app/lib/auto-directory-data.ts`,
`app/lib/auto-seo.ts`, `app/lib/catalog-links.ts`, `app/lib/catalog-seo.ts`, `app/lib/critical-css.ts`,
`app/lib/google-merchant-feed.ts`, `app/lib/product-faq.ts`, `app/manufacturers/[slug]/page.tsx`,
`app/not-found.tsx`, `app/product/[code]/page.tsx`, `app/components/ProductCard.tsx` (лише 2 рядки),
видалені `app/{auto,groups,manufacturers}/loading.tsx`, новий `scripts/warm-auto-model-breakdowns.ts`,
`package.json` (крок `warm:auto-model-breakdowns` у `build`/`build:full`), `docs/seo/*`.

**C. Інфраструктура:** `scripts/build-static-css.mjs` (зберігає попередні CSS), `.gitignore`
(`.env*.backup`, `.env*.bak`, `build.log`, `*.swp`, `*.swo`).

**Не входить:** дизайн, партнерство, анімації (`globals.css`, `layout.tsx`, `LayoutHost.tsx`, бекдропи,
`page.tsx`, `HomePageContent.tsx`, `inform/layout.tsx`, `use-section-reveal.ts`, `parallax-controller.ts`,
`partnership/*`, `carBrands.tsx`, `HomeSeoLinks.tsx`, `HomeScrollMotion.tsx`, `InformationMotion.tsx`,
`Partnership*.tsx`, зображення), `next-env.d.ts`.

## 2. Місце на диску

Виміряно на локальному еквіваленті релізу: `.next` 1,3 ГБ (з них `server` 1,0 ГБ — ISR-сторінки,
`cache` 0,26 ГБ), `node_modules` 0,98 ГБ, `.cache` 0,1 ГБ (без `product-images`), вихідний код ~10 МБ,
`public/styles` 5 МБ. Розмір `product-images` на продакшні вимірюється на сервері.

Спільних (hard link) файлів між релізами **немає**:
- `node_modules` — повна копія `cp -a`. Локально повна збірка й кілька запусків не змінили жодного файлу
  в `node_modules`, але гарантувати це для майбутніх команд в обох директоріях неможливо.
- `.cache/product-images` — повна копія: `app/product-image/[code]/route.ts` перезаписує файли кешу
  «на місці» (`writeFile` у кінцевий шлях), тож hard links змінили б файли старого релізу.
- Решта `.cache` — повна копія (`rsync -a`).

Шлюз місця (крок 5): вільне ≥ `node_modules` + `product-images` + 2,2 ГБ на збірку + 0,8 ГБ запасу,
інакше **зупинка** без жодного видалення й без переходу на hard links — далі окреме рішення
(наприклад, запуск без копії `product-images`: кеш зображень наповниться заново з 1С).
Орієнтовно: ~1,0 + `product-images` + ~1,6 ГБ → лишиться ≈1,3–1,5 ГБ, якщо `product-images` невеликий.

## 3. Як HTML, JS і CSS лишаються узгодженими

- JS: nginx віддає `/_next/static/` **з диска** за `alias`. Якщо перемкнути лише PM2, новий HTML
  посилатиметься на нові чанки, яких немає в старій директорії → зламаний сайт. Якщо перемкнути лише
  nginx, старі відкриті сторінки не знайдуть старі чанки.
  Рішення: у новий `.next/static` **докопіювати всі старі чанки** (`cp -an` після перевірки конфліктів, імена хешовані — конфліктів
  немає) → нова директорія містить і старі, і нові файли. Порядок: спочатку nginx (на надмножину), потім
  PM2. У будь-який момент кожен HTML знаходить свої JS.
- CSS: `/styles` проксіюється в Next активного релізу; у `public/styles` нового релізу вже є всі попередні
  `site.*.css`/`critical-*.css` → старі сторінки отримують свої стилі.
- merchant-feed.xml: alias і cron (`0 4 * * *`, абсолютний шлях `/var/www/Partson/scripts/update-merchant-feed.sh`)
  лишаються на старій директорії — фід працює як зараз, поки стара директорія існує (вона зберігається
  для відкату). Код фіду в релізі змінився лише рефакторингом константи — вихід ідентичний. Перенесення
  фіду й cron на спільний шлях — окрема задача після стабілізації.
- `partson-auth` не змінюється й не перезапускається (`--only partson-web`).

## 4. ДІЯ: коміт і push (локально)

`ProductCard.tsx` у робочій директорії містить і ваш дизайн-тизер, тому в індекс кладеться окремий
blob «HEAD + 2 рядки посилання» (без інтерактивного `git add -p`, робоча директорія не змінюється).

```bash
cd ~/Projects/partson
git switch -c seo-release-20261007
git add app/api/group-item-producers/route.ts "app/auto/[brand]/[model]/page.tsx" \
  "app/groups/[slug]/[itemSlug]/page.tsx" app/katalog/page.tsx app/lib/auto-directory-data.ts \
  app/lib/auto-seo.ts app/lib/catalog-links.ts app/lib/catalog-seo.ts app/lib/critical-css.ts \
  app/lib/google-merchant-feed.ts app/lib/product-faq.ts "app/manufacturers/[slug]/page.tsx" \
  app/not-found.tsx "app/product/[code]/page.tsx" package.json scripts/warm-auto-model-breakdowns.ts \
  scripts/build-static-css.mjs .gitignore docs/seo/
git rm -q app/auto/loading.tsx app/groups/loading.tsx app/manufacturers/loading.tsx
git update-index --cacheinfo 100644,"$(git hash-object -w <HEAD-версія + 2 рядки>)",app/components/ProductCard.tsx
git diff --cached --stat                       # 25 файлів; без globals.css, layout.tsx, partnership/*
git commit
git push -u origin seo-release-20261007
```

Ваші дизайн-зміни лишаються незакоміченими в робочій директорії.

## 5. ДІЯ: збірка в окремій директорії на сервері (продакшн не зачіпається)

```bash
ssh root@77.42.57.62
set -euo pipefail
OLD=/var/www/Partson
REL=/var/www/Partson-release-20261007
RELEASE_SHA=<sha з кроку 4>
NGX=/etc/nginx/conf.d/partson.conf

# 5.1 Фактичні параметри перед будь-якими змінами (без секретів)
pm2 describe partson-web | grep -E "status|name|exec cwd|script path|script args|interpreter|exec mode"
pm2 env "$(pm2 id partson-web | tr -dc 0-9)" | cut -d: -f1 | sort | tr '\n' ' '; echo   # лише назви змінних
pm2 describe partson-auth | grep -E "status|uptime|exec cwd"
grep -nE "server_name|listen|location|alias|root |proxy_pass" "$NGX"
grep -c "alias $OLD/.next/static/;" "$NGX"     # має бути 1, інакше зупинка

# 5.2 Шлюз місця (повні копії, без hard links)
NM=$(du -sm "$OLD/node_modules" | cut -f1)
PI=$( [ -d "$OLD/.cache/product-images" ] && du -sm "$OLD/.cache/product-images" | cut -f1 || echo 0)
FREE=$(df -Pm /var/www | awk 'NR==2{print $4}')
NEED=$((NM + PI + 2200 + 800))
echo "free=${FREE}MB node_modules=${NM}MB product-images=${PI}MB need=${NEED}MB"
[ "$FREE" -ge "$NEED" ] || { echo "STOP: недостатньо місця для повних копій"; exit 1; }

# 5.3 Директорія релізу
cd "$OLD" && git fetch origin seo-release-20261007
git -C "$OLD" worktree add --detach "$REL" "$RELEASE_SHA"
install -m 600 "$OLD/.env.local" "$REL/.env.local"
cp -a "$OLD/node_modules" "$REL/node_modules"
rsync -a "$OLD/.cache/" "$REL/.cache/"
mkdir -p "$REL/public/styles"
cp -n "$OLD"/public/styles/site.*.css "$OLD"/public/styles/critical-*.*.css "$REL/public/styles/" 2>/dev/null || true

# 5.4 Збірка (npm у REL не встановлює й не оновлює пакети)
cd "$REL" && npm run build 2>&1 | tee /root/partson-release-20261007-build.log | tail -20
cat "$REL/public/styles/manifest.json"; ls "$REL/public/styles"

# 5.5 Старі JS поряд із новими: конфлікт (той самий шлях, інший вміст) → зупинка
cd "$OLD/.next/static"
CONFLICTS=0
while IFS= read -r -d '' f; do
  t="$REL/.next/static/${f#./}"
  if [ -e "$t" ] && ! cmp -s "$f" "$t"; then echo "CONFLICT: ${f#./}"; CONFLICTS=$((CONFLICTS+1)); fi
done < <(find . -type f -print0)
[ "$CONFLICTS" -eq 0 ] || { echo "STOP: $CONFLICTS конфліктів у .next/static"; exit 1; }
cp -an "$OLD/.next/static/." "$REL/.next/static/"     # -n: існуючі нові файли не перезаписуються
df -h /var/www | tail -1
```

Лог збірки пишеться в `/root/…`, поза git. `git worktree` не змінює робочу директорію `/var/www/Partson`
(лише додає запис про worktree в її `.git`).

## 6. Перевірка на 127.0.0.1:3100 (поки продакшн працює зі старої директорії)

```bash
cd "$REL" && (npx next start -H 127.0.0.1 -p 3100 > /root/partson-3100.log 2>&1 &) ; sleep 6
B=http://127.0.0.1:3100; UA="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
for p in / /katalog /product/filtr-povitryanyy-megane-02-af1912 \
  /product/saylentblok-zadnoho-vazhelya-vnutrishn-nyz-zad-octavia-a5-passat-b6-b7-lmi29917 \
  /manufacturers/alpha /manufacturers/alpha-2t6udt "/katalog?tab=producer&producer=QH" \
  /auto/volkswagen/polo-i /auto/skoda/fabia-i /manufacturers/nonexistent-xyz /product/nonexistent-xyz; do
  curl -s -o /tmp/p.html -A "$UA" -w "%{http_code} %{redirect_url}  $p\n" "$B$p"
  grep -oE '<title>[^<]*|<link rel="canonical"[^>]*>|<meta name="robots"[^>]*>' /tmp/p.html | head -3
done
# Очікування: 200 / 200 / 200 index / 200 noindex / 308 → alpha-2t6udt / 200 / 200 noindex (canonical на себе)
#             / 200 / 200 (30 груп) / 404 / 404
# Кожен JS, на який посилається новий HTML, є в REL/.next/static:
for p in / /katalog /product/filtr-povitryanyy-megane-02-af1912 /auto/audi; do
  curl -s "$B$p" | grep -oE '/_next/static/[^"]+\.(js|css)' | sort -u | while read -r f; do
    [ -f "$REL/.next/${f#/_next/}" ] || echo "MISSING in REL: $f"; done; done
# Кожен JS, на який посилається ПОТОЧНИЙ живий HTML, теж є в REL/.next/static (для старих вкладок):
for p in / /katalog /product/filtr-povitryanyy-megane-02-af1912 /auto/audi; do
  curl -s "https://partson.shop$p" | grep -oE '/_next/static/[^"]+\.(js|css)' | sort -u | while read -r f; do
    [ -f "$REL/.next/${f#/_next/}" ] || echo "MISSING old chunk: $f"; done; done
# CSS
for p in / /katalog /product/filtr-povitryanyy-megane-02-af1912 /manufacturers/nonexistent-xyz; do
  curl -s "$B$p" | grep -oE '/styles/[a-z-]+\.[0-9a-f]{10}\.css' | sort -u | while read -r c; do
    echo "$p $c $(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$B$c")"; done; done
pkill -f "next start -H 127.0.0.1 -p 3100"
```

Будь-який рядок `MISSING` → зупинка, не перемикати.

## 7. ДІЯ: перемикання (nginx → PM2)

```bash
NGX=/etc/nginx/conf.d/partson.conf
mkdir -p /root/nginx-backup && cp -a "$NGX" /root/nginx-backup/partson.conf.$(date +%Y%m%d-%H%M)
grep -n "alias /var/www/Partson/.next/static/" "$NGX"           # має бути рівно 1 рядок
sed -i "s#alias /var/www/Partson/.next/static/;#alias $REL/.next/static/;#" "$NGX"
grep -n "/.next/static/" "$NGX"; nginx -t && systemctl reload nginx
# Старий HTML (ще зі старого PM2) має знаходити свої чанки вже з REL:
curl -s https://partson.shop/ | grep -oE '/_next/static/[^"]+\.js' | head -5 | while read -r f; do
  curl -s -o /dev/null -w "%{http_code} $f\n" "https://partson.shop$f"; done

pm2 delete partson-web
cd "$REL" && pm2 start ecosystem.config.js --only partson-web
pm2 save
pm2 ls        # partson-web online з cwd=$REL; partson-auth — без змін (uptime не скинувся)
```

Простій — кілька секунд між `delete` і `start`. Якщо `pm2 describe` у кроці 5 показав, що процес
запущено не з `ecosystem.config.js` (інші args/env), — замість цього повторити ту саму команду запуску
з `--cwd "$REL"`.

## 8. Перевірка після перемикання

Повторити блок кроку 6 з `B=https://partson.shop`, плюс:

```bash
curl -sI https://partson.shop/robots.txt | head -1
curl -s https://partson.shop/sitemap.xml | head -3
curl -sI https://partson.shop/<шлях merchant-feed з nginx> | head -3     # 200, той самий файл, що й до релізу
pm2 logs partson-web --lines 100 --nostream | grep -E "Error|AutoModel" | tail -20
```

`AutoModelBreakdownUnavailableError`/`AutoModelsUnavailableError` — тимчасові помилки 1С: сторінка
моделі відповідає 5xx (не кешується, повторюється) замість порожньої сторінки чи 404.

## 9. Відкат

Лише PM2 (nginx можна лишити: `$REL/.next/static` містить і старі чанки):

```bash
pm2 delete partson-web
cd /var/www/Partson && pm2 start ecosystem.config.js --only partson-web
pm2 save
```

Повний відкат nginx (якщо потрібно; спершу докопіювати нові чанки, щоб відкриті нові сторінки не зламались):

```bash
cp -an "$REL/.next/static/." /var/www/Partson/.next/static/
cp -a /root/nginx-backup/partson.conf.<мітка> /etc/nginx/conf.d/partson.conf
nginx -t && systemctl reload nginx
```

Стара директорія, її `.next`, cron фіду й `partson-auth` не змінюються жодним кроком — відкат миттєвий.

## 10. www → основний домен (окремий дозвіл)

`docs/seo/www-redirect.nginx.conf` — після стабілізації релізу, окремим `nginx -t && reload`.

## Що не видаляється

Стара директорія `/var/www/Partson`, її `.next`, `.env.local.backup`, `build.log`, swap-файли, stash,
резервні копії, старі CSS. Прибирання диска — окреме рішення.
