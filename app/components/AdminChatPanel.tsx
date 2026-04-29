'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChatBubbleBottomCenterTextIcon,
  ShoppingBagIcon,
  PhoneIcon,
  TrashIcon,
  CheckCircleIcon,
  EyeIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Mail,
  MessageCircle,
  PackagePlus,
  PhoneCall,
  Search,
  SendHorizontal,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  Users2,
  X,
} from 'lucide-react';
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
import { COPY_PROTECTION_ENABLED } from 'app/lib/copy-protection';
import { db } from '../../firebase';

interface Message {
  id: string;
  userId: string;
  text: string;
  sender: 'user' | 'manager';
  createdAt: unknown;
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
  createdAt: unknown;
  read?: boolean;
  completed?: boolean;
}

interface CallRequest {
  id: string;
  name: string;
  phone: string;
  message: string;
  createdAt: unknown;
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

const formatTimestampLabel = (raw: unknown) => {
  const timestampMs = getTimestampMs(raw);
  if (!timestampMs) return 'Щойно';

  const value = new Date(timestampMs);
  const now = new Date();
  const sameDay =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  }

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

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
  const [chatPresenceMap, setChatPresenceMap] = useState<
    Record<string, { userIsOnline: boolean; userLastSeenAt?: unknown }>
  >({});
  const [userPhoneMap, setUserPhoneMap] = useState<Record<string, string>>({});
  const [orderSearch, setOrderSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [callSearch, setCallSearch] = useState('');

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
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) }))
        )
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      (snap) =>
        setOrders(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, "id">) }))
        )
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'zvyaz'), orderBy('createdAt', 'desc')),
      (snap) =>
        setCalls(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CallRequest, "id">) }))
        )
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      const nextMap: Record<string, string> = {};
      const nextUsers: UserRecord[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        if (typeof data.phone === "string" && data.phone.trim()) {
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

  useEffect(() => {
    return onSnapshot(collection(db, 'chatPresence'), (snap) => {
      const nextPresenceMap: Record<
        string,
        { userIsOnline: boolean; userLastSeenAt?: unknown }
      > = {};

      snap.docs.forEach((snapshotDoc) => {
        const data = snapshotDoc.data() as Record<string, unknown>;
        nextPresenceMap[snapshotDoc.id] = {
          userIsOnline: data?.userIsOnline === true,
          userLastSeenAt: data?.userLastSeenAt ?? data?.lastSeenAt,
        };
      });

      setChatPresenceMap(nextPresenceMap);
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

  const getUserChatId = (user: UserRecord) => user.chatUserId || user.id;

  const allUsers = (() => {
    const nextUsers = [...users];
    const seenChatIds = new Set(nextUsers.map((user) => getUserChatId(user)).filter(Boolean));

    for (const chatId of new Set([
      ...messages.map((message) => message.userId),
      ...Object.keys(chatPresenceMap),
    ])) {
      const normalizedChatId = (chatId || '').trim();
      if (!normalizedChatId || seenChatIds.has(normalizedChatId)) continue;

      seenChatIds.add(normalizedChatId);
      nextUsers.push({
        id: normalizedChatId,
        chatUserId: normalizedChatId,
        vins: [],
        isOnline: chatPresenceMap[normalizedChatId]?.userIsOnline === true,
        lastSeenAt: chatPresenceMap[normalizedChatId]?.userLastSeenAt,
      });
    }

    return nextUsers;
  })();

  const getUserByChatId = (uid: string) =>
    allUsers.find((u) => u.chatUserId === uid || u.id === uid);

  const getResolvedUserPresence = (user: UserRecord) => {
    const presence = chatPresenceMap[getUserChatId(user)];
    return {
      isOnline: presence?.userIsOnline ?? user.isOnline ?? false,
      lastSeenAt: presence?.userLastSeenAt ?? user.lastSeenAt,
    };
  };

  const isUserOnline = (user: UserRecord) => {
    const presence = getResolvedUserPresence(user);
    if (presence.isOnline !== true) return false;
    const lastSeenMs = getTimestampMs(presence.lastSeenAt);
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
    if (COPY_PROTECTION_ENABLED || !code) {
      return;
    }

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

    const NAME_FIELDS = ["Наименование", "НоменклатураНаименование", "name"];
    const CODE_FIELDS = ["Код", "НоменклатураКод", "ID", "code"];
    const ARTICLE_FIELDS = ["НомерПоКаталогу", "Артикул", "article"];
    const PRODUCER_FIELDS = ["ПроизводительНаименование", "Виробник", "producer"];
    const QTY_FIELDS = ["Количество", "Кількість", "quantity"];
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
      if (raw && typeof raw === "object") {
        const items = (raw as { items?: unknown }).items;
        if (Array.isArray(items)) return items as Record<string, unknown>[];
      }
      return null;
    };

    const tryFetch = async (searchFilter: "article" | "code" | "name") => {
      const res = await fetch('/api/catalog-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: 1,
          limit: 10,
          selectedCars: [],
          selectedCategories: [],
          searchQuery: trimmed,
          searchFilter,
          group: '',
          subcategory: '',
          producer: '',
          sortOrder: 'none',
        }),
      });
      if (!res.ok) return null;
      const raw = await res.json();
      const list = extractArray(raw);
      if (!list || list.length === 0) return null;
      return list;
    };

    const candidates: Array<"article" | "code" | "name"> = ["article", "code", "name"];

    let list: Record<string, unknown>[] | null = null;
    for (const searchFilter of candidates) {
      list = await tryFetch(searchFilter);
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
      ? `${o.name || ''} ${phone} ${o.city || ''} ${o.warehouse || ''} ${o.deliveryMethod || ''} ${o.paymentMethod || ''}`
          .toLowerCase()
          .includes(normalizedOrderSearch) ||
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
  const normalizedMessageSearch = messageSearch.trim().toLowerCase();
  const normalizedMessageSearchDigits = normalizePhoneDigits(messageSearch);
  const filteredUsers = allUsers.filter((u) => {
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

    const leftSeen = getTimestampMs(getResolvedUserPresence(left).lastSeenAt) ?? 0;
    const rightSeen = getTimestampMs(getResolvedUserPresence(right).lastSeenAt) ?? 0;
    if (leftSeen !== rightSeen) {
      return rightSeen - leftSeen;
    }

    return (left.name || left.phone || left.email || left.id).localeCompare(
      right.name || right.phone || right.email || right.id,
      'uk'
    );
  });
  const onlineUsersCount = sortedUsers.filter(isUserOnline).length;
  const messageThreads = [...new Set(messages.map((m) => m.userId))]
    .map((uid) => {
      const threadMessages = messages.filter((m) => m.userId === uid);
      const lastMessage = threadMessages.at(-1);
      const matchedUser = getUserByChatId(uid);
      const preview =
        lastMessage?.type === 'product'
          ? lastMessage?.product?.name ??
            lastMessage?.product?.article ??
            lastMessage?.product?.code ??
            lastMessage?.text ??
            ''
          : lastMessage?.type === 'image'
          ? lastMessage?.imageName
            ? `Фото: ${lastMessage.imageName}`
            : 'Фото'
          : lastMessage?.text ?? '';
      const unread = threadMessages.filter(
        (m) => m.sender === 'user' && m.readByAdmin !== true
      ).length;
      const hasReply = threadMessages.some((m) => m.sender === 'manager');
      const searchable = [
        getUserLabel(uid),
        matchedUser?.phone,
        matchedUser?.email,
        matchedUser?.code,
        matchedUser?.chatUserId,
        matchedUser?.id,
        matchedUser?.vins.join(' '),
        preview,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return {
        uid,
        unread,
        hasReply,
        preview,
        label: getUserLabel(uid),
        user: matchedUser,
        lastMessage,
        lastMessageMs: getTimestampMs(lastMessage?.createdAt) ?? 0,
        searchable,
      };
    })
    .filter((thread) => {
      if (!normalizedMessageSearch) return true;
      if (thread.searchable.includes(normalizedMessageSearch)) return true;
      if (!normalizedMessageSearchDigits) return false;

      return (
        normalizePhoneDigits(thread.user?.phone).includes(normalizedMessageSearchDigits) ||
        normalizePhoneDigits(thread.user?.code).includes(normalizedMessageSearchDigits) ||
        normalizePhoneDigits(thread.user?.chatUserId).includes(normalizedMessageSearchDigits) ||
        normalizePhoneDigits(thread.uid).includes(normalizedMessageSearchDigits)
      );
    })
    .sort((left, right) => right.lastMessageMs - left.lastMessageMs);
  const normalizedCallSearch = callSearch.trim().toLowerCase();
  const normalizedCallSearchDigits = normalizePhoneDigits(callSearch);
  const filteredCalls = calls.filter((call) => {
    if (!normalizedCallSearch) return true;
    const searchable = `${call.name} ${call.phone} ${call.message}`.toLowerCase();
    if (searchable.includes(normalizedCallSearch)) return true;
    if (!normalizedCallSearchDigits) return false;
    return normalizePhoneDigits(call.phone).includes(normalizedCallSearchDigits);
  });
  const totalThreads = new Set(messages.map((m) => m.userId)).size;
  const selectedUserRecord = selectedUserId ? getUserByChatId(selectedUserId) : null;
  const getPrimaryVin = (item?: UserRecord | null) => item?.vins?.[0] || '';
  const getUserIdentityValue = (item?: UserRecord | null) =>
    getPrimaryVin(item) || item?.code || item?.id || '';
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
      className="app-overlay-panel fixed inset-x-2 bottom-2 top-[4.25rem] z-50 flex max-h-[calc(100dvh-4.75rem)] min-h-0 flex-col overflow-hidden rounded-[22px] border border-sky-200/20 bg-[image:linear-gradient(145deg,rgba(2,6,23,0.97),rgba(15,23,42,0.96)_48%,rgba(7,89,133,0.92))] shadow-[0_28px_80px_rgba(2,6,23,0.58)] backdrop-blur-2xl sm:inset-x-3 sm:bottom-3 sm:top-[4.75rem] sm:max-h-[calc(100dvh-5.5rem)] md:left-auto md:right-4 md:bottom-auto md:top-[4.5rem] md:h-[min(860px,calc(100dvh-4.75rem))] md:w-[min(920px,calc(100vw-2rem))] md:max-h-none md:rounded-[32px] lg:right-6 lg:w-[min(980px,calc(100vw-3rem))] xl:w-[1040px]"
      style={{
        backgroundSize: '200% 200%',
        animation: 'adminGradient 12s ease infinite',
      }}
    >
      <div className="border-b border-white/10 bg-[image:linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.78),rgba(14,165,233,0.2))] px-3 py-3 text-white sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-sky-200/20 bg-white/10 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_18px_32px_rgba(14,165,233,0.2)] sm:h-12 sm:w-12 sm:rounded-[18px]">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-200/80 sm:text-[10px] sm:tracking-[0.18em]">
                Керування магазином
              </p>
              <h2 className="mt-0.5 text-[16px] font-black tracking-[-0.03em] text-white sm:mt-1 sm:text-2xl">
                Панель адміністратора
              </h2>
              <p className="mt-1 hidden max-w-2xl text-xs text-slate-300 sm:block sm:text-sm">
                Єдине робоче вікно для діалогів, клієнтів, замовлень і заявок.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white sm:h-11 sm:w-11 sm:rounded-2xl"
            aria-label="Закрити панель адміністратора"
            title="Закрити"
          >
            <X className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>

      <div className="sticky top-0 z-10 grid grid-cols-2 gap-1.5 border-b border-white/10 bg-slate-950/55 px-1.5 py-1.5 backdrop-blur-xl sm:gap-2 sm:px-3 sm:py-2.5">
        <Tab
          icon={<ChatBubbleBottomCenterTextIcon className="h-6 w-6" />}
          label="Повідомлення"
          value={totalThreads}
          meta="Діалоги"
          badgeCount={unreadMessages}
          active={tab === 'messages'}
          onClick={() => setTab('messages')}
        />
        <Tab
          icon={<UsersIcon className="h-6 w-6" />}
          label="Користувачі"
          value={users.length}
          meta={`Онлайн ${onlineUsersCount}`}
          active={tab === 'users'}
          onClick={() => setTab('users')}
        />
        <Tab
          icon={<ShoppingBagIcon className="h-6 w-6" />}
          label="Замовлення"
          value={orders.length}
          meta="Заявки"
          badgeCount={unreadOrders}
          active={tab === 'orders'}
          onClick={() => setTab('orders')}
        />
        <Tab
          icon={<PhoneIcon className="h-6 w-6" />}
          label="Дзвінки"
          value={calls.length}
          meta="Запити"
          badgeCount={unreadCalls}
          active={tab === 'calls'}
          onClick={() => setTab('calls')}
        />
      </div>

      <main className="app-panel-scroll flex-1 min-h-0 overflow-y-auto bg-[image:linear-gradient(180deg,rgba(15,23,42,0.5),rgba(2,6,23,0.56))] px-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-0 text-slate-100 [touch-action:pan-y] sm:px-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pt-0">
        {tab === 'messages' && (
          <>
            {!selectedUserId ? (
              <div className="space-y-2">
                <SearchDock>
                  <div className="space-y-2">
                    <PanelSearchField
                      value={messageSearch}
                      onChange={setMessageSearch}
                      placeholder="Пошук чату по імені, телефону, коду або тексту"
                    />

                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      <InfoChip icon={<MessageCircle className="h-3.5 w-3.5" />} label={`Діалогів: ${messageThreads.length}`} />
                      <InfoChip icon={<Clock3 className="h-3.5 w-3.5" />} label={`Без відповіді: ${messageThreads.filter((item) => !item.hasReply).length}`} />
                    </div>
                  </div>
                </SearchDock>

                {messageThreads.length === 0 && (
                  <EmptyPanelState
                    icon={<ChatBubbleBottomCenterTextIcon className="h-10 w-10" />}
                    title="Чатів не знайдено"
                    description="Нові діалоги з’являться тут. Також перевірте фільтр пошуку."
                  />
                )}

                {messageThreads.map((thread) => {
                  return (
                    <div
                      key={thread.uid}
                      onClick={() => openChat(thread.uid)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openChat(thread.uid);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="group w-full rounded-[16px] border border-white/8 bg-[image:linear-gradient(180deg,rgba(30,41,59,0.82),rgba(15,23,42,0.74))] p-2 text-left text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.16)] transition-colors duration-200 hover:border-sky-300/20 hover:bg-white/[0.06] sm:rounded-[22px] sm:p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-sky-100 sm:h-12 sm:w-12 sm:rounded-2xl">
                          <UserRound className="h-5 w-5 sm:h-6 sm:w-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-semibold text-white sm:text-[15px]">
                              {thread.label}
                            </p>
                            {thread.user && isUserOnline(thread.user) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                Онлайн
                              </span>
                            )}
                          </div>
                          <p className="mt-1 hidden truncate text-xs text-slate-300 sm:block sm:text-[13px]">
                            {thread.preview || 'Поки що без повідомлень'}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                thread.hasReply
                                  ? 'bg-emerald-500/15 text-emerald-200'
                                  : 'bg-amber-500/15 text-amber-200'
                              }`}
                            >
                              {thread.hasReply ? 'Є відповідь' : 'Чекає відповіді'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatTimestampLabel(thread.lastMessage?.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 pl-1">
                          {thread.unread > 0 && (
                            <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-rose-500 px-2 py-1 text-[11px] font-bold text-white shadow-[0_10px_20px_rgba(244,63,94,0.28)]">
                              {thread.unread}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChat(thread.uid);
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300 sm:h-10 sm:w-10 sm:rounded-2xl"
                            title="Видалити чат"
                          >
                            <TrashIcon className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="mb-2 rounded-[18px] border border-white/10 bg-[image:linear-gradient(135deg,rgba(30,41,59,0.92),rgba(15,23,42,0.9))] p-2.5 shadow-[0_18px_34px_rgba(2,6,23,0.22)] sm:mb-3 sm:rounded-[24px] sm:p-3.5">
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <button
                        onClick={() => setSelectedUserId(null)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10 sm:h-11 sm:w-11 sm:rounded-2xl"
                        title="Назад до списку чатів"
                      >
                        <ArrowLeft className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-white sm:text-[15px]">
                            {selectedDisplayName}
                          </span>
                          {selectedUserRecord && isUserOnline(selectedUserRecord) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                              <span className="h-2 w-2 rounded-full bg-emerald-400" />
                              Онлайн
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-slate-300 sm:mt-2 sm:gap-2 sm:text-[11px]">
                          {selectedUserRecord?.phone && (
                            <InfoChip icon={<PhoneCall className="h-3.5 w-3.5" />} label={selectedUserRecord.phone} />
                          )}
                          {selectedUserRecord?.email && (
                            <InfoChip icon={<Mail className="h-3.5 w-3.5" />} label={selectedUserRecord.email} />
                          )}
                          {selectedUserRecord && getUserIdentityValue(selectedUserRecord) && (
                            <InfoChip
                              icon={
                                COPY_PROTECTION_ENABLED ? (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )
                              }
                              label={`${getPrimaryVin(selectedUserRecord) ? 'VIN' : 'Код'}: ${getUserIdentityValue(selectedUserRecord)}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedUserRecord && !COPY_PROTECTION_ENABLED && (
                      <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                        <button
                          onClick={() =>
                            copyUserCode(
                              selectedUserRecord.id,
                              getUserIdentityValue(selectedUserRecord)
                            )
                          }
                          disabled={!getUserIdentityValue(selectedUserRecord)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Copy className="h-4 w-4" />
                          <span className="hidden sm:inline">
                            {getPrimaryVin(selectedUserRecord)
                              ? 'Копіювати VIN'
                              : 'Копіювати код'}
                          </span>
                        </button>
                        <button
                          onClick={() => openUserOrders(selectedUserRecord.id)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-sky-300/15 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15"
                        >
                          <ShoppingBag className="h-4 w-4" />
                          <span className="hidden sm:inline">Замовлення</span>
                        </button>
                      </div>
                    )}
                  </div>

                <div className="app-panel-scroll flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-0.5 [touch-action:pan-y] sm:space-y-2 sm:pr-1">
                  {selectedMessages.length === 0 && (
                    <EmptyPanelState
                      icon={<MessageCircle className="h-10 w-10" />}
                      title="Порожній чат"
                      description="У цього користувача ще немає повідомлень. Ви можете написати першим."
                    />
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
                              : `rounded-[18px] px-3 py-2 text-[13px] shadow-[0_12px_24px_rgba(2,6,23,0.18)] sm:rounded-[22px] sm:px-3.5 sm:py-2.5 sm:text-sm ${
                                  m.sender === 'user'
                                    ? 'border border-white/10 bg-white/10 text-slate-100'
                                    : 'bg-[image:linear-gradient(135deg,rgba(14,165,233,0.95),rgba(37,99,235,0.92))] text-white'
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
                          className="ml-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border border-transparent text-slate-400 transition hover:border-white/10 hover:bg-white/5 hover:text-rose-400 sm:ml-2 sm:h-9 sm:w-9 sm:rounded-2xl"
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
                  <div className="mt-2 rounded-[18px] border border-white/10 bg-white/5 p-2.5 text-xs shadow-[0_18px_32px_rgba(2,6,23,0.18)] sm:rounded-[22px] sm:p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
                      <PackagePlus className="h-4 w-4" />
                      Надсилання картки товару
                    </div>
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
                        data-search="true"
                      />
                      <button
                        onClick={sendProductCard}
                        disabled={productLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        <ShoppingBag className="h-4 w-4" />
                        {productLoading ? 'Завантаження…' : 'Надіслати картку'}
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
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2 flex gap-1.5 sm:mt-3 sm:gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                                        onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    className="flex-1 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-[16px] text-white placeholder-slate-300 focus:border-sky-400 focus:outline-none sm:text-sm"
                    placeholder="Написати повідомлення..."
                  />
                  <button
                    onClick={() => setShowProductForm((p) => !p)}
                    className={`inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full border px-0 py-0 text-white transition sm:h-auto sm:w-auto sm:px-3 sm:py-2 ${
                      showProductForm
                        ? 'border-emerald-300/30 bg-emerald-500/20'
                        : 'border-white/10 bg-white/10 hover:bg-white/20'
                    }`}
                    title="Надіслати картку товару"
                  >
                    <PackagePlus className="h-5 w-5" />
                    <span className="hidden text-xs font-semibold sm:inline">Товар</span>
                  </button>
                  <button
                    onClick={sendReply}
                    className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full bg-sky-600 px-0 py-0 text-white transition hover:bg-sky-700 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
                  >
                    <SendHorizontal className="h-5 w-5" />
                    <span className="hidden text-xs font-semibold sm:inline">Надіслати</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'users' && (
          <div className="space-y-2">
            <SearchDock>
              <PanelSearchField
                value={userSearch}
                onChange={setUserSearch}
                placeholder="Пошук по імені, телефону, email, коду або VIN"
              />
            </SearchDock>

            {sortedUsers.length === 0 && (
              <EmptyPanelState
                icon={<Users2 className="h-10 w-10" />}
                title="Користувачів не знайдено"
                description="Спробуйте змінити пошуковий запит або дочекайтеся нових реєстрацій."
              />
            )}
            {sortedUsers.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-[14px] border border-sky-200/20 bg-white/5 p-1.5 text-[10px] text-slate-300 sm:rounded-[18px] sm:p-2.5 sm:text-[11px]">
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
                  className="mb-1.5 flex w-full flex-col gap-1.5 rounded-[16px] border border-white/7 bg-[image:linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.64))] p-2 text-left text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.14)] transition-colors hover:border-sky-300/20 hover:bg-white/[0.05] sm:mb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:rounded-[20px] sm:p-3"
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
                      <p className="truncate text-[13px] font-semibold sm:text-sm">
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
                      {!getPrimaryVin(userItem) && getUserIdentityValue(userItem) && (
                        <p className="text-[11px] text-slate-200">
                          Код: {getUserIdentityValue(userItem)}
                        </p>
                      )}
                      {userItem.phone && (
                        <p className="text-xs text-slate-300 truncate">
                          <span className="hidden sm:inline">Телефон: </span>
                          {userItem.phone}
                        </p>
                      )}
                      {userItem.email && (
                        <p className="hidden text-[11px] text-slate-400 truncate sm:block">
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

                    {!COPY_PROTECTION_ENABLED && copiedUserId === userItem.id && (
                      <span className="text-[10px] rounded-full bg-emerald-500/90 px-2 py-0.5 text-white">
                        Скопійовано
                      </span>
                    )}

                    {!COPY_PROTECTION_ENABLED && (
                      <button
                        onClick={() =>
                          copyUserCode(userItem.id, getUserIdentityValue(userItem))
                        }
                        disabled={!getUserIdentityValue(userItem)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/15 sm:h-10 sm:w-10 sm:rounded-2xl"
                        title={
                          getPrimaryVin(userItem)
                            ? 'Копіювати VIN користувача'
                            : 'Копіювати код користувача'
                        }
                      >
                        <Copy size={16} />
                      </button>
                    )}

                    <button
                      onClick={() => openUserOrders(userItem.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 p-2 text-sky-200 transition hover:bg-white/15 sm:h-10 sm:w-10 sm:rounded-2xl"
                      title="Відкрити замовлення користувача"
                    >
                      <ShoppingBag size={16} />
                    </button>

                    <button
                      onClick={() => openUserChat(userItem.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 p-2 text-sky-300 transition hover:bg-white/15 sm:h-10 sm:w-10 sm:rounded-2xl"
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
            <SearchDock>
              <div className="space-y-2">
                {filteredOrderUserName && (
                  <div className="flex items-center justify-between gap-2 rounded-[16px] border border-sky-200/30 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-100 sm:rounded-[18px] sm:text-xs">
                    <span className="truncate">Показано замовлення: {filteredOrderUserName}</span>
                    <button
                      onClick={clearOrderUserFilter}
                      className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/90 hover:bg-white/10"
                    >
                      Показати всі
                    </button>
                  </div>
                )}
                <PanelSearchField
                  value={orderSearch}
                  onChange={setOrderSearch}
                  placeholder="Пошук по імені, телефону, місту або доставці"
                />
              </div>
            </SearchDock>
            {filteredOrders.length === 0 && (
              <EmptyPanelState
                icon={<ShoppingBagIcon className="h-10 w-10" />}
                title="Замовлень не знайдено"
                description={
                  orderUserFilterId &&
                  !filteredOrderUserPhone &&
                  !orders.some((o) => o.uid === orderUserFilterId)
                    ? 'У цього користувача не збережений номер телефону.'
                    : 'Спробуйте змінити фільтр або пошуковий запит.'
                }
              />
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
                <div key={o.id} className="mb-1.5 rounded-[16px] border border-white/6 bg-[image:linear-gradient(180deg,rgba(30,41,59,0.8),rgba(15,23,42,0.72))] p-2 text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.14)] sm:mb-2 sm:rounded-[22px] sm:p-3">
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
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatTimestampLabel(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => markOrderViewed(o.id)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-amber-300 hover:text-amber-200 sm:h-10 sm:w-10 sm:rounded-2xl ${
                          o.read ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        title="Позначити як переглянуте"
                        disabled={o.read}
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => markOrderCompleted(o.id)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-emerald-300 hover:text-emerald-200 sm:h-10 sm:w-10 sm:rounded-2xl ${
                          o.completed ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        title="Позначити як виконане"
                        disabled={o.completed}
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => toggleOrderExpand(o.id, true)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 sm:h-10 sm:w-10 sm:rounded-2xl"
                      >
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
          (
          <div className="space-y-2">
            <SearchDock>
              <PanelSearchField
                value={callSearch}
                onChange={setCallSearch}
                placeholder="Пошук по імені, телефону або коментарю"
              />
            </SearchDock>
            {filteredCalls.length === 0 && (
              <EmptyPanelState
                icon={<PhoneCall className="h-10 w-10" />}
                title="Заявок на дзвінок не знайдено"
                description="Спробуйте змінити пошук або дочекайтеся нових звернень."
              />
            )}
          {filteredCalls.map((c) => {
            const callStatus = c.processed ? 'Виконано' : 'Новий';
            const callStatusClass = c.processed
              ? 'bg-emerald-500/20 text-emerald-200'
              : 'bg-sky-500/20 text-sky-200';

            return (
              <div key={c.id} className="rounded-[16px] border border-white/6 bg-[image:linear-gradient(180deg,rgba(30,41,59,0.8),rgba(15,23,42,0.72))] p-2 text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.14)] sm:rounded-[22px] sm:p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${callStatusClass}`}>
                    {callStatus}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-300">{c.phone}</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${c.phone}`}
                      className="text-xs px-2 py-1 rounded-lg border border-sky-400/40 text-sky-200 hover:bg-white/10"
                    >
                      {isMobileDevice ? 'Дзвінок' : 'Контакт'}
                    </a>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  {formatTimestampLabel(c.createdAt)}
                </p>
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
          </div>
          )}
      </main>
    </div>
  );
}

function Tab({
  icon,
  label,
  value,
  meta,
  badgeCount = 0,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  meta: string;
  badgeCount?: number;
  active: boolean;
  onClick: () => void;
}) {
  const displayBadgeCount = badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <button
      onClick={onClick}
      className={`relative flex min-h-[62px] items-center gap-2 rounded-[16px] border px-2.5 py-2 text-left transition sm:min-h-[72px] sm:gap-3 sm:px-3.5 sm:py-2.5 sm:rounded-[20px] ${
        active
          ? 'border-sky-300/40 bg-[image:linear-gradient(135deg,rgba(56,189,248,0.2),rgba(37,99,235,0.18))] text-white shadow-[0_14px_30px_rgba(14,165,233,0.18),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'border-white/7 bg-white/[0.035] text-slate-300 hover:border-white/14 hover:bg-white/[0.07]'
      }`}
    >
      <span
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] sm:h-10 sm:w-10 sm:rounded-[14px] ${
          active ? 'bg-white/14 text-sky-100' : 'bg-white/7 text-slate-200'
        }`}
      >
        {icon}
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white shadow-[0_8px_18px_rgba(244,63,94,0.35)]">
            {displayBadgeCount}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="break-words text-[10px] font-bold leading-tight text-slate-100 sm:text-[13px]">
              {label}
            </div>
            <div className="mt-0.5 break-words text-[9px] font-medium leading-tight text-slate-300 sm:text-[11px]">
              {meta}
            </div>
          </div>
          <div className="shrink-0 text-[17px] font-black tracking-[-0.04em] text-white sm:text-xl">
            {value}
          </div>
        </div>
      </div>
    </button>
  );
}

function PanelSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/75 sm:left-3.5 sm:h-[18px] sm:w-[18px]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full min-w-0 rounded-[16px] border border-white/12 bg-slate-950/45 pl-10 pr-10 text-[16px] font-medium leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] placeholder:text-[13px] placeholder:font-medium placeholder:text-slate-300/70 focus:border-sky-300/60 focus:bg-slate-950/60 focus:outline-none sm:h-12 sm:rounded-[20px] sm:pl-11 sm:pr-11 sm:text-sm sm:placeholder:text-sm"
        placeholder={placeholder}
        data-search="true"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/7 text-slate-200 transition hover:bg-white/12 sm:right-2.5 sm:h-8 sm:w-8"
          aria-label="Очистити пошук"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

function SearchDock({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1.5 border-b border-white/8 bg-slate-950/92 px-1.5 pb-2 pt-1 shadow-[0_12px_24px_rgba(2,6,23,0.2)] backdrop-blur-xl sm:-mx-4 sm:px-4 sm:pb-3 sm:pt-2">
      {children}
    </div>
  );
}

function InfoChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-1.5 py-0.75 text-[9px] font-medium text-slate-200 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
      {icon}
      {label}
    </span>
  );
}

function EmptyPanelState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-white/12 bg-white/5 px-3 py-6 text-center sm:rounded-[24px] sm:px-4 sm:py-8">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-sky-100 sm:h-16 sm:w-16 sm:rounded-[22px]">
        {icon}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold text-white sm:mt-4 sm:text-base">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-slate-300 sm:mt-2 sm:text-sm">{description}</p>
    </div>
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
