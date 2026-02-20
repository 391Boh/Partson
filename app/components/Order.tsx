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
          ...(doc.data() as Omit<PastOrder, "id">),
        }));
        setPastOrders(orders);
      } catch (error) {
        console.error('Помилка при завантаженні замовлень:', error);
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
        className="fixed left-4 right-4 top-20 z-40 flex max-h-[70vh] w-[92%] max-w-[460px] flex-col gap-4 rounded-2xl border border-sky-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.96)_52%,rgba(224,242,254,0.94)_100%)] p-4 shadow-[0_24px_60px_rgba(30,64,175,0.22)] backdrop-blur-xl animate-fadeIn sm:left-auto sm:right-6"
      >
        <div className="flex items-center justify-between border-b border-sky-200/70 pb-3">
          <button
            onClick={() => setShowPastOrders(false)}
            className="text-sm font-medium text-slate-600 transition hover:text-slate-800"
          >
            Назад
          </button>
          <h3 className="text-xl font-bold tracking-tight text-slate-800">Попередні замовлення</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-sky-200 bg-white p-1 text-slate-500 transition hover:bg-sky-50 hover:text-slate-700 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {!user ? (
          <div className="text-center text-slate-700">
            <p>Будь ласка, увійдіть у свій акаунт, щоб переглянути замовлення.</p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-white shadow-[0_10px_22px_rgba(59,130,246,0.3)] transition hover:brightness-110"
            >
              Увійти
            </Link>
          </div>
        ) : loadingOrders ? (
          <div className="loader"></div>
        ) : pastOrders.length > 0 ? (
          <div className="flex flex-col gap-3 max-h-[52vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {pastOrders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              return (
                <div
                  key={order.id}
                  className="cursor-pointer rounded-lg border border-sky-200/70 bg-white/92 p-3 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:border-sky-300/80"
                  onClick={() => toggleExpandOrder(order.id)}
                >
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold text-slate-800">
                      Замовлення #{order.orderId || order.id}
                    </h4>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                  <p className="text-xs text-slate-500">
                    {order.createdAt?.seconds
                      ? dateFormatter.format(
                          new Date(order.createdAt.seconds * 1000)
                        )
                      : '—'}
                  </p>

                  {isExpanded && (
                    <div className="space-y-3 mt-2">
                      <ul className="max-h-40 list-inside list-disc overflow-y-auto text-xs text-slate-600 scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-transparent">
                        {order.cartItems?.map((item: PastOrderItem, idx: number) => (
                          <li key={idx}>
                            {item.name} — {item.quantity} шт.
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <ClipboardList size={16} />
                          <span>
                            Сума:{' '}
                            <span className="font-semibold text-emerald-600">
                              {order.totalAmount || order.total} грн
                            </span>
                          </span>
                        </div>
                        {order.deliveryMethod && (
                          <div className="flex items-center gap-1">
                            <Truck size={16} />
                            <span>Доставка: {order.deliveryMethod}</span>
                          </div>
                        )}
                        {order.warehouse && (
                          <div className="flex items-center gap-1">
                            <PackageCheck size={16} />
                            <span>Відділення: {order.warehouse}</span>
                          </div>
                        )}
                        {order.paymentMethod && (
                          <div className="flex items-center gap-1">
                            <CreditCard size={16} />
                            <span>Оплата: {order.paymentMethod}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-600">
            <p>У вас ще немає замовлень.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={orderRef}
      className={`fixed top-20 right-4 left-4 sm:left-auto sm:right-6 w-[92%] max-w-[460px] ${
        hasItems ? 'max-h-[80vh] p-4 gap-4' : 'max-h-[55vh] p-3 gap-3'
      } z-40 flex flex-col rounded-2xl border border-sky-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.96)_52%,rgba(224,242,254,0.94)_100%)] shadow-[0_24px_60px_rgba(30,64,175,0.22)] animate-fadeIn backdrop-blur-xl`}
    >
      <div className="flex items-center justify-between border-b border-sky-200/70 pb-3">
        <h3 className="text-xl font-bold tracking-tight text-slate-800">Ваше замовлення</h3>
        <button onClick={onClose} className="rounded-full border border-sky-200 bg-white p-1 text-slate-500 transition hover:bg-sky-50 hover:text-slate-700">
          <X size={18} />
        </button>
      </div>

      <div className="flex justify-between gap-3">
        <button
          onClick={() => setShowPastOrders(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:bg-sky-50"
        >
          <ClipboardList size={18} />
          Попередні замовлення
        </button>

        {hasItems && (
          <button
            onClick={() => setIsOrdering(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm text-white shadow-[0_10px_22px_rgba(59,130,246,0.3)] transition-all duration-200 hover:brightness-110"
          >
            <ShoppingCart size={18} />
            <span className="font-medium">Оформити</span>
          </button>
        )}
      </div>

      {hasItems ? (
        <>
          <div className="flex-grow overflow-y-auto pr-2 space-y-3 max-h-[40vh] scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {cartItems.map((item, index) => (
              <div
                key={item.code || index}
                className="flex items-center justify-between rounded-lg border border-sky-200/70 bg-white/92 p-3 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-sky-300/80"
              >
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/katalog?search=${encodeURIComponent(
                      item.name?.replace(/\s*\(.*?\)/g, '') || ''
                    )}&filter=all`}
                    className="font-medium text-slate-800 transition hover:text-blue-700 hover:underline"
                  >
                    {item.name?.replace(/\s*\(.*?\)/g, '')}
                  </Link>
                  <p className="text-xs text-slate-600 sm:text-sm">
                    {item.price} грн{' '}
                    <span className="text-slate-500">x {item.quantity} шт.</span>
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(item.code)}
                  className="text-rose-500 transition hover:text-rose-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-sky-200/70 pt-3">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-sky-200/70 bg-white/90 p-3">
              <div className="flex flex-col">
                <span className="text-xs text-slate-500">Кількість товарів</span>
                <span className="text-base font-semibold text-slate-700">
                  {cartItems.length} шт.
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-slate-500">Сума до оплати</span>
                <span className="text-base font-semibold text-emerald-600">
                  {totalAmount} грн
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-1.5 flex flex-col items-center gap-3 rounded-2xl border border-sky-200/70 bg-white/92 p-4 text-center text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.1)]">
          <div className="flex items-center gap-2 text-base font-bold tracking-wide text-slate-800">
            <ShoppingCart size={20} className="text-slate-500" />
            <span>Кошик порожній</span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-slate-600">
            Додайте товари з каталогу, щоб оформити замовлення.
          </p>
          <div className="flex justify-center w-full">
            <Link
              href="/katalog"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-white shadow-[0_10px_22px_rgba(59,130,246,0.3)] transition hover:brightness-110"
            >
              Додати товари
              <Plus size={18} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Order;
