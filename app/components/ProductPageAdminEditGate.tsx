"use client";

import dynamic from "next/dynamic";
import { ChevronDown, PenSquare, Settings2 } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { loadPrivateProductPrice } from "app/lib/private-product-price-client";

import { setAdminLayoutHint } from "app/lib/admin-layout-hint";

import type { ProductPageAdminEditPanelProps } from "./ProductPageAdminEditPanel";

const AdminPreviewContext = createContext<ProductPageAdminEditPanelProps | null>(null);

function AdminPricePreview({ firstPaint = false }: { firstPaint?: boolean } = {}) {
  const product = useContext(AdminPreviewContext);
  const money = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  return (
    <div className={firstPaint ? "product-admin-price-preview" : "product-admin-bar"} aria-busy="true" data-nosnippet>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled className="product-admin-bar-toggle flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[12px] px-1.5 pr-2.5 text-left">
          <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-[9px] bg-violet-600 px-2 text-white"><Settings2 size={13} aria-hidden="true" /><span className="text-[10px] font-black uppercase tracking-[0.12em]">Адмін</span></span>
          <span className="flex min-w-0 items-center gap-3 overflow-hidden pl-1 text-[12px] text-slate-500">
            <span className="shrink-0 whitespace-nowrap">Продаж <strong className="font-bold tabular-nums text-slate-900">{money(product?.priceEuro)} €</strong></span>
            <span className="shrink-0 whitespace-nowrap max-sm:hidden">Закуп <strong className="font-bold tabular-nums text-amber-700">{money(product?.costPriceEuro)} €</strong></span>
            <span className="shrink-0 whitespace-nowrap max-sm:hidden">Залишок <strong className="font-bold tabular-nums text-emerald-700">{product?.quantity ?? 0} шт.</strong></span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-bold text-violet-700"><span className="max-sm:hidden">Редагувати</span><ChevronDown size={15} aria-hidden="true" /></span>
        </button>
        <button type="button" disabled aria-label="Редактор завантажується" className="product-admin-bar-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-violet-700"><PenSquare size={15} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

// While the panel's code loads, an admin sees its collapsed bar's exact box
// (ProductPageAdminEditPanel's root), so the page below doesn't jump down.
const ProductPageAdminEditPanel = dynamic(
  () => import("./ProductPageAdminEditPanel"),
  {
    ssr: false,
    loading: () => <AdminPricePreview />,
  }
);

export default function ProductPageAdminEditGate(
  props: ProductPageAdminEditPanelProps
) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let storedAdmin = false;
    try {
      const uid = localStorage.getItem("user_id");
      storedAdmin = Boolean(uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1");
    } catch {
      // Storage can be unavailable in privacy modes.
    }
    if (storedAdmin) {
      setIsAdmin(true);
      void loadPrivateProductPrice([props.code, props.article]);
    }
    // The <head> hint reserved the bar's row from the same flag; keep the two
    // in step so a stale flag never leaves an empty reserved row.
    setAdminLayoutHint(storedAdmin);

    const handleAdminState = (event: Event) => {
      const detail = (event as CustomEvent<{ isAdmin?: boolean }>).detail;
      const admin = detail?.isAdmin === true;
      setIsAdmin(admin);
      setAdminLayoutHint(admin);
      if (admin) void loadPrivateProductPrice([props.code, props.article]);
    };

    window.addEventListener("partson:adminStateChange", handleAdminState);
    return () =>
      window.removeEventListener("partson:adminStateChange", handleAdminState);
  }, [props.code, props.article]);

  return (
    <AdminPreviewContext.Provider value={props}>
      {isAdmin ? <ProductPageAdminEditPanel {...props} /> : <AdminPricePreview firstPaint />}
    </AdminPreviewContext.Provider>
  );
}
