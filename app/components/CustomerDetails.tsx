'use client';

import { ArrowLeft, ChevronRight } from 'lucide-react';
import { User } from 'firebase/auth';

interface Props {
  name: string;
  phone: string;
  setName: (value: string) => void;
  setPhone: (value: string) => void;
  user: User | null;
  onNext: () => void;
  onBack: () => void;
}

const PHONE_PATTERN = /^\+380\d{9}$/;

const CustomerDetails: React.FC<Props> = ({
  name,
  phone,
  setName,
  setPhone,
  user,
  onNext,
  onBack,
}) => {
  const isNameValid = name.trim().length >= 2;
  const isPhoneValid = PHONE_PATTERN.test(phone.trim());
  const canContinue = isNameValid && isPhoneValid;

  const handleNext = () => {
    if (!canContinue) {
      alert('Введіть, будь ласка, ім\'я та телефон у форматі +380XXXXXXXXX.');
      return;
    }
    onNext();
  };

  return (
    <div className="mt-5 space-y-4 text-slate-700">
      <p className="soft-note rounded-[16px] px-3.5 py-2.5 text-sm">
        {user
          ? 'Дані профілю вже підставлені. Перевірте та за потреби оновіть.'
          : 'Вкажіть контактні дані, щоб продовжити оформлення замовлення.'}
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="customer-name" className="mb-1 block text-sm">
            Ім'я
          </label>
          <input
            id="customer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше ім'я"
            autoComplete="name"
            className="soft-field px-4 py-2.5"
          />
          {!isNameValid && name.length > 0 && (
            <p className="mt-1 text-xs text-rose-600">Введіть щонайменше 2 символи.</p>
          )}
        </div>

        <div>
          <label htmlFor="customer-phone" className="mb-1 block text-sm">
            Телефон
          </label>
          <input
            id="customer-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+380XXXXXXXXX"
            autoComplete="tel"
            className="soft-field px-4 py-2.5"
          />
          {!isPhoneValid && phone.length > 0 && (
            <p className="mt-1 text-xs text-rose-600">Використайте формат +380XXXXXXXXX.</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="soft-secondary-button px-4 py-2.5 text-sm font-medium"
        >
          <ArrowLeft className="mr-2 inline" size={16} />
          Назад
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canContinue}
          className={`px-4 py-2.5 text-sm font-medium ${
            canContinue
              ? 'soft-primary-button'
              : 'soft-primary-button cursor-not-allowed opacity-60'
          }`}
        >
          Далі
          <ChevronRight className="ml-2 inline" size={16} />
        </button>
      </div>
    </div>
  );
};

export default CustomerDetails;
