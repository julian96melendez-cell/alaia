import { useState } from "react";

export type Product = {
  id: string;
  name: string;
  price: number;
  image?: any;
};

export function useCart() {
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [cart, setCart] = useState<Product[]>([]);

  const toggleWishlist = (id: string) => {
    setWishlist((prev) =>
      prev.some((item) => item.id === id)
        ? prev.filter((item) => item.id !== id)
        : prev
    );
  };

  const addToCart = (product: Product) => setCart((prev) => [...prev, product]);

  return { wishlist, cart, toggleWishlist, addToCart };
}

export default useCart;