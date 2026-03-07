// services/products.ts
import {
    collection,
    doc,
    DocumentData,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    QueryDocumentSnapshot,
    startAfter,
    where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/* ───────────────────────────────────────────
      MODELO PROFESIONAL DE PRODUCTO
────────────────────────────────────────────── */

export interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;         // imagen principal
  images?: string[];      // galería opcional
  category: string;
  description?: string;
  featured?: boolean;
  rating?: number;
  colors?: string[];
  sizes?: string[];
  stock?: number;
  createdAt?: number;
}

/* ───────────────────────────────────────────
    CACHE LOCAL — MEGA OPTIMIZADO
────────────────────────────────────────────── */

const cacheAll = new Map<string, Product>();
const cacheFeatured: Product[] = [];
let cacheTimestamp = 0;

const productsRef = collection(db, "products");

/* Normalización estricta sin duplicar ID */
function normalizeDoc(d: QueryDocumentSnapshot<DocumentData>): Product {
  const raw = d.data();

  return {
    id: d.id, // <— SE DEFINE UNA SOLA VEZ
    name: raw.name ?? "Producto sin nombre",
    price: Number(raw.price ?? 0),
    image: raw.image,
    images: raw.images ?? [],
    category: raw.category ?? "general",
    description: raw.description ?? "",
    featured: Boolean(raw.featured),
    colors: raw.colors ?? [],
    sizes: raw.sizes ?? [],
    rating: raw.rating ?? 4.5,
    stock: raw.stock ?? 0,
    createdAt: raw.createdAt ?? 0,
  };
}

/* ───────────────────────────────────────────
      1. Obtener todos (con cache)
────────────────────────────────────────────── */
export async function getAllProducts(forceRefresh = false): Promise<Product[]> {
  const now = Date.now();

  // Cache válido por 30s
  if (!forceRefresh && now - cacheTimestamp < 30_000 && cacheAll.size > 0) {
    return [...cacheAll.values()];
  }

  const q = query(productsRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  cacheAll.clear();
  snap.docs.forEach((d) => cacheAll.set(d.id, normalizeDoc(d)));

  cacheTimestamp = now;
  return [...cacheAll.values()];
}

/* ───────────────────────────────────────────
      2. Destacados
────────────────────────────────────────────── */
export async function getFeaturedProducts(): Promise<Product[]> {
  if (cacheFeatured.length > 0) return cacheFeatured;

  const q = query(
    productsRef,
    where("featured", "==", true),
    orderBy("createdAt", "desc"),
    limit(10)
  );

  const snap = await getDocs(q);
  const list = snap.docs.map((d) => normalizeDoc(d));

  cacheFeatured.push(...list);
  return list;
}

/* ───────────────────────────────────────────
      3. Por categoría
────────────────────────────────────────────── */
export async function getProductsByCategory(category: string): Promise<Product[]> {
  const q = query(
    productsRef,
    where("category", "==", category),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeDoc(d));
}

/* ───────────────────────────────────────────
      4. Detalle por ID (SIN DUPLICAR ID)
────────────────────────────────────────────── */
export async function getProductById(id: string): Promise<Product | null> {
  // Cache local primero
  if (cacheAll.has(id)) return cacheAll.get(id)!;

  const ref = doc(db, "products", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const raw = snap.data();

  const product: Product = {
    id: snap.id, // SOLO AQUÍ
    name: raw.name ?? "Producto",
    price: Number(raw.price ?? 0),
    image: raw.image,
    images: raw.images ?? [],
    category: raw.category ?? "general",
    description: raw.description ?? "",
    featured: raw.featured ?? false,
    colors: raw.colors ?? [],
    sizes: raw.sizes ?? [],
    rating: raw.rating ?? 4.5,
    stock: raw.stock ?? 0,
    createdAt: raw.createdAt ?? 0,
  };

  cacheAll.set(id, product);
  return product;
}

/* ───────────────────────────────────────────
      5. Paginación profesional
────────────────────────────────────────────── */
export async function getPaginatedProducts(
  lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{
  products: Product[];
  last: QueryDocumentSnapshot<DocumentData> | null;
}> {
  const q = lastDoc
    ? query(productsRef, orderBy("createdAt", "desc"), startAfter(lastDoc), limit(12))
    : query(productsRef, orderBy("createdAt", "desc"), limit(12));

  const snap = await getDocs(q);

  return {
    products: snap.docs.map((d) => normalizeDoc(d)),
    last: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
  };
}

/* ───────────────────────────────────────────
      6. Búsqueda avanzada
────────────────────────────────────────────── */
export async function searchProducts(text: string): Promise<Product[]> {
  const all = await getAllProducts();

  const q = text.trim().toLowerCase();
  if (!q) return all;

  return all
    .map((p) => ({
      p,
      score:
        (p.name.toLowerCase().includes(q) ? 2 : 0) +
        (p.category.toLowerCase().includes(q) ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

/* ───────────────────────────────────────────
      7. Productos relacionados
────────────────────────────────────────────── */
export async function getRelatedProducts(product: Product): Promise<Product[]> {
  const all = await getAllProducts();

  return all
    .filter((p) => p.id !== product.id)
    .filter((p) => p.category === product.category)
    .slice(0, 8);
}

/* ───────────────────────────────────────────
      8. Recomendados (placeholder)
────────────────────────────────────────────── */
export async function getRecommendedProducts(): Promise<Product[]> {
  const all = await getAllProducts();
  return all.slice(0, 12);
}