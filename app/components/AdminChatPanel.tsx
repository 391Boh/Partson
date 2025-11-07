'use client';

import { useEffect, useRef, useState } from 'react';
import {

  ChevronLeftIcon,
} from '@heroicons/react/24/outline';

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from 'firebase';

      import { CheckIcon, ChevronDown, ChevronUp } from 'lucide-react';
import {
  TrashIcon,
  PaperAirplaneIcon,
  ChatBubbleBottomCenterTextIcon,
  ShoppingBagIcon,
  PhoneIcon,
  
} from '@heroicons/react/24/outline';

interface AdminChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationCountChange?: (count: number) => void;
}

interface Message {
  userId: string;
  text: string;
  createdAt: any;
  sender: string;
  textRead?: boolean;
  id: string;
}

interface Order {
  id: string;
  name: string;
  phone: string;
  deliveryMethod: string;
  paymentMethod: string;
  cartItems: any[];
  totalAmount: number;
  createdAt: any;
  read?: boolean;
  lvivStreet?: string;
  warehouse?: string;
    completed?: boolean; // ← Додано нове поле
}


interface CallRequest {
  id: string;
  name: string;
  phone: string;
  message: string;
  createdAt: any;
  read?: boolean;
}

export default function AdminChatPanel({
  isOpen,
  onClose,
  onNotificationCountChange,
}: AdminChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [callRequests, setCallRequests] = useState<CallRequest[]>([]);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [selectedUserMessages, setSelectedUserMessages] = useState<Message[]>([]);
  const [isViewingUser, setIsViewingUser] = useState(false);
  const [tab, setTab] = useState<'messages' | 'orders' | 'calls'>('messages');

  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadCallsCount, setUnreadCallsCount] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markOrderAsCompleted = async (id: string) => {
  const ref = doc(db, 'orders', id);
  await updateDoc(ref, { completed: true });
};

  // Загальна кількість непрочитаних/нових елементів
  const totalNotifications = unreadCount + unreadCallsCount + newOrdersCount;

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages: Message[] = snapshot.docs.map((doc) => ({
        ...(doc.data() as Message),
        id: doc.id,
      }));
      setMessages(newMessages);

      const unread = newMessages.filter(
        (msg) => msg.sender === 'user' && !msg.textRead
      ).length;
      setUnreadCount(unread);

      if (selectedUserId) {
        setSelectedUserMessages(newMessages.filter((msg) => msg.userId === selectedUserId));
        scrollToBottom();
      }
    });
    return () => unsubscribe();
  }, [selectedUserId]);

  useEffect(() => {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const allOrders = snapshot.docs.map((doc) => ({
      ...(doc.data() as Order),
      id: doc.id,
    }));
    setOrders(allOrders);

    const now = new Date();
    const recent = allOrders.filter((o) => {
      const createdAt = new Date(o.createdAt?.seconds * 1000);
      return (now.getTime() - createdAt.getTime()) / 1000 / 60 < 10;
    });
    setNewOrdersCount(recent.filter((o) => !o.read).length);
  });
  return () => unsubscribe();
}, []);  // підписка постійна, не залежить від isOpen

useEffect(() => {
  const q = query(collection(db, 'zvyaz'), orderBy('createdAt', 'desc'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const calls: CallRequest[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as CallRequest),
      id: doc.id,
    }));
    setCallRequests(calls);
    const unread = calls.filter((call) => !call.read).length;
    setUnreadCallsCount(unread);
  });
  return () => unsubscribe();
}, []);  // підписка постійна, не залежить від isOpen


  // Виносимо виклик колбека в окремий useEffect,
  // який буде викликатися при зміні загальної кількості сповіщень
  useEffect(() => {
    if (typeof onNotificationCountChange === 'function') {
      const totalCount = unreadCount + unreadCallsCount + newOrdersCount;
      onNotificationCountChange(totalCount);
    }
  }, [unreadCount, unreadCallsCount, newOrdersCount, onNotificationCountChange]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleReply = async () => {
    if (!selectedUserId || !replyText.trim()) return;
    await addDoc(collection(db, 'messages'), {
      userId: selectedUserId,
      text: replyText.trim(),
      sender: 'manager',
      createdAt: new Date(),
    });
    setReplyText('');
    scrollToBottom();
  };

  const handleReadMessage = async (userId: string) => {
    const userMessages = messages.filter(
      (msg) => msg.userId === userId && !msg.textRead
    );
    for (const msg of userMessages) {
      const ref = doc(db, 'messages', msg.id);
      const snap = await getDoc(ref);
      if (snap.exists()) await updateDoc(ref, { textRead: true });
    }
  };

  const handleDeleteMessage = async (id: string) => {
    await deleteDoc(doc(db, 'messages', id));
  };

  const handleDeleteDialog = async (userId: string) => {
    const userMsgs = messages.filter((msg) => msg.userId === userId);
    for (const msg of userMsgs) {
      await deleteDoc(doc(db, 'messages', msg.id));
    }
    setSelectedUserId(null);
    setIsViewingUser(false);
  };

  const groupedMessages = messages.reduce((acc: { [key: string]: Message[] }, msg) => {
    acc[msg.userId] = acc[msg.userId] || [];
    acc[msg.userId].push(msg);
    return acc;
  }, {});

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedUserMessages(groupedMessages[userId] || []);
    setIsViewingUser(true);
    handleReadMessage(userId);
    scrollToBottom();
  };

  const handleBack = () => {
    setSelectedUserId(null);
    setSelectedUserMessages([]);
    setIsViewingUser(false);
  };

  const markCallAsRead = async (id: string) => {
    const ref = doc(db, 'zvyaz', id);
    await updateDoc(ref, { read: true });
  };

  const toggleOrderDetails = (id: string) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  const markOrderAsRead = async (id: string) => {
    const ref = doc(db, 'orders', id);
    await updateDoc(ref, { read: true });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col font-sans md:rounded-2xl md:relative md:w-[520px] md:max-h-[90vh] md:m-4 md:shadow-xl md:border md:border-gray-200">
      {/* Шапка */}
      <div className="bg-blue-100 border-b-2 border-blue-500 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h2 className="text-lg font-semibold flex items-center">
          Панель адміністратора
          {totalNotifications > 0 && (
            <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
              {totalNotifications}
            </span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="hover:bg-red-400 hover:text-white transition rounded-full p-1"
          aria-label="Close"
        >
          ✖
        </button>
      </div>
<nav className="flex justify-around px-2 py-2 border-b border-gray-200 sticky top-14 z-10 bg-white">
  <button
    className={`relative flex flex-col items-center p-2 rounded-lg w-full mx-1 ${
      tab === 'messages' ? 'bg-blue-100 text-blue-800' : 'text-gray-600'
    }`}
    onClick={() => setTab('messages')}
  >
    <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
    <span className="text-xs mt-1">Повідомлення</span>
    {unreadCount > 0 && (
      <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
        {unreadCount}
      </span>
    )}
  </button>
  <button
    className={`relative flex flex-col items-center p-2 rounded-lg w-full mx-1 ${
      tab === 'orders' ? 'bg-blue-100 text-blue-800' : 'text-gray-600'
    }`}
    onClick={() => setTab('orders')}
  >
    <ShoppingBagIcon className="w-5 h-5" />
    <span className="text-xs mt-1">Замовлення</span>
    {newOrdersCount > 0 && (
      <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
        {newOrdersCount}
      </span>
    )}
  </button>
  <button
    className={`relative flex flex-col items-center p-2 rounded-lg w-full mx-1 ${
      tab === 'calls' ? 'bg-blue-100 text-blue-800' : 'text-gray-600'
    }`}
    onClick={() => setTab('calls')}
  >
    <PhoneIcon className="w-5 h-5" />
    <span className="text-xs mt-1">Дзвінки</span>
    {unreadCallsCount > 0 && (
      <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
        {unreadCallsCount}
      </span>
    )}
  </button>
</nav>


      {/* Основний вміст */}
      <main className="flex-1 overflow-y-auto p-3 bg-gray-50 ">
        
        {tab === 'messages' && (
          
          <>
            {!isViewingUser && (
  <div className="flex-1 overflow-y-auto p-4 space-y-3 h-screen md:h-[400px]">
                {Object.entries(groupedMessages).map(([userId, userMessages]) => {
                  const lastMsg = userMessages[userMessages.length - 1];
                  const unreadForUser = userMessages.filter(
                    (msg) => msg.sender === 'user' && !msg.textRead
                  ).length;

                  return (
                    <div
                      key={userId}
                      onClick={() => handleSelectUser(userId)}
                      className="cursor-pointer bg-white rounded-lg p-3 shadow-sm border border-gray-100"
                    >
                      <div className="flex justify-between items-start">
                        <div className="truncate">
                          <p className="font-medium text-gray-800 truncate">ID: {userId}</p>
                          <p className="text-sm text-gray-600 truncate">{lastMsg.text}</p>
                        </div>
                        {unreadForUser > 0 && (
                          <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full min-w-5 flex justify-center">
                            {unreadForUser}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {lastMsg.createdAt?.toDate
                          ? lastMsg.createdAt.toDate().toLocaleTimeString()
                          : new Date(lastMsg.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isViewingUser && selectedUserId && (
              <div className="flex flex-col h-full">
                {/* Заголовок чату */}
                <div className="sticky top-0 bg-white p-3 border-b flex justify-between items-center z-10">
                  <button
                    onClick={handleBack}
                    className="text-blue-600 p-1 rounded-full hover:bg-blue-50"
                  >
                    <ChevronLeftIcon className="w-6 h-6" />
                  </button>
                  <span className="font-medium truncate px-2">ID: {selectedUserId}</span>
                  <button
                    onClick={() => handleDeleteDialog(selectedUserId)}
                    className="text-red-600 p-1 rounded-full hover:bg-red-50"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>

              {/* Повідомлення */}
<div className="flex flex-col h-screen md:h-[400px]">
  {/* Повідомлення */}
  <div className="flex-1 overflow-y-auto p-4 space-y-3">
    {selectedUserMessages.map((msg) => (
      <div
        key={msg.id}
        className={`flex ${
          msg.sender === 'user' ? 'justify-start' : 'justify-end'
        }`}
      >
        <div
          className={`max-w-[75%] px-4 py-2 rounded-2xl shadow-md text-sm transition-all ${
            msg.sender === 'user'
              ? 'bg-white text-gray-700'
              : 'bg-blue-600 text-white'
          }`}
        >
          <p>{msg.text}</p>
          <div className="text-[11px] text-right mt-1 opacity-70">
            {msg.createdAt?.toDate
              ? msg.createdAt.toDate().toLocaleTimeString()
              : new Date(msg.createdAt).toLocaleTimeString()}
          </div>
        </div>
      </div>
    ))}
    <div ref={messagesEndRef} />
  </div>

  {/* Форма відправки */}
  <div className="sticky bottom-0 bg-white px-4 py-3 border-t flex gap-2 items-center">
    <input
      type="text"
      className="flex-1 rounded-full border border-gray-400 px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
      placeholder="Написати повідомлення..."
      value={replyText}
      onChange={(e) => setReplyText(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleReply()}
    />
    <button
      onClick={handleReply}
      className="bg-blue-500 hover:bg-blue-700 text-white p-2 rounded-full transition"
    >
      <PaperAirplaneIcon className="w-5 h-5 rotate-90" />
    </button>
  </div>
</div>


              </div>
            )}
          </>
        )}

      {tab === 'orders' && (
  <div className="flex-1 overflow-y-auto p-4 space-y-3 h-screen md:h-[400px]">
            {orders.map((order) => (
              <div
                key={order.id}
                className={`bg-white rounded-lg border ${
                  order.completed ? 'border-gray-300' : ''
                } shadow-sm overflow-hidden`}
              >
                <div 
                  className="p-3 flex justify-between items-center cursor-pointer"
                  onClick={() => {
                    toggleOrderDetails(order.id);
                    if (!order.read) markOrderAsRead(order.id);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-800 truncate">
                      {order.name}
                      {order.completed && (
                        <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                          Виконано
                        </span>
                      )}
                    </h4>
                    <p className="text-sm text-gray-600">{order.phone}</p>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm font-semibold mr-2">{order.totalAmount} грн</span>
                    {expandedOrderId === order.id ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </div>
                </div>

                {expandedOrderId === order.id && (
                  <div className="p-3 pt-0 border-t text-sm">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <p className="text-gray-500">Доставка</p>
                        <p>{order.deliveryMethod || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Оплата</p>
                        <p>{order.paymentMethod || '—'}</p>
                      </div>
                    </div>

                    {order.deliveryMethod === 'Доставка у Львові' && order.lvivStreet && (
                      <p className="mb-2">
                        <span className="text-gray-500">Адреса:</span> {order.lvivStreet}
                      </p>
                    )}

                    {order.deliveryMethod === 'Нова Пошта' && order.warehouse && (
                      <p className="mb-2">
                        <span className="text-gray-500">Відділення:</span> {order.warehouse}
                      </p>
                    )}

                    <div className="mb-3">
                      <p className="text-gray-500 mb-1">Товари:</p>
                      <ul className="space-y-1">
                        {order.cartItems?.map((item, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span>{item.article || item.code || 'Товар'}</span>
                            <span>{item.quantity} × {item.price} грн</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex justify-between items-center border-t pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markOrderAsCompleted(order.id);
                        }}
                        disabled={order.completed}
                        className={`text-sm px-3 py-1 rounded ${
                          order.completed
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        }`}
                      >
                        {order.completed ? 'Виконано' : 'Завершити'}
                      </button>
                      <span className="text-xs text-gray-400">
                        {order.createdAt?.toDate
                          ? order.createdAt.toDate().toLocaleString()
                          : new Date(order.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      {tab === 'calls' && (
  <div className="flex-1 overflow-y-auto p-4 space-y-3 h-screen md:h-[400px]">

            {callRequests.map((call) => (
              <div
                key={call.id}
           className={`rounded-lg p-3 shadow-sm border transition ${
  call.read
    ? 'bg-gray-50 border-gray-200'
    : 'bg-yellow-50 border-yellow-300'
}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <h4 className="font-medium">{call.name}</h4>
                    <a 
                      href={`tel:${call.phone}`} 
                      className="text-blue-600 text-sm hover:underline"
                    >
                      {call.phone}
                    </a>
                  </div>
                  {!call.read && (
                    <button
                      onClick={() => markCallAsRead(call.id)}
                      className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full"
                    >
                      Позначити як прочитане
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-700 my-2">{call.message}</p>
                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span>
                    {call.createdAt?.toDate
                      ? call.createdAt.toDate().toLocaleString()
                      : new Date(call.createdAt).toLocaleString()}
                  </span>
                  <a 
                    href={`tel:${call.phone}`}
                    className="bg-blue-600 text-white p-1 rounded-full"
                  >
                    <PhoneIcon className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

{(
  (tab === 'messages' && Object.keys(groupedMessages).length === 0) ||
  (tab === 'orders' && orders.length === 0) ||
  (tab === 'calls' && callRequests.length === 0)
) && (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 p-4 pointer-events-none">
    <p className="text-lg">Нічого не знайдено</p>
    <p className="text-sm mt-1">Тут будуть нові повідомлення</p>
  </div>
)}


    </div>
  );
}
