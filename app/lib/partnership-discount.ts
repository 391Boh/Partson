export const PARTNER_DISCOUNT_CODE = "PARTNER_8";
export const PARTNER_DISCOUNT_RATE = 0.08;
export const PARTNER_DISCOUNT_PERCENT = 8;
export const PARTNER_THRESHOLD_UAH = 2000;

export type PartnerDiscountStatus =
  | "loading"
  | "guest"
  | "active"
  | "pending"
  | "error";

export type PartnerDiscountTotals = {
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

export const calculatePartnerDiscount = (
  subtotalAmount: number,
  isEligible: boolean
): PartnerDiscountTotals => {
  const normalizedSubtotal = roundMoney(
    Number.isFinite(subtotalAmount) ? subtotalAmount : 0
  );
  const discountAmount = isEligible
    ? roundDiscount(normalizedSubtotal * PARTNER_DISCOUNT_RATE)
    : 0;
  const totalAmount = roundMoney(normalizedSubtotal - discountAmount);

  return {
    subtotalAmount: normalizedSubtotal,
    discountAmount,
    totalAmount,
    discountRate: isEligible ? PARTNER_DISCOUNT_RATE : 0,
    discountCode: isEligible ? PARTNER_DISCOUNT_CODE : null,
    isApplied: isEligible && discountAmount > 0,
  };
};
