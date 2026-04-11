import { CarFront, Factory, Layers3 } from "lucide-react";

import SmartLink from "app/components/SmartLink";

export type CatalogSectionId = "auto" | "groups" | "manufacturers";

interface CatalogSectionNavProps {
  current: CatalogSectionId;
}

const NAV_ITEMS: Array<{
  id: CatalogSectionId;
  href: string;
  label: string;
  icon: typeof CarFront;
}> = [
  { id: "auto", href: "/auto", label: "Авто", icon: CarFront },
  { id: "groups", href: "/groups", label: "Групи", icon: Layers3 },
  { id: "manufacturers", href: "/manufacturers", label: "Виробники", icon: Factory },
];

export default function CatalogSectionNav({
  current,
}: CatalogSectionNavProps) {
  return (
    <nav
      aria-label="Розділи каталогу"
      className="grid max-w-full grid-cols-1 gap-2 select-none sm:grid-cols-3"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isCurrent = item.id === current;

        return (
          <SmartLink
            key={item.id}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            prefetchOnViewport={!isCurrent}
            className={`group inline-flex h-11 items-center justify-center gap-2.5 rounded-[14px] border px-3 text-[13px] font-semibold leading-none transition ${
              isCurrent
                ? "border-cyan-300/90 bg-[linear-gradient(135deg,rgba(236,254,255,0.96),rgba(224,242,254,0.92))] text-cyan-950 shadow-[0_12px_24px_rgba(8,145,178,0.12)]"
                : "border-slate-200/90 bg-white/88 text-slate-700 hover:border-slate-300 hover:bg-white"
            }`}
          >
            <span className="inline-flex min-w-0 items-center gap-2.5">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                  isCurrent
                    ? "border-cyan-200 bg-white text-cyan-700"
                    : "border-slate-200 bg-slate-50 text-slate-500 group-hover:text-slate-700"
                }`}
              >
                <Icon size={13} />
              </span>
              <span>{item.label}</span>
            </span>
          </SmartLink>
        );
      })}
    </nav>
  );
}
