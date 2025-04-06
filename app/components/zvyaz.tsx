"use client";

import { useRef } from "react";
import { X } from "lucide-react";

interface ZvyazProps {
  onClose: () => void;
}

const Zvyaz: React.FC<ZvyazProps> = ({ onClose }) => {
  const formRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={formRef}
      className="absolute top-28 right-5 w-80 bg-gradient-to-br from-gray-700 to-gray-900 
                    border border-gray-500 rounded-lg shadow-lg p-4 flex flex-col gap-4 z-50"
    >
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-600 pb-2">
        <h3 className="text-white text-lg font-bold">Зворотний зв'язок</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition">
          <X size={24} />
        </button>
      </div>

      {/* Form */}
      <form className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Ваше ім'я"
          className="p-2 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="tel"
          placeholder="Ваш телефон"
          className="p-2 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          placeholder="Ваше повідомлення"
          className="p-2 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="mt-2 p-3 rounded-md text-white bg-gradient-to-r from-indigo-600 via-blue-500 to-red-500 shadow-md transition-transform hover:scale-105 text-sm font-medium"
        >
          Надіслати
        </button>
      </form>
    </div>
  );
};

export default Zvyaz;
