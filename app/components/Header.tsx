'use client';

import React, { useState, useEffect, useRef, type ComponentType } from 'react';
import {
  ShoppingCart, User, Menu, Info, Car,
  List, Truck, CreditCard, MapPin, Users, Phone, Search
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Auth, User as FirebaseUser } from 'firebase/auth';
import { useCart } from 'app/context/CartContext';
import { XMarkIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { createPortal } from 'react-dom';

type AppRouterInstance = ReturnType<typeof useRouter>;

const CATALOG_PREFETCH_ROUTES = [
  '/katalog',
  '/katalog?tab=auto',
  '/katalog?tab=category',
] as const;

const INFO_PREFETCH_ROUTES = [
  '/inform/delivery',
  '/inform/payment',
  '/inform/about',
  '/inform/location',
] as const;

const prefetchRouteList = (
  router: AppRouterInstance,
  prefetchedRoutes: Set<string>,
  routes: readonly string[]
) => {
  for (const route of routes) {
    if (prefetchedRoutes.has(route)) continue;
    prefetchedRoutes.add(route);
    router.prefetch(route);
  }
};

type ContactComponentProps = {
  onClose: () => void;
};

type OrderComponentProps = {
  onClose: () => void;
};

type AuthModalComponentProps = {
  isOpen: boolean;
  user: FirebaseUser | null;
  initialMode?: 'login' | 'register';
  initialAccountTab?: 'profile' | 'vins' | 'security' | null;
  onClose: () => void;
};

type SearchBarComponentProps = {
  onSearch: (
    searchQuery: string,
    filterBy: 'all' | 'article' | 'name' | 'code' | 'producer'
  ) => void;
};

type RequestIdleCallback = (callback: () => void, options?: { timeout: number }) => number;

type HeaderAuthDeps = {
  auth: Auth;
  onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged;
};

let headerAuthDepsPromise: Promise<HeaderAuthDeps> | null = null;

const loadHeaderAuthDeps = () => {
  headerAuthDepsPromise ??= Promise.all([
    import('../../firebase'),
    import('firebase/auth'),
  ]).then(([firebaseModule, authModule]) => ({
    auth: firebaseModule.auth,
    onAuthStateChanged: authModule.onAuthStateChanged,
  }));

  return headerAuthDepsPromise;
};

const Header: React.FC = () => {
  const { cartItems } = useCart();
  const logoFallbackPath = '/favicon-192x192.png';
  const [hasMounted, setHasMounted] = useState(false);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [activeMenu, setActiveMenu] = useState<string>('');
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register' | undefined>(
    undefined
  );
  const [authInitialTab, setAuthInitialTab] = useState<
    'profile' | 'vins' | 'security' | null
  >(null);
  const [modals, setModals] = useState({
    contact: false,
    order: false,
    auth: false,
  });
  const [ContactComponent, setContactComponent] =
    useState<ComponentType<ContactComponentProps> | null>(null);
  const [OrderComponent, setOrderComponent] =
    useState<ComponentType<OrderComponentProps> | null>(null);
  const [AuthModalComponent, setAuthModalComponent] =
    useState<ComponentType<AuthModalComponentProps> | null>(null);
  const [SearchBarComponent, setSearchBarComponent] =
    useState<ComponentType<SearchBarComponentProps> | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());
  const skipManualPrefetchRef = useRef(false);

  const navRef = useRef<HTMLDivElement>(null);
  const searchModalRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname() || "";
  const router = useRouter();

  const prefetchCatalogRoutes = () => {
    if (skipManualPrefetchRef.current) return;
    prefetchRouteList(router, prefetchedRoutesRef.current, CATALOG_PREFETCH_ROUTES);
  };

  const prefetchInfoRoutes = () => {
    if (skipManualPrefetchRef.current) return;
    prefetchRouteList(router, prefetchedRoutesRef.current, INFO_PREFETCH_ROUTES);
  };

  // AUTH LISTENER
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void loadHeaderAuthDeps()
      .then(({ auth, onAuthStateChanged }) => {
        if (cancelled) return;
        setUser(auth.currentUser ?? null);
        unsubscribe = onAuthStateChanged(auth, (authUser) => {
          setUser(authUser ?? null);
        });
      })
      .catch((error) => {
        console.error('Failed to load header auth deps:', error);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (SearchBarComponent) return;

    let cancelled = false;
    const win = window as Window & {
      requestIdleCallback?: RequestIdleCallback;
      cancelIdleCallback?: (id: number) => void;
    };
    const loadSearch = () => {
      void import('app/components/Search').then((module) => {
        if (!cancelled) {
          setSearchBarComponent(() => module.default);
        }
      });
    };
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(loadSearch, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(loadSearch, 320);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [SearchBarComponent]);

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
    const frameId = window.requestAnimationFrame(() => {
      setActiveMenu('');
      setShowSearchModal(false);
      setModals({ contact: false, order: false, auth: false });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    skipManualPrefetchRef.current =
      Boolean(connection?.saveData) ||
      (typeof connection?.effectiveType === 'string' &&
        connection.effectiveType.includes('2g'));
  }, []);

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
    setAuthInitialMode(undefined);
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
    if (menu === 'menu') prefetchCatalogRoutes();
    if (menu === 'info') prefetchInfoRoutes();
    setActiveMenu(prev => (prev === menu ? '' : menu));
  };

  const openCatalogTab = (tab: 'auto' | 'category') => {
    prefetchCatalogRoutes();
    closeExternalOverlays();
    setShowSearchModal(false);
    setModals({ contact: false, order: false, auth: false });
    setAuthInitialTab(null);
    setActiveMenu('');
    router.push(`/katalog?tab=${tab}&reset=1`);
  };

  const toggleModal = (name: keyof typeof modals) => {
    closeExternalOverlays();
    setShowSearchModal(false);
    setModals((prev) => {
      const next = { contact: false, order: false, auth: false };
      return prev[name] ? next : { ...next, [name]: true };
    });
    if (name === 'auth') {
      setAuthInitialMode(undefined);
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
      setAuthInitialMode(undefined);
      setAuthInitialTab(null);
    }
  };

  const handleLogoLoadError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied === '1') return;
    image.dataset.fallbackApplied = '1';
    image.src = logoFallbackPath;
  };

  const preventLogoAssetInteraction = (
    event:
      | React.ClipboardEvent<HTMLElement>
      | React.DragEvent<HTMLElement>
      | React.MouseEvent<HTMLElement>
  ) => {
    event.preventDefault();
  };

  const handleBrandClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== '/') return;

    if (window.scrollY > 0) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

  useEffect(() => {
    const handleOpenAuthModal = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          initialMode?: 'login' | 'register';
          initialAccountTab?: 'profile' | 'vins' | 'security' | null;
        }>
      ).detail;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('closeExternalOverlays'));
      }

      setActiveMenu('');
      setShowSearchModal(false);
      setAuthInitialMode(detail?.initialMode ?? 'login');
      setAuthInitialTab(detail?.initialAccountTab ?? null);
      setModals({ contact: false, order: false, auth: true });
    };

    window.addEventListener('openAuthModal', handleOpenAuthModal);
    return () => window.removeEventListener('openAuthModal', handleOpenAuthModal);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setHasMounted(true);
      if (typeof document !== 'undefined') {
        setPortalRoot(document.body);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!modals.contact || ContactComponent) return;

    let cancelled = false;
    void import('./Contact').then((module) => {
      if (!cancelled) {
        setContactComponent(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ContactComponent, modals.contact]);

  useEffect(() => {
    if (!modals.order || OrderComponent) return;

    let cancelled = false;
    void import('./Order').then((module) => {
      if (!cancelled) {
        setOrderComponent(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [OrderComponent, modals.order]);

  useEffect(() => {
    if (!modals.auth || AuthModalComponent) return;

    let cancelled = false;
    void import('./AuthModal').then((module) => {
      if (!cancelled) {
        setAuthModalComponent(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [AuthModalComponent, modals.auth]);

  const renderPortal = (node: React.ReactNode) =>
    portalRoot ? createPortal(node, portalRoot) : null;
  const renderSearchBar = (onSearch: SearchBarComponentProps['onSearch']) => {
    if (!SearchBarComponent) {
      return (
        <div className="h-10 w-full rounded-xl border border-gray-500 bg-gray-800/80 shadow-md" />
      );
    }

    return <SearchBarComponent onSearch={onSearch} />;
  };
  const hasOverlayPortalOpen =
    showSearchModal || modals.contact || modals.order || modals.auth;

  const buttonBaseClass =
    'font-ui flex min-h-[34px] items-center gap-1 rounded-[14px] border border-white/15 bg-gray-700 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.01em] text-slate-50 transition-all whitespace-nowrap hover:border-white/35 hover:bg-gray-600 sm:min-h-0 sm:gap-1.5 sm:rounded-[16px] sm:px-3.5 sm:py-2.5 sm:text-[14px] cursor-pointer touch-manipulation active:scale-[0.98] select-none';


  const dropdownBaseClass =
    'font-ui absolute z-50 mt-3 w-52 origin-top rounded-2xl border-2 border-gray-500 bg-gray-700 p-2 py-2 text-white shadow-xl backdrop-blur-sm select-none transition-all duration-150 ease-out';

  const dropdownItemClass =
    'flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-semibold tracking-[-0.01em] hover:bg-gray-600 cursor-pointer transition-transform active:scale-[0.98] select-none';

  const closeAllOverlays = () => {
    setActiveMenu('');
    setShowSearchModal(false);
    setModals({ contact: false, order: false, auth: false });
    setAuthInitialTab(null);
  };

  return (
    <header
      suppressHydrationWarning
      className="site-header-shell font-ui relative z-50 flex h-14 items-center justify-center bg-gradient-to-b from-gray-600 to-gray-800 text-white sm:h-16"
    >

      <div className="page-shell-inline flex items-center justify-between gap-2 sm:gap-4">

        {/* LEFT SECTION */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">

          {/* LOGO */}
          <Link
            href="/"
            aria-label="Головна сторінка"
            className="group relative flex select-none items-center"
            onClick={handleBrandClick}
            onContextMenu={preventLogoAssetInteraction}
            onDragStart={preventLogoAssetInteraction}
            onCopy={preventLogoAssetInteraction}
            onCut={preventLogoAssetInteraction}
            draggable={false}
          >
            <Image
              src="/Car-parts.png"
              alt="PartsOn Logo"
              width={70}
              height={40}
              className="pointer-events-none h-auto w-[65px] select-none object-contain md:w-[85px]"
              onError={handleLogoLoadError}
              onContextMenu={preventLogoAssetInteraction}
              draggable={false}
            />
            <span className="pointer-events-none absolute left-4 top-full z-50 mt-2.5 translate-y-1 whitespace-nowrap rounded-xl border border-slate-200/70 bg-gradient-to-r from-white/95 via-sky-50/95 to-indigo-50/90 pl-3.5 pr-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.02em] text-slate-900 opacity-0 shadow-[0_10px_22px_rgba(15,23,42,0.16)] backdrop-blur-md ring-1 ring-white/60 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 sm:left-1/2 sm:-translate-x-1/2">
              Головна сторінка
            </span>
          </Link>

          {/* NAVIGATION */}
          <nav ref={navRef} className="relative select-none">
            <ul className="flex items-center gap-1 sm:gap-3">

              {/* MENU BUTTON */}
              <li className="relative select-none">
                <button
                  data-overlay-toggle="menu"
                  onClick={() => toggleMenu("menu")}
                  onPointerEnter={prefetchCatalogRoutes}
                  onFocus={prefetchCatalogRoutes}
                  onTouchStart={prefetchCatalogRoutes}
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
                  onPointerEnter={prefetchInfoRoutes}
                  onFocus={prefetchInfoRoutes}
                  onTouchStart={prefetchInfoRoutes}
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
                    <li><Link href="/inform/delivery" onClick={() => setActiveMenu('')} className={dropdownItemClass}><Truck size={18} /> Доставка</Link></li>
                    <li><Link href="/inform/payment" onClick={() => setActiveMenu('')} className={dropdownItemClass}><CreditCard size={18} /> Оплата</Link></li>
                    <li><Link href="/inform/about" onClick={() => setActiveMenu('')} className={dropdownItemClass}><Users size={18} /> Про нас</Link></li>
                    <li><Link href="/inform/location" onClick={() => setActiveMenu('')} className={dropdownItemClass}><MapPin size={18} /> Локація</Link></li>
                  </ul>
              </li>

            </ul>
          </nav>

        </div>

        {/* SEARCH CENTER */}
        <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-3">
          <div className="hidden lg:block w-full max-w-[380px]">
            {renderSearchBar(() => {})}
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
        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">

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

            {hasMounted && cartItems.length > 0 && (
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
            className={`font-ui flex min-h-[34px] items-center gap-1 rounded-[14px] border border-red-300/40 bg-gradient-to-r from-red-600 via-red-500 to-red-600 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.01em] text-white shadow-sm shadow-red-500/30 hover:from-red-500 hover:via-red-400 hover:to-red-500 sm:min-h-0 sm:gap-2 sm:rounded-[16px] sm:px-3 sm:py-2 sm:text-[14px] cursor-pointer touch-manipulation ${
              modals.contact ? 'ring-2 ring-red-300/60' : ''
            }`}
          >
            <Phone size={16} className="sm:size-5" />
            <span className="hidden sm:inline cursor-pointer select-none">Контакти</span>
          </button>
        </div>
      </div>

      {hasOverlayPortalOpen &&
        renderPortal(
          <div
            className="fixed inset-x-0 bottom-0 top-[var(--header-height,4rem)] z-[80] bg-slate-950/12"
            onClick={closeAllOverlays}
            aria-hidden="true"
          />
        )}

      {/* SEARCH MODAL */}
      {showSearchModal &&
        renderPortal(
          <div
            ref={searchModalRef}
            className="fixed top-[calc(var(--header-height,4rem)+0.5rem)] left-2 right-2 sm:left-auto sm:right-6 w-auto sm:w-[80%] max-w-[420px] z-[95] rounded-2xl sm:rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 shadow-2xl border border-gray-500 animate-fadeIn"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display flex items-center gap-2 text-lg font-semibold tracking-[-0.03em] text-white">
                <MagnifyingGlassIcon className="w-5 h-5 text-blue-400" />
                Пошук
              </h2>
              <button onClick={() => setShowSearchModal(false)} className="text-gray-400 hover:text-white">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
              {renderSearchBar(() => setShowSearchModal(false))}
            </div>
          </div>
        )}

      {/* MODALS */}
      {modals.contact &&
        ContactComponent &&
        renderPortal(<ContactComponent onClose={() => closeModal('contact')} />)}
      {modals.order &&
        OrderComponent &&
        renderPortal(<OrderComponent onClose={() => closeModal('order')} />)}
      {modals.auth &&
        AuthModalComponent &&
        renderPortal(
          <AuthModalComponent
            isOpen={modals.auth}
            user={user}
            initialMode={authInitialMode}
            initialAccountTab={authInitialTab}
            onClose={() => closeModal('auth')}
          />
        )}

    </header>
  );
};

export default Header;
