import { CheckCircle, CreditCard, PackageCheck, Phone, ReceiptText } from "lucide-react";

interface OrderConfirmationProps {
  name: string;
  phone: string;
  orderId: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  onClose: () => void;
}

const OrderConfirmation: React.FC<OrderConfirmationProps> = ({
  name,
  phone,
  orderId,
  totalAmount,
  paymentMethod,
  paymentStatus,
  onClose,
}) => {
  const formattedAmount = new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 2,
  }).format(totalAmount);
  const isPaid = paymentStatus === "paid";

  return (
    <div className="mx-auto mt-4 max-w-xl space-y-3 text-slate-700 sm:mt-5">
      <div className="soft-panel-hero px-4 py-5 text-center sm:px-5 sm:py-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-emerald-100 bg-white/90 text-emerald-500 shadow-[0_18px_34px_rgba(16,185,129,0.18)]">
          <CheckCircle size={42} className="animate-pulse" aria-hidden="true" />
        </div>

        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
          {isPaid ? "Оплату зараховано" : "Замовлення прийнято"}
        </p>
        <h2 className="font-display mt-1 text-2xl font-[760] leading-tight tracking-normal text-slate-900">
          Замовлення підтверджено
        </h2>

        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
          Дякуємо, <span className="font-semibold text-slate-800">{name}</span>. Менеджер зв&apos;яжеться з вами за номером{" "}
          <span className="font-semibold text-blue-600">{phone}</span>.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <ReceiptText size={15} aria-hidden="true" />
            Замовлення
          </div>
          <p className="mt-1 break-all font-mono text-sm font-bold text-blue-700">
            №{orderId}
          </p>
        </div>
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <PackageCheck size={15} aria-hidden="true" />
            Сума
          </div>
          <p className="mt-1 text-sm font-bold text-emerald-700">{formattedAmount}</p>
        </div>
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <CreditCard size={15} aria-hidden="true" />
            Оплата
          </div>
          <p className="mt-1 text-sm font-bold text-slate-800">
            {paymentMethod || "Не вказано"}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            {isPaid ? "Зараховано" : "Оплата при отриманні"}
          </p>
        </div>
        <div className="soft-surface-card rounded-[18px] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Phone size={15} aria-hidden="true" />
            Контакт
          </div>
          <p className="mt-1 break-all text-sm font-bold text-slate-800">{phone}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={onClose}
          className="soft-primary-button mt-1 w-full px-5 py-2.5 text-sm font-semibold sm:w-auto"
        >
          Готово
        </button>
      </div>
    </div>
  );
};

export default OrderConfirmation;
