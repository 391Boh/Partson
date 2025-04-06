"use client";

import { useEffect, useRef } from "react";
import { ShoppingCart, X } from "lucide-react";
import Link from "next/link";

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity?: number; // Додано quantity для майбутнього використання
}

interface OrderProps {
  cartItems?: CartItem[]; // Робимо cartItems необов'язковим
  onClose: () => void;
}

const Order: React.FC<OrderProps> = ({ cartItems = [], onClose }) => {
  const orderRef = useRef<HTMLDivElement>(null);

  // Закриття модального вікна при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (orderRef.current && !orderRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Розрахунок загальної суми замовлення
  const totalAmount = cartItems.reduce((total, item) => total + (item.price * (item.quantity || 1)), 0);

  return (
    <div
      ref={orderRef}
      className="absolute top-28 right-5 w-80 bg-gradient-to-br from-gray-500 to-gray-800 
                    border-2 border-gray-400 rounded-xl shadow-lg shadow-gray-500 
                    p-5 animate-fadeIn flex flex-col gap-4 z-50 contacts-container
                    shadow-inner shadow-gray-900/40"
    >
      {/* Заголовок та кнопка закриття */}
      <div className="flex justify-between items-center border-b border-gray-700 pb-3">
        <h3 className="text-gray-100 text-xl font-semibold">Ваше замовлення</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition"
        >
          <X size={24} />
        </button>
      </div>

      {/* Вміст кошика */}
      {cartItems.length > 0 ? (
        <div className="space-y-4">
          {/* Список товарів */}
          {cartItems.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center p-3 bg-gray-800 rounded-lg"
            >
              <span className="text-gray-300 font-medium">{item.name}</span>
              <span className="text-gray-400">
                {item.price} грн {item.quantity && `x ${item.quantity}`}
              </span>
            </div>
          ))}

          {/* Загальна сума */}
          <div className="flex justify-between items-center p-3 bg-gray-800 rounded-lg">
            <span className="text-gray-300 font-medium">Загалом:</span>
            <span className="text-gray-400 font-semibold">{totalAmount} грн</span>
          </div>

          {/* Кнопка оформлення замовлення */}
          <button
            className="w-full bg-green-700 text-white py-3 rounded-lg text-lg font-semibold
                       hover:bg-green-800 transition shadow-md hover:shadow-lg"
          >
            Оформити замовлення
          </button>
        </div>
      ) : (
        /* Повідомлення про порожній кошик */
        <div className="text-center text-gray-400 flex flex-col items-center gap-5">
          <ShoppingCart size={50} className="text-gray-500" />
          <p className="text-gray-300 text-lg font-medium">Кошик порожній</p>
          <p className="text-gray-400 text-sm">
            Додайте товари з каталогу, щоб оформити замовлення.
          </p>
          <Link
            href="/catalog"
            className="relative flex items-center gap-2 p-3 rounded-full text-white 
                bg-gradient-to-r from-blue-500 to-blue-600 shadow-inner shadow-blue-800/40
                transition-all duration-300 ease-in-out
                hover:shadow-xl hover:shadow-blue-900/50 
                hover:scale-110 hover:brightness-110 
                hover:ring-2 hover:ring-blue-300 hover:ring-opacity-50"
          >
            Перейти в каталог
          </Link>
        </div>
      )}
    </div>
  );
};

export default Order;