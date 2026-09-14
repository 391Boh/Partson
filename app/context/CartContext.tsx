'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

import { pushEcommerceEvent } from 'app/lib/gtm';

interface CartItem {
  code: string;
  article: string;
  name: string;
  producer?: string;
  price: number;
  originalPrice?: number;
  isPromoPrice?: boolean;
  quantity: number;
  category?: string;
  group?: string;
  subGroup?: string;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (code: string) => void;
  getCartQuantity: () => number;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartRestored, setCartRestored] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cart');
      if (!stored) return;

      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) {
        localStorage.removeItem('cart');
        return;
      }

      const hasStoredUser = Boolean(localStorage.getItem('user_id'));
      const normalized = parsed
        .filter((item): item is Partial<CartItem> => !!item && typeof item === 'object')
        .map((item) => ({
          code: typeof item.code === 'string' ? item.code : '',
          article: typeof item.article === 'string' ? item.article : '',
          name: typeof item.name === 'string' ? item.name : 'Товар',
          producer: typeof item.producer === 'string' ? item.producer : undefined,
          price:
            !hasStoredUser && item.isPromoPrice === true
              ? typeof item.originalPrice === 'number' && Number.isFinite(item.originalPrice)
                ? item.originalPrice
                : 0
              : typeof item.price === 'number' && Number.isFinite(item.price)
                ? item.price
                : 0,
          originalPrice:
            hasStoredUser &&
            typeof item.originalPrice === 'number' && Number.isFinite(item.originalPrice)
              ? item.originalPrice
              : undefined,
          isPromoPrice: hasStoredUser && item.isPromoPrice === true,
          quantity:
            typeof item.quantity === 'number' && Number.isFinite(item.quantity)
              ? Math.max(1, Math.trunc(item.quantity))
              : 1,
          category: typeof item.category === 'string' ? item.category : undefined,
          group: typeof item.group === 'string' ? item.group : undefined,
          subGroup: typeof item.subGroup === 'string' ? item.subGroup : undefined,
        }))
        .filter((item) => item.code && item.price > 0);

      setCartItems(normalized);
    } catch {
      try { localStorage.removeItem('cart'); } catch {}
    } finally {
      setCartRestored(true);
    }
  }, []);

  useEffect(() => {
    const handleAuthChange = (event: Event) => {
      const uid = (event as CustomEvent<{ uid?: string | null }>).detail?.uid;
      if (uid) return;

      setCartItems((previous) => {
        if (!previous.some((item) => item.isPromoPrice)) return previous;
        return previous.flatMap((item) => {
          if (!item.isPromoPrice) return [item];
          if (!item.originalPrice) return [];
          return [{
            ...item,
            price: item.originalPrice,
            originalPrice: undefined,
            isPromoPrice: false,
          }];
        });
      });
    };

    window.addEventListener('partson:authStateChange', handleAuthChange);
    return () => window.removeEventListener('partson:authStateChange', handleAuthChange);
  }, []);

  useEffect(() => {
    // Hydration starts with an empty server-compatible cart. Persist only
    // after restoration so that first effect cannot overwrite stored items.
    if (!cartRestored) return;
    try { localStorage.setItem('cart', JSON.stringify(cartItems)); } catch {}
  }, [cartItems, cartRestored]);

  const addToCart = useCallback((item: CartItem) => {
    setCartItems(prev => {
      const existing = prev.find(p => p.code === item.code);
      if (existing) {
        return prev.map(p =>
          p.code === item.code
            ? {
                ...p,
                ...item,
                quantity: p.quantity + item.quantity,
              }
            : p
        );
      } else {
        return [...prev, item];
      }
    });
  }, []);

  const removeFromCart = useCallback((code: string) => {
    const removed = cartItems.find(p => p.code === code);
    if (removed) {
      pushEcommerceEvent("remove_from_cart", {
        currency: "UAH",
        value: removed.price * removed.quantity,
        items: [
          {
            item_id: removed.code,
            item_name: removed.name,
            ...(removed.producer ? { item_brand: removed.producer } : {}),
            ...(removed.category ? { item_category: removed.category } : {}),
            ...(removed.group ? { item_category2: removed.group } : {}),
            ...(removed.subGroup ? { item_category3: removed.subGroup } : {}),
            ...(removed.article ? { item_variant: removed.article } : {}),
            price: removed.price,
            quantity: removed.quantity,
          },
        ],
      });
    }
    setCartItems(prev => prev.some(p => p.code === code) ? prev.filter(p => p.code !== code) : prev);
  }, [cartItems]);

  const getCartQuantity = useCallback(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const clearCart = useCallback(() => {
    setCartItems(previous => previous.length ? [] : previous);
  }, []);

  const value = useMemo(() => ({
    cartItems, addToCart, removeFromCart, getCartQuantity, clearCart,
  }), [cartItems, addToCart, removeFromCart, getCartQuantity, clearCart]);

  return (
    <CartContext.Provider
      value={value}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
