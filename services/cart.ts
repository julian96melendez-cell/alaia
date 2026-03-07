// services/cart.ts
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

// Añadir producto al carrito
export async function addToCart(userId: string, product: any) {
  const ref = doc(db, "users", userId, "cart", product.id);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    // Si ya existe, aumentamos cantidad
    const currentQty = snapshot.data().quantity ?? 1;
    await updateDoc(ref, { quantity: currentQty + 1 });
  } else {
    // Crear nuevo producto
    await setDoc(ref, {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image,
      category: product.category,
      quantity: 1,
    });
  }
}

// Quitar un producto del carrito
export async function removeFromCart(userId: string, productId: string) {
  const ref = doc(db, "users", userId, "cart", productId);
  await deleteDoc(ref);
}

// Actualizar cantidad
export async function setQuantity(userId: string, productId: string, qty: number) {
  const ref = doc(db, "users", userId, "cart", productId);
  if (qty <= 0) return deleteDoc(ref);
  await updateDoc(ref, { quantity: qty });
}

// Obtener un producto
export async function getCartItem(userId: string, productId: string) {
  const ref = doc(db, "users", userId, "cart", productId);
  return (await getDoc(ref)).data();
}