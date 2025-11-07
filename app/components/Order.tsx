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
import { useEffect, useState } from 'react';
import Zamovl from './zamovl';
import { db, auth } from 'firebase.js';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

interface OrderProps {
  onClose: () => void;
}

const Order: React.FC<OrderProps> = ({ onClose }) => {
  const { cartItems, removeFromCart, clearCart } = useCart();
  const [isOrdering, setIsOrdering] = useState(false);
  const [showPastOrders, setShowPastOrders] = useState(false);
  const [pastOrders, setPastOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const totalAmount = cartItems.reduce(
    (total, item) => total + (item.price || 0) * (item.quantity || 1),
    0
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

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
        const orders = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
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
    setExpandedOrderId(prev => (prev === orderId ? null : orderId));
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
      <div className="fixed top-28 right-5 w-[90%] max-w-[520px] max-h-[75vh] overflow-y-auto bg-gradient-to-br from-gray-800 via-gray-700 to-gray-600 border-8 border-slate-700 rounded-2xl shadow-2xl p-6 z-[9999] flex flex-col gap-6 animate-fadeIn">
        <div className="flex justify-between items-center pb-4 border-b border-slate-700">
          <h3 className="text-slate-100 text-2xl font-bold">Попередні замовлення</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        {!user ? (
          <div className="text-center text-white">
            <p>Будь ласка, увійдіть у свій акаунт, щоб переглянути замовлення.</p>
            <Link href="/login" className="mt-4 inline-block px-5 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition">
              Увійти
            </Link>
          </div>
        ) : loadingOrders ? (
          <div className="loader"></div>
        ) : pastOrders.length > 0 ? (
          <div className="flex flex-col gap-4">
            {pastOrders.map(order => {
              const isExpanded = expandedOrderId === order.id;
              return (
                <div
                  key={order.id}
                  className="bg-slate-700 p-4 rounded-xl text-white shadow-lg transition hover:brightness-105 cursor-pointer"
                  onClick={() => toggleExpandOrder(order.id)}
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-sm sm:text-base">Замовлення #{order.orderId || order.id}</h4>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                  <p className="text-slate-400 text-xs sm:text-sm">
                    {order.createdAt?.seconds
                      ? new Date(order.createdAt.seconds * 1000).toLocaleString()
                      : '—'}
                  </p>

                  {isExpanded && (
                    <div className="space-y-4 mt-2">
                      <ul className="list-disc list-inside text-slate-300 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 text-sm">
                        {order.cartItems?.map((item: any, idx: number) => (
                          <li key={idx}>{item.name} — {item.quantity} шт.</li>
                        ))}
                      </ul>

                      <div className="flex flex-wrap gap-4 text-xs sm:text-sm text-slate-300">
                        <div className="flex items-center gap-1">
                          <ClipboardList size={16} />
                          <span>Сума: <span className="text-emerald-400 font-semibold">{order.totalAmount || order.total} грн</span></span>
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
            <p>У вас ще немає минулих замовлень.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed top-28 right-5 w-[90%] max-w-[520px] max-h-[75vh] overflow-y-auto bg-gradient-to-br from-gray-800 via-gray-700 to-gray-600 border-8 border-slate-700 rounded-2xl shadow-2xl p-6 z-[9999] flex flex-col gap-4 animate-fadeIn">
      <div className="flex justify-between items-center pb-4 border-b border-slate-700">
        <h3 className="text-slate-100 text-2xl font-bold">Ваше замовлення</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition">
          <X size={24} />
        </button>
      </div>

      {/* Кнопки "Попередні замовлення" та "Підтвердити" */}
      <div className="flex justify-between gap-4 mb-4">
        <button
          onClick={() => setShowPastOrders(true)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gray-700 text-white shadow hover:bg-gray-600 transition duration-300 hover:scale-105"
        >
          <ClipboardList size={20} />
          Попередні замовлення
        </button>

        {cartItems.length > 0 && (
      <button
  onClick={() => setIsOrdering(true)}
  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-md transition-all duration-200 transform hover:scale-105"
>
  <ShoppingCart size={20} />
  <span className="font-medium">Підтвердити</span>
</button>

        )}
      </div>

      {cartItems.length > 0 ? (
        <>
          <div className="flex-grow overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {cartItems.map((item, index) => (
              <div
                key={item.code || index}
                className="flex justify-between items-center p-4 bg-slate-700 rounded-xl hover:brightness-110 transition shadow"
              >
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/katalog?search=${encodeURIComponent(item.name?.replace(/\s*\(.*?\)/g, '') || '')}&filter=all`}
                    className="text-white font-medium hover:underline hover:text-blue-400 transition"
                  >
                    {item.name?.replace(/\s*\(.*?\)/g, '')}
                  </Link>
                  <p className="text-slate-300 text-sm">
                    {item.price} грн <span className="text-slate-400">x {item.quantity} шт.</span>
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(item.code)}
                  className="text-red-500 hover:text-red-300 transition"
                >
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3 mt-4 border-t border-slate-700 pt-4">
            <div className="grid grid-cols-2 gap-4 bg-slate-800 p-4 rounded-lg">
              <div className="flex flex-col">
                <span className="text-slate-400 text-sm">Найменувань</span>
                <span className="text-white font-semibold text-lg">{cartItems.length} шт.</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-slate-400 text-sm">Сума до сплати</span>
                <span className="text-emerald-400 font-semibold text-lg">{totalAmount} грн</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center text-slate-400 flex flex-col items-center gap-8 mt-2 p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 rounded-3xl shadow-2xl border border-gray-600">
          <ShoppingCart size={80} className="text-slate-500 animate-pulse" />
          <p className="text-white text-2xl font-extrabold tracking-wide">Кошик порожній</p>
          <p className="max-w-xs text-slate-300 text-base leading-relaxed">
            Додайте товари з каталогу, щоб оформити замовлення.
          </p>
          <div className="flex justify-center w-full mt-3">
            <Link
              href="/katalog"
              className="inline-flex items-center gap-3 px-6 py-3 rounded-full text-white bg-gradient-to-r from-blue-600 to-blue-800 shadow-lg hover:scale-110 hover:brightness-125 transition-transform duration-300"
            >
              Додати товари
              <Plus size={20} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Order;
