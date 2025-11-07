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
    <div className="max-w-sm mx-auto mt-6 bg-gradient-to-br from-gray-800 to-gray-900 text-white rounded-2xl shadow-lg px-6 py-8 space-y-4">
      <div className="flex justify-center">
        <CheckCircle size={48} className="text-emerald-400 animate-pulse drop-shadow" />
      </div>

      <h2 className="text-2xl font-bold text-center">Замовлення підтверджено</h2>

      <p className="text-center">
        Дякуємо, <span className="font-semibold">{name}</span>!
      </p>
      <p className="text-center text-sm">
        Ми зв'яжемося з вами за номером{" "}
        <span className="font-semibold text-blue-300">{phone}</span>
      </p>

      <div className="text-center">
        <p className="text-xs text-gray-400">Номер замовлення</p>
        <p className="font-mono text-base text-blue-400">{orderId}</p>
      </div>

      <p className="text-center text-lg font-semibold text-emerald-400">
        Сума: {totalAmount.toFixed(2)} грн
      </p>

      <div className="flex justify-center">
        <button
          onClick={onClose}
          className="mt-2 px-5 py-1.5 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 rounded-full font-semibold text-sm transition shadow"
        >
          Закрити
        </button>
      </div>
    </div>
  );
};

export default OrderConfirmation;
