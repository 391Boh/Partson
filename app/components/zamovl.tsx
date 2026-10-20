"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { useCustomerDialog } from "app/lib/use-customer-dialog";
import { invalidatePartnerStatusClient } from "app/lib/partner-status-client";
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
import { Check, ClipboardCheck, X } from "lucide-react";
import WindowHubCover from "app/components/WindowHubCover";
import { pluralizePositions } from "app/lib/pluralize-uk";

import CustomerDetails from "./CustomerDetails";
import DeliveryMethod from "./DeliveryMethod";
import PaymentMethod from "./PaymentMethod";
import OrderConfirmation from "./OrderConfirmation";
import { notifyTelegramAdmin } from "app/lib/telegram-notify-client";
import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { getMarketingAttribution } from "app/lib/marketing-attribution";

type DeliveryMethodType = ComponentProps<typeof DeliveryMethod>["deliveryMethod"];
type PaymentMethodType = ComponentProps<typeof PaymentMethod>["paymentMethod"];

const addBusinessDays = (start: Date, businessDays: number) => {
  const result = new Date(start);
  let remaining = businessDays;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
};

const formatDateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const estimateDeliveryDate = (deliveryMethod: DeliveryMethodType) => {
  const businessDays =
    deliveryMethod === "Нова Пошта"
      ? 4
      : deliveryMethod === "Доставка у Львові"
        ? 2
        : 1;
  return formatDateOnly(addBusinessDays(new Date(), businessDays));
};

// The server reads the items from the stored order and deducts it once; the
// confirmed balances it returns update any product page already open.
const deductOrderStock = async (orderId: string) => {
  try {
    const response = await fetch("/api/orders/deduct-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId }),
      keepalive: true,
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      items?: { code?: string; stockAfter?: number | null }[];
    };
    for (const item of payload.items || []) {
      if (item.code && typeof item.stockAfter === "number") {
        invalidateCatalogClientCache({ code: item.code, quantity: item.stockAfter });
      }
    }
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
  producer?: string;
  price: number;
  originalPrice?: number;
  isPromoPrice?: boolean;
  quantity: number;
  code: string;
  category?: string;
  group?: string;
  subGroup?: string;
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useCustomerDialog(dialogRef, onCloseAll);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+380");
  const [email, setEmail] = useState("");
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
  const [confirmedEstimatedDeliveryDate, setConfirmedEstimatedDeliveryDate] =
    useState("");
  const discountableAmount = cartItems.reduce(
    (sum, item) =>
      item.isPromoPrice ? sum : sum + Number(item.price) * Number(item.quantity),
    0
  );
  const itemDiscountRate =
    discountableAmount > 0 && discountAmount > 0
      ? Math.min(1, discountAmount / discountableAmount)
      : 0;
  const ecommerceItems = cartItems.map((item) => ({
    item_id: item.code,
    item_name: item.name,
    ...(item.producer ? { item_brand: item.producer } : {}),
    ...(item.category ? { item_category: item.category } : {}),
    ...(item.group ? { item_category2: item.group } : {}),
    ...(item.subGroup ? { item_category3: item.subGroup } : {}),
    ...(item.article ? { item_variant: item.article } : {}),
    price: Number(item.price),
    quantity: Number(item.quantity),
    ...(itemDiscountRate > 0 && !item.isPromoPrice
      ? {
          discount:
            Math.round(Number(item.price) * itemDiscountRate * 100) / 100,
        }
      : {}),
    ...(discountCode ? { coupon: discountCode } : {}),
  }));
  const ecommerceCoupon =
    discountAmount > 0 && discountCode ? { coupon: discountCode } : {};

  useEffect(() => {
    const auth = getAuth();
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        setEmail(user.email || "");
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            setName(data.name || "");
            setPhone(data.phone || "+380");
            setEmail(data.email || user.email || "");
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
        setEmail("");
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
    const estimatedDeliveryDate = estimateDeliveryDate(deliveryMethod);

    const normalizedCartItems = cartItems.map((item) => ({
      name: item.name,
      article: item.article || "",
      producer: item.producer || "",
      price: item.price,
      originalPrice: item.originalPrice ?? null,
      isPromoPrice: item.isPromoPrice === true,
      quantity: item.quantity,
      code: item.code,
      category: item.category || "",
      group: item.group || "",
      subGroup: item.subGroup || "",
    }));

    const orderRef = doc(db, "orders", orderId);
    const orderSnapshot =
      options.completeCheckout || !orderCreatedRef.current
        ? await getDoc(orderRef)
        : null;
    const alreadyExists = orderCreatedRef.current || Boolean(orderSnapshot?.exists());
    const purchaseAlreadyTracked =
      orderSnapshot?.exists() && orderSnapshot.data().ga4PurchaseTracked === true;

    await setDoc(
      orderRef,
      {
        uid: firebaseUser?.uid || null,
        name,
        phone,
        email: email.trim().toLowerCase(),
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
        deliveryCountry: "UA",
        estimatedDeliveryDate,
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
        // Campaign that brought the visitor (utm_*, gclid/gbraid/wbraid, fbclid),
        // written once on create: lets cash-on-delivery and phone-confirmed
        // orders be imported into Google Ads as offline conversions.
        ...(alreadyExists
          ? {}
          : {
              createdAt: Timestamp.now(),
              ga4PurchaseTracked: false,
              marketingAttribution: getMarketingAttribution(),
            }),
      },
      { merge: true }
    );
    orderCreatedRef.current = true;
    if (firebaseUser?.uid) invalidatePartnerStatusClient(firebaseUser.uid);

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
      if (!alreadyFired && !purchaseAlreadyTracked) {
        try { sessionStorage.setItem(purchaseKey, "1"); } catch {}

        // Confirmation source by payment method:
        //   Cash (Готівка)  — order created; cash collected on delivery, not yet received.
        //   Card (Картка)   — LiqPay JS widget returned success; the server callback
        //                     also updates this same Firestore order by orderId.
        pushEcommerceEvent("purchase", {
          currency: "UAH",
          transaction_id: orderId,
          value: payableAmount,
          affiliation: "PartsON",
          ...ecommerceCoupon,
          items: ecommerceItems,
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
      setConfirmedEstimatedDeliveryDate(estimatedDeliveryDate);
      onClearCart();
      setCurrentStep(3);

      invalidateCatalogClientCache();
      void deductOrderStock(orderId);
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
      ...ecommerceCoupon,
      items: ecommerceItems,
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
            email={email}
            setName={setName}
            setPhone={setPhone}
            setEmail={setEmail}
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
                ...ecommerceCoupon,
                shipping_tier: deliveryMethod || undefined,
                items: ecommerceItems,
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
            email={email}
            orderId={orderId}
            deliveryCountry="UA"
            estimatedDeliveryDate={
              confirmedEstimatedDeliveryDate || estimateDeliveryDate(deliveryMethod)
            }
            totalAmount={confirmedAmount ?? payableAmount}
            subtotalAmount={totalAmount}
            discountAmount={discountAmount}
            isFirstOrderDiscountApplied={isFirstOrderDiscountApplied}
            paymentMethod={confirmedPaymentMethod || paymentMethod}
            paymentStatus={confirmedPaymentStatus}
            items={cartItems}
            onClose={onCloseAll}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="customer-window customer-overlay-panel customer-overlay-panel--order soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex min-h-0 flex-col overflow-y-auto overflow-x-hidden">
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        <div className="soft-panel-accent mb-3.5 h-[3px] rounded-full" />
        <div className="cw-hub">
            <WindowHubCover />
          <div className="cw-hub-top">
            <span className="cw-hub-icon" aria-hidden="true"><ClipboardCheck size={20} /></span>
            <div className="cw-hub-text">
              <h3 id="checkout-title" className="cw-hub-title">Оформлення замовлення</h3>
              <p className="cw-hub-sub">
                {currentStep === 3 ? (
                  "Замовлення прийнято — деталі нижче."
                ) : (
                  <>
                    {cartItems.length} {pluralizePositions(cartItems.length)} · до оплати{" "}
                    <strong className="cw-subtitle-amount">
                      {new Intl.NumberFormat("uk-UA").format(payableAmount)} грн
                    </strong>
                  </>
                )}
              </p>
            </div>
            <button
              onClick={onCloseAll}
              className="app-panel-close-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10"
              aria-label="Закрити форму замовлення"
            >
              <X size={20} strokeWidth={2.3} />
            </button>
          </div>
          <ol className="cw-stepper" aria-label="Кроки оформлення">
            {steps.map((step, index) => {
              const state = currentStep === index ? "active" : currentStep > index ? "done" : "todo";
              return (
                <li
                  key={step}
                  className={`cw-step cw-step--${state}`}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  <span className="cw-step-dot" aria-hidden="true">
                    {state === "done" ? <Check size={14} strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="cw-step-label">{step}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="app-panel-scroll mt-3 min-h-0 flex-1 overflow-y-auto sm:pr-1">
          {renderStep()}
        </div>
      </div>
    </div>
  );
};

export default Zamovl;
