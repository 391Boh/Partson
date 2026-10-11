# Google Search Console: дії для PartsON

Стан на 2026-10-09 (перевірено через API Search Console і запити до живого сайту).
Ресурс: `sc-domain:partson.shop`. API, доступний асистенту, лише читає дані — кнопки нижче
натискаються в інтерфейсі https://search.google.com/search-console.

## Що вже в порядку (нічого робити не треба)

- robots.txt дозволяє сайт, закриває лише `/api/`, вказує `Sitemap: https://partson.shop/sitemap.xml`.
- `sitemap.xml` (індекс) і 8 дочірніх файлів відповідають 200, XML валідний, 4 136 URL.
- Головна, `/katalog`, `/groups`, `/manufacturers`, `/auto`, `/blog`, `/partnership`,
  `/inform/diagnostics`, `/inform/delivery` — «Submitted and indexed», canonical Google = наш.
- Фільтровані адреси каталогу (`/katalog?tab=…`) — `noindex, follow`.
- Старі адреси: `sitemap-pages.xml` / `sitemap-products.xml` → редирект на `sitemap.xml`;
  `/product/РТ-…` → 308 на канонічну адресу товару; `http://` → `https://`.
- `www.partson.shop` Google вже вважає дублем головної («Alternate page with proper canonical tag»).

## 1. Після наступного деплою — запит індексації (≤10 на день)

Робити **після** деплою поточних змін (title товарів, блог, швидкість головної), інакше Google
просканує стару версію. Інспектування URL → «Запросити індексацію»:

1. https://partson.shop/
2. https://partson.shop/katalog
3. https://partson.shop/auto
4. https://partson.shop/blog
5. https://partson.shop/blog/motorna-olyva-yak-pravylno-vybraty-maslo-dlya-dvyhuna-avtomobilya-xkptmq
6. https://partson.shop/inform/diagnostics — є попит «комп'ютерна діагностика авто львів»
7. https://partson.shop/partnership — останнє сканування 25.09
8. https://partson.shop/product/filtr-povitryanyy-megane-02-af1912 — 202 покази, сканування 18.08
9. https://partson.shop/product/filtr-povitrya-kia-rio-hyundai-accent-02-af1741 — 202 покази
10. https://partson.shop/product/holovnyy-tsylindr-zcheplennya-octavia-caddy-98-6284605102

Не запитувати індексацію для noindex-сторінок (товари без фото/ціни, фільтри каталогу),
редиректів і 404. Indexing API для таких сторінок не використовувати.

## 2. Файли Sitemap

- `sitemap.xml` подано 07.10, статус «Очікує»; повторно подавати не потрібно.
- Додатково подати дочірні sitemap окремо — тоді в звіті видно, скільки проіндексовано з
  кожної групи (товари / авто / групи / виробники):
  - `https://partson.shop/product/sitemap/0.xml`
  - `https://partson.shop/product/sitemap/1.xml`
  - `https://partson.shop/auto-sitemap.xml`
  - `https://partson.shop/groups-sitemap.xml`
  - `https://partson.shop/manufacturers-sitemap.xml`

## 3. Звіти, які переглянути (раз на тиждень)

- **Сторінки (Індексування)**: причини «Проскановано, але не проіндексовано» та «Виявлено, але
  не проіндексовано» для `/product/` і `/auto/`. Якщо ростуть — сигнал про тонкий вміст
  (див. `docs/seo/1c-catalog-data-fixes.md`, фото товарів).
- **Покращення → Списки продавців**: попередження `shippingDetails` / `hasMerchantReturnPolicy`
  зникнуть після налаштування доставки й повернення в Merchant Center
  (`docs/seo/merchant-center-shipping-returns.md`). Попередження `category` — зі старих сканувань.
- **Ефективність**: запити «автозапчастини львів», «автомагазин львів»,
  «комп'ютерна діагностика авто львів» — позиції після деплою.
- **Статистика сканування** (Налаштування): частка відповідей 5xx/таймаутів — сайт залежить від 1С.

## 4. Налаштування

- Google Analytics → Адміністрування → Зв'язки продуктів → Search Console → зв'язати
  ресурс `sc-domain:partson.shop` з потоком GA4 (дані пошуку в GA4).
- Google Ads → Інструменти → Пов'язані акаунти → Search Console (звіт «Платні та органічні»).
- Користувачі й дозволи: перевірити, що доступ мають лише потрібні люди.

## 5. Поза консоллю, але впливає на звіти

- `https://www.partson.shop/` відповідає 200 (не редиректом). Google це вже обробляє через
  canonical, але правильніше — 301 на `https://partson.shop/`. Готовий конфіг:
  `docs/seo/www-redirect.nginx.conf` (зміна nginx — окреме погодження).
- `https://partson.shop/merchant-feed.xml` — 404 (скрипт виправлення підготовлено, див. розмову
  2026-10-09); фід для Merchant Center працює за `https://partson.shop/google-merchant-feed.xml`.
