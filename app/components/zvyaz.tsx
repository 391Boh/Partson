"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, addDoc, Timestamp } from "firebase/firestore";
import { app } from "firebase"; // твій firebase.ts файл

interface ZvyazProps {
  onClose: () => void;
  userData?: {
    name: string;
    phone: string;
  } | null;
}

const Zvyaz: React.FC<ZvyazProps> = ({ onClose, userData }) => {
  const [name, setName] = useState(userData?.name || "");
  const [phone, setPhone] = useState(userData?.phone || "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const db = getFirestore(app);
      const auth = getAuth();
      const user = auth.currentUser;

      await addDoc(collection(db, "zvyaz"), {
        name,
        phone,
        message,
        uid: user?.uid || null,
        email: user?.email || null,
        createdAt: Timestamp.now(),
      });

      alert("✅ Запит на дзвінок надіслано!");
      onClose();
    } catch (error) {
      console.error("❌ Помилка при надсиланні запиту:", error);
      alert("Сталася помилка. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute top-28 right-5 w-[90%] sm:w-[450px] max-w-[520px] bg-gradient-to-br from-gray-700 to-gray-900 
                border-[3px] border-gray-600 rounded-2xl shadow-2xl p-6 z-50">
      <div className="flex justify-between items-center border-b border-gray-600 pb-3 mb-4">
        <h3 className="text-white text-lg sm:text-xl font-bold">Зворотній дзвінок</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition">
          <X size={26} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Ваше ім'я"
          className="p-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="tel"
          placeholder="Ваш телефон"
          className="p-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <textarea
          placeholder="Повідомлення (необов'язково)"
          className="p-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[100px]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="py-3 px-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition duration-200 shadow-md disabled:opacity-50"
        >
          {loading ? "Надсилається..." : "Відправити запит"}
        </button>
      </form>
    </div>
  );
};

export default Zvyaz;
