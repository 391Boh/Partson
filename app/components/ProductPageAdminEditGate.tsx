"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { ProductPageAdminEditPanelProps } from "./ProductPageAdminEditPanel";

// While the panel's code loads, an admin sees its collapsed bar's exact box
// (ProductPageAdminEditPanel's root), so the page below doesn't jump down.
const ProductPageAdminEditPanel = dynamic(
  () => import("./ProductPageAdminEditPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="mb-3 px-3 pt-3 pb-2 sm:px-5 lg:px-7" aria-hidden="true">
        <div className="h-9 rounded-[10px] border border-violet-200/60 bg-white" />
      </div>
    ),
  }
);

export default function ProductPageAdminEditGate(
  props: ProductPageAdminEditPanelProps
) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const uid = localStorage.getItem("user_id");
      if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
        setIsAdmin(true);
      }
    } catch {
      // Storage can be unavailable in privacy modes.
    }

    const handleAdminState = (event: Event) => {
      const detail = (event as CustomEvent<{ isAdmin?: boolean }>).detail;
      setIsAdmin(detail?.isAdmin === true);
    };

    window.addEventListener("partson:adminStateChange", handleAdminState);
    return () =>
      window.removeEventListener("partson:adminStateChange", handleAdminState);
  }, []);

  if (!isAdmin) return null;
  return <ProductPageAdminEditPanel {...props} />;
}
