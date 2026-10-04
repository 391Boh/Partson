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
  getInformationPath,
  informationSections,
  type InformationSectionKey,
} from './section-config';
import { sectionContent } from './sections';
import { PHONE_DISPLAY, PHONE_RAW } from './ui';
import OpenChatButton from 'app/components/OpenChatButton';
import { catalogPageBackgroundClass, directoryPanelClass } from 'app/components/catalog-directory-styles';

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
      className={`${catalogPageBackgroundClass} info-page min-h-screen py-5 sm:py-7`}
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
        <section className="relative isolate overflow-hidden rounded-[32px] border border-white/90 bg-white/75 shadow-[0_30px_72px_rgba(15,23,42,0.1),0_8px_26px_rgba(14,165,233,0.06)] ring-1 ring-slate-200/60">
          <div className="info-hero-aurora" aria-hidden="true"><span /><span /><span /></div>
          <div className="info-hero-grid" aria-hidden="true" />
          <span className="info-hero-sheen pointer-events-none absolute inset-x-10 top-0 h-[2px] rounded-full opacity-80" aria-hidden="true" />

          <ViewTransition key={section.key} name="info-hero" share="info-hero" enter="info-hero" exit="info-hero" default="none">
            <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-end lg:gap-10 lg:p-10">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="info-accent-bg inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-white shadow-[0_12px_26px_rgba(14,165,233,0.3)]">
                    <ActiveIcon size={21} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <span className="directory-kicker rounded-full border border-slate-200/90 bg-white/85 px-3 py-1 text-[10.5px] uppercase text-slate-600 backdrop-blur">
                    Інформація для клієнтів · {section.title}
                  </span>
                </div>

                <h1 className="mt-5 max-w-3xl text-[1.85rem] leading-[1.08] text-slate-900 sm:text-[2.6rem] lg:text-[3rem]">
                  {section.pageHeading}
                </h1>
                <p className="mt-4 max-w-2xl text-[15px] font-medium leading-7 text-slate-600 sm:text-[16.5px] sm:leading-8">
                  {section.contentLead || section.intro}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] font-semibold text-slate-500">
                  <a href={`tel:${PHONE_RAW}`} className="inline-flex items-center gap-1.5 text-slate-700 transition hover:text-sky-700">
                    <Phone size={14} strokeWidth={2} aria-hidden="true" />
                    {PHONE_DISPLAY}
                  </a>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="info-accent-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                    Оновлено <time dateTime={INFORMATION_UPDATED_AT}>{formatUpdatedAt(INFORMATION_UPDATED_AT)}</time>
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-3 lg:grid-cols-1">
                {section.facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="rounded-[18px] border border-white/90 bg-white/80 px-4 py-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.07),inset_0_1px_0_#fff] backdrop-blur-md transition-transform duration-300 hover:-translate-y-0.5"
                  >
                    <dt className="sr-only">{fact.label}</dt>
                    <dd>
                      <span className="info-accent-text directory-heading block text-[22px] leading-tight sm:text-[24px]">{fact.value}</span>
                      <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-slate-500" aria-hidden="true">{fact.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </ViewTransition>
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-8">
          {/* Бічна панель: розділи + зміст */}
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-24">
            <nav aria-label="Розділи інформації" className={`${directoryPanelClass} p-2 lg:p-3`}>
              <p className="directory-kicker hidden px-2 pb-2 pt-1 text-[10px] uppercase text-sky-700 lg:block">
                Довідковий центр
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

            <nav aria-label="Зміст сторінки" className={`${directoryPanelClass} hidden p-4 lg:block`}>
              <p className="directory-kicker text-[10px] uppercase text-slate-500">На цій сторінці</p>
              <ol className="mt-3 space-y-0.5 border-l border-slate-200">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="-ml-px block border-l-2 border-transparent py-1.5 pl-3.5 text-[13px] font-semibold text-slate-500 transition hover:border-sky-400 hover:text-sky-800"
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

                <article className="space-y-12 sm:space-y-14">
                  <Content />

                  {/* FAQ */}
                  <section id="faq" aria-labelledby="information-faq-title" className="info-reveal scroll-mt-28">
                    <header className="mb-5 max-w-3xl">
                      <p className="directory-kicker flex items-center gap-2 text-[10.5px] uppercase text-slate-500">
                        <span className="info-accent-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                        Короткі відповіді
                      </p>
                      <h2 id="information-faq-title" className="mt-2 text-[22px] text-slate-900 sm:text-[27px]">
                        Часті запитання: {section.title.toLocaleLowerCase('uk-UA')}
                      </h2>
                    </header>
                    <div className="grid gap-2.5">
                      {section.faqs.map((faq, index) => (
                        <details
                          key={faq.question}
                          open={index === 0}
                          className="info-faq group rounded-[18px] border border-slate-200/80 bg-white/80 px-4 shadow-[0_6px_16px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-300 hover:border-sky-200 open:border-sky-200 open:bg-white open:shadow-[0_14px_32px_rgba(14,165,233,0.08)] sm:px-5"
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[15px] font-bold leading-6 text-slate-800 [&::-webkit-details-marker]:hidden">
                            <h3 className="flex-1 font-[inherit] text-[15px] leading-6 [text-shadow:none] sm:text-[15.5px]">{faq.question}</h3>
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition-[transform,background-color,color,border-color] duration-300 group-open:rotate-90 group-open:border-sky-200 group-open:bg-sky-50 group-open:text-sky-700">
                              <ChevronRight size={16} aria-hidden="true" />
                            </span>
                          </summary>
                          <p className="border-t border-slate-100 pb-5 pr-2 pt-3.5 text-[14.5px] font-medium leading-7 text-slate-600">
                            {faq.answer}
                          </p>
                        </details>
                      ))}
                    </div>
                  </section>

                  {/* Пов'язані розділи */}
                  <section aria-labelledby="information-related-title" className="info-reveal">
                    <h2 id="information-related-title" className="mb-4 text-[19px] text-slate-900 sm:text-[21px]">
                      Корисно також знати
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {related.map((item) => {
                        const Icon = SECTION_ICONS[item.key];
                        return (
                          <Link
                            key={item.key}
                            href={getInformationPath(item.key)}
                            transitionTypes={NAV_TRANSITION}
                            className="group relative flex flex-col gap-3 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_20px_40px_rgba(14,165,233,0.14)]"
                          >
                            <span className="flex items-center justify-between">
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-sky-100 bg-sky-50 text-sky-700 transition group-hover:border-sky-200 group-hover:bg-sky-100">
                                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                              </span>
                              <ArrowRight size={17} className="text-slate-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-sky-600" aria-hidden="true" />
                            </span>
                            <span>
                              <span className="directory-card-title block text-[15.5px] text-slate-900">{item.title}</span>
                              <span className="mt-1 block text-[13px] font-medium leading-5 text-slate-500">{item.intro}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                </article>
              </div>
            </ViewTransition>

            {/* CTA */}
            <aside
              aria-label="Допомога з вибором автозапчастин"
              className="info-reveal relative isolate mt-12 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0b1220_0%,#0f2537_55%,#0b2a2a_100%)] p-6 text-white shadow-[0_28px_60px_rgba(15,23,42,0.28)] sm:p-8"
            >
              <div className="info-hero-aurora opacity-90" aria-hidden="true"><span /><span /><span /></div>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <p className="directory-kicker text-[10.5px] uppercase text-sky-300">Потрібна допомога?</p>
                  <h2 className="mt-2 text-[22px] text-white [text-shadow:none] sm:text-[26px]">
                    Допоможемо знайти потрібну запчастину
                  </h2>
                  <p className="mt-2 text-[14.5px] font-medium leading-7 text-slate-300">
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
