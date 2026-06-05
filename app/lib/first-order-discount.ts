export const FIRST_ORDER_DISCOUNT_CODE = "FIRST_ORDER_5";
export const FIRST_ORDER_DISCOUNT_RATE = 0.05;
export const FIRST_ORDER_DISCOUNT_PERCENT = 5;

export type FirstOrderDiscountTotals = {
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  discountRate: number;
  discountCode: string | null;
  isApplied: boolean;
};

const roundMoney = (value: number) =>
  Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100);

const roundDiscount = (value: number) =>
  Math.max(0, Math.round(value + Number.EPSILON));

export const calculateFirstOrderDiscount = (
  subtotalAmount: number,
  isEligible: boolean
): FirstOrderDiscountTotals => {
  const normalizedSubtotal = roundMoney(
    Number.isFinite(subtotalAmount) ? subtotalAmount : 0
  );
  const discountAmount = isEligible
    ? roundDiscount(normalizedSubtotal * FIRST_ORDER_DISCOUNT_RATE)
    : 0;
  const totalAmount = roundMoney(normalizedSubtotal - discountAmount);

  return {
    subtotalAmount: normalizedSubtotal,
    discountAmount,
    totalAmount,
    discountRate: isEligible ? FIRST_ORDER_DISCOUNT_RATE : 0,
    discountCode: isEligible ? FIRST_ORDER_DISCOUNT_CODE : null,
    isApplied: isEligible && discountAmount > 0,
  };
};
