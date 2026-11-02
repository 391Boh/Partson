# SEO каталогу та навігація фільтрації

`app/lib/catalog-page-seo.ts` визначає заголовки, canonical, індексацію,
хлібні крихти й ідентичність CollectionPage для `/katalog`. Метадані та
розмітка надходять у серверному HTML. Наявні короткі таймаути першої
вибірки, паралельне завантаження довідників і захист приватних цін збережені.

## Адреси та індексація

- `/katalog`: `index,follow`, canonical на `/katalog`.
- Лише рекламні мітки (`utm_source`, `utm_campaign`, інші явно дозволені UTM,
  `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `dclid`, `srsltid`):
  ті самі індексація та canonical. Мітки не змінюють товари й не створюють
  окремі сутності JSON-LD. Збір атрибуції на клієнті працює як раніше.
- Пошук, фільтри, сортування, акції, невідомі параметри: `noindex,follow`.
  Наявна політика не створює необмежений набір індексованих комбінацій.
  Виробник, категорія й автомобіль зберігають canonical на відповідні чисті
  посадкові сторінки. Якщо джерело підтвердило відсутність виробника,
  canonical не спрямовується на сторінку виробника з 404.
- `?page=` залишається клієнтською навігацією, `noindex,follow`: сервер
  поки повертає початкову вибірку. Для індексованої пагінації спочатку
  потрібні різні серверні вибірки та звичайні посилання на кожну сторінку;
  самостійна зміна canonical не реалізує цього.
- Фільтровані адреси не закриті в robots.txt: робот може прочитати noindex.

## Вміст і структуровані дані

Видимі хлібні крихти та BreadcrumbList використовують одне джерело.
CollectionPage описує відкритий список (`pagePath`), навіть коли canonical
пропонує іншу чисту посадкову сторінку. CollectionPage посилається на свої
BreadcrumbList та ItemList; останній додається тільки за наявності
публічних товарів у серверній вибірці. Порядок ItemList — Unordered,
оскільки початкова видача не гарантує сортування за зростанням.

Опис CollectionPage збігається з meta description. Акційний каталог має
власні title, опис і H1. Product/Offer залишаються на сторінках окремих
товарів, а не додаються до багатотоварного каталогу.

## Списки фільтрів

`useRowCappedList` обмежує вертикальні списки чотирма фактичними рядами.
`FilterListNavigation` показує видимий діапазон і кнопки попередніх/наступних
пунктів тільки для списку з переповненням. Ці кнопки не змінюють URL чи
вибрані фільтри. Підтримуються прокрутка пальцем, колесом і клавіатура;
для reduced motion переміщення миттєве. Кнопки мають зону натискання від
44×44 px, спільні градієнти, стани натискання та видимий фокус.

Перевірки:

```sh
node --import tsx scripts/test-catalog-page-seo.mjs
TEST_ORIGIN=http://localhost:3117 node --import tsx scripts/test-catalog-filters.mjs
```

Офіційні джерела:
[canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls),
[BreadcrumbList](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb),
[фасетна навігація](https://developers.google.com/crawling/docs/faceted-navigation),
[пагінація](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).
