'use client';

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { X } from "lucide-react";

import CustomerDetails from "./CustomerDetails";
import DeliveryMethod from "./DeliveryMethod";
import PaymentMethod from "./PaymentMethod";
import OrderConfirmation from "./OrderConfirmation";

type DeliveryMethodType = 'Нова Пошта' | 'Самовивіз' | 'Доставка у Львові' | '';
type PaymentMethodType = 'Картка' | 'Готівка' | '';

interface CityOrWarehouse {
  Description: string;
  Ref: string;
}

interface CartItem {
  name: string;
  article: string;
  price: number;
  quantity: number;
  code: string;
}

interface ZamovlProps {
  onBack: () => void;
  onCloseAll: () => void;
  cartItems: CartItem[];
  totalAmount: number;
  onClearCart: () => void;
}

const Zamovl: React.FC<ZamovlProps> = ({
  onBack,
  onCloseAll,
  cartItems,
  totalAmount,
  onClearCart,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+380');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethodType>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('');
  const [selectedCity, setSelectedCity] = useState<CityOrWarehouse | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<CityOrWarehouse | null>(null);
  const [selectedLvivStreet, setSelectedLvivStreet] = useState<string | null>(null);

  const [orderId] = useState(() => '' + Date.now());
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            setName(data.name || '');
            setPhone(data.phone || '+380');
          }
        } catch (error) {
          console.error("Помилка при завантаженні даних користувача:", error);
        }
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmitOrder = async () => {
    const db = getFirestore();

    const normalizedCartItems = cartItems.map((item) => ({
      name: item.name,
      article: item.article || '',
      price: item.price,
      quantity: item.quantity,
      code: item.code,
    }));

    try {
      await addDoc(collection(db, "orders"), {
        uid: firebaseUser?.uid || null,
        name,
        phone,
        deliveryMethod,
        paymentMethod,
        city: selectedCity?.Description || null,
        cityRef: selectedCity?.Ref || null,
        warehouse: selectedWarehouse?.Description || null,
        warehouseRef: selectedWarehouse?.Ref || null,
        lvivStreet: selectedLvivStreet || null,
        cartItems: normalizedCartItems,
        totalAmount,
        orderId,
        createdAt: Timestamp.now(),
      });

      setConfirmedAmount(totalAmount);
      onClearCart();
      setCurrentStep(3);
    } catch (error) {
      console.error("Помилка при створенні замовлення:", error);
      alert("Сталася помилка при створенні замовлення.");
    }
  };

  if (isLoading) return null;

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <CustomerDetails
            name={name}
            phone={phone}
            setName={setName}
            setPhone={setPhone}
            user={firebaseUser}
            onNext={() => setCurrentStep(1)}
            onBack={onBack}
          />
        );
      case 1:
        return (
          <DeliveryMethod
            deliveryMethod={deliveryMethod}
            setDeliveryMethod={setDeliveryMethod}
            selectedCity={selectedCity}
            setSelectedCity={setSelectedCity}
            selectedWarehouse={selectedWarehouse}
            setSelectedWarehouse={setSelectedWarehouse}
            selectedLvivStreet={selectedLvivStreet}
            setSelectedLvivStreet={setSelectedLvivStreet}
            onBack={() => setCurrentStep(0)}
            onSubmit={() => setCurrentStep(2)}
          />
        );
      case 2:
        return (
          <PaymentMethod
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            onBack={() => setCurrentStep(1)}
            amount={totalAmount}
            orderId={orderId}
            name={name}
            phone={phone}
            deliveryMethod={deliveryMethod}
            onPaymentConfirmed={handleSubmitOrder}
            onConfirm={() => {}}
          />
        );
      case 3:
        return (
          <OrderConfirmation
            name={name}
            phone={phone}
            orderId={orderId}
            totalAmount={confirmedAmount ?? totalAmount}
            onClose={onCloseAll}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed top-28 right-5 w-[90%] max-w-[520px] max-h-[75vh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 border-8 border-slate-700 rounded-2xl shadow-2xl p-6 z-[9999] overflow-auto animate-fadeIn">
      <div className="flex justify-between items-center pb-4 border-b border-slate-700">
        <h3 className="text-slate-100 text-2xl font-bold tracking-wide">
          Оформлення замовлення
        </h3>
        <button
          onClick={onCloseAll}
          className="text-slate-400 hover:text-white transition"
          aria-label="Закрити оформлення"
        >
          <X size={24} />
        </button>
      </div>

      {renderStep()}
    </div>
  );
};

export default Zamovl;
