"use client";

import { useEffect, useRef, useState } from "react";
import { X, Phone, Check } from "lucide-react";
import Zvyaz from "app/components/zvyaz"; // Import the new form component

interface ContactsProps {
  onClose: () => void;
}

const Contacts: React.FC<ContactsProps> = ({ onClose }) => {
  const contactsRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isZvyazVisible, setIsZvyazVisible] = useState(false); // State to switch forms

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contactsRef.current && !contactsRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleCopy = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopied(phone);
    setTimeout(() => setCopied(null), 2000);
  };

  // If `isZvyazVisible` is true, render the `Zvyaz` component
  if (isZvyazVisible) {
    return <Zvyaz onClose={onClose} />; // Render the new form
  }

  return (
    <div
      ref={contactsRef}
      className="absolute top-28 right-5 w-80 bg-gradient-to-br from-gray-700 to-gray-900 
                    border border-gray-500 rounded-lg shadow-lg p-4 flex flex-col gap-4 z-50"
    >
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-600 pb-2">
        <h3 className="text-white text-lg font-bold">Контакти</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition">
          <X size={24} />
        </button>
      </div>

      {/* Contacts */}
      <div className="flex flex-col space-y-3">
        {[
          { name: "Богдан", phone: "+38 (063) 421-18-51" },
          { name: "Роман", phone: "+38 (067) 739-00-73" },
          { name: "Юрій", phone: "+38 (067) 739-00-00" },
        ].map((contact, index) => (
          <div
            key={index}
            className="flex items-center justify-between bg-gray-800 px-4 py-3 rounded-md shadow-md transition-all duration-200 ease-in-out hover:bg-gray-700 cursor-pointer"
            onClick={() => handleCopy(contact.phone)}
          >
            <div className="flex items-center gap-3">
              <Phone className="text-cyan-400" size={20} />
              <span className="text-indigo-400 text-base font-semibold">{contact.name}</span>
            </div>
            <span className="text-gray-200 text-sm font-medium">{contact.phone}</span>
          </div>
        ))}
      </div>

      {/* Copy Confirmation */}
      {copied && (
        <div className="mt-2 p-2 bg-green-500 text-white text-center rounded-md flex items-center justify-center gap-2 text-sm">
          <Check size={16} /> Номер скопійовано!
        </div>
      )}

      {/* Callback Button */}
      <button
        className="mt-2 p-3 rounded-md text-white bg-gradient-to-r from-indigo-600 via-blue-500 to-red-500 shadow-md transition-transform hover:scale-105 text-sm font-medium"
        onClick={() => setIsZvyazVisible(true)} // Toggle to show `Zvyaz` form
      >
        Замовити зворотний зв'язок
      </button>
    </div>
  );
};

export default Contacts;
