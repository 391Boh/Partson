"use client";

import React, { useState, useEffect, useRef } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "firebase"; // Використовуємо правильний імпорт з файлу конфігурації
import { Eye, EyeOff , X } from "lucide-react";


interface LoginProps {
  onClose: () => void; // Пропс для закриття вікна
  onShowRegister: () => void; // Пропс для показу форми реєстрації
}

const Login: React.FC<LoginProps> = ({ onClose, onShowRegister }) => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false); // Стан для відображення/приховування пароля
  const [isEmailValid, setIsEmailValid] = useState<boolean | null>(null); // Валідність email
  const [isPasswordValid, setIsPasswordValid] = useState<boolean | null>(null); // Валідність пароля
  const [isClosing, setIsClosing] = useState(false); // Стан для анімації закриття

  const modalRef = useRef<HTMLDivElement>(null); // Референс для модального вікна

  // Закриття модального вікна при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        closeModal(); // Закриваємо вікно, якщо клік був поза ним
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Закриття модального вікна при натисканні Escape
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal(); // Закриваємо вікно при натисканні Escape
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, []);

  // Функція для плавного закриття вікна
  const closeModal = () => {
    setIsClosing(true); // Запускаємо анімацію закриття
    setTimeout(() => {
      onClose(); // Закриваємо вікно після завершення анімації
    }, 300); // Час анімації (300ms)
  };

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validatePassword = (password: string) => {
    return password.length >= 6; // Пароль має бути не менше 6 символів
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setFormData({ ...formData, email });
    setIsEmailValid(validateEmail(email));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    setFormData({ ...formData, password });
    setIsPasswordValid(validatePassword(password));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // Авторизація через Firebase
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      closeModal(); // Закриваємо вікно після успішної авторизації
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Помилка:", err.message);
        setError("Помилка авторизації: неправильний email або пароль.");
      } else {
        console.error("Невідома помилка:", err);
        setError("Сталася невідома помилка.");
      }
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black/40 flex justify-center items-center backdrop-blur-sm transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
    >
   <div
  ref={modalRef}
  className={`bg-gradient-to-br from-gray-800 to-gray-600 p-8 rounded-3xl border border-gray-600 w-96 relative transform transition-all duration-300 shadow-xl ${
    isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
  }`}
>

      <button onClick={closeModal} className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl">
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold text-white text-center mb-6">Авторизація</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleEmailChange}
              className={`px-4 py-3 text-white border-2 rounded-lg bg-gray-700 w-full transition-all duration-300 ${
                isEmailValid === null
                  ? "border-gray-600"
                  : isEmailValid
                  ? "border-green-500"
                  : "border-red-500"
              } focus:outline-none focus:ring-2 ${
                isEmailValid === null
                  ? "focus:ring-blue-500"
                  : isEmailValid
                  ? "focus:ring-green-500"
                  : "focus:ring-red-500"
              }`}
              required
            />
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"} // Перемикаємо тип поля
              placeholder="Пароль"
              value={formData.password}
              onChange={handlePasswordChange}
              className={`px-4 py-3 text-white border-2 rounded-lg bg-gray-700 w-full transition-all duration-300 ${
                isPasswordValid === null
                  ? "border-gray-600"
                  : isPasswordValid
                  ? "border-green-500"
                  : "border-red-500"
              } focus:outline-none focus:ring-2 ${
                isPasswordValid === null
                  ? "focus:ring-blue-500"
                  : isPasswordValid
                  ? "focus:ring-green-500"
                  : "focus:ring-red-500"
              }`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)} // Логіка перемикання
              className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors duration-200"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <button
            type="submit"
            className="relative flex items-center justify-center gap-2 p-3 rounded-full text-white 
                bg-gradient-to-r from-blue-500 to-blue-600 shadow-inner shadow-blue-800/40
                transition-all duration-300 ease-in-out
                hover:shadow-xl hover:shadow-blue-900/50 
                hover:scale-105 hover:brightness-110 
                hover:ring-2 hover:ring-blue-300 hover:ring-opacity-50"
          >
            Увійти
          </button>
        </form>
        {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
        <button
          onClick={() => {
            closeModal(); // Закриваємо поточне вікно
            onShowRegister(); // Відкриваємо вікно реєстрації
          }}
          className="mt-4 text-blue-500 hover:text-blue-400 hover:underline text-center w-full transition-colors duration-200"
        >
          Реєстрація
        </button>
      </div>
    </div>
  );
};

export default Login;