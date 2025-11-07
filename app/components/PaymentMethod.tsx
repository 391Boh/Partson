'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  paymentMethod: 'Картка' | 'Готівка' | '';
  setPaymentMethod: (method: 'Картка' | 'Готівка' | '') => void;
  onBack: () => void;
  amount: number;
  orderId: string;
  name: string;
  phone: string;
  deliveryMethod: string;
  onPaymentConfirmed: (orderData: any) => Promise<void> | void;
  onConfirm: () => void;
}

declare global {
  interface Window {
    LiqPayCheckout?: {
      init: (params: any) => any;
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
  const router = useRouter();
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
        const res = await fetch('/api/liqpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: '3',
            public_key: 'sandbox_i70369644191',
            action: 'pay',
            amount,
            currency: 'UAH',
            description: `Оплата замовлення №${orderId}`,
            order_id: orderId,
            language: 'uk',
            result_url: 'https://19314d414d1a.ngrok-free.app/success',
            server_url: 'https://19314d414d1a.ngrok-free.app/api/liqpay/callback',
            info: JSON.stringify({ name, phone }),
          }),
        });

        const json = await res.json();

        if (!window.LiqPayCheckout) {
          console.error('LiqPayCheckout не завантажений');
          return;
        }

        window.LiqPayCheckout.init({
          data: json.data,
          signature: json.signature,
          embedTo: '#liqpay_checkout',
          mode: 'popup',
        })
          .on('liqpay.callback', async (liqpayData: any) => {
            if (liqpayData.status === 'success') {
              setIsPaid(true);
              // Автоматично підтверджуємо оплату після успіху
              try {
                await handleConfirm();
              } catch (error) {
                console.error('Помилка підтвердження після успішної оплати:', error);
              }
            }
            if (liqpayData.status === 'failure') {
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
  }, [paymentMethod, amount, orderId, name, phone]);

  const isConfirmationEnabled =
    paymentMethod === 'Готівка' || (paymentMethod === 'Картка' && isPaid);

  return (
    <div className="mt-6 text-slate-200 space-y-5">
      <p>Оберіть спосіб оплати:</p>

      <div className="flex flex-col gap-3">
        <label
          className={`cursor-pointer px-4 py-3 rounded-lg border ${
            paymentMethod === 'Картка'
              ? 'bg-emerald-700 border-emerald-500'
              : 'bg-slate-700 border-slate-600'
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
          className={`cursor-pointer px-4 py-3 rounded-lg border ${
            paymentMethod === 'Готівка'
              ? 'bg-emerald-700 border-emerald-500'
              : 'bg-slate-700 border-slate-600'
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

      <div className="flex gap-3 mt-6">
        <button
          onClick={handleConfirm}
          disabled={!isConfirmationEnabled || isConfirming}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition"
        >
          <Check size={18} />
          {isConfirming ? 'Підтвердження...' : 'Підтвердити оплату'}
        </button>

        <button
          onClick={onBack}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition"
        >
          <ArrowLeft size={18} /> Назад
        </button>
      </div>

      <div id="liqpay_checkout" className="max-w-sm md:max-w-[700px] mx-auto" />
    </div>
  );
};

export default PaymentMethod;
