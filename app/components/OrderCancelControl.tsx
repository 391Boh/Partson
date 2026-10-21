"use client";

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";

import { auth } from "../../firebase";
import { requestOrderCancel } from "app/lib/order-cancel-client";

type OrderCancelControlProps = {
  orderId: string;
  /** Shown above the button; the order history passes nothing. */
  hint?: string;
};

// Cancelling is final, so it takes a second, explicit "Так, скасувати" —
// inline, not a browser confirm(). The server decides whether the order can
// still be cancelled (manager has not opened it, paid on delivery).
export default function OrderCancelControl({ orderId, hint }: OrderCancelControlProps) {
  const [step, setStep] = useState<"idle" | "confirm" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  const cancel = async () => {
    setStep("sending");
    setError("");
    const result = await requestOrderCancel(orderId, auth.currentUser);
    if (result.ok) {
      setStep("done");
      return;
    }
    setError(result.error);
    setStep("confirm");
  };

  if (step === "done") {
    return (
      <p className="order-cancel-done" role="status">
        <Ban size={15} aria-hidden="true" />
        Замовлення скасовано.
      </p>
    );
  }

  return (
    <div className="order-cancel">
      {step === "idle" ? (
        <>
          {hint ? <p className="order-cancel-hint">{hint}</p> : null}
          <button type="button" className="order-cancel-trigger" onClick={() => setStep("confirm")}>
            <Ban size={15} aria-hidden="true" />
            Скасувати замовлення
          </button>
        </>
      ) : (
        <div className="order-cancel-confirm">
          <p className="order-cancel-question">Скасувати замовлення №{orderId}? Відновити його буде неможливо.</p>
          <div className="order-cancel-actions">
            <button
              type="button"
              className="order-cancel-yes"
              onClick={() => void cancel()}
              disabled={step === "sending"}
            >
              {step === "sending" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
              {step === "sending" ? "Скасовуємо…" : "Так, скасувати"}
            </button>
            <button
              type="button"
              className="order-cancel-no"
              onClick={() => {
                setStep("idle");
                setError("");
              }}
              disabled={step === "sending"}
            >
              Ні, залишити
            </button>
          </div>
          {error ? (
            <p className="order-cancel-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
