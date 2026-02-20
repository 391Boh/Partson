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
  createdAt: unknown;
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
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateLayout = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  if (!isOpen) return null;

  return (
    <motion.div
      ref={chatRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed z-50 flex flex-col overflow-hidden border border-sky-200/80 shadow-[0_24px_60px_rgba(30,64,175,0.22)] backdrop-blur-xl bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.96)_52%,rgba(224,242,254,0.94)_100%)]"
      style={
        isDesktop
          ? {
              right: 32,
              bottom: 44,
              width: 380,
              height: 460,
              borderRadius: 16,
            }
          : {
              left: 12,
              right: 12,
              top: 72,
              height: '70vh',
              borderRadius: 20,
            }
      }
    >
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-sky-200/70 bg-gradient-to-r from-sky-100/90 via-white/90 to-cyan-100/80 px-4 py-3 text-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-blue-600 shadow-[0_8px_18px_rgba(59,130,246,0.24)]">
            <MessageCircle size={17} />
          </span>
          <span className="font-semibold tracking-tight">Чат підтримки</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-sky-200/70 bg-white/90 p-1 text-slate-500 transition hover:bg-sky-50 hover:text-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.78)_0%,rgba(241,245,249,0.65)_100%)] px-3 py-3">
        <div className="flex max-w-[88%] items-center gap-2 rounded-2xl border border-sky-200/70 bg-white/95 px-4 py-2.5 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
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
                      : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-[0_8px_18px_rgba(59,130,246,0.34)]'
                    : isProduct
                    ? ''
                    : 'border border-sky-200/70 bg-white/95 text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.08)]'
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
      </div>
      {orderItems.length > 0 && (
        <div className="border-t border-sky-200/70 bg-white/80 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
            <ClipboardList size={14} />
            Замовлення в чаті
          </div>
          <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
            {orderItems.map((item) => (
              <div
                key={item.code}
                className="flex items-center justify-between gap-2 rounded-lg border border-sky-200/70 bg-white/90 px-2 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-slate-700">
                    {item.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {item.article}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateOrderQty(item.code, item.quantity - 1)}
                    className="h-6 w-6 rounded-full border border-sky-200 bg-white text-slate-600 transition hover:bg-sky-50"
                  >
                    <Minus size={12} className="mx-auto" />
                  </button>
                  <span className="w-6 text-center text-xs font-semibold text-slate-700">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateOrderQty(item.code, item.quantity + 1)}
                    className="h-6 w-6 rounded-full border border-sky-200 bg-white text-slate-600 transition hover:bg-sky-50"
                  >
                    <Plus size={12} className="mx-auto" />
                  </button>
                </div>
                <div className="text-[10px] font-semibold text-slate-700">
                  {Math.round(item.price * item.quantity).toLocaleString('uk-UA')} грн
                </div>
                <button
                  onClick={() => removeOrderItem(item.code)}
                  className="text-slate-400 transition hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-700">
            <span className="font-semibold">Разом: {orderTotal.toLocaleString('uk-UA')} грн</span>
            <div className="flex items-center gap-2">
              <button
                onClick={addOrderToCart}
                className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-sky-50"
              >
                В кошик
              </button>
              <button
                onClick={checkoutOrder}
                className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(59,130,246,0.3)] transition hover:brightness-110"
              >
                Оформити
              </button>
            </div>
          </div>
        </div>
      )}
      {/* INPUT */}
      <div className="flex items-center gap-2 border-t border-sky-200/70 bg-white/85 px-3 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          className="flex-1 rounded-full border border-sky-200/70 bg-white px-4 py-2 text-slate-700 placeholder-slate-400 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
          placeholder="Напишіть повідомлення..."
        />
        <button
          onClick={sendMessage}
          className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 p-2 shadow-[0_10px_22px_rgba(59,130,246,0.32)] transition hover:brightness-110 active:scale-[0.97] cursor-pointer"
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
    <div className="min-w-[240px] max-w-[320px] rounded-xl border border-sky-200/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.95)_48%,rgba(224,242,254,0.92)_100%)] p-3 text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.1)]">
      <div className="flex gap-3">
        <div className="h-[72px] w-[88px] shrink-0 overflow-hidden rounded-lg border border-sky-200/80 bg-white">
          <ProductCardImage productCode={code} className="w-full h-full" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Товар
          </div>
          <div className="line-clamp-2 text-[13px] font-normal text-slate-800">
            {name}
          </div>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
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
            className="h-7 w-7 rounded-full border border-sky-200 bg-white text-slate-600 transition hover:bg-sky-50"
            disabled={qty <= 1}
          >
            <Minus size={14} className="mx-auto" />
          </button>
          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
          <button
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            className="h-7 w-7 rounded-full border border-sky-200 bg-white text-slate-600 transition hover:bg-sky-50 disabled:opacity-40"
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
            <div className="text-[11px] text-slate-500">Ціна уточнюється</div>
          )}
          {typeof product.quantity === 'number' && (
            <div className="text-[10px] text-slate-500">
              В наявності: {product.quantity}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {product.link ? (
          <a
            href={product.link}
            className="text-[11px] font-medium text-blue-700 hover:underline"
          >
            Відкрити в каталозі
          </a>
        ) : (
          <span className="text-[11px] text-slate-400">Немає посилання</span>
        )}
        <button
          onClick={() => onAddToOrder(product, qty)}
          disabled={!canAdd}
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
            canAdd
              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_8px_18px_rgba(59,130,246,0.32)] hover:brightness-110'
              : 'cursor-not-allowed bg-slate-200 text-slate-500'
          }`}
        >
          <ShoppingCart size={14} />
          В замовлення
        </button>
      </div>
    </div>
  );
}
