import Link from "next/link";
import { ArrowRight, CarFront, Factory, Layers3 } from "lucide-react";

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
    <div className="flex max-w-full flex-wrap justify-end gap-1.5 select-none">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isCurrent = item.id === current;

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            className={`group inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold leading-none transition sm:text-xs ${
              isCurrent
                ? "border-cyan-300 bg-cyan-50 text-cyan-900 shadow-[0_10px_18px_rgba(8,145,178,0.1)]"
                : "border-slate-200 bg-white/88 text-slate-700 hover:border-slate-300 hover:bg-white"
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                isCurrent
                  ? "border-cyan-200 bg-white text-cyan-700"
                  : "border-slate-200 bg-slate-50 text-slate-500 group-hover:text-slate-700"
              }`}
            >
              <Icon size={12} />
            </span>
            <span>{item.label}</span>
            <ArrowRight
              size={11}
              className={`hidden sm:block ${isCurrent ? "text-cyan-700" : "text-slate-400"}`}
            />
          </Link>
        );
      })}
    </div>
  );
}
