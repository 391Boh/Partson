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
  UsersIcon,
} from '@heroicons/react/24/outline';
import { ChevronDown, ChevronUp, Copy, MessageCircle, ShoppingBag } from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
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
  type?: 'text' | 'product' | 'image';
  product?: ProductCard;
  imageUrl?: string;
  imageName?: string;
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
  uid?: string;
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

interface UserRecord {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  code?: string;
  chatUserId?: string;
  vins: string[];
  isOnline?: boolean;
  lastSeenAt?: unknown;
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
  const [tab, setTab] = useState<'messages' | 'orders' | 'calls' | 'users'>(
    'messages'
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [calls, setCalls] = useState<CallRequest[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userPhoneMap, setUserPhoneMap] = useState<Record<string, string>>({});
  const [orderSearch, setOrderSearch] = useState('');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [productArticle, setProductArticle] = useState('');
  const [productError, setProductError] = useState<string | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderUserFilterId, setOrderUserFilterId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const managerPresenceSessionRef = useRef(
    `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

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
      const nextUsers: UserRecord[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data?.phone) {
          nextMap[d.id] = data.phone;
        }
        const codeCandidate =
          normalizeCode(data?.code) ||
          normalizeCode(data?.userCode) ||
          normalizeCode(data?.customerCode) ||
          normalizeCode(data?.clientCode) ||
          normalizeCode(data?.profileCode);
        const chatUserId =
          normalizeCode(data?.chatUserId) ||
          normalizeCode(data?.chat_user_id) ||
          normalizeCode(data?.chatId);
        const vins = normalizeVins(data?.vins ?? data?.VIN ?? data?.vin).filter(
          (vin, index, arr) => arr.indexOf(vin) === index
        );
        nextUsers.push({
          id: d.id,
          name: typeof data?.name === 'string' ? data.name : undefined,
          phone: typeof data?.phone === 'string' ? data.phone : undefined,
          email: typeof data?.email === 'string' ? data.email : undefined,
          code: codeCandidate,
          chatUserId,
          vins,
          isOnline: data?.isOnline === true,
          lastSeenAt: data?.lastSeenAt,
        });
      });
      setUserPhoneMap(nextMap);
      setUsers(nextUsers);
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

  useEffect(() => {
    if (!selectedUserId) return;

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedUserId]);

  useEffect(() => {
    if (!isOpen || tab !== 'messages' || !selectedUserId) return;

    const presenceRef = doc(db, 'chatPresence', selectedUserId);
    const sessionId = managerPresenceSessionRef.current;

    const publishPresence = async () => {
      try {
        await setDoc(
          presenceRef,
          {
            managerSessionIds: arrayUnion(sessionId),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        console.error('Не вдалося оновити присутність менеджера в чаті.');
      }
    };

    void publishPresence();

    const heartbeatId =
      typeof window === 'undefined'
        ? null
        : window.setInterval(() => {
            void publishPresence();
          }, 20_000);

    return () => {
      if (heartbeatId !== null && typeof window !== 'undefined') {
        window.clearInterval(heartbeatId);
      }

      void setDoc(
        presenceRef,
        {
          managerSessionIds: arrayRemove(sessionId),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {
        console.error('Не вдалося очистити присутність менеджера в чаті.');
      });
    };
  }, [isOpen, selectedUserId, tab]);

  const openChat = async (uid: string) => {
    setSelectedUserId(uid);
    setReplyText('');
    setShowProductForm(false);
    setProductArticle('');
    setProductError(null);
    const unread = messages.filter(
      (m) => m.userId === uid && m.sender === 'user' && !m.readByAdmin
    );
    if (unread.length > 0) {
      try {
        await Promise.all(
          unread.map((m) =>
            updateDoc(doc(db, 'messages', m.id), { readByAdmin: true })
          )
        );
      } catch {
        console.error('Не вдалося відзначити прочитання повідомлень.');
      }
    }
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
      100
    );
  };

  const normalizeCode = (raw: unknown): string | undefined => {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      return trimmed || undefined;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return String(raw).trim();
    }
    return undefined;
  };

  const normalizePhoneDigits = (raw?: string) => (raw || '').replace(/\D/g, '');

  const normalizeVins = (raw: unknown): string[] => {
    if (!raw) return [];

    if (typeof raw === 'string') {
      return raw
        .split(/[,;\n]/)
        .map((vin) => vin.trim())
        .filter(Boolean);
    }

    if (Array.isArray(raw)) {
      return raw
        .filter((vin): vin is string => typeof vin === 'string')
        .map((vin) => vin.trim())
        .filter(Boolean);
    }

    if (typeof raw === 'object') {
      return Object.values(raw as Record<string, unknown>)
        .map((vin) => normalizeCode(vin))
        .filter((vin): vin is string => Boolean(vin));
    }

    return [];
  };

  const getTimestampMs = (raw: unknown) => {
    if (!raw) return null;
    if (typeof raw === 'string' || raw instanceof Date || typeof raw === 'number') {
      const value = new Date(raw).getTime();
      return Number.isFinite(value) ? value : null;
    }
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'toDate' in (raw as { toDate?: unknown }) &&
      typeof (raw as { toDate?: () => Date }).toDate === 'function'
    ) {
      const value = (raw as { toDate: () => Date }).toDate().getTime();
      return Number.isFinite(value) ? value : null;
    }
    return null;
  };

  const getUserByChatId = (uid: string) =>
    users.find((u) => u.chatUserId === uid || u.id === uid);

  const getUserChatId = (user: UserRecord) => user.chatUserId || user.id;

  const isUserOnline = (user: UserRecord) => {
    if (user.isOnline !== true) return false;
    const lastSeenMs = getTimestampMs(user.lastSeenAt);
    if (!lastSeenMs) return true;
    return Date.now() - lastSeenMs <= 1000 * 90;
  };

  const getUserLabel = (uid: string) => {
    const matchedUser = getUserByChatId(uid);
    return (
      matchedUser?.name ||
      matchedUser?.code ||
      matchedUser?.phone ||
      (matchedUser ? userPhoneMap[matchedUser.id] : undefined) ||
      userPhoneMap[uid] ||
      uid
    );
  };

  const copyUserCode = async (uid: string, code: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedUserId(uid);
      setTimeout(() => setCopiedUserId(null), 1200);
    } catch {
      console.error('Не вдалося скопіювати код користувача.');
    }
  };

  const openUserOrders = (uid: string) => {
    setOrderUserFilterId(uid);
    setTab('orders');
  };

  const openUserChat = (uid: string) => {
    const userRecord = users.find((user) => user.id === uid);
    const targetChatId = userRecord ? getUserChatId(userRecord) : uid;
    setTab('messages');
    void openChat(targetChatId);
  };

  const clearOrderUserFilter = () => {
    setOrderUserFilterId(null);
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
    const NAME_FIELDS = ["Наименование", "НоменклатураНаименование"];
    const CODE_FIELDS = ["Код", "НоменклатураКод", "ID"];
    const ARTICLE_FIELDS = ["НомерПоКаталогу", "Артикул"];
    const PRODUCER_FIELDS = ["ПроизводительНаименование", "Виробник"];
    const QTY_FIELDS = ["Количество", "Кількість"];
    const LIMIT_FIELD = "Лимит";
    const PAGE_ALIAS = "page";
    const PRICE_CODE_FIELD = "Код";
    const PRICE_VALUE_FIELDS = ["ЦінаПрод", "ЦенаПрод", "Цена", "Ціна"];

    const readString = (
      source: Record<string, unknown>,
      keys: readonly string[],
      fallback = ""
    ) => {
      for (const key of keys) {
        const value = source?.[key];
        if (typeof value === "string") {
          const trimmedValue = value.trim();
          if (trimmedValue) return trimmedValue;
        }
      }
      return fallback;
    };

    const readNumber = (source: Record<string, unknown>, keys: readonly string[]) => {
      for (const key of keys) {
        const value = source?.[key];
        const num =
          typeof value === "number" && Number.isFinite(value) ? value : Number(value);
        if (Number.isFinite(num)) return num;
      }
      return undefined;
    };

    const extractArray = (raw: unknown): Record<string, unknown>[] | null => {
      if (Array.isArray(raw)) return raw as Record<string, unknown>[];
      if (raw && typeof raw === "object" && Array.isArray((raw as any).items)) {
        return (raw as any).items as Record<string, unknown>[];
      }
      return null;
    };

    const tryFetch = async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/proxy?endpoint=getdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCars: [],
          selectedCategories: [],
          [PAGE_FIELD]: 1,
          [LIMIT_FIELD]: 10,
          [PAGE_ALIAS]: 1,
          ...payload,
        }),
      });
      if (!res.ok) return null;
      const raw = await res.json();
      const list = extractArray(raw);
      if (!list || list.length === 0) return null;
      return list;
    };

    const candidates: Record<string, unknown>[] = [
      {
        [ARTICLE_FIELDS[0]]: trimmed,
        [ARTICLE_FIELDS[1]]: trimmed,
        [CODE_FIELDS[0]]: trimmed,
        [CODE_FIELDS[1]]: trimmed,
        [CODE_FIELDS[2]]: trimmed,
        [NAME_FIELDS[0]]: trimmed,
        [NAME_FIELDS[1]]: trimmed,
      },
      { [CODE_FIELDS[0]]: trimmed, [CODE_FIELDS[1]]: trimmed, [CODE_FIELDS[2]]: trimmed },
      { [NAME_FIELDS[0]]: trimmed, [NAME_FIELDS[1]]: trimmed },
    ];

    let list: Record<string, unknown>[] | null = null;
    for (const payload of candidates) {
      list = await tryFetch(payload);
      if (list && list.length > 0) break;
    }
    if (!list || list.length === 0) return null;

    const normalize = (v: unknown) =>
      typeof v === "string" ? v.replace(/\s+/g, " ").trim().toLowerCase() : "";

    const needle = normalize(trimmed);
    const item =
      list.find((it) => {
        const rec = it as Record<string, unknown>;
        const art =
          normalize(rec[ARTICLE_FIELDS[0]]) || normalize(rec[ARTICLE_FIELDS[1]]);
        const code =
          normalize(rec[CODE_FIELDS[0]]) ||
          normalize(rec[CODE_FIELDS[1]]) ||
          normalize(rec[CODE_FIELDS[2]]);
        const name =
          normalize(rec[NAME_FIELDS[0]]) || normalize(rec[NAME_FIELDS[1]]);
        return art === needle || code === needle || name === needle;
      }) || list[0];
    if (!item || typeof item !== 'object') return null;

    const record = item as Record<string, unknown>;
    const nameRaw = readString(record, NAME_FIELDS, trimmed);
    const codeRaw = readString(record, CODE_FIELDS, trimmed);
    const articleRaw = readString(record, ARTICLE_FIELDS, trimmed);
    const producerRaw = readString(record, PRODUCER_FIELDS, '');
    const qtyRaw = readNumber(record, QTY_FIELDS);

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
          const json = JSON.parse(text) as Record<string, unknown>;
          const euro = readNumber(json, PRICE_VALUE_FIELDS);
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

    const name = (nameRaw || trimmed).replace(/\s*\(.*?\)/g, '');
    const quantity = qtyRaw;
    const codeValue = codeRaw;

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
  const normalizedOrderSearchDigits = orderSearch.replace(/\D/g, '');
  const filteredOrders = orders.filter((o) => {
    const phone = o.phone ?? '';
    const phoneDigits = normalizePhoneDigits(phone);
    const uid = o.uid;
    const matchesSearch = normalizedOrderSearch
      ? phone.toLowerCase().includes(normalizedOrderSearch) ||
        (normalizedOrderSearchDigits && phoneDigits.includes(normalizedOrderSearchDigits))
      : true;

    if (!matchesSearch) return false;
    if (!orderUserFilterId) return true;

    const userPhone = normalizePhoneDigits(userPhoneMap[orderUserFilterId]);
    if (uid && uid === orderUserFilterId) return true;
    if (!userPhone) return false;
    return phoneDigits.includes(userPhone);
  });
  const selectedDisplayName = selectedUserId
    ? getUserLabel(selectedUserId)
    : null;
  const selectedMessages = selectedUserId
    ? messages.filter((m) => m.userId === selectedUserId)
    : [];
  const filteredOrderUserName = orderUserFilterId
    ? getUserLabel(orderUserFilterId)
    : null;
  const filteredOrderUserPhone =
    orderUserFilterId && userPhoneMap[orderUserFilterId]
      ? normalizePhoneDigits(userPhoneMap[orderUserFilterId])
      : '';
  const normalizedUserSearch = userSearch.trim().toLowerCase();
  const normalizedUserSearchDigits = normalizePhoneDigits(userSearch);
  const filteredUsers = users.filter((u) => {
    if (!normalizedUserSearch) return true;

    const searchable =
      `${u.name || ''} ${u.phone || ''} ${u.email || ''} ${u.code || ''} ${u.chatUserId || ''} ${u.id} ${u.vins.join(' ')}`.toLowerCase();
    if (searchable.includes(normalizedUserSearch)) return true;
    if (!normalizedUserSearchDigits) return false;

    return (
      normalizePhoneDigits(u.phone).includes(normalizedUserSearchDigits) ||
      normalizePhoneDigits(u.code).includes(normalizedUserSearchDigits) ||
      normalizePhoneDigits(u.chatUserId).includes(normalizedUserSearchDigits) ||
      normalizePhoneDigits(u.id).includes(normalizedUserSearchDigits)
    );
  });
  const sortedUsers = [...filteredUsers].sort((left, right) => {
    const leftOnline = isUserOnline(left);
    const rightOnline = isUserOnline(right);
    if (leftOnline !== rightOnline) {
      return Number(rightOnline) - Number(leftOnline);
    }

    const leftSeen = getTimestampMs(left.lastSeenAt) ?? 0;
    const rightSeen = getTimestampMs(right.lastSeenAt) ?? 0;
    if (leftSeen !== rightSeen) {
      return rightSeen - leftSeen;
    }

    return (left.name || left.phone || left.email || left.id).localeCompare(
      right.name || right.phone || right.email || right.id,
      'uk'
    );
  });
  const onlineUsersCount = sortedUsers.filter(isUserOnline).length;
  const userCode = (item: UserRecord) => item.code || item.id;
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
      className="fixed z-50 left-3 right-3 top-24 bottom-auto h-[70vh] max-h-[calc(100vh-5.5rem)] rounded-2xl shadow-2xl border border-slate-600/60 flex flex-col bg-gradient-to-br from-slate-800 via-slate-700 to-sky-700 backdrop-blur-xl md:left-6 md:right-auto md:top-20 md:w-[520px] md:rounded-3xl"
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

      <div className="grid grid-cols-4 gap-1 p-2 bg-white/5 border-b border-white/10 sticky top-0 z-10">
        <Tab
          icon={<ChatBubbleBottomCenterTextIcon className="w-5 h-5" />}
          label="Повідомлення"
          count={unreadMessages}
          active={tab === 'messages'}
          onClick={() => setTab('messages')}
        />
        <Tab
          icon={<UsersIcon className="w-5 h-5" />}
          label="Користувачі"
          count={users.length}
          active={tab === 'users'}
          onClick={() => setTab('users')}
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
                      : last?.type === 'image'
                      ? last?.imageName
                        ? `Фото: ${last.imageName}`
                        : 'Фото'
                      : last?.text;
                  const displayName = getUserLabel(uid);
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
                  {selectedMessages.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-slate-300">
                      У цього користувача ще немає повідомлень. Ви можете написати першим.
                    </div>
                  )}
                  {selectedMessages.map((m) => {
                    const isRichCard =
                      (m.type === 'product' && Boolean(m.product)) ||
                      (m.type === 'image' && Boolean(m.imageUrl));

                    return (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.sender === 'user'
                            ? 'justify-start'
                            : 'justify-end'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] ${
                            isRichCard
                              ? 'bg-transparent p-0 shadow-none'
                              : `rounded-2xl px-3 py-2 text-sm ${
                                  m.sender === 'user'
                                    ? 'border border-white/10 bg-white/10 text-slate-100'
                                    : 'bg-sky-600 text-white'
                                }`
                          }`}
                        >
                          {m.type === 'product' && m.product ? (
                            <ChatProductCard product={m.product} />
                          ) : m.type === 'image' && m.imageUrl ? (
                            <ChatImageCard
                              imageUrl={m.imageUrl}
                              imageName={m.imageName ?? m.text}
                              sender={m.sender}
                            />
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
                    );
                  })}
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

        {tab === 'users' && (
          <div className="space-y-2">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-[16px] sm:text-sm bg-white/10 border border-white/10 text-white placeholder-slate-300 focus:border-sky-400 focus:outline-none"
              placeholder="Пошук по імені, телефону, email, коду або VIN"
            />

            {sortedUsers.length === 0 && (
              <div className="text-sm text-slate-300 bg-slate-800/70 border border-white/5 rounded-xl p-3">
                Користувачів не знайдено
              </div>
            )}
            {sortedUsers.length > 0 && (
              <div className="rounded-xl border border-sky-200/20 bg-white/5 p-2 text-[11px] text-slate-300 flex items-center justify-between gap-2">
                <span>Знайдено користувачів: {sortedUsers.length}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" />
                  Онлайн: {onlineUsersCount}
                </span>
              </div>
            )}
            {sortedUsers.map((userItem) => {
              const userChatId = getUserChatId(userItem);
              const unreadFromUser = messages.filter(
                (m) =>
                  m.userId === userChatId &&
                  m.sender === 'user' &&
                  !m.readByAdmin
              ).length;
              const online = isUserOnline(userItem);
              return (
                <div
                  key={userItem.id}
                  className="bg-slate-800/70 border border-white/5 p-3 rounded-xl mb-2 w-full text-left flex flex-col gap-2 text-slate-100 transition-all hover:border-sky-300/40 hover:bg-slate-700/80 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                >
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          online
                            ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]'
                            : 'bg-slate-500/70'
                        }`}
                      />
                      <p className="font-semibold text-sm truncate">
                        {userItem.name || userItem.phone || 'Користувач'}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          online
                            ? 'bg-emerald-500/15 text-emerald-200'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {online ? 'Онлайн' : 'Офлайн'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-200">
                      Код: {userCode(userItem)}
                    </p>
                    {userItem.phone && (
                      <p className="text-xs text-slate-300 truncate">
                        Телефон: {userItem.phone}
                      </p>
                    )}
                    {userItem.email && (
                      <p className="text-[11px] text-slate-400 truncate">
                        {userItem.email}
                      </p>
                    )}
                    {userItem.vins.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {userItem.vins.slice(0, 2).map((vin) => (
                          <span
                            key={vin}
                            className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-0.5 font-mono text-[10px] text-sky-100"
                          >
                            VIN {vin}
                          </span>
                        ))}
                        {userItem.vins.length > 2 && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                            +{userItem.vins.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {unreadFromUser > 0 && (
                      <span className="inline-flex items-center justify-center min-w-5 h-5 bg-emerald-500 text-white text-[10px] px-1.5 rounded-full leading-none">
                        {unreadFromUser}
                      </span>
                    )}

                    {copiedUserId === userItem.id && (
                      <span className="text-[10px] rounded-full bg-emerald-500/90 px-2 py-0.5 text-white">
                        Скопійовано
                      </span>
                    )}

                    <button
                      onClick={() => copyUserCode(userItem.id, userCode(userItem))}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/15"
                      title="Копіювати код користувача"
                    >
                      <Copy size={16} />
                    </button>

                    <button
                      onClick={() => openUserOrders(userItem.id)}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-sky-200 transition hover:bg-white/15"
                      title="Відкрити замовлення користувача"
                    >
                      <ShoppingBag size={16} />
                    </button>

                    <button
                      onClick={() => openUserChat(userItem.id)}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-sky-300 transition hover:bg-white/15"
                      title="Відкрити чат з користувачем"
                    >
                      <MessageCircle size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'orders' && (
          <>
            {filteredOrderUserName && (
              <div className="mb-3 rounded-xl border border-sky-200/30 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 flex items-center justify-between gap-2">
                <span>Показано замовлення: {filteredOrderUserName}</span>
                <button
                  onClick={clearOrderUserFilter}
                  className="text-[11px] rounded-lg border border-white/15 px-2 py-1 text-white/90 hover:bg-white/10"
                >
                  Показати всі
                </button>
              </div>
            )}
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
                {orderUserFilterId &&
                !filteredOrderUserPhone &&
                !orders.some((o) => o.uid === orderUserFilterId)
                  ? 'У цього користувача не збережений номер телефону'
                  : 'Замовлень не знайдено'}
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

function ChatImageCard({
  imageUrl,
  imageName,
  sender,
}: {
  imageUrl: string;
  imageName?: string;
  sender: 'user' | 'manager';
}) {
  const isUser = sender === 'user';

  return (
    <a
      href={imageUrl}
      target="_blank"
      rel="noreferrer"
      className={`group block min-w-[220px] max-w-[320px] overflow-hidden rounded-xl border ${
        isUser
          ? 'border-white/10 bg-white/5'
          : 'border-sky-300/25 bg-sky-950/40'
      } shadow-[0_16px_30px_rgba(2,6,23,0.22)]`}
    >
      <div className="overflow-hidden bg-slate-950/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={imageName || 'Фото'}
          loading="lazy"
          className="max-h-[240px] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <div className="px-3 py-2 text-[11px] text-slate-100">
        <span className="block truncate">{imageName || 'Фото'}</span>
      </div>
    </a>
  );
}
