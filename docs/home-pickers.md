# Вибір авто, категорії й виробника на головній

Три окремі секції з узгодженим оформленням. На широкому екрані заголовок і пошук ліворуч, результати праворуч. На телефоні заголовок та керування передують карткам. Назви марок і виробників тепер видно під логотипами; кроки вибору авто компактніші.

Спільний заголовок: `HomePickerHeading.tsx`. Стилі `home-picker-*` обмежені `.home-static`; збережені палітра, шрифти, зображення товарних категорій і логотипи. На прохання користувача повернуті фонові зображення: автомобільні логотипи на синьому тлі, фотографії деталей на світлому та виробники на темно-бірюзовому. Фони нерухомі; локальне наведення карток враховує reduced motion. Вибрані моделі й модифікації розміщені на світлій панелі, підписи року адаптовані до темного тла. Розміри віртуальних сторінок категорій і виробників відповідають новим карткам, тому не залишають зайвого порожнього місця.

Логіка автомобіля, моделей, року/двигуна, категорій, виробників і посилань у каталог збережена. Геометрію перевірено на мобільному й широкому екрані; сценарії пошуку, порожнього результату, пагінації, вибору марки та деталей виробника — у браузері.

Перевірки: ESLint і TypeScript успішні; браузерний сценарій `scripts/test-home-picker-flow.mjs` проходить на 320, 768 та 1440 px. Візуальна перевірка виконана на 390/1440 px. Регресійний тест карти на 390/1440 px підтверджує завантаження після зупинки прокрутки та сталу висоту картки.

Опублікований реліз: `/var/www/Partson-release-20261023-pickers`; попередній `/var/www/Partson-release-20261023-scroll-map` збережений. Повна серверна збірка завершила 887/887 сторінок. Перед перемиканням перевірено головну, каталог, товар і 25 JS/CSS-файлів. PM2 web, nginx і cron перемкнені, auth лишився без перезапуску. Конфігурації для відкату: `/root/partson-deploy-20261023-pickers/`.

На сервер перенесені лише три компоненти вибору, новий спільний заголовок та стилі `home-picker-*`; інші локальні зміни глобального CSS не публікувалися. Залежності та сумісні кешовані зображення повторно використані через hard links. Збірочний кеш очищено; відновлюваний route-cache найстарішого неактивного релізу `20261020-17f61be` скорочений із 945,3 до 99,8 МБ штатним скриптом. Код, build seed, статичні файли, журнали й резервні копії збережені; після деплою вільно приблизно 1,6 ГБ.

Оновлення фонів: ESLint, TypeScript, дев’ять сценаріїв вибору й обидві перевірки карти пройшли локально. Повернення всіх трьох фонів додатково перевірене за DOM і computed style. Контрольний прогін native touch-scroll у Chrome з CPU ×4 дав p95 кадру приблизно 16,8 мс до та після; частка кадрів >33,5 мс після становила 0,7–1,4%. Це один лабораторний прогін, а не гарантія FPS на кожному телефоні. Фони не мають обробників scroll/RAF; перераховуються лише при resize/orientationchange.

24.10.2026: опубліковано `/var/www/Partson-release-20261023-picker-scenes`. Перед перемиканням перевірено три видимі фони, 38 файлів сторінки та всі дев’ять сценаріїв вибору. PM2/nginx/cron перемкнені, auth не перезапускався; rollback — реліз `20261023-pickers`, резерв конфігурацій `/root/partson-deploy-20261023-picker-scenes`.

24.10.2026 — наступна ітерація, лише локально, без деплою за прямою вказівкою користувача. Зменшена зарезервована висота авто з 530 до 420 px на desktop, список вирівняний по центру відносно пошукової колонки. У списках марок, виробників і категорій спільна права колонка навігації, у моделях обидві стрілки також праворуч. Збережені swipe, keyboard focus, disabled-стани та лічильники. Нова градієнтна прозорість карток, світлі блакитні/крижані/м’ятні фони. Існуючі SVG-маски перефарбовані, фотографії деталей отримали плавне маскування; нових фотографій/логотипів не генерували. Усі стилі обмежені головною, shared SectionPagination отримав лише semantic class; глобальні каталожні стилі не змінені.

Прибрана порожня нижня обгортка homepage-варіанта Auto (фільтровий варіант збережений). Права навігація — прямий нащадок списку, щоб старі reveal-ефекти footer не зміщували її й не накладали на картки. Мінімальна висота mobile авто/виробників 620 px, категорій 700 px; фактична висота зростає під довгий вміст. Моделі перевіряються з реальними даними BMW через read-only запити до публічного API; це лише мережевий маршрут браузерної перевірки, не зміна коду доступу до даних.

Локальна перевірка цієї ітерації: ESLint і TypeScript успішні, CSS та production compilation/generate-env завершені. Дев’ять сценаріїв пошуку/пагінації на 320/768/1440 px пройшли, у тест додано перевірку, що навігація розміщена праворуч від scroll-області. Перегляд: http://localhost:3102. На сервер у цій ітерації нічого не переносили й не перемикали.
Моделі BMW: розташування стрілок, перехід вперед/назад успішні на 390/1440 px. Карта: обидві регресійні перевірки успішні, монтується один раз після 373–375 мс спокою, геометрія стабільна.

Наступна локальна ітерація за уточненням користувача: попередня/наступна стрілки з обох боків списків, окремий мінімалістичний лічильник під картками (номер, загальна кількість і тонкі роздільники). Спільний SectionPagination лишається звичайною inline-пагінацією за межами головної; homepage використовує display: contents для розділеного розміщення кнопок і лічильника. Моделі мають ті самі стрілки й нижній лічильник. Напрямки фону: 135° авто, 35° категорії, 225° виробники; статичні низькоконтрастні фактури походять із наявних фото амортизатора, ременя ГРМ та фільтра. На телефонах до 480 px марки авто у трьох колонках, щоб зберегти читабельні підписи. Деплой не виконувався.
Підтверджений вигляд після однієї корекції: desktop авто 420 px, категорії 477 px, виробники 400 px. На 390 px авто має три колонки з повними підписами; додаткова висота зайнята картками. Фактури поширені на всю секцію з плавною маскою, без різкого вертикального краю. Модельні стрілки перевірені по обидва боки, перехід вперед/назад успішний на 390/1440 px. ESLint, TypeScript і локальна production compilation успішні.
Усі дев’ять фінальних сценаріїв на 320/768/1440 px успішні: пошук, порожній результат, пагінація, категорії й деталі виробника; геометрія перевіряє обидві бічні стрілки й лічильник під swipe-областю. Зміни залишаються лише локальними на http://localhost:3102.

Останнє уточнення, локально без деплою: бічні стрілки тепер без рамок, круглих підкладок і тіней, із 44 px областю натискання та видимим keyboard focus. Нижній рядок: зліва підпис і номер/кількість сторінок, справа посилання «Усі…». Для категорій підпис містить їхню кількість; для моделей додане посилання «Усі моделі» через buildAutoBrandPath. Сітка footer вирівнює обидві частини в одному рядку на мобільному й desktop. Фони з попередньої ітерації збережені. ESLint/TypeScript та локальна production compilation успішні, перемикання моделей 390/1440 px перевірене.
Усі дев’ять фінальних браузерних сценаріїв 320/768/1440 px пройшли. Тест перевіряє прозорий фон/відсутність рамки й тіні стрілок, розміщення підпису перед значенням, лічильник ліворуч від посилання й однакову висоту рядка, поряд зі сценаріями пошуку та пагінації.

Останнє вирівнювання (без деплою): нижній рядок має три колонки — «Доступно» та актуальна кількість елементів ліворуч, номер/кількість сторінок точно по центру, посилання «Усі…» праворуч. Кількість відображає поточний відфільтрований список марок, моделей, виробників чи категорій. Центральне положення забезпечують однакові бічні fr-колонки, незалежно від довжини посилання. На 320 px іконка перед посиланням прихована, текст лишається читабельним. ESLint/TypeScript і production compilation успішні; візуальна перевірка 390/1440 px та модельна пагінація пройшли.

Прибрані дублікати «Доступно для пошуку» біля полів пошуку в Auto/Brands/tovar. Єдине значення кількості лишається під відповідним списком. SectionPagination з availableCount відображає footer також для однієї сторінки; моделі мають footer за наявності хоча б одного результату. Застарілий formatter виробників після видалення верхнього лічильника прибраний. Лише локальні зміни, без деплою.

Завершена локальна ітерація пошуку: усі три search-area перенесені з вступної колонки до результатів, безпосередньо над відповідним списком; Auto автоматично перемикає пошук марки/моделі. Збережене спільне оформлення HomePickerSearchControl; його верхній лічильник вимкнений (count=null), кількість лишається один раз унизу. Нижня доступність уточнює сутність із правильними відмінками: марки, моделі, категорії/групи, виробники. Для довгих підписів на вузьких екранах дозволено два рядки в лівій колонці, сторінки лишаються по центру. Перевірено 390/1440 px та перемикання моделей BMW. Під час перевірки локальний preview не бачив нові stylesheet-файли після оновлення manifest; повторна збірка й перезапуск усунули 404, обидва CSS підтверджено 200. Деплой не виконувався.

Пошук у компактному footer: маленька кнопка «Пошук» стоїть у рядку з центральними сторінками та правим посиланням «Усі…». Єдиний підпис доступності лишається дрібним рядком безпосередньо над цими діями. При активації поле відкривається над списком; пошук марок/категорій/виробників та моделей використовує існуючі input-компоненти. Для моделей додані необов’язкові onOpenSearch/searchExpanded, каталожні embeds збережені. Прибрано стару декоративну progress-смужку з footer після додавання нової кнопки. Default desktop min-height авто/категорій/виробників — 360/480/400 px. ESLint/TypeScript і локальна збірка успішні; відкриття пошуку моделей і пагінація перевірені на 390/1440 px. Геометрія regression перевіряється після завантаження шрифтів/завершення короткого reveal, щоб не порівнювати координати з різних фаз появи. Без деплою.

Фінальне перенесення панелі НАД списками: компактний пошук ліворуч, сторінки по центру та «Усі…» праворуч тепер перед картками в layout і DOM. Стрілки залишені збоку карток, доступність — один раз під ними. Поле пошуку справді замінює кнопку в toolbar-slot через React portal; desktop розширює той самий слот, mobile розгортає його на окремий повноширинний рядок тієї самої панелі. Для моделей застосований той самий slot-ref. HomePickerSearchControl зберігає спільний вигляд. AutoBrandSearchInput отримав defaultValue, щоб введений текст не зникав, коли порожній результат тимчасово прибирає slot; відновлення після порожніх запитів перевірене для моделей на 390/1440 px. Порядок DOM відповідає клавіатурній навігації: панель перед картками. ESLint/TypeScript і локальна production compilation успішні. Деплою немає.

### Availability summary above lists (local only)
- Grouped “Доступно” with the entity count and all-items link at the upper right for makes, models, categories and manufacturers.
- Search button and expanded input share a stable 240px width on desktop; both use the full toolbar width on mobile, with centered pagination above.
- Preserved side navigation and existing background treatments. Checked desktop/mobile captures, model search recovery, ESLint, TypeScript and production compilation. No deployment.

### Typography and field styling (local only)
Unified heading size, line height, description width/spacing, and top alignment with the lists. Kept the established display face and factual copy. Underlined title accents connect with blue vehicle controls, cyan category controls and green manufacturer controls. Search fields, year selection, directory links and availability values share those accents; keyboard focus remains visible. Static CSS rebuilt for local preview; no deployment.

### Depth and stronger hierarchy (local only)
Enlarged picker headings to 36px desktop / 28px mobile (26px on very narrow phones); used an explicit scoped heading selector to override the shared site heading scale. Descriptions use 15px, stronger contrast and 20px separation. Added restrained directional shadows beneath search, year controls, selected steps and translucent item cards, with stronger elevation on desktop hover. Kept static backgrounds, existing links, controls and the local-only restriction.

### Clearer list toolbar (local only)
Increased current-page and availability-value emphasis, strengthened search with a solid section-colored icon, and unified directory-link type. On mobile the availability label and count stack above their directory link so long manufacturer units remain readable beside centered page values. Kept search/input widths stable and bare side arrows. Local CSS preview only; no deployment.

### Combined directory summary, aligned to cards (local only)
Combined availability/count and the all-items action into a single link (“Доступно 202 виробники →”), removing the separate visible duplicate label. Toolbar edges follow the cards rather than side-arrow hit areas. On desktop search, pages and summary share a row; mobile preserves the single-line summary with page values above the full-width search. No deployment.

### Stronger background artwork (local only)
Raised vehicle-logo opacity multiplier from 1.25 to 2.2, manufacturer marks from 1.35 to 2.3 and category parts from 2.35 to 3.4. Deepened the blue/green logo-mask colors while preserving static positioning, the light copy-side veil and translucent cards. No deployment.

### Non-overlapping background composition (local only)
Assigned each car/manufacturer logo and part its own proportional slot, with separate desktop/mobile arrangements and explicit gaps. Removed decorative rotations and overlaid material photographs so foreground background-art images cannot intersect. Preserved stronger opacity and copy-side light washes. Checked pairwise artwork bounds in all three sections at 320, 390, 768 and 1440px: no overlaps. Static CSS build passed; no deployment.

### Irregular artwork placement (local only)
Replaced uniform background rows with authored asymmetric positions, varied sizes and restrained rotations. Separate mobile compositions keep the scatter deliberate and static. Checked rotated image bounds pairwise at 320, 390, 768 and 1440px across all three pickers: zero intersections. CSS build passed; no deployment.

### Gradient transparency on list items (local only)
Added two-layer translucent surfaces to car makes, models, categories and manufacturers: directional white highlights, clearer edges and a tinted lower wash behind labels. Angle/tint varies by section (blue 145°, cyan 35°, green 215°). Hover/selection strengthen the highlight while preserving text/icon opacity. No blur or animation added. Static CSS rebuilt; checked desktop/mobile captures. No deployment.

### Larger category/group artwork (local only)
Enlarged category illustrations from 58px to 104px desktop / 88px mobile (constrained to card width on narrow phones). Cards are now 200px desktop / 184px mobile, with a 112/96px image zone, aligned captions and lighter count badges. Group product photos use the full image zone instead of the former 58px cap; mobile group cards reserve 200px and put the arrow beneath a full-width caption. Preserved translucent surfaces. Checked roots and opened groups at 1440/390/320px; no deployment.

### Compact category icons and reversed section layout (local only)
Restored category icons to 56px and compact cards to 152px desktop / 144px mobile, retaining the larger product-group photos. Moved the category results before the title/description in JSX and visual layout: list left / introduction right on desktop, list before introduction on mobile. Other pickers unchanged. ESLint and TypeScript passed; no deployment.

### Compact groups without layout shifts (local only)
Matched product-group card heights to categories (152px desktop / 144px mobile), with 76/70px photo areas, full-width 12px captions and compact arrows. Fixed photo/caption rows reserve space even while preview images load. Reserved consistent toolbar/footer rows across category → group transitions. Browser measurements at 1440, 390 and 320px confirmed identical list/card/section heights and unchanged list/description positions before and after opening groups. Static CSS rebuilt; no deployment.

### Centred introduction blocks (local only)
Vertically centred the heading/description rails alongside all three lists at desktop/tablet widths; preserved mobile stacking and the reversed category layout. Static CSS rebuilt; no deployment.

### Aligned groups and nested subgroups (local only)
Made card grid tracks explicitly fill the available width, fixing narrow left-aligned photo/caption columns and centered arrows. Preview wells now have consistent rounded corners and a light wash; photographs center within them. Names reserve two lines at the same baseline; subgroup counts align below, with reserved space before the bottom-right arrow. Preserved 152/144px heights and stable category→group layout. Checked groups and actual nested engine subgroups at 1440/390/320px; static CSS build passed. No deployment.

### Hover sharpness and gradient transition (local only)
Added 0.9px blur only to backdrop logos/parts. Fine-pointer hover and keyboard focus remove it over 550ms while a section-colored gradient overlay crossfades and shifts over 700–900ms. Each picker has its own direction/palette; no continuous animation or image movement. Reduced-motion disables transitions. Scoped overrides retain general site scroll-performance rules elsewhere. No deployment.

### Harmonised accents, transitions and section copy (local only)
Unified section-colored card elevation, focus outlines, search hover and navigation states while retaining blue/cyan/green identities, translucent cards and the hover-sharpening background treatment. Added short 12px blending seams and reduced section padding to 24px without changing stable category/group geometry. Updated H2s to “Підбір запчастин за маркою авто”, “Автозапчастини за категоріями” and “Автозапчастини за виробником”; descriptions explain actual selection paths with relevant parts terminology and live catalog counts, without new commercial claims. Root metadata unchanged. ESLint/TypeScript and production build passed; browsing flow passed all 9 scenarios at 320/768/1440px, desktop/mobile captures checked, category/group geometry remained stable at 320/390/1440px. No deployment.

### More prominent search action (local only)
Search buttons now use section-colored solid gradients, white labels, inset translucent icon tiles and a subtle desktop chevron. Hover deepens the gradient and elevation; opened fields return to a clear light surface in the same slot. Checked all three controls at 320/1440px: content fits, fields open and accept input, widths stay unchanged. Static CSS build passed; no deployment.

Search transparency refinement (local only): button gradient stops now use 78–86% opacity with darker accent tints; hover uses 88–94%. White text/icons stay fully opaque, and field dimensions remain unchanged. Static CSS rebuilt; no deployment.

### Vehicle modification and selected-car summary (local only)
Added 8px to section top padding (32px total). Unified modification choices, filter chips, bare navigation arrows and confirmation action with the blue catalogue styling; mobile choices use two columns. Confirmed-auto summary uses a light translucent surface, readable wrapped labels, compact parameter badges and matched actions. Other saved cars are aligned rows. Hid the make/model search in modification/confirmed steps, and replaced completed-step year/instructions with a concise catalogue prompt. Saved-vehicle panels inside homepage scope share the same palette. ESLint/TypeScript and production build passed. Live directory returned no modifications for the probed model/year; full browser-only fixture flow validated model→year→parameters→confirmation, two saved rows and adding another car at 1440/390px. No production/1C data or deployment changes.

### Stable vehicle states and saved-car removal (local only)
Fixed the vehicle results area to 400px desktop / 460px mobile and reserved a stable mobile introduction row. All steps keep the same section/layout height; overflow in long lists stays inside the block. Mobile results align at the top to reduce the gap before the selected-car summary. The selected title now shows make/model/year, with modification details once in compact badges. Added accessible removal controls for current and other saved cars, reusing the existing selection/persistence path and resetting the picker after current-car removal. Added scripts/test-home-auto-summary.mjs with browser-only fixtures: 1440/390px checks for unchanged geometry, nonduplicated specs, removal of individual/current cars, and persisted remaining selection. ESLint/TypeScript, production build and regression passed. No deployment.

### Crisper headings and descriptions (local only)
Strengthened introduction hierarchy with dark ink headings up to 38px, section-colored 3px underlines and a restrained single highlight instead of the previous diffuse text shadow. Descriptions use darker 15px text, consistent spacing and clearer emphasis on key phrases. Checked all three sections at 1440/390/320px for unclipped text and centered introduction rails; stable auto-summary/removal regression also passed. Static CSS rebuilt; no deployment.

### Editorial revision for relevant search intent (local only)
Reworked default H2s to “Запчастини за маркою та моделлю”, “Каталог запчастин за категоріями” and “Виробники автозапчастин”. Descriptions explain the actual selection steps and next action; removed repeated generic phrasing and unsupported quality claims. Dynamic make/manufacturer counts use correct Ukrainian plural forms. Existing H1, metadata and selection-state headings remain unchanged. Applied Google Search Central's people-first content guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content . This is a copy improvement, not a ranking forecast. ESLint/TypeScript and build passed; checked all three sections at 1440/390/320px for text fit. No deployment.

### Larger vehicle navigation and compact homepage bottom sections (local only)
Increased vehicle step buttons to 58px desktop / 66px mobile, enlarged number/value text and moved mobile labels beneath their step icons. Preserved fixed picker geometry and selection behavior.

Reworked AdvantagesSection into a concise server-rendered store overview: one full-width workshop background, clear store/location copy, three short assortment rows, existing map/contact panel and one help action. Replaced overlapping decorative photo layers with a static object-fit:cover image; map loading logic remains unchanged.

Popular catalogue links now have one short introduction, twelve directly visible category links, and native expandable make/manufacturer lists. All 40 item links plus directory links remain in server HTML. Removed redundant commercial copy and hardcoded sales counters, reset the old desktop six-row subgrid, and restored a visible full-width workshop photo. Measured popular-section height is 488px desktop / 746px at390 / 790px at320; store section is611px desktop with its map and contacts preserved.

Validation: ESLint, TypeScript and production build passed. Checked desktop/mobile visuals at1440/390/320, catalogue link coverage, keyboard disclosure behavior, stylesheet loading and horizontal overflow. Updated map regression for the single static photo; map mounts once after scroll quiet time without resizing. Stable auto-summary/removal regression passed after navigation changes. No deployment.


### Store photos and immediate official map
Removed the popular-links section from homepage rendering. Replaced the decorative workshop backdrop with original storefront and display photographs, kept relevant assortment copy and three server-rendered directory links. The official Google map now renders immediately in a reserved frame, supports interaction and has a separate route link. This explicitly supersedes the previous delayed-map behavior for this section. Local only; lint, TypeScript, production compilation and mobile/desktop checks passed.


### Homepage loading performance
- Removed the nested backdrop chunk/intersection waterfall. Each picker prepares and decodes its own artwork alongside its dynamic code, with low network priority and a bounded 1.8s wait. Decorative failure cannot block the catalogue.
- Preparation uses DOM readiness and idle scheduling independently of Google Maps/window.load; retain proximity loading and staggered commits instead of eagerly mounting all pickers.
- Removed 541 lines of obsolete backdrop motion/geometry machinery; existing CSS placement and hover styling stay intact.
- Store content renders visible in server HTML; storefront image has a responsive 768px source.
- Font faces are defined exactly once in the server head rather than duplicated in critical and deferred stylesheets. A cold, throttled run exposed a small late metric swap before this fix. Keep font-display:optional and the existing font preload.
- Verification uses scripts/test-home-background-loading.mjs with deliberately stalled Google Maps and optional HOME_TEST_SLOW=1 (80ms latency, 4Mbps download, 4× CPU). Measurements are local lab results, not field/PageSpeed scores. No deployment.

Validation: production build, targeted ESLint and TypeScript passed. Delayed-content layout checks at 320/390/768/1440px recorded CLS 0. Throttled checks at 390/1440px passed with CLS 0 / 0.000437, stable section heights of 860 / 484px, and catalogue readiness while Maps was deliberately held pending. These are local measurements; no production score is claimed.


### Store editorial and questions
Refined the store overview with a shared heading, left-hand desktop Google map and right-hand two-photo gallery/assortment. On mobile copy remains first. Matched the help area to the section palette and added three compact, keyboard-accessible native questions about selection, collection and delivery; answers are present in server HTML. Eager map loading, fixed photo/frame dimensions and existing contact/catalogue links are retained. Local only.


### Faster homepage article preview
Replaced the 600ms server race with a streamed result and a shared compact-highlight cache (600s, blog-posts invalidation tag). Previously a cold database result could be discarded and retried after hydration, then text waited for cover decode. The first real article now appears independently of image decoding; identical API refreshes do not preload the same slide again. Subsequent slide changes still retain the previous decoded cover until replacement is ready. ESLint, TypeScript, production build and mobile/desktop first-paint checks passed. No deployment.


### SEO copy with a single store background
Replaced the repeated foreground storefront/display gallery with one different original shop photo (storefront/photos/bg/store-2.webp) behind the assortment copy. A directional light gradient protects text contrast; the absolutely positioned photograph does not change layout. Edited the main heading to “Автозапчастини у Львові”, simplified the introduction, clarified assortment headings and made the assistance copy more actionable. Desktop map remains left; FAQ stays native and keyboard accessible. Checked 1440/390/320px layouts, eager map/stable geometry, one background image, source asset loading, links, TypeScript, ESLint and production compilation. Follow-up is local only; production bc2a820 was not changed.


### Google 360° store tour before questions
Integrated the owner's Google photosphere in StoreVirtualTour immediately before the help/questions block. Verified the real PartsON interior in Google's iframe at 1440px and 390px, including attribution and native fullscreen controls. Preserve the full encoded photosphere ID; using its decoded image ID opens outdoor Street View instead. The original external link also needs the iu parameter (without it Google returns HTTP 400).

The viewer reserves a 440px/320px frame and loads only within 500px of the viewport, or after explicit activation. Before activation the iframe cannot capture page scrolling or keyboard focus. Start/finish controls preserve geometry and retain the existing iframe rather than reloading Google. scripts/test-store-virtual-tour.mjs passed at 1440/390/320px; targeted ESLint, TypeScript and production compilation passed. Current changes remain local; production bc2a820 is unchanged.


Tour visual polish: light directional header/footer gradients, compass accent, localized 2–3px corner blur clear of Google controls/credits, and an animated launch button with a single reveal and hover sheen. Blur disappears during interaction; prefers-reduced-motion disables animation. Desktop/mobile real-panorama inspection, 1440/390/320px interaction and geometry checks, reduced-motion checks, ESLint, TypeScript and production compilation passed. Local only, no deployment.


Facade-first tour: start at the linked exterior photosphere CAoSHENJQUJJaERweU82YUFqUGxzLVlzYjl1U2lUTm0=, heading 160°, pitch 0°. Verified the PartsON signage/entrance and Google navigation back inside. The outbound link now uses Google Maps map_action=pano with the same full panorama ID. This supersedes the previous interior start and iu-specific outbound-link requirement. No deployment.


### Homepage loading refinement
Tour: a 20KB original facade poster gives the reserved viewer immediate visual content while Google starts; the iframe preloads within 900px, with the same facade-first panorama and scroll/focus controls. Tightened header spacing; retained corner treatment and reduced-motion behavior. The official location map stays server-rendered and now uses native lazy loading, removing offscreen Google work from initial loading.
Blog: preload the first streamed article cover from server HTML, retain readable text independent of image/API completion, and defer the background refresh 2s when server articles already exist. No artificial delay for an empty result.
Verified 390/1440px real Google screenshots and full-page asset traversal: no HTTP errors, JS errors, broken loaded images or horizontal overflow; 320/390/1440px tour controls and stable geometry; first-article stalled-cover/API regression; map geometry; ESLint, TypeScript, production compilation. Local lab CLS 0 on mobile and desktop. No deployment.


### Blog timeout recovery
Removed eager console.error logging from the strict blog list accessor; callers still receive the rejection for ISR preservation. Homepage previews catch transient failures outside the persistent cache, retain the last successful in-process result, share one in-flight request, and wait 30s before retrying. Successful empty results still clear removed posts. Cold failures show the existing blog overview. No timeout increase or deployment. Regression test scripts/test-home-blog-cache.mjs covers failure, concurrency, cooldown, recovery and successful deletion; ESLint and TypeScript passed.


Information-card redesign: consolidated the detached SEO heading/intro into the photograph-backed assortment panel. One h2, local catalogue kicker, three numbered h3 rows, a primary catalogue action, secondary delivery link and compact directory navigation. Original 29KB shop photo stays lazy and decorative; no new client code. Preserved adjacent map/tour/help. Checked 390/1440px screenshots on the development server, headings/links, image decode and no horizontal overflow; ESLint, TypeScript and CSS compilation passed. No deployment.


Shared photographic frame: moved the single decorative shop image behind the entire location/assortment grid, including the map surround. Increased image visibility, added a translucent readable copy surface and coordinated map footer. Fine-pointer hover gently scales/saturates the photograph and fades a gradient overlay; no map controls or attribution are covered. Reduced-motion disables transitions/zoom; mobile uses the static treatment. Desktop-hover and mobile screenshots, image decode, heading/navigation counts, overflow, ESLint, TypeScript and CSS build passed. No deployment.


Full-component background: the single shop photograph now belongs directly to home-store-editorial and covers the complete section, including location, tour and help surrounds. Reserved content layers stay above it; responsive cover cropping, readability gradients, fine-pointer hover and reduced-motion behavior are preserved. Checked mobile/desktop section screenshots, single h2, navigation and overflow, plus ESLint/CSS build. Local only.


Natural-scale background and open layout: replaced the 600px cropped background with an optimized 765×1020 WebP from the original shop photo, capped at its native width with no cover stretch, filter or hover zoom. Edge masks blend into the section gradient. Removed decorative card borders/backgrounds/shadows from the grid, copy, tour shell and help; retained rounded actual map/panorama viewports. Hover changes photo opacity only. Mobile/desktop screenshots, headings/navigation/overflow, ESLint and CSS build checked. Local only.


Depth refinement: subtle top-left light, soft contact shadows under map and panorama, restrained heading shadow, button depth and highlighted rules. Open layout and natural-scale photo retained; no new containers, assets or JavaScript. Mobile/desktop screenshots and geometry checks, CSS build and diff checks passed. Local only.


Location/tour design refresh: added a compact location heading, unified address/contact/review footer with restrained star accent, matching typography and soft viewport shadows. Tour now has a small editorial kicker, a 360° heading, underlined Google link and a pill launch control with compass medallion. Preserved Google controls/attribution, facade start, activation/finish behavior and lazy loading. Real Google desktop/mobile screenshots, map layout checks and tour keyboard/geometry tests at 320/390/1440px passed, as did ESLint, TypeScript and CSS compilation. No deployment.
