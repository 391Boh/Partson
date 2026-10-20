export const CART_ADDED_EVENT = "partson:cart-added";
export type CartAddedDetail = {
  code: string;
  article: string;
  name: string;
  producer?: string;
  price: number;
  quantity: number;
};
