'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface CartItem {
  code: string;
    article: string; 
  name: string;
  price: number;
  quantity: number;
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

  useEffect(() => {
    const stored = localStorage.getItem('cart');
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) {
        localStorage.removeItem('cart');
        return;
      }

      const normalized = parsed
        .filter((item): item is Partial<CartItem> => !!item && typeof item === 'object')
        .map((item) => ({
          code: typeof item.code === 'string' ? item.code : '',
          article: typeof item.article === 'string' ? item.article : '',
          name: typeof item.name === 'string' ? item.name : 'Товар',
          price: typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0,
          quantity:
            typeof item.quantity === 'number' && Number.isFinite(item.quantity)
              ? Math.max(1, Math.trunc(item.quantity))
              : 1,
        }))
        .filter((item) => item.code);

      setCartItems(normalized);
    } catch {
      localStorage.removeItem('cart');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = (item: CartItem) => {
    setCartItems(prev => {
      const existing = prev.find(p => p.code === item.code);
      if (existing) {
        return prev.map(p =>
          p.code === item.code ? { ...p, quantity: p.quantity + item.quantity } : p
        );
      } else {
        return [...prev, item];
      }
    });
  };

  const removeFromCart = (code: string) => {
    setCartItems(prev => prev.filter(p => p.code !== code));
  };

  const getCartQuantity = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <CartContext.Provider
      value={{ cartItems, addToCart, removeFromCart, getCartQuantity, clearCart }}
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
