// TelegramChat.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { Send, X, Headphones, MessageCircle, ShoppingCart, Minus, Plus, Trash2, ClipboardList } from 'lucide-react';
import { db } from '../../firebase';
import { useCart } from 'app/context/CartContext';
import ProductCardImage from 'app/components/ProductCardImage';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'manager';
  userId: string;
  createdAt: any;
  textRead?: boolean;
  type?: 'text' | 'product';
  product?: ProductCard;
}

interface ProductCard {
  name: string;
  code?: string;
  article?: string;
  producer?: string;
  quantity?: number;
  price?: number;
  link?: string;
  imageUrl?: string;
}

interface TelegramChatProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
  authUserId?: string | null;
  prefillMessage?: string | null;
  onPrefillSent?: () => void;
}

interface OrderItem {
  code: string;
  article: string;
  name: string;
  price: number;
  quantity: number;
  maxQty?: number;
  link?: string;
}

/**
 * Flow:
 * - Determine userId from auth or localStorage.
 * - Listen to Firestore messages for that userId.
 * - Count unread manager messages.
 */
export default function TelegramChat({
  isOpen,
  onClose,
  onUnreadCountChange,
  authUserId,
  prefillMessage,
  onPrefillSent,
}: TelegramChatProps) {
  if (!isOpen) return null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const { addToCart } = useCart();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const prefillSendingRef = useRef(false);
  const lastPrefillRef = useRef<string | null>(null);

  /**
   * Resolve userId:
   * - Prefer auth userId, otherwise use localStorage.
   */
  const getUserId = useCallback(() => {
    if (typeof window === 'undefined') return '';

    if (authUserId) return authUserId;

    let id = localStorage.getItem('chat_user_id');
    if (!id) {
      id = `user_${uuidv4()}`;
      localStorage.setItem('chat_user_id', id);
    }
    return id;
  }, [authUserId]);

  /**
   * Listener for this userId.
   */
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;

    const q = query(
      collection(db, 'messages'),
      where('userId', '==', userId),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Message[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          text: data.text,
          sender: data.sender,
          userId: data.userId,
          createdAt: data.createdAt,
          textRead: data.textRead,
          type: data.type ?? 'text',
          product: data.product ?? undefined,
        };
      });

      setMessages(list);

      const unread = list.filter(
        (m) => m.sender === 'manager' && m.textRead !== true
      ).length;

      onUnreadCountChange?.(unread);
    });

    return () => unsub();
  }, [getUserId, onUnreadCountChange]);

  /**
   * MARK AS READ (USER)
   */
  useEffect(() => {
    if (!isOpen) return;

    messages
      .filter((m) => m.sender === 'manager' && m.textRead !== true)
      .forEach((m) => {
        updateDoc(doc(db, 'messages', m.id), { textRead: true });
      });
  }, [isOpen, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * SEND MESSAGE
   */
  const sendMessageText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      await addDoc(collection(db, 'messages'), {
        text: text.trim(),
        sender: 'user',
        userId: getUserId(),
        createdAt: serverTimestamp(),
        textRead: true,
        type: 'text',
      });
    },
    [getUserId]
  );

  const sendMessage = async () => {
    if (!input.trim()) return;

    await sendMessageText(input);
    setInput('');
  };

  useEffect(() => {
    if (!isOpen || !prefillMessage) return;

    const message = prefillMessage.trim();
    if (!message) {
      onPrefillSent?.();
      return;
    }

    if (prefillSendingRef.current || lastPrefillRef.current === message) return;

    prefillSendingRef.current = true;
    lastPrefillRef.current = message;

    void sendMessageText(message).finally(() => {
      prefillSendingRef.current = false;
      onPrefillSent?.();
    });
  }, [isOpen, prefillMessage, onPrefillSent, sendMessageText]);

  useEffect(() => {
    if (!prefillMessage) {
      lastPrefillRef.current = null;
    }
  }, [prefillMessage]);

const addToOrder = useCallback((product: ProductCard, qty: number) => {
    const code = product.code ?? product.article ?? '';
    const article = product.article ?? product.code ?? '';
    if (!code || typeof product.price !== 'number') return;

    setOrderItems((prev) => {
      const existing = prev.find((p) => p.code === code);
      const maxQty =
        typeof product.quantity === 'number' && product.quantity > 0
          ? product.quantity
          : 99;

      if (existing) {
        const nextQty = Math.min(existing.quantity + qty, maxQty);
        return prev.map((p) =>
          p.code === code ? { ...p, quantity: nextQty, maxQty } : p
        );
      }

      return [
        ...prev,
        {
          code,
          article: article || code,
          name: product.name || 'Товар',
          price: product.price,
          quantity: Math.min(qty, maxQty),
          maxQty,
          link: product.link,
        },
      ];
    });
  }, []);

  const updateOrderQty = (code: string, qty: number) => {
    setOrderItems((prev) =>
      prev.map((p) => {
        if (p.code !== code) return p;
        const max = p.maxQty ?? 99;
        return { ...p, quantity: Math.max(1, Math.min(qty, max)) };
      })
    );
  };

  const removeOrderItem = (code: string) => {
    setOrderItems((prev) => prev.filter((p) => p.code !== code));
  };

  const addOrderToCart = () => {
    orderItems.forEach((item) => addToCart(item));
    setOrderItems([]);
  };

  const checkoutOrder = () => {
    addOrderToCart();
    onClose();
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('openOrderModal'));
      }, 0);
    }
  };

  const orderTotal = orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  /**
   * CLOSE ON OUTSIDE CLICK
   */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const updateLayout = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  return (
    <motion.div
      ref={chatRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed z-50 flex flex-col overflow-hidden border border-gray-500 shadow-2xl backdrop-blur-xl bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700"
      style={
        isDesktop
          ? {
              right: 32,
              bottom: 32,
              width: 380,
              height: 460,
              borderRadius: 16,
            }
          : {
              left: 12,
              right: 12,
              top: 80,
              height: '70vh',
              borderRadius: 20,
            }
      }
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/10 text-white border-b border-white/10">
        <div className="flex items-center gap-2">
          <MessageCircle size={20} />
          <span className="font-semibold">Чат підтримки</span>
        </div>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition cursor-pointer"
        >
          <X size={22} />
        </button>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-900/40">
        <div className="max-w-[85%] bg-white/90 text-slate-900 px-4 py-2 rounded-2xl flex items-center gap-2 text-sm shadow">
          <Headphones size={16} />
          Вітаємо! Чим можемо допомогти?
        </div>

        {messages.map((m) => {
          const isProduct = m.type === 'product' && m.product;
          return (
            <div
              key={m.id}
              className={`flex ${
                m.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] ${
                  isProduct
                    ? 'p-0 bg-transparent'
                    : 'px-4 py-2 text-sm rounded-2xl'
                } ${
                  m.sender === 'user'
                    ? isProduct
                      ? ''
                      : 'bg-white/95 text-slate-900 border border-white/40'
                    : isProduct
                    ? ''
                    : 'bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow'
                }`}
              >
                {isProduct ? (
                  <ChatProductCard product={m.product} onAddToOrder={addToOrder} />
                ) : (
                  m.text
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>      {orderItems.length > 0 && (
        <div className="border-t border-white/10 bg-slate-900/70 px-3 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-200 mb-2">
            <ClipboardList size={14} />
            Замовлення в чаті
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
            {orderItems.map((item) => (
              <div
                key={item.code}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-2"
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-100 truncate">
                    {item.name}
                  </div>
                  <div className="text-[10px] text-slate-300">
                    {item.article}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateOrderQty(item.code, item.quantity - 1)}
                    className="w-6 h-6 rounded-full border border-white/15 text-slate-200 hover:bg-white/10"
                  >
                    <Minus size={12} className="mx-auto" />
                  </button>
                  <span className="w-6 text-center text-xs text-slate-100">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateOrderQty(item.code, item.quantity + 1)}
                    className="w-6 h-6 rounded-full border border-white/15 text-slate-200 hover:bg-white/10"
                  >
                    <Plus size={12} className="mx-auto" />
                  </button>
                </div>
                <div className="text-[10px] text-slate-200">
                  {Math.round(item.price * item.quantity).toLocaleString('uk-UA')} грн
                </div>
                <button
                  onClick={() => removeOrderItem(item.code)}
                  className="text-slate-400 hover:text-rose-300"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-200">
            <span>Разом: {orderTotal.toLocaleString('uk-UA')} грн</span>
            <div className="flex items-center gap-2">
              <button
                onClick={addOrderToCart}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-100 hover:bg-white/10"
              >
                В кошик
              </button>
              <button
                onClick={checkoutOrder}
                className="rounded-full bg-emerald-500/80 px-3 py-1 text-xs text-white hover:bg-emerald-500"
              >
                Оформити
              </button>
            </div>
          </div>
        </div>
      )}
      {/* INPUT */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-slate-900/60">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          className="flex-1 rounded-full px-4 py-2 bg-white/10 text-white placeholder-slate-300 outline-none"
          placeholder="Напишіть повідомлення..."
        />
        <button
          onClick={sendMessage}
          className="p-2 rounded-full bg-sky-500 hover:bg-sky-600 active:scale-[0.97] transition cursor-pointer"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
    </motion.div>
  );
}

function ChatProductCard({
  product,
  onAddToOrder,
}: {
  product: ProductCard;
  onAddToOrder: (product: ProductCard, qty: number) => void;
}) {
  const [qty, setQty] = useState(1);

  const code = product.code ?? product.article ?? '';
  const article = product.article ?? product.code ?? '';
  const name = product.name || 'Товар';
  const maxQty =
    typeof product.quantity === 'number' && product.quantity > 0
      ? product.quantity
      : 99;
  const isMax = qty >= maxQty;
  const canAdd =
    !!code && typeof product.price === 'number' && maxQty > 0;

  return (
    <div className="min-w-[240px] max-w-[320px] rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 p-3 text-slate-900 shadow-sm">
      <div className="flex gap-3">
        <div className="w-[88px] h-[72px] shrink-0 rounded-lg overflow-hidden bg-white border border-gray-200">
          <ProductCardImage productCode={code} className="w-full h-full" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Товар
          </div>
          <div className="text-[13px] font-semibold text-gray-900 line-clamp-2">
            {name}
          </div>
          <div className="mt-1 text-[11px] text-gray-600 space-y-0.5">
            {article && <div>Артикул: {article}</div>}
            {product.code && <div>Код: {product.code}</div>}
            {product.producer && <div>Виробник: {product.producer}</div>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="w-7 h-7 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100"
            disabled={qty <= 1}
          >
            <Minus size={14} className="mx-auto" />
          </button>
          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
          <button
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            className="w-7 h-7 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            disabled={isMax}
          >
            <Plus size={14} className="mx-auto" />
          </button>
        </div>

        <div className="text-right">
          {typeof product.price === 'number' ? (
            <div className="text-sm font-semibold text-blue-600">
              {product.price.toLocaleString('uk-UA')} грн
            </div>
          ) : (
            <div className="text-[11px] text-gray-500">Ціна уточнюється</div>
          )}
          {typeof product.quantity === 'number' && (
            <div className="text-[10px] text-gray-500">
              В наявності: {product.quantity}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {product.link ? (
          <a
            href={product.link}
            className="text-[11px] text-blue-700 hover:underline"
          >
            Відкрити в каталозі
          </a>
        ) : (
          <span className="text-[11px] text-gray-400">Немає посилання</span>
        )}
                <button
          onClick={() => onAddToOrder(product, qty)}
          disabled={!canAdd}
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
            canAdd
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          <ShoppingCart size={14} />
          В замовлення
        </button>
      </div>
    </div>
  );
}
