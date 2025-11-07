'use client';

import { User } from "firebase/auth";
import { Check, Edit, ArrowLeft, X } from "lucide-react";
import { useState, useRef } from "react";

interface Props {
  name: string;
  phone: string;
  setName: (val: string) => void;
  setPhone: (val: string) => void;
  user: User | null;
  onNext: () => void;
  onBack: () => void;
}

const CustomerDetails: React.FC<Props> = ({
  name,
  phone,
  setName,
  setPhone,
  user,
  onNext,
  onBack,
}) => {
  const [isEditing, setIsEditing] = useState(!user);
  const phoneRef = useRef<HTMLInputElement>(null);

  const validatePhone = (val: string) => /^\+380\d{9}$/.test(val.trim());

  const handlePhoneChange = (val: string) => {
    if (!val.startsWith('+380')) return;
    const digitsOnly = val.replace(/[^\d]/g, '');
    if (digitsOnly.length > 12) return;
    setPhone('+380' + digitsOnly.slice(3));
  };

  const handleSubmit = () => {
    if (!name.trim() || !validatePhone(phone)) {
      alert("Перевірте ім’я та телефон.");
      phoneRef.current?.focus();
      return;
    }
    setIsEditing(false);
    onNext();
  };

  return (
    <div className="mt-6 text-slate-200 space-y-5">
      {!isEditing ? (
        <>
          <p>Перевірте ваші дані:</p>
          <div className="bg-slate-800 p-4 rounded-lg space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Ім’я:</span>
              <span className="text-white font-medium">{name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Телефон:</span>
              <span className="text-white font-medium">{phone}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-6">
            <button onClick={handleSubmit} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition">
              <Check size={18} /> Далі
            </button>
            <button onClick={() => setIsEditing(true)} className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition">
              <Edit size={18} /> Змінити
            </button>
            <button onClick={onBack} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition">
              <ArrowLeft size={18} /> Назад
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Заповніть ваші дані:</p>
          <div className="flex flex-col gap-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше ім’я" className="w-full px-4 py-2 rounded-lg bg-slate-600 text-white border border-slate-500" />
            <input type="tel" ref={phoneRef} value={phone} onChange={(e) => handlePhoneChange(e.target.value)} placeholder="+380XXXXXXXXX" className="w-full px-4 py-2 rounded-lg bg-slate-600 text-white border border-slate-500" />
          </div>

          <div className="flex gap-3 mt-6 flex-wrap">
            <button onClick={handleSubmit} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition">
              <Check size={18} /> Зберегти
            </button>
            <button onClick={() => setIsEditing(false)} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition">
              <X size={18} /> Скасувати
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CustomerDetails;
