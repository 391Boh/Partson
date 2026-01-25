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

const Order: React.FC<OrderProps> = ({ onClose }) => {
  const { cartItems, removeFromCart, clearCart } = useCart();
  const hasItems = cartItems.length > 0;
  const [isOrdering, setIsOrdering] = useState(false);
  const [showPastOrders, setShowPastOrders] = useState(false);
  const [pastOrders, setPastOrders] = useState<any[]>([]);
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
        const orders = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
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
        className="fixed top-20 right-4 left-4 sm:left-auto sm:right-6 w-[92%] max-w-[460px] max-h-[70vh] bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 border border-gray-500 rounded-xl shadow-2xl p-4 z-40 flex flex-col gap-4 animate-fadeIn backdrop-blur-xl"
      >
        <div className="flex justify-between items-center pb-3 border-b border-white/10">
          <button
            onClick={() => setShowPastOrders(false)}
            className="text-slate-300 hover:text-white transition text-sm"
          >
            Назад
          </button>
          <h3 className="text-slate-100 text-xl font-bold">Попередні замовлення</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X size={22} />
          </button>
        </div>

        {!user ? (
          <div className="text-center text-white">
            <p>Будь ласка, увійдіть у свій акаунт, щоб переглянути замовлення.</p>
            <Link
              href="/login"
              className="mt-4 inline-block px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
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
                  className="bg-slate-800/70 p-3 rounded-lg text-white shadow transition hover:brightness-110 cursor-pointer"
                  onClick={() => toggleExpandOrder(order.id)}
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-sm">
                      Замовлення #{order.orderId || order.id}
                    </h4>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                  <p className="text-slate-300 text-xs">
                    {order.createdAt?.seconds
                      ? dateFormatter.format(
                          new Date(order.createdAt.seconds * 1000)
                        )
                      : '—'}
                  </p>

                  {isExpanded && (
                    <div className="space-y-3 mt-2">
                      <ul className="list-disc list-inside text-slate-300 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 text-xs">
                        {order.cartItems?.map((item: any, idx: number) => (
                          <li key={idx}>
                            {item.name} — {item.quantity} шт.
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                        <div className="flex items-center gap-1">
                          <ClipboardList size={16} />
                          <span>
                            Сума:{' '}
                            <span className="text-emerald-400 font-semibold">
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
          <div className="text-center text-white">
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
      } bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 border border-gray-500 rounded-xl shadow-2xl z-40 flex flex-col animate-fadeIn backdrop-blur-xl`}
    >
      <div className="flex justify-between items-center pb-3 border-b border-white/10">
        <h3 className="text-slate-100 text-xl font-bold">Ваше замовлення</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition">
          <X size={22} />
        </button>
      </div>

      <div className="flex justify-between gap-3">
        <button
          onClick={() => setShowPastOrders(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-white text-sm shadow hover:bg-gray-600 transition"
        >
          <ClipboardList size={18} />
          Попередні замовлення
        </button>

        {hasItems && (
          <button
            onClick={() => setIsOrdering(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm shadow-md transition-all duration-200"
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
                className="flex justify-between items-center p-3 bg-slate-800/70 rounded-lg hover:brightness-110 transition shadow"
              >
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/katalog?search=${encodeURIComponent(
                      item.name?.replace(/\s*\(.*?\)/g, '') || ''
                    )}&filter=all`}
                    className="text-white font-medium hover:underline hover:text-blue-400 transition"
                  >
                    {item.name?.replace(/\s*\(.*?\)/g, '')}
                  </Link>
                  <p className="text-slate-300 text-xs sm:text-sm">
                    {item.price} грн{' '}
                    <span className="text-slate-400">x {item.quantity} шт.</span>
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(item.code)}
                  className="text-red-400 hover:text-red-300 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="grid grid-cols-2 gap-3 bg-slate-800/60 p-3 rounded-lg">
              <div className="flex flex-col">
                <span className="text-slate-400 text-xs">Кількість товарів</span>
                <span className="text-white font-semibold text-base">
                  {cartItems.length} шт.
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-slate-400 text-xs">Сума до оплати</span>
                <span className="text-emerald-400 font-semibold text-base">
                  {totalAmount} грн
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center text-slate-300 flex flex-col items-center gap-3 mt-1.5 p-4 bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 rounded-2xl shadow-2xl border border-gray-500">
          <div className="flex items-center gap-2 text-white text-base font-bold tracking-wide">
            <ShoppingCart size={20} className="text-slate-200" />
            <span>Кошик порожній</span>
          </div>
          <p className="max-w-xs text-slate-200 text-sm leading-relaxed">
            Додайте товари з каталогу, щоб оформити замовлення.
          </p>
          <div className="flex justify-center w-full">
            <Link
              href="/katalog"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white bg-gradient-to-r from-blue-600 to-blue-800 shadow-lg hover:brightness-110 transition"
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
