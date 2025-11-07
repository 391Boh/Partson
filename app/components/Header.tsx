'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, User, Menu, Info, MessageCircle, Car, List, Truck, CreditCard, MapPin, Users, Phone } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import SearchBar from 'app/components/Search';
import Contact from 'app/components/Contact';
import Order from 'app/components/Order';
import Login from 'app/components/Login';
import Register from 'app/components/Register';
import AccountInfo from 'app/components/AccountInfo';
import { useCart } from 'app/context/CartContext';

interface HeaderProps {
  setIsChatOpen: (open: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ setIsChatOpen }) => {
  const { cartItems } = useCart();
  const [activeMenu, setActiveMenu] = useState<string>('');
  
  const [modals, setModals] = useState({
    contact: false,
    order: false,
    login: false,
    register: false,
    accountInfo: false,
  });

  const [user, setUser] = useState<any>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveMenu('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (menu: string) => {
    setActiveMenu(prev => (prev === menu ? '' : menu));
  };

  // Відкриває лише одну модалку одночасно
  const openModal = (modalName: keyof typeof modals) => {
    setModals({
      contact: false,
      order: false,
      login: false,
      register: false,
      accountInfo: false,
      [modalName]: true,
    });
  };

  const closeModal = (modalName: keyof typeof modals) => {
    setModals(prev => ({ ...prev, [modalName]: false }));
  };

  const buttonBaseClass =
    'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300';

  const dropdownBaseClass =
    'absolute z-50 mt-2 w-56 bg-gradient-to-br from-gray-700 to-gray-800 text-white rounded-2xl border-2 border-blue-500 shadow-2xl p-3 space-y-2 animate-fadeIn';

  return (
    <header className="bg-gradient-to-b from-gray-600 to-gray-800 pl-2 text-white py-2 px-4 sm:px-6 flex items-center justify-between flex-wrap gap-y-2">
      {/* Логотип і меню */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/" className="flex items-center">
          <Image
            src="/Car-parts.png"
            alt="PartsOn Logo"
            width={0}
            height={0}
            sizes="(max-width: 768px) 100px, 120px"
            className="w-[70px] sm:w-[120px] h-auto object-contain"
          />
        </Link>

        <nav ref={navRef}>
          <ul className="flex gap-2 items-center flex-wrap">
            {/* Меню */}
            <li className="relative">
              <button
                onClick={() => toggleMenu("menu")}
                className={`${buttonBaseClass} ${activeMenu === 'menu' ? 'bg-blue-600 border-blue-300' : 'bg-gray-700 border-transparent'} border-2 shadow-inner hover:bg-gray-600 hover:border-blue-400 hover:shadow-xl`}
              >
                <Menu size={15} />
                <span className="hidden lg:inline">Меню</span>
              </button>
              {activeMenu === "menu" && (
                <ul className={`${dropdownBaseClass} absolute left-1/2 -translate-x-1/2 mt-8 w-44 z-50`}>
                  <li>
                    <Link
                      href="/katalog?tab=auto"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-in-out transform hover:bg-blue-600 hover:text-white hover:scale-105 hover:shadow-lg"
                      onClick={() => toggleMenu("")}
                    >
                      <Car size={18} />
                      <span className="hidden inline ">Обрати авто</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/katalog?tab=category"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-in-out transform hover:bg-blue-600 hover:text-white hover:scale-105 hover:shadow-lg"
                      onClick={() => toggleMenu("")}
                    >
                      <List size={18} />
                      <span className="hidden inline">Каталог</span>
                    </Link>
                  </li>
                </ul>
              )}
            </li>

            {/* Інформація */}
            <li className="relative">
              <button
                onClick={() => toggleMenu("info")}
                className={`${buttonBaseClass} ${activeMenu === 'info' ? 'bg-blue-600 border-blue-300' : 'bg-gray-700 border-transparent'} border-2 shadow-inner hover:bg-gray-600 hover:border-blue-400 hover:shadow-2xl`}
              >
                <Info size={15} />
                <span className="hidden lg:inline">Інформація</span>
              </button>
              {activeMenu === "info" && (
                <ul className={`${dropdownBaseClass} absolute left-1/2 -translate-x-1/2 mt-8 w-44 z-50`}>
                  <li>
                    <Link
                      href="/Inform?tab=delivery"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-in-out transform hover:bg-blue-600 hover:text-white hover:scale-105 hover:shadow-lg"
                      onClick={() => toggleMenu("")}
                    >
                      <Truck size={18} />
                      <span className="hidden inline">Доставка</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/Inform?tab=payment"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-in-out transform hover:bg-blue-600 hover:text-white hover:scale-105 hover:shadow-lg"
                      onClick={() => toggleMenu("")}
                    >
                      <CreditCard size={18} />
                      <span className="hidden inline">Оплата</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/Inform?tab=about"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-in-out transform hover:bg-blue-600 hover:text-white hover:scale-105 hover:shadow-lg"
                      onClick={() => toggleMenu("")}
                    >
                      <Users size={18} />
                      <span className="hidden inline">Про нас</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/Inform?tab=location"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-in-out transform hover:bg-blue-600 hover:text-white hover:scale-105 hover:shadow-lg"
                      onClick={() => toggleMenu("")}
                    >
                      <MapPin size={18} />
                      <span className="hidden inline">Локація</span>
                    </Link>
                  </li>
                </ul>
              )}
            </li>

            {/* Підтримка */}
            <li className="ml-2 hidden lg:block">
              <button
                onClick={() => {
                  // Закриваємо всі модалки
                  setModals({
                    contact: false,
                    order: false,
                    login: false,
                    register: false,
                    accountInfo: false,
                  });
                  // Відкриваємо чат
                  setIsChatOpen(true);
                  // Закриваємо меню, якщо відкрите
                  setActiveMenu('');
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-inner hover:shadow-xl hover:scale-110 hover:ring-2 hover:ring-blue-300"
              >
                <MessageCircle size={20} />
                <span className="hidden lg:inline">Онлайн підтримка</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* Пошук */}
      <div className="hidden lg:block lg:max-w-xl px-4 sm:px-2 mx-auto">
        <SearchBar onSearch={(query) => console.log(query)} />
      </div>

      {/* Дії справа */}
<nav className="flex items-center gap-2 whitespace-nowrap overflow-x-auto no-scrollbar flex-nowrap">
        <button
          onClick={() =>
            user ? openModal('accountInfo') : openModal('login')
          }
          className={`${buttonBaseClass} bg-gray-700 border-1 hover:bg-gray-600 hover:border-blue-400 shadow text-white`}
        >
          <User size={18} />
          <span className="hidden lg:inline flex-shrink-0 ">Профіль</span>
        </button>

        <button
          onClick={() => openModal('order')}
          className={`${buttonBaseClass} relative bg-gray-700 border-1 hover:bg-gray-600 hover:border-blue-400 shadow text-white`}
        >
          <ShoppingCart size={18} />
          <span className="hidden lg:inline flex-shrink-0 ">Замовлення</span>
          {cartItems.length > 0 && (
            <span className="absolute top-1 right-0 w-4 h-4 text-xs font-semibold text-white bg-orange-400 rounded-full transform translate-x-1 -translate-y-1 flex justify-center items-center">
              {cartItems.length}
            </span>
          )}
        </button>

        <button
          onClick={() => openModal('contact')}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm shadow"
        >
          <Phone size={18} />
          <span className="hidden lg:inline flex-shrink-0 ">Контакти</span>
        </button>
      </nav>

      {/* Модальні вікна */}

      {/* Contact - без закриття по бекдропу */}
      {modals.contact && (
        <div className="fixed inset-0 z-[60] flex justify-center items-center pointer-events-none">
          <div className="pointer-events-auto">
            <Contact onClose={() => closeModal('contact')} />
          </div>
        </div>
      )}

      {/* Order - без закриття по бекдропу */}
      {modals.order && (
        <div className="fixed inset-0 z-[60] flex justify-center items-center pointer-events-none">
          <div className="pointer-events-auto">
            <Order onClose={() => closeModal('order')} />
          </div>
        </div>
      )}

      {/* Login */}
      {modals.login && (
        <Login
          onClose={() => closeModal('login')}
          onShowRegister={() => openModal('register')}
        />
      )}

      {/* Register */}
      {modals.register && (
        <Register
          onClose={() => closeModal('register')}
          onShowLogin={() => openModal('login')}
        />
      )}

      {/* Account Info */}
      {modals.accountInfo && user && (
        <AccountInfo user={user} onClose={() => closeModal('accountInfo')} />
      )}
    </header>
  );
};

export default Header;
