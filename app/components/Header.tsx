'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, User, Menu, Search, Phone, Info, MessageCircle } from 'lucide-react';
import { Car, List, Truck, CreditCard, MapPin, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { auth } from 'firebase';
import SearchBar from 'app/components/serch';
import Data from 'app/components/Data';
import Contact from 'app/components/Contact';
import Order from 'app/components/Order';
import Login from 'app/components/Login';
import Register from 'app/components/Register';
import AccountInfo from 'app/components/AccountInfo';
import katalog from 'app/katalog/page';
import InformationPage from 'app/Inform/page';

// Типізація пропсів
interface HeaderProps {
  setIsChatOpen: (open: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ setIsChatOpen }) => {
  const [activeMenu, setActiveMenu] = useState<string>(""); // Без null
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const navRef = useRef<HTMLDivElement>(null);

  // Слідкуємо за змінами автентифікації користувача
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  // Тогл для меню
  const toggleMenu = (menu: string) => {
    setActiveMenu(menu === activeMenu ? "" : menu);
  };

  // Закриваємо меню при натисканні поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveMenu(""); // Тут теж "" замість null
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header className="bg-gradient-to-b from-gray-600 to-gray-800 text-white p-4 flex justify-between items-center relative">
      {/* Логотип */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center">
          <Image src="/Car-parts.svg" alt="PartsOn Logo" width={120} height={40} priority />
        </Link>
        <nav ref={navRef}>
          <ul className="flex gap-6 items-center relative">
            
{/* Меню */}
<li className="relative">
  <button
    onClick={() => toggleMenu("menu")}
    className={`flex items-center gap-2 p-3 rounded-lg border transition-all duration-300 
      ${activeMenu === "menu" ? "bg-gray-600 border-blue-500" : "bg-gray-700 border-transparent"}
      text-white shadow-md hover:bg-gray-600 hover:border-gray-500 hover:shadow-lg`}
  >
    <Menu size={20} />
    <span>Меню</span>
  </button>

  {activeMenu === "menu" && (
    <ul className="punmenu">
      <li>
        <Link
          href="/katalog?tab=auto"
          className="btn-primary flex items-center gap-2"
          onClick={() => toggleMenu("")}
        >
          <Car size={20} /> Обрати авто
        </Link>
      </li>
      <li>
        <Link
          href="/katalog?tab=category"
          className="btn-primary flex items-center gap-2"
          onClick={() => toggleMenu("")}
        >
          <List size={20} /> Каталог
        </Link>
      </li>
    </ul>
  )}
</li>


<li className="relative">
  <button
    onClick={() => toggleMenu("info")}
    className={`flex items-center gap-2 p-3 rounded-lg border transition-all duration-300 
      ${activeMenu === "info" ? "bg-gray-600 border-blue-500" : "bg-gray-700 border-transparent"}
      text-white shadow-md hover:bg-gray-600 hover:border-gray-500 hover:shadow-lg`}
  >
    <Info size={20} />
    <span>Інформація</span>
  </button>

  {activeMenu === "info" && (
    <ul className="punmenu">
      <li>
        <Link
          href="/Inform?tab=delivery"
          className="btn-primary flex items-center gap-2"
          onClick={() => toggleMenu("")} // Закриває меню
        >
          <Truck size={20} /> Доставка
        </Link>
      </li>
      <li>
        <Link
          href="/Inform?tab=payment"
          className="btn-primary flex items-center gap-2"
          onClick={() => toggleMenu("")}
        >
          <CreditCard size={20} /> Оплата
        </Link>
      </li>
      <li>
        <Link
          href="/Inform?tab=about"
          className="btn-primary flex items-center gap-2"
          onClick={() => toggleMenu("")}
        >
          <Users size={20} /> Про нас
        </Link>
      </li>
      <li>
        <Link
          href="/Inform?tab=location"
          className="btn-primary flex items-center gap-2"
          onClick={() => toggleMenu("")}
        >
          <MapPin size={20} /> Локація
        </Link>
      </li>
    </ul>
  )}
</li>


            {/* Кнопка онлайн підтримки в хедері */}
            <li>
              <button
                onClick={() => setIsChatOpen(true)}
                className="flex items-center gap-2 p-3 rounded-full text-white 
                bg-gradient-to-r from-blue-500 to-blue-600 shadow-inner shadow-blue-800/40 
                hover:shadow-xl hover:scale-110 hover:ring-2 hover:ring-blue-300"
              >
                <MessageCircle size={24} />
                <span>Онлайн підтримка</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* Поле пошуку */}
      <SearchBar onSearch={(query) => console.log(query)} />

      {/* Профіль, Замовлення та Контакти */}
      <nav>
        <ul className="flex gap-6 items-center">
          <li>
            <button
              onClick={() => {
                if (user) {
                  setShowAccountInfo(true);
                } else {
                  setShowLogin(true);
                }
              }}
              className="menu-button flex items-center gap-2 p-3 rounded-lg bg-gray-700 text-white shadow-md hover:bg-gray-600"
            >
              <User size={20} />
              <span>Профіль</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setIsOrderOpen(true)}
              className="menu-button flex items-center gap-2 p-3 rounded-lg bg-gray-700 text-white shadow-md hover:bg-gray-600"
            >
              <ShoppingCart size={20} />
              <span>Замовлення</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setIsContactOpen(true)}
              className="flex items-center gap-3 px-5 py-3 bg-red-600 text-white text-lg rounded-xl hover:bg-red-500 shadow-md"
            >
              <Phone size={22} />
              <span>Контакти</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* Відображення модальних вікон */}
      {isContactOpen && <Contact onClose={() => setIsContactOpen(false)} />}
      {isOrderOpen && <Order onClose={() => setIsOrderOpen(false)} />}
      {showLogin && <Login onClose={() => setShowLogin(false)} onShowRegister={() => setShowRegister(true)} />}
      {showRegister && <Register onClose={() => setShowRegister(false)} onShowLogin={() => setShowLogin(true)} />}
      {showAccountInfo && user && <AccountInfo user={user} onClose={() => setShowAccountInfo(false)} />}
    </header>
  );
};

export default Header;
