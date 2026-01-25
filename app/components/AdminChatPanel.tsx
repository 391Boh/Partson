'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChatBubbleBottomCenterTextIcon,
  ShoppingBagIcon,
  PhoneIcon,
  ChevronLeftIcon,
  TrashIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../../firebase';

interface Message {
  id: string;
  userId: string;
  text: string;
  sender: 'user' | 'manager';
  createdAt: any;
  readByAdmin?: boolean;
  readByUser?: boolean;
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

interface CartItem {
  article?: string;
  code?: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  name: string;
  phone: string;
  deliveryMethod?: string;
  paymentMethod?: string;
  totalAmount: number;
  cartItems?: CartItem[];
  city?: string | null;
  warehouse?: string | null;
  lvivStreet?: string | null;
  createdAt: any;
  read?: boolean;
  completed?: boolean;
}

interface CallRequest {
  id: string;
  name: string;
  phone: string;
  message: string;
  createdAt: any;
  read?: boolean;
  processed?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNotificationCountChange?: (count: number) => void;
}

export default function AdminChatPanel({
  isOpen,
  onClose,
  onNotificationCountChange,
}: Props) {
  const [tab, setTab] = useState<'messages' | 'orders' | 'calls'>('messages');
  const [messages, setMessages] = useState<Message[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [calls, setCalls] = useState<CallRequest[]>([]);
  const [userPhoneMap, setUserPhoneMap] = useState<Record<string, string>>({});
  const [orderSearch, setOrderSearch] = useState('');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [productArticle, setProductArticle] = useState('');
  const [productError, setProductError] = useState<string | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'messages'), orderBy('createdAt', 'asc')),
      (snap) =>
        setMessages(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        )
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      (snap) =>
        setOrders(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        )
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'zvyaz'), orderBy('createdAt', 'desc')),
      (snap) =>
        setCalls(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        )
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      const nextMap: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data?.phone) {
          nextMap[d.id] = data.phone;
        }
      });
      setUserPhoneMap(nextMap);
    });
  }, []);

  const unreadMessages = messages.filter(
    (m) => m.sender === 'user' && m.readByAdmin !== true
  ).length;
  const unreadOrders = orders.filter((o) => o.read !== true).length;
  const unreadCalls = calls.filter((c) => c.read !== true).length;

  useEffect(() => {
    onNotificationCountChange?.(
      unreadMessages + unreadOrders + unreadCalls
    );
  }, [unreadMessages, unreadOrders, unreadCalls, onNotificationCountChange]);

  const openChat = async (uid: string) => {
    setSelectedUserId(uid);
    const unread = messages.filter(
      (m) => m.userId === uid && m.sender === 'user' && !m.readByAdmin
    );
    for (const m of unread) {
      await updateDoc(doc(db, 'messages', m.id), { readByAdmin: true });
    }
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
      100
    );
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedUserId) return;
    await addDoc(collection(db, 'messages'), {
      userId: selectedUserId,
      text: replyText.trim(),
      sender: 'manager',
      createdAt: new Date(),
      readByAdmin: true,
      readByUser: false,
      textRead: false,
      type: 'text',
    });
    setReplyText('');
  };

  const fetchProductByArticle = async (
    article: string
  ): Promise<ProductCard | null> => {
    const trimmed = article.trim();
    if (!trimmed) return null;

        const PAGE_FIELD = "НомерСтраницы";
    const ARTICLE_FIELD = "НомерПоКаталогу";
    const PRICE_CODE_FIELD = "Код";
    const PRICE_VALUE_FIELD = "ЦінаПрод";

    const FIELD_QTY = "Количество";
    const FIELD_CODE = "НоменклатураКод";
    const FIELD_NAME = "НоменклатураНаименование";
    const FIELD_ARTICLE = "НомерПоКаталогу";
    const FIELD_PRODUCER = "ПроизводительНаименование";

    const res = await fetch('/api/proxy?endpoint=getdata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedCars: [],
        selectedCategories: [],
        [PAGE_FIELD]: 1,
        [ARTICLE_FIELD]: trimmed,
      }),
    });

    if (!res.ok) return null;

    const list = await res.json();
    const item = Array.isArray(list) ? list[0] : null;
    if (!item) return null;

    const nameRaw = item?.[FIELD_NAME] ?? '';
    const codeRaw = item?.[FIELD_CODE] ?? trimmed;
    const articleRaw = item?.[FIELD_ARTICLE] ?? '';
    const producerRaw = item?.[FIELD_PRODUCER] ?? '';
    const qtyRaw = item?.[FIELD_QTY];

    let priceUAH: number | undefined;
    const priceKey = (articleRaw || codeRaw || trimmed).toString().trim();

    if (priceKey) {
      const priceRes = await fetch('/api/proxy?endpoint=prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [PRICE_CODE_FIELD]: priceKey }),
      });

      if (priceRes.ok) {
        const text = await priceRes.text();
        try {
          const json = JSON.parse(text);
          const euroRaw = json?.[PRICE_VALUE_FIELD] ?? null;
          const euro =
            typeof euroRaw === 'number'
              ? euroRaw
              : Number.isFinite(Number(euroRaw))
              ? Number(euroRaw)
              : null;
          if (typeof euro === 'number') {
            const rateRes = await fetch('/api/proxy?endpoint=euro', {
              cache: 'no-store',
            });
            const rateJson = rateRes.ok ? await rateRes.json() : null;
            const rate = typeof rateJson?.rate === 'number' ? rateJson.rate : 50;
            priceUAH = Math.round(euro * rate);
          }
        } catch {}
      }
    }

    const name =
      typeof nameRaw === 'string'
        ? nameRaw.replace(/\s*\(.*?\)/g, '')
        : String(nameRaw || trimmed);

    const quantity =
      typeof qtyRaw === 'number'
        ? qtyRaw
        : Number.isFinite(Number(qtyRaw))
        ? Number(qtyRaw)
        : undefined;

    const codeValue = typeof codeRaw === 'string' ? codeRaw : String(codeRaw);

    return {
      name: name || trimmed,
      code: codeValue || undefined,
      article: articleRaw || trimmed || undefined,
      producer: producerRaw || undefined,
      quantity,
      price: priceUAH,
      link: articleRaw
        ? `/katalog?search=${encodeURIComponent(articleRaw)}&filter=article`
        : codeValue
        ? `/katalog?search=${encodeURIComponent(codeValue)}&filter=code`
        : undefined,
    };
  };

  const sendProductCard = async () => {
    if (!selectedUserId) return;
    const article = productArticle.trim();
    if (!article) return;

    setProductLoading(true);
    setProductError(null);

    try {
      const product = await fetchProductByArticle(article);
      if (!product) {
        setProductError('Товар не знайдено');
        return;
      }

      await addDoc(collection(db, 'messages'), {
        userId: selectedUserId,
        text: product.name || product.article || product.code || 'Product card',
        sender: 'manager',
        createdAt: new Date(),
        readByAdmin: true,
        readByUser: false,
        textRead: false,
        type: 'product',
        product,
      });

      setProductArticle('');
      setShowProductForm(false);
    } catch {
      setProductError('Не вдалося завантажити товар');
    } finally {
      setProductLoading(false);
    }
  };

  const deleteChat = async (uid: string) => {
    const userMessages = messages.filter((m) => m.userId === uid);
    for (const m of userMessages) {
      await deleteDoc(doc(db, 'messages', m.id));
    }
    setSelectedUserId(null);
  };

  const deleteMessage = async (messageId: string) => {
    await deleteDoc(doc(db, 'messages', messageId));
  };

  const markOrderViewed = async (orderId: string) => {
    await updateDoc(doc(db, 'orders', orderId), { read: true });
  };

  const markOrderCompleted = async (orderId: string) => {
    await updateDoc(doc(db, 'orders', orderId), { completed: true, read: true });
  };

  const toggleOrderExpand = async (orderId: string, isRead?: boolean) => {
    setExpandedOrderId((p) => (p === orderId ? null : orderId));
    if (!isRead) {
      await markOrderViewed(orderId);
    }
  };

  const markCallProcessed = async (callId: string) => {
    await updateDoc(doc(db, 'zvyaz', callId), { processed: true, read: true });
  };

  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const filteredOrders = orders.filter((o) => {
    if (!normalizedOrderSearch) return true;
    return (o.phone ?? '').toLowerCase().includes(normalizedOrderSearch);
  });
  const selectedDisplayName = selectedUserId
    ? userPhoneMap[selectedUserId] ?? selectedUserId
    : null;
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMobileDevice(
      typeof window !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isOpen || !isMounted) return null;

  return (
    <div
      className="fixed z-50 left-3 right-3 top-24 bottom-auto h-[70vh] rounded-2xl shadow-2xl border border-slate-600/60 flex flex-col bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 backdrop-blur-xl md:left-6 md:right-auto md:top-20 md:bottom-6 md:w-[520px] md:h-[70vh] md:rounded-3xl"
      style={{
        backgroundSize: '200% 200%',
        animation: 'adminGradient 12s ease infinite',
      }}
    >
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/10 text-white rounded-t-2xl md:rounded-t-3xl">
        <span className="flex items-center gap-2 font-semibold text-sm text-slate-100">
          <ChatBubbleBottomCenterTextIcon className="w-4 h-4" />
          Панель адміністратора
        </span>
        <button
          onClick={onClose}
          className="text-slate-300 hover:text-white transition"
          aria-label="Close admin panel"
        >
          Закрити
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 p-2 bg-white/5 border-b border-white/10 sticky top-0 z-10">
        <Tab
          icon={<ChatBubbleBottomCenterTextIcon className="w-5 h-5" />}
          label="Повідомлення"
          count={unreadMessages}
          active={tab === 'messages'}
          onClick={() => setTab('messages')}
        />
        <Tab
          icon={<ShoppingBagIcon className="w-5 h-5" />}
          label="Замовлення"
          count={unreadOrders}
          active={tab === 'orders'}
          onClick={() => setTab('orders')}
        />
        <Tab
          icon={<PhoneIcon className="w-5 h-5" />}
          label="Дзвінки"
          count={unreadCalls}
          active={tab === 'calls'}
          onClick={() => setTab('calls')}
        />
      </div>

      <main className="flex-1 overflow-y-auto p-3 bg-slate-900/40 text-slate-100">
        {tab === 'messages' && (
          <>
            {!selectedUserId ? (
              <div className="space-y-2">
                {[...new Set(messages.map((m) => m.userId))].map((uid) => {
                  const unread = messages.filter(
                    (m) =>
                      m.userId === uid &&
                      m.sender === 'user' &&
                      !m.readByAdmin
                  ).length;
                  const last = messages.filter((m) => m.userId === uid).at(-1);
                  const lastText =
                    last?.type === 'product'
                      ? last?.product?.name ??
                        last?.product?.article ??
                        last?.product?.code ??
                        last?.text
                      : last?.text;
                  const displayName = userPhoneMap[uid] ?? uid;
                  const hasReply = messages.some(
                    (m) => m.userId === uid && m.sender === 'manager'
                  );
                  return (
                    <div
                      key={uid}
                      onClick={() => openChat(uid)}
                      className="bg-slate-800/70 border border-white/5 p-3 rounded-xl flex justify-between cursor-pointer hover:brightness-110 transition text-slate-100"
                    >
                      <div className="truncate">
                        <p className="font-medium text-sm truncate">{displayName}</p>
                        <p className="text-xs text-slate-300 truncate">
                          {lastText}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            hasReply
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : 'bg-amber-500/20 text-amber-200'
                          }`}
                        >
                          {hasReply ? 'Є відповідь' : 'Без відповіді'}
                        </span>
                        {unread > 0 && (
                          <span className="inline-flex items-center justify-center min-w-5 h-5 bg-rose-500 text-white text-[10px] px-1.5 rounded-full leading-none">
                            {unread}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteChat(uid);
                          }}
                          className="text-slate-400 hover:text-rose-400"
                          title="Видалити чат"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setSelectedUserId(null)}>
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>
                  <span className="font-medium text-sm truncate">
                    {selectedDisplayName}
                  </span>
                  <span className="ml-auto" />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {messages
                    .filter((m) => m.userId === selectedUserId)
                    .map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.sender === 'user'
                            ? 'justify-start'
                            : 'justify-end'
                        }`}
                      >
                        <div
                          className={`px-3 py-2 rounded-2xl text-sm max-w-[80%] ${
                            m.sender === 'user'
                              ? 'bg-white/10 text-slate-100 border border-white/10'
                              : 'bg-sky-600 text-white'
                          }`}
                        >
                          {m.type === 'product' && m.product ? (
                            <ChatProductCard product={m.product} />
                          ) : (
                            m.text
                          )}
                        </div>
                        <button
                          onClick={() => deleteMessage(m.id)}
                          className="ml-2 text-slate-400 hover:text-rose-400"
                          title="Видалити повідомлення"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  <div ref={messagesEndRef} />
                </div>

                {showProductForm && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={productArticle}
                        onChange={(e) => {
                          setProductArticle(e.target.value);
                          if (productError) setProductError(null);
                        }}
                        className="rounded-lg px-3 py-2 text-[16px] sm:text-sm bg-white/10 border border-white/10 text-white placeholder-slate-300 focus:border-sky-400 focus:outline-none"
                        placeholder="Артикул"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            sendProductCard();
                          }
                        }}
                      />
                      <button
                        onClick={sendProductCard}
                        disabled={productLoading}
                        className="rounded-lg bg-emerald-500/80 px-3 py-2 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {productLoading ? 'Завантаження…' : 'Надіслати карточку'}
                      </button>
                    </div>
                    {productError && (
                      <div className="mt-2 text-[11px] text-rose-200">
                        {productError}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => setShowProductForm(false)}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                                        onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    className="flex-1 rounded-full px-3 py-2 text-[16px] sm:text-sm bg-white/10 border border-white/10 text-white placeholder-slate-300 focus:border-sky-400 focus:outline-none"
                    placeholder="Написати повідомлення..."
                  />
                  <button
                    onClick={() => setShowProductForm((p) => !p)}
                    className="bg-white/10 text-white p-2 rounded-full hover:bg-white/20 transition"
                    title="Надіслати карточку"
                  >
                    <ShoppingBagIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={sendReply}
                    className="bg-sky-600 text-white p-2 rounded-full hover:bg-sky-700 transition"
                  >
                    <PaperAirplaneIcon className="w-5 h-5 rotate-90" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'orders' && (
          <>
            <div className="mb-3">
              <input
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-[16px] sm:text-sm bg-white/10 border border-white/10 text-white placeholder-slate-300 focus:border-sky-400 focus:outline-none"
                placeholder="Пошук по телефону"
                data-search="true"
              />
            </div>
            {filteredOrders.length === 0 && (
              <div className="text-sm text-slate-300 bg-slate-800/70 border border-white/5 rounded-xl p-3">
                Замовлень не знайдено
              </div>
            )}
            {filteredOrders.map((o) => {
              const statusLabel = o.completed
                ? 'Виконано'
                : o.read
                ? 'Переглянуто'
                : 'Новий';
              const statusClass = o.completed
                ? 'bg-emerald-500/20 text-emerald-200'
                : o.read
                ? 'bg-amber-500/20 text-amber-200'
                : 'bg-sky-500/20 text-sky-200';

              return (
                <div key={o.id} className="bg-slate-800/70 border border-white/5 p-3 rounded-xl mb-2 text-slate-100">
                  <div className="flex justify-between items-center gap-2">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => toggleOrderExpand(o.id, o.read)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{o.name}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => markOrderViewed(o.id)}
                        className={`text-amber-300 hover:text-amber-200 ${
                          o.read ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        title="Позначити як переглянуте"
                        disabled={o.read}
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => markOrderCompleted(o.id)}
                        className={`text-emerald-300 hover:text-emerald-200 ${
                          o.completed ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        title="Позначити як виконане"
                        disabled={o.completed}
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                      </button>
                      <button onClick={() => toggleOrderExpand(o.id, true)}>
                        {expandedOrderId === o.id ? <ChevronUp /> : <ChevronDown />}
                      </button>
                    </div>
                  </div>
                  {expandedOrderId === o.id && (
                    <div className="mt-2 text-sm space-y-2 text-slate-200">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <p>Телефон: {o.phone}</p>
                        <p>Оплата: {o.paymentMethod}</p>
                        <p>Доставка: {o.deliveryMethod}</p>
                        {o.city && <p>Місто: {o.city}</p>}
                        {o.warehouse &&
                          /Нова Пошта|Пошта/i.test(o.deliveryMethod ?? '') && (
                            <p>Відділення: {o.warehouse}</p>
                          )}
                        {o.lvivStreet &&
                          (/Льв/i.test(o.city ?? '') ||
                            /Льв/i.test(o.deliveryMethod ?? '')) && (
                            <p>Вулиця: {o.lvivStreet}</p>
                          )}
                        <p className="font-semibold">Сума: {o.totalAmount} грн</p>
                      </div>
                      {o.cartItems?.map((i, idx) => (
                        <p key={idx} className="text-xs text-slate-300">
                          {i.name} x {i.quantity} — {i.price}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === 'calls' &&
          calls.map((c) => {
            const callStatus = c.processed ? 'Виконано' : 'Новий';
            const callStatusClass = c.processed
              ? 'bg-emerald-500/20 text-emerald-200'
              : 'bg-sky-500/20 text-sky-200';

            return (
              <div key={c.id} className="bg-slate-800/70 border border-white/5 p-3 rounded-xl mb-2 text-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${callStatusClass}`}>
                    {callStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-300">{c.phone}</p>
                  <div className="flex items-center gap-2">
                    {isMobileDevice ? (
                      <a
                        href={`tel:${c.phone}`}
                        className="text-xs px-2 py-1 rounded-lg border border-sky-400/40 text-sky-200 hover:bg-white/10"
                      >
                        Дзвінок
                      </a>
                    ) : (
                      <button
                        onClick={() => navigator.clipboard?.writeText(c.phone)}
                        className="text-xs px-2 py-1 rounded-lg border border-sky-400/40 text-sky-200 hover:bg-white/10"
                      >
                        Скопіювати
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs mt-1">{c.message}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => markCallProcessed(c.id)}
                    className={`text-xs px-2 py-1 rounded-lg border ${
                      c.processed
                        ? 'text-slate-400 border-white/10'
                        : 'text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/10'
                    }`}
                    disabled={c.processed}
                  >
                    Виконано
                  </button>
                </div>
              </div>
            );
          })}
      </main>
    </div>
  );
}

function Tab({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center h-12 rounded-xl transition ${
        active
          ? 'bg-white/10 text-white shadow'
          : 'text-slate-300 hover:bg-white/5'
      }`}
    >
      {icon}
      {count > 0 && (
        <span className="absolute top-1 right-3 bg-rose-500 text-white text-[10px] px-1.5 rounded-full">
          {count}
        </span>
      )}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

function ChatProductCard({ product }: { product: ProductCard }) {
  return (
    <div className="min-w-[220px] max-w-[320px] rounded-xl border border-white/10 bg-slate-900/40 p-3 text-left text-slate-100">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        Товар
      </div>
      <div className="text-sm font-semibold">{product.name}</div>
      {product.article && (
        <div className="mt-1 text-xs text-slate-300">Артикул: {product.article}</div>
      )}
      {product.code && (
        <div className="mt-1 text-xs text-slate-300">Код: {product.code}</div>
      )}
      {product.producer && (
        <div className="mt-1 text-xs text-slate-300">
          Виробник: {product.producer}
        </div>
      )}
      {typeof product.quantity === 'number' && (
        <div className="mt-1 text-xs text-slate-300">
          В наявності: {product.quantity}
        </div>
      )}
      {typeof product.price === 'number' && (
        <div className="mt-1 text-xs text-slate-300">
          Ціна: {product.price.toLocaleString('uk-UA')} грн
        </div>
      )}
      {product.link && (
        <a
          href={product.link}
          className="mt-2 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-100 hover:bg-white/20"
        >
          Відкрити
        </a>
      )}
    </div>
  );
}
