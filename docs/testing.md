# Перевірки проєкту

Потрібні Node.js 22 та `npm ci`. Для браузерних перевірок встановіть Chromium командою `npx playwright install chromium` або використовуйте локальний Google Chrome.

```bash
npm run check
npm run build:compile
```

`check` готує локальні стилі й відсутні тестові generated-файли, потім запускає TypeScript, ESLint, автономні тести API/кешів/авторизації, браузерні тести з локальними fixtures та production-аудит залежностей. Браузерні fixtures перевіряють мобільну й десктопну геометрію, вікна, редагування, помилки, повторні спроби, відкладений CSS та знижені ціни рекомендацій. Вони підміняють Firebase/1С й не потребують production credentials. Список наборів — `scripts/test-suites.mjs`.

- `npm test` — автономні перевірки логіки.
- `npm run test:browser` — браузерні fixtures; `TEST_BROWSER_CHANNEL=chromium` примусово вибирає встановлений Playwright Chromium.
- `npm run test:all` — обидва набори.
- `TEST_ORIGIN=http://127.0.0.1:3110 npm run test:smoke` — переходи, каталог, фільтри й сторінка товару на явно вибраному preview-сервері. Для `next dev` додайте `TEST_SKIP_PREFETCH=1`.

Старі скрипти, що безпосередньо створюють/змінюють товари або перевіряють живу 1С, не входять у ці набори. Запускайте їх окремо лише з потрібною тестовою інтеграцією.

GitHub Actions (`.github/workflows/ci.yml`) виконує `npm ci`, встановлює Chromium, генерує fixture CSS, запускає `check` і перевіряє production-компіляцію. Жива синхронізація каталогу відокремлена від CI; повний реліз збирайте за [інструкцією деплою](deployment.md).
