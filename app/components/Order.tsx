'use client';

import { usePanelTransition } from "app/lib/use-panel-transition";
import { useCustomerDialog } from "app/lib/use-customer-dialog";
import { fetchPartnerStatus, getCachedPartnerStatus } from 'app/lib/partner-status-client';
import ProfileOrderRewards from './ProfileOrderRewards';
import WindowHubCover from 'app/components/WindowHubCover';
import {
  ChevronDown,
  CircleDot,
  Clock3,
  ArrowRight,
  LogIn,
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
  Ban,
} from 'lucide-react';
import OrderCancelControl from './OrderCancelControl';
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
  cancelled?: boolean;
  paymentStatus?: string;
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
        if (order.cancelled) return total;
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
          limit(20)
        );
        const snapshot = await getDocs(existingOrdersQuery);
        if (cancelled) return;

        // An order the customer cancelled does not use up the discount.
        const hasRealOrder = snapshot.docs.some((document) => document.data().cancelled !== true);
        setFirstOrderDiscountStatus(hasRealOrder ? 'used' : 'eligible');
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

  const shortDateFormatter = useMemo(
    () => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: 'Europe/Kyiv' }),
    []
  );
  const orderGroups = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' });
    const groups: { key: string; label: string; total: number; orders: PastOrder[] }[] = [];
    for (const order of pastOrders) {
      const seconds = order.createdAt?.seconds;
      const label = seconds ? monthFormatter.format(new Date(seconds * 1000)).replace(/\s*р\.$/, '') : 'Без дати';
      let group = groups.find((entry) => entry.key === label);
      if (!group) {
        group = { key: label, label: label.charAt(0).toUpperCase() + label.slice(1), total: 0, orders: [] };
        groups.push(group);
      }
      group.orders.push(order);
      group.total += Number(order.totalAmount || order.total || 0) || 0;
    }
    return groups;
  }, [pastOrders]);

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

  const rewardsReady = partnerSummaryUid === user?.uid &&
    (partnerDiscountStatus === 'active' || partnerDiscountStatus === 'pending');
  const orderRewards = user ? (
    <ProfileOrderRewards
      totalSpent={rewardsReady ? totalSpentOnOrders : null}
      status={rewardsReady ? 'ready' : partnerDiscountStatus === 'error' ? 'error' : 'loading'}
      onRetry={() => setPartnerRetry((value) => value + 1)}
    />
  ) : null;

  const renderHub = (view: 'cart' | 'history') => (
    <div className="cw-hub">
            <WindowHubCover />
      <div className="cw-hub-top">
        <span className="cw-hub-icon" aria-hidden="true">
          {view === 'cart' ? <ShoppingCart size={20} /> : <ClipboardList size={20} />}
        </span>
        <div className="cw-hub-text">
          <h3 id={view === 'cart' ? 'my-order-modal-title' : 'past-orders-modal-title'} className="cw-hub-title">
            {view === 'cart' ? 'Моє замовлення' : 'Історія замовлень'}
          </h3>
          <p className="cw-hub-sub">
            {view === 'cart'
              ? hasItems
                ? `${cartItems.length} ${pluralizePositions(cartItems.length)} · ${totalUnits} шт. · ${currencyFormatter.format(payableAmount)} грн`
                : 'Кошик порожній'
              : user && pastOrders.length > 0
                ? `${pastOrders.length} ${pluralizeUk(pastOrders.length, 'замовлення', 'замовлення', 'замовлень')} на ${currencyFormatter.format(totalPastOrdersAmount)} грн`
                : 'Статус, доставка і склад кожного замовлення'}
          </p>
        </div>
        <button onClick={onClose} aria-label="Закрити вікно" className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10">
          <X size={20} strokeWidth={2.3} />
        </button>
      </div>
      <div className="soft-panel-tabs cw-hub-tabs grid grid-cols-2">
        <button
          type="button"
          aria-pressed={view === 'cart'}
          onClick={() => setShowPastOrders(false)}
          className={`soft-segment flex items-center justify-center gap-1.5 ${view === 'cart' ? 'soft-segment--active' : ''}`}
        >
          <ShoppingCart size={14} aria-hidden="true" />
          Кошик
          {hasItems && <span className="cw-tab-count">{cartItems.length}</span>}
        </button>
        <button
          type="button"
          aria-pressed={view === 'history'}
          onClick={() => setShowPastOrders(true)}
          className={`soft-segment flex items-center justify-center gap-1.5 ${view === 'history' ? 'soft-segment--active' : ''}`}
        >
          <ClipboardList size={14} aria-hidden="true" />
          Історія
        </button>
      </div>
    </div>
  );

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

          {renderHub('history')}

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
            <div className="cw-order-groups">
            {orderGroups.map((group) => (
            <section key={group.key} className="cw-list" aria-label={`Замовлення: ${group.label}`}>
              <h4 className="cw-list-title cw-order-group-title">
                <span>{group.label}</span>
                <span className="cw-order-group-total">
                  {group.orders.length} · {currencyFormatter.format(group.total)} грн
                </span>
              </h4>
              <ul className="cw-list-rows">
              {group.orders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const orderTotalAmount = Number(order.totalAmount || order.total || 0);
                const orderDiscountAmount = Number(order.discountAmount || 0);
                const orderItems = order.cartItems ?? [];
                const orderNumber = order.orderId || order.id;
                const orderDate = order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000) : null;
                const hasOrderDiscount =
                  Number.isFinite(orderDiscountAmount) && orderDiscountAmount > 0;
                const trackingUrl = isNovaPoshtaDelivery(order.deliveryMethod) && order.trackingNumber
                  ? getNovaPoshtaTrackingUrl(order.trackingNumber)
                  : null;
                const itemNames = orderItems.map((item) => item.name?.replace(/\s*\(.*?\)/g, '').trim() || 'Товар');
                const itemsPreview = itemNames.length > 2
                  ? `${itemNames.slice(0, 2).join(', ')} і ще ${itemNames.length - 2}`
                  : itemNames.join(', ') || 'Склад не збережено';

                const status = order.cancelled
                  ? { label: 'Скасовано', tone: 'cancelled', Icon: Ban }
                  : order.completed
                  ? { label: 'Виконано', tone: 'done', Icon: PackageCheck }
                  : order.shipped
                    ? { label: 'Відправлено', tone: 'shipped', Icon: Truck }
                    : order.read
                      ? { label: 'Опрацьовується', tone: 'progress', Icon: Clock3 }
                      : { label: 'Нове', tone: 'new', Icon: CircleDot };
                const StatusIcon = status.Icon;
                const detailsId = `order-details-${order.id}`;

                return (
                  <li key={order.id} className={`cw-order-card${isExpanded ? ' is-expanded' : ''}`} data-status={status.tone}>
                    <button
                      type="button"
                      className="cw-order-summary"
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      onClick={() => toggleExpandOrder(order.id)}
                    >
                      <span className={`cw-order-status-icon cw-status--${status.tone}`} aria-hidden="true">
                        <StatusIcon size={16} />
                      </span>
                      <span className="cw-order-main">
                        <span className="cw-order-headline">
                          <span className="cw-order-number">№{orderNumber}</span>
                          <span className="cw-order-sum">
                            {currencyFormatter.format(orderTotalAmount)} <small>грн</small>
                          </span>
                        </span>
                        <span className="cw-order-subline">
                          <span className={`cw-status cw-status--${status.tone}`}>{status.label}</span>
                          <span className="cw-order-preview" title={itemNames.join(', ')}>{itemsPreview}</span>
                          <time className="cw-order-date" dateTime={orderDate?.toISOString()}>
                            {orderDate ? shortDateFormatter.format(orderDate) : 'без дати'}
                          </time>
                        </span>
                      </span>
                      <ChevronDown size={18} className="cw-order-chevron" aria-hidden="true" />
                    </button>

                    {isExpanded && (
                      <div id={detailsId} className="cw-order-details">
                        <ul className="cw-order-lines">
                          {orderItems.length > 0 ? (
                            orderItems.map((item: PastOrderItem, idx: number) => {
                              const itemQuantity = Math.max(1, Number(item.quantity || 1));
                              const itemPrice = Number(item.price || 0);
                              const hasItemPrice = Number.isFinite(itemPrice) && itemPrice > 0;
                              const itemName =
                                item.name?.replace(/\s*\(.*?\)/g, '').trim() || 'Товар';

                              return (
                                <li key={item.code || item.article || item.name || idx} className="cw-order-line">
                                  <span className="cw-order-line-main">
                                    <span className="cw-order-line-name">{itemName}</span>
                                    {item.article && <span className="cw-order-line-article">Арт. {item.article}</span>}
                                  </span>
                                  <span className="cw-order-line-price">
                                    <span>{itemQuantity} шт.{hasItemPrice && ` × ${currencyFormatter.format(itemPrice)}`}</span>
                                    {hasItemPrice && <strong>{currencyFormatter.format(itemPrice * itemQuantity)} грн</strong>}
                                  </span>
                                </li>
                              );
                            })
                          ) : (
                            <li className="cw-order-line cw-order-line--empty">
                              Список товарів для цього замовлення не збережено.
                            </li>
                          )}
                        </ul>

                        <dl className="cw-order-facts">
                          {orderDate && (
                            <div><dt><Clock3 size={14} aria-hidden="true" />Оформлено</dt><dd>{dateFormatter.format(orderDate)}</dd></div>
                          )}
                          {order.deliveryMethod && (
                            <div><dt><Truck size={14} aria-hidden="true" />Доставка</dt><dd>{order.deliveryMethod}</dd></div>
                          )}
                          {order.warehouse && (
                            <div><dt><PackageCheck size={14} aria-hidden="true" />Відділення</dt><dd>{order.warehouse}</dd></div>
                          )}
                          {order.paymentMethod && (
                            <div><dt><CreditCard size={14} aria-hidden="true" />Оплата</dt><dd>{order.paymentMethod}</dd></div>
                          )}
                          {hasOrderDiscount && (
                            <div><dt><Percent size={14} aria-hidden="true" />Знижка</dt><dd className="is-positive">−{currencyFormatter.format(orderDiscountAmount)} грн</dd></div>
                          )}
                        </dl>

                        {/* Until a manager opens it, an order paid on delivery
                            can be cancelled here (the server re-checks). */}
                        {!order.cancelled && !order.read && !order.shipped && !order.completed &&
                          order.paymentStatus === 'cash_on_delivery' && (
                            <OrderCancelControl orderId={order.orderId || order.id} />
                        )}

                        {trackingUrl && (
                          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="cw-order-tracking">
                            <Truck size={17} aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="cw-order-tracking-label">ТТН Нової Пошти</span>
                              <span className="cw-order-tracking-number">{order.trackingNumber}</span>
                            </span>
                            <span className="cw-order-tracking-cta">Відстежити <ArrowRight size={14} aria-hidden="true" /></span>
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
              </ul>
            </section>
            ))}
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

        {renderHub('cart')}

        <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto sm:pr-1">
          <div className="space-y-2 pb-1">
        {orderRewards}
        {hasItems ? (
          <>
            {(shouldShowPartnerPanel || shouldShowFirstOrderDiscountPanel || hasPromoItems) && (
              <section className="cw-list cw-perks" aria-label="Знижки та вигоди">
                <ul className="cw-list-rows">
                  {shouldShowPartnerPanel && (
                    <li className="cw-row cw-perk" data-tone={partnerDiscountStatus === 'active' ? 'partner' : 'muted'}>
                      <span className="cw-row-icon" aria-hidden="true"><Handshake size={16} /></span>
                      <div className="cw-row-body">
                        <span className="cw-perk-title">
                          {partnerDiscountStatus === 'active'
                            ? `Партнер PartsON — знижка ${PARTNER_DISCOUNT_PERCENT}% активна`
                            : 'Партнерська програма PartsON'}
                        </span>
                        <span className="cw-row-text">
                          {partnerDiscountStatus === 'active'
                            ? hasPromoItems
                              ? 'Знижку враховано лише для товарів без акційної ціни.'
                              : 'Знижку враховано автоматично для цього замовлення.'
                            : `${partnerProgressPercent}% до партнерства — ще ${currencyFormatter.format(Math.ceil(partnerAmountLeft))} грн замовлень`}
                        </span>
                        {partnerDiscountStatus === 'pending' && (
                          <span className="cw-perk-progress" role="progressbar" aria-label="Прогрес до партнерства"
                            aria-valuenow={partnerProgressPercent} aria-valuemin={0} aria-valuemax={100}>
                            <span style={{ width: `${partnerProgressPercent}%` }} />
                          </span>
                        )}
                      </div>
                      {partnerDiscountStatus === 'active' ? (
                        <span className="cw-perk-badge">
                          {partnerDiscountTotals.isApplied
                            ? `−${currencyFormatter.format(partnerDiscountTotals.discountAmount)} грн`
                            : `−${PARTNER_DISCOUNT_PERCENT}%`}
                        </span>
                      ) : (
                        <a href="/partnership" className="cw-chip-button">Деталі</a>
                      )}
                    </li>
                  )}

                  {shouldShowFirstOrderDiscountPanel && (
                    <li className="cw-row cw-perk" data-tone={firstOrderDiscountCopy.tone}>
                      <span className="cw-row-icon" aria-hidden="true">
                        {discountTotals.isApplied ? <Percent size={16} /> : <Gift size={16} />}
                      </span>
                      <div className="cw-row-body">
                        <span className="cw-perk-title">{firstOrderDiscountCopy.title}</span>
                        <span className="cw-row-text">{firstOrderDiscountCopy.text}</span>
                      </div>
                      {!user ? (
                        <button type="button" onClick={openAuthModal} className="cw-chip-button cw-chip-button--accent">
                          Увійти
                        </button>
                      ) : (
                        <span className="cw-perk-badge">
                          {discountTotals.isApplied
                            ? `−${currencyFormatter.format(discountTotals.discountAmount)} грн`
                            : `−${FIRST_ORDER_DISCOUNT_PERCENT}%`}
                        </span>
                      )}
                    </li>
                  )}

                  {hasPromoItems && (
                    <li className="cw-row cw-perk" data-tone="promo">
                      <span className="cw-row-icon" aria-hidden="true"><Percent size={16} /></span>
                      <div className="cw-row-body">
                        <span className="cw-row-text">
                          Акційна ціна вже є максимальною вигодою, тому додаткові знижки до таких позицій не застосовуються.
                        </span>
                      </div>
                    </li>
                  )}
                </ul>
              </section>
            )}

            <section className="cw-list" aria-labelledby="cart-items-title">
              <h4 id="cart-items-title" className="cw-list-title">
                Товари <span className="cw-list-count">{totalUnits} шт.</span>
              </h4>
              <ul className="cw-list-rows">
              {cartItems.map((item, index) => {
                const itemName = item.name?.replace(/\s*\(.*?\)/g, '') || 'Товар';
                const lineTotal = (item.price || 0) * (item.quantity || 1);
                const itemSearchHref = `/katalog?search=${encodeURIComponent(itemName)}&filter=all`;

                return (
                  <li key={item.code || index} className="cw-cart-row">
                    <Link
                      href={itemSearchHref}
                      className="cw-cart-thumb"
                      aria-label={`Переглянути ${itemName}`}
                      tabIndex={-1}
                    >
                      <ProductCardImage
                        productCode={item.code}
                        articleHint={item.article}
                        alt={itemName}
                        loadingMode={index < 2 ? 'eager' : 'lazy'}
                        fetchPriority={index < 2 ? 'high' : 'low'}
                        className="rounded-[8px] bg-white [&_span]:hidden"
                      />
                    </Link>

                    <div className="min-w-0">
                      <Link href={itemSearchHref} className="cw-cart-name">
                        {itemName}
                      </Link>
                      <p className="cw-cart-meta">
                        {item.article && <span className="max-w-full truncate" title={item.article}>{item.article}</span>}
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
                      <span className="cw-cart-total">
                        {currencyFormatter.format(lineTotal)} <small>грн</small>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.code)}
                        className="cw-cart-remove"
                        aria-label={`Видалити ${itemName}`}
                        title="Видалити з кошика"
                      >
                        <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
              </ul>
            </section>
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
