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
    <div className="soft-surface-card mx-auto mt-5 max-w-sm space-y-3.5 rounded-[16px] px-5 py-6 text-slate-700">
      <div className="flex justify-center">
        <CheckCircle size={48} className="animate-pulse text-emerald-500 drop-shadow-[0_8px_16px_rgba(16,185,129,0.32)]" />
      </div>

      <h2 className="text-center text-2xl font-bold text-slate-800">Замовлення підтверджено</h2>

      <p className="text-center">
        Дякуємо, <span className="font-semibold">{name}</span>!
      </p>
      <p className="text-center text-sm text-slate-600">
        Ми зв&apos;яжемося з вами за номером{" "}
        <span className="break-all font-semibold text-blue-600">{phone}</span>
      </p>

      <div className="text-center">
        <p className="text-xs text-slate-500">Номер замовлення</p>
        <p className="break-all font-mono text-base text-blue-600">{orderId}</p>
      </div>

      <p className="text-center text-lg font-semibold text-emerald-600">
        Сума: {totalAmount.toFixed(2)} грн
      </p>

      <div className="flex justify-center">
        <button
          onClick={onClose}
          className="soft-primary-button mt-1 px-5 py-2.5 text-sm font-semibold"
        >
          Закрити
        </button>
      </div>
    </div>
  );
};

export default OrderConfirmation;
