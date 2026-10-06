# Перевірка залежностей — 6 жовтня 2026

Оновлено Next.js до 16.3.8, ESLint-конфігурацію Next.js до 16.3.8 та сумісні транзитивні залежності (`proxy-addr`, `fast-uri`, `source-map-js`, `brace-expansion`). Override `@grpc/grpc-js: ^1.14.5` забезпечує виправлену версію для Firebase та Firebase Admin SDK.

Результат перевірки оновленого lock-файлу:

- `npm audit --omit=dev`: 0 знайдених вразливостей.
- `npm audit`: 7 high, 0 critical. Усі сім попереджень — один ланцюжок `braces` → `micromatch` → ESLint/Tailwind та їхні залежності розробки.

## Невиправлена залежність розробки

Для [`braces`, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) виправленої опублікованої версії на дату перевірки немає. Зберігайте інструменти збірки на довірених шаблонах проєкту та оновіть залежності після публікації upstream-виправлення. Кількість попереджень npm враховує і транзитивні пакети, що залежать від уразливого пакета.

`npm audit fix --force` пропонував відкотити деякі прямі залежності до інших версій, зокрема ESLint-конфігурацію Next.js до 14.x. Це може порушити сумісність із Next.js 16. Використовуйте перевірений `package-lock.json` через `npm ci`.

Інструменти розробки потрібні для `npm run build`; `npm ci --omit=dev` перед збіркою не встановить ESLint та Tailwind CLI.

## Джерела виправлень

- [Next.js ImageResponse: виправлення з 16.3.6](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).
- [gRPC: виправлення в 1.13.6 та 1.14.5](https://github.com/advisories/GHSA-m9gg-hp2v-232j).
- [proxy-addr: виправлення з 2.0.8](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
