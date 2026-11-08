import { ViewTransition, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  ChevronRight,
  CreditCard,
  Info,
  MapPin,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import {
  INFORMATION_SECTION_ACCENTS,
  INFORMATION_UPDATED_AT,
  getInformationHeroPhoto,
  getInformationPath,
  informationSections,
  type InformationSectionKey,
} from './section-config';
import { sectionContent } from './sections';
import { PHONE_DISPLAY, PHONE_RAW } from './ui';
import OpenChatButton from 'app/components/OpenChatButton';
import InformationSectionsPrefetch from './InformationSectionsPrefetch';
import {
  directoryActionIconClass,
  directoryIconTileClass,
  directoryListCardClass,
  directoryPanelClass,
} from 'app/components/catalog-directory-styles';

const HERO_PHOTO_ALT: Record<InformationSectionKey, string> = {
  delivery: 'Посилки з автозапчастинами у фургоні перед доставкою',
  payment: 'Платіжний термінал і банківська картка',
  about: 'Фасад магазину автозапчастин PartsON у Львові',
  location: 'Навігатор в автомобілі з маршрутом на карті',
  privacy: 'Навісний замок із ключем',
  warranty: 'Гальмівний диск у автосервісі',
  returns: 'Картонні коробки для повернення й обміну товару',
  diagnostics: 'Двигун автомобіля зблизька',
};

type InformationPageClientProps = {
  initialSectionKey: InformationSectionKey;
};

// ─── Іконки й акценти розділів ─────────────────────────────────────────────
const SECTION_ICONS: Record<InformationSectionKey, LucideIcon> = {
  delivery: Truck,
  payment: CreditCard,
  about: Info,
  location: MapPin,
  privacy: ShieldCheck,
  warranty: Award,
  returns: RefreshCcw,
  diagnostics: Wrench,
};

// Navigations inside the info section carry this type so the page frame
// (root snapshot) stays static and only the named regions animate.
const NAV_TRANSITION = ['info-nav'];

const formatUpdatedAt = (iso: string) =>
  new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

// ─── Головний компонент ────────────────────────────────────────────────────
export default function InformationPageClient({ initialSectionKey }: InformationPageClientProps) {
  const section = informationSections.find((s) => s.key === initialSectionKey) || informationSections[0];
  const [accentA, accentB] = INFORMATION_SECTION_ACCENTS[section.key];
  const { Content, toc: sectionToc } = sectionContent[section.key];
  const toc = [...sectionToc, { id: 'faq', label: 'Часті запитання' }];
  const related = section.related.map((key) => informationSections.find((s) => s.key === key)!).filter(Boolean);
  const ActiveIcon = SECTION_ICONS[section.key];
  const photo = getInformationHeroPhoto(section.key);

  return (
    <div
      className="info-page relative min-h-screen pb-8 text-slate-900 sm:pb-12"
      style={{ '--info-a': accentA, '--info-b': accentB } as CSSProperties}
    >
      <InformationSectionsPrefetch paths={informationSections.map((s) => getInformationPath(s.key))} />
      <link rel="preload" as="image" media="(max-width: 767px)" imageSrcSet={photo.phoneSrcSet} imageSizes="100vw" fetchPriority="high" />
      <link rel="preload" as="image" media="(min-width: 768px)" imageSrcSet={photo.srcSet} imageSizes="(min-width: 1440px) 100vw, 1440px" fetchPriority="high" />
      {/* Hero */}
      <section className="info-hero relative isolate overflow-hidden">
        <ViewTransition key={section.key} name="info-hero" share="info-hero" enter="info-hero" exit="info-hero" default="none">
          <div className="info-hero-stage relative">
            <div className="info-hero-media">
              <picture>
                <source media="(max-width: 767px)" srcSet={photo.phoneSrcSet} sizes="100vw" />
                <img
                  src={photo.src}
                  srcSet={photo.srcSet}
                  sizes="(min-width: 1440px) 100vw, 1440px"
                  alt={HERO_PHOTO_ALT[section.key]}
                  fetchPriority="high"
                  decoding="async"
                  className="info-hero-photo"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </picture>
              <span className="info-hero-shade" aria-hidden="true" />
            </div>

            <div className="page-shell-inline info-hero-content">
              <nav aria-label="Навігаційні хлібні крихти">
                <ol className="info-hero-crumbs flex flex-wrap items-center gap-1.5 text-xs font-medium">
                  <li><Link href="/">Головна</Link></li>
                  <li aria-hidden="true"><ChevronRight size={12} /></li>
                  <li><Link href="/inform/delivery">Інформація</Link></li>
                  <li aria-hidden="true"><ChevronRight size={12} /></li>
                  <li aria-current="page">{section.title}</li>
                </ol>
              </nav>

              <div className="info-hero-copy">
                <p className="info-in info-read info-hero-kicker flex items-center gap-2.5">
                  <span className="info-accent-bg inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-white">
                    <ActiveIcon size={18} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  {section.heroKicker ?? 'Інформація для клієнтів'}
                </p>

                <h1 className="info-hero-title">{section.pageHeading}</h1>
                <p className="info-in info-read info-hero-lead" style={{ '--i': 2 } as CSSProperties}>
                  {section.contentLead || section.intro}
                </p>

                <div className="info-in info-read info-hero-meta flex flex-wrap items-center gap-x-5 gap-y-2" style={{ '--i': 3 } as CSSProperties}>
                  <a
                    href={`tel:${section.heroPhone?.raw ?? PHONE_RAW}`}
                    aria-label={section.heroPhone ? `${section.heroPhone.label}: ${section.heroPhone.display}` : undefined}
                    className="info-hero-phone inline-flex items-center gap-2"
                  >
                    <Phone size={15} strokeWidth={2} aria-hidden="true" />
                    {section.heroPhone ? `${section.heroPhone.label}: ${section.heroPhone.display}` : PHONE_DISPLAY}
                  </a>
                  <span className="inline-flex items-center gap-2">
                    <span className="info-accent-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                    Оновлено <time dateTime={section.updatedAt ?? INFORMATION_UPDATED_AT}>{formatUpdatedAt(section.updatedAt ?? INFORMATION_UPDATED_AT)}</time>
                  </span>
                </div>
              </div>

              <dl className="info-facts relative grid">
                {section.facts.map((fact) => (
                  <div key={fact.label} className="info-fact">
                    <dd className="directory-heading info-fact-value">{fact.value}</dd>
                    <dt className="info-read info-fact-label">{fact.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </ViewTransition>
      </section>

      <div className="page-shell-inline info-body relative z-[1]">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          {/* Бічна панель: розділи + зміст */}
          <aside className="info-in-side min-w-0 space-y-4 lg:sticky lg:top-24">
            <nav aria-label="Розділи інформації" className={`${directoryPanelClass} info-sidebar-panel p-2 lg:p-3`}>
              <p className="info-read info-read-muted info-read-medium hidden px-2 pb-2 pt-1 text-[13px] lg:block">
                Розділи
              </p>
              <ul className="flex snap-x gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:overflow-visible">
                {informationSections.map((tab) => {
                  const isActive = tab.key === section.key;
                  const Icon = SECTION_ICONS[tab.key];
                  return (
                    <li key={tab.key} className={`snap-start ${isActive ? "order-first lg:order-none" : ""}`}>
                      <Link
                        href={getInformationPath(tab.key)}
                        transitionTypes={NAV_TRANSITION}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group relative flex min-w-max items-center gap-2.5 rounded-[14px] px-3 py-2.5 transition-colors duration-200 lg:min-w-0 ${
                          isActive ? 'text-sky-950' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                        }`}
                      >
                        {isActive ? (
                          <ViewTransition name="info-nav-pill" share="info-pill" default="none">
                            <span
                              className="absolute inset-0 rounded-[14px] border border-sky-200 bg-[linear-gradient(135deg,#f0f9ff,#ecfeff)] shadow-[0_10px_24px_rgba(14,116,144,0.13),inset_3px_0_0_#0284c7]"
                              aria-hidden="true"
                            />
                          </ViewTransition>
                        ) : null}
                        <span
                          className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border transition ${
                            isActive ? 'border-sky-200 bg-white text-sky-700 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:text-slate-700'
                          }`}
                        >
                          <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                        </span>
                        <span className="relative min-w-0 flex-1">
                          <span className="directory-card-title block text-[13.5px] leading-snug">{tab.title}</span>
                          <span className={`hidden text-[11px] font-medium leading-snug lg:block ${isActive ? 'text-sky-800/75' : 'text-slate-400'}`}>
                            {tab.subtitle}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <nav aria-label="Зміст сторінки" className={`${directoryPanelClass} info-sidebar-panel hidden p-4 lg:block`}>
              <p className="info-read info-read-muted info-read-medium text-[13px]">На цій сторінці</p>
              <ol className="mt-3 space-y-0.5 border-l border-slate-200">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="info-read -ml-px block border-l-2 border-transparent py-1.5 pl-3.5 text-[14px] transition hover:border-sky-400 hover:!text-sky-800"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          {/* Контент розділу */}
          <div className="min-w-0 select-text">
            <ViewTransition key={section.key} name="info-content" share="info-content" enter="info-content" exit="info-content" default="none">
              <div>
                <nav aria-label="Зміст сторінки" className="info-toc-rail -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
                  {toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="shrink-0 rounded-full border border-slate-200 bg-white/90 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-600 shadow-sm transition hover:border-sky-200 hover:text-sky-800"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>

                <article className="info-article">
                  <Content />

                  {/* FAQ */}
                  <section id="faq" aria-labelledby="information-faq-title" className="info-text-section scroll-mt-28">
                    <div className="info-section-body min-w-0">
                      <h2 id="information-faq-title" className="mb-4 text-[23px] leading-[1.2] text-[#13202f] sm:text-[28px]">
                        Часті запитання: {section.title.toLocaleLowerCase('uk-UA')}
                      </h2>
                      <div className="space-y-3">
                        {section.faqs.map((faq, index) => (
                          <details key={faq.question} open={index === 0} className="info-faq group rounded-[14px] border border-slate-200/90 bg-white px-4 transition-colors sm:px-5">
                            <summary className="flex cursor-pointer list-none items-start gap-4 rounded-xl py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500 [&::-webkit-details-marker]:hidden">
                              <h3 className="flex-1 text-[16.5px] leading-[1.45] text-[#13202f] transition-colors group-hover:text-sky-800">{faq.question}</h3>
                              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-[transform,color] duration-300 group-open:rotate-90 group-open:text-sky-700">
                                <ChevronRight size={18} aria-hidden="true" />
                              </span>
                            </summary>
                            <p className="info-read max-w-[42rem] pb-5 pr-10 text-[15.5px] leading-[1.75]">{faq.answer}</p>
                          </details>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Пов'язані розділи */}
                  <section aria-labelledby="information-related-title" className="info-text-section">
                    <div className="info-section-body min-w-0">
                      <h2 id="information-related-title" className="mb-4 text-[19px] text-[#13202f] sm:text-[21px]">
                        Корисно також знати
                      </h2>
                      <ul className="info-related-grid grid gap-3">
                        {related.map((item) => {
                          const Icon = SECTION_ICONS[item.key];
                          return (
                            <li key={item.key}>
                              <Link
                                href={getInformationPath(item.key)}
                                transitionTypes={NAV_TRANSITION}
                                className={`${directoryListCardClass} info-related-link group`}
                              >
                                <span className={directoryIconTileClass}>
                                  <Icon size={20} strokeWidth={1.8} className="text-sky-700" aria-hidden="true" />
                                </span>
                                <span className="info-related-text min-w-0">
                                  <span className="directory-card-title block text-[16px] text-[#13202f]">{item.title}</span>
                                  <span className="info-read info-read-muted mt-1 block text-[14.5px] leading-[1.55]">{item.intro}</span>
                                </span>
                                <span className={`${directoryActionIconClass} info-related-arrow`}>
                                  <ArrowRight size={15} aria-hidden="true" />
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>
                </article>
              </div>
            </ViewTransition>

            {/* CTA */}
            <aside
              aria-label="Допомога з вибором автозапчастин"
              className="info-cta relative isolate mt-6 overflow-hidden rounded-[22px] p-6 text-white sm:p-8"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative static photo below the fold */}
              <img
                src="/images/directories/parts-workbench-v1-960.webp"
                srcSet="/images/directories/parts-workbench-v1-960.webp 960w, /images/directories/parts-workbench-v1.webp 1920w"
                sizes="(max-width: 1023px) 100vw, 960px"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="info-cta-photo"
              />
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <h2 className="text-[22px] text-white [text-shadow:none] sm:text-[26px]">
                    Допоможемо знайти потрібну запчастину
                  </h2>
                  <p className="info-read info-read-on-dark mt-2 text-[15.5px] leading-[1.7]">
                    Надішліть VIN, артикул або дані автомобіля — перевіримо сумісність і наявність та запропонуємо оптимальні варіанти.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2.5 sm:min-w-[220px]">
                  <OpenChatButton
                    message={`Вітаю! Потрібна допомога з розділом «${section.title}». Хочу підібрати запчастину для автомобіля.`}
                    label="Написати в чат"
                    title="Відкрити чат із менеджером PartsON"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#38bdf8,#0ea5e9_50%,#14b8a6)] px-5 text-[14px] font-bold text-white shadow-[0_14px_30px_rgba(14,165,233,0.35)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40"
                  />
                  <Link
                    href="/katalog"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 text-[14px] font-bold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20"
                  >
                    Перейти до каталогу
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
