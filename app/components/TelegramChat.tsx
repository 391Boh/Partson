// TelegramChat.tsx
'use client';

import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import {
  Send,
  X,
  Headphones,
  MessageCircle,
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  ClipboardList,
  ImagePlus,
  Loader2,
} from 'lucide-react';
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

const chatGhostButton =
  'inline-flex items-center justify-center rounded-[14px] border border-slate-200/80 bg-white/90 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-[transform,box-shadow,border-color,background-color,color] duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-200/80 hover:bg-white hover:text-slate-900 hover:shadow-[0_14px_28px_rgba(14,165,233,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 disabled:cursor-not-allowed disabled:opacity-45';
const chatGhostSquareButton = `${chatGhostButton} h-8 w-8`;
const chatSecondaryPillButton =
  'inline-flex items-center gap-2 rounded-[14px] border border-slate-200/80 bg-white/92 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.06)] transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-200/80 hover:bg-white hover:shadow-[0_16px_30px_rgba(14,165,233,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70';
const chatPrimaryPillButton =
  'inline-flex items-center gap-2 rounded-[14px] border border-sky-100/35 bg-[image:linear-gradient(135deg,rgba(15,23,42,0.95)_0%,rgba(37,99,235,0.9)_52%,rgba(6,182,212,0.88)_100%)] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_16px_30px_rgba(37,99,235,0.22)] transition-[transform,box-shadow,border-color,filter] duration-300 ease-out hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_20px_36px_rgba(14,165,233,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80';
const CHAT_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024;
const CHAT_IMAGE_MAX_INLINE_BYTES = 340 * 1024;
const CHAT_IMAGE_HARD_MAX_INLINE_BYTES = 430 * 1024;
const CHAT_IMAGE_MAX_DIMENSION = 1400;
const CHAT_IMAGE_PROCESS_THRESHOLD = 1400 * 1024;
const MANAGER_PRESENCE_STALE_MS = 75_000;
const MANAGER_PRESENCE_HIDE_DELAY_MS = 8_000;
const MANAGER_PRESENCE_POLL_MS = 5_000;

function readTimestampMs(raw: unknown): number | null {
  if (!raw) return null;

  if (raw instanceof Timestamp) {
    return raw.toDate().getTime();
  }

  if (
    typeof raw === 'object' &&
    raw !== null &&
    'toDate' in raw &&
    typeof raw.toDate === 'function'
  ) {
    const value = raw.toDate().getTime();
    return Number.isFinite(value) ? value : null;
  }

  if (raw instanceof Date) {
    const value = raw.getTime();
    return Number.isFinite(value) ? value : null;
  }

  if (typeof raw === 'string' || typeof raw === 'number') {
    const value = new Date(raw).getTime();
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const sanitizedName = fileName.trim() || 'photo';
  const baseName = sanitizedName.replace(/\.[^.]+$/, '') || 'photo';
  return `${baseName}.${nextExtension}`;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('IMAGE_LOAD_FAILED'));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('DATA_URL_FAILED'));
    };

    reader.onerror = () => reject(new Error('DATA_URL_FAILED'));
    reader.readAsDataURL(file);
  });
}

async function optimizeChatImage(file: File): Promise<File> {
  if (
    typeof window === 'undefined' ||
    !file.type.startsWith('image/')
  ) {
    return file;
  }

  const image = await loadImageElement(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const baseScale =
    longestSide > CHAT_IMAGE_MAX_DIMENSION
      ? CHAT_IMAGE_MAX_DIMENSION / longestSide
      : 1;

  let targetWidth = Math.max(1, Math.round(image.naturalWidth * baseScale));
  let targetHeight = Math.max(1, Math.round(image.naturalHeight * baseScale));
  let bestBlob: Blob | null = null;
  const qualitySteps = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

  while (true) {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      return file;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    for (const quality of qualitySteps) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (!blob) continue;

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= CHAT_IMAGE_MAX_INLINE_BYTES) {
        return new File([blob], replaceFileExtension(file.name, 'jpg'), {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        });
      }
    }

    if (bestBlob && bestBlob.size <= CHAT_IMAGE_HARD_MAX_INLINE_BYTES) {
      return new File([bestBlob], replaceFileExtension(file.name, 'jpg'), {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      });
    }

    if (targetWidth <= 720 || targetHeight <= 720) {
      break;
    }

    targetWidth = Math.max(720, Math.round(targetWidth * 0.84));
    targetHeight = Math.max(720, Math.round(targetHeight * 0.84));
  }

  if (!bestBlob) {
    return file;
  }

  return new File([bestBlob], replaceFileExtension(file.name, 'jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
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
  const [isManagerInChat, setIsManagerInChat] = useState(false);
  const [managerPresenceUpdatedAtMs, setManagerPresenceUpdatedAtMs] = useState<number | null>(null);
  const [managerPresenceSessionCount, setManagerPresenceSessionCount] = useState(0);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const { addToCart } = useCart();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefillSendingRef = useRef(false);
  const lastPrefillRef = useRef<string | null>(null);
  const managerPresenceHideTimeoutRef = useRef<number | null>(null);

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
          imageUrl: data.imageUrl ?? undefined,
          imageName: data.imageName ?? undefined,
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

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setManagerPresenceSessionCount(0);
      setManagerPresenceUpdatedAtMs(null);
      return;
    }

    return onSnapshot(doc(db, 'chatPresence', userId), (snapshot) => {
      if (!snapshot.exists()) {
        setManagerPresenceSessionCount(0);
        setManagerPresenceUpdatedAtMs(null);
        return;
      }

      const data = snapshot.data() as {
        managerSessionIds?: unknown;
        updatedAt?: unknown;
      };
      const managerSessionIds = Array.isArray(data.managerSessionIds)
        ? data.managerSessionIds.filter(
            (value): value is string =>
              typeof value === 'string' && value.trim().length > 0
          )
        : [];

      setManagerPresenceSessionCount(managerSessionIds.length);
      setManagerPresenceUpdatedAtMs(readTimestampMs(data.updatedAt));
    });
  }, [getUserId]);

  useEffect(() => {
    return () => {
      if (
        managerPresenceHideTimeoutRef.current !== null &&
        typeof window !== 'undefined'
      ) {
        window.clearTimeout(managerPresenceHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clearScheduledHide = () => {
      if (managerPresenceHideTimeoutRef.current === null) return;

      window.clearTimeout(managerPresenceHideTimeoutRef.current);
      managerPresenceHideTimeoutRef.current = null;
    };

    const scheduleHide = () => {
      if (managerPresenceHideTimeoutRef.current !== null) return;

      managerPresenceHideTimeoutRef.current = window.setTimeout(() => {
        setIsManagerInChat(false);
        managerPresenceHideTimeoutRef.current = null;
      }, MANAGER_PRESENCE_HIDE_DELAY_MS);
    };

    const updatePresence = () => {
      const hasActiveSession = managerPresenceSessionCount > 0;
      const isFreshPresence =
        !managerPresenceUpdatedAtMs ||
        Date.now() - managerPresenceUpdatedAtMs <= MANAGER_PRESENCE_STALE_MS;

      if (hasActiveSession && isFreshPresence) {
        clearScheduledHide();
        setIsManagerInChat(true);
        return;
      }

      scheduleHide();
    };

    updatePresence();
    const timerId = window.setInterval(updatePresence, MANAGER_PRESENCE_POLL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [managerPresenceSessionCount, managerPresenceUpdatedAtMs]);

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

  const sendImageMessage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setImageUploadError('Можна додавати лише зображення.');
        return;
      }

      if (file.size > CHAT_IMAGE_MAX_INPUT_BYTES) {
        setImageUploadError('Фото занадто велике. Максимум 20 МБ до стиснення.');
        return;
      }

      const userId = getUserId();
      if (!userId) {
        setImageUploadError('Не вдалося визначити користувача чату.');
        return;
      }

      const trimmedName = file.name.trim();
      setImageUploading(true);
      setImageUploadProgress(8);
      setImageUploadError(null);

      try {
        const preparedFile = await optimizeChatImage(file);
        if (preparedFile.size > CHAT_IMAGE_HARD_MAX_INLINE_BYTES) {
          setImageUploadError('Фото все ще завелике після стиснення. Оберіть менше або простіше зображення.');
          return;
        }
        setImageUploadProgress(preparedFile.size <= CHAT_IMAGE_PROCESS_THRESHOLD ? 38 : 54);
        const imageUrl = await readFileAsDataUrl(preparedFile);
        setImageUploadProgress(76);

        if (imageUrl.length > 900_000) {
          setImageUploadError('Фото завелике для надсилання в чат. Спробуйте інше зображення.');
          return;
        }

        await addDoc(collection(db, 'messages'), {
          text: trimmedName || 'Фото',
          sender: 'user',
          userId,
          createdAt: serverTimestamp(),
          textRead: true,
          type: 'image',
          imageUrl,
          imageName: trimmedName || 'Фото',
        });
        setImageUploadProgress(100);
      } catch {
        setImageUploadError('Не вдалося підготувати або надіслати фото. Спробуйте ще раз.');
      } finally {
        setImageUploading(false);
        setImageUploadProgress(null);
      }
    },
    [getUserId]
  );

  const handleImageSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await sendImageMessage(file);
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
    const price = product.price;

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
          price,
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
      className="fixed z-50 flex flex-col overflow-hidden border border-white/14 bg-[image:linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.98)_100%)] shadow-[0_36px_88px_rgba(2,6,23,0.32)] backdrop-blur-2xl"
      style={
        isDesktop
          ? {
              right: 28,
              bottom: 112,
              width: 408,
              height: 580,
              borderRadius: 26,
            }
          : {
              left: 12,
              right: 12,
              top: 72,
              bottom: 14,
              borderRadius: 24,
            }
      }
    >
      <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.12),transparent_34%)]" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.5),transparent)]" />

      <div className="relative overflow-hidden border-b border-white/10 bg-[image:linear-gradient(135deg,rgba(15,23,42,0.98)_0%,rgba(30,41,59,0.96)_42%,rgba(14,165,233,0.84)_100%)] px-4 py-3 text-white">
        <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.12),transparent_34%),radial-gradient(circle_at_84%_14%,rgba(125,211,252,0.2),transparent_28%)]" />
        <div className="relative flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex flex-1 items-start gap-2.5 pr-2 sm:pr-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border border-white/14 bg-white/10 text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_20px_rgba(2,6,23,0.16)] backdrop-blur sm:h-10 sm:w-10 sm:rounded-[16px]">
              <MessageCircle size={17} strokeWidth={2.1} />
            </span>
            <div className="min-w-0">
              <div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-sky-100/75 sm:text-[9px] sm:tracking-[0.24em]">
                PARTSON
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-x-2.5">
                <div className="text-[15px] font-semibold leading-tight tracking-tight text-white sm:text-[16px]">
                  Чат підтримки
                </div>
                <div className="inline-flex max-w-full shrink-0 items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-medium text-emerald-50/90 backdrop-blur sm:text-[9px]">
                  Завжди на зв&apos;язку
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-white/14 bg-white/10 text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-[background-color,border-color,color,box-shadow] duration-300 ease-out hover:border-white/20 hover:bg-white/14 hover:text-white hover:shadow-[0_10px_20px_rgba(2,6,23,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
          >
            <X size={17} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {isManagerInChat && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative mt-2.5 overflow-hidden rounded-[18px] border border-emerald-200/18 bg-[image:linear-gradient(135deg,rgba(16,185,129,0.18)_0%,rgba(14,165,233,0.12)_100%)] px-3 py-2.5 shadow-[0_14px_28px_rgba(5,150,105,0.16)] backdrop-blur"
            >
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-[image:linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)]"
                animate={{ x: ['0%', '360%'] }}
                transition={{ duration: 3.4, ease: 'easeInOut', repeat: Infinity }}
              />
              <div className="relative flex items-center gap-2.5">
                <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-emerald-300/40"
                    animate={{ scale: [1, 1.85, 1], opacity: [0.55, 0, 0.55] }}
                    transition={{ duration: 1.9, ease: 'easeOut', repeat: Infinity }}
                  />
                  <motion.span
                    aria-hidden="true"
                    className="relative h-2.5 w-2.5 rounded-full bg-emerald-200 shadow-[0_0_14px_rgba(167,243,208,0.9)]"
                    animate={{ scale: [1, 1.14, 1], opacity: [0.9, 1, 0.9] }}
                    transition={{ duration: 1.35, ease: 'easeInOut', repeat: Infinity }}
                  />
                </span>
                <div className="min-w-0 text-[11px] font-semibold tracking-[0.08em] text-white">
                  Менеджер зараз у чаті
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative flex-1 overflow-y-auto brand-scroll px-3 py-3">
        <div className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.65),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(56,189,248,0.12),transparent_26%),linear-gradient(180deg,rgba(248,250,252,0.46),rgba(241,245,249,0.2))]" />
        <div className="relative space-y-3 pb-1">
          <div className="flex max-w-[92%] items-start gap-3 rounded-[22px] border border-sky-100/70 bg-white/90 px-4 py-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.08)] backdrop-blur">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border border-sky-100/80 bg-[image:linear-gradient(135deg,rgba(239,246,255,0.95),rgba(224,242,254,0.92))] text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.12)]">
              <Headphones size={16} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Підтримка PartsON
              </div>
              <div className="mt-1 leading-relaxed text-slate-700">
                Вітаємо! Напишіть артикул, VIN або питання щодо замовлення, і підкажемо потрібну деталь.
              </div>
            </div>
          </div>

          {messages.map((m) => {
            const product = m.type === 'product' ? m.product : undefined;
            const hasImage = m.type === 'image' && Boolean(m.imageUrl);
            const isProduct = Boolean(product);
            const isRichCard = isProduct || hasImage;
            const isUser = m.sender === 'user';

            return (
              <div
                key={m.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[86%] ${
                    isRichCard
                      ? 'bg-transparent p-0 shadow-none'
                      : 'rounded-[22px] px-4 py-3 text-sm leading-relaxed'
                  } ${
                    isUser
                      ? isRichCard
                        ? ''
                        : 'border border-slate-200/85 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_58%,rgba(226,232,240,0.9)_100%)] text-slate-700 shadow-[0_12px_26px_rgba(15,23,42,0.08)] backdrop-blur'
                      : isRichCard
                      ? ''
                      : 'border border-sky-100/35 bg-[image:linear-gradient(145deg,rgba(15,23,42,0.96)_0%,rgba(30,64,175,0.92)_52%,rgba(14,165,233,0.86)_100%)] text-white shadow-[0_18px_36px_rgba(37,99,235,0.22)]'
                  }`}
                >
                  {product ? (
                    <ChatProductCard product={product} onAddToOrder={addToOrder} />
                  ) : hasImage && m.imageUrl ? (
                    <ChatImageCard
                      imageUrl={m.imageUrl}
                      imageName={m.imageName ?? m.text}
                      isUser={isUser}
                    />
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {orderItems.length > 0 && (
        <div className="border-t border-slate-200/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.95),rgba(240,249,255,0.92))] px-3 py-3">
          <div className="rounded-[20px] border border-sky-100/70 bg-white/88 p-3 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[14px] border border-sky-100/80 bg-[image:linear-gradient(135deg,rgba(239,246,255,0.96),rgba(224,242,254,0.92))] text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.12)]">
                  <ClipboardList size={15} strokeWidth={2} />
                </span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Замовлення
                  </div>
                  <div className="text-sm font-semibold text-slate-800">
                    Кошик у чаті
                  </div>
                </div>
              </div>
              <div className="rounded-full border border-sky-100/80 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                {orderItems.length} поз.
              </div>
            </div>

            <div className="max-h-36 space-y-2 overflow-y-auto brand-scroll pr-1">
              {orderItems.map((item) => (
                <div
                  key={item.code}
                  className="flex items-center justify-between gap-2 rounded-[16px] border border-slate-200/80 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-2.5 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-slate-800">
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {item.article}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateOrderQty(item.code, item.quantity - 1)}
                      className={chatGhostSquareButton}
                    >
                      <Minus size={12} className="mx-auto" />
                    </button>
                    <span className="w-6 text-center text-xs font-semibold text-slate-700">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateOrderQty(item.code, item.quantity + 1)}
                      className={chatGhostSquareButton}
                    >
                      <Plus size={12} className="mx-auto" />
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-semibold text-slate-800">
                      {Math.round(item.price * item.quantity).toLocaleString('uk-UA')} грн
                    </div>
                  </div>
                  <button
                    onClick={() => removeOrderItem(item.code)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] text-slate-400 transition-[transform,color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-700">
              <span className="font-semibold text-slate-800">
                Разом: {orderTotal.toLocaleString('uk-UA')} грн
              </span>
              <div className="flex items-center gap-2">
                <button onClick={addOrderToCart} className={chatSecondaryPillButton}>
                  <ShoppingCart size={14} />
                  В кошик
                </button>
                <button onClick={checkoutOrder} className={chatPrimaryPillButton}>
                  Оформити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-200/80 bg-white/92 px-3 py-3">
        <div className="rounded-[20px] border border-slate-200/80 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.86))] p-2 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelection}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-[16px] border border-sky-100/70 bg-white/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                className="w-full bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                placeholder="Ваше повідомлення"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-200/80 bg-white/92 text-slate-600 shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition-[transform,box-shadow,border-color,color] duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-200/80 hover:text-sky-700 hover:shadow-[0_16px_30px_rgba(14,165,233,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
              title="Додати фото"
            >
              {imageUploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ImagePlus size={18} />
              )}
            </button>
            <button
              onClick={sendMessage}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-sky-100/35 bg-[image:linear-gradient(145deg,rgba(30,41,59,0.96)_0%,rgba(37,99,235,0.92)_48%,rgba(34,211,238,0.88)_100%)] text-white shadow-[0_16px_30px_rgba(14,116,144,0.2)] transition-[transform,box-shadow,filter,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-100/55 hover:brightness-[1.04] hover:shadow-[0_20px_38px_rgba(14,165,233,0.26)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
          <AnimatePresence initial={false} mode="wait">
            {imageUploadError ? (
              <motion.div
                key="image-error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-2 rounded-[14px] border border-rose-200/70 bg-rose-50/90 px-3 py-2 text-[11px] font-medium text-rose-600"
              >
                {imageUploadError}
              </motion.div>
            ) : imageUploading ? (
              <motion.div
                key="image-loading"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-2 flex items-center gap-2 rounded-[14px] border border-sky-100/70 bg-sky-50/80 px-3 py-2 text-[11px] font-medium text-sky-700"
              >
                <Loader2 size={13} className="animate-spin" />
                {imageUploadProgress !== null && imageUploadProgress > 0
                  ? `Надсилаємо фото: ${imageUploadProgress}%`
                  : 'Готуємо фото до надсилання...'}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
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
    <div className="min-w-[250px] max-w-[326px] rounded-[20px] border border-slate-200/80 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_56%,rgba(224,242,254,0.92)_100%)] p-3.5 text-slate-900 shadow-[0_16px_30px_rgba(15,23,42,0.08)]">
      <div className="flex gap-3">
        <div className="h-[76px] w-[92px] shrink-0 overflow-hidden rounded-[16px] border border-sky-100/80 bg-white shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
          <ProductCardImage productCode={code} className="w-full h-full" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Товар
          </div>
          <div className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-800">
            {name}
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-slate-600">
            {article && <div>Артикул: {article}</div>}
            {product.code && <div>Код: {product.code}</div>}
            {product.producer && <div>Виробник: {product.producer}</div>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className={chatGhostSquareButton}
            disabled={qty <= 1}
          >
            <Minus size={14} className="mx-auto" />
          </button>
          <span className="w-7 text-center text-sm font-semibold text-slate-800">
            {qty}
          </span>
          <button
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            className={chatGhostSquareButton}
            disabled={isMax}
          >
            <Plus size={14} className="mx-auto" />
          </button>
        </div>

        <div className="text-right">
          {typeof product.price === 'number' ? (
            <div className="text-sm font-semibold text-sky-700">
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

      <div className="mt-4 flex items-center justify-between gap-3">
        {product.link ? (
          <a
            href={product.link}
            className="text-[11px] font-semibold text-sky-700 transition-colors duration-200 hover:text-sky-800 hover:underline"
          >
            Відкрити в каталозі
          </a>
        ) : (
          <span className="text-[11px] text-slate-400">Немає посилання</span>
        )}
        <button
          onClick={() => onAddToOrder(product, qty)}
          disabled={!canAdd}
          className={`inline-flex items-center gap-2 rounded-[14px] px-3.5 py-2 text-[11px] font-semibold transition-[transform,box-shadow,filter,background-color,color] duration-300 ease-out ${
            canAdd
              ? 'border border-sky-100/35 bg-[image:linear-gradient(135deg,rgba(15,23,42,0.95)_0%,rgba(37,99,235,0.9)_52%,rgba(6,182,212,0.88)_100%)] text-white shadow-[0_14px_28px_rgba(37,99,235,0.2)] hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_18px_32px_rgba(14,165,233,0.22)]'
              : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
          }`}
        >
          <ShoppingCart size={14} />
          В замовлення
        </button>
      </div>
    </div>
  );
}

function ChatImageCard({
  imageUrl,
  imageName,
  isUser,
}: {
  imageUrl: string;
  imageName?: string;
  isUser: boolean;
}) {
  return (
    <a
      href={imageUrl}
      target="_blank"
      rel="noreferrer"
      className={`group block min-w-[230px] max-w-[320px] overflow-hidden rounded-[20px] border ${
        isUser
          ? 'border-sky-300/18 bg-[image:linear-gradient(160deg,rgba(15,23,42,0.92)_0%,rgba(30,41,59,0.88)_100%)] shadow-[0_18px_34px_rgba(15,23,42,0.26)]'
          : 'border-sky-100/75 bg-white/95 shadow-[0_16px_30px_rgba(15,23,42,0.08)]'
      }`}
    >
      <div className="overflow-hidden bg-slate-950/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={imageName || 'Фото'}
          loading="lazy"
          className="max-h-[260px] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <div
        className={`px-3 py-2.5 text-[11px] ${
          isUser ? 'text-slate-100' : 'text-slate-600'
        }`}
      >
        <span className="block truncate font-medium">{imageName || 'Фото'}</span>
      </div>
    </a>
  );
}
