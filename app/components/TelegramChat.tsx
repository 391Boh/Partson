'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
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
import { Send, X, Headphones, Move } from 'lucide-react';
import { db } from 'firebase';

interface Message {
  id: string;
  text: string;
  sender: string;
  userId: string;
  createdAt: any;
  read: boolean | undefined;
  textRead?: boolean;
}

interface TelegramChatProps {
  isOpen: boolean;
  onClose: () => void;
  onNewMessage?: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export default function TelegramChat({
  isOpen,
  onClose,
  onNewMessage,
  onUnreadCountChange,
}: TelegramChatProps) {
  if (!isOpen) return null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const getUserId = useCallback(() => {
    let userId = localStorage.getItem('user_id');
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem('user_id', userId);
    }
    return userId;
  }, []);

  useEffect(() => {
    const userId = getUserId();
    const q = query(
      collection(db, 'messages'),
      where('userId', '==', userId),
      where('sender', 'in', ['user', 'manager']),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map((doc) => ({
        id: doc.id,
        text: doc.data().text,
        sender: doc.data().sender,
        userId: doc.data().userId,
        createdAt: doc.data().createdAt?.toDate(),
        read: doc.data().read,
        textRead: doc.data().textRead,
      })) as Message[];

      setMessages(newMessages);

      const unread = newMessages.filter(
        (msg) => msg.sender === 'manager' && msg.userId === userId && !msg.textRead
      ).length;

      setUnreadCount(unread);
      if (unread > 0) onNewMessage?.();
      onUnreadCountChange?.(unread);
    });

    return () => unsubscribe();
  }, [getUserId, onNewMessage, onUnreadCountChange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage = {
      id: uuidv4(),
      text: input.trim(),
      sender: 'user',
      userId: getUserId(),
      createdAt: serverTimestamp(),
    };

    setInput('');

    try {
      await addDoc(collection(db, 'messages'), newMessage);
    } catch (error) {
      console.error('Send error:', error);
    }
  };

  const markMessagesAsRead = useCallback(async () => {
    const userId = getUserId();

    const unreadMessages = messages.filter(
      (msg) =>
        msg.sender === 'manager' &&
        msg.userId === userId &&
        !msg.textRead
    );

    for (const msg of unreadMessages) {
      const messageRef = doc(db, 'messages', msg.id);
      await updateDoc(messageRef, {
        read: true,
        textRead: true,
      });
    }
  }, [messages, getUserId]);

  useEffect(() => {
    if (isOpen) {
      markMessagesAsRead();
    }
  }, [isOpen, messages, markMessagesAsRead]);

  // Стан і логіка drag лише для десктопів (ширина >= 1024)
  const [position, setPosition] = useState({
    x: typeof window !== 'undefined' ? window.innerWidth - 500 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight - 500 : 0,
  });
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    setDragging(true);
    setOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const onDrag = (e: MouseEvent) => {
    if (dragging) {
      setPosition({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const stopDrag = () => setDragging(false);

  useEffect(() => {
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    return () => {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
  }, [dragging]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

 // ...без змін вище...

return (
  <motion.div
    ref={chatRef}
    className={`fixed bg-white shadow-lg flex flex-col border border-blue-800 z-50 overflow-hidden
      ${isDesktop ? 'rounded-3xl' : 'rounded-none'}`}
    style={
      isDesktop
        ? {
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '380px',
            height: '450px',
          }
        : {
            left: 0,
            top: 0,
            width: '100vw',
            height: '100vh',
          }
    }
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 30 }}
  >
    {/* Заголовок */}
    <div
      className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 text-white flex justify-between items-center px-5 py-3 shadow-xl cursor-move select-none backdrop-blur-md border-b border-blue-200"
      onMouseDown={startDrag}
      role="banner"
      aria-label="Чат підтримки заголовок"
      style={{ cursor: isDesktop ? 'grab' : 'default' }}
    >
      <div className="flex items-center gap-3">
        <Move size={22} />
        <h2 className="text-lg font-semibold tracking-wide">Чат підтримки</h2>
      </div>
      <button
        onClick={onClose}
        className="hover:text-blue-300 transition-colors"
        aria-label="Закрити чат"
        title="Закрити чат"
      >
        <X size={26} />
      </button>
    </div>

    {/* Повідомлення */}
    <div
      className="flex-1 overflow-y-auto bg-blue-50 space-y-3 scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-blue-100"
      style={{
        padding: '16px',
        paddingBottom: isDesktop ? '16px' : '80px', // padding під форму на мобільних
      }}
    >
      <div className="flex items-center gap-2 max-w-[75%] px-4 py-2 bg-blue-200 text-blue-900 text-sm font-medium rounded-xl shadow-md self-start select-text">
        <Headphones size={20} />
        <span>Вітаємо в нашому чаті! Як ми можемо допомогти?</span>
      </div>

      {messages.map((msg) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className={`max-w-[75%] px-4 py-2 text-sm font-normal shadow-sm rounded-xl select-text
              ${msg.sender === 'user'
                ? 'bg-white text-gray-900 self-end ml-auto rounded-br-none border border-gray-300'
                : 'bg-blue-300 text-blue-900 self-start flex items-center gap-2 rounded-bl-none border border-blue-400'
            }`}
          >
            {msg.sender === 'manager' && <Headphones size={18} />}
            {msg.text}
          </div>
        </motion.div>
      ))}
      <div ref={messagesEndRef} />
    </div>

    {/* Ввід повідомлення */}
    <div
      className="bg-white flex items-center gap-3 border-t border-blue-300 shadow-inner px-3"
      style={{
        position: isDesktop ? 'static' : 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: '12px',
        paddingBottom: '12px',
        zIndex: 20,
      }}
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        className="flex-1 bg-blue-100 text-blue-900 px-4 py-2 rounded-full outline-none placeholder-blue-700 transition focus:ring-2 focus:ring-blue-400"
        placeholder="Напишіть повідомлення..."
        aria-label="Введіть повідомлення"
      />
      <button
        onClick={sendMessage}
        className="bg-blue-700 hover:bg-blue-800 transition-colors rounded-full p-2 flex items-center justify-center shadow-md"
        aria-label="Відправити повідомлення"
        title="Відправити"
      >
        <Send size={22} className="text-white" />
      </button>
    </div>
  </motion.div>
);

}
