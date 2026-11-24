'use client';

import AdminWindowResizeHandles from "./AdminWindowResizeHandles";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { adminWindowDragHandle, useAdminWindowDrag } from 'app/lib/use-admin-window-drag';
import { ProfileAvatar } from './ProfileAvatar';
import { findAvatarFrame, getProfileAvatarTier, type AvatarTier } from 'app/lib/profile-appearance';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Handshake,
  ImagePlus,
  Mail,
  Megaphone,
  MessageCircle,
  PackagePlus,
  Pencil,
  Pin,
  PhoneCall,
  Plus,
  Search,
  SendHorizontal,
  ShieldCheck,
  ShieldOff,
  ShoppingBag,
  Users2,
  X,
  CircleCheck,
  FileText,
  MessageSquareText,
  Phone,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../../firebase';
import OrderTrackingEditor from './OrderTrackingEditor';
import { isNovaPoshtaDelivery } from 'app/lib/order-tracking';
import { MessageAdminActivity, saveAdminChatAction, useAdminChatActivity } from './admin-chat-activity';
import { getAdminIdToken, getCurrentAdminUser } from 'app/lib/get-admin-token';
import {
  getOrderStatus,
  isClosedOrderStatus,
  MANUAL_ORDER_STATUSES,
  ORDER_NOTE_MAX_LENGTH,
  ORDER_STATUS_CLASS,
  ORDER_STATUS_LABEL,
  toMillis,
  type OrderHistoryEntry,
  type OrderStatus,
} from 'app/lib/order-status';

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
  autoReply?: boolean;
  repliedByUid?: string;
  repliedByName?: string;
  repliedBySource?: 'telegram';
}

interface MessageTemplate {
  id: string;
  title: string;
  text: string;
  createdAt?: unknown;
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
  trackingNumber?: string | null;
  paymentMethod?: string;
  totalAmount: number;
  total?: number;
  cartItems?: CartItem[];
  city?: string | null;
  warehouse?: string | null;
  lvivStreet?: string | null;
  createdAt: unknown;
  read?: boolean;
  shipped?: boolean;
  completed?: boolean;
  cancelled?: boolean;
  cancelledBy?: string;
  stockReturn?: { status?: string };
  viewedByName?: string;
  shippedByName?: string;
  completedByName?: string;
  status?: OrderStatus;
  statusUpdatedByName?: string;
  history?: OrderHistoryEntry[];
  lastNote?: string;
  npStatus?: string;
  npStatusCode?: string;
  npArrivedAt?: unknown;
  npPaidStorageFrom?: string;
  paymentStatus?: string;
}

// Orders stream newest-first in pages: the full collection used to be
// re-read on every panel open, growing with every order ever placed.
const ORDERS_PAGE_SIZE = 150;

type OrderFilter = 'open' | 'all' | OrderStatus;
const ORDER_FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: 'open', label: 'Активні' },
  { key: 'all', label: 'Усі' },
  { key: 'new', label: 'Нові' },
  { key: 'confirmed', label: 'Підтверджені' },
  { key: 'awaiting_payment', label: 'Очікують оплати' },
  { key: 'packing', label: 'Комплектуються' },
  { key: 'shipped', label: 'Відправлені' },
  { key: 'arrived', label: 'У відділенні' },
  { key: 'completed', label: 'Виконані' },
  { key: 'returned', label: 'Повернення' },
  { key: 'cancelled', label: 'Скасовані' },
];

const PAYMENT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  paid: { label: 'Оплачено онлайн', className: 'bg-emerald-500/20 text-emerald-200' },
  pending: { label: 'Очікує онлайн-оплати', className: 'bg-amber-500/20 text-amber-200' },
  failed: { label: 'Оплата не пройшла', className: 'bg-rose-500/20 text-rose-200' },
};

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
  role?: string;
  avatar?: string | null;
  avatarFrame?: string | null;
}

export type AdminPanelNavigation = { key: number; tab: 'orders' | 'calls'; orderId?: string; phone?: string };

interface Props {
  isOpen: boolean;
  navigation?: AdminPanelNavigation | null;
  isPinned?: boolean;
  onClose: () => void;
  onPinnedChange?: (isPinned: boolean) => void;
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

const BROADCAST_IMAGE_MAX_DIMENSION = 1600;
const BROADCAST_IMAGE_MAX_INPUT_BYTES = 15 * 1024 * 1024;

// Simpler, single-pass version of the resize pipeline TelegramChat.tsx uses
// for customer uploads — this is an occasional admin action, not a
// high-frequency chat feature, so one canvas pass at a fixed quality is
// enough to keep the broadcast payload well under the API route's cap.
const resizeImageForBroadcast = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(
        1,
        BROADCAST_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('CANVAS_UNAVAILABLE'));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('IMAGE_LOAD_FAILED'));
    };
    image.src = objectUrl;
  });

export default function AdminChatPanel({
  isOpen,
  navigation,
  isPinned = false,
  onClose,
  onPinnedChange,
  onNotificationCountChange,
}: Props) {
  const [tab, setTab] = useState<'messages' | 'orders' | 'calls' | 'users'>(
    'messages'
  );
  // Resolved once per panel session so chat replies and order status
  // changes can be attributed to the admin who made them. `name` prefers
  // the Firestore users/{uid} profile (same field the Users tab already
  // shows) over the Firebase Auth displayName, which most admins never set.
  const [currentAdmin, setCurrentAdmin] = useState<{ uid: string; name: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getCurrentAdminUser();
      if (!user || cancelled) return;
      let name = user.displayName?.trim() || user.email?.trim() || '';
      try {
        const profileSnap = await getDoc(doc(db, 'users', user.uid));
        const profileName = (profileSnap.data()?.name as string | undefined)?.trim();
        if (profileName) name = profileName;
      } catch {
        // Fall back to the auth-derived name above.
      }
      if (!cancelled) setCurrentAdmin({ uid: user.uid, name: name || 'Адмін' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyText, setAutoReplyText] = useState('');
  const [autoReplySaving, setAutoReplySaving] = useState(false);
  const [autoReplySaved, setAutoReplySaved] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateText, setNewTemplateText] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateTitle, setEditingTemplateTitle] = useState('');
  const [editingTemplateText, setEditingTemplateText] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showBroadcastPanel, setShowBroadcastPanel] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<
    { sent: number; total: number } | { error: string } | null
  >(null);
  const [broadcastImageDataUrl, setBroadcastImageDataUrl] = useState<string | null>(null);
  const [broadcastImageProcessing, setBroadcastImageProcessing] = useState(false);
  const [broadcastImageError, setBroadcastImageError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [calls, setCalls] = useState<CallRequest[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [partnerUids, setPartnerUids] = useState<string[]>([]);
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  const orderTotalsByUser = useMemo(() => {
    const totals = new Map<string, number>();
    orders.forEach(order => {
      const amount = Number(order.totalAmount ?? order.total);
      if (order.uid && Number.isFinite(amount) && amount > 0) totals.set(order.uid, (totals.get(order.uid) ?? 0) + amount);
    });
    return totals;
  }, [orders]);
  const userAvatarTier = (user?: UserRecord | null): AvatarTier => {
    if (!user) return "basic";
    const envAdmin = !!user.email && (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").some(email => email.trim().toLowerCase() === user.email?.toLowerCase());
    if (user.role === "admin" || envAdmin) return "admin";
    return partnerUids.includes(user.id) || (orderTotalsByUser.get(user.id) ?? 0) >= 2000 ? "partner" : "basic";
  };

  const [partnerUpdatingUid, setPartnerUpdatingUid] = useState<string | null>(null);
  const partnerLock = useRef(false);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const token = await getAdminIdToken();
        if (!token) throw new Error('Не авторизовано');
        const response = await fetch('/api/admin/partners', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Не вдалося завантажити партнерів');
        const data = await response.json();
        if (!cancelled && !partnerLock.current) { setPartnerUids(data.uids); setPartnersLoaded(true); }
      } catch {
        if (!cancelled) { setPartnersLoaded(false); setRoleError('Не вдалося завантажити партнерів. Повторна спроба відбудеться автоматично.'); }
      }
    };
    void refresh();
    // Chat only needs an initial lookup; keep the existing periodic refresh
    // for the role editor without adding background polling to conversations.
    const timer = tab === 'users' ? setInterval(refresh, 15000) : null;
    return () => { cancelled = true; if (timer !== null) clearInterval(timer); };
  }, [isOpen, tab]);

  const togglePartner = async (uid: string, active: boolean) => {
    if (partnerLock.current) return;
    partnerLock.current = true;
    setPartnerUpdatingUid(uid);
    setRoleError(null);
    try {
      const token = await getAdminIdToken();
      if (!token) throw new Error('Не авторизовано');
      const response = await fetch('/api/admin/partners', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, active }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не вдалося змінити партнерство');
      setPartnerUids(previous => active ? [...new Set([...previous, uid])] : previous.filter(id => id !== uid));
    } catch (error) { setRoleError(error instanceof Error ? error.message : 'Не вдалося змінити партнерство'); }
    finally { partnerLock.current = false; setPartnerUpdatingUid(null); }
  };
  const [roleUpdatingUid, setRoleUpdatingUid] = useState<string | null>(null);
  const [chatPresenceMap, setChatPresenceMap] = useState<
    Record<string, { userIsOnline: boolean; userLastSeenAt?: unknown }>
  >({});
  const [userPhoneMap, setUserPhoneMap] = useState<Record<string, string>>({});
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [messageSearch, setMessageSearch] = useState('');
  const [callSearch, setCallSearch] = useState('');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const replyLock = useRef(false);
  const replyRequest = useRef<{ key: string; id: string } | null>(null);
  const productLock = useRef(false);
  const productRequest = useRef<{ key: string; id: string } | null>(null);
  const chatActivity = useAdminChatActivity(
    isOpen && tab === 'messages' ? selectedUserId : null,
    currentAdmin?.uid,
    messages.filter(message => message.userId === selectedUserId).map(message => message.id)
  );
  const [showProductForm, setShowProductForm] = useState(false);
  const [productArticle, setProductArticle] = useState('');
  const [productError, setProductError] = useState<string | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderUserFilterId, setOrderUserFilterId] = useState<string | null>(null);
  const [copiedClipboardKey, setCopiedClipboardKey] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const managerPresenceSessionId = `admin_${useId().replace(/:/g, "")}`;
  const [presenceNowMs, setPresenceNowMs] = useState(0);

  useEffect(() => {
    const updatePresenceClock = () => setPresenceNowMs(Date.now());
    updatePresenceClock();
    const intervalId = window.setInterval(updatePresenceClock, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

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
      query(collection(db, 'messageTemplates'), orderBy('createdAt', 'asc')),
      (snap) =>
        setTemplates(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageTemplate, "id">) }))
        )
    );
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'chatSettings', 'autoReply'), (snap) => {
      const data = snap.data() as { enabled?: boolean; text?: string } | undefined;
      setAutoReplyEnabled(Boolean(data?.enabled));
      setAutoReplyText(typeof data?.text === 'string' ? data.text : '');
    });
  }, []);

  const [ordersLimit, setOrdersLimit] = useState(ORDERS_PAGE_SIZE);
  const [ordersMayHaveMore, setOrdersMayHaveMore] = useState(false);
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ordersLimit)),
      (snap) => {
        setOrdersMayHaveMore(snap.size >= ordersLimit);
        setOrders(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, "id">) }))
        );
      }
    );
  }, [ordersLimit]);

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
          role: data?.role === 'admin' ? 'admin' : 'user',
          avatar: typeof data?.avatar === "string" && getProfileAvatarTier(data.avatar) ? data.avatar : null,
          avatarFrame: findAvatarFrame(data?.avatarFrame)?.id ?? null,
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
    window.dispatchEvent(new Event('partson:admin-notifications-changed'));
  }, [unreadMessages, unreadOrders, unreadCalls]);

  useEffect(() => {
    if (!selectedUserId) return;

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedUserId]);

  useEffect(() => {
    if (!isOpen || tab !== 'messages' || !selectedUserId) return;

    const presenceRef = doc(db, 'chatPresence', selectedUserId);
    const sessionId = managerPresenceSessionId;

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
  }, [isOpen, managerPresenceSessionId, selectedUserId, tab]);

  const openChat = async (uid: string) => {
    if (replyLock.current || productLock.current) return;
    setSelectedUserId(uid);
    setReplyText('');
    setShowProductForm(false);
    setProductArticle('');
    setProductError(null);
    setReplyError('');
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
    return presenceNowMs === 0 || presenceNowMs - lastSeenMs <= 1000 * 90;
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

  const buildCopyKey = (uid: string, value: string) => `${uid}:${value}`;

  const copyUserCode = async (
    uid: string,
    code: string,
    copyKey = buildCopyKey(uid, code)
  ) => {
    if (!code) {
      return;
    }

    try {
      let copied = false;

      if (navigator?.clipboard?.writeText) {
        copied = await navigator.clipboard
          .writeText(code)
          .then(() => true)
          .catch(() => false);
      }

      if (!copied) {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.setAttribute('data-admin-copy', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      if (!copied) return;

      setCopiedClipboardKey(copyKey);
      setTimeout(() => {
        setCopiedClipboardKey((current) => (current === copyKey ? null : current));
      }, 1200);
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

  const handleRoleToggle = async (uid: string, nextRole: 'admin' | 'user') => {
    if (roleUpdatingUid) return;
    setRoleUpdatingUid(uid);
    setRoleError(null);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setRoleError('Не авторизовано');
        return;
      }
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setRoleError(data?.error || 'Не вдалося змінити роль');
        return;
      }
      // The users list is fed by a live onSnapshot subscription (see the
      // effect above), so it will pick up this change on its own — no local
      // state patch needed here.
    } catch {
      setRoleError('Не вдалося змінити роль');
    } finally {
      setRoleUpdatingUid(null);
    }
  };

  const clearOrderUserFilter = () => {
    setOrderUserFilterId(null);
  };

  // Fire-and-forget: the Firestore write above is the action that actually
  // matters and has already succeeded by the time this runs. A customer
  // without a linked Telegram chat is the common case, not an error, and the
  // route itself never returns a hard failure for that.
  const notifyChatTelegram = async (
    userId: string,
    payload: Record<string, unknown>
  ) => {
    try {
      const token = await getAdminIdToken();
      if (!token) return;
      await fetch('/api/chat/notify-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, ...payload }),
      });
    } catch {
      // Best-effort notification — nothing to surface here.
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedUserId || replyLock.current) return;
    const text = replyText.trim();
    const userId = selectedUserId;
    const key = JSON.stringify([userId, text]);
    if (replyRequest.current?.key !== key) replyRequest.current = { key, id: crypto.randomUUID() };
    replyLock.current = true;
    setReplySending(true);
    setReplyError('');
    try {
      await saveAdminChatAction({ action: 'reply', userId, text, type: 'text', requestId: replyRequest.current.id });
      setReplyText(value => value.trim() === text ? '' : value);
      replyRequest.current = null;
      void notifyChatTelegram(userId, { type: 'text', text });
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : 'Не вдалося надіслати повідомлення');
    } finally {
      replyLock.current = false;
      setReplySending(false);
    }
  };

  const insertTemplate = (template: MessageTemplate) => {
    setReplyText(template.text);
    setShowTemplatePicker(false);
  };

  const saveAutoReplySettings = async () => {
    setAutoReplySaving(true);
    try {
      await setDoc(
        doc(db, 'chatSettings', 'autoReply'),
        { enabled: autoReplyEnabled, text: autoReplyText.trim(), updatedAt: serverTimestamp() },
        { merge: true }
      );
      setAutoReplySaved(true);
      setTimeout(() => setAutoReplySaved(false), 2500);
    } finally {
      setAutoReplySaving(false);
    }
  };

  const sendBroadcast = async () => {
    const text = broadcastText.trim();
    if (!text || broadcastSending) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setBroadcastResult({ error: 'Не авторизовано' });
        return;
      }
      const res = await fetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text,
          ...(broadcastTitle.trim() ? { title: broadcastTitle.trim() } : {}),
          ...(broadcastImageDataUrl ? { imageDataUrl: broadcastImageDataUrl } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; sent?: number; total?: number; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setBroadcastResult({ error: data?.error || 'Не вдалося надіслати розсилку' });
        return;
      }
      setBroadcastResult({ sent: data.sent ?? 0, total: data.total ?? 0 });
      setBroadcastTitle('');
      setBroadcastText('');
      setBroadcastImageDataUrl(null);
    } catch {
      setBroadcastResult({ error: 'Не вдалося надіслати розсилку' });
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleBroadcastImagePick = async (file: File | undefined) => {
    setBroadcastImageError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBroadcastImageError('Файл має бути зображенням');
      return;
    }
    if (file.size > BROADCAST_IMAGE_MAX_INPUT_BYTES) {
      setBroadcastImageError('Файл завеликий (максимум 15 МБ)');
      return;
    }
    setBroadcastImageProcessing(true);
    try {
      const dataUrl = await resizeImageForBroadcast(file);
      setBroadcastImageDataUrl(dataUrl);
    } catch {
      setBroadcastImageError('Не вдалося обробити зображення');
    } finally {
      setBroadcastImageProcessing(false);
    }
  };

  const addTemplate = async () => {
    const title = newTemplateTitle.trim();
    const text = newTemplateText.trim();
    if (!title || !text) return;
    setTemplateSaving(true);
    try {
      await addDoc(collection(db, 'messageTemplates'), { title, text, createdAt: serverTimestamp() });
      setNewTemplateTitle('');
      setNewTemplateText('');
    } finally {
      setTemplateSaving(false);
    }
  };

  const startEditTemplate = (template: MessageTemplate) => {
    setEditingTemplateId(template.id);
    setEditingTemplateTitle(template.title);
    setEditingTemplateText(template.text);
  };

  const saveEditTemplate = async () => {
    if (!editingTemplateId) return;
    const title = editingTemplateTitle.trim();
    const text = editingTemplateText.trim();
    if (!title || !text) return;
    await updateDoc(doc(db, 'messageTemplates', editingTemplateId), { title, text });
    setEditingTemplateId(null);
  };

  const removeTemplate = async (id: string) => {
    await deleteDoc(doc(db, 'messageTemplates', id));
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
    if (!selectedUserId || productLock.current) return;
    const userId = selectedUserId;
    const article = productArticle.trim();
    if (!article) return;

    productLock.current = true;
    setProductLoading(true);
    setProductError(null);

    try {
      const product = await fetchProductByArticle(article);
      if (!product) {
        setProductError('Товар не знайдено');
        return;
      }

      const key = JSON.stringify([userId, product]);
      if (productRequest.current?.key !== key) productRequest.current = { key, id: crypto.randomUUID() };
      await saveAdminChatAction({ action: 'reply', userId,
        text: product.name || product.article || product.code || 'Картка товару',
        type: 'product', product, requestId: productRequest.current.id });
      productRequest.current = null;
      void notifyChatTelegram(userId, { type: 'product', product });

      setProductArticle('');
      setShowProductForm(false);
    } catch {
      setProductError('Не вдалося надіслати товар. Спробуйте ще раз.');
    } finally {
      productLock.current = false;
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

  // Every order change goes through the Admin-SDK route (client Firestore
  // rules block order updates); it keeps the legacy read/shipped/completed
  // flags in sync, records who did it in the order history and sends the
  // customer's Telegram notification itself.
  const [orderActionError, setOrderActionError] = useState<{ orderId: string; text: string } | null>(null);
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);
  const [orderNoteDrafts, setOrderNoteDrafts] = useState<Record<string, string>>({});
  const updateOrder = useCallback(async (
    orderId: string,
    change: { status?: OrderStatus; note?: string; viewed?: boolean }
  ): Promise<boolean> => {
    if (!change.viewed) setOrderBusyId(orderId);
    setOrderActionError(null);
    try {
      const token = await getAdminIdToken();
      if (!token) throw new Error('Увійдіть як адміністратор.');
      const response = await fetch('/api/admin/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, ...change }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; byName?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не вдалося зберегти зміну.');
      // The snapshot listener brings the saved state; patch locally so the
      // chip updates instantly even on a slow connection.
      setOrders((previous) =>
        previous.map((order) => {
          if (order.id !== orderId) return order;
          const next: Order = { ...order, read: true };
          if (!order.read && data.byName) next.viewedByName = data.byName;
          if (change.status) {
            next.status = change.status;
            next.statusUpdatedByName = data.byName;
            next.shipped = ['shipped', 'arrived', 'completed', 'returned'].includes(change.status);
            next.completed = change.status === 'completed';
          }
          if (change.note) next.lastNote = change.note;
          return next;
        })
      );
      return true;
    } catch (error) {
      if (!change.viewed) {
        setOrderActionError({ orderId, text: error instanceof Error ? error.message : 'Не вдалося зберегти зміну.' });
      }
      return false;
    } finally {
      if (!change.viewed) setOrderBusyId(null);
    }
  }, []);

  const markOrderViewed = useCallback(async (orderId: string) => {
    await updateOrder(orderId, { viewed: true });
  }, [updateOrder]);

  const handledNavigation = useRef<number | null>(null);
  useEffect(() => {
    if (!isOpen || !navigation || handledNavigation.current === navigation.key) return;
    handledNavigation.current = navigation.key;
    setTab(navigation.tab);
    if (navigation.tab === 'orders' && navigation.orderId) {
      setOrderUserFilterId(null);
      setOrderFilter('all');
      setOrderSearch(orders.some(order => order.id === navigation.orderId) ? '' : navigation.phone || '');
      setExpandedOrderId(navigation.orderId);
      if (!orders.find(order => order.id === navigation.orderId)?.read) void markOrderViewed(navigation.orderId);
    }
  }, [isOpen, navigation, orders, markOrderViewed]);

  useEffect(() => {
    if (!isOpen || tab !== 'orders' || !expandedOrderId || expandedOrderId !== navigation?.orderId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`admin-order-${expandedOrderId}`)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, tab, expandedOrderId, navigation, orders]);

  const setOrderStatus = async (orderId: string, status: OrderStatus) => {
    await updateOrder(orderId, { status });
  };

  const saveOrderNote = async (orderId: string) => {
    const note = (orderNoteDrafts[orderId] || '').trim();
    if (!note) return;
    if (await updateOrder(orderId, { note })) {
      setOrderNoteDrafts((previous) => ({ ...previous, [orderId]: '' }));
    }
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

  const orderStatusCounts = orders.reduce<Partial<Record<OrderFilter, number>>>((acc, order) => {
    const status = getOrderStatus(order);
    acc[status] = (acc[status] ?? 0) + 1;
    if (!isClosedOrderStatus(status)) acc.open = (acc.open ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});
  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const normalizedOrderSearchDigits = orderSearch.replace(/\D/g, '');
  const filteredOrders = orders.filter((o) => {
    const phone = o.phone ?? '';
    const phoneDigits = normalizePhoneDigits(phone);
    const uid = o.uid;
    const matchesSearch = normalizedOrderSearch
      ? `${o.name || ''} ${phone} ${o.city || ''} ${o.warehouse || ''} ${o.deliveryMethod || ''} ${o.paymentMethod || ''} ${o.trackingNumber || ''}`
          .toLowerCase()
          .includes(normalizedOrderSearch) ||
        (normalizedOrderSearchDigits && (phoneDigits.includes(normalizedOrderSearchDigits) || (o.trackingNumber || "").includes(normalizedOrderSearchDigits)))
      : true;

    if (!matchesSearch) return false;
    if (orderFilter !== 'all') {
      const status = getOrderStatus(o);
      if (orderFilter === 'open' ? isClosedOrderStatus(status) : status !== orderFilter) return false;
    }
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
  const visibleMessageThreads = messageThreads;
  const normalizedCallSearch = callSearch.trim().toLowerCase();
  const normalizedCallSearchDigits = normalizePhoneDigits(callSearch);
  const filteredCalls = calls.filter((call) => {
    if (!normalizedCallSearch) return true;
    const searchable = `${call.name} ${call.phone} ${call.message}`.toLowerCase();
    if (searchable.includes(normalizedCallSearch)) return true;
    if (!normalizedCallSearchDigits) return false;
    return normalizePhoneDigits(call.phone).includes(normalizedCallSearchDigits);
  });
  const visibleOrders = filteredOrders;
  const visibleCalls = filteredCalls;
  const totalThreads = new Set(messages.map((m) => m.userId)).size;
  const attentionCount =
    unreadMessages +
    unreadOrders +
    unreadCalls +
    orders.filter((order) => !isClosedOrderStatus(getOrderStatus(order))).length +
    calls.filter((call) => !call.processed).length;
  const selectedUserRecord = selectedUserId ? getUserByChatId(selectedUserId) : null;
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  useAdminWindowDrag(panelRef, isOpen && isMounted);

  useEffect(() => {
    setIsMobileDevice(
      typeof window !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || isPinned) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      // Dialogs the panel opens over the page (portaled to <body>).
      if (target instanceof Element && target.closest('[data-admin-overlay]')) return;
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, isPinned, onClose]);

  if (!isOpen || !isMounted) return null;

  return (
    <div
      ref={panelRef}
      className="admin-panel-shell admin-density-compact app-overlay-panel fixed inset-x-2 bottom-2 top-[4.25rem] z-50 flex max-h-[calc(100dvh-4.75rem)] min-h-0 flex-col overflow-hidden rounded-[22px] border border-sky-100/20 bg-[image:linear-gradient(145deg,rgba(3,7,18,0.98),rgba(15,23,42,0.96)_42%,rgba(12,74,110,0.92))] shadow-[0_28px_80px_rgba(2,6,23,0.58)] backdrop-blur-2xl sm:inset-x-3 sm:bottom-3 sm:top-[4.75rem] sm:max-h-[calc(100dvh-5.5rem)] md:bottom-auto md:top-[4.5rem] md:h-[min(860px,calc(100dvh-4rem))] md:max-h-none md:rounded-[28px]"
      style={{
        backgroundSize: '200% 200%',
        animation: 'adminGradient 12s ease infinite',
      }}
    >
      <div {...adminWindowDragHandle} className="border-b border-white/10 bg-[image:linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,41,59,0.78),rgba(14,165,233,0.2))] px-3 py-2 text-white sm:px-4 sm:py-2.5">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border border-sky-200/20 bg-white/10 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_12px_24px_rgba(14,165,233,0.16)] sm:h-9 sm:w-9 sm:rounded-[15px]">
              <ShieldCheck className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-sky-200/80 sm:text-[9px] sm:tracking-[0.15em]">
                Керування магазином
              </p>
              <h2 className="mt-0.5 text-[15px] font-black leading-tight tracking-[-0.03em] text-white [overflow-wrap:anywhere] sm:text-xl">
                Панель адміністратора
              </h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <AdminToggleButton
              active={isPinned}
              icon={<Pin className="h-3.5 w-3.5" />}
              label=""
              ariaLabel={isPinned ? "Панель закріплена" : "Закріпити панель"}
              title={
                isPinned
                  ? "Панель не закриватиметься при переходах і кліках поза нею"
                  : "Закріпити панель при переходах і кліках поза нею"
              }
              onClick={() => onPinnedChange?.(!isPinned)}
            />
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white sm:h-9 sm:w-9 sm:rounded-[15px]"
              aria-label="Закрити панель адміністратора"
              title="Закрити"
            >
              <X className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <AdminMetric label="Потребує дії" value={attentionCount} tone="sky" />
          <AdminMetric label="Непрочитані" value={unreadMessages + unreadOrders + unreadCalls} tone="rose" />
          <AdminMetric label="Онлайн" value={onlineUsersCount} tone="emerald" />
        </div>
      </div>

      <div className="sticky top-0 z-10 grid grid-cols-2 gap-1 border-b border-white/10 bg-slate-950/70 px-1.5 py-1 backdrop-blur-xl sm:grid-cols-4 sm:gap-1.5 sm:px-2.5 sm:py-1.5">
        <Tab
          icon={<MessageSquareText className="h-5 w-5" strokeWidth={1.75} />}
          label="Повідомлення"
          value={totalThreads}
          meta="Діалоги"
          badgeCount={unreadMessages}
          active={tab === 'messages'}
          onClick={() => setTab('messages')}
        />
        <Tab
          icon={<Users className="h-5 w-5" strokeWidth={1.75} />}
          label="Користувачі"
          value={allUsers.length}
          meta={`Онлайн ${onlineUsersCount}`}
          active={tab === 'users'}
          onClick={() => setTab('users')}
        />
        <Tab
          icon={<ShoppingBag className="h-5 w-5" strokeWidth={1.75} />}
          label="Замовлення"
          value={orders.length}
          meta="Заявки"
          badgeCount={unreadOrders}
          active={tab === 'orders'}
          onClick={() => setTab('orders')}
        />
        <Tab
          icon={<Phone className="h-5 w-5" strokeWidth={1.75} />}
          label="Дзвінки"
          value={calls.length}
          meta="Запити"
          badgeCount={unreadCalls}
          active={tab === 'calls'}
          onClick={() => setTab('calls')}
        />
      </div>

      <div className="admin-panel-scroll app-panel-scroll flex-1 min-h-0 overflow-y-auto bg-[image:linear-gradient(180deg,rgba(15,23,42,0.5),rgba(2,6,23,0.56))] px-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-0 text-slate-100 [touch-action:pan-y] sm:px-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pt-0">
        {tab === 'messages' && (
          <>
            {!selectedUserId ? (
              <div className="space-y-2">
                <SearchDock>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-[16px] border border-sky-200/12 bg-[image:linear-gradient(135deg,rgba(14,165,233,0.13),rgba(15,23,42,0.55))] px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-200/80">
                          Центр повідомлень
                        </p>
                        <h3 className="mt-0.5 text-sm font-black leading-tight text-white [overflow-wrap:anywhere]">
                          Діалоги з клієнтами
                        </h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <MessageStatPill label="Усі" value={visibleMessageThreads.length} />
                        <MessageStatPill label="Нові" value={unreadMessages} tone="rose" />
                      </div>
                    </div>
                    <PanelSearchField
                      value={messageSearch}
                      onChange={setMessageSearch}
                      placeholder="Пошук чату по імені, телефону, коду або тексту"
                    />

                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      <InfoChip icon={<MessageCircle className="h-3.5 w-3.5" />} label={`Активних: ${visibleMessageThreads.length}`} />
                      <InfoChip icon={<Clock3 className="h-3.5 w-3.5" />} label={`Без відповіді: ${messageThreads.filter((item) => !item.hasReply).length}`} />
                    </div>
                  </div>
                </SearchDock>

                <div className="rounded-[16px] border border-white/10 bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => setShowTemplateManager((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-violet-300" strokeWidth={1.75} />
                      <span className="min-w-0 text-[11px] font-black uppercase leading-snug tracking-[0.08em] text-violet-200 [overflow-wrap:anywhere]">
                        Шаблони та автовідповідь
                      </span>
                      {templates.length > 0 && (
                        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                          {templates.length}
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${showTemplateManager ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showTemplateManager && (
                    <div className="space-y-2 border-t border-white/10 p-2.5">
                      <div className="rounded-[14px] border border-white/10 bg-slate-950/30 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-300">
                              Автоматична відповідь
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                              Надсилається одразу після першого повідомлення клієнта в новій розмові
                              (якщо перерва з попереднього діалогу більша за 20 хв).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAutoReplyEnabled((p) => !p)}
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                              autoReplyEnabled
                                ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-300'
                                : 'border-white/10 bg-white/10 text-slate-300'
                            }`}
                          >
                            {autoReplyEnabled ? 'Увімкнено' : 'Вимкнено'}
                          </button>
                        </div>
                        <textarea
                          value={autoReplyText}
                          onChange={(e) => setAutoReplyText(e.target.value)}
                          rows={3}
                          placeholder="Текст автоматичної відповіді..."
                          className="mt-2 w-full rounded-[12px] border border-white/10 bg-slate-950/40 px-3 py-2 text-[13px] text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void saveAutoReplySettings()}
                            disabled={autoReplySaving}
                            className="inline-flex items-center gap-1.5 rounded-[10px] bg-sky-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
                          >
                            {autoReplySaving ? 'Збереження...' : 'Зберегти'}
                          </button>
                          {autoReplySaved && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                              <Check className="h-3.5 w-3.5" /> Збережено
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-white/10 bg-slate-950/30 p-2.5">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-300">
                          Шаблони повідомлень
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Швидко вставляйте готові відповіді під час листування з клієнтом (кнопка
                          «Шаблон» у полі відповіді).
                        </p>

                        <div className="mt-2 space-y-1.5">
                          <input
                            value={newTemplateTitle}
                            onChange={(e) => setNewTemplateTitle(e.target.value)}
                            placeholder="Назва шаблону (наприклад, «Графік роботи»)"
                            className="w-full rounded-[10px] border border-white/10 bg-slate-950/40 px-3 py-2 text-[12px] text-white placeholder-slate-500 focus:border-violet-400 focus:outline-none"
                          />
                          <textarea
                            value={newTemplateText}
                            onChange={(e) => setNewTemplateText(e.target.value)}
                            rows={2}
                            placeholder="Текст повідомлення..."
                            className="w-full rounded-[10px] border border-white/10 bg-slate-950/40 px-3 py-2 text-[12px] text-white placeholder-slate-500 focus:border-violet-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void addTemplate()}
                            disabled={templateSaving || !newTemplateTitle.trim() || !newTemplateText.trim()}
                            className="inline-flex items-center gap-1.5 rounded-[10px] bg-violet-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-violet-700 disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" /> Додати шаблон
                          </button>
                        </div>

                        {templates.length === 0 ? (
                          <p className="mt-3 text-[12px] text-slate-500">
                            Шаблонів ще немає — додайте перший вище.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-1.5">
                            {templates.map((template) => (
                              <div
                                key={template.id}
                                className="rounded-[12px] border border-white/8 bg-slate-950/30 p-2.5"
                              >
                                {editingTemplateId === template.id ? (
                                  <div className="space-y-1.5">
                                    <input
                                      value={editingTemplateTitle}
                                      onChange={(e) => setEditingTemplateTitle(e.target.value)}
                                      className="w-full rounded-[8px] border border-violet-300/30 bg-slate-950/50 px-2.5 py-1.5 text-[12px] text-white focus:outline-none"
                                    />
                                    <textarea
                                      value={editingTemplateText}
                                      onChange={(e) => setEditingTemplateText(e.target.value)}
                                      rows={2}
                                      className="w-full rounded-[8px] border border-violet-300/30 bg-slate-950/50 px-2.5 py-1.5 text-[12px] text-white focus:outline-none"
                                    />
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => void saveEditTemplate()}
                                        className="rounded-[8px] bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                                      >
                                        Зберегти
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingTemplateId(null)}
                                        className="rounded-[8px] border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
                                      >
                                        Скасувати
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="line-clamp-2 text-[12px] font-bold leading-snug text-white [overflow-wrap:anywhere]">{template.title}</p>
                                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{template.text}</p>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        onClick={() => startEditTemplate(template)}
                                        title="Редагувати"
                                        className="rounded-[8px] border border-white/10 p-1.5 text-slate-300 hover:bg-white/10"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void removeTemplate(template.id)}
                                        title="Видалити"
                                        className="rounded-[8px] border border-rose-400/20 p-1.5 text-rose-300 hover:bg-rose-500/10"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[16px] border border-white/10 bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => setShowBroadcastPanel((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Megaphone className="h-4 w-4 shrink-0 text-amber-300" />
                      <span className="min-w-0 text-[11px] font-black uppercase leading-snug tracking-[0.08em] text-amber-200 [overflow-wrap:anywhere]">
                        Розсилка в Telegram
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${showBroadcastPanel ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showBroadcastPanel && (
                    <div className="space-y-2 border-t border-white/10 p-2.5">
                      <div className="rounded-[14px] border border-white/10 bg-slate-950/30 p-2.5">
                        <p className="text-[11px] leading-snug text-slate-400">
                          Надішле повідомлення в Telegram усім клієнтам, які прив&apos;язали бота
                          (натискали /start). Використовуйте для акцій і новин — не занадто часто.
                        </p>
                        <input
                          value={broadcastTitle}
                          onChange={(e) => setBroadcastTitle(e.target.value)}
                          maxLength={100}
                          placeholder="Заголовок (за замовчуванням — PartsON)"
                          className="mt-2 w-full rounded-[12px] border border-white/10 bg-slate-950/40 px-3 py-2 text-[13px] font-bold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                        <textarea
                          value={broadcastText}
                          onChange={(e) => setBroadcastText(e.target.value)}
                          rows={3}
                          placeholder="Текст розсилки..."
                          className="mt-2 w-full rounded-[12px] border border-white/10 bg-slate-950/40 px-3 py-2 text-[13px] text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />

                        {broadcastImageDataUrl ? (
                          <div className="relative mt-2 inline-block">
                            {/* Locally-picked preview (not remote), so a plain img is fine here. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={broadcastImageDataUrl}
                              alt="Фото розсилки"
                              className="h-28 w-auto rounded-[10px] border border-white/10 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setBroadcastImageDataUrl(null)}
                              className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-300 hover:text-rose-300"
                              title="Прибрати фото"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold text-slate-300 transition hover:bg-white/10">
                            <ImagePlus className="h-3.5 w-3.5" />
                            {broadcastImageProcessing ? 'Обробка...' : 'Додати фото'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={broadcastImageProcessing}
                              onChange={(e) => {
                                void handleBroadcastImagePick(e.target.files?.[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                        {broadcastImageError && (
                          <p className="mt-1 text-[11px] font-bold text-rose-300">{broadcastImageError}</p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void sendBroadcast()}
                            disabled={broadcastSending || !broadcastText.trim() || broadcastImageProcessing}
                            className="inline-flex items-center gap-1.5 rounded-[10px] bg-amber-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
                          >
                            <Megaphone className="h-3.5 w-3.5" />
                            {broadcastSending ? 'Надсилання...' : 'Надіслати всім'}
                          </button>
                          {broadcastResult && 'error' in broadcastResult && (
                            <span className="text-[11px] font-bold text-rose-300">
                              {broadcastResult.error}
                            </span>
                          )}
                          {broadcastResult && 'sent' in broadcastResult && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                              <Check className="h-3.5 w-3.5" />
                              Надіслано {broadcastResult.sent} з {broadcastResult.total}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {visibleMessageThreads.length === 0 && (
                  <EmptyPanelState
                    icon={<MessageSquareText className="h-10 w-10" strokeWidth={1.75} />}
                    title="Чатів не знайдено"
                    description="Нові діалоги з’являться тут. Також перевірте фільтр пошуку."
                  />
                )}

                {visibleMessageThreads.map((thread) => {
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
                      data-admin-card="true"
                      className="group w-full rounded-[16px] border border-white/8 bg-[image:linear-gradient(180deg,rgba(30,41,59,0.78),rgba(15,23,42,0.66))] p-2 text-left text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.14)] transition-colors duration-200 hover:border-sky-300/24 hover:bg-white/[0.06] sm:rounded-[18px] sm:p-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-sky-200/15 bg-[image:linear-gradient(135deg,rgba(14,165,233,0.18),rgba(255,255,255,0.05))] text-sm font-black uppercase text-sky-50 sm:h-11 sm:w-11">
                          <ProfileAvatar avatarId={thread.user?.avatar ?? null} frameId={thread.user?.avatarFrame}
                            motionTier={userAvatarTier(thread.user)} initial={(thread.label || '?').slice(0, 1)} animated={false} className="h-10 w-10 text-sm sm:h-11 sm:w-11" />
                          {thread.user && isUserOnline(thread.user) && (
                            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-400" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white [overflow-wrap:anywhere] sm:text-[15px]">
                              {thread.label}
                            </p>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-300 [overflow-wrap:anywhere] sm:text-[13px]">
                            {thread.preview || 'Поки що без повідомлень'}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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
                        <div className="flex shrink-0 items-center gap-1 pl-1">
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
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                            title="Видалити чат"
                          >
                            <Trash2 className="h-4.5 w-4.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
                <div className="admin-chat-workspace">
                  <aside className="admin-chat-sidebar" aria-label="Діалоги">
                    <input aria-label="Пошук діалогів" placeholder="Пошук діалогів…" value={messageSearch} onChange={event => setMessageSearch(event.target.value)} className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white" />
                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                      {messageThreads.map(thread => <button key={thread.uid} disabled={replySending || productLoading} onClick={() => openChat(thread.uid)} aria-current={thread.uid === selectedUserId ? 'true' : undefined} className={`block w-full rounded-xl border p-2 text-left disabled:opacity-50 ${thread.uid === selectedUserId ? 'border-sky-400/40 bg-sky-500/15' : 'border-white/5 hover:bg-white/5'}`}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <ProfileAvatar avatarId={thread.user?.avatar ?? null} frameId={thread.user?.avatarFrame}
                            motionTier={userAvatarTier(thread.user)} initial={thread.label.slice(0, 1)} animated={false} className="h-9 w-9 text-sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-white">{thread.label}{thread.unread > 0 && ` · ${thread.unread} нових`}</span>
                            <span className="mt-1 block truncate text-[11px] text-slate-400">{thread.preview}</span>
                          </span>
                        </span>
                      </button>)}
                      {!messageThreads.length && <p className="p-2 text-xs text-slate-400">Діалогів не знайдено</p>}
                    </div>
                  </aside>
                  <div className="flex h-full min-h-0 min-w-0 flex-col">
                  {(chatActivity.error || replyError) && <p role="alert" className="mb-2 rounded-lg bg-rose-500/15 p-2 text-xs text-rose-200">{replyError || chatActivity.error}</p>}
                  <div className="mb-2 rounded-[18px] border border-white/10 bg-[image:linear-gradient(135deg,rgba(30,41,59,0.9),rgba(15,23,42,0.88))] p-2 shadow-[0_18px_34px_rgba(2,6,23,0.2)]">
                    <div className="flex items-center gap-2.5">
                      <button
                        disabled={replySending || productLoading}
                        onClick={() => setSelectedUserId(null)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10"
                        title="Назад до списку чатів"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-sky-200/15 bg-[image:linear-gradient(135deg,rgba(14,165,233,0.2),rgba(255,255,255,0.06))] text-sm font-black uppercase text-sky-50">
                        <ProfileAvatar avatarId={selectedUserRecord?.avatar ?? null} frameId={selectedUserRecord?.avatarFrame}
                          motionTier={userAvatarTier(selectedUserRecord)} initial={(selectedDisplayName || '?').slice(0, 1)} className="h-10 w-10 text-sm" />
                        {selectedUserRecord && isUserOnline(selectedUserRecord) && (
                          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-400" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="line-clamp-2 text-sm font-black leading-snug text-white [overflow-wrap:anywhere]">
                            {selectedDisplayName}
                          </p>
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-300">
                            {selectedMessages.length}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-300 sm:text-[11px]">
                          {selectedUserRecord?.phone && (
                            <InfoChip icon={<PhoneCall className="h-3.5 w-3.5" />} label={selectedUserRecord.phone} />
                          )}
                          {selectedUserRecord?.email && (
                            <InfoChip icon={<Mail className="h-3.5 w-3.5" />} label={selectedUserRecord.email} />
                          )}
                          {selectedUserRecord?.code && (
                            <InfoChip
                              icon={<Copy className="h-3.5 w-3.5" />}
                              label={`Код: ${selectedUserRecord.code}`}
                            />
                          )}
                        </div>
                      </div>
                      {selectedUserRecord && (
                        <button
                          onClick={() => openUserOrders(selectedUserRecord.id)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-sky-300/15 bg-sky-500/10 text-sky-100 transition hover:bg-sky-500/15"
                          title="Замовлення користувача"
                        >
                          <ShoppingBag className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {selectedUserRecord?.vins.length ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {selectedUserRecord.vins.map((vin, vinIndex) => {
                            const copyKey = buildCopyKey(selectedUserRecord.id, `vin:${vin}`);
                            const isCopied = copiedClipboardKey === copyKey;

                            return (
                              <button
                                key={`${selectedUserRecord.id}-vin-${vin}-${vinIndex}`}
                                type="button"
                                onClick={() => copyUserCode(selectedUserRecord.id, vin, copyKey)}
                                className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-sky-50 transition hover:border-sky-200/40 hover:bg-sky-400/15 sm:text-[11px]"
                                title="Копіювати VIN користувача"
                              >
                                <span className="truncate">VIN {vin}</span>
                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-sky-100 transition group-hover:bg-white/14">
                                  {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-200" /> : <Copy className="h-3.5 w-3.5" />}
                                </span>
                              </button>
                            );
                        })}
                      </div>
                    ) : null}
                  </div>

                <div className="admin-chat-scroll admin-panel-scroll app-panel-scroll flex-1 min-h-0 space-y-2 overflow-y-auto rounded-[18px] border border-white/6 bg-slate-950/22 p-2 pr-1 [touch-action:pan-y] sm:pr-2">
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
                          className={`max-w-[min(82%,720px)] ${
                            isRichCard
                              ? 'bg-transparent p-0 shadow-none'
                              : `rounded-[18px] px-3 py-2 text-[13px] leading-5 shadow-[0_12px_24px_rgba(2,6,23,0.16)] sm:text-sm ${
                                  m.sender === 'user'
                                    ? 'rounded-bl-[6px] border border-white/10 bg-white/10 text-slate-100'
                                    : 'rounded-br-[6px] bg-[image:linear-gradient(135deg,rgba(14,165,233,0.95),rgba(37,99,235,0.92))] text-white'
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
                            <>
                              <p className="whitespace-pre-wrap break-words">{m.text}</p>
                              <span className={`mt-1 block text-[9px] ${
                                m.sender === 'user' ? 'text-slate-400' : 'text-sky-100/75'
                              }`}>
                                {m.sender === 'manager' && (
                                  <>
                                    {m.autoReply
                                      ? 'Автовідповідь'
                                      : m.repliedBySource === 'telegram'
                                      ? `Telegram: ${m.repliedByName || '?'}`
                                      : m.repliedByName || null}
                                    {(m.autoReply || m.repliedByName) && ' · '}
                                  </>
                                )}
                                {formatTimestampLabel(m.createdAt)}
                              </span>
                            </>
                          )}
                          {isRichCard && m.sender === 'manager' && <span className="mt-1 block text-[10px] text-slate-300">{m.repliedByName || 'Адміністратор'} · {formatTimestampLabel(m.createdAt)}</span>}
                          <MessageAdminActivity activity={chatActivity.activity[m.id]} adminId={currentAdmin?.uid} onMark={active => chatActivity.mark(m.id, active)} />
                        </div>
                        <button
                          onClick={() => deleteMessage(m.id)}
                          className="ml-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border border-transparent text-slate-400 transition hover:border-white/10 hover:bg-white/5 hover:text-rose-400 sm:ml-2 sm:h-9 sm:w-9 sm:rounded-2xl"
                          title="Видалити повідомлення"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
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

                <div className="mt-2 rounded-[18px] border border-white/10 bg-white/[0.055] p-1.5 shadow-[0_14px_26px_rgba(2,6,23,0.16)]">
                  <div className="flex gap-1.5 sm:gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    className="min-h-10 flex-1 rounded-[15px] border border-white/10 bg-slate-950/36 px-3 py-2 text-[16px] text-white placeholder-slate-300 focus:border-sky-400 focus:outline-none sm:text-sm"
                    placeholder="Написати повідомлення..."
                  />
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowTemplatePicker((p) => !p)}
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border text-white transition ${
                        showTemplatePicker
                          ? 'border-violet-300/30 bg-violet-500/20'
                          : 'border-white/10 bg-white/10 hover:bg-white/20'
                      }`}
                      title="Вставити шаблон"
                      aria-label="Вставити шаблон"
                    >
                      <Bookmark className="h-5 w-5" />
                    </button>
                    {showTemplatePicker && (
                      <div className="absolute bottom-full right-0 z-50 mb-2 max-h-56 w-64 overflow-y-auto rounded-[14px] border border-white/10 bg-slate-900 p-1.5 shadow-[0_16px_36px_rgba(2,6,23,0.4)]">
                        {templates.length === 0 ? (
                          <p className="px-2.5 py-2 text-[11px] text-slate-400">
                            Немає шаблонів. Додайте у вкладці «Шаблони».
                          </p>
                        ) : (
                          templates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => insertTemplate(template)}
                              className="block w-full rounded-[10px] px-2.5 py-2 text-left transition hover:bg-white/10"
                            >
                              <span className="block line-clamp-2 text-[12px] font-bold leading-snug text-white [overflow-wrap:anywhere]">
                                {template.title}
                              </span>
                              <span className="block line-clamp-2 text-[11px] leading-snug text-slate-400 [overflow-wrap:anywhere]">
                                {template.text}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowProductForm((p) => !p)}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border text-white transition ${
                      showProductForm
                        ? 'border-emerald-300/30 bg-emerald-500/20'
                        : 'border-white/10 bg-white/10 hover:bg-white/20'
                    }`}
                    title="Надіслати картку товару"
                    aria-label="Надіслати картку товару"
                  >
                    <PackagePlus className="h-5 w-5" />
                  </button>
                  <button
                    onClick={sendReply}
                    disabled={replySending || !replyText.trim() || !currentAdmin}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[15px] bg-sky-600 px-0 py-0 text-white shadow-[0_12px_24px_rgba(14,165,233,0.18)] transition hover:bg-sky-700 sm:w-auto sm:px-3"
                  >
                    <SendHorizontal className="h-5 w-5" />
                    <span className="hidden text-xs font-semibold sm:inline">Надіслати</span>
                  </button>
                  </div>
                </div>
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

            {roleError && (
              <div className="flex items-center justify-between gap-2 rounded-[14px] border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 sm:rounded-[16px] sm:px-3 sm:py-2">
                <span>{roleError}</span>
                <button
                  onClick={() => setRoleError(null)}
                  className="shrink-0 rounded-full p-0.5 text-rose-200 hover:bg-rose-400/20"
                  aria-label="Закрити"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {sortedUsers.length === 0 && (
              <EmptyPanelState
                icon={<Users2 className="h-10 w-10" />}
                title="Користувачів не знайдено"
                description="Спробуйте змінити пошуковий запит або дочекайтеся нових реєстрацій."
              />
            )}
            {sortedUsers.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-[14px] border border-sky-200/20 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-300 sm:rounded-[16px] sm:px-3 sm:py-2 sm:text-[11px]">
                <span>Знайдено користувачів: {sortedUsers.length}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" />
                  Онлайн: {onlineUsersCount}
                </span>
              </div>
            )}
            {sortedUsers.map((userItem, userIndex) => {
              const userChatId = getUserChatId(userItem);
              const userRowKey = `${userItem.id}:${userChatId}:${userIndex}`;
              const unreadFromUser = messages.filter(
                (m) =>
                  m.userId === userChatId &&
                  m.sender === 'user' &&
                  !m.readByAdmin
              ).length;
              const online = isUserOnline(userItem);
              return (
                <div
                  key={userRowKey}
                  data-admin-card="true"
                  className="mb-1.5 flex w-full flex-col gap-2 rounded-[16px] border border-white/7 bg-[image:linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.64))] p-2 text-left text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.14)] transition-colors hover:border-sky-300/20 hover:bg-white/[0.05] sm:mb-2 sm:rounded-[20px] sm:p-3"
                >
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            online
                              ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]'
                              : 'bg-slate-500/70'
                          }`}
                        />
                        <p className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-snug [overflow-wrap:anywhere] sm:text-sm">
                          {userItem.name || userItem.phone || 'Користувач'}
                        </p>
                        {partnerUids.includes(userItem.id) && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-200"
                            title="Партнер — надано вручну в адмінці"
                          >
                            <Handshake size={10} />
                            Партнер
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-300">
                          {userItem.phone && <span className="break-all">{userItem.phone}</span>}
                        {userItem.email && (
                          <span className="max-w-full break-all text-slate-400">
                            {userItem.email}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 border-t border-white/8 pt-1.5 sm:border-t-0 sm:pt-0">
                      {unreadFromUser > 0 && (
                        <span className="mr-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] leading-none text-white sm:mr-0">
                          {unreadFromUser}
                        </span>
                      )}

                      <button
                        onClick={() => togglePartner(userItem.id, !partnerUids.includes(userItem.id))}
                        disabled={!partnersLoaded || partnerUpdatingUid !== null}
                        aria-pressed={partnerUids.includes(userItem.id)}
                        aria-label={partnerUids.includes(userItem.id) ? 'Скасувати партнерство' : 'Зробити партнером'}
                        title={partnerUids.includes(userItem.id) ? 'Скасувати ручне партнерство; автоматичне партнерство за сумою замовлень збережеться' : 'Надати партнерство незалежно від суми замовлень'}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] border p-2 transition disabled:cursor-wait disabled:opacity-60 sm:h-10 sm:w-10 sm:rounded-2xl ${partnerUids.includes(userItem.id) ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/15'}`}
                      >
                        <Handshake size={16} />
                      </button>
                      <button
                        onClick={() =>
                          handleRoleToggle(
                            userItem.id,
                            userItem.role === 'admin' ? 'user' : 'admin'
                          )
                        }
                        disabled={roleUpdatingUid === userItem.id}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] border p-2 transition disabled:cursor-wait disabled:opacity-60 sm:h-10 sm:w-10 sm:rounded-2xl ${
                          userItem.role === 'admin'
                            ? 'border-amber-300/30 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/15'
                        }`}
                        title={
                          userItem.role === 'admin'
                            ? 'Забрати права адміністратора'
                            : 'Надати права адміністратора'
                        }
                      >
                        {userItem.role === 'admin' ? (
                          <ShieldCheck size={16} />
                        ) : (
                          <ShieldOff size={16} />
                        )}
                      </button>

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

                  <div className="min-w-0">
                    {userItem.vins.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {userItem.vins.slice(0, 3).map((vin, vinIndex) => {
                          const copyKey = buildCopyKey(userItem.id, `vin:${vin}`);
                          const isCopied = copiedClipboardKey === copyKey;

                          return (
                            <button
                              key={`${userRowKey}-vin-${vin}-${vinIndex}`}
                              type="button"
                              onClick={() => copyUserCode(userItem.id, vin, copyKey)}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-1 font-mono text-[10px] font-semibold text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-400/15"
                              title="Копіювати VIN користувача"
                            >
                              <span className="truncate">VIN {vin}</span>
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-200" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                        {userItem.vins.length > 3 && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                            +{userItem.vins.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {userItem.vins.length === 0 && (
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-400">
                        VIN не додано
                      </span>
                    )}
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
                    <span className="min-w-0 leading-snug [overflow-wrap:anywhere]">Показано замовлення: {filteredOrderUserName}</span>
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
                  placeholder="Пошук по імені, телефону, місту, ТТН"
                />
                <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5" role="tablist" aria-label="Фільтр за статусом">
                  {ORDER_FILTERS.filter((f) => f.key === 'all' || f.key === 'open' || orderStatusCounts[f.key]).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      role="tab"
                      aria-selected={orderFilter === f.key}
                      onClick={() => setOrderFilter(f.key)}
                      className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition ${
                        orderFilter === f.key
                          ? 'border-sky-300/50 bg-sky-400/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {f.label}
                      <span className="tabular-nums opacity-70">{orderStatusCounts[f.key] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            </SearchDock>
            {visibleOrders.length === 0 && (
              <EmptyPanelState
                icon={<ShoppingBag className="h-10 w-10" strokeWidth={1.75} />}
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
            {visibleOrders.map((o) => {
              const status = getOrderStatus(o);
              const statusLabel =
                status === 'cancelled' && o.cancelledBy === 'customer' ? 'Скасовано клієнтом' : ORDER_STATUS_LABEL[status];
              const statusByName =
                status === 'cancelled'
                  ? undefined
                  : o.statusUpdatedByName ||
                    (status === 'completed' ? o.completedByName : status === 'shipped' ? o.shippedByName : undefined) ||
                    (o.read ? o.viewedByName : undefined);
              const payment = o.paymentStatus ? PAYMENT_STATUS_LABEL[o.paymentStatus] : undefined;
              const busy = orderBusyId === o.id;
              const closed = isClosedOrderStatus(status);
              const history = [...(o.history ?? [])].sort((a, b) => toMillis(b.at) - toMillis(a.at));
              const noteDraft = orderNoteDrafts[o.id] ?? '';

              return (
                <div id={`admin-order-${o.id}`} key={o.id} data-admin-card="true" className="mb-1.5 scroll-mt-28 rounded-[16px] border border-white/6 bg-[image:linear-gradient(180deg,rgba(30,41,59,0.8),rgba(15,23,42,0.72))] p-2 text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.14)] sm:mb-2 sm:rounded-[20px] sm:p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => toggleOrderExpand(o.id, o.read)}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="min-w-0 truncate font-medium">{o.name}</span>
                        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${ORDER_STATUS_CLASS[status]}`}>
                          {statusLabel}
                        </span>
                        {!o.read && status !== 'cancelled' && (
                          <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">не відкрито</span>
                        )}
                        {payment && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${payment.className}`}>{payment.label}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatTimestampLabel(o.createdAt)} · <span className="tabular-nums">{o.totalAmount} грн</span>
                        {statusByName && ` · ${statusByName}`}
                        {o.npStatus && ` · НП: ${o.npStatus}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => setOrderStatus(o.id, 'shipped')}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-blue-300 hover:text-blue-200 sm:h-10 sm:w-10 sm:rounded-2xl ${
                          closed || status === 'shipped' || status === 'arrived' ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        title={status === 'cancelled' ? 'Замовлення скасовано' : 'Відправлено'}
                        aria-label="Позначити відправленим"
                        disabled={busy || closed || status === 'shipped' || status === 'arrived'}
                      >
                        <Truck className="w-5 h-5" strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => setOrderStatus(o.id, 'completed')}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-emerald-300 hover:text-emerald-200 sm:h-10 sm:w-10 sm:rounded-2xl ${
                          closed ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        title={status === 'cancelled' ? 'Замовлення скасовано' : 'Виконано'}
                        aria-label="Позначити виконаним"
                        disabled={busy || closed}
                      >
                        <CircleCheck className="w-5 h-5" strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => toggleOrderExpand(o.id, true)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 sm:h-10 sm:w-10 sm:rounded-2xl"
                        aria-label={expandedOrderId === o.id ? 'Згорнути замовлення' : 'Розгорнути замовлення'}
                        aria-expanded={expandedOrderId === o.id}
                      >
                        {expandedOrderId === o.id ? <ChevronUp /> : <ChevronDown />}
                      </button>
                    </div>
                  </div>
                  {orderActionError?.orderId === o.id && (
                    <p className="mt-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100">
                      {orderActionError.text}
                    </p>
                  )}
                  {expandedOrderId === o.id && (
                    <div className="mt-2 text-sm space-y-2 text-slate-200">
                      {status === 'cancelled' && (
                        <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-rose-100">
                          {o.cancelledBy === 'customer' ? 'Клієнт скасував замовлення до опрацювання.' : 'Замовлення скасовано.'}{' '}
                          {o.stockReturn?.status === 'done'
                            ? 'Товар повернуто на склад (Поступлення в 1С).'
                            : o.stockReturn?.status === 'partial'
                              ? 'Частину товару не вдалося повернути в 1С — перевірте залишки.'
                              : o.stockReturn?.status === 'pending'
                                ? 'Повертаємо товар на склад…'
                                : 'Товар із залишку не списувався.'}
                        </p>
                      )}
                      {status !== 'cancelled' && (
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Статус</p>
                          <div className="flex flex-wrap gap-1">
                            {MANUAL_ORDER_STATUSES.map((value) => (
                              <button
                                key={value}
                                type="button"
                                disabled={busy || value === status}
                                onClick={() => setOrderStatus(o.id, value)}
                                aria-pressed={value === status}
                                className={`min-h-8 rounded-full border px-2.5 text-[11px] font-bold transition disabled:cursor-default ${
                                  value === status
                                    ? `border-transparent ${ORDER_STATUS_CLASS[value]}`
                                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                {ORDER_STATUS_LABEL[value]}
                              </button>
                            ))}
                          </div>
                          {status === 'returned' && (
                            <p className="mt-1 text-[11px] text-amber-200/90">
                              Повернення не змінює залишки в 1С автоматично — оформіть Поступлення вручну.
                            </p>
                          )}
                          <p className="mt-1 text-[10px] text-slate-500">
                            Підтверджено / Відправлено / У відділенні / Виконано — клієнт отримує повідомлення в Telegram, якщо його прив’язав.
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <p>Телефон: <a className="text-sky-200 hover:underline" href={`tel:${o.phone}`}>{o.phone}</a></p>
                        <p>Оплата: {o.paymentMethod}{payment ? ` · ${payment.label}` : ''}</p>
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
                        {o.npStatus && (
                          <p>
                            Нова Пошта: {o.npStatus}
                            {o.npPaidStorageFrom ? ` · платне зберігання з ${o.npPaidStorageFrom}` : ''}
                          </p>
                        )}
                      </div>
                      {isNovaPoshtaDelivery(o.deliveryMethod) && (
                        <OrderTrackingEditor key={o.id} orderId={o.id} trackingNumber={o.trackingNumber}
                          onSaved={(trackingNumber) => setOrders((previous) => previous.map((order) =>
                            order.id === o.id ? { ...order, trackingNumber } : order
                          ))} />
                      )}
                      {o.cartItems?.map((i, idx) => (
                        <p key={idx} className="text-xs text-slate-300">
                          {i.article ? <b className="text-slate-100">{i.article}</b> : null} {i.name} x {i.quantity} — {i.price}
                        </p>
                      ))}
                      <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-2">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          Коментар менеджера (бачать лише адміни)
                        </p>
                        <div className="flex gap-1.5">
                          <input
                            value={noteDraft}
                            maxLength={ORDER_NOTE_MAX_LENGTH}
                            onChange={(e) => setOrderNoteDrafts((previous) => ({ ...previous, [o.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveOrderNote(o.id);
                              }
                            }}
                            placeholder="Напр.: передзвонити після 18:00, чекаємо поставку"
                            className="h-9 min-w-0 flex-1 rounded-[10px] border border-white/12 bg-slate-950/50 px-2.5 text-[16px] text-white placeholder:text-[12px] placeholder:text-slate-500 focus:border-sky-300/60 focus:outline-none sm:text-sm"
                          />
                          <button
                            type="button"
                            disabled={busy || !noteDraft.trim()}
                            onClick={() => void saveOrderNote(o.id)}
                            className="h-9 shrink-0 rounded-[10px] border border-sky-300/30 bg-sky-500/15 px-3 text-xs font-bold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
                          >
                            Додати
                          </button>
                        </div>
                        {history.length > 0 && (
                          <ol className="mt-2 space-y-1 border-l border-white/10 pl-2.5">
                            {history.map((entry, index) => (
                              <li key={`${toMillis(entry.at)}-${index}`} className="text-[11px] leading-snug text-slate-300">
                                <span className="text-slate-500">
                                  {new Date(toMillis(entry.at)).toLocaleString('uk-UA', {
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>{' '}
                                <b className="text-slate-200">{entry.byName || 'Адмін'}</b>
                                {entry.status ? ` → ${ORDER_STATUS_LABEL[entry.status] ?? entry.status}` : ''}
                                {entry.note && !(entry.source === 'novaposhta' && entry.status) ? `: ${entry.note}` : ''}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {ordersMayHaveMore && (
              <div className="py-2 text-center">
                <button
                  type="button"
                  onClick={() => setOrdersLimit((value) => value + ORDERS_PAGE_SIZE)}
                  className="min-h-10 rounded-[12px] border border-white/12 bg-white/6 px-4 text-xs font-bold text-slate-100 hover:bg-white/12"
                >
                  Завантажити старіші замовлення
                </button>
                <p className="mt-1 text-[10px] text-slate-500">
                  Завантажено {orders.length}. Пошук і фільтри працюють по завантажених.
                </p>
              </div>
            )}
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
            {visibleCalls.length === 0 && (
              <EmptyPanelState
                icon={<PhoneCall className="h-10 w-10" />}
                title="Заявок на дзвінок не знайдено"
                description="Спробуйте змінити пошук або дочекайтеся нових звернень."
              />
            )}
          {visibleCalls.map((c) => {
            const callStatus = c.processed ? 'Виконано' : 'Новий';
            const callStatusClass = c.processed
              ? 'bg-emerald-500/20 text-emerald-200'
              : 'bg-sky-500/20 text-sky-200';

            return (
              <div key={c.id} data-admin-card="true" className="rounded-[16px] border border-white/6 bg-[image:linear-gradient(180deg,rgba(30,41,59,0.8),rgba(15,23,42,0.72))] p-2 text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.14)] sm:rounded-[20px] sm:p-3">
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
      </div>
      <AdminWindowResizeHandles />
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
  value?: number;
  meta: string;
  badgeCount?: number;
  active: boolean;
  onClick: () => void;
}) {
  const displayBadgeCount = badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <button
      onClick={onClick}
      className={`relative flex min-h-[38px] items-center gap-1.5 rounded-[12px] border px-1.5 py-1 text-left transition sm:min-h-[40px] sm:gap-1.5 sm:px-2 sm:py-1 sm:rounded-[14px] ${
        active
          ? 'border-sky-300/40 bg-[image:linear-gradient(135deg,rgba(56,189,248,0.2),rgba(37,99,235,0.18))] text-white shadow-[0_14px_30px_rgba(14,165,233,0.18),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'border-white/7 bg-white/[0.035] text-slate-300 hover:border-white/14 hover:bg-white/[0.07]'
      }`}
    >
      <span
        className={`relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] sm:h-6 sm:w-6 sm:rounded-[9px] ${
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
        <div className="flex items-center justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-[8.5px] font-bold leading-[1.15] text-slate-100 [overflow-wrap:anywhere] sm:text-[10px]">
              {label}
            </div>
            <div className="mt-0.5 hidden text-[8px] font-medium leading-tight text-slate-300 [overflow-wrap:anywhere] lg:block">
              {meta}
            </div>
          </div>
          {value !== undefined && (
            <div className="shrink-0 text-[12px] font-black tracking-[-0.04em] text-white sm:text-sm">
              {value}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function AdminToggleButton({
  active,
  icon,
  label,
  ariaLabel,
  title,
  onClick,
  className = '',
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  ariaLabel?: string;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || label}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[12px] border text-[10px] font-black uppercase tracking-[0.08em] transition sm:h-9 ${
        label ? 'px-2 sm:px-3' : 'w-8 px-0 sm:w-9'
      } ${
        active
          ? 'border-sky-200/50 bg-sky-400/18 text-sky-50 shadow-[0_10px_22px_rgba(14,165,233,0.12)]'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      } ${className}`}
      aria-pressed={active}
    >
      {icon}
      {label ? <span>{label}</span> : null}
    </button>
  );
}

function AdminMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'sky' | 'rose' | 'emerald' | 'slate';
}) {
  const toneClass =
    tone === 'rose'
      ? 'from-rose-500/16 to-rose-400/6 text-rose-100 border-rose-200/18'
      : tone === 'emerald'
      ? 'from-emerald-500/16 to-emerald-400/6 text-emerald-100 border-emerald-200/18'
      : tone === 'sky'
      ? 'from-sky-500/18 to-cyan-400/7 text-sky-100 border-sky-200/20'
      : 'from-white/10 to-white/[0.03] text-slate-100 border-white/10';

  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-2 rounded-[11px] border bg-[image:linear-gradient(135deg,var(--tw-gradient-stops))] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-2.5 ${toneClass}`}
    >
      <p className="min-w-0 text-[8px] font-bold uppercase leading-[1.15] tracking-[0.06em] opacity-75 [overflow-wrap:anywhere] sm:text-[9px]">
        {label}
      </p>
      <p className="shrink-0 text-sm font-black leading-none tracking-[-0.04em] sm:text-base">
        {value}
      </p>
    </div>
  );
}

function MessageStatPill({
  label,
  value,
  tone = 'sky',
}: {
  label: string;
  value: number;
  tone?: 'sky' | 'rose';
}) {
  return (
    <span
      className={`inline-flex min-w-[48px] flex-col items-center justify-center rounded-[12px] border px-2 py-1 ${
        tone === 'rose'
          ? 'border-rose-200/20 bg-rose-500/12 text-rose-100'
          : 'border-sky-200/20 bg-sky-500/12 text-sky-100'
      }`}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.08em] opacity-75">
        {label}
      </span>
      <span className="text-sm font-black leading-none">{value}</span>
    </span>
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
    <div className="w-full min-w-0 max-w-[320px] rounded-xl border border-white/10 bg-slate-900/40 p-3 text-left text-slate-100 sm:min-w-[220px]">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        Товар
      </div>
      <div className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{product.name}</div>
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
      className={`group block w-full min-w-0 max-w-[320px] overflow-hidden rounded-xl border sm:min-w-[220px] ${
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
        <span className="block leading-snug [overflow-wrap:anywhere]">{imageName || 'Фото'}</span>
      </div>
    </a>
  );
}
