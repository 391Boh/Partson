'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronRight, Percent, PhoneCall } from 'lucide-react';
import { User } from 'firebase/auth';

interface Props {
  name: string;
  phone: string;
  email: string;
  setName: (value: string) => void;
  setPhone: (value: string) => void;
  setEmail: (value: string) => void;
  user: User | null;
  discountAmount?: number;
  isFirstOrderDiscountApplied?: boolean;
  onNext: () => void;
  /** Guest checkout by phone only; the manager agrees delivery and payment. */
  onQuickOrder?: () => Promise<void>;
  onBack: () => void;
}

const PHONE_PATTERN = /^\+380\d{9}$/;
// "063 421 18 51", "0634211851", "380634211851" → "+380634211851".
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `+38${digits}`;
  if (/^380\d{9}$/.test(digits)) return `+${digits}`;
  return value.trim();
};

const CustomerDetails: React.FC<Props> = ({
  name,
  phone,
  email,
  setName,
  setPhone,
  setEmail,
  user,
  discountAmount = 0,
  isFirstOrderDiscountApplied = false,
  onNext,
  onQuickOrder,
  onBack,
}) => {
  // Phone and email errors wait until the field is left: the phone field is
  // prefilled with "+380", and an email is invalid after its first keystroke,
  // so validating on every change showed red errors before any real input.
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [guestMode, setGuestMode] = useState<'quick' | 'full'>(!user && onQuickOrder ? 'quick' : 'full');
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const isNameValid = name.trim().length >= 2;
  const isPhoneValid = PHONE_PATTERN.test(phone.trim());
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canContinue = isNameValid && isPhoneValid && isEmailValid;
  const formattedDiscountAmount = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(discountAmount);

  const handleNext = () => {
    if (!canContinue) {
      alert('Введіть ім\'я, телефон у форматі +380XXXXXXXXX і коректний email.');
      return;
    }
    onNext();
  };

  if (guestMode === 'quick' && onQuickOrder) {
    const submitQuick = async () => {
      const normalized = normalizePhone(phone);
      if (normalized !== phone) setPhone(normalized);
      setPhoneTouched(true);
      if (!PHONE_PATTERN.test(normalized) || quickSubmitting) return;
      setQuickSubmitting(true);
      try {
        await onQuickOrder();
      } finally {
        setQuickSubmitting(false);
      }
    };
    const quickPhoneValid = PHONE_PATTERN.test(normalizePhone(phone));
    return (
      <div className="space-y-4 text-sky-50">
        <div className="rounded-[18px] border border-white/15 bg-white/[0.06] p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-white/10 text-sky-100" aria-hidden="true">
              <PhoneCall size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-white">Швидке замовлення за номером</p>
              <p className="mt-0.5 text-[13px] leading-5 text-sky-100/85">
                Залиште телефон — менеджер передзвонить, перевірить сумісність і узгодить доставку та оплату.
              </p>
            </div>
          </div>
          <form
            className="mt-4 flex flex-col gap-2.5 sm:flex-row"
            onSubmit={(event) => { event.preventDefault(); void submitQuick(); }}
          >
            <label htmlFor="quick-phone" className="sr-only">Телефон</label>
            <input
              id="quick-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => { setPhone(normalizePhone(phone)); setPhoneTouched(true); }}
              placeholder="+380XXXXXXXXX"
              autoComplete="tel"
              inputMode="tel"
              autoFocus
              aria-invalid={phoneTouched && !quickPhoneValid ? true : undefined}
              className="soft-field min-h-11 flex-1 px-4 py-2.5 text-base"
            />
            <button
              type="submit"
              disabled={!quickPhoneValid || quickSubmitting}
              className={`soft-primary-button min-h-11 px-5 py-2.5 text-sm font-bold ${!quickPhoneValid || quickSubmitting ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {quickSubmitting ? 'Надсилаємо…' : 'Замовити'}
            </button>
          </form>
          {phoneTouched && !quickPhoneValid && phone.replace(/\s/g, '') !== '+380' && (
            <p className="mt-1.5 text-xs font-semibold text-rose-200">Введіть номер у форматі +380XXXXXXXXX або 0XXXXXXXXX.</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="soft-secondary-button w-full px-4 py-2.5 text-sm font-medium sm:w-auto"
          >
            <ArrowLeft className="mr-2 inline" size={16} />
            Назад
          </button>
          <button
            type="button"
            onClick={() => setGuestMode('full')}
            className="text-sm font-semibold text-sky-100 underline decoration-sky-200/50 underline-offset-4 hover:text-white"
          >
            Вказати доставку й оплату самостійно
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sky-50">
      <p className="soft-note rounded-[16px] px-3.5 py-2.5 text-sm">
        {user
          ? 'Дані профілю вже підставлені. Перевірте та за потреби оновіть.'
          : 'Вкажіть контактні дані, щоб продовжити оформлення замовлення.'}
      </p>

      {isFirstOrderDiscountApplied && (
        <div className="rounded-[18px] border border-slate-200 bg-white/90 px-3.5 py-3 text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-slate-200 bg-slate-50 text-emerald-600 shadow-[0_8px_16px_rgba(15,23,42,0.05)]">
              <Percent size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Знижка 5% вже активна</p>
              <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">
                Економія: <span className="font-bold text-emerald-700">{formattedDiscountAmount}</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="customer-name" className="mb-1 block text-sm font-semibold text-sky-50">
            {"Ім'я"}
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
            <p className="mt-1 text-xs font-semibold text-rose-200">Введіть щонайменше 2 символи.</p>
          )}
        </div>

        <div>
          <label htmlFor="customer-phone" className="mb-1 block text-sm font-semibold text-sky-50">
            Телефон
          </label>
          <input
            id="customer-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhoneTouched(true)}
            placeholder="+380XXXXXXXXX"
            autoComplete="tel"
            aria-invalid={phoneTouched && !isPhoneValid ? true : undefined}
            className="soft-field px-4 py-2.5"
          />
          {!isPhoneValid && phoneTouched && phone.replace(/\s/g, '') !== '+380' && (
            <p className="mt-1 text-xs font-semibold text-rose-200">Використайте формат +380XXXXXXXXX.</p>
          )}
        </div>
        <div>
          <label htmlFor="customer-email" className="mb-1 block text-sm font-semibold text-sky-50">
            Email
          </label>
          <input
            id="customer-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder="name@example.com"
            autoComplete="email"
            inputMode="email"
            aria-invalid={emailTouched && !isEmailValid && email.length > 0 ? true : undefined}
            className="soft-field px-4 py-2.5"
          />
          {!isEmailValid && emailTouched && email.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-rose-200">Введіть коректну email-адресу.</p>
          )}
          <p className="mt-1 text-[11px] font-medium leading-4 text-sky-100/80">
            Потрібен для замовлення. Після оформлення Google запропонує окремо погодитися або відмовитися від опитування про покупку.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="soft-secondary-button w-full px-4 py-2.5 text-sm font-medium sm:w-auto"
        >
          <ArrowLeft className="mr-2 inline" size={16} />
          Назад
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canContinue}
          className={`w-full px-4 py-2.5 text-sm font-medium sm:w-auto ${
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
