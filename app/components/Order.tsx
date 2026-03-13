'use client';

import {
  ShoppingCart,
  X,
  ClipboardList,
  Plus,
  Truck,
  CreditCard,
  PackageCheck,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { useCart } from 'app/context/CartContext';
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

  const totalAmount = cartItems.reduce(
    (total, item) => total + (item.price || 0) * (item.quantity || 1),
    0
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
        className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter flex flex-col overflow-hidden"
      >
        <div className="soft-panel-content flex flex-col gap-3 p-4 sm:p-4">
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
            <button onClick={onClose} className="soft-icon-button h-10 w-10 shrink-0 p-1">
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setShowPastOrders(false)}
              className="soft-secondary-button px-4 py-2.5 text-sm font-semibold"
            >
              Назад
            </button>
            {user && (
              <span className="soft-chip px-3 py-1 text-xs font-medium text-slate-600">
                {pastOrders.length} замовл.
              </span>
            )}
          </div>

          {!user ? (
            <div className="soft-note rounded-[16px] px-4 py-4 text-center text-slate-700">
              <p>
                Щоб переглянути свої замовлення, будь ласка, увійдіть у свій обліковий запис.
              </p>
              <Link
                href="/login"
                className="soft-primary-button mt-4 inline-flex px-4 py-2.5 text-sm font-semibold"
              >
                Увійти
              </Link>
            </div>
          ) : loadingOrders ? (
            <div className="py-6">
              <div className="loader" />
            </div>
          ) : pastOrders.length > 0 ? (
            <div className="app-panel-scroll flex max-h-[52vh] flex-col gap-3 overflow-y-auto pr-1">
              {pastOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                return (
                  <button
                    key={order.id}
                    type="button"
                    className="soft-surface-card app-panel-card-hover rounded-[16px] p-3.5 text-left text-slate-700"
                    onClick={() => toggleExpandOrder(order.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-slate-800">
                          Замовлення #{order.orderId || order.id}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.createdAt?.seconds
                            ? dateFormatter.format(new Date(order.createdAt.seconds * 1000))
                            : '—'}
                        </p>
                      </div>
                      <span className="soft-icon-button h-9 w-9 shrink-0 p-0">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        <div className="soft-note rounded-[16px] px-3 py-2.5">
                          <ul className="app-panel-scroll max-h-36 list-inside list-disc overflow-y-auto space-y-1 text-xs text-slate-600">
                            {order.cartItems?.map((item: PastOrderItem, idx: number) => (
                              <li key={idx}>
                                {item.name} — {item.quantity} шт.
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                          <div className="soft-chip justify-start gap-1.5 px-3 py-2">
                            <ShoppingCart size={15} />
                            <span>
                              Сума:{' '}
                              <span className="font-semibold text-emerald-600">
                                {order.totalAmount || order.total} грн
                              </span>
                            </span>
                          </div>
                          {order.deliveryMethod && (
                            <div className="soft-chip justify-start gap-1.5 px-3 py-2">
                              <Truck size={15} />
                              <span>{order.deliveryMethod}</span>
                            </div>
                          )}
                          {order.warehouse && (
                            <div className="soft-chip justify-start gap-1.5 px-3 py-2 sm:col-span-2">
                              <PackageCheck size={15} />
                              <span>{order.warehouse}</span>
                            </div>
                          )}
                          {order.paymentMethod && (
                            <div className="soft-chip justify-start gap-1.5 px-3 py-2">
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
            <div className="soft-note rounded-[16px] px-4 py-5 text-center text-slate-600">
              <p>У вас ще немає замовлень.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={orderRef}
      className="soft-modal-shell soft-panel-glow app-overlay-panel app-panel-enter flex flex-col overflow-hidden"
    >
      <div className={`soft-panel-content flex flex-col p-4 sm:p-4 ${hasItems ? 'gap-3' : 'gap-2.5'}`}>
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
          <button onClick={onClose} className="soft-icon-button h-10 w-10 shrink-0 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="soft-panel-tabs">
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              onClick={() => setShowPastOrders(true)}
              className="soft-segment flex items-center justify-center gap-2 rounded-[16px] px-3 py-2.5 text-sm font-semibold hover:bg-white/70 hover:text-slate-800"
            >
              <ClipboardList size={16} />
              Історія
            </button>

            <button
              onClick={() => setIsOrdering(true)}
              className={`flex items-center justify-center gap-2 rounded-[16px] px-3 py-2.5 text-sm font-semibold transition ${
                hasItems
                  ? 'soft-segment hover:bg-white/70 hover:text-slate-800'
                  : 'soft-segment cursor-not-allowed opacity-60'
              }`}
              disabled={!hasItems}
            >
              <ShoppingCart size={16} />
              Оформити
            </button>
          </div>
        </div>

        {hasItems ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="soft-surface-card rounded-[16px] px-3.5 py-3">
                <span className="text-xs text-slate-500">Всього позицій</span>
                <p className="mt-1 text-lg font-semibold text-slate-800">{cartItems.length} шт.</p>
              </div>
              <div className="soft-surface-card rounded-[16px] px-3.5 py-3 text-left sm:text-right">
                <span className="text-xs text-slate-500">Сума до оплати</span>
                <p className="mt-1 text-lg font-semibold text-emerald-600">{totalAmount} грн</p>
              </div>
            </div>

            <div className="app-panel-scroll flex max-h-[40vh] flex-col gap-3 overflow-y-auto pr-1">
              {cartItems.map((item, index) => (
                <div
                  key={item.code || index}
                  className="soft-surface-card app-panel-card-hover flex items-center justify-between gap-3 rounded-[16px] p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/katalog?search=${encodeURIComponent(
                        item.name?.replace(/\s*\(.*?\)/g, '') || ''
                      )}&filter=all`}
                      className="line-clamp-2 font-semibold text-slate-800 transition hover:text-sky-700"
                    >
                      {item.name?.replace(/\s*\(.*?\)/g, '')}
                    </Link>
                    <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                      {item.price} грн{' '}
                      <span className="text-slate-500">x {item.quantity} шт.</span>
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.code)}
                    className="soft-icon-button h-10 w-10 shrink-0 p-0 text-rose-500 hover:text-rose-600"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsOrdering(true)}
              className="soft-primary-button w-full py-3 text-sm font-semibold"
            >
              Оформити замовлення
            </button>
          </>
        ) : (
          <div className="soft-note mt-1 flex flex-col items-center gap-3 rounded-[16px] px-4 py-5 text-center text-slate-600">
            <div className="flex items-center gap-2 text-base font-bold tracking-wide text-slate-800">
              <ShoppingCart size={20} className="text-slate-500" />
              <span>Кошик порожній</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-slate-600">
              Додайте товари до кошика, щоб оформити замовлення.
            </p>
            <Link
              href="/katalog"
              className="soft-primary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
            >
              Перейти в каталог
              <Plus size={18} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Order;
