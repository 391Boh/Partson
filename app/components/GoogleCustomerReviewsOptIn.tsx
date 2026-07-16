"use client";

import { useEffect } from "react";

const GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID = 5731482387;
const PLATFORM_SCRIPT_ID = "google-customer-reviews-platform";
const renderedOrderIds = new Set<string>();
const EMPTY_GTINS: string[] = [];

type SurveyOptInPayload = {
  merchant_id: number;
  order_id: string;
  email: string;
  delivery_country: string;
  estimated_delivery_date: string;
  products?: Array<{ gtin: string }>;
};

type GoogleApi = {
  load: (module: "surveyoptin", callback: () => void) => void;
  surveyoptin?: {
    render: (payload: SurveyOptInPayload) => void;
  };
};

declare global {
  interface Window {
    gapi?: GoogleApi;
    renderOptIn?: () => void;
  }
}

type GoogleCustomerReviewsOptInProps = {
  orderId: string;
  email: string;
  deliveryCountry: string;
  estimatedDeliveryDate: string;
  gtins?: string[];
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default function GoogleCustomerReviewsOptIn({
  orderId,
  email,
  deliveryCountry,
  estimatedDeliveryDate,
  gtins = EMPTY_GTINS,
}: GoogleCustomerReviewsOptInProps) {
  useEffect(() => {
    const normalizedOrderId = orderId.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCountry = deliveryCountry.trim().toUpperCase();
    const normalizedGtins = Array.from(
      new Set(gtins.map((gtin) => gtin.trim()).filter((gtin) => /^\d{8,14}$/.test(gtin)))
    );

    if (
      !normalizedOrderId ||
      !isValidEmail(normalizedEmail) ||
      !/^[A-Z]{2}$/.test(normalizedCountry) ||
      !isValidDate(estimatedDeliveryDate)
    ) {
      return;
    }

    let cancelled = false;
    let script: HTMLScriptElement | null = null;

    const renderOptIn = () => {
      if (cancelled || renderedOrderIds.has(normalizedOrderId) || !window.gapi?.load) {
        return;
      }

      window.gapi.load("surveyoptin", () => {
        if (cancelled || renderedOrderIds.has(normalizedOrderId)) return;
        const surveyOptIn = window.gapi?.surveyoptin;
        if (!surveyOptIn) return;

        const payload: SurveyOptInPayload = {
          merchant_id: GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID,
          order_id: normalizedOrderId,
          email: normalizedEmail,
          delivery_country: normalizedCountry,
          estimated_delivery_date: estimatedDeliveryDate,
          ...(normalizedGtins.length > 0
            ? { products: normalizedGtins.map((gtin) => ({ gtin })) }
            : {}),
        };

        surveyOptIn.render(payload);
        renderedOrderIds.add(normalizedOrderId);
      });
    };

    window.renderOptIn = renderOptIn;

    const existingScript = document.getElementById(
      PLATFORM_SCRIPT_ID
    ) as HTMLScriptElement | null;

    if (window.gapi?.load) {
      renderOptIn();
    } else if (existingScript) {
      script = existingScript;
      script.addEventListener("load", renderOptIn, { once: true });
    } else {
      script = document.createElement("script");
      script.id = PLATFORM_SCRIPT_ID;
      script.src = "https://apis.google.com/js/platform.js?onload=renderOptIn";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      script?.removeEventListener("load", renderOptIn);
    };
  }, [deliveryCountry, email, estimatedDeliveryDate, gtins, orderId]);

  return null;
}
