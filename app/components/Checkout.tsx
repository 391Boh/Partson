'use client';

import React, { useState } from 'react';
import PaymentMethod from './PaymentMethod';
import OrderConfirmation from './OrderConfirmation';

type PaymentMethodValue = React.ComponentProps<typeof PaymentMethod>['paymentMethod'];

interface CheckoutOrderData {
  name: string;
  phone: string;
  email: string;
  amount: number;
  orderId: string;
  paymentMethod: PaymentMethodValue;
  deliveryMethod: string;
  paymentStatus: string;
}

const Checkout: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<'payment' | 'confirmation'>('payment');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('');
  const [orderData, setOrderData] = useState<CheckoutOrderData>({
    name: 'User',
    phone: '0991234567',
    email: 'customer@example.com',
    amount: 200,
    orderId: 'ORDER123',
    paymentMethod: '',
    deliveryMethod: 'delivery',
    paymentStatus: '',
  });

  const handlePaymentConfirmed = (paymentPayload: Record<string, unknown>) => {
    setOrderData((prev) => ({
      ...prev,
      paymentMethod,
      paymentStatus:
        typeof paymentPayload.paymentStatus === 'string'
          ? paymentPayload.paymentStatus
          : paymentMethod === 'Готівка'
            ? 'cash_on_delivery'
            : '',
    }));
    setCurrentStep('confirmation');
  };

  const handleBackToPayment = () => {
    setCurrentStep('payment');
  };

  return (
    <div>
      {currentStep === 'payment' && (
        <PaymentMethod
          name={orderData.name}
          phone={orderData.phone}
          amount={orderData.amount}
          orderId={orderData.orderId}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          deliveryMethod={orderData.deliveryMethod}
          onPaymentConfirmed={handlePaymentConfirmed}
          onConfirm={() => {}}
          onBack={() => {}}
        />
      )}

      {currentStep === 'confirmation' && (
        <OrderConfirmation
          name={orderData.name}
          phone={orderData.phone}
          email={orderData.email}
          orderId={orderData.orderId}
          deliveryCountry="UA"
          estimatedDeliveryDate="2026-07-20"
          totalAmount={orderData.amount}
          paymentMethod={orderData.paymentMethod}
          paymentStatus={orderData.paymentStatus}
          onClose={handleBackToPayment}
        />
      )}
    </div>
  );
};

export default Checkout;
