'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Percent, ShieldCheck, X } from 'lucide-react';

type OrderPayload = Record<string, unknown>;
type LiqPayInitParams = {
  data: string;
  signature: string;
  embedTo: string;
  mode: 'embed' | 'popup';
};
type LiqPayCallbackData = {
  status?: string;
  transaction_id?: string | number;
  payment_id?: string | number;
};
type LiqPayInstance = {
  on: (
    event: 'liqpay.callback',
    callback: (data?: LiqPayCallbackData) => void,
  ) => LiqPayInstance;
};

interface Props {
  paymentMethod: 'Картка' | 'Готівка' | '';
  setPaymentMethod: (method: 'Картка' | 'Готівка' | '') => void;
  onBack: () => void;
  amount: number;
  subtotalAmount?: number;
  discountAmount?: number;
  isFirstOrderDiscountApplied?: boolean;
  orderId: string;
  name: string;
  phone: string;
  deliveryMethod: string;
  onCardPaymentStarted?: (orderData: OrderPayload) => Promise<void> | void;
  onPaymentConfirmed: (orderData: OrderPayload) => Promise<void> | void;
  onConfirm: () => void;
}

declare global {
  interface Window {
    LiqPayCheckout?: {
      init: (params: LiqPayInitParams) => LiqPayInstance;
    };
  }
}

const resolveSameOriginPaymentUrl = (
  configuredUrl: string | undefined,
  fallbackPath: string,
) => {
  if (typeof window === 'undefined') return fallbackPath;

  const origin = window.location.origin;
  const fallbackUrl = new URL(fallbackPath, origin).toString();
  const rawConfiguredUrl = (configuredUrl || '').trim();

  if (!rawConfiguredUrl) return fallbackUrl;

  try {
    const parsedUrl = new URL(rawConfiguredUrl, origin);
    return parsedUrl.origin === origin ? parsedUrl.toString() : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
};

const PaymentMethod: React.FC<Props> = ({
  paymentMethod,
  setPaymentMethod,
  onBack,
  amount,
  subtotalAmount = amount,
  discountAmount = 0,
  isFirstOrderDiscountApplied = false,
  orderId,
  name,
  phone,
  deliveryMethod,
  onCardPaymentStarted,
  onPaymentConfirmed,
  onConfirm,
}) => {
  const alreadyInitiated = useRef(false);
  const paymentConfirmationRef = useRef(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPaymentWindowOpen, setIsPaymentWindowOpen] = useState(false);
  const [paymentAttempt, setPaymentAttempt] = useState(0);
  const [hasMounted, setHasMounted] = useState(false);
  const [sdkStatus, setSdkStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    typeof window !== 'undefined' && window.LiqPayCheckout ? 'ready' : 'loading',
  );
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const checkoutContainerId = `liqpay-checkout-${orderId.replace(/[^a-zA-Z0-9_-]/g, '-') || 'order'}`;
  const formattedAmount = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 2,
  }).format(amount);
  const formattedSubtotalAmount = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 2,
  }).format(subtotalAmount);
  const formattedDiscountAmount = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(discountAmount);
  const paidLiqPayStatuses = new Set(['success']);
  const failedLiqPayStatuses = new Set([
    'failure',
    'error',
    'reversed',
    'subscribed',
    'unsubscribed',
  ]);

  const openPaymentWindow = () => {
    alreadyInitiated.current = false;
    if (!isPaid) {
      paymentConfirmationRef.current = false;
    }
    setPaymentError(null);
    setIsPaymentWindowOpen(true);
    setPaymentAttempt((attempt) => attempt + 1);
  };

  const closePaymentWindow = () => {
    setIsPaymentWindowOpen(false);
    if (!isPaid) {
      alreadyInitiated.current = false;
    }
  };

  const handleConfirm = async (paymentDetails?: OrderPayload) => {
    if (isConfirming) return;

    const orderData = {
      name,
      phone,
      amount,
      subtotalAmount,
      discountAmount,
      isFirstOrderDiscountApplied,
      orderId,
      paymentMethod,
      deliveryMethod,
      paymentStatus:
        paymentDetails?.paymentStatus ??
        (paymentMethod === 'Готівка' ? 'cash_on_delivery' : isPaid ? 'paid' : 'pending'),
      paymentProvider:
        paymentDetails?.paymentProvider ?? (paymentMethod === 'Картка' ? 'liqpay' : 'cash'),
      ...paymentDetails,
    };
    try {
      setIsConfirming(true);
      await onPaymentConfirmed(orderData);
      onConfirm();
    } catch (error) {
      console.error('Помилка під час підтвердження замовлення:', error);
      alert('Сталася помилка під час підтвердження замовлення.');
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.LiqPayCheckout) {
      setSdkStatus('ready');
      return;
    }

    const existingScript = document.getElementById('liqpay-sdk') as HTMLScriptElement | null;
    const handleLoad = () => {
      setSdkStatus(window.LiqPayCheckout ? 'ready' : 'error');
      if (!window.LiqPayCheckout) {
        setPaymentError('Платіжний віджет LiqPay не ініціалізувався. Спробуйте оновити сторінку.');
      }
    };
    const handleError = () => {
      setSdkStatus('error');
      setPaymentError('Не вдалося завантажити LiqPay. Перевірте підключення або спробуйте ще раз.');
    };

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);

      return () => {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://static.liqpay.ua/libjs/checkout.js';
    script.id = 'liqpay-sdk';
    script.async = true;
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'Картка') {
      alreadyInitiated.current = false;
      paymentConfirmationRef.current = false;
      setIsPaid(false);
      setPaymentError(null);
      setIsPaymentWindowOpen(false);
      return;
    }

    if (!isPaymentWindowOpen) {
      return;
    }

    if (sdkStatus !== 'ready') {
      return;
    }

    alreadyInitiated.current = false;

    let cancelled = false;

    const initLiqPay = async () => {
      try {
        setPaymentError(null);
        await onCardPaymentStarted?.({
          name,
          phone,
          amount,
          subtotalAmount,
          discountAmount,
          isFirstOrderDiscountApplied,
          orderId,
          paymentMethod,
          deliveryMethod,
          paymentStatus: 'pending',
          paymentProvider: 'liqpay',
        });

        if (cancelled) return;

        const resultUrl =
          resolveSameOriginPaymentUrl(process.env.NEXT_PUBLIC_LIQPAY_RESULT_URL, '/success');
        const callbackUrl =
          resolveSameOriginPaymentUrl(
            process.env.NEXT_PUBLIC_LIQPAY_SERVER_URL,
            '/api/liqpay/callback',
          );

        const res = await fetch('/api/liqpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: '3',
            action: 'pay',
            amount,
            currency: 'UAH',
            description: `Оплата замовлення №${orderId}`,
            order_id: orderId,
            language: 'uk',
            result_url: resultUrl,
            server_url: callbackUrl,
          }),
        });

        if (cancelled) return;

        const json = (await res.json()) as {
          data?: string;
          signature?: string;
          error?: string;
        };

        if (cancelled) return;

        if (!res.ok || !json.data || !json.signature) {
          console.error('Помилка даних LiqPay:', json.error || 'Некоректні дані');
          setPaymentError(
            json.error || 'Помилка ініціалізації оплати. Перевірте ключі та публічні URL LiqPay.',
          );
          return;
        }

        if (!window.LiqPayCheckout) {
          console.error('LiqPayCheckout не завантажений');
          setPaymentError('Платіжний віджет ще не готовий. Спробуйте ще раз за кілька секунд.');
          return;
        }

        const checkoutContainer = document.getElementById(checkoutContainerId);
        if (checkoutContainer) {
          checkoutContainer.innerHTML = '';
        }

        window.LiqPayCheckout.init({
          data: json.data,
          signature: json.signature,
          embedTo: `#${checkoutContainerId}`,
          mode: 'embed',
        })
          .on('liqpay.callback', async (liqpayData) => {
            if (cancelled) return;
            const status = (liqpayData?.status || '').trim().toLowerCase();

            if (paidLiqPayStatuses.has(status)) {
              if (paymentConfirmationRef.current) return;
              paymentConfirmationRef.current = true;
              setIsPaid(true);
              setPaymentError(null);
              setIsPaymentWindowOpen(false);

              try {
                await handleConfirm({
                  paymentStatus: 'paid',
                  paymentProvider: 'liqpay',
                  liqpayStatus: status,
                  liqpayTransactionId:
                    liqpayData?.transaction_id != null
                      ? String(liqpayData.transaction_id)
                      : null,
                  liqpayPaymentId:
                    liqpayData?.payment_id != null ? String(liqpayData.payment_id) : null,
                  paidAt: new Date().toISOString(),
                });
              } catch (error) {
                console.error('Помилка підтвердження після успішної оплати:', error);
                paymentConfirmationRef.current = false;
              }
              return;
            }

            if (failedLiqPayStatuses.has(status)) {
              setPaymentError('Оплата не пройшла. Спробуйте ще раз або оберіть інший спосіб.');
              return;
            }

            if (status) {
              setPaymentError(`Платіж очікує підтвердження LiqPay. Статус: ${status}.`);
            }
          });

        alreadyInitiated.current = true;
      } catch (err) {
        if (cancelled) return;
        console.error('Помилка ініціалізації LiqPay:', err);
        setPaymentError('Не вдалося ініціалізувати оплату карткою. Перевірте налаштування LiqPay.');
      }
    };

    if (!alreadyInitiated.current) {
      initLiqPay();
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentMethod,
    amount,
    orderId,
    name,
    phone,
    deliveryMethod,
    onCardPaymentStarted,
    sdkStatus,
    isPaymentWindowOpen,
    paymentAttempt,
    checkoutContainerId,
  ]);

  const isConfirmationEnabled =
    paymentMethod === 'Готівка' || (paymentMethod === 'Картка' && isPaid);
  const paymentWindow =
    hasMounted && isPaymentWindowOpen && paymentMethod === 'Картка'
      ? createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/45 px-2 py-2 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="liqpay-payment-title"
          >
            <div className="soft-modal-shell soft-panel-glow flex max-h-[calc(100dvh-1rem)] w-full max-w-[720px] overflow-hidden rounded-[20px] sm:max-h-[calc(100dvh-3rem)]">
              <div className="soft-panel-content flex min-h-0 w-full flex-col">
                <div className="border-b border-sky-100/80 px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-sky-100 bg-white/90 text-sky-700 shadow-[0_12px_24px_rgba(14,165,233,0.12)]">
                        <Image
                          src="/liqpay-payment-symbol.svg"
                          alt=""
                          width={185}
                          height={119}
                          className="h-8 w-9 object-contain"
                          aria-hidden="true"
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">
                          Платіжне вікно LiqPay
                        </p>
                        <h2
                          id="liqpay-payment-title"
                          className="font-display mt-1 text-[20px] font-[760] leading-tight tracking-normal text-slate-900 sm:text-[24px]"
                        >
                          Оплата карткою
                        </h2>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={closePaymentWindow}
                      aria-label="Закрити платіжне вікно"
                      className="soft-icon-button h-10 w-10 shrink-0 hover:text-slate-900"
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="soft-surface-card rounded-[16px] px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        До оплати
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {formattedAmount}
                      </p>
                      {isFirstOrderDiscountApplied && (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          Знижка першого замовлення: -{formattedDiscountAmount}
                        </p>
                      )}
                    </div>
                    <div className="soft-surface-card rounded-[16px] px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        Замовлення
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-slate-800">
                        №{orderId}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  {sdkStatus === 'loading' && (
                    <div className="soft-note flex items-center gap-3 rounded-[16px] px-4 py-3 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
                      <span>Завантажуємо захищену форму оплати...</span>
                    </div>
                  )}

                  {paymentError && (
                    <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {paymentError}
                    </div>
                  )}

                  {sdkStatus === 'ready' && (
                    <div className="soft-surface-card mt-3 overflow-hidden rounded-[18px] p-2 sm:p-3">
                      <div
                        id={checkoutContainerId}
                        className="min-h-[420px] w-full rounded-[14px] bg-white/80"
                      />
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 rounded-[16px] border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 text-xs font-semibold text-emerald-800">
                    <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span>Дані картки вводяться у захищеній формі LiqPay.</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-sky-100/80 px-4 py-3 sm:flex-row sm:justify-between sm:px-5">
                  <button
                    type="button"
                    onClick={closePaymentWindow}
                    className="soft-secondary-button px-4 py-2.5 text-sm font-semibold"
                  >
                    Закрити
                  </button>
                  <button
                    type="button"
                    onClick={openPaymentWindow}
                    disabled={sdkStatus === 'loading'}
                    className="soft-primary-button px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Оновити форму оплати
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mt-5 space-y-4 text-sky-50">
      <p className="text-sm font-semibold text-sky-50">Оберіть спосіб оплати:</p>

      <div className="flex flex-col gap-3">
        <label
          className={`cursor-pointer rounded-[16px] border px-3.5 py-2.5 transition ${
            paymentMethod === 'Картка'
              ? 'soft-segment soft-segment--active'
              : 'soft-surface-card text-slate-700 hover:bg-white/70'
          }`}
        >
          <input
            type="radio"
            value="card"
            checked={paymentMethod === 'Картка'}
            onChange={() => {
              setPaymentMethod('Картка');
              openPaymentWindow();
            }}
            className="mr-2"
          />
          Оплата карткою
        </label>

        <label
          className={`cursor-pointer rounded-[16px] border px-3.5 py-2.5 transition ${
            paymentMethod === 'Готівка'
              ? 'soft-segment soft-segment--active'
              : 'soft-surface-card text-slate-700 hover:bg-white/70'
          }`}
        >
          <input
            type="radio"
            value="cash"
            checked={paymentMethod === 'Готівка'}
            onChange={() => setPaymentMethod('Готівка')}
            className="mr-2"
          />
          Оплата готівкою
        </label>
      </div>

      {paymentMethod === 'Картка' && sdkStatus === 'loading' && (
        <div className="soft-note rounded-[16px] px-4 py-3 text-sm">
          Готуємо платіжне вікно LiqPay...
        </div>
      )}

      {paymentMethod === 'Картка' && (
        <div className="soft-surface-card flex flex-col gap-3 rounded-[18px] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-sky-100 bg-white/90 text-sky-700">
              <Image
                src="/liqpay-payment-symbol.svg"
                alt=""
                width={185}
                height={119}
                className="h-7 w-8 object-contain"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">Оплата карткою через LiqPay</p>
              <p className="mt-0.5 text-xs font-medium text-slate-600">
                Сума: <span className="font-semibold text-slate-700">{formattedAmount}</span>
              </p>
              {isFirstOrderDiscountApplied && (
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  Було {formattedSubtotalAmount}, знижка -{formattedDiscountAmount}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={openPaymentWindow}
            className="soft-primary-button w-full px-4 py-2.5 text-sm font-semibold sm:w-auto"
          >
            {isPaid ? 'Оплату виконано' : 'Відкрити оплату'}
          </button>
        </div>
      )}

      {isFirstOrderDiscountApplied && (
        <div className="rounded-[18px] border border-slate-200 bg-white/90 px-3.5 py-3 text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-slate-200 bg-slate-50 text-emerald-600 shadow-[0_8px_16px_rgba(15,23,42,0.05)]">
                <Percent size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Знижка першого замовлення</p>
                <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">
                  Було {formattedSubtotalAmount}, знижка -{formattedDiscountAmount}.
                </p>
              </div>
            </div>
            <span className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-bold text-slate-800">
              До оплати {formattedAmount}
            </span>
          </div>
        </div>
      )}

      {paymentError && (
        <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {paymentError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium leading-5 text-slate-600">
        <ShieldCheck size={14} className="text-emerald-600" aria-hidden="true" />
        <span>Продовжуючи оплату, ви погоджуєтеся з умовами</span>
        <Link href="/inform/payment" className="font-semibold text-sky-700 underline underline-offset-2">
          оплати
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/inform/delivery" className="font-semibold text-sky-700 underline underline-offset-2">
          доставки
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/inform/returns" className="font-semibold text-sky-700 underline underline-offset-2">
          повернення
        </Link>
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
        <button
          onClick={onBack}
          className="soft-secondary-button flex w-full items-center justify-center gap-2 py-2.5 text-sm font-medium sm:w-auto sm:min-w-[170px]"
        >
          <ArrowLeft size={18} /> Назад
        </button>

        <button
          onClick={() => {
            void handleConfirm();
          }}
          disabled={!isConfirmationEnabled || isConfirming}
          className="soft-primary-button flex w-full items-center justify-center gap-2 py-2.5 text-sm font-medium disabled:opacity-50 sm:w-auto sm:min-w-[220px]"
        >
          <Check size={18} />
          {isConfirming ? 'Підтвердження...' : 'Підтвердити оплату'}
        </button>
      </div>

      {paymentWindow}
    </div>
  );
};

export default PaymentMethod;
