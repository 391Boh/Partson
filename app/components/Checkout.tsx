'use client';

import React, { useState } from 'react';
import PaymentMethod from './PaymentMethod';
import OrderConfirmation from './OrderConfirmation';

const Checkout: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<'payment' | 'confirmation'>('payment');

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | ''>('');
  const [orderData, setOrderData] = useState<{
    name: string;
    phone: string;
    amount: number;
    orderId: string;
    paymentMethod: 'card' | 'cash' | '';
    deliveryMethod: string;
  }>({
    name: 'Ім\'я Користувача',
    phone: '0991234567',
    amount: 200,
    orderId: 'ORDER123',
    paymentMethod: '',
    deliveryMethod: 'доставка',
  });

  const handlePaymentConfirmed = (data: typeof orderData) => {
    setOrderData(data);
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
          onBack={() => {}}
        />
      )}

      {currentStep === 'confirmation' && (
        <OrderConfirmation
          orderData={orderData}
          onBack={handleBackToPayment}
        />
      )}
    </div>
  );
};

export default Checkout;
