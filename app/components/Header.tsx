'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart, User, Menu, Info, Car,
  List, Truck, CreditCard, MapPin, Users, Phone, Search
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import SearchBar from 'app/components/Search';
import { useCart } from 'app/context/CartContext';
import { XMarkIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

const Contact = dynamic(() => import('app/components/Contact'), { ssr: false });
const Order = dynamic(() => import('app/components/Order'), { ssr: false });
const AuthModal = dynamic(() => import('app/components/AuthModal'), { ssr: false });

interface HeaderProps {
  setIsChatOpen: (open: boolean) => void;
  isAdmin?: boolean;
}

const Header: React.FC<HeaderProps> = ({ setIsChatOpen: _setIsChatOpen }) => {
  const { cartItems } = useCart();

  const [user, setUser] = useState<any | null>(null);
  const [activeMenu, setActiveMenu] = useState<string>('');
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [authInitialTab, setAuthInitialTab] = useState<
    'profile' | 'vins' | 'security' | null
  >(null);
  const [modals, setModals] = useState({
    contact: false,
    order: false,
    auth: false,
  });

  const navRef = useRef<HTMLDivElement>(null);
  const searchModalRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const auth = getAuth();
  const pathname = usePathname();
  const router = useRouter();

  // AUTH LISTENER
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser ?? null);
    });
    return () => unsub();
  }, [auth]);

  // CLOSE MENUS ON CLICK OUTSIDE
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveMenu('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setActiveMenu('');
    setShowSearchModal(false);
    setModals({ contact: false, order: false, auth: false });
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const isSlowConnection =
      Boolean(connection?.saveData) ||
      (typeof connection?.effectiveType === 'string' &&
        connection.effectiveType.includes('2g'));
    if (isSlowConnection) return;

    type RequestIdleCallback = (cb: () => void, opts?: { timeout: number }) => number;
    const idle = (window as Window & { requestIdleCallback?: RequestIdleCallback })
      .requestIdleCallback;
    let idleId: number | null = null;
    let timerId: number | null = null;
    let loadListener: (() => void) | null = null;

    const prefetch = () => {
      router.prefetch('/katalog?tab=auto');
      router.prefetch('/katalog?tab=category');
      router.prefetch('/inform?tab=delivery');
      router.prefetch('/inform?tab=payment');
      router.prefetch('/inform?tab=about');
      router.prefetch('/inform?tab=location');
    };

    const schedulePrefetch = () => {
      if (typeof idle === 'function') {
        idleId = idle(prefetch, { timeout: 2000 });
      } else {
        timerId = window.setTimeout(prefetch, 1500);
      }
    };

    if (document.readyState === 'complete') {
      schedulePrefetch();
    } else {
      const handleLoad = () => schedulePrefetch();
      window.addEventListener('load', handleLoad, { once: true });
      loadListener = handleLoad;
    }

    return () => {
      if (loadListener) {
        window.removeEventListener('load', loadListener);
      }
      if (timerId != null) window.clearTimeout(timerId);
      if (idleId != null && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleId
        );
      }
    };
  }, [router]);

  useEffect(() => {
    const handleCloseOverlays = () => {
      setActiveMenu('');
      setShowSearchModal(false);
      setModals({ contact: false, order: false, auth: false });
      setAuthInitialTab(null);
    };

    window.addEventListener('closeOverlays', handleCloseOverlays);
    return () => window.removeEventListener('closeOverlays', handleCloseOverlays);
  }, []);

  useEffect(() => {
    const handleOpenOrder = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('closeExternalOverlays'));
      }
      setActiveMenu('');
      setShowSearchModal(false);
      setModals({ contact: false, order: true, auth: false });
      setAuthInitialTab(null);
    };

    window.addEventListener('openOrderModal', handleOpenOrder);
    return () => window.removeEventListener('openOrderModal', handleOpenOrder);
  }, []);

  useEffect(() => {
    if (!showSearchModal) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (searchModalRef.current?.contains(target)) return;
      if (searchButtonRef.current?.contains(target)) return;
      setShowSearchModal(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showSearchModal]);

  const resetOverlays = () => {
    setActiveMenu('');
    setModals({ contact: false, order: false, auth: false });
    setAuthInitialTab(null);
  };

  const closeExternalOverlays = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('closeExternalOverlays'));
    }
  };

  const toggleMenu = (menu: string) => {
    closeExternalOverlays();
    setShowSearchModal(false);
    setModals({ contact: false, order: false, auth: false });
    setAuthInitialTab(null);
    setActiveMenu(prev => (prev === menu ? '' : menu));
  };

  const openCatalogTab = (tab: 'auto' | 'category') => {
    closeExternalOverlays();
    setShowSearchModal(false);
    setModals({ contact: false, order: false, auth: false });
    setAuthInitialTab(null);
    setActiveMenu('');
    router.push(`/katalog?tab=${tab}&reset=1`);
  };

  const openModal = (name: keyof typeof modals) => {
    closeExternalOverlays();
    setShowSearchModal(false);
    setModals({ contact: false, order: false, auth: false, [name]: true });
    if (name === 'auth') {
      setAuthInitialTab(null);
    }
  };

  const toggleModal = (name: keyof typeof modals) => {
    closeExternalOverlays();
    setShowSearchModal(false);
    setModals((prev) => {
      const next = { contact: false, order: false, auth: false };
      return prev[name] ? next : { ...next, [name]: true };
    });
    if (name === 'auth') {
      setAuthInitialTab(null);
    }
  };

  const toggleSearchModal = () => {
    setShowSearchModal((prev) => {
      if (!prev) {
        closeExternalOverlays();
        resetOverlays();
      }
      return !prev;
    });
  };

  const closeModal = (name: keyof typeof modals) => {
    setModals(prev => ({ ...prev, [name]: false }));
    if (name === 'auth') {
      setAuthInitialTab(null);
    }
  };

  useEffect(() => {
    const handleOpenAccountVin = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('closeExternalOverlays'));
      }
      setActiveMenu('');
      setShowSearchModal(false);
      setAuthInitialTab('vins');
      setModals({ contact: false, order: false, auth: true });
    };

    window.addEventListener('openAccountVin', handleOpenAccountVin);
    return () => window.removeEventListener('openAccountVin', handleOpenAccountVin);
  }, []);

  const buttonBaseClass =
    'flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-medium rounded-lg border border-white/15 transition-all whitespace-nowrap bg-gray-700 hover:bg-gray-600 hover:border-white/35 cursor-pointer touch-manipulation active:scale-[0.98] select-none';


  const dropdownBaseClass =
    'absolute z-50 mt-3 w-52 bg-gray-700 p-2 text-white rounded-2xl border-2 border-gray-500 shadow-xl py-2 backdrop-blur-sm select-none transition-all duration-150 ease-out origin-top';

  const dropdownItemClass =
    'flex items-center gap-3 px-4 py-2 text-sm rounded-xl hover:bg-gray-600 cursor-pointer transition-transform active:scale-[0.98] select-none';

  return (
    <header
      suppressHydrationWarning
      className="bg-gradient-to-b from-gray-600 to-gray-800 h-16 text-white px-4 flex items-center justify-center relative z-50"
    >

      <div className="w-full max-w-[1400px] flex items-center justify-between gap-6">

        {/* LEFT SECTION */}
        <div className="flex items-center gap-4 flex-shrink-0">

          {/* LOGO */}
          <Link
            href="/"
            aria-label="Головна сторінка"
            className="group relative flex items-center"
          >
            <Image
              src="/Car-parts.png"
              alt="PartsOn Logo"
              width={70}
              height={40}
              className="w-[65px] md:w-[85px] h-auto object-contain"
            />
            <span className="pointer-events-none absolute left-4 sm:left-1/2 top-full z-50 mt-2.5 sm:-translate-x-1/2 translate-y-1 whitespace-nowrap rounded-xl border border-slate-200/70 bg-gradient-to-r from-white/95 via-sky-50/95 to-indigo-50/90 pl-3.5 pr-2.5 pt-1.5 pb-1 text-[10px] font-semibold text-slate-900 opacity-0 shadow-[0_10px_22px_rgba(15,23,42,0.16)] backdrop-blur-md ring-1 ring-white/60 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
              Головна сторінка
            </span>
          </Link>

          {/* NAVIGATION */}
          <nav ref={navRef} className="relative select-none">
            <ul className="flex gap-3 items-center">

              {/* MENU BUTTON */}
              <li className="relative select-none">
                <button
                  data-overlay-toggle="menu"
                  onClick={() => toggleMenu("menu")}
                  className={`${buttonBaseClass} ${
                    activeMenu === "menu"
                      ? 'border-sky-400/80 bg-sky-500/20'
                      : 'border-white/15'
                  }`}
                >
                  <Menu size={16} className="sm:size-4" />
                  <span className="hidden md:inline cursor-pointer select-none">Меню</span>
                </button>

                <ul className={`${dropdownBaseClass} left-1/2 -translate-x-1/2 mt-6 ${
                    activeMenu === "menu"
                      ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                  }`}>
                  <li>
                    <button
                      type="button"
                      onClick={() => openCatalogTab('auto')}
                      className={`${dropdownItemClass} w-full`}
                    >
                      <Car size={18} /> Авто
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => openCatalogTab('category')}
                      className={`${dropdownItemClass} w-full`}
                    >
                      <List size={18} /> Каталог
                    </button>
                  </li>
                </ul>
              </li>

              {/* INFO BUTTON */}
              <li className="relative select-none">
                <button
                  data-overlay-toggle="info"
                  onClick={() => toggleMenu("info")}
                  className={`${buttonBaseClass} ${
                    activeMenu === "info"
                      ? 'border-sky-400/80 bg-sky-500/20'
                      : 'border-white/15'
                  }`}
                >
                  <Info size={16} className="sm:size-4 " />
                  <span className="hidden md:inline cursor-pointer select-none">Інформація</span>
                </button>

                <ul className={`${dropdownBaseClass} left-1/2 -translate-x-1/2 mt-6 ${
                    activeMenu === "info"
                      ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                  }`}>
                    <li><Link href="/inform?tab=delivery" onClick={() => setActiveMenu('')} className={dropdownItemClass}><Truck size={18} /> Доставка</Link></li>
                    <li><Link href="/inform?tab=payment" onClick={() => setActiveMenu('')} className={dropdownItemClass}><CreditCard size={18} /> Оплата</Link></li>
                    <li><Link href="/inform?tab=about" onClick={() => setActiveMenu('')} className={dropdownItemClass}><Users size={18} /> Про нас</Link></li>
                    <li><Link href="/inform?tab=location" onClick={() => setActiveMenu('')} className={dropdownItemClass}><MapPin size={18} /> Локація</Link></li>
                  </ul>
              </li>

            </ul>
          </nav>

        </div>

        {/* SEARCH CENTER */}
        <div className="flex-1 flex justify-center">
          <div className="hidden lg:block w-full max-w-[380px]">
            <SearchBar onSearch={(q) => console.log(q)} />
          </div>

          <button
            className={`lg:hidden ${buttonBaseClass} ${
              showSearchModal
                ? 'border-rose-300/70 bg-rose-500/15 text-rose-100'
                : 'border-white/10 bg-gray-700/60 text-slate-100'
            }`}
            onClick={toggleSearchModal}
            ref={searchButtonRef}
          >
            <Search size={18} className="text-current" />
          </button>
        </div>

        {/* RIGHT BUTTONS */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* ACCOUNT */}
          <button
            data-overlay-toggle="auth"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleModal('auth');
            }}
            className={`${buttonBaseClass} ${
              modals.auth
                ? 'border-sky-400/80 bg-sky-500/20'
                : 'border-white/15'
            }`}
          >
            <User size={16} className="sm:size-4" />
            <span className="hidden sm:inline cursor-pointer select-none">Профіль</span>
          </button>

          {/* CART */}
          <button
            data-overlay-toggle="order"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleModal('order');
            }}
            className={`${buttonBaseClass} relative ${
              modals.order ? 'border-sky-400/80 bg-sky-500/20' : 'border-white/15'
            }`}
          >
            <ShoppingCart size={16} className="sm:size-4" />
            <span className="hidden sm:inline cursor-pointer select-none">Замовлення</span>

            {cartItems.length > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 text-xs bg-orange-500 text-white rounded-full flex justify-center items-center font-bold">
                {cartItems.length}
              </span>
            )}
          </button>

          {/* PHONE */}
          <button
            data-overlay-toggle="contact"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleModal('contact');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-red-300/40 bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:via-red-400 hover:to-red-500 text-white font-semibold shadow-sm shadow-red-500/30 cursor-pointer touch-manipulation ${
              modals.contact ? 'ring-2 ring-red-300/60' : ''
            }`}
          >
            <Phone size={18} className="sm:size-5" />
            <span className="hidden sm:inline cursor-pointer select-none">Контакти</span>
          </button>
        </div>
      </div>

      {/* SEARCH MODAL */}
      {showSearchModal && (
        <div
          ref={searchModalRef}
          className="fixed top-20 left-2 right-2 sm:left-auto sm:right-6 w-auto sm:w-[80%] max-w-[420px] z-[70] rounded-2xl sm:rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 shadow-2xl border border-gray-500 animate-fadeIn"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MagnifyingGlassIcon className="w-5 h-5 text-blue-400" />
              Пошук
            </h2>
            <button onClick={() => setShowSearchModal(false)} className="text-gray-400 hover:text-white">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
            <SearchBar onSearch={() => setShowSearchModal(false)} />
          </div>
        </div>
      )}

      {/* MODALS */}
      {modals.contact && <Contact onClose={() => closeModal('contact')} />}
      {modals.order && <Order onClose={() => closeModal('order')} />}
      {modals.auth && (
        <AuthModal
          isOpen={modals.auth}
          user={user}
          initialAccountTab={authInitialTab}
          onClose={() => closeModal('auth')}
        />
      )}

    </header>
  );
};

export default Header;

