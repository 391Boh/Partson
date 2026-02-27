import type { Metadata } from "next";
import Link from "next/link";

import GroupsCatalogClient, { type GroupListItem } from "app/groups/GroupsCatalogClient";
import { buildSeoSlug } from "app/lib/seo-slug";

export const revalidate = 21600;

const groupsDescription =
  "Підбір автозапчастин за категоріями, групами та підгрупами в каталозі PartsON. Оберіть розділ і переходьте до відфільтрованих товарів.";

export const metadata: Metadata = {
  title: "Категорії та групи автозапчастин",
  description: groupsDescription,
  keywords: [
    "категорії автозапчастин",
    "групи автозапчастин",
    "підбір запчастин",
    "PartsON",
  ],
  alternates: {
    canonical: "/groups",
  },
  openGraph: {
    type: "website",
    url: "/groups",
    locale: "uk_UA",
    title: "Категорії та групи автозапчастин | PartsON",
    description: groupsDescription,
    images: [{ url: "/Car-parts-fullwidth.png", alt: "PartsON - категорії автозапчастин" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Категорії та групи автозапчастин | PartsON",
    description: groupsDescription,
    images: ["/Car-parts-fullwidth.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

interface GroupsPageSearchParams {
  q?: string | string[];
}

const FALLBACK_GROUPS: Array<{ label: string; subgroups: string[] }> = [
  {
    label: "Двигун і навісне",
    subgroups: ["Прокладки", "Ремені ГРМ", "Свічки запалювання", "Натяжні ролики"],
  },
  {
    label: "Підвіска і кермування",
    subgroups: ["Амортизатори", "Опори", "Рульові наконечники", "Сайлентблоки"],
  },
  {
    label: "Гальмівна система",
    subgroups: ["Колодки", "Диски", "Супорти", "Гальмівні шланги"],
  },
  {
    label: "Охолодження і кондиціонер",
    subgroups: ["Радіатори", "Термостати", "Помпи", "Конденсори"],
  },
  {
    label: "Електрика і датчики",
    subgroups: ["Датчики", "Стартери", "Генератори", "Лампи"],
  },
  {
    label: "Фільтри і техрідини",
    subgroups: ["Масляні фільтри", "Повітряні фільтри", "Антифриз", "Оливи"],
  },
];

const normalizeQuery = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] || "" : value || "";
  return raw.trim();
};

const buildFallbackGroups = (): GroupListItem[] =>
  FALLBACK_GROUPS.map((group) => {
    const groupSlug = buildSeoSlug(group.label);
    const subgroups = group.subgroups.map((subgroupLabel) => ({
      label: subgroupLabel,
      slug: buildSeoSlug(`${group.label}-${subgroupLabel}`),
      productCount: 0,
    }));

    return {
      label: group.label,
      slug: groupSlug,
      productCount: 0,
      subgroups,
    };
  });

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: Promise<GroupsPageSearchParams>;
}) {
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as GroupsPageSearchParams)
  );

  const query = normalizeQuery(resolvedSearchParams.q);
  const clientGroups = buildFallbackGroups();

  return (
    <main className="relative h-[calc(100dvh-var(--header-height,0px))] overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.2),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-200/25 via-cyan-100/10 to-transparent" />

      <div className="relative mx-auto flex h-full w-full max-w-[1240px] flex-col px-4 py-3 sm:py-4">
        <section className="shrink-0 rounded-2xl border border-white/70 bg-white/88 p-3 shadow-[0_14px_30px_rgba(15,23,42,0.09)] backdrop-blur-sm sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700">
                Навігація каталогу
              </p>
              <h1 className="mt-2 text-lg font-semibold italic tracking-tight text-slate-900 sm:text-xl">
                Підбір автозапчастин за категоріями і групами
              </h1>
              <p className="mt-1 max-w-[760px] text-xs leading-relaxed text-slate-600 sm:text-sm">
                Оберіть категорію, потім групу та підгрупу, щоб відкрити товари з уже застосованим фільтром.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/katalog"
                className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Повний каталог
              </Link>
              <Link
                href="/manufacturers"
                className="inline-flex h-8 items-center rounded-lg border border-cyan-300 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
              >
                Виробники
              </Link>
            </div>
          </div>
        </section>

        <GroupsCatalogClient initialGroups={clientGroups} initialQuery={query} />
      </div>
    </main>
  );
}
