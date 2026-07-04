"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { pushEcommerceEvent } from "app/lib/gtm";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { ShoppingBag, X } from "lucide-react";

import CustomerDetails from "./CustomerDetails";
import DeliveryMethod from "./DeliveryMethod";
import PaymentMethod from "./PaymentMethod";
import OrderConfirmation from "./OrderConfirmation";
import { notifyTelegramAdmin } from "app/lib/telegram-notify-client";
import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { FIRST_ORDER_DISCOUNT_CODE } from "app/lib/first-order-discount";

type DeliveryMethodType = ComponentProps<typeof DeliveryMethod>["deliveryMethod"];
type PaymentMethodType = ComponentProps<typeof PaymentMethod>["paymentMethod"];

const deductOrderStock = async (
  items: { code: string; article: string; quantity: number }[]
) => {
  try {
    const secret = process.env.NEXT_PUBLIC_NOTIFY_SECRET || "";
    await fetch("/api/orders/deduct-stock", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-notify-secret": secret } : {}),
      },
      body: JSON.stringify({ items }),
      keepalive: true,
    });
  } catch {
    // fire-and-forget — don't interrupt order confirmation
  }
};
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
  payableAmount: number;
  discountAmount: number;
  discountRate: number;
  discountCode: string | null;
  isFirstOrderDiscountApplied: boolean;
  isPartnerDiscountApplied: boolean;
  onClearCart: () => void;
}

const Zamovl: React.FC<ZamovlProps> = ({
  onBack,
  onCloseAll,
  cartItems,
  totalAmount,
  payableAmount,
  discountAmount,
  discountRate,
  discountCode,
  isFirstOrderDiscountApplied,
  isPartnerDiscountApplied,
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
  const orderCreatedRef = useRef(false);
  const orderNotifiedRef = useRef(false);
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
            if (data.deliveryMethod) setDeliveryMethod(data.deliveryMethod);
            if (data.deliveryCity) setSelectedCity(data.deliveryCity);
            if (data.deliveryWarehouse) setSelectedWarehouse(data.deliveryWarehouse);
            if (data.deliveryLvivStreet) setSelectedLvivStreet(data.deliveryLvivStreet);
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

  const persistOrder = async (
    paymentData: PaymentConfirmationPayload | undefined,
    options: { completeCheckout: boolean }
  ) => {
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

    const orderRef = doc(db, "orders", orderId);
    const orderSnapshot = orderCreatedRef.current ? null : await getDoc(orderRef);
    const alreadyExists = orderCreatedRef.current || Boolean(orderSnapshot?.exists());

    await setDoc(
      orderRef,
      {
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
        subtotalAmount: totalAmount,
        discountAmount,
        discountRate,
        discountCode,
        discountLabel: isPartnerDiscountApplied
          ? "Партнерська знижка 8%"
          : isFirstOrderDiscountApplied
          ? "Знижка 5% на перше замовлення"
          : null,
        totalAmount: payableAmount,
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
        updatedAt: Timestamp.now(),
        ga4PurchaseTracked: false,
        ...(alreadyExists ? {} : { createdAt: Timestamp.now() }),
      },
      { merge: true }
    );
    orderCreatedRef.current = true;

    if (!orderNotifiedRef.current && options.completeCheckout) {
      void notifyTelegramAdmin({
        type: "order",
        firestoreId: orderId,
        orderId,
        name,
        phone,
        deliveryMethod,
        paymentMethod,
        paymentStatus: resolvedPaymentStatus,
        city: selectedCity?.Description || "",
        warehouse: selectedWarehouse?.Description || "",
        lvivStreet: selectedLvivStreet || "",
        subtotalAmount: totalAmount,
        discountAmount,
        discountCode,
        totalAmount: payableAmount,
        items: normalizedCartItems,
      });
      orderNotifiedRef.current = true;
    }

    if (!options.completeCheckout) {
      return { orderRef, resolvedPaymentStatus };
    }

      // sessionStorage prevents duplicate purchase events within the same browser
      // session (covers React Strict Mode double-invocations and accidental re-calls).
      // Limitation: cleared when the tab is closed; does not protect across devices.
      // GA4 also deduplicates by transaction_id, providing a second layer of protection.
      // Must fire before onClearCart() so cartItems prop is still populated.
      const purchaseKey = `partson:purchase:${orderId}`;
      const alreadyFired = (() => {
        try { return Boolean(sessionStorage.getItem(purchaseKey)); } catch { return false; }
      })();
      if (!alreadyFired) {
        try { sessionStorage.setItem(purchaseKey, "1"); } catch {}

        // Confirmation source by payment method:
        //   Cash (Готівка)  — order created; cash collected on delivery, not yet received.
        //   Card (Картка)   — LiqPay JS widget returned success; the server callback
        //                     also updates this same Firestore order by orderId.
        pushEcommerceEvent("purchase", {
          currency: "UAH",
          transaction_id: orderId,
          value: payableAmount,
          ...(isFirstOrderDiscountApplied
            ? {
                coupon: discountCode || FIRST_ORDER_DISCOUNT_CODE,
                discount: discountAmount,
              }
            : {}),
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
          await updateDoc(orderRef, {
            ga4PurchaseTracked: true,
            ga4PurchaseTrackedAt: Timestamp.now(),
          });
        } catch {
          // intentionally swallowed — order and GA4 event are already committed
        }
      }

      setConfirmedAmount(payableAmount);
      setConfirmedPaymentMethod(paymentMethod);
      setConfirmedPaymentStatus(resolvedPaymentStatus);
      onClearCart();
      setCurrentStep(3);

      invalidateCatalogClientCache();
      void deductOrderStock(normalizedCartItems);
    return { orderRef, resolvedPaymentStatus };
  };

  const handleCardPaymentStarted = async (paymentData?: PaymentConfirmationPayload) => {
    try {
      await persistOrder(paymentData, { completeCheckout: false });
    } catch (error) {
      console.error("Помилка при підготовці замовлення до оплати:", error);
      throw error;
    }
  };

  const handleSubmitOrder = async (paymentData?: PaymentConfirmationPayload) => {
    pushEcommerceEvent("add_payment_info", {
      currency: "UAH",
      value: payableAmount,
      payment_type: paymentMethod || undefined,
      ...(isFirstOrderDiscountApplied
        ? {
            coupon: discountCode || FIRST_ORDER_DISCOUNT_CODE,
            discount: discountAmount,
          }
        : {}),
      items: cartItems.map((item) => ({
        item_id: item.code,
        item_name: item.name,
        ...(item.category ? { item_category: item.category } : {}),
        price: item.price,
        quantity: item.quantity,
      })),
    });

    try {
      await persistOrder(paymentData, { completeCheckout: true });
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
            discountAmount={discountAmount}
            isFirstOrderDiscountApplied={isFirstOrderDiscountApplied}
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
                value: payableAmount,
                ...(isFirstOrderDiscountApplied
                  ? {
                      coupon: discountCode || FIRST_ORDER_DISCOUNT_CODE,
                      discount: discountAmount,
                    }
                  : {}),
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
            amount={payableAmount}
            subtotalAmount={totalAmount}
            discountAmount={discountAmount}
            isFirstOrderDiscountApplied={isFirstOrderDiscountApplied}
            orderId={orderId}
            name={name}
            phone={phone}
            deliveryMethod={deliveryMethod}
            onCardPaymentStarted={handleCardPaymentStarted}
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
            totalAmount={confirmedAmount ?? payableAmount}
            subtotalAmount={totalAmount}
            discountAmount={discountAmount}
            isFirstOrderDiscountApplied={isFirstOrderDiscountApplied}
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
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        <div className="soft-panel-accent mb-3.5 h-[3px] rounded-full" />
        <div className="soft-panel-header border-b border-slate-200/60 pb-3">
          <div className="min-w-0">
            <span className="soft-panel-eyebrow">
              <ShoppingBag size={14} />
              Замовлення
            </span>
            <h3 className="soft-panel-title">Оформлення замовлення</h3>
            <p className="soft-panel-subtitle">
              Дані покупця, доставка, оплата та підтвердження в кілька кроків.
            </p>
          </div>
          <button
            onClick={onCloseAll}
            className="soft-icon-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10"
            aria-label="Закрити форму замовлення"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
        {steps.map((step, index) => {
          const isActive = currentStep === index;
          const isDone = currentStep > index;

          return (
            <div
              key={step}
              className={`relative rounded-[14px] px-1.5 py-2 text-center text-xs font-semibold transition sm:rounded-[16px] sm:px-2.5 ${
                isActive
                  ? "soft-segment soft-segment--active"
                  : isDone
                  ? "soft-surface-card border-emerald-200/70 bg-gradient-to-b from-emerald-50 to-emerald-100/40 text-emerald-700 shadow-[0_12px_24px_rgba(16,185,129,0.12)]"
                  : "soft-segment opacity-70"
              }`}
            >
              <span className="block text-[9px] font-bold uppercase tracking-[0.12em] opacity-60">
                {isDone ? "✓" : index + 1}
              </span>
              <span className="mt-0.5 block text-[11px] font-bold sm:text-xs">{step}</span>
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
