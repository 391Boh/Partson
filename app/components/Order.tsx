'use client';

import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CalendarClock,
  ShoppingCart,
  X,
  ClipboardList,
  Truck,
  CreditCard,
  PackageCheck,
  Gift,
  Percent,
  Handshake,
} from 'lucide-react';
import Link from 'next/link';
import { useCart } from 'app/context/CartContext';
import { pushEcommerceEvent } from 'app/lib/gtm';
import {
  calculateFirstOrderDiscount,
  FIRST_ORDER_DISCOUNT_CODE,
  FIRST_ORDER_DISCOUNT_PERCENT,
} from 'app/lib/first-order-discount';
import {
  calculatePartnerDiscount,
  PARTNER_DISCOUNT_PERCENT,
  PARTNER_THRESHOLD_UAH,
  type PartnerDiscountStatus,
} from 'app/lib/partnership-discount';
import { useEffect, useMemo, useState, useRef } from 'react';
import Zamovl from './zamovl';
import ProductCardImage from './ProductCardImage';
import { db, auth } from '../../firebase';
import {
  collection,
  getDocs,
  limit,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

interface OrderProps {
  onClose: () => void;
}

interface PastOrderItem {
  name?: string;
  article?: string;
  price?: number;
  quantity?: number;
  code?: string;
}

interface PastOrder {
  id: string;
  orderId?: string;
  createdAt?: {
    seconds?: number;
  };
  cartItems?: PastOrderItem[];
  totalAmount?: number;
  total?: number;
  deliveryMethod?: string;
  warehouse?: string;
  paymentMethod?: string;
  discountAmount?: number;
  subtotalAmount?: number;
  read?: boolean;
  shipped?: boolean;
  completed?: boolean;
}

type FirstOrderDiscountStatus = 'loading' | 'guest' | 'eligible' | 'used' | 'error';

const Order: React.FC<OrderProps> = ({ onClose }) => {
  const { cartItems, removeFromCart, clearCart } = useCart();
  const hasItems = cartItems.length > 0;
  const [isOrdering, setIsOrdering] = useState(false);
  const [showPastOrders, setShowPastOrders] = useState(false);
  const [pastOrders, setPastOrders] = useState<PastOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [firstOrderDiscountStatus, setFirstOrderDiscountStatus] =
    useState<FirstOrderDiscountStatus>('loading');
  const [partnerDiscountStatus, setPartnerDiscountStatus] =
    useState<PartnerDiscountStatus>('loading');
  const [totalSpentOnOrders, setTotalSpentOnOrders] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const orderRef = useRef<HTMLDivElement>(null);
  const openAuthModal = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('openAuthModal', {
        detail: { mode: 'login' },
      })
    );
  };
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('uk-UA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Kyiv',
      }),
    []
  );
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('uk-UA'),
    []
  );

  const totalAmount = cartItems.reduce(
    (total, item) => total + (item.price || 0) * (item.quantity || 1),
    0
  );
  const isFirstOrderDiscountEligible =
    Boolean(user) && firstOrderDiscountStatus === 'eligible';
  const isPartnerEligible =
    Boolean(user) && partnerDiscountStatus === 'active';
  const isDiscountCheckPending =
    !isAuthReady ||
    (Boolean(user) &&
      (firstOrderDiscountStatus === 'loading' || partnerDiscountStatus === 'loading'));
  const discountTotals = useMemo(
    () => calculateFirstOrderDiscount(totalAmount, isFirstOrderDiscountEligible),
    [isFirstOrderDiscountEligible, totalAmount]
  );
  const partnerDiscountTotals = useMemo(
    () => calculatePartnerDiscount(totalAmount, isPartnerEligible),
    [isPartnerEligible, totalAmount]
  );
  // Partner discount takes priority; first-order applies only when not yet a partner
  const effectiveDiscountTotals = isPartnerEligible ? partnerDiscountTotals : discountTotals;
  const payableAmount = effectiveDiscountTotals.totalAmount;
  const totalUnits = cartItems.reduce(
    (total, item) => total + (item.quantity || 0),
    0
  );

  const cartEcommerceItems = cartItems.map((item) => ({
    item_id: item.code,
    item_name: item.name,
    ...(item.producer ? { item_brand: item.producer } : {}),
    ...(item.category ? { item_category: item.category } : {}),
    ...(item.group ? { item_category2: item.group } : {}),
    ...(item.subGroup ? { item_category3: item.subGroup } : {}),
    ...(item.article ? { item_variant: item.article } : {}),
    price: item.price,
    quantity: item.quantity,
  }));
  const checkoutEcommerceItems = cartEcommerceItems.map((item) => ({
    ...item,
    ...(effectiveDiscountTotals.isApplied
      ? {
          coupon:
            effectiveDiscountTotals.discountCode ?? FIRST_ORDER_DISCOUNT_CODE,
          discount:
            Math.round(
              item.price * effectiveDiscountTotals.discountRate * 100
            ) / 100,
        }
      : {}),
  }));

  useEffect(() => {
    if (cartItems.length === 0) return;
    pushEcommerceEvent("view_cart", {
      currency: "UAH",
      value: totalAmount,
      items: cartEcommerceItems,
    });
    // Fires once when cart panel mounts with items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBeginCheckout = () => {
    if (!hasItems || isDiscountCheckPending) return;

    pushEcommerceEvent("begin_checkout", {
      currency: "UAH",
      value: payableAmount,
      ...(effectiveDiscountTotals.isApplied
        ? {
            coupon: effectiveDiscountTotals.discountCode ?? FIRST_ORDER_DISCOUNT_CODE,
          }
        : {}),
      items: checkoutEcommerceItems,
    });
    setIsOrdering(true);
  };
  const totalPastOrdersAmount = useMemo(
    () =>
      pastOrders.reduce((total, order) => {
        const amount = Number(order.totalAmount || order.total || 0);
        return Number.isFinite(amount) ? total + amount : total;
      }, 0),
    [pastOrders]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkFirstOrderDiscount = async () => {
      if (!isAuthReady) {
        setFirstOrderDiscountStatus('loading');
        return;
      }

      if (!user) {
        setFirstOrderDiscountStatus('guest');
        return;
      }

      setFirstOrderDiscountStatus('loading');

      try {
        const existingOrdersQuery = query(
          collection(db, 'orders'),
          where('uid', '==', user.uid),
          limit(1)
        );
        const snapshot = await getDocs(existingOrdersQuery);
        if (cancelled) return;

        setFirstOrderDiscountStatus(snapshot.empty ? 'eligible' : 'used');
      } catch (error) {
        console.error('Помилка перевірки знижки першого замовлення:', error);
        if (!cancelled) setFirstOrderDiscountStatus('error');
      }
    };

    void checkFirstOrderDiscount();

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, user]);

  useEffect(() => {
    let cancelled = false;

    const checkPartnership = async () => {
      if (!isAuthReady) {
        setPartnerDiscountStatus('loading');
        return;
      }
      if (!user) {
        setPartnerDiscountStatus('guest');
        return;
      }
      setPartnerDiscountStatus('loading');
      try {
        const q = query(
          collection(db, 'orders'),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const total = snap.docs.reduce((sum, doc) => {
          const data = doc.data() as { totalAmount?: number; total?: number };
          const amount = Number(data.totalAmount || data.total || 0);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
        setTotalSpentOnOrders(total);
        setPartnerDiscountStatus(total >= PARTNER_THRESHOLD_UAH ? 'active' : 'pending');
      } catch {
        if (!cancelled) setPartnerDiscountStatus('error');
      }
    };

    void checkPartnership();
    return () => { cancelled = true; };
  }, [isAuthReady, user]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-overlay-toggle]')) return;
      if (orderRef.current && !orderRef.current.contains(target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const fetchPastOrders = async () => {
      if (!user) return;
      setLoadingOrders(true);
      try {
        const q = query(
          collection(db, 'orders'),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const orders: PastOrder[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<PastOrder, 'id'>),
        }));
        setPastOrders(orders);
      } catch (error) {
        console.error('Помилка при отриманні даних замовлення:', error);
      } finally {
        setLoadingOrders(false);
      }
    };

    if (showPastOrders) {
      fetchPastOrders();
      setExpandedOrderId(null);
    }
  }, [showPastOrders, user]);

  const toggleExpandOrder = (orderId: string) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
  };

  const firstOrderDiscountCopy =
    firstOrderDiscountStatus === 'eligible'
      ? {
          title: `Знижка ${FIRST_ORDER_DISCOUNT_PERCENT}% на перше замовлення`,
          text: 'Враховано автоматично для вашого профілю.',
          tone: 'active',
        }
      : firstOrderDiscountStatus === 'loading'
        ? {
            title: 'Перевіряємо промо',
            text: 'Оновлюємо статус знижки.',
            tone: 'muted',
          }
        : firstOrderDiscountStatus === 'error'
          ? {
              title: 'Знижку не перевірено',
              text: 'Оновіть кошик або увійдіть ще раз.',
              tone: 'warning',
            }
          : {
              title: `Увійдіть і отримайте -${FIRST_ORDER_DISCOUNT_PERCENT}%`,
              text: 'Знижка на перше замовлення застосовується автоматично.',
              tone: 'guest',
            };
  const shouldShowFirstOrderDiscountPanel =
    !isPartnerEligible &&
    (firstOrderDiscountStatus === 'eligible' ||
      firstOrderDiscountStatus === 'guest' ||
      firstOrderDiscountStatus === 'error');

  const partnerProgressPercent = Math.min(
    100,
    Math.round((totalSpentOnOrders / PARTNER_THRESHOLD_UAH) * 100)
  );
  const partnerAmountLeft = Math.max(0, PARTNER_THRESHOLD_UAH - totalSpentOnOrders);
  const shouldShowPartnerPanel =
    Boolean(user) &&
    (partnerDiscountStatus === 'active' ||
      partnerDiscountStatus === 'pending');
  const firstOrderDiscountPanelClass =
    firstOrderDiscountCopy.tone === 'active'
      ? 'border-emerald-200/80 bg-gradient-to-r from-white via-emerald-50/80 to-white text-slate-800 shadow-[0_10px_22px_rgba(16,185,129,0.08)]'
      : firstOrderDiscountCopy.tone === 'warning'
        ? 'border-amber-200/80 bg-gradient-to-r from-white via-amber-50/80 to-white text-slate-800 shadow-[0_10px_22px_rgba(245,158,11,0.07)]'
        : 'border-sky-200/80 bg-gradient-to-r from-white via-sky-50/85 to-white text-slate-800 shadow-[0_10px_22px_rgba(14,165,233,0.08)]';

  if (isOrdering) {
    return (
      <Zamovl
        cartItems={cartItems}
        totalAmount={totalAmount}
        payableAmount={payableAmount}
        discountAmount={effectiveDiscountTotals.discountAmount}
        discountRate={effectiveDiscountTotals.discountRate}
        discountCode={effectiveDiscountTotals.discountCode}
        isFirstOrderDiscountApplied={discountTotals.isApplied && !isPartnerEligible}
        isPartnerDiscountApplied={partnerDiscountTotals.isApplied}
        onBack={() => setIsOrdering(false)}
        onCloseAll={() => {
          setIsOrdering(false);
          onClose();
        }}
        onClearCart={clearCart}
      />
    );
  }

  if (showPastOrders) {
    return (
      <div
        ref={orderRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-orders-modal-title"
        className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex flex-col overflow-y-auto overflow-x-hidden"
      >
        <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
          <div className="soft-panel-accent h-1 rounded-full" />

          <div className="soft-panel-header">
            <div className="min-w-0">
              <span className="soft-panel-eyebrow">
                <ClipboardList size={14} />
                Замовлення
              </span>
              <h3 id="past-orders-modal-title" className="soft-panel-title">Історія замовлень</h3>
              <p className="soft-panel-subtitle">
                Перегляд попередніх оформлень, сум, способу доставки та оплати.
              </p>
            </div>
            <button onClick={onClose} className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10">
              <X size={22} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <button
              onClick={() => setShowPastOrders(false)}
              className="soft-secondary-button w-full px-3 py-2 text-sm font-semibold sm:w-auto sm:px-4 sm:py-2.5"
            >
              Назад
            </button>
            {user && (
              <span className="soft-chip self-start px-2.5 py-0.75 text-[11px] font-medium text-slate-600 sm:self-auto sm:px-3 sm:py-1 sm:text-xs">
                {pastOrders.length} замовл.
              </span>
            )}
          </div>

          <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
            <section className="soft-panel-hero px-3 py-3 sm:px-4 sm:py-3.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <h4 className="soft-panel-section-heading">Ваші попередні оформлення</h4>
                  <p className="soft-panel-section-text">
                    Усі завершені й актуальні замовлення в одному місці: дата, сума, доставка та склад.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:px-3 sm:py-1.5 sm:text-xs">
                  <BadgeCheck size={14} />
                  {user ? "Історія синхронізована" : "Потрібен вхід"}
                </div>
              </div>

              <div className="soft-panel-stat-grid mt-2.5">
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">Замовлень</span>
                  <span className="soft-panel-stat-value">{pastOrders.length}</span>
                </div>
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">На суму</span>
                  <span className="soft-panel-stat-value">
                    {currencyFormatter.format(totalPastOrdersAmount)}
                  </span>
                </div>
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">Статус</span>
                  <span className="soft-panel-stat-value">{loadingOrders ? 'Оновлення' : 'Готово'}</span>
                </div>
                <div className="soft-panel-stat-card">
                  <span className="soft-panel-stat-label">Поточний режим</span>
                  <span className="soft-panel-stat-value">Історія</span>
                </div>
              </div>
            </section>

            <div className="mt-2 space-y-2 pb-1">
          {!user ? (
            <div className="soft-note rounded-[16px] px-3.5 py-3.5 text-center text-slate-700">
              <p>
                Щоб переглянути свої замовлення, будь ласка, увійдіть у свій обліковий запис.
              </p>
              <button
                type="button"
                onClick={openAuthModal}
                className="soft-primary-button mt-3 inline-flex px-3.5 py-2 text-sm font-semibold sm:mt-4 sm:px-4 sm:py-2.5"
              >
                Увійти
              </button>
            </div>
          ) : loadingOrders ? (
            <div className="py-6">
              <div className="loader" />
            </div>
          ) : pastOrders.length > 0 ? (
            <div className="space-y-2 sm:app-panel-scroll sm:max-h-[52vh] sm:space-y-2.5">
              {pastOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const orderTotalAmount = Number(order.totalAmount || order.total || 0);
                const orderDiscountAmount = Number(order.discountAmount || 0);
                const orderItems = order.cartItems ?? [];
                const orderNumber = order.orderId || order.id;
                const orderDateLabel = order.createdAt?.seconds
                  ? dateFormatter.format(new Date(order.createdAt.seconds * 1000))
                  : 'Дата уточнюється';
                const hasOrderDiscount =
                  Number.isFinite(orderDiscountAmount) && orderDiscountAmount > 0;

                return (
                  <div
                    key={order.id}
                    className={`soft-surface-card app-panel-card-hover w-full rounded-[18px] border p-3 text-slate-700 transition-[box-shadow,border-color,background-color] duration-200 sm:rounded-[20px] sm:p-3.5 ${
                      isExpanded
                        ? 'border-sky-200 bg-white/95 shadow-[0_18px_36px_rgba(14,165,233,0.1)]'
                        : 'border-sky-100/70 hover:border-sky-200/90 hover:bg-white/95'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => toggleExpandOrder(order.id)}
                    >
                      <div className="grid w-full gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                              <CalendarClock size={13} />
                              {orderDateLabel}
                            </span>
                            {order.completed ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                Виконано
                              </span>
                            ) : order.shipped ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/70 bg-blue-50/80 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                                <Truck size={11} />
                                Відправлено
                              </span>
                            ) : order.read ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50/80 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                Опрацьовується
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/85 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                Нове замовлення
                              </span>
                            )}
                            {hasOrderDiscount && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                <Percent size={13} />
                                -{currencyFormatter.format(orderDiscountAmount)} грн
                              </span>
                            )}
                          </div>

                          <h4 className="mt-2 break-words text-[15px] font-bold leading-5 text-slate-900 sm:text-base">
                            Замовлення №{orderNumber}
                          </h4>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 sm:gap-2 sm:text-xs">
                            <span className="soft-chip min-h-7 px-2.5 py-1">
                              <Boxes size={13} className="mr-1.5" />
                              {orderItems.length} позицій
                            </span>
                            {order.deliveryMethod && (
                              <span className="soft-chip min-h-7 px-2.5 py-1">
                                <Truck size={13} className="mr-1.5" />
                                {order.deliveryMethod}
                              </span>
                            )}
                            {order.paymentMethod && (
                              <span className="soft-chip min-h-7 px-2.5 py-1">
                                <CreditCard size={13} className="mr-1.5" />
                                {order.paymentMethod}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="inline-flex w-full flex-row items-center justify-between rounded-[14px] border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-left shadow-[0_8px_16px_rgba(16,185,129,0.06)] sm:min-w-[132px] sm:flex-col sm:items-end sm:text-right">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600/80">
                            Сума
                          </span>
                          <span className="text-sm font-extrabold text-emerald-700">
                            {currencyFormatter.format(orderTotalAmount)} грн
                          </span>
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-2.5 border-t border-sky-100/80 pt-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          <span>Склад замовлення</span>
                          <span>{orderItems.length} поз.</span>
                        </div>

	                        <ul className="app-panel-scroll space-y-1.5 overflow-y-auto sm:max-h-44 sm:pr-1">
	                          {orderItems.length > 0 ? (
	                            orderItems.map((item: PastOrderItem, idx: number) => {
	                              const itemQuantity = Math.max(1, Number(item.quantity || 1));
	                              const itemPrice = Number(item.price || 0);
	                              const hasItemPrice = Number.isFinite(itemPrice) && itemPrice > 0;
	                              const itemTotal = itemPrice * itemQuantity;
	                              const itemName =
	                                item.name?.replace(/\s*\(.*?\)/g, '').trim() || 'Товар';

	                              return (
	                                <li
	                                  key={item.code || item.article || item.name || idx}
	                                  className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-[13px] bg-slate-50/90 px-2.5 py-2 text-left sm:grid-cols-[28px_minmax(0,1fr)_minmax(90px,auto)] sm:gap-2.5 sm:rounded-[14px] sm:px-3"
	                                >
	                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[10px] font-bold text-sky-700 shadow-[0_4px_10px_rgba(14,165,233,0.08)] sm:h-7 sm:w-7">
	                                    {idx + 1}
	                                  </span>
	                                  <span className="min-w-0">
	                                    <span className="line-clamp-1 text-[12px] font-bold leading-4 text-slate-800 sm:text-[13px]">
	                                      {itemName}
	                                    </span>
	                                    {item.article && (
	                                      <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500 sm:text-[11px]">
	                                        Арт. {item.article}
	                                      </span>
	                                    )}
	                                  </span>
	                                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
	                                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
	                                      {itemQuantity} шт.
	                                    </span>
	                                    {hasItemPrice && (
	                                      <span className="text-[11px] font-bold text-emerald-700">
	                                        {currencyFormatter.format(itemTotal)} грн
	                                      </span>
	                                    )}
	                                  </span>
	                                </li>
	                              );
	                            })
	                          ) : (
                            <li className="rounded-[13px] bg-slate-50/90 px-3 py-2 text-xs font-semibold text-slate-500">
                              Список товарів для цього замовлення не збережено.
                            </li>
                          )}
                        </ul>

                        {(hasOrderDiscount || order.warehouse) && (
                          <div className="mt-2 grid gap-1.5 text-[11px] text-slate-600 sm:grid-cols-2 sm:gap-2 sm:text-xs">
                            {hasOrderDiscount && (
                              <div className="soft-chip min-h-9 justify-start gap-1.5 px-2.5 py-1.5 text-emerald-700 sm:px-3">
                                <Percent size={15} />
                                <span>
                                  Знижка:{' '}
                                  <span className="font-semibold">
                                    -{currencyFormatter.format(orderDiscountAmount)} грн
                                  </span>
                                </span>
                              </div>
                            )}
                            {order.warehouse && (
                              <div className="soft-chip min-h-9 justify-start gap-1.5 px-2.5 py-1.5 sm:px-3">
                                <PackageCheck size={15} />
                                <span>{order.warehouse}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="soft-note rounded-[16px] px-3.5 py-4 text-center text-slate-600">
              <p>У вас ще немає замовлень.</p>
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={orderRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-order-modal-title"
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex flex-col overflow-y-auto overflow-x-hidden"
    >
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
        <div className="soft-panel-accent h-1 rounded-full" />

        <div className="soft-panel-header">
          <div className="min-w-0">
            <span className="soft-panel-eyebrow">
              <ShoppingCart size={14} />
              Кошик
            </span>
            <h3 id="my-order-modal-title" className="soft-panel-title">Моє замовлення</h3>
            <p className="soft-panel-subtitle">
              Перевірте товари, суму та перейдіть до оформлення без зайвих кроків.
            </p>
          </div>
          <button onClick={onClose} className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10">
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>

        <div className="soft-panel-tabs">
          <div className="grid w-full grid-cols-2 gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowPastOrders(true)}
              className="soft-segment flex items-center justify-center gap-1.5 rounded-[14px] px-2.5 py-2 text-sm font-semibold sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2.5"
            >
              <ClipboardList size={16} />
              Історія
            </button>

            <button
              onClick={handleBeginCheckout}
              className={`flex items-center justify-center gap-1.5 rounded-[14px] border px-2.5 py-2 text-[13px] font-semibold transition-[transform,box-shadow,filter,background-color,border-color] duration-200 sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2.5 ${
                hasItems && !isDiscountCheckPending
                  ? 'border-sky-300/50 bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_8px_20px_rgba(14,165,233,0.30)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_14px_28px_rgba(37,99,235,0.34)]'
                  : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-70'
              }`}
              disabled={!hasItems || isDiscountCheckPending}
            >
              <BadgeCheck size={16} />
              {isDiscountCheckPending ? 'Перевірка' : 'Оформити'}
            </button>
          </div>
        </div>

        <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
          <section className="soft-panel-hero px-3 py-3 sm:px-4 sm:py-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <h4 className="soft-panel-section-heading">Кошик у фокусі</h4>
                <p className="soft-panel-section-text">
                  Перевірте позиції, суму й переходьте до оформлення без зайвих кроків.
                </p>
              </div>
            </div>

            <div className="soft-panel-stat-grid mt-2.5">
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">Позицій</span>
                <span className="soft-panel-stat-value">{cartItems.length}</span>
              </div>
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">Одиниць</span>
                <span className="soft-panel-stat-value">{totalUnits}</span>
              </div>
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">До оплати</span>
                <span className="soft-panel-stat-value">{currencyFormatter.format(payableAmount)}</span>
              </div>
            </div>
          </section>

          <div className="mt-2 space-y-2 pb-1">
        {hasItems ? (
          <>
            {shouldShowPartnerPanel && (
              <div
                className={`rounded-[16px] border px-3 py-2.5 transition-[border-color,box-shadow,background-color] sm:rounded-[18px] sm:px-3.5 ${
                  partnerDiscountStatus === 'active'
                    ? 'border-sky-300/60 bg-gradient-to-r from-sky-50/90 via-white to-indigo-50/80 text-slate-800 shadow-[0_10px_22px_rgba(14,165,233,0.10)]'
                    : 'border-slate-200/80 bg-gradient-to-r from-white via-slate-50/80 to-white text-slate-800 shadow-[0_10px_22px_rgba(15,23,42,0.05)]'
                }`}
              >
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-white/90 shadow-[0_8px_16px_rgba(15,23,42,0.05)] ${partnerDiscountStatus === 'active' ? 'text-sky-600' : 'text-slate-500'}`}>
                      <Handshake size={17} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold leading-4 text-slate-900 sm:text-sm">
                        {partnerDiscountStatus === 'active'
                          ? `Партнер PartsON — знижка ${PARTNER_DISCOUNT_PERCENT}% активна`
                          : 'Партнерська програма PartsON'}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-600 sm:text-xs">
                        {partnerDiscountStatus === 'active'
                          ? 'Знижку враховано автоматично для цього замовлення.'
                          : `До активації залишилось ${currencyFormatter.format(Math.ceil(partnerAmountLeft))} грн замовлень`}
                      </p>
                    </div>
                  </div>
                  {partnerDiscountStatus === 'active' ? (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-sky-200/80 bg-white/90 px-2.5 py-1 text-xs font-bold text-sky-700 shadow-[0_6px_12px_rgba(14,165,233,0.08)]">
                      -{PARTNER_DISCOUNT_PERCENT}%
                    </span>
                  ) : (
                    <a
                      href="/partnership"
                      className="shrink-0 inline-flex items-center justify-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-[0_6px_12px_rgba(15,23,42,0.06)] transition hover:border-sky-200 hover:text-sky-700"
                    >
                      Деталі
                    </a>
                  )}
                </div>
                {partnerDiscountStatus === 'pending' && (
                  <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>{currencyFormatter.format(Math.round(totalSpentOnOrders))} грн</span>
                      <span>{currencyFormatter.format(PARTNER_THRESHOLD_UAH)} грн</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-500"
                        style={{ width: `${partnerProgressPercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10.5px] font-medium text-slate-400">
                      {partnerProgressPercent}% до партнерства — ще {currencyFormatter.format(Math.ceil(partnerAmountLeft))} грн замовлень
                    </p>
                  </div>
                )}
                {partnerDiscountStatus === 'active' && partnerDiscountTotals.isApplied && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-sky-100/80 pt-2 text-xs">
                    <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                      Знижка -{currencyFormatter.format(partnerDiscountTotals.discountAmount)} грн
                    </span>
                    <span className="inline-flex rounded-full bg-white/85 px-2.5 py-1 font-bold text-slate-900">
                      До оплати {currencyFormatter.format(payableAmount)} грн
                    </span>
                  </div>
                )}
              </div>
            )}

            {shouldShowFirstOrderDiscountPanel && (
              <div
                className={`rounded-[16px] border px-3 py-2.5 transition-[border-color,box-shadow,background-color] sm:rounded-[18px] sm:px-3.5 ${firstOrderDiscountPanelClass}`}
              >
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-white/90 text-emerald-600 shadow-[0_8px_16px_rgba(15,23,42,0.05)]">
                      {discountTotals.isApplied ? (
                        <Percent size={17} strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <Gift size={17} strokeWidth={2} aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold leading-4 text-slate-900 sm:text-sm">
                        {firstOrderDiscountCopy.title}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-600 sm:text-xs">
                        {firstOrderDiscountCopy.text}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="inline-flex items-center justify-center rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-[0_6px_12px_rgba(16,185,129,0.08)]">
                      -{FIRST_ORDER_DISCOUNT_PERCENT}%
                    </span>
                    {!user && (
                      <button
                        type="button"
                        onClick={openAuthModal}
                        className="inline-flex items-center justify-center rounded-full border border-sky-200/80 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 shadow-[0_8px_16px_rgba(14,165,233,0.1)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                      >
                        Увійти
                      </button>
                    )}
                  </div>
                </div>
                {discountTotals.isApplied && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/80 pt-2 text-xs">
                    <span className="inline-flex rounded-full bg-white/85 px-2.5 py-1 font-semibold text-emerald-700">
                      Знижка -{currencyFormatter.format(discountTotals.discountAmount)} грн
                    </span>
                    <span className="inline-flex rounded-full bg-white/85 px-2.5 py-1 font-bold text-slate-900">
                      До оплати {currencyFormatter.format(payableAmount)} грн
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:app-panel-scroll sm:max-h-[40vh] sm:gap-2.5">
              {cartItems.map((item, index) => {
                const itemName = item.name?.replace(/\s*\(.*?\)/g, '') || 'Товар';
                const lineTotal = (item.price || 0) * (item.quantity || 1);
                const itemSearchHref = `/katalog?search=${encodeURIComponent(itemName)}&filter=all`;

                  return (
                    <div
                      key={item.code || index}
                      className="soft-surface-card app-panel-card-hover group relative grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2.5 rounded-[16px] p-2.5 pr-11 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-3 sm:rounded-[20px] sm:p-3 sm:pr-12"
                    >
                      <Link
                        href={itemSearchHref}
                        className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[15px] border border-slate-200 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_16px_28px_rgba(14,165,233,0.13)] sm:h-[72px] sm:w-[72px]"
                        aria-label={`Переглянути ${itemName}`}
                      >
                        <ProductCardImage
                          productCode={item.code}
                          articleHint={item.article}
                          alt={itemName}
                          loadingMode={index < 2 ? 'eager' : 'lazy'}
                          fetchPriority={index < 2 ? 'high' : 'low'}
                          className="rounded-[14px] bg-white [&_span]:hidden"
                        />
                      </Link>
  
                      <div className="min-w-0 pr-1 sm:pr-0">
                        <Link
                          href={itemSearchHref}
                          className="line-clamp-2 text-[13px] font-bold leading-5 text-slate-900 transition hover:text-sky-700 sm:text-[15px]"
                        >
                          {itemName}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="soft-chip px-2 py-0.75 text-[10px] font-semibold text-slate-600 sm:px-2.5 sm:py-1 sm:text-[11px]">
                            #{index + 1}
                          </span>
                          {item.article && (
                            <span className="soft-chip max-w-full px-2 py-0.75 text-[10px] font-semibold text-slate-600 sm:px-2.5 sm:py-1 sm:text-[11px]">
                              <span className="truncate">Арт. {item.article}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1.5">
                            <span className="font-semibold text-slate-500">Ціна</span>
                            <span className="font-bold text-slate-900">
                              {currencyFormatter.format(item.price || 0)} грн
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1.5">
                            <span className="font-semibold text-slate-500">К-сть</span>
                            <span className="font-bold text-sky-700">{item.quantity} шт.</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5">
                            <span className="font-semibold text-slate-500">Разом</span>
                            <span className="font-bold text-emerald-700">
                              {currencyFormatter.format(lineTotal)} грн
                            </span>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.code)}
                        className="absolute right-2 top-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200/70 bg-rose-50/80 text-rose-500 transition hover:bg-rose-100 hover:text-rose-600 hover:border-rose-300/70 sm:right-2.5 sm:top-2.5 sm:h-8 sm:w-8"
                        aria-label={`Видалити ${itemName}`}
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="soft-panel-hero mt-1 flex flex-col items-center gap-2 rounded-[18px] px-3.5 py-4 text-center sm:gap-2.5 sm:rounded-[20px] sm:px-4 sm:py-5">
            <div className="flex items-center gap-2 text-base font-bold tracking-wide text-slate-900">
              <ShoppingCart size={20} className="text-sky-700" />
              <span>Кошик порожній</span>
            </div>
            <p className="max-w-xs text-sm font-medium leading-relaxed text-slate-600">
              Додайте товари до кошика, щоб оформити замовлення.
            </p>
            <Link
              href="/katalog"
              className="soft-primary-button inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold sm:px-4 sm:py-2.5"
            >
              Перейти в каталог
              <ArrowRight size={18} />
            </Link>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Order;
