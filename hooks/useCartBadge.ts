import { useCart } from "../context/CartContext";

export default function useCartBadge() {
  const { items } = useCart();

  return items.reduce((total, item) => total + Number(item.quantity || 0), 0);
}