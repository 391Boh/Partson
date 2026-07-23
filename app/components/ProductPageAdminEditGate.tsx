"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { ProductPageAdminEditPanelProps } from "./ProductPageAdminEditPanel";

const ProductPageAdminEditPanel = dynamic(
  () => import("./ProductPageAdminEditPanel"),
  { ssr: false }
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
