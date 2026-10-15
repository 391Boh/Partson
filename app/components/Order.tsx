'use client';

import { usePanelTransition } from "app/lib/use-panel-transition";
import { useCustomerDialog } from "app/lib/use-customer-dialog";
import { fetchPartnerStatus, getCachedPartnerStatus } from 'app/lib/partner-status-client';
import ProfileOrderRewards from './ProfileOrderRewards';
import {
  ArrowLeft,
  ChevronDown,
  CircleDot,
  Clock3,
  ArrowRight,
  LogIn,
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
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { getNovaPoshtaTrackingUrl, isNovaPoshtaDelivery } from 'app/lib/order-tracking';
import { useCart } from 'app/context/CartContext';
import { pluralizePositions, pluralizeUk } from 'app/lib/pluralize-uk';
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
  onSnapshot,
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
  trackingNumber?: string | null;
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
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState(() => Boolean(auth.currentUser));
  const [initialPartnerStatus] = useState(() => auth.currentUser ? getCachedPartnerStatus(auth.currentUser.uid) : null);
  const [firstOrderDiscountStatus, setFirstOrderDiscountStatus] =
    useState<FirstOrderDiscountStatus>('loading');
  const [partnerDiscountStatus, setPartnerDiscountStatus] =
    useState<PartnerDiscountStatus>(() => initialPartnerStatus ? initialPartnerStatus.isPartner ? 'active' : 'pending' : 'loading');
  const [totalSpentOnOrders, setTotalSpentOnOrders] = useState(() => initialPartnerStatus?.totalSpent ?? 0);
  const [partnerSummaryUid, setPartnerSummaryUid] = useState<string | null>(() => initialPartnerStatus ? auth.currentUser?.uid ?? null : null);
  const [partnerRetry, setPartnerRetry] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const orderRef = useRef<HTMLDivElement>(null);
  useCustomerDialog(orderRef, onClose, isOrdering ? "checkout" : showPastOrders ? "history" : "cart");
  usePanelTransition(orderRef, isOrdering ? "checkout" : showPastOrders ? "history" : "cart", ".app-panel-scroll");
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
  const discountableAmount = cartItems.reduce(
    (total, item) =>
      item.isPromoPrice
        ? total
        : total + (item.price || 0) * (item.quantity || 1),
    0
  );
  const hasPromoItems = cartItems.some((item) => item.isPromoPrice);
  const isFirstOrderDiscountEligible =
    Boolean(user) && firstOrderDiscountStatus === 'eligible';
  const isPartnerEligible =
    Boolean(user) && partnerDiscountStatus === 'active';
  const isDiscountCheckPending =
    !isAuthReady ||
    (Boolean(user) &&
      (firstOrderDiscountStatus === 'loading' || partnerDiscountStatus === 'loading'));
  const discountTotals = useMemo(
    () => {
      const calculated = calculateFirstOrderDiscount(
        discountableAmount,
        isFirstOrderDiscountEligible
      );
      return {
        ...calculated,
        subtotalAmount: totalAmount,
        totalAmount: Math.max(0, totalAmount - calculated.discountAmount),
        discountRate: calculated.isApplied ? calculated.discountRate : 0,
        discountCode: calculated.isApplied ? calculated.discountCode : null,
      };
    },
    [discountableAmount, isFirstOrderDiscountEligible, totalAmount]
  );
  const partnerDiscountTotals = useMemo(
    () => {
      const calculated = calculatePartnerDiscount(discountableAmount, isPartnerEligible);
      return {
        ...calculated,
        subtotalAmount: totalAmount,
        totalAmount: Math.max(0, totalAmount - calculated.discountAmount),
        discountRate: calculated.isApplied ? calculated.discountRate : 0,
        discountCode: calculated.isApplied ? calculated.discountCode : null,
      };
    },
    [discountableAmount, isPartnerEligible, totalAmount]
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
  const checkoutEcommerceItems = cartEcommerceItems.map((item, index) => ({
    ...item,
    ...(effectiveDiscountTotals.isApplied && !cartItems[index]?.isPromoPrice
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
      if (!getCachedPartnerStatus(user.uid)) setPartnerDiscountStatus('loading');
      try {
        const status = await fetchPartnerStatus(user);
        if (!Number.isFinite(status.totalSpent) || status.totalSpent < 0) {
          throw new Error('Invalid order total');
        }
        if (cancelled) return;
        setTotalSpentOnOrders(status.totalSpent);
        setPartnerSummaryUid(user.uid);
        setPartnerDiscountStatus(status.isPartner ? 'active' : 'pending');
      } catch {
        if (!cancelled) setPartnerDiscountStatus('error');
      }
    };

    void checkPartnership();
    return () => { cancelled = true; };
  }, [isAuthReady, user, partnerRetry]);

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
    setExpandedOrderId(null);
    setPastOrders([]);
    if (!showPastOrders || !user) { setLoadingOrders(false); return; }
    setLoadingOrders(true);
    const ordersQuery = query(
      collection(db, 'orders'), where('uid', '==', user.uid), orderBy('createdAt', 'desc')
    );
    return onSnapshot(ordersQuery, (snapshot) => {
      setPastOrders(snapshot.docs.map((document) => ({
        id: document.id, ...(document.data() as Omit<PastOrder, 'id'>),
      })));
      setLoadingOrders(false);
    }, (error) => {
      console.error('Order history subscription failed:', error);
      setLoadingOrders(false);
    });
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

  const rewardsReady = partnerSummaryUid === user?.uid &&
    (partnerDiscountStatus === 'active' || partnerDiscountStatus === 'pending');
  const orderRewards = user ? (
    <ProfileOrderRewards
      totalSpent={rewardsReady ? totalSpentOnOrders : null}
      status={rewardsReady ? 'ready' : partnerDiscountStatus === 'error' ? 'error' : 'loading'}
      onRetry={() => setPartnerRetry((value) => value + 1)}
    />
  ) : null;

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
        className="customer-window customer-overlay-panel customer-overlay-panel--order soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex flex-col overflow-y-auto overflow-x-hidden"
      >
        <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
          <div className="soft-panel-accent h-1 rounded-full" />

          <div className="soft-panel-header">
            <div className="min-w-0">
              <h3 id="past-orders-modal-title" className="soft-panel-title">Історія замовлень</h3>
              <p className="soft-panel-subtitle">
                {user && pastOrders.length > 0
                  ? `${pastOrders.length} ${pluralizeUk(pastOrders.length, 'замовлення', 'замовлення', 'замовлень')} на ${currencyFormatter.format(totalPastOrdersAmount)} грн`
                  : 'Дата, сума, доставка, склад і статус кожного замовлення.'}
              </p>
            </div>
            <div className="cw-head-actions">
              <button
                type="button"
                onClick={() => setShowPastOrders(false)}
                className="cw-head-link"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Кошик
              </button>
              <button onClick={onClose} aria-label="Закрити вікно" className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10">
                <X size={22} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
            <div className="space-y-2 pb-1">
          {!user ? (
            <div className="cw-empty">
              <span className="cw-empty-icon" aria-hidden="true">
                <LogIn size={24} />
              </span>
              <p className="cw-empty-title">Увійдіть, щоб побачити замовлення</p>
              <p className="cw-empty-text">
                Історія зберігається у вашому акаунті: статус, ТТН Нової Пошти і склад кожного замовлення.
              </p>
              <button
                type="button"
                onClick={openAuthModal}
                className="soft-primary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
              >
                <LogIn size={17} aria-hidden="true" />
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

                const status = order.completed
                  ? { label: 'Виконано', tone: 'done', Icon: PackageCheck }
                  : order.shipped
                    ? { label: 'Відправлено', tone: 'shipped', Icon: Truck }
                    : order.read
                      ? { label: 'Опрацьовується', tone: 'progress', Icon: Clock3 }
                      : { label: 'Нове', tone: 'new', Icon: CircleDot };
                const StatusIcon = status.Icon;

                return (
                  <div
                    key={order.id}
                    className={`cw-order-card${isExpanded ? ' is-expanded' : ''}`}
                  >
                    <button
                      type="button"
                      className="cw-order-summary"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpandOrder(order.id)}
                    >
                      <span className="min-w-0">
                        <span className="cw-order-title">
                          <span className="cw-order-number">№{orderNumber}</span>
                          <span className={`cw-status cw-status--${status.tone}`}>
                            <StatusIcon size={13} aria-hidden="true" />
                            {status.label}
                          </span>
                        </span>
                        <span className="cw-order-meta">
                          <span><CalendarClock size={13} aria-hidden="true" />{orderDateLabel}</span>
                          <span><Boxes size={13} aria-hidden="true" />{orderItems.length} {pluralizePositions(orderItems.length)}</span>
                          {order.deliveryMethod && (
                            <span><Truck size={13} aria-hidden="true" />{order.deliveryMethod}</span>
                          )}
                          {order.paymentMethod && (
                            <span><CreditCard size={13} aria-hidden="true" />{order.paymentMethod}</span>
                          )}
                        </span>
                      </span>
                      <span className="cw-order-amount">
                        <span className="cw-order-sum">
                          {currencyFormatter.format(orderTotalAmount)} <small>грн</small>
                        </span>
                        {hasOrderDiscount && (
                          <span className="cw-order-discount">
                            −{currencyFormatter.format(orderDiscountAmount)} грн
                          </span>
                        )}
                        <ChevronDown size={18} className="cw-order-chevron" aria-hidden="true" />
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="cw-order-details">
                        <div className="cw-order-details-head">
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
	                                  className="cw-order-line"
	                                >
	                                  <span className="cw-order-line-index">
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

                        {isNovaPoshtaDelivery(order.deliveryMethod) && order.trackingNumber && getNovaPoshtaTrackingUrl(order.trackingNumber) && (
                          <a href={getNovaPoshtaTrackingUrl(order.trackingNumber)!} target="_blank" rel="noopener noreferrer"
                            className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100">
                            <Truck size={18} aria-hidden="true" />
                            <span>ТТН: <span className="font-mono">{order.trackingNumber}</span></span>
                            <span className="ml-auto inline-flex items-center gap-1 text-xs">Відстежити <ArrowRight size={14} aria-hidden="true" /></span>
                          </a>
                        )}
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
            <div className="cw-empty">
              <span className="cw-empty-icon" aria-hidden="true">
                <ClipboardList size={24} />
              </span>
              <p className="cw-empty-title">Замовлень ще немає</p>
              <p className="cw-empty-text">Оформлені замовлення з&apos;являться тут разом зі статусом доставки.</p>
              <Link href="/katalog" className="soft-primary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
                Перейти в каталог
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
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
      className="customer-window customer-overlay-panel customer-overlay-panel--order soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex flex-col overflow-y-auto overflow-x-hidden"
    >
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
        <div className="soft-panel-accent h-1 rounded-full" />

        <div className="soft-panel-header">
          <div className="min-w-0">
            <h3 id="my-order-modal-title" className="soft-panel-title">Моє замовлення</h3>
            <p className="soft-panel-subtitle">
              {hasItems
                ? `${cartItems.length} ${pluralizePositions(cartItems.length)} · ${totalUnits} шт.`
                : 'Перевірте товари, суму та перейдіть до оформлення.'}
            </p>
          </div>
          <div className="cw-head-actions">
            <button
              type="button"
              onClick={() => setShowPastOrders(true)}
              className="cw-head-link"
            >
              <ClipboardList size={16} aria-hidden="true" />
              Історія
            </button>
            <button onClick={onClose} aria-label="Закрити вікно" className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10">
              <X size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
          <div className="space-y-2 pb-1">
        {orderRewards}
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
                          ? hasPromoItems
                            ? 'Знижку враховано лише для товарів без акційної ціни.'
                            : 'Знижку враховано автоматично для цього замовлення.'
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

            {hasPromoItems && (
              <div className="flex items-start gap-2 rounded-[14px] border border-rose-200/80 bg-rose-50/75 px-3 py-2 text-[11px] font-medium leading-4 text-rose-800">
                <Percent size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                Акційна ціна вже є максимальною вигодою, тому додаткові знижки до таких позицій не застосовуються.
              </div>
            )}

            <div className="flex flex-col gap-2 sm:app-panel-scroll sm:max-h-[40vh] sm:gap-2.5">
              {cartItems.map((item, index) => {
                const itemName = item.name?.replace(/\s*\(.*?\)/g, '') || 'Товар';
                const lineTotal = (item.price || 0) * (item.quantity || 1);
                const itemSearchHref = `/katalog?search=${encodeURIComponent(itemName)}&filter=all`;

                  return (
                    <div key={item.code || index} className="cw-cart-item">
                      <Link
                        href={itemSearchHref}
                        className="cw-cart-thumb"
                        aria-label={`Переглянути ${itemName}`}
                      >
                        <ProductCardImage
                          productCode={item.code}
                          articleHint={item.article}
                          alt={itemName}
                          loadingMode={index < 2 ? 'eager' : 'lazy'}
                          fetchPriority={index < 2 ? 'high' : 'low'}
                          className="rounded-[10px] bg-white [&_span]:hidden"
                        />
                      </Link>

                      <div className="min-w-0">
                        <Link href={itemSearchHref} className="cw-cart-name">
                          {itemName}
                        </Link>
                        <p className="cw-cart-meta">
                          {item.article && <span className="block max-w-full truncate" title={item.article}>Арт. {item.article}</span>}
                          {item.producer && <span>{item.producer}</span>}
                          {item.isPromoPrice && <span className="cw-cart-promo">Акція</span>}
                        </p>
                        <p className="cw-cart-unit">
                          {item.isPromoPrice && item.originalPrice ? (
                            <s>{currencyFormatter.format(item.originalPrice)}</s>
                          ) : null}
                          {currencyFormatter.format(item.price || 0)} грн × {item.quantity} шт.
                        </p>
                      </div>

                      <div className="cw-cart-side">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.code)}
                          className="cw-cart-remove"
                          aria-label={`Видалити ${itemName}`}
                          title="Видалити з кошика"
                        >
                          <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                        <span className="cw-cart-total">
                          {currencyFormatter.format(lineTotal)} <small>грн</small>
                        </span>
                      </div>
                    </div>
                  );
              })}
            </div>
          </>
        ) : (
          <div className="cw-empty">
            <span className="cw-empty-icon" aria-hidden="true">
              <ShoppingCart size={24} />
            </span>
            <p className="cw-empty-title">Кошик порожній</p>
            <p className="cw-empty-text">
              Додайте товари з каталогу — тут з&apos;явиться сума і кнопка оформлення.
            </p>
            <Link href="/katalog" className="soft-primary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
              Перейти в каталог
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        )}
          </div>
        </div>

        {hasItems && (
          <div className="cw-checkout-bar">
            <div className="cw-checkout-sum">
              <span className="cw-checkout-label">До оплати</span>
              <span className="cw-checkout-value">
                {currencyFormatter.format(payableAmount)} <small>грн</small>
              </span>
              {effectiveDiscountTotals.discountAmount > 0 && (
                <span className="cw-checkout-note">
                  <s>{currencyFormatter.format(totalAmount)} грн</s> · знижка −{currencyFormatter.format(effectiveDiscountTotals.discountAmount)} грн
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleBeginCheckout}
              disabled={isDiscountCheckPending}
              className="soft-primary-button cw-checkout-button"
            >
              {isDiscountCheckPending ? 'Перевіряємо знижку…' : 'Оформити замовлення'}
              {!isDiscountCheckPending && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Order;
