'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';

type OrderPayload = Record<string, unknown>;
type LiqPayInitParams = {
  data: string;
  signature: string;
  embedTo: string;
  mode: 'embed' | 'popup';
};
type LiqPayCallbackData = {
  status?: string;
};
type LiqPayInstance = {
  on: (
    event: 'liqpay.callback' | 'liqpay.close',
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
  const [isPaid, setIsPaid] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    const orderData = { name, phone, amount, orderId, paymentMethod, deliveryMethod };
    try {
      setIsConfirming(true);
      console.log('Починаємо підтвердження замовлення...', orderData);
      await onPaymentConfirmed(orderData);
      console.log('Підтвердження замовлення пройшло, викликаємо onConfirm');
      onConfirm();
    } catch (error) {
      console.error('Помилка під час підтвердження замовлення:', error);
      alert('Сталася помилка під час підтвердження замовлення.');
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    if (!document.getElementById('liqpay-sdk')) {
      const script = document.createElement('script');
      script.src = 'https://static.liqpay.ua/libjs/checkout.js';
      script.id = 'liqpay-sdk';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'Картка') {
      alreadyInitiated.current = false;
      setIsPaid(false);
      return;
    }

    // Якщо змінили amount, orderId або інші деталі, переініціалізуємо LiqPay
    alreadyInitiated.current = false;

    const initLiqPay = async () => {
      try {
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
          console.error('LiqPay payload error:', json.error || 'Invalid payload');
          alert('Помилка ініціалізації оплати. Перевірте налаштування ключів.');
          return;
        }

        if (!window.LiqPayCheckout) {
          console.error('LiqPayCheckout не завантажений');
          return;
        }

        window.LiqPayCheckout.init({
          data: json.data,
          signature: json.signature,
          embedTo: '#liqpay_checkout',
          mode: 'embed',
        })
          .on('liqpay.callback', async (liqpayData) => {
            if (liqpayData?.status === 'success') {
              setIsPaid(true);
              // Автоматично підтверджуємо оплату після успіху
              try {
                await handleConfirm();
              } catch (error) {
                console.error('Помилка підтвердження після успішної оплати:', error);
              }
            }
            if (liqpayData?.status === 'failure') {
              alert('Оплата не пройшла');
            }
          })
          .on('liqpay.close', () => {
            console.log('LiqPay window closed');
          });

        alreadyInitiated.current = true;
      } catch (err) {
        console.error('LiqPay init error:', err);
      }
    };

    if (!alreadyInitiated.current) {
      initLiqPay();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, amount, orderId, name, phone]);

  const isConfirmationEnabled =
    paymentMethod === 'Готівка' || (paymentMethod === 'Картка' && isPaid);

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
            onChange={() => setPaymentMethod('Картка')}
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

      <div className="mt-5 flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={!isConfirmationEnabled || isConfirming}
          className="soft-primary-button flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          <Check size={18} />
          {isConfirming ? 'Підтвердження...' : 'Підтвердити оплату'}
        </button>

        <button
          onClick={onBack}
          className="soft-secondary-button flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium"
        >
          <ArrowLeft size={18} /> Назад
        </button>
      </div>

      <div
        id="liqpay_checkout"
        className="soft-surface-card mx-auto w-full max-w-[980px] overflow-hidden rounded-[16px] p-2"
      />
    </div>
  );
};

export default PaymentMethod;
