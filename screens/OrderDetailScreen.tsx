// services/products.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/* ─────────────────────────────────────────
   0. TIPOS BASE
──────────────────────────────────────────── */

/**
 * Representación interna de un producto en la app.
 * Este es el tipo que vas a usar en pantallas y lógica.
 */
export interface Product {
  id: string;

  // Básico
  name: string;
  price: number;
  category: string;

  // Imágenes
  image?: string;           // Imagen principal
  images?: string[];        // Galería

  // Detalle
  description?: string;
  brand?: string;
  sku?: string;

  // Flags
  featured?: boolean;
  isActive?: boolean;       // visible en tienda
  isNew?: boolean;

  // Atributos
  rating?: number;
  reviewsCount?: number;
  colors?: string[];
  sizes?: string[];

  // Inventario
  stock?: number;           // stock total simple
  minStockAlert?: number;   // para alertas internas

  // Precios extra
  compareAtPrice?: number;  // precio tachado / anterior
  discountPercent?: number; // cache de descuento calculado

  // Metadatos
  createdAt?: number;       // ms desde epoch
  updatedAt?: number;       // ms desde epoch
  tags?: string[];
}

/**
 * Datos crudos de Firestore.
 * No incluimos `id` porque viene del documento, así evitamos duplicarlo.
 */
type FirestoreProduct = {
  name?: string;
  price?: number;
  category?: string;
  image?: string;
  images?: string[];
  description?: string;
  brand?: string;
  sku?: string;
  featured?: boolean;
  isActive?: boolean;
  isNew?: boolean;
  rating?: number;
  reviewsCount?: number;
  colors?: string[];
  sizes?: string[];
  stock?: number;
  minStockAlert?: number;
  compareAtPrice?: number;
  tags?: string[];

  // campos de fecha / timestamp
  createdAt?: any;
  updatedAt?: any;
};

/**
 * Tipo para filtros avanzados.
 * Lo puedes usar en pantallas tipo "ProductList".
 */
export interface ProductFilters {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  onlyFeatured?: boolean;
  onlyInStock?: boolean;
  tags?: string[];
}

/**
 * Ordenación básica.
 */
export type SortBy =
  | "createdAt_desc"
  | "createdAt_asc"
  | "price_asc"
  | "price_desc"
  | "rating_desc";

/**
 * Entrada para crear / actualizar productos desde panel admin.
 */
export interface ProductInput {
  name: string;
  price: number;
  category: string;
  description?: string;
  brand?: string;
  sku?: string;
  image?: string;
  images?: string[];
  featured?: boolean;
  isActive?: boolean;
  isNew?: boolean;
  rating?: number;
  reviewsCount?: number;
  colors?: string[];
  sizes?: string[];
  stock?: number;
  minStockAlert?: number;
  compareAtPrice?: number;
  tags?: string[];
}

/* ─────────────────────────────────────────
   1. REFERENCIAS & CACHE
──────────────────────────────────────────── */

const PRODUCTS_COLLECTION = "products";
const productsRef = collection(db, PRODUCTS_COLLECTION);

// Cache por id
const productCache = new Map<string, Product>();

// Cache de todos
let allCache: Product[] | null = null;
let allCacheTimestamp = 0;

// Cache de destacados
let featuredCache: Product[] | null = null;

// Cache por categoría
const categoryCache = new Map<string, Product[]>();

const ALL_CACHE_TTL = 30_000; // 30s

/* ─────────────────────────────────────────
   2. HELPERS DE FECHAS & NORMALIZACIÓN
──────────────────────────────────────────── */

function toMillis(value: any | undefined): number | undefined {
  if (!value) return undefined;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return undefined;
}

/**
 * Normaliza un FirestoreProduct + id de doc a nuestro Product interno.
 * TODO pasa por aquí → una sola fuente de verdad.
 */
function fromFirestore(id: string, raw: FirestoreProduct): Product {
  const createdAt = toMillis(raw.createdAt);
  const updatedAt = toMillis(raw.updatedAt);

  const image = raw.image ?? undefined;
  const images =
    Array.isArray(raw.images) && raw.images.length > 0
      ? raw.images
      : image
      ? [image]
      : [];

  const price = Number(raw.price ?? 0);
  const compareAtPrice =
    typeof raw.compareAtPrice === "number" ? raw.compareAtPrice : undefined;

  let discountPercent: number | undefined;
  if (compareAtPrice && compareAtPrice > price && price > 0) {
    discountPercent = Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  }

  const product: Product = {
    id,
    name: raw.name ?? "Producto sin nombre",
    price,
    category: raw.category ?? "general",
    image,
    images,
    description: raw.description ?? "",
    brand: raw.brand ?? undefined,
    sku: raw.sku ?? undefined,
    featured: !!raw.featured,
    isActive: raw.isActive ?? true,
    isNew: raw.isNew ?? false,
    rating: typeof raw.rating === "number" ? raw.rating : 4.5,
    reviewsCount: typeof raw.reviewsCount === "number" ? raw.reviewsCount : 0,
    colors: Array.isArray(raw.colors) ? raw.colors : [],
    sizes: Array.isArray(raw.sizes) ? raw.sizes : [],
    stock: typeof raw.stock === "number" ? raw.stock : 0,
    minStockAlert:
      typeof raw.minStockAlert === "number" ? raw.minStockAlert : 0,
    compareAtPrice,
    discountPercent,
    createdAt,
    updatedAt,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };

  // Actualizamos caches
  productCache.set(product.id, product);

  return product;
}

/**
 * Convierte nuestro ProductInput a un objeto listo para Firestore.
 * No incluye `id` (lo maneja Firestore).
 */
function toFirestoreData(input: ProductInput) {
  const now = serverTimestamp();
  return {
    name: input.name,
    price: input.price,
    category: input.category,
    description: input.description ?? "",
    brand: input.brand ?? null,
    sku: input.sku ?? null,
    image: input.image ?? null,
    images: input.images ?? [],
    featured: input.featured ?? false,
    isActive: input.isActive ?? true,
    isNew: input.isNew ?? false,
    rating: input.rating ?? 0,
    reviewsCount: input.reviewsCount ?? 0,
    colors: input.colors ?? [],
    sizes: input.sizes ?? [],
    stock: input.stock ?? 0,
    minStockAlert: input.minStockAlert ?? 0,
    compareAtPrice: input.compareAtPrice ?? null,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ─────────────────────────────────────────
   3. LECTURAS PRINCIPALES
──────────────────────────────────────────── */

/**
 * Obtiene TODOS los productos.
 * Usa cache interna durante 30s para evitar golpear Firestore.
 */
export async function getAllProducts(
  forceRefresh = false
): Promise<Product[]> {
  const now = Date.now();

  if (!forceRefresh && allCache && now - allCacheTimestamp < ALL_CACHE_TTL) {
    return allCache;
  }

  const q = query(productsRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const list = snap.docs.map((d) =>
    fromFirestore(d.id, d.data() as FirestoreProduct)
  );

  allCache = list;
  allCacheTimestamp = now;

  return list;
}

/**
 * Destacados (featured = true), máximo 10.
 * Se cachea en memoria hasta que forces refresh llamando con `forceRefresh: true`.
 */
export async function getFeaturedProducts(
  forceRefresh = false
): Promise<Product[]> {
  if (!forceRefresh && featuredCache && featuredCache.length > 0) {
    return featuredCache;
  }

  const q = query(
    productsRef,
    where("featured", "==", true),
    orderBy("createdAt", "desc"),
    limit(10)
  );

  const snap = await getDocs(q);
  const list = snap.docs.map((d) =>
    fromFirestore(d.id, d.data() as FirestoreProduct)
  );

  featuredCache = list;
  return list;
}

/**
 * Productos por categoría.
 * Se cachea por categoría (case insensitive).
 */
export async function getProductsByCategory(
  category: string
): Promise<Product[]> {
  const key = category.toLowerCase();

  if (categoryCache.has(key)) {
    return categoryCache.get(key)!;
  }

  const q = query(
    productsRef,
    where("category", "==", category),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);

  const list = snap.docs.map((d) =>
    fromFirestore(d.id, d.data() as FirestoreProduct)
  );

  categoryCache.set(key, list);

  return list;
}

/**
 * Obtiene detalle de un producto por ID, usando cache cuando sea posible.
 * SIN `id` duplicado → no hay error de TS.
 */
export async function getProductById(id: string): Promise<Product | null> {
  // Cache directa
  const cached = productCache.get(id);
  if (cached) return cached;

  const ref = doc(db, PRODUCTS_COLLECTION, id);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const p = fromFirestore(snap.id, snap.data() as FirestoreProduct);
  return p;
}

/* ─────────────────────────────────────────
   4. PAGINACIÓN AVANZADA
──────────────────────────────────────────── */

export interface PaginatedProductsResult {
  products: Product[];
  last: QueryDocumentSnapshot<DocumentData> | null;
}

/**
 * Paginación clásica, ordenando por createdAt (desc).
 * Se usa para listas infinitas de productos.
 */
export async function getPaginatedProducts(
  lastDoc?: QueryDocumentSnapshot<DocumentData>,
  pageSize: number = 12
): Promise<PaginatedProductsResult> {
  const q = lastDoc
    ? query(
        productsRef,
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(pageSize)
      )
    : query(productsRef, orderBy("createdAt", "desc"), limit(pageSize));

  const snap = await getDocs(q);

  const products = snap.docs.map((d) =>
    fromFirestore(d.id, d.data() as FirestoreProduct)
  );

  const last =
    snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

  return { products, last };
}

/* ─────────────────────────────────────────
   5. BÚSQUEDA Y FILTROS CLIENT-SIDE
──────────────────────────────────────────── */

/**
 * Aplica filtros y ordenación client-side sobre una lista de productos.
 * Ideal después de `getAllProducts` o `getProductsByCategory`.
 */
export function filterAndSortProducts(
  products: Product[],
  filters?: ProductFilters,
  sortBy: SortBy = "createdAt_desc"
): Product[] {
  let list = [...products];

  if (filters) {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      onlyFeatured,
      onlyInStock,
      tags,
    } = filters;

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => {
        const inName = p.name.toLowerCase().includes(q);
        const inDesc = p.description?.toLowerCase().includes(q) ?? false;
        const inBrand = p.brand?.toLowerCase().includes(q) ?? false;
        const inCategory = p.category.toLowerCase().includes(q);
        return inName || inDesc || inBrand || inCategory;
      });
    }

    if (category && category.trim()) {
      const cat = category.toLowerCase();
      list = list.filter(
        (p) => p.category.toLowerCase() === cat
      );
    }

    if (typeof minPrice === "number") {
      list = list.filter((p) => p.price >= minPrice);
    }

    if (typeof maxPrice === "number") {
      list = list.filter((p) => p.price <= maxPrice);
    }

    if (onlyFeatured) {
      list = list.filter((p) => p.featured);
    }

    if (onlyInStock) {
      list = list.filter((p) => (p.stock ?? 0) > 0);
    }

    if (tags && tags.length > 0) {
      const set = new Set(tags.map((t) => t.toLowerCase()));
      list = list.filter((p) =>
        (p.tags ?? []).some((t) => set.has(t.toLowerCase()))
      );
    }
  }

  // Ordenación
  list.sort((a, b) => {
    switch (sortBy) {
      case "createdAt_desc":
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      case "createdAt_asc":
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      case "price_asc":
        return a.price - b.price;
      case "price_desc":
        return b.price - a.price;
      case "rating_desc":
        return (b.rating ?? 0) - (a.rating ?? 0);
      default:
        return 0;
    }
  });

  return list;
}

/**
 * Búsqueda rápida a nivel de servicio.
 * Internamente usa `getAllProducts` + `filterAndSortProducts`.
 */
export async function searchProducts(
  queryText: string
): Promise<Product[]> {
  const all = await getAllProducts();
  if (!queryText || !queryText.trim()) return all;

  const filters: ProductFilters = {
    search: queryText,
  };

  return filterAndSortProducts(all, filters, "createdAt_desc");
}

/* ─────────────────────────────────────────
   6. RELACIONADOS & RECOMENDADOS
──────────────────────────────────────────── */

/**
 * Devuelve productos relacionados:
 *   - misma categoría
 *   - excluye el actual
 */
export async function getRelatedProducts(
  product: Product,
  limitResults: number = 8
): Promise<Product[]> {
  const all = await getAllProducts();

  return all
    .filter((p) => p.id !== product.id)
    .filter((p) => p.category === product.category)
    .slice(0, limitResults);
}

/**
 * Recomendados básicos:
 *   - prioriza destacados
 *   - luego los más nuevos
 *
 * Nota: en el futuro puedes ajustar esto para usar
 * historial de usuario, vistas recientes, etc.
 */
export async function getRecommendedProducts(
  max: number = 12
): Promise<Product[]> {
  const all = await getAllProducts();

  const featured = all.filter((p) => p.featured);
  const rest = all.filter((p) => !p.featured);

  const merged = [...featured, ...rest];

  return merged.slice(0, max);
}

/* ─────────────────────────────────────────
   7. INVENTARIO & UTILIDADES
──────────────────────────────────────────── */

export type StockStatus = "out_of_stock" | "low" | "ok";

export function getStockStatus(product: Product): StockStatus {
  const stock = product.stock ?? 0;
  if (stock <= 0) return "out_of_stock";

  const min = product.minStockAlert ?? 0;
  if (min > 0 && stock <= min) return "low";

  return "ok";
}

/**
 * Helper para mapear un Product → payload de carrito.
 * Útil si quieres un "añadir al carrito" bien tipado.
 */
export function toCartItemFromProduct(
  product: Product,
  quantity: number = 1,
  opts?: { color?: string; size?: string }
) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    quantity,
    image: product.image,
    color: opts?.color,
    size: opts?.size,
    category: product.category,
  };
}

/* ─────────────────────────────────────────
   8. CRUD (para panel ADMIN / seeds)
──────────────────────────────────────────── */

/**
 * Crea un producto nuevo en Firestore.
 * Devuelve el Product normalizado.
 */
export async function createProduct(
  input: ProductInput
): Promise<Product> {
  const data = toFirestoreData(input);
  const colRef = collection(db, PRODUCTS_COLLECTION);
  const docRef = await addDoc(colRef, data);
  const snap = await getDoc(docRef);

  return fromFirestore(docRef.id, snap.data() as FirestoreProduct);
}

/**
 * Actualiza parcialmente un producto.
 * `patch` puede contener cualquier campo de ProductInput.
 */
export async function updateProduct(
  id: string,
  patch: Partial<ProductInput>
): Promise<Product | null> {
  const ref = doc(db, PRODUCTS_COLLECTION, id);

  // Creamos objeto de actualización
  const data: Record<string, any> = { ...patch, updatedAt: serverTimestamp() };

  await updateDoc(ref, data);

  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const product = fromFirestore(snap.id, snap.data() as FirestoreProduct);

  // invalidar caches simples
  productCache.set(id, product);
  allCache = null;
  featuredCache = null;
  categoryCache.clear();

  return product;
}

/**
 * Borra un producto por id.
 */
export async function deleteProduct(id: string): Promise<void> {
  const ref = doc(db, PRODUCTS_COLLECTION, id);
  await deleteDoc(ref);

  // limpiar caches
  productCache.delete(id);
  allCache = null;
  featuredCache = null;
  categoryCache.clear();
}

/**
 * Crea muchos productos en batch.
 * Ideal para seeds iniciales.
 */
export async function bulkCreateProducts(
  inputs: ProductInput[]
): Promise<Product[]> {
  const created: Product[] = [];

  for (const input of inputs) {
    const product = await createProduct(input);
    created.push(product);
  }

  return created;
}

/**
 * Ajusta stock de forma atómica (ej: al confirmar pedido).
 * amount puede ser negativo (restar stock) o positivo (sumar).
 */
export async function adjustProductStock(
  productId: string,
  amount: number
): Promise<void> {
  const ref = doc(db, PRODUCTS_COLLECTION, productId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error("Producto no encontrado para ajustar stock");
    }

    const raw = snap.data() as FirestoreProduct;
    const currentStock = typeof raw.stock === "number" ? raw.stock : 0;

    const newStock = Math.max(0, currentStock + amount);

    tx.update(ref, {
      stock: newStock,
      updatedAt: serverTimestamp(),
    });
  });

  // invalidar caches
  allCache = null;
  featuredCache = null;
  categoryCache.clear();
}