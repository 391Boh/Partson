# Деплой PartsON на сервер із PM2

Виконуйте з каталогу проєкту на сервері. Потрібні Node.js 22, npm 10+, PM2 і налаштований `.env.local` (1С, Firebase Admin SDK, Telegram та інші інтеграції). Конфігурація `ecosystem.config.js` запускає `partson-web` на порту 3000 та `partson-auth` на порту 3001.

```bash
git pull --ff-only origin main &&
npm ci &&
BUILD_CPUS=1 npm run sync:catalog &&
BUILD_CPUS=1 npm run build &&
pm2 restart ecosystem.config.js --update-env &&
pm2 save
```

`&&` не дозволяє перезапустити процеси після невдалої синхронізації або збірки. `BUILD_CPUS=1` обмежує кількість робітників Next.js для сервера з невеликим обсягом пам’яті.

Синхронізацію відокремлено від збірки. `npm run sync:catalog` звертається до 1С, готує прев’ю груп, SEO-лічильники, sitemap моделей, знімки їхніх груп та відповіді для статичної генерації в `.cache/build-inputs`. `npm run sync:catalog:full` додатково оновлює merchant feed. Цей крок може тривати кілька хвилин; його можна виконати заздалегідь, окремо від релізу.

`npm run build` генерує CSS і збирає Next.js зі збережених відповідей. У процесі збірки запити через клієнт 1С не виходять у мережу; відсутні вхідні дані повертають помилку, а перевірка після генерації відхиляє такий реліз. Перший запуск без підготовлених знімків зупиняється одразу з інструкцією `sync:catalog`. Для повторної збірки з тими самими даними достатньо `npm run build`.

Якщо синхронізація й збірка виконуються на різних машинах, переносіть як приватний артефакт `.cache/build-inputs/`, `.cache/seo-counts.json`, `.cache/product-sitemap*.json`, `.cache/auto-model-sitemap.json`, `.cache/auto-model-breakdowns/`, `app/generated/group-preview-manifest.ts` і `public/group-previews/`. Вхідні відповіді 1С не можна публікувати в `public/` або комітити. Змінні `ONEC_BUILD_SNAPSHOT_ONLY` і `ONEC_RECORD_BUILD_SNAPSHOTS` встановлюються сценаріями лише для дочірнього процесу; не додавайте їх до PM2 runtime env. Після запуску сайту звичайні API та ISR використовують живі дані.

Поки знімки не покривають усіх запитів статичної генерації, на сервері збірка запускається з `ONEC_BUILD_LIVE_FALLBACK=1`: запит без знімка йде в живу 1С і записується для наступної збірки, а не рендерить сторінку із заглушки 503.

`npm run build:refresh` об’єднує синхронізацію й збірку; `npm run build:full` також оновлює merchant feed. `npm run build:compile` перевіряє компіляцію без генерації сторінок і без доступу до 1С; це перевірка CI, а не готовий реліз зі статичними сторінками.

Для першого запуску замініть `pm2 restart` на `pm2 start`.

Production-аудит показує 0 вразливостей; повний аудит містить 15 moderate в інструментах розробки. Стан і сумісність виправлень описані в [перевірці залежностей](dependency-security.md).

```bash
pm2 status
curl --fail --silent --show-error --output /dev/null --write-out 'HTTP %{http_code}\n' http://127.0.0.1:3000/
pm2 logs partson-web --lines 50 --nostream
pm2 logs partson-auth --lines 50 --nostream
```

## Правила Firestore

Зміни правил для читання замовлень адміністратором публікуються окремо від Next.js. `firebase.json` посилається на `firestore.rules`. Виконайте на машині з доступом до потрібного Firebase-проєкту:

```bash
npx firebase-tools login
PARTSON_FIREBASE_PROJECT=$(node --env-file=.env.local -p 'process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || ""')
npx firebase-tools deploy --only firestore:rules --project "$PARTSON_FIREBASE_PROJECT"
```

Адміністратор, який читає замовлення з браузера, повинен мати `role: "admin"` у `users/{uid}`; правила Firestore перевіряють цю роль.

Значок адмінських сповіщень використовує захищений `/api/admin/notification-counts` та Firebase Admin SDK. Він отримує агреговані кількості, оновлюється раз на 20 секунд у видимій вкладці, при поверненні до неї та після змін у відкритій адмінській панелі. Повні колекції завантажуються лише у відповідній панелі. Для цього маршруту потрібні ті самі Admin SDK credentials, що й для наявних адмінських API; зміна правил Firestore не потрібна.
