"use client";

import { useEffect, useRef, useState } from "react";
import { X, Phone, Check } from "lucide-react";
import Zvyaz from "app/components/zvyaz";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "firebase"; // Твій екземпляр Firestore

interface ContactsProps {
  onClose: () => void;
}

const formatPhoneNumber = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+380${digits}`;
  if (digits.startsWith("380") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+38${digits}`;
  return raw;
};

const Contacts: React.FC<ContactsProps> = ({ onClose }) => {
  const contactsRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showZvyaz, setShowZvyaz] = useState(false);
  const [userData, setUserData] = useState<{ name: string; phone: string } | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contactsRef.current && !contactsRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        let name = user.displayName || "";
        let phone = user.phoneNumber || "";

        if (!name || !phone) {
          try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (!name && data.name) name = data.name;
              if (!phone && data.phone) phone = data.phone;
            }
          } catch (err) {
            console.error("Error fetching Firestore user data:", err);
          }
        }

        setUserData({
          name: name || "Користувач",
          phone: formatPhoneNumber(phone || ""),
        });
      } else {
        setUserData(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleCopy = async (phone: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(phone);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = phone;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(phone);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Failed to copy: ", error);
    }
  };

  if (showZvyaz) {
    return <Zvyaz onClose={onClose} userData={userData} />;
  }

  return (
    <div
      ref={contactsRef}
      className="absolute top-28 right-5 w-[90%] sm:w-[450px] max-w-[520px] bg-gradient-to-br from-gray-600 to-gray-800 
                 border-[3px] border-gray-500 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 z-50 transition-all duration-300 ease-in-out"
    >
      <div className="flex justify-between items-center border-b border-gray-600 pb-3">
        <h3 className="text-white text-lg sm:text-xl font-bold">Контакти</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition">
          <X size={26} />
        </button>
      </div>

      <div className="flex flex-col space-y-4 overflow-auto">
        {[
          { name: "Богдан", phone: "+38 (063) 421-18-51" },
          { name: "Роман", phone: "+38 (067) 739-00-73" },
          { name: "Юрій", phone: "+38 (067) 739-00-00" },
        ].map((contact, index) => (
          <div
            key={index}
            className="flex items-center justify-between bg-gray-800 px-5 py-4 rounded-lg shadow-md 
                       hover:bg-gray-700 cursor-pointer transition duration-200"
            onClick={() => handleCopy(contact.phone)}
          >
            <div className="flex items-center gap-4">
              <Phone className="text-cyan-400" size={22} />
              <span className="text-indigo-300 text-base sm:text-lg font-semibold">{contact.name}</span>
            </div>
            <span className="text-gray-200 text-sm sm:text-base font-medium">{contact.phone}</span>
          </div>
        ))}
      </div>

      {copied && (
        <div className="mt-2 p-3 bg-green-400 text-white text-center rounded-md flex items-center justify-center gap-2 text-sm">
          <Check size={18} /> Номер скопійовано!
        </div>
      )}

      <button
        className="mt-4 py-3 px-5 bg-gradient-to-r from-gray-600 via-blue-500 to-gray-800
                   text-white rounded-xl text-sm sm:text-base font-semibold shadow-lg hover:scale-105 
                   hover:brightness-110 transition-all duration-200"
        onClick={() => setShowZvyaz(true)}
      >
        📞 Подзвоніть мені
      </button>
    </div>
  );
};

export default Contacts;
