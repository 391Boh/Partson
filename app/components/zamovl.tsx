"use client";

import { type ComponentProps, useEffect, useState } from "react";
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

type DeliveryMethodType = ComponentProps<typeof DeliveryMethod>["deliveryMethod"];
type PaymentMethodType = ComponentProps<typeof PaymentMethod>["paymentMethod"];

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

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+380");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethodType>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("");
  const [selectedCity, setSelectedCity] = useState<CityOrWarehouse | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<CityOrWarehouse | null>(
    null
  );
  const [selectedLvivStreet, setSelectedLvivStreet] = useState<string | null>(null);

  const [orderId] = useState(() => `${Date.now()}`);
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
            setName(data.name || "");
            setPhone(data.phone || "+380");
          }
        } catch (error) {
          console.error("РџРѕРјРёР»РєР° РїСЂРё РѕС‚СЂРёРјР°РЅРЅС– РґР°РЅРёС… РїСЂРѕС„С–Р»СЋ:", error);
        }
      } else {
        setName("");
        setPhone("+380");
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmitOrder = async () => {
    const db = getFirestore();

    const normalizedCartItems = cartItems.map((item) => ({
      name: item.name,
      article: item.article || "",
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
      console.error("РџРѕРјРёР»РєР° РїСЂРё РѕС„РѕСЂРјР»РµРЅРЅС– Р·Р°РјРѕРІР»РµРЅРЅСЏ:", error);
      alert("РќРµ РІРґР°Р»РѕСЃСЏ Р·Р±РµСЂРµРіС‚Рё Р·Р°РјРѕРІР»РµРЅРЅСЏ.");
    }
  };

  if (isLoading) return null;

  const steps = ["Р”Р°РЅС–", "Р”РѕСЃС‚Р°РІРєР°", "РћРїР»Р°С‚Р°", "Р“РѕС‚РѕРІРѕ"];

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
    <div className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter overflow-auto p-3 sm:p-5">
      <div className="mb-4 h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />
      <div className="soft-panel-content flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3.5">
        <h3 className="soft-panel-title">
          РћС„РѕСЂРјР»РµРЅРЅСЏ Р·Р°РјРѕРІР»РµРЅРЅСЏ
        </h3>
        <button
          onClick={onCloseAll}
          className="soft-icon-button h-10 w-10 shrink-0 p-1 text-slate-500"
          aria-label="Р—Р°РєСЂРёС‚Рё С„РѕСЂРјСѓ Р·Р°РјРѕРІР»РµРЅРЅСЏ"
        >
          <X size={20} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:mt-3.5 sm:gap-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const isActive = currentStep === index;
          const isDone = currentStep > index;

          return (
            <div
              key={step}
              className={`rounded-[16px] px-2.5 py-2 text-center text-xs font-semibold transition ${
                isActive
                  ? "soft-segment soft-segment--active"
                  : isDone
                  ? "soft-surface-card text-emerald-700"
                  : "soft-segment"
              }`}
            >
              <span className="block text-[10px] uppercase tracking-[0.14em] opacity-70">
                РљСЂРѕРє {Math.min(index + 1, 4)}
              </span>
              <span className="mt-1 block text-sm">{step}</span>
            </div>
          );
        })}
      </div>

      {renderStep()}
    </div>
  );
};

export default Zamovl;
