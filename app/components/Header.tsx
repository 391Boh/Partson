'use client';

import React, { useState, useEffect, useRef, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import {
  ShoppingCart, User, Menu, Info,
  List, Truck, CreditCard, MapPin, Users, Phone, Search, ShieldCheck, RotateCcw, Wrench,
  CarFront, Factory, Layers3, BookOpen
} from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { useCart } from 'app/context/CartContext';
import { useFirebaseAuthState } from 'app/lib/firebase-auth-state';
import SmartLink from 'app/components/SmartLink';
import { XMarkIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { createPortal } from 'react-dom';

type AppRouterInstance = ReturnType<typeof useRouter>;
type AuthModalModule = typeof import('./AuthModal');

let authModalModulePromise: Promise<AuthModalModule> | null = null;
const loadAuthModalModule = () => {
  authModalModulePromise ??= import('./AuthModal');
  return authModalModulePromise;
};

const CATALOG_PREFETCH_ROUTES = [
  '/katalog',
  '/auto',
  '/groups',
  '/manufacturers',
] as const;

const INFO_PREFETCH_ROUTES = [
  '/inform/delivery',
  '/inform/payment',
  '/inform/about',
  '/inform/location',
  '/inform/privacy',
  '/inform/warranty',
  '/inform/returns',
  '/inform/diagnostics',
  '/blog',
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
    filterBy: 'all' | 'article' | 'name' | 'code' | 'producer' | 'description'
  ) => void;
};

const SearchBar = dynamic<SearchBarComponentProps>(() => import('./Search'), {
  ssr: false,
  loading: () => (
    <div className="h-10 w-full rounded-xl border border-gray-600 bg-gray-800/80 shadow-md" />
  ),
});

const Header: React.FC = () => {
  const { cartItems } = useCart();
  const logoFallbackPath = '/favicon-192x192.png';
  const [hasMounted, setHasMounted] = useState(false);
  const { user } = useFirebaseAuthState();

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

  const preloadAuthModal = () => {
    if (AuthModalComponent) return;
    void loadAuthModalModule().then((module) => {
      setAuthModalComponent(() => module.default);
    });
  };

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
    event.preventDefault();
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      window.location.reload();
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
    void loadAuthModalModule().then((module) => {
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
  const renderSearchBar = (onSearch: SearchBarComponentProps['onSearch']) => (
    <SearchBar onSearch={onSearch} />
  );
  const hasOverlayPortalOpen =
    Boolean(activeMenu) || showSearchModal || modals.contact || modals.order || modals.auth;

  const buttonBaseClass =
    'font-ui relative inline-flex h-11 w-11 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-[14px] border border-white/[0.20] bg-white/[0.11] text-[10px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-sm transition-all duration-200 whitespace-nowrap hover:border-sky-300/50 hover:bg-sky-400/[0.18] hover:text-sky-100 hover:shadow-[0_6px_18px_rgba(14,165,233,0.22),0_2px_8px_rgba(0,0,0,0.20),inset_0_1px_0_rgba(125,211,252,0.22)] active:scale-[0.96] active:shadow-[0_1px_3px_rgba(0,0,0,0.22)] sm:h-auto sm:w-auto sm:rounded-[16px] sm:px-3.5 sm:py-2.5 sm:text-[13px] touch-manipulation';

  const rightActionBaseClass =
    'font-ui relative inline-flex h-11 w-11 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-[14px] border border-white/[0.20] bg-white/[0.11] text-[10px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-sm transition-all duration-200 whitespace-nowrap hover:border-sky-300/50 hover:bg-sky-400/[0.18] hover:text-sky-100 hover:shadow-[0_6px_18px_rgba(14,165,233,0.22),0_2px_8px_rgba(0,0,0,0.20),inset_0_1px_0_rgba(125,211,252,0.22)] active:scale-[0.96] active:shadow-[0_1px_3px_rgba(0,0,0,0.22)] sm:h-auto sm:w-auto sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-[13px] touch-manipulation';

  const rightActionActiveClass =
    '!border-sky-300/55 !bg-sky-500/[0.22] !text-sky-100 !shadow-[0_4px_14px_rgba(14,165,233,0.24),inset_0_1px_0_rgba(125,211,252,0.24)] !-translate-y-0';

  const contactActionClass =
    'border-rose-200/50 bg-[image:linear-gradient(145deg,rgba(190,18,60,0.96),rgba(225,29,72,0.94)_54%,rgba(244,63,94,0.90))] text-white shadow-[0_4px_14px_rgba(190,18,60,0.28),0_2px_6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.22)] hover:border-rose-100/70 hover:bg-[image:linear-gradient(145deg,rgba(225,29,72,0.99),rgba(244,63,94,0.96)_52%,rgba(251,113,133,0.92))] hover:shadow-[0_8px_22px_rgba(225,29,72,0.36),0_2px_8px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.28)]';

  const contactActionActiveClass =
    '!border-rose-100/80 !bg-[image:linear-gradient(145deg,rgba(225,29,72,0.99),rgba(244,63,94,0.97)_50%,rgba(251,113,133,0.94))] !text-white !shadow-[0_10px_24px_rgba(225,29,72,0.30),inset_0_1px_0_rgba(255,255,255,0.28)] !translate-y-0';


  const dropdownBaseClass =
    'app-header-dropdown font-ui fixed inset-x-3 top-[calc(var(--header-height,4rem)+0.55rem)] z-[90] max-h-[calc(100svh-var(--header-height,4rem)-1rem)] origin-top overflow-y-auto rounded-[20px] border border-sky-100/16 p-2 text-white shadow-[0_18px_42px_rgba(2,6,23,0.34),0_12px_28px_rgba(2,6,23,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-sky-100/10 backdrop-blur-xl select-none transition-all duration-150 ease-out sm:absolute sm:inset-x-auto sm:left-1/2 sm:top-auto sm:mt-5 sm:-translate-x-1/2 sm:rounded-[18px] sm:p-1.5';

  const menuDropdownClass = `${dropdownBaseClass} sm:w-64`;

  const infoDropdownClass = `${dropdownBaseClass} grid grid-cols-2 gap-1 sm:w-[30rem] sm:gap-1.5 md:w-[32rem]`;

  const dropdownItemClass =
    'group flex min-h-10 w-full items-center gap-2.5 rounded-[13px] px-3 py-2.5 text-left text-[13px] font-semibold tracking-[-0.01em] text-slate-100 transition-all duration-150 hover:-translate-y-px hover:bg-sky-500/[0.14] hover:text-white hover:shadow-[0_4px_12px_rgba(14,165,233,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 active:scale-[0.98] active:translate-y-0 select-none sm:rounded-xl sm:px-3.5 sm:text-[13.5px]';

  const infoDropdownItemClass =
    `${dropdownItemClass} min-h-[2.85rem] gap-2 px-2.5 py-2 text-[12.5px] leading-tight sm:min-h-10 sm:px-3 sm:text-[13px]`;

  const dropdownIconClass =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-[11px] border border-white/12 bg-white/[0.10] text-sky-200 transition-all duration-150 group-hover:border-sky-300/50 group-hover:bg-sky-400/[0.20] group-hover:text-white group-hover:shadow-[0_2px_8px_rgba(14,165,233,0.18)] sm:h-8 sm:w-8 sm:rounded-xl';

  const overlayBackdropClass = activeMenu
    ? 'fixed inset-x-0 bottom-0 top-[var(--header-height,4rem)] z-[40] bg-slate-950/15'
    : 'fixed inset-x-0 bottom-0 top-[var(--header-height,4rem)] z-[80] bg-slate-950/12';

  const closeAllOverlays = () => {
    setActiveMenu('');
    setShowSearchModal(false);
    setModals({ contact: false, order: false, auth: false });
    setAuthInitialTab(null);
  };

  return (
    <header
      suppressHydrationWarning
      className="site-header-shell font-ui relative z-50 flex w-full items-center justify-center text-white"
    >

      <div className="page-shell-inline flex items-center justify-between gap-2 sm:gap-4">

        {/* LEFT SECTION */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">

          {/* LOGO */}
          <SmartLink
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
              width={98}
              height={49}
              priority
              fetchPriority="high"
              sizes="(max-width: 768px) 65px, 85px"
              className="pointer-events-none h-auto w-[65px] select-none object-contain md:w-[85px]"
              onError={handleLogoLoadError}
              onContextMenu={preventLogoAssetInteraction}
              draggable={false}
            />
          </SmartLink>

          {/* NAVIGATION */}
          <nav ref={navRef} className="relative select-none">
            <ul className="flex items-center gap-1 sm:gap-3">

              {/* MENU BUTTON */}
              <li className="relative select-none">
                <button
                  data-overlay-toggle="menu"
                  aria-label="Меню"
                  onClick={() => toggleMenu("menu")}
                  onPointerEnter={prefetchCatalogRoutes}
                  onFocus={prefetchCatalogRoutes}
                  onTouchStart={prefetchCatalogRoutes}
                  className={`${buttonBaseClass} ${
                    activeMenu === "menu" ? rightActionActiveClass : ''
                  }`}
                >
                  <Menu size={16} className="sm:size-4" aria-hidden="true" />
                  <span className="hidden md:inline cursor-pointer select-none">Меню</span>
                </button>

                <ul className={`${menuDropdownClass} ${
                    activeMenu === "menu"
                      ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                  }`}>
                  <li>
                    <SmartLink
                      href="/katalog"
                      onClick={() => setActiveMenu('')}
                      className={dropdownItemClass}
                    >
                      <span className={dropdownIconClass} aria-hidden="true"><List size={17} aria-hidden="true" /></span>
                      <span>Каталог</span>
                    </SmartLink>
                  </li>
                  <li>
                    <SmartLink
                      href="/groups"
                      onClick={() => setActiveMenu('')}
                      className={dropdownItemClass}
                    >
                      <span className={dropdownIconClass} aria-hidden="true"><Layers3 size={17} aria-hidden="true" /></span>
                      <span>Групи товарів</span>
                    </SmartLink>
                  </li>
                  <li>
                    <SmartLink
                      href="/auto"
                      onClick={() => setActiveMenu('')}
                      className={dropdownItemClass}
                    >
                      <span className={dropdownIconClass} aria-hidden="true"><CarFront size={17} aria-hidden="true" /></span>
                      <span>Авто</span>
                    </SmartLink>
                  </li>
                  <li>
                    <SmartLink
                      href="/manufacturers"
                      onClick={() => setActiveMenu('')}
                      className={dropdownItemClass}
                    >
                      <span className={dropdownIconClass} aria-hidden="true"><Factory size={17} aria-hidden="true" /></span>
                      <span>Виробники</span>
                    </SmartLink>
                  </li>
                </ul>
              </li>

              {/* INFO BUTTON */}
              <li className="relative select-none">
                <button
                  data-overlay-toggle="info"
                  aria-label="Інформація"
                  onClick={() => toggleMenu("info")}
                  onPointerEnter={prefetchInfoRoutes}
                  onFocus={prefetchInfoRoutes}
                  onTouchStart={prefetchInfoRoutes}
                  className={`${buttonBaseClass} ${
                    activeMenu === "info" ? rightActionActiveClass : ''
                  }`}
                >
                  <Info size={16} className="sm:size-4 " aria-hidden="true" />
                  <span className="hidden md:inline cursor-pointer select-none">Інформація</span>
                </button>

                <ul className={`${infoDropdownClass} ${
                    activeMenu === "info"
                      ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                  }`}>
                    <li><SmartLink href="/inform/delivery" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><Truck size={17} aria-hidden="true" /></span><span className="min-w-0">Доставка</span></SmartLink></li>
                    <li><SmartLink href="/inform/payment" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><CreditCard size={17} aria-hidden="true" /></span><span className="min-w-0">Оплата</span></SmartLink></li>
                    <li><SmartLink href="/inform/about" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><Users size={17} aria-hidden="true" /></span><span className="min-w-0">Про нас</span></SmartLink></li>
                    <li><SmartLink href="/inform/location" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><MapPin size={17} aria-hidden="true" /></span><span className="min-w-0">Локація</span></SmartLink></li>
                    <li><SmartLink href="/inform/warranty" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><ShieldCheck size={17} aria-hidden="true" /></span><span className="min-w-0">Гарантія</span></SmartLink></li>
                    <li><SmartLink href="/inform/returns" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><RotateCcw size={17} aria-hidden="true" /></span><span className="min-w-0">Повернення</span></SmartLink></li>
                    <li><SmartLink href="/inform/diagnostics" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><Wrench size={17} aria-hidden="true" /></span><span className="min-w-0">Діагностика</span></SmartLink></li>
                    <li><SmartLink href="/blog" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><BookOpen size={17} aria-hidden="true" /></span><span className="min-w-0">Блог</span></SmartLink></li>
                    <li><SmartLink href="/inform/privacy" onClick={() => setActiveMenu('')} className={infoDropdownItemClass}><span className={dropdownIconClass} aria-hidden="true"><ShieldCheck size={17} aria-hidden="true" /></span><span className="min-w-0">Конфіденційність</span></SmartLink></li>
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
            aria-label="Пошук"
            className={`group lg:hidden !h-12 !w-12 !rounded-[16px] font-ui relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center backdrop-blur-sm transition-all duration-200 touch-manipulation ${
              showSearchModal
                ? 'border border-sky-300/65 bg-sky-500/[0.22] text-sky-100 shadow-[0_4px_16px_rgba(14,165,233,0.26),inset_0_1px_0_rgba(125,211,252,0.26)]'
                : 'border border-sky-400/[0.30] bg-[image:linear-gradient(145deg,rgba(12,74,110,0.38),rgba(7,89,133,0.32))] text-sky-100 shadow-[0_2px_10px_rgba(14,165,233,0.14),inset_0_1px_0_rgba(125,211,252,0.18)] hover:border-sky-300/55 hover:bg-[image:linear-gradient(145deg,rgba(12,74,110,0.52),rgba(7,89,133,0.46))] hover:shadow-[0_6px_20px_rgba(14,165,233,0.28),inset_0_1px_0_rgba(125,211,252,0.24)] active:scale-[0.96]'
            }`}
            onClick={toggleSearchModal}
            ref={searchButtonRef}
          >
            <Search
              size={18}
              className="transition-transform duration-200 ease-out group-hover:scale-[1.12] group-active:scale-90"
              strokeWidth={2.4}
            />
          </button>
        </div>

        {/* RIGHT BUTTONS */}
        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">

          {/* ACCOUNT */}
          <button
            data-overlay-toggle="auth"
            aria-label="Профіль"
            onPointerEnter={preloadAuthModal}
            onFocus={preloadAuthModal}
            onTouchStart={preloadAuthModal}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleModal('auth');
            }}
            className={`${rightActionBaseClass} ${
              modals.auth
                ? rightActionActiveClass
                : ''
            }`}
          >
            <User size={17} className="sm:size-4" />
            <span className="hidden sm:inline cursor-pointer select-none">Профіль</span>
          </button>

          {/* CART */}
          <button
            data-overlay-toggle="order"
            aria-label="Замовлення"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleModal('order');
            }}
            className={`${rightActionBaseClass} ${
              modals.order ? rightActionActiveClass : ''
            }`}
          >
            <ShoppingCart size={17} className="sm:size-4" />
            <span className="hidden sm:inline cursor-pointer select-none">Замовлення</span>

            {hasMounted && cartItems.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-slate-800 bg-orange-500 px-1 text-[10px] font-black leading-none text-white shadow-[0_4px_10px_rgba(249,115,22,0.45)]">
                {cartItems.length}
              </span>
            )}
          </button>

          {/* PHONE */}
          <button
            data-overlay-toggle="contact"
            aria-label="Контакти"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleModal('contact');
            }}
            className={`${rightActionBaseClass} ${contactActionClass} ${
              modals.contact
                ? contactActionActiveClass
                : ''
            }`}
          >
            <Phone size={17} className="sm:size-4" />
            <span className="hidden sm:inline cursor-pointer select-none">Контакти</span>
          </button>
        </div>
      </div>

      {hasOverlayPortalOpen &&
        renderPortal(
          <div
            className={overlayBackdropClass}
            onClick={closeAllOverlays}
            aria-hidden="true"
          />
        )}

      {/* SEARCH MODAL */}
      {showSearchModal &&
        renderPortal(
          <div
            ref={searchModalRef}
            className="fixed left-2 right-2 top-[calc(var(--header-height,4rem)+0.55rem)] z-[95] w-auto max-w-[460px] rounded-[22px] border border-white/[0.11] bg-[image:radial-gradient(ellipse_120%_80%_at_10%_0%,rgba(56,189,248,0.16),transparent_52%),radial-gradient(ellipse_80%_60%_at_90%_100%,rgba(37,99,235,0.12),transparent_55%),linear-gradient(155deg,rgba(10,16,36,0.98),rgba(8,20,50,0.97)_54%,rgba(6,16,42,0.98))] p-3.5 shadow-[0_28px_72px_rgba(2,6,23,0.62),0_12px_32px_rgba(2,6,23,0.38),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl animate-fadeIn sm:left-auto sm:right-4 sm:w-[86%] sm:rounded-[24px] sm:p-4"
          >
            {/* modal header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-sky-400/25 bg-sky-500/15 text-sky-300">
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </span>
                <h2 className="text-[15px] font-bold tracking-[-0.02em] text-slate-100">
                  Пошук запчастин
                </h2>
              </div>
              <button
                onClick={() => setShowSearchModal(false)}
                aria-label="Закрити пошук"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[11px] border border-white/[0.16] bg-white/[0.09] text-slate-300 transition-all duration-150 hover:-translate-y-px hover:border-rose-300/40 hover:bg-rose-500/[0.14] hover:text-rose-200 active:translate-y-0 active:scale-95"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* search bar */}
            {renderSearchBar(() => setShowSearchModal(false))}

            {/* hint chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Фільтр масляний", "Гальмівні колодки", "Амортизатор"].map(hint => (
                <button
                  key={hint}
                  type="button"
                  className="font-ui rounded-full border border-sky-400/[0.22] bg-sky-500/[0.08] px-2.5 py-1 text-[11px] font-semibold text-sky-300 transition-all duration-150 hover:border-sky-300/40 hover:bg-sky-400/[0.16] hover:text-sky-100 hover:-translate-y-px active:translate-y-0 active:scale-95"
                  onClick={() => {
                    const input = searchModalRef.current?.querySelector<HTMLInputElement>('[data-search="true"]');
                    if (input) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                      nativeInputValueSetter?.call(input, hint);
                      input.dispatchEvent(new Event('input', { bubbles: true }));
                      input.focus();
                    }
                  }}
                >
                  {hint}
                </button>
              ))}
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
