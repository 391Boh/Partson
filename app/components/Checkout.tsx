'use client';

import React, { useState } from 'react';
import PaymentMethod from './PaymentMethod';
import OrderConfirmation from './OrderConfirmation';

type PaymentMethodValue = React.ComponentProps<typeof PaymentMethod>['paymentMethod'];

interface CheckoutOrderData {
  name: string;
  phone: string;
  amount: number;
  orderId: string;
  paymentMethod: PaymentMethodValue;
  deliveryMethod: string;
}

const Checkout: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<'payment' | 'confirmation'>('payment');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('');
  const [orderData, setOrderData] = useState<CheckoutOrderData>({
    name: 'User',
    phone: '0991234567',
    amount: 200,
    orderId: 'ORDER123',
    paymentMethod: '',
    deliveryMethod: 'delivery',
  });

  const handlePaymentConfirmed = () => {
    setOrderData((prev) => ({ ...prev, paymentMethod }));
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
          orderId={orderData.orderId}
          totalAmount={orderData.amount}
          onClose={handleBackToPayment}
        />
      )}
    </div>
  );
};

export default Checkout;
