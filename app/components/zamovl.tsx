"use client";

import { type ComponentProps, useEffect, useState } from "react";
import { pushEcommerceEvent } from "app/lib/gtm";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { X } from "lucide-react";

import CustomerDetails from "./CustomerDetails";
import DeliveryMethod from "./DeliveryMethod";
import PaymentMethod from "./PaymentMethod";
import OrderConfirmation from "./OrderConfirmation";

type DeliveryMethodType = ComponentProps<typeof DeliveryMethod>["deliveryMethod"];
type PaymentMethodType = ComponentProps<typeof PaymentMethod>["paymentMethod"];
type PaymentConfirmationPayload = Record<string, unknown>;

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
  category?: string;
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
  const [confirmedPaymentMethod, setConfirmedPaymentMethod] =
    useState<PaymentMethodType>("");
  const [confirmedPaymentStatus, setConfirmedPaymentStatus] = useState("");

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
          console.error("Помилка при отриманні даних профілю:", error);
        }
      } else {
        setName("");
        setPhone("+380");
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmitOrder = async (paymentData?: PaymentConfirmationPayload) => {
    pushEcommerceEvent("add_payment_info", {
      currency: "UAH",
      value: totalAmount,
      payment_type: paymentMethod || undefined,
      items: cartItems.map((item) => ({
        item_id: item.code,
        item_name: item.name,
        ...(item.category ? { item_category: item.category } : {}),
        price: item.price,
        quantity: item.quantity,
      })),
    });

    const db = getFirestore();
    const isCardPayment = paymentMethod === "Картка";
    const isCardPaid = isCardPayment && paymentData?.paymentStatus === "paid";
    const resolvedPaymentStatus =
      paymentMethod === "Готівка"
        ? "cash_on_delivery"
        : isCardPaid
          ? "paid"
          : "pending";
    const resolvedPaymentProvider = isCardPayment ? "liqpay" : "cash";

    const normalizedCartItems = cartItems.map((item) => ({
      name: item.name,
      article: item.article || "",
      price: item.price,
      quantity: item.quantity,
      code: item.code,
    }));

    try {
      // docRef.id is the canonical Firestore order identifier.
      // orderId (timestamp) is kept as-is — it was already submitted to LiqPay
      // at checkout step 2, before this function runs, so it cannot be changed here.
      const docRef = await addDoc(collection(db, "orders"), {
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
        paymentStatus: resolvedPaymentStatus,
        paymentProvider: resolvedPaymentProvider,
        liqpayStatus:
          typeof paymentData?.liqpayStatus === "string" ? paymentData.liqpayStatus : null,
        liqpayTransactionId:
          typeof paymentData?.liqpayTransactionId === "string"
            ? paymentData.liqpayTransactionId
            : null,
        liqpayPaymentId:
          typeof paymentData?.liqpayPaymentId === "string" ? paymentData.liqpayPaymentId : null,
        paidAt: isCardPaid ? Timestamp.now() : null,
        createdAt: Timestamp.now(),
        ga4PurchaseTracked: false,
      });

      // sessionStorage prevents duplicate purchase events within the same browser
      // session (covers React Strict Mode double-invocations and accidental re-calls).
      // Limitation: cleared when the tab is closed; does not protect across devices.
      // GA4 also deduplicates by transaction_id, providing a second layer of protection.
      // Must fire before onClearCart() so cartItems prop is still populated.
      const purchaseKey = `partson:purchase:${docRef.id}`;
      const alreadyFired = (() => {
        try { return Boolean(sessionStorage.getItem(purchaseKey)); } catch { return false; }
      })();
      if (!alreadyFired) {
        try { sessionStorage.setItem(purchaseKey, "1"); } catch {}

        // Confirmation source by payment method:
        //   Cash (Готівка)  — order created; cash collected on delivery, not yet received.
        //   Card (Картка)   — LiqPay JS widget returned paymentStatus: "paid" client-side.
        //                     This is a client-side signal, not a server-verified guarantee.
        // TODO: for server-confirmed card accuracy, /api/liqpay/callback should write
        // paymentStatus → "paid" to Firestore via firebase-admin, and this event should
        // fire only after an onSnapshot listener detects that status change. This also
        // requires creating the Firestore document before LiqPay checkout (not after),
        // so the callback can locate the document by its ID used as the LiqPay order_id.
        pushEcommerceEvent("purchase", {
          currency: "UAH",
          transaction_id: docRef.id,
          value: totalAmount,
          items: cartItems.map((item) => ({
            item_id: item.code,
            item_name: item.name,
            ...(item.category ? { item_category: item.category } : {}),
            price: Number(item.price),
            quantity: Number(item.quantity),
          })),
        });

        // Persist the tracking flag so the purchase cannot re-fire even if
        // sessionStorage is cleared (different session, storage reset).
        // Non-critical write: GA4 deduplication by transaction_id is the safety net
        // if this updateDoc fails.
        try {
          await updateDoc(docRef, {
            ga4PurchaseTracked: true,
            ga4PurchaseTrackedAt: Timestamp.now(),
          });
        } catch {
          // intentionally swallowed — order and GA4 event are already committed
        }
      }

      setConfirmedAmount(totalAmount);
      setConfirmedPaymentMethod(paymentMethod);
      setConfirmedPaymentStatus(resolvedPaymentStatus);
      onClearCart();
      setCurrentStep(3);
    } catch (error) {
      console.error("Помилка при оформленні замовлення:", error);
      alert("Не вдалося зберегти замовлення.");
    }
  };

  if (isLoading) return null;

  const steps = ["Дані", "Доставка", "Оплата", "Готово"];

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
            onSubmit={() => {
              pushEcommerceEvent("add_shipping_info", {
                currency: "UAH",
                value: totalAmount,
                shipping_tier: deliveryMethod || undefined,
                items: cartItems.map((item) => ({
                  item_id: item.code,
                  item_name: item.name,
                  ...(item.category ? { item_category: item.category } : {}),
                  price: item.price,
                  quantity: item.quantity,
                })),
              });
              setCurrentStep(2);
            }}
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
            paymentMethod={confirmedPaymentMethod || paymentMethod}
            paymentStatus={confirmedPaymentStatus}
            onClose={onCloseAll}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex min-h-0 flex-col overflow-y-auto overflow-x-hidden">
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col p-3 sm:p-5">
        <div className="mb-4 h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />
        <div className="flex flex-col gap-2.5 border-b border-slate-200/70 pb-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <h3 className="soft-panel-title">
            Оформлення замовлення
          </h3>
          <button
            onClick={onCloseAll}
            className="soft-icon-button h-10 w-10 shrink-0 p-1 text-slate-500"
            aria-label="Закрити форму замовлення"
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
                Крок {Math.min(index + 1, 4)}
              </span>
              <span className="mt-1 block text-sm">{step}</span>
            </div>
          );
        })}
        </div>

        <div className="app-panel-scroll mt-3 min-h-0 flex-1 overflow-y-auto sm:pr-1">
          {renderStep()}
        </div>
      </div>
    </div>
  );
};

export default Zamovl;
