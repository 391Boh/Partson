import type { Metadata } from "next";
import Image from "next/image";
import {
  Handshake, Percent, BadgeCheck,
  Zap, Package, Wrench, Store, Clock,
  Navigation, ShieldCheck,
  Users, Building2, TrendingUp, Tag,
} from "lucide-react";
import { buildPageMetadata, appendSeoContact } from "app/lib/seo-metadata";
import { PARTNER_DISCOUNT_PERCENT, PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";
import PartnershipCtaClient from "./PartnershipCtaClient";
import PartnershipStatusCard from "./PartnershipStatusCard";
import PartnershipDeliveryClient from "./PartnershipDeliveryClient";

export const metadata: Metadata = buildPageMetadata({
  title: `Партнерська програма PartsON — знижка ${PARTNER_DISCOUNT_PERCENT}% для СТО та автомагазинів`,
  description: appendSeoContact(
    `Партнерство з PartsON: постійна знижка ${PARTNER_DISCOUNT_PERCENT}% після замовлень на ${PARTNER_THRESHOLD_UAH} грн. Власна доставка по Львову та Nova Poshta по Україні. Для СТО, автомагазинів та механіків.`
  ),
  canonicalPath: "/partnership",
  keywords: [
    "партнерська програма автозапчастини",
    "знижки для СТО Львів",
    "доставка запчастин Львів",
    "партнер PartsON",
    "знижка на запчастини",
    "автомагазин партнер",
    "гуртові ціни на запчастини",
    "накопичувальна знижка автозапчастини",
  ],
});

export default function PartnershipPage() {
  return (
    <div className="font-ui">

      {/* ── HERO ── */}
      <section
        className="relative isolate overflow-hidden pt-14 text-white sm:pt-20"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 160% 90% at 6% 0%, rgba(56,189,248,0.26) 0%, rgba(56,189,248,0.06) 46%, transparent 70%)",
            "radial-gradient(ellipse 100% 70% at 96% 4%, rgba(37,99,235,0.16) 0%, transparent 68%)",
            "linear-gradient(180deg, rgba(2,6,23,1) 0%, rgba(5,11,36,0.97) 18%, rgba(11,21,58,0.93) 50%, rgba(9,18,50,0.82) 100%)",
          ].join(", "),
        }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[image:linear-gradient(to_bottom,rgba(2,6,23,0.55)_0%,transparent_100%)]" />
        {/* subtle dot grid */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.032]"
          style={{ backgroundImage: "radial-gradient(circle, rgba(125,211,252,1) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />

        <div className="page-shell-inline relative z-10">
          <div className="grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-10">

            {/* text */}
            <div className="max-w-2xl">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-sky-400/28 bg-sky-500/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-300 backdrop-blur-sm">
                <Handshake size={10} strokeWidth={2.5} />
                Партнерська програма
              </span>

              <h1 className="text-[2rem] font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-[2.8rem]">
                Знижки та переваги для{" "}
                <span className="bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-300 bg-clip-text text-transparent">
                  вашого бізнесу
                </span>
              </h1>

              <p className="mt-4 max-w-lg text-[14px] font-medium leading-relaxed text-sky-100/70">
                Програма для СТО, автомагазинів і механіків, які регулярно замовляють запчастини.
                Після покупок на{" "}
                <strong className="font-semibold text-white">{PARTNER_THRESHOLD_UAH}&nbsp;грн</strong>{" "}
                статус партнера активується автоматично — і на кожне наступне замовлення діє
                постійна знижка <strong className="font-semibold text-white">{PARTNER_DISCOUNT_PERCENT}%</strong> без обмежень.
              </p>

              <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold">
                {[
                  { label: "Без заявок і внесків", c: "border-emerald-400/24 bg-emerald-500/10 text-emerald-200" },
                  { label: "Статус назавжди", c: "border-sky-400/24 bg-sky-500/10 text-sky-200" },
                  { label: "Доставка по Україні", c: "border-indigo-400/24 bg-indigo-500/10 text-indigo-200" },
                ].map(({ label, c }) => (
                  <span key={label} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-sm ${c}`}>
                    <BadgeCheck size={10} strokeWidth={2.5} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <aside className="relative overflow-hidden rounded-[22px] border border-white/[0.13] bg-white/[0.075] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.30),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl sm:p-6">
              <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-400/18 blur-3xl" />
              <span className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-cyan-300/12 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-sky-300/24 bg-sky-400/12 text-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <Handshake size={20} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-300/80">Для бізнесу</p>
                    <h2 className="text-[1.18rem] font-black tracking-[-0.02em] text-white">
                      Постійна знижка для СТО і магазинів
                    </h2>
                  </div>
                </div>

                <p className="text-[13px] font-medium leading-relaxed text-sky-100/68">
                  Зареєструйтесь у PartsON, замовляйте автозапчастини для СТО, автомагазину чи майстерні
                  та отримайте постійну партнерську знижку після досягнення порогу.
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { value: `${PARTNER_DISCOUNT_PERCENT}%`, label: "знижка" },
                    { value: `${PARTNER_THRESHOLD_UAH}`, label: "грн поріг" },
                    { value: "0", label: "внесок" },
                  ].map(({ value, label }) => (
                    <div key={label} className="rounded-2xl border border-white/[0.10] bg-white/[0.07] px-2.5 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
                      <p className="text-[1.15rem] font-black tracking-tight text-white">{value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-sky-200/58">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <PartnershipCtaClient />
                </div>

                <p className="mt-3 text-[11.5px] font-medium leading-relaxed text-sky-100/48">
                  Партнерство PartsON для закупівлі запчастин у Львові та доставки по Україні.
                </p>
              </div>
            </aside>

          </div>
        </div>

        <div className="relative z-10 mt-10">
          <PartnershipStatusCard showCta={false} edge />
        </div>
      </section>

      {/* ── FEATURES PANEL ── */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-cyan-50/98 via-sky-100/72 to-blue-100/85 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.90),inset_0_-1px_0_rgba(30,64,175,0.07)] sm:py-12">
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(103,232,249,0.18),transparent_36%),radial-gradient(circle_at_88%_70%,rgba(56,189,248,0.13),transparent_40%)]" />
        <span className="pointer-events-none absolute -left-10 top-8 hidden h-32 w-32 rounded-full bg-cyan-200/20 blur-3xl lg:block" />

        <div className="page-shell-inline relative z-10">
          <div className="home-section-surface relative overflow-hidden rounded-[22px] border border-white/82 bg-[linear-gradient(148deg,rgba(255,255,255,0.97),rgba(236,254,255,0.93),rgba(219,234,254,0.90))] shadow-[0_18px_40px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.94)]">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/95 to-transparent" />
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(103,232,249,0.11),transparent_28%),radial-gradient(circle_at_92%_88%,rgba(96,165,250,0.09),transparent_30%)]" />

            <div className="relative divide-y divide-sky-100/50">

              {/* доставка */}
              <div className="p-5 sm:p-6">
                <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-500/80">Доставка</p>
                <h2 className="mb-4 text-[1.05rem] font-extrabold tracking-tight text-slate-900">Отримуйте запчастини зручним способом</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      tag: "По Львову", tagStyle: "border-emerald-200/75 bg-emerald-50 text-emerald-700",
                      icon: Navigation, iconStyle: "border-emerald-200/60 bg-white/80 text-emerald-600",
                      glow: "bg-emerald-200/18", check: "bg-emerald-100 text-emerald-600",
                      title: "Власна доставка PartsON",
                      desc: "Кур'єр доставляє прямо до вашого СТО чи магазину — не потрібно їхати на пошту або очікувати черги.",
                      points: ["В день замовлення або наступного дня", "Самовивіз на вул. Перфецького, 8", "Оплата при отриманні"],
                    },
                  ].map(({ tag, tagStyle, icon: Icon, iconStyle, glow, check, title, desc, points }) => (
                    <div key={tag} className="relative overflow-hidden rounded-[15px] border border-white/72 bg-white/52 p-4 transition-[box-shadow] duration-300 hover:bg-white/72 hover:shadow-[0_5px_16px_rgba(14,165,233,0.08)]">
                      <span className={`pointer-events-none absolute -right-4 -top-4 h-14 w-14 rounded-full ${glow} blur-xl`} />
                      <div className="relative flex items-start gap-3">
                        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border ${iconStyle} shadow-[0_2px_5px_rgba(0,0,0,0.05)]`}>
                          <Icon size={15} strokeWidth={1.9} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className={`inline-flex rounded-full border px-2 py-px text-[10px] font-bold ${tagStyle}`}>{tag}</span>
                            <span className="text-[12.5px] font-bold text-slate-800">{title}</span>
                          </div>
                          <p className="text-[12px] font-medium leading-relaxed text-slate-500">{desc}</p>
                          <ul className="mt-2 space-y-1">
                            {points.map(p => (
                              <li key={p} className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600">
                                <span className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${check}`}>
                                  <BadgeCheck size={8} strokeWidth={2.5} />
                                </span>
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* NP branded card */}
                  <div className="col-span-full sm:col-span-1 relative overflow-hidden rounded-[15px] border border-amber-100 bg-gradient-to-br from-white/90 to-amber-50/70 p-4">
                    <span className="pointer-events-none absolute -right-4 -top-4 h-14 w-14 rounded-full bg-red-200/20 blur-xl" />
                    <div className="relative">
                      <div className="mb-2 flex items-center gap-2">
                        <Image src="/nova-poshta-logo.svg" alt="Nova Poshta" width={90} height={24} />
                        <span className="inline-flex rounded-full border border-amber-200/75 bg-amber-50 px-2 py-px text-[10px] font-bold text-amber-700">По Україні</span>
                      </div>
                      <p className="text-[12px] font-medium leading-relaxed text-slate-500">
                        Відправляємо до будь-якого відділення, поштомату або кур&apos;єром додому по всій Україні.
                      </p>
                      <ul className="mt-2 space-y-1">
                        {["Відправлення наступного робочого дня", "2 000+ відділень та поштоматів NP", "Трекінг-номер відразу після відправки"].map(p => (
                          <li key={p} className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600">
                            <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                              <BadgeCheck size={8} strokeWidth={2.5} />
                            </span>
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* налаштування доставки */}
              <PartnershipDeliveryClient />

              {/* переваги + кроки */}
              <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-sky-100/50">

                {/* переваги */}
                <div className="p-5 sm:p-6">
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-500/80">Що включено</p>
                  <h2 className="mb-4 text-[1.05rem] font-extrabold tracking-tight text-slate-900">Умови партнерської програми</h2>
                  <div className="space-y-2">
                    {[
                      {
                        Icon: Percent,
                        title: `Знижка ${PARTNER_DISCOUNT_PERCENT}% на весь асортимент`,
                        desc: "Автоматично застосовується до кожного замовлення — не потрібні промокоди чи заявки.",
                        i: "border-sky-200/75 bg-sky-50 text-sky-700", g: "bg-sky-300/10",
                      },
                      {
                        Icon: Zap,
                        title: "Ексклюзивні акції та сезонні розпродажі",
                        desc: "Ранній доступ до комплектів ТО зі знижкою та flash-пропозицій для партнерів.",
                        i: "border-amber-200/75 bg-amber-50 text-amber-700", g: "bg-amber-300/10",
                      },
                      {
                        Icon: Clock,
                        title: "Пріоритетна обробка замовлень",
                        desc: "Замовлення партнерів обробляються першими — менший час від оформлення до відправки.",
                        i: "border-emerald-200/75 bg-emerald-50 text-emerald-700", g: "bg-emerald-300/10",
                      },
                      {
                        Icon: ShieldCheck,
                        title: "Гарантія якості та підтримка",
                        desc: "Оригінали від офіційних дистриб'юторів. Пріоритетна підтримка при поверненні та гарантійних випадках.",
                        i: "border-indigo-200/75 bg-indigo-50 text-indigo-700", g: "bg-indigo-300/10",
                      },
                      {
                        Icon: Tag,
                        title: "Підбір запчастин за VIN і артикулом",
                        desc: "Ваш менеджер допомагає підібрати правильну деталь до конкретного авто — зменшує кількість повернень.",
                        i: "border-violet-200/75 bg-violet-50 text-violet-700", g: "bg-violet-300/10",
                      },
                    ].map(({ Icon, title, desc, i, g }) => (
                      <div key={title} className="relative flex items-start gap-2.5 overflow-hidden rounded-[11px] border border-white/65 bg-white/48 px-3 py-2.5 transition-[background] duration-200 hover:bg-white/68">
                        <span className={`pointer-events-none absolute -right-2 -top-2 h-9 w-9 rounded-full ${g} blur-lg`} />
                        <span className={`relative mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border ${i}`}>
                          <Icon size={12} strokeWidth={2} />
                        </span>
                        <div className="relative min-w-0">
                          <p className="text-[12.5px] font-bold text-slate-900 leading-tight">{title}</p>
                          <p className="mt-0.5 text-[11.5px] font-medium text-slate-500 leading-relaxed">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* для кого + кроки */}
                <div className="border-t border-sky-100/50 p-5 sm:p-6 lg:border-t-0">

                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-500/80">Для кого</p>
                  <h2 className="mb-3 text-[1.05rem] font-extrabold tracking-tight text-slate-900">Хто може стати партнером</h2>
                  <div className="mb-5 grid grid-cols-3 gap-2">
                    {[
                      { Icon: Wrench, label: "СТО", c: "border-sky-200/65 bg-sky-50/80 text-sky-700", g: "bg-sky-200/14" },
                      { Icon: Store, label: "Автомагазини", c: "border-indigo-200/65 bg-indigo-50/80 text-indigo-700", g: "bg-indigo-200/14" },
                      { Icon: Package, label: "Механіки", c: "border-cyan-200/65 bg-cyan-50/80 text-cyan-700", g: "bg-cyan-200/14" },
                    ].map(({ Icon, label, c, g }) => (
                      <div key={label} className="relative overflow-hidden rounded-[12px] border border-white/68 bg-white/50 p-3 text-center">
                        <span className={`pointer-events-none absolute -right-2 -top-2 h-10 w-10 rounded-full ${g} blur-lg`} />
                        <span className={`relative mx-auto mb-1.5 inline-flex h-7 w-7 items-center justify-center rounded-[9px] border ${c}`}>
                          <Icon size={13} strokeWidth={1.9} />
                        </span>
                        <p className="text-[11.5px] font-bold text-slate-800">{label}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-500/80">Як це працює</p>
                  <div>
                    {[
                      { n: "1", title: "Зареєструйте акаунт", desc: "Безкоштовно. Потрібен лише email або номер телефону.", g: "from-sky-500 to-cyan-500" },
                      { n: "2", title: `Замовляйте на суму від ${PARTNER_THRESHOLD_UAH} грн`, desc: "Усі замовлення враховуються — поточний прогрес видно у профілі.", g: "from-indigo-500 to-sky-500" },
                      { n: "3", title: "Отримуйте статус партнера", desc: "Активується автоматично після досягнення порогу — без підтверджень.", g: "from-emerald-500 to-cyan-500" },
                    ].map(({ n, title, desc, g }, idx, arr) => (
                      <div key={n} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br ${g} text-[11px] font-black text-white shadow-[0_2px_6px_rgba(14,165,233,0.15)]`}>{n}</span>
                          {idx < arr.length - 1 && <span className="my-1 w-px grow bg-gradient-to-b from-sky-200/65 to-transparent" style={{ minHeight: "0.6rem" }} />}
                        </div>
                        <div className={`min-w-0 ${idx < arr.length - 1 ? "pb-3" : ""} pt-0.5`}>
                          <p className="text-[12.5px] font-extrabold text-slate-900 leading-tight">{title}</p>
                          <p className="mt-0.5 text-[11.5px] font-medium text-slate-500 leading-relaxed">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── EDITORIAL ── */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-sky-50/96 via-blue-50/78 to-indigo-50/88 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_12%,rgba(56,189,248,0.13),transparent_38%),radial-gradient(circle_at_10%_80%,rgba(96,165,250,0.11),transparent_36%)]" />

        <div className="page-shell-inline relative z-10">
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">

            {/* main text */}
            <div className="relative overflow-hidden rounded-[20px] border border-white/78 bg-[linear-gradient(148deg,rgba(255,255,255,0.96),rgba(236,254,255,0.92))] p-6 shadow-[0_10px_28px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.92)] sm:p-7">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
              <span className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-sky-200/16 blur-3xl" />

              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-500/80">Про PartsON</p>
              <h2 className="mb-4 text-[1.1rem] font-extrabold tracking-tight text-slate-900">
                Надійний постачальник автозапчастин для автобізнесу у Львові та по всій Україні
              </h2>

              <div className="space-y-3 text-[13px] font-medium leading-relaxed text-slate-600">
                <p>
                  <strong className="font-semibold text-slate-800">PartsON</strong> — інтернет-магазин автозапчастин у Львові з власним складом і кур&apos;єрською службою.
                  Підбираємо деталі за VIN-кодом, артикулом і параметрами авто для популярних марок:
                  Toyota, Volkswagen, Ford, BMW, Renault, Opel, Skoda, Hyundai, Kia, Audi, Mercedes, Nissan та інших.
                  Каталог охоплює оригінальні деталі та перевірені аналоги від провідних виробників — Bosch, NGK, Febi, Sachs, TRW, Bilstein, Gates та інших.
                </p>
                <p>
                  Партнерська програма — це не разова акція, а постійна умова співпраці.
                  Знижка поширюється на весь асортимент без виключень: фільтри, гальмівні колодки та диски,
                  амортизатори, ремені і ланцюги ГРМ, свічки, підшипники, рульові наконечники, ШРУС,
                  лямбда-зонди, датчики, деталі кузова та витратні матеріали для ТО.
                </p>
                <p>
                  Для СТО і автомайстерень партнерство означає нижчу собівартість кожного ремонту.
                  Для автомагазинів — стабільного постачальника з широким каталогом і вигідною закупівельною ціною.
                  Для приватних механіків — можливість закладати різницю у свою маржу, купуючи деталі для клієнтів.
                </p>
                <p>
                  Партнерський статус не має терміну дії і не вимагає мінімального обороту щомісяця.
                  Разом з тим, усі нові партнери отримують доступ до ексклюзивних акцій — сезонних знижок,
                  комплектів для ТО та спеціальних пропозицій, які доступні тільки зареєстрованим партнерам.
                </p>
              </div>
            </div>

            {/* side */}
            <div className="space-y-4">

              {/* who works with us */}
              <div className="relative overflow-hidden rounded-[20px] border border-white/78 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(236,254,255,0.92))] p-5 shadow-[0_8px_20px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.92)]">
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-sky-200/70 bg-sky-50 text-sky-600">
                    <Users size={13} strokeWidth={1.9} />
                  </span>
                  <p className="text-[12.5px] font-extrabold text-slate-900">Хто з нами співпрацює</p>
                </div>
                <div className="space-y-2">
                  {[
                    { Icon: Building2, label: "СТО та автосервіси", sub: "Закупівлі фільтрів, гальм, ходової" },
                    { Icon: Store, label: "Автомагазини та дилери", sub: "Поповнення складу та асортименту" },
                    { Icon: Wrench, label: "Приватні механіки", sub: "Деталі під конкретні замовлення" },
                    { Icon: Package, label: "Транспортні компанії", sub: "Обслуговування флоту та спецтехніки" },
                  ].map(({ Icon, label, sub }) => (
                    <div key={label} className="flex items-center gap-2.5 border-b border-sky-100/45 pb-2 last:border-0 last:pb-0">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-sky-200/55 bg-sky-50/75 text-sky-600">
                        <Icon size={11} strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-slate-800 leading-tight">{label}</p>
                        <p className="text-[10.5px] font-medium text-slate-500">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* catalog highlights */}
              <div className="relative overflow-hidden rounded-[20px] border border-white/78 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(219,234,254,0.90))] p-5 shadow-[0_8px_20px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.92)]">
                <span className="pointer-events-none absolute -right-6 -top-6 h-18 w-18 rounded-full bg-indigo-200/18 blur-2xl" />
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-indigo-200/70 bg-indigo-50 text-indigo-600">
                    <TrendingUp size={13} strokeWidth={1.9} />
                  </span>
                  <p className="text-[12.5px] font-extrabold text-slate-900">Каталог PartsON</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: "200+", label: "Брендів запчастин" },
                    { val: "50+", label: "Марок авто" },
                    { val: "Львів", label: "Власний склад" },
                    { val: "1–2 дні", label: "Доставка по Львову" },
                  ].map(({ val, label }) => (
                    <div key={label} className="rounded-[10px] border border-sky-100/60 bg-white/55 px-3 py-2 text-center">
                      <p className="text-[1.1rem] font-black tracking-tight text-indigo-700">{val}</p>
                      <p className="text-[10px] font-semibold text-slate-500 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
