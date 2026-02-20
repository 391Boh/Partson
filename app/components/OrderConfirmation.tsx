import { CheckCircle } from "lucide-react";

interface OrderConfirmationProps {
  name: string;
  phone: string;
  orderId: string;
  totalAmount: number;
  onClose: () => void;
}

const OrderConfirmation: React.FC<OrderConfirmationProps> = ({
  name,
  phone,
  orderId,
  totalAmount,
  onClose,
}) => {
  return (
    <div className="mx-auto mt-6 max-w-sm space-y-4 rounded-2xl border border-sky-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.96)_52%,rgba(224,242,254,0.94)_100%)] px-6 py-8 text-slate-700 shadow-[0_18px_42px_rgba(15,23,42,0.14)]">
      <div className="flex justify-center">
        <CheckCircle size={48} className="animate-pulse text-emerald-500 drop-shadow-[0_8px_16px_rgba(16,185,129,0.32)]" />
      </div>

      <h2 className="text-center text-2xl font-bold text-slate-800">Замовлення підтверджено</h2>

      <p className="text-center">
        Дякуємо, <span className="font-semibold">{name}</span>!
      </p>
      <p className="text-center text-sm text-slate-600">
        Ми зв&apos;яжемося з вами за номером{" "}
        <span className="font-semibold text-blue-600">{phone}</span>
      </p>

      <div className="text-center">
        <p className="text-xs text-slate-500">Номер замовлення</p>
        <p className="font-mono text-base text-blue-600">{orderId}</p>
      </div>

      <p className="text-center text-lg font-semibold text-emerald-600">
        Сума: {totalAmount.toFixed(2)} грн
      </p>

      <div className="flex justify-center">
        <button
          onClick={onClose}
          className="mt-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-1.5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(59,130,246,0.3)] transition hover:brightness-110"
        >
          Закрити
        </button>
      </div>
    </div>
  );
};

export default OrderConfirmation;
