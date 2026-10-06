# Деплой PartsON на сервер із PM2

Виконуйте з каталогу проєкту на сервері. Потрібні Node.js 22, npm 10+, PM2 і налаштований `.env.local` (1С, Firebase Admin SDK, Telegram та інші інтеграції). Конфігурація `ecosystem.config.js` запускає `partson-web` на порту 3000 та `partson-auth` на порту 3001.

```bash
git pull --ff-only origin main &&
npm ci &&
BUILD_CPUS=1 npm run build &&
pm2 restart ecosystem.config.js --update-env &&
pm2 save
```

`&&` не дозволяє перезапустити процеси після невдалої збірки. `BUILD_CPUS=1` обмежує кількість робітників Next.js для сервера з невеликим обсягом пам’яті. Збірка також генерує стилі, прев’ю груп, SEO-лічильники та sitemap моделей авто; останній крок генерації може тривати кілька хвилин.

Для першого запуску замініть `pm2 restart` на `pm2 start`.

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
