import { ViewTransition, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  getInformationPath,
  informationSections,
  type InformationSectionKey,
} from './section-config';
import { sectionContent } from './sections';
import { PHONE_DISPLAY, PHONE_RAW } from './ui';
import OpenChatButton from 'app/components/OpenChatButton';
import { directoryPanelClass } from 'app/components/catalog-directory-styles';

const HERO_IMAGE_ALT: Record<InformationSectionKey, string> = {
  delivery: 'Доставка автозапчастин: автомобіль і пакунок із гальмівним диском',
  payment: 'Оплата замовлення: банківська картка та платіжний термінал',
  about: 'Добірка автозапчастин: гальмівний диск, фільтр, свічка та ремінь',
  location: 'Стилізована карта з позначкою магазину автозапчастин',
  privacy: 'Захист персональних даних: щит і замок',
  warranty: 'Гарантія якості: гальмівний диск і щит із позначкою перевірки',
  returns: 'Повернення та обмін: пакунок із фільтром і стрілки обміну',
  diagnostics: 'Автомобільний діагностичний сканер із кабелем OBD',
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

  return (
    <main
      className="info-page relative min-h-screen py-5 text-slate-900 sm:py-7"
      style={{ '--info-a': accentA, '--info-b': accentB } as CSSProperties}
    >
      <div className="page-shell-inline space-y-5 sm:space-y-6">
        {/* Хлібні крихти */}
        <nav aria-label="Навігаційні хлібні крихти">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
            <li><Link href="/" className="transition hover:text-slate-900">Головна</Link></li>
            <li aria-hidden="true"><ChevronRight size={12} /></li>
            <li><Link href="/inform" className="transition hover:text-slate-900">Інформація</Link></li>
            <li aria-hidden="true"><ChevronRight size={12} /></li>
            <li aria-current="page" className="font-semibold text-slate-800">{section.title}</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="info-hero relative isolate overflow-hidden rounded-[28px] border border-white bg-white/80 shadow-[0_20px_50px_rgba(15,23,42,0.07)] ring-1 ring-[#d9e3ec]/70">
          <span className="info-hero-sheen pointer-events-none absolute inset-x-10 top-0 h-[2px] rounded-full opacity-80" aria-hidden="true" />

          <ViewTransition key={section.key} name="info-hero" share="info-hero" enter="info-hero" exit="info-hero" default="none">
            <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-10 lg:p-10">
              <div className="min-w-0">
                <p className="info-in info-read flex items-center gap-2.5 text-[14px] info-read-accent">
                  <span className="info-accent-bg inline-flex h-9 w-9 items-center justify-center rounded-[12px] text-white">
                    <ActiveIcon size={18} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  Інформація для клієнтів
                </p>

                <h1 className="info-hero-title mt-5 max-w-3xl text-[1.9rem] leading-[1.08] text-[#13202f] sm:text-[2.6rem] lg:text-[3rem]">
                  {section.pageHeading}
                </h1>
                <p
                  className="info-in info-read mt-4 max-w-[38rem] text-[16.5px] leading-[1.7] sm:text-[18px]"
                  style={{ '--i': 2 } as CSSProperties}
                >
                  {section.contentLead || section.intro}
                </p>

                <div className="info-in info-read info-read-muted mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]" style={{ '--i': 3 } as CSSProperties}>
                  <a href={`tel:${PHONE_RAW}`} className="inline-flex items-center gap-1.5 font-medium text-[#13202f] transition hover:text-sky-700">
                    <Phone size={14} strokeWidth={2} aria-hidden="true" />
                    {PHONE_DISPLAY}
                  </a>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="info-accent-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                    Оновлено <time dateTime={INFORMATION_UPDATED_AT}>{formatUpdatedAt(INFORMATION_UPDATED_AT)}</time>
                  </span>
                </div>
              </div>

              <div className="info-hero-art relative mx-auto w-full max-w-[560px]">
                <div className="info-hero-art-orbit" aria-hidden="true" />
                <div className="info-hero-art-frame relative aspect-[3/2] overflow-hidden rounded-[24px] border border-white/90 bg-[#edf6fb] shadow-[0_24px_60px_rgba(15,23,42,0.1)] sm:rounded-[32px]">
                  <Image
                    src={`/images/information/${section.key}-hero-v1.webp`}
                    alt={HERO_IMAGE_ALT[section.key]}
                    fill
                    sizes="(max-width: 639px) calc(100vw - 64px), (max-width: 1023px) 560px, 540px"
                    priority
                    className="object-cover"
                  />
                  <div className="info-hero-art-glint" aria-hidden="true" />
                </div>
                <span style={{ '--i': 6 } as CSSProperties} className="info-in absolute -bottom-3 right-4 inline-flex items-center gap-2 rounded-full border border-white bg-white/95 px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm sm:right-6">
                  <ActiveIcon size={15} className="info-read-accent" aria-hidden="true" />
                  {section.title} · PartsON
                </span>
              </div>

              <dl className="info-facts relative grid grid-cols-1 gap-3 pt-5 min-[480px]:grid-cols-3 lg:col-span-2">
                {section.facts.map((fact) => (
                  <div key={fact.label} className="flex items-center justify-between gap-3 rounded-[16px] border border-white/90 bg-white/65 px-4 py-3 min-[480px]:block">
                    <dt className="info-read info-read-muted text-[13px] leading-snug">{fact.label}</dt>
                    <dd className="info-accent-text directory-heading info-fact-value text-[20px] leading-tight min-[480px]:mt-1 sm:text-[23px]">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </ViewTransition>
        </section>

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
                <nav aria-label="Зміст сторінки" className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
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

                <article className="info-article space-y-14 sm:space-y-16">
                  <Content />

                  {/* FAQ */}
                  <section id="faq" aria-labelledby="information-faq-title" className="info-text-section scroll-mt-28">
                    <div className="info-section-body min-w-0">
                      <h2 id="information-faq-title" className="mb-4 text-[23px] leading-[1.2] text-[#13202f] sm:text-[28px]">
                        Часті запитання: {section.title.toLocaleLowerCase('uk-UA')}
                      </h2>
                      <div className="space-y-3">
                        {section.faqs.map((faq, index) => (
                          <details key={faq.question} open={index === 0} className="info-faq group rounded-[16px] border border-slate-200/80 bg-white/85 px-4 transition-colors open:border-sky-200 open:bg-sky-50/50 sm:px-5">
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
                    <h2 id="information-related-title" className="mb-3 text-[19px] text-[#13202f] sm:text-[21px]">
                      Корисно також знати
                    </h2>
                    <ul className="divide-y divide-[#d9e3ec] overflow-hidden rounded-[18px] border border-[#d9e3ec] bg-white/80">
                      {related.map((item) => {
                        const Icon = SECTION_ICONS[item.key];
                        return (
                          <li key={item.key}>
                            <Link
                              href={getInformationPath(item.key)}
                              transitionTypes={NAV_TRANSITION}
                              className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-sky-50/60 focus-visible:bg-sky-50 focus-visible:outline-none sm:px-5"
                            >
                              <Icon size={20} strokeWidth={1.8} className="shrink-0 text-sky-600" aria-hidden="true" />
                              <span className="min-w-0 flex-1">
                                <span className="directory-card-title block text-[16px] text-[#13202f]">{item.title}</span>
                                <span className="info-read info-read-muted mt-0.5 block text-[14.5px] leading-[1.55]">{item.intro}</span>
                              </span>
                              <ArrowRight size={18} className="shrink-0 text-slate-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-sky-600" aria-hidden="true" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                </article>
              </div>
            </ViewTransition>

            {/* CTA */}
            <aside
              aria-label="Допомога з вибором автозапчастин"
              className="info-cta relative isolate mt-14 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0b1220_0%,#0f2537_55%,#0b2a2a_100%)] p-6 text-white shadow-[0_28px_60px_rgba(15,23,42,0.28)] sm:p-8"
            >
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
    </main>
  );
}
