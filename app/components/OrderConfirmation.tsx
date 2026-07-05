"use client";

import { useState } from "react";
import {
  CheckCircle,
  CreditCard,
  PackageCheck,
  Percent,
  Phone,
  ReceiptText,
  Star,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import { getFirestore, doc, updateDoc, Timestamp } from "firebase/firestore";

interface OrderConfirmationProps {
  name: string;
  phone: string;
  orderId: string;
  totalAmount: number;
  subtotalAmount?: number;
  discountAmount?: number;
  isFirstOrderDiscountApplied?: boolean;
  paymentMethod: string;
  paymentStatus: string;
  onClose: () => void;
}

const STAR_LABELS = ["", "Погано", "Нижче середнього", "Нормально", "Добре", "Відмінно"];

const saveRating = async (orderId: string, rating: number, comment: string) => {
  try {
    const db = getFirestore();
    await updateDoc(doc(db, "orders", orderId), {
      feedbackRating: rating,
      feedbackComment: comment.trim() || null,
      feedbackAt: Timestamp.now(),
    });
    return true;
  } catch {
    return false;
  }
};

const OrderConfirmation: React.FC<OrderConfirmationProps> = ({
  name,
  phone,
  orderId,
  totalAmount,
  subtotalAmount = totalAmount,
  discountAmount = 0,
  isFirstOrderDiscountApplied = false,
  paymentMethod,
  paymentStatus,
  onClose,
}) => {
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const formattedAmount = new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 2,
  }).format(totalAmount);
  const formattedSubtotalAmount = new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 2,
  }).format(subtotalAmount);
  const formattedDiscountAmount = new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(discountAmount);
  const isPaid = paymentStatus === "paid";

  const displayStar = hovered || selected;

  const handleSubmitRating = async () => {
    if (!selected) return;
    setSaving(true);
    await saveRating(orderId, selected, comment);
    setSaving(false);
    setSubmitted(true);
  };

  return (
    <div className="mx-auto mt-4 max-w-xl space-y-3 text-sky-50 sm:mt-5">
      <div className="soft-panel-hero px-4 py-5 text-center sm:px-5 sm:py-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-emerald-100 bg-white/90 text-emerald-500 shadow-[0_18px_34px_rgba(16,185,129,0.18)]">
          <CheckCircle size={42} className="animate-pulse" aria-hidden="true" />
        </div>

        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
          {isPaid ? "Оплату зараховано" : "Замовлення прийнято"}
        </p>
        <h2 className="font-display mt-1 text-2xl font-[760] leading-tight tracking-normal text-slate-900">
          Замовлення підтверджено
        </h2>

        <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-6 text-slate-600">
          Дякуємо, <span className="font-semibold text-slate-800">{name}</span>. Менеджер зв&apos;яжеться з вами за номером{" "}
          <span className="font-semibold text-blue-600">{phone}</span>.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <ReceiptText size={15} aria-hidden="true" />
            Замовлення
          </div>
          <p className="mt-1 break-all font-mono text-sm font-bold text-blue-700">
            №{orderId}
          </p>
        </div>
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <PackageCheck size={15} aria-hidden="true" />
            Сума
          </div>
          <p className="mt-1 text-sm font-bold text-emerald-700">{formattedAmount}</p>
          {isFirstOrderDiscountApplied && (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Було {formattedSubtotalAmount}
            </p>
          )}
        </div>
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <CreditCard size={15} aria-hidden="true" />
            Оплата
          </div>
          <p className="mt-1 text-sm font-bold text-slate-800">
            {paymentMethod || "Не вказано"}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            {isPaid ? "Зараховано" : "Оплата при отриманні"}
          </p>
        </div>
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Phone size={15} aria-hidden="true" />
            Контакт
          </div>
          <p className="mt-1 break-all text-sm font-bold text-slate-800">{phone}</p>
        </div>
      </div>

      {isFirstOrderDiscountApplied && (
        <div className="rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-slate-200 bg-slate-50 text-emerald-600 shadow-[0_8px_16px_rgba(15,23,42,0.05)]">
                <Percent size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Знижку першого замовлення враховано</p>
                <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">
                  Було {formattedSubtotalAmount}, економія {formattedDiscountAmount}.
                </p>
              </div>
            </div>
            <span className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-bold text-slate-800">
              Разом {formattedAmount}
            </span>
          </div>
        </div>
      )}

      {/* Rating survey */}
      <div className="soft-surface-card rounded-[20px] px-4 py-4">
        {submitted ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-emerald-50 text-emerald-500">
              <ThumbsUp size={20} aria-hidden="true" />
            </span>
            <p className="text-sm font-bold text-slate-900">Дякуємо за відгук!</p>
            <p className="text-xs text-slate-500">Ваша оцінка допомагає нам ставати кращими.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-amber-50 text-amber-500">
                <Star size={14} fill="currentColor" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold text-slate-900">Оцініть ваш досвід</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Це займе 10 секунд і допоможе нам стати кращими
            </p>

            <div
              className="mt-3 flex items-center justify-center gap-1.5"
              role="group"
              aria-label="Оцінка від 1 до 5"
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= displayStar;
                return (
                  <button
                    key={star}
                    type="button"
                    aria-label={`${star} зірка — ${STAR_LABELS[star]}`}
                    aria-pressed={selected === star}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setSelected(star)}
                    className={`flex h-10 w-10 items-center justify-center rounded-[12px] border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 ${
                      active
                        ? "border-amber-300 bg-amber-50 text-amber-500 shadow-[0_4px_12px_rgba(245,158,11,0.18)]"
                        : "border-slate-200 bg-white text-slate-300 hover:border-amber-200 hover:text-amber-300"
                    }`}
                  >
                    <Star
                      size={20}
                      fill={active ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>

            {displayStar > 0 && (
              <p className="mt-1.5 text-center text-[11px] font-semibold text-amber-600">
                {STAR_LABELS[displayStar]}
              </p>
            )}

            {selected > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <MessageSquare size={12} aria-hidden="true" />
                  Коментар (необов&apos;язково)
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={400}
                  rows={2}
                  placeholder="Що сподобалось або що варто покращити?"
                  className="mt-1.5 w-full resize-none rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700 placeholder-slate-400 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-200/60"
                />
              </div>
            )}

            {selected > 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmitRating}
                className="soft-primary-button mt-3 w-full py-2 text-xs font-semibold disabled:opacity-60"
              >
                {saving ? "Відправляємо…" : "Надіслати оцінку"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onClose}
          className="soft-primary-button mt-1 w-full px-5 py-2.5 text-sm font-semibold sm:w-auto"
        >
          Готово
        </button>
      </div>
    </div>
  );
};

export default OrderConfirmation;
