"use client";

import { useEffect } from "react";

import { pushDataLayer } from "app/lib/gtm";

export default function PurchaseEvent() {
  useEffect(() => {
    pushDataLayer({ event: "purchase", currency: "UAH" });
  }, []);
  return null;
}
