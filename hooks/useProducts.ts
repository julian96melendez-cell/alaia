import { collection, getDocs, QueryDocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  tag?: string;
  image?: string;
}

export default function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      const colRef = collection(db, "products");
      const snapshot = await getDocs(colRef);

      const items = snapshot.docs.map(
        (doc: QueryDocumentSnapshot): Product => ({
          id: doc.id,
          ...doc.data(),
        }) as Product
      );

      setProducts(items);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return { products, loading };
}