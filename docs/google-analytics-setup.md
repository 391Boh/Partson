# Налаштування Google Analytics 4 для PartsON

Інтеграція підтримує два режими, але одночасно активується лише один:

1. **Google Tag Manager (`GTM-…`) — рекомендовано.** Контейнер є єдиним завантажувачем, а Measurement ID `G-…` налаштовується всередині GTM.
2. **Прямий Google tag (`G-…`) — простіший резервний варіант.** Використовується лише коли GTM ID не заданий.

Не підключайте GTM і окремий `gtag.js` вручну одночасно — це створить дублікати `page_view`, ecommerce-подій і доходу.

## 1. Створення GA4

1. Відкрийте [Google Analytics](https://analytics.google.com/).
2. Перейдіть у **Admin → Create → Property**.
3. Для магазину встановіть:
   - часовий пояс: `Europe/Kyiv`;
   - валюту: `UAH`;
   - одну property для основного сайту.
4. Відкрийте **Data streams → Add stream → Web**.
5. Вкажіть production-домен PartsON і створіть потік.
6. Скопіюйте **Measurement ID** формату `G-XXXXXXXXXX`.

Офіційна інструкція: [Set up Analytics for a website](https://support.google.com/analytics/answer/14183469).

## 2. Рекомендований варіант через GTM

У production environment задайте:

```env
NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID=GTM-XXXXXXX
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
NEXT_PUBLIC_ANALYTICS_ENABLE_IN_DEVELOPMENT=0
NEXT_PUBLIC_ANALYTICS_DEBUG=0
```

Коли є валідний `GTM-…`, код використовує лише GTM. `G-…` залишається документованим Measurement ID, але окремий `gtag.js` не завантажується.

Після зміни `NEXT_PUBLIC_*` потрібна нова production-збірка та перезапуск застосунку.

### Google tag у контейнері

1. Відкрийте [Google Tag Manager](https://tagmanager.google.com/).
2. Створіть або відкрийте Web container.
3. Створіть тег типу **Google tag**.
4. Укажіть Tag ID `G-XXXXXXXXXX` із GA4 web stream.
5. Додайте configuration parameter `send_page_view` зі значенням `false`.
6. Trigger: **Initialization — All Pages** із обмеженням на production hostname.

Код сайту сам надсилає один початковий і кожний наступний SPA `page_view`. Тому в GA4 web stream у **Enhanced measurement → Page views → Advanced settings** вимкніть автоматичні page views від змін browser history. Інакше переходи Next.js рахуватимуться двічі.

Офіційно: [Measure single-page applications](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications).

### SPA page_view

Створіть Data Layer Variables:

- `DLV - page_location` → `page_location`;
- `DLV - page_path` → `page_path`;
- `DLV - page_title` → `page_title`;
- `DLV - page_referrer` → `page_referrer`;
- `DLV - page_type` → `page_type`.

Створіть GA4 Event tag:

- Event name: `page_view`;
- Trigger: Custom Event `virtual_page_view`;
- Event parameters: змінні зі списку вище.

### Ecommerce events

Створіть GA4 Event tag:

- Event name: `{{Event}}`;
- увімкніть **Send ecommerce data**;
- Data source: `Data Layer`;
- Trigger — Custom Event із регулярним виразом:

```text
^(view_item_list|select_item|view_item|add_to_cart|remove_from_cart|view_cart|begin_checkout|add_shipping_info|add_payment_info|purchase)$
```

Перед кожною ecommerce-подією сайт очищає попередній `ecommerce` object, тому параметри різних дій не змішуються.

### Пошук, авторизація, контакти й ліди

Додайте ще один GA4 Event tag з Event name `{{Event}}` і trigger:

```text
^(search|view_search_results|login|sign_up|generate_lead|contact_click|web_vitals)$
```

Для потрібних параметрів створіть Data Layer Variables і передайте їх як event parameters:

- `search_term`, `search_filter`, `search_source`, `results_count`;
- `method`;
- `lead_source`, `lead_type`, `product_id`;
- `contact_method`, `contact_role`, `placement`;
- `metric_name`, `metric_value`, `metric_rating`.

## 3. Простий варіант без GTM

Якщо не потрібне керування тегами через GTM, залиште GTM ID порожнім:

```env
NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID=
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
```

Після rebuild сайт сам завантажить Google tag і напряму надсилатиме `page_view`, ecommerce, пошук, авторизацію, контакти та Web Vitals. Додаткові теги в GTM у цьому режимі не потрібні.

## 4. Consent Mode v2

Сайт до завантаження Google tag задає:

- `analytics_storage: denied`, доки користувач не дозволив аналітику;
- `ad_storage: denied`;
- `ad_user_data: denied`;
- `ad_personalization: denied`.

Вибір зберігається у first-party cookie на 180 днів. Користувач може змінити його через footer або сторінку конфіденційності. До згоди аналітичні cookies не встановлюються; у режимі Consent Mode можливі обмежені сигнали без cookies. Не додавайте другий consent-тег у GTM без узгодження з цією реалізацією.

Офіційно: [Set up consent mode](https://developers.google.com/tag-platform/security/guides/consent).

## 5. Події, які надсилає сайт

Основна ecommerce-воронка:

```text
view_item_list → select_item → view_item → add_to_cart
→ view_cart → begin_checkout → add_shipping_info
→ add_payment_info → purchase
```

Додатково:

- `remove_from_cart`;
- `search`, `view_search_results`;
- `login`, `sign_up` без email або телефону;
- `generate_lead` після заявки, запиту ціни або першого успішного повідомлення у чаті;
- `contact_click` для дзвінка, Viber, Telegram і карти;
- `web_vitals` для LCP, CLS, INP та інших метрик.

Товарні події містять стабільний `item_id`, назву, бренд, ієрархію категорій, артикул як `item_variant`, ціну, кількість, список і позицію. `purchase` має унікальний `transaction_id` і дедуплікацію через Firestore та session storage.

## 6. Налаштування в GA4

У **Admin → Data display → Custom definitions** створіть event-scoped custom dimensions для:

- `page_type`;
- `search_filter`, `search_source`, `results_count`;
- `lead_source`, `lead_type`;
- `contact_method`, `contact_role`, `placement`;
- `metric_name`, `metric_rating`.

У **Admin → Events / Key events** позначте як key events:

- `purchase`;
- `generate_lead`;
- за потреби `sign_up`.

`add_to_cart` і `begin_checkout` краще залишити звичайними подіями та використовувати у funnel exploration.

## 7. Перевірка перед публікацією

1. Для локальної перевірки тимчасово встановіть:

   ```env
   NEXT_PUBLIC_ANALYTICS_ENABLE_IN_DEVELOPMENT=1
   NEXT_PUBLIC_ANALYTICS_DEBUG=1
   ```

2. Запустіть [Tag Assistant](https://tagassistant.google.com/) або GTM Preview.
3. У GA4 відкрийте **Admin → DebugView**.
4. Пройдіть сценарій:
   - головна → каталог;
   - пошук → картка товару;
   - додавання у кошик;
   - checkout;
   - тестове замовлення.
5. Перевірте:
   - один `page_view` на один маршрут;
   - відсутність email, телефону, VIN та адреси у параметрах;
   - одна `purchase` з реальним `transaction_id`;
   - `currency = UAH`;
   - правильні `items`, `value`, coupon і item discounts.
6. Поверніть обидва debug/dev прапорці у `0` перед production deploy.

Офіційно: [DebugView](https://support.google.com/analytics/answer/7201382), [Validate ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/validate-ecommerce), [Measure ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce).

Стандартні звіти GA4 можуть заповнюватися 24–48 годин; для первинної перевірки використовуйте Realtime і DebugView.
