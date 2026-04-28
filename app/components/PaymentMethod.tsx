'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, CreditCard, Loader2, ShieldCheck, X } from 'lucide-react';

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
  orderId: string;
  name: string;
  phone: string;
  deliveryMethod: string;
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

const PaymentMethod: React.FC<Props> = ({
  paymentMethod,
  setPaymentMethod,
  onBack,
  amount,
  orderId,
  name,
  phone,
  deliveryMethod,
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

    // Якщо змінили amount, orderId або інші деталі, переініціалізуємо LiqPay
    alreadyInitiated.current = false;

    const initLiqPay = async () => {
      try {
        setPaymentError(null);
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const resultUrl =
          process.env.NEXT_PUBLIC_LIQPAY_RESULT_URL || `${origin}/success`;
        const callbackUrl =
          process.env.NEXT_PUBLIC_LIQPAY_SERVER_URL || `${origin}/api/liqpay/callback`;

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
            info: JSON.stringify({ name, phone }),
          }),
        });

        const json = (await res.json()) as {
          data?: string;
          signature?: string;
          error?: string;
        };

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
        console.error('Помилка ініціалізації LiqPay:', err);
        setPaymentError('Не вдалося ініціалізувати оплату карткою. Перевірте налаштування LiqPay.');
      }
    };

    if (!alreadyInitiated.current) {
      initLiqPay();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentMethod,
    amount,
    orderId,
    name,
    phone,
    deliveryMethod,
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
                        <CreditCard size={22} strokeWidth={1.9} aria-hidden="true" />
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
    <div className="mt-5 space-y-4 text-slate-700">
      <p>Оберіть спосіб оплати:</p>

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
              <CreditCard size={20} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">Оплата карткою через LiqPay</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Сума: <span className="font-semibold text-slate-700">{formattedAmount}</span>
              </p>
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

      {paymentError && (
        <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {paymentError}
        </div>
      )}

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
