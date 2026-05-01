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
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { useCart } from 'app/context/CartContext';
import { pushDataLayer } from 'app/lib/gtm';
import { useEffect, useMemo, useState, useRef } from 'react';
import Zamovl from './zamovl';
import { db, auth } from '../../firebase';
import {
  collection,
  getDocs,
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
  quantity?: number;
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
}

const Order: React.FC<OrderProps> = ({ onClose }) => {
  const { cartItems, removeFromCart, clearCart } = useCart();
  const hasItems = cartItems.length > 0;
  const [isOrdering, setIsOrdering] = useState(false);
  const [showPastOrders, setShowPastOrders] = useState(false);
  const [pastOrders, setPastOrders] = useState<PastOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [user, setUser] = useState<User | null>(null);
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
  const totalUnits = cartItems.reduce(
    (total, item) => total + (item.quantity || 0),
    0
  );

  const handleBeginCheckout = () => {
    pushDataLayer({
      event: "begin_checkout",
      currency: "UAH",
      value: totalAmount,
      items: cartItems.map((item) => ({
        item_id: item.code,
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
        currency: "UAH",
      })),
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
    });
    return () => unsubscribe();
  }, []);

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

  if (isOrdering) {
    return (
      <Zamovl
        cartItems={cartItems}
        totalAmount={totalAmount}
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
        className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex flex-col overflow-y-auto overflow-x-hidden"
      >
        <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
          <div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />

          <div className="soft-panel-header">
            <div className="min-w-0">
              <span className="soft-panel-eyebrow">
                <ClipboardList size={14} />
                Замовлення
              </span>
              <h3 className="soft-panel-title mt-3">Історія замовлень</h3>
              <p className="soft-panel-subtitle">
                Перегляд попередніх оформлень, сум, способу доставки та оплати.
              </p>
            </div>
            <button onClick={onClose} className="soft-icon-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <button
              onClick={() => setShowPastOrders(false)}
              className="soft-secondary-button w-full px-3 py-2 text-sm font-semibold transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:shadow-[0_14px_28px_rgba(14,165,233,0.12)] sm:w-auto sm:px-4 sm:py-2.5"
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
                return (
                  <button
                    key={order.id}
                    type="button"
                    className="group soft-surface-card app-panel-card-hover rounded-[18px] border border-sky-100/70 p-3 text-left text-slate-700 transition-[transform,box-shadow,border-color,background-color] duration-200 hover:border-sky-200/90 hover:bg-white/95 hover:shadow-[0_22px_42px_rgba(14,165,233,0.12)] sm:rounded-[20px] sm:p-3.5"
                    onClick={() => toggleExpandOrder(order.id)}
                  >
                    <div className="flex w-full flex-col items-start gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                          <CalendarClock size={13} />
                          {order.createdAt?.seconds
                            ? dateFormatter.format(new Date(order.createdAt.seconds * 1000))
                            : 'Дата уточнюється'}
                        </div>
                        <h4 className="mt-2.5 break-words text-[15px] font-bold text-slate-800 sm:mt-3 sm:text-base">
                          Замовлення #{order.orderId || order.id}
                        </h4>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 sm:mt-2 sm:gap-2 sm:text-xs">
                          <span className="soft-chip min-h-8 px-3 py-1">
                            <Boxes size={13} className="mr-1.5" />
                            {order.cartItems?.length || 0} позицій
                          </span>
                          <span className="soft-chip min-h-8 px-3 py-1 text-emerald-700">
                            <ShoppingCart size={13} className="mr-1.5" />
                            {currencyFormatter.format(Number(order.totalAmount || order.total || 0))} грн
                          </span>
                        </div>
                      </div>
                      <span className={`soft-icon-button h-8 w-8 shrink-0 self-end p-0 transition-[transform,box-shadow,background-color,border-color,color] duration-200 group-hover:-translate-y-0.5 group-hover:border-sky-200 group-hover:bg-white group-hover:text-sky-700 group-hover:shadow-[0_12px_22px_rgba(14,165,233,0.12)] sm:h-9 sm:w-9 sm:self-start ${isExpanded ? 'border-sky-200 bg-white text-sky-700 shadow-[0_10px_18px_rgba(14,165,233,0.12)]' : ''}`}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        <div className="soft-note rounded-[16px] px-2.5 py-2 sm:rounded-[18px] sm:px-3 sm:py-2.5">
                          <ul className="app-panel-scroll space-y-1.5 overflow-y-auto text-[11px] text-slate-600 sm:max-h-40 sm:space-y-2 sm:pr-1 sm:text-xs">
                            {order.cartItems?.map((item: PastOrderItem, idx: number) => (
                              <li
                                key={idx}
                                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[13px] border border-white/70 bg-white/75 px-2.5 py-1.5 sm:gap-3 sm:rounded-[14px] sm:px-3 sm:py-2"
                              >
                                <span className="min-w-0 break-words text-slate-700">{item.name}</span>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                  {item.quantity} шт.
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="grid gap-1.5 text-[11px] text-slate-600 sm:grid-cols-2 sm:gap-2 sm:text-xs xl:grid-cols-3">
                          <div className="soft-chip min-h-10 justify-start gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2">
                            <ShoppingCart size={15} />
                            <span>
                              Сума:{' '}
                              <span className="font-semibold text-emerald-600">
                                {order.totalAmount || order.total} грн
                              </span>
                            </span>
                          </div>
                          {order.deliveryMethod && (
                            <div className="soft-chip min-h-10 justify-start gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2">
                              <Truck size={15} />
                              <span>{order.deliveryMethod}</span>
                            </div>
                          )}
                          {order.warehouse && (
                            <div className="soft-chip min-h-10 justify-start gap-1.5 px-2.5 py-1.5 sm:col-span-2 sm:px-3 sm:py-2 xl:col-span-2">
                              <PackageCheck size={15} />
                              <span>{order.warehouse}</span>
                            </div>
                          )}
                          {order.paymentMethod && (
                            <div className="soft-chip min-h-10 justify-start gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2">
                              <CreditCard size={15} />
                              <span>{order.paymentMethod}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
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
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex flex-col overflow-y-auto overflow-x-hidden"
    >
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3.5">
        <div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400" />

        <div className="soft-panel-header">
          <div className="min-w-0">
            <span className="soft-panel-eyebrow">
              <ShoppingCart size={14} />
              Кошик
            </span>
            <h3 className="soft-panel-title mt-3">Моє замовлення</h3>
            <p className="soft-panel-subtitle">
              Перевірте товари, суму та перейдіть до оформлення без зайвих кроків.
            </p>
          </div>
          <button onClick={onClose} className="soft-icon-button h-9 w-9 shrink-0 p-1 sm:h-10 sm:w-10">
            <X size={18} />
          </button>
        </div>

        <div className="soft-panel-tabs">
          <div className="grid w-full grid-cols-2 gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowPastOrders(true)}
              className="soft-segment flex items-center justify-center gap-1.5 rounded-[14px] px-2.5 py-2 text-sm font-semibold hover:bg-white/70 hover:text-slate-800 sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2.5"
            >
              <ClipboardList size={16} />
              Історія
            </button>

            <button
              onClick={handleBeginCheckout}
              className={`flex items-center justify-center gap-1.5 rounded-[14px] border px-2.5 py-2 text-sm font-semibold transition-[transform,box-shadow,filter,background-color,border-color] duration-200 sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2.5 ${
                hasItems
                  ? 'border-sky-200/50 bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-500 text-white shadow-[0_16px_30px_rgba(14,165,233,0.28)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_20px_38px_rgba(37,99,235,0.3)]'
                  : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-70'
              }`}
              disabled={!hasItems}
            >
              <ShoppingCart size={16} />
              Оформити
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
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-sky-700 sm:px-3 sm:py-1.5 sm:text-xs">
                <ShoppingCart size={14} />
                {hasItems ? "Готово до оформлення" : "Очікує товари"}
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
                <span className="soft-panel-stat-label">Сума</span>
                <span className="soft-panel-stat-value">{currencyFormatter.format(totalAmount)}</span>
              </div>
              <div className="soft-panel-stat-card">
                <span className="soft-panel-stat-label">Режим</span>
                <span className="soft-panel-stat-value">Кошик</span>
              </div>
            </div>
          </section>

          <div className="mt-2 space-y-2 pb-1">
        {hasItems ? (
          <>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2.5">
              <div className="soft-surface-card rounded-[16px] px-2.5 py-2 sm:rounded-[20px] sm:px-3.5 sm:py-3">
                <span className="text-[11px] text-slate-500 sm:text-xs">Всього позицій</span>
                <p className="mt-0.5 text-[17px] font-semibold text-slate-800 sm:mt-1 sm:text-lg">{cartItems.length} шт.</p>
                <p className="mt-0.5 text-[11px] text-slate-500 sm:mt-1 sm:text-xs">У кошику {totalUnits} товарних одиниць.</p>
              </div>
              <div className="soft-surface-card rounded-[16px] px-2.5 py-2 text-left sm:rounded-[20px] sm:px-3.5 sm:py-3 sm:text-right">
                <span className="text-[11px] text-slate-500 sm:text-xs">Сума до оплати</span>
                <p className="mt-0.5 text-[17px] font-semibold text-emerald-600 sm:mt-1 sm:text-lg">
                  {currencyFormatter.format(totalAmount)} грн
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 sm:mt-1 sm:text-xs">Остаточна сума перед оформленням.</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:app-panel-scroll sm:max-h-[40vh] sm:gap-2.5">
              {cartItems.map((item, index) => (
                <div
                  key={item.code || index}
                  className="soft-surface-card app-panel-card-hover flex flex-col gap-2 rounded-[16px] p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-[20px] sm:p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap gap-1.5 sm:mb-2 sm:gap-2">
                      <span className="soft-chip px-2 py-0.75 text-[10px] font-semibold text-slate-600 sm:px-2.5 sm:py-1 sm:text-[11px]">
                        #{index + 1}
                      </span>
                      <span className="soft-chip px-2 py-0.75 text-[10px] font-semibold text-slate-600 sm:px-2.5 sm:py-1 sm:text-[11px]">
                        {item.quantity} шт.
                      </span>
                    </div>
                    <Link
                      href={`/katalog?search=${encodeURIComponent(
                        item.name?.replace(/\s*\(.*?\)/g, '') || ''
                      )}&filter=all`}
                      className="line-clamp-2 text-[14px] font-semibold text-slate-800 transition hover:text-sky-700 sm:text-base"
                    >
                      {item.name?.replace(/\s*\(.*?\)/g, '')}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-slate-600 sm:mt-1 sm:text-sm">
                      {currencyFormatter.format(item.price || 0)} грн{' '}
                      <span className="text-slate-500">x {item.quantity} шт.</span>
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-emerald-600 sm:mt-1 sm:text-sm">
                      {currencyFormatter.format((item.price || 0) * (item.quantity || 1))} грн
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.code)}
                    className="soft-icon-button h-9 w-9 self-end shrink-0 p-0 text-rose-500 hover:text-rose-600 sm:h-10 sm:w-10 sm:self-auto"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="soft-panel-hero mt-1 flex flex-col items-center gap-2 rounded-[18px] px-3.5 py-4 text-center text-slate-600 sm:gap-2.5 sm:rounded-[20px] sm:px-4 sm:py-5">
            <div className="flex items-center gap-2 text-base font-bold tracking-wide text-slate-800">
              <ShoppingCart size={20} className="text-slate-500" />
              <span>Кошик порожній</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-slate-600">
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
