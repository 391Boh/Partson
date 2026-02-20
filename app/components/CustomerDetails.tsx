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
      alert('Please enter your name and phone in format +380XXXXXXXXX.');
      return;
    }
    onNext();
  };

  return (
    <div className="mt-6 space-y-5 text-slate-700">
      <p className="text-sm text-slate-600">
        {user
          ? 'Your profile details were prefilled. Check and update if needed.'
          : 'Enter your contact details to continue with the order.'}
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="customer-name" className="mb-1 block text-sm">
            Name
          </label>
          <input
            id="customer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="w-full rounded-lg border border-sky-200 bg-white px-4 py-2 text-slate-700 outline-none transition focus:ring-2 focus:ring-sky-300"
          />
          {!isNameValid && name.length > 0 && (
            <p className="mt-1 text-xs text-rose-600">Enter at least 2 characters.</p>
          )}
        </div>

        <div>
          <label htmlFor="customer-phone" className="mb-1 block text-sm">
            Phone
          </label>
          <input
            id="customer-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+380XXXXXXXXX"
            autoComplete="tel"
            className="w-full rounded-lg border border-sky-200 bg-white px-4 py-2 text-slate-700 outline-none transition focus:ring-2 focus:ring-sky-300"
          />
          {!isPhoneValid && phone.length > 0 && (
            <p className="mt-1 text-xs text-rose-600">Use format +380XXXXXXXXX.</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-slate-700 transition hover:bg-sky-50"
        >
          <ArrowLeft className="mr-2 inline" size={16} />
          Back
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canContinue}
          className={`rounded-lg px-4 py-2 text-white transition ${
            canContinue
              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 shadow-[0_10px_22px_rgba(59,130,246,0.3)] hover:brightness-110'
              : 'cursor-not-allowed bg-slate-400'
          }`}
        >
          Continue
          <ChevronRight className="ml-2 inline" size={16} />
        </button>
      </div>
    </div>
  );
};

export default CustomerDetails;
