// services/products.ts

import * as Network from "expo-network";
import { apiUrl } from "../config/api";

export interface Product {
  id: string; // _id real de MongoDB
  mongoId: string;
  name: string;
  price: number;
  image?: string;
  images?: string[];
  category: string;
  description?: string;
  featured?: boolean;
  isFeatured?: boolean;
  rating?: number;
  colors?: string[];
  sizes?: string[];
  stock?: number;
  createdAt?: any;
}

let cacheAll: Product[] = [];
let cacheTimestamp = 0;

function isMongoObjectId(value?: unknown) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value.trim());
}

function normalizeProduct(raw: any): Product {
  const mongoId = String(raw?._id || raw?.id || "").trim();

  return {
    id: mongoId,
    mongoId,

    name: String(raw?.nombre || raw?.name || "Producto sin nombre"),

    price: Number(
      raw?.precioFinal ??
        raw?.precio ??
        raw?.price ??
        0
    ),

    image:
      raw?.imagenPrincipal ||
      raw?.image ||
      (Array.isArray(raw?.imagenes)
        ? raw.imagenes[0]
        : undefined),

    images: Array.isArray(raw?.imagenes)
      ? raw.imagenes
      : Array.isArray(raw?.images)
        ? raw.images
        : [],

    category: String(
      raw?.categoria ||
        raw?.category ||
        "general"
    ),

    description: String(
      raw?.descripcion ||
        raw?.description ||
        ""
    ),

    featured: Boolean(
      raw?.featured ||
        raw?.isFeatured ||
        raw?.destacado
    ),

    isFeatured: Boolean(
      raw?.featured ||
        raw?.isFeatured ||
        raw?.destacado
    ),

    colors: Array.isArray(raw?.colors)
      ? raw.colors
      : [],

    sizes: Array.isArray(raw?.sizes)
      ? raw.sizes
      : [],

    rating: Number(raw?.rating || 4.7),

    stock: Number(raw?.stock || 0),

    createdAt: raw?.createdAt || null,
  };
}

function extractList(json: any): any[] {
  if (Array.isArray(json)) {
    return json;
  }

  if (Array.isArray(json?.data)) {
    return json.data;
  }

  if (Array.isArray(json?.productos)) {
    return json.productos;
  }

  if (Array.isArray(json?.products)) {
    return json.products;
  }

  if (Array.isArray(json?.orden)) {
    return json.orden;
  }

  return [];
}

async function requestJson(path: string) {
  const url = apiUrl(path);

  console.log("🌐 PRODUCTS REQUEST URL:", url);

  try {
    const networkState =
      await Network.getNetworkStateAsync();

    console.log(
      "📶 NETWORK STATE:",
      networkState
    );

    // Petición real al backend
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    console.log(
      "🌐 PRODUCTS STATUS:",
      res.status
    );

    const text = await res.text();

    console.log(
      "🌐 PRODUCTS RAW:",
      text.slice(0, 300)
    );

    let json: any = null;

    if (text) {
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        console.log(
          "🌐 PRODUCTS JSON PARSE ERROR:",
          parseError
        );

        throw new Error(
          "El backend respondió con contenido inválido."
        );
      }
    }

    if (!res.ok) {
      throw new Error(
        json?.message ||
          `HTTP ${res.status}`
      );
    }

    return json;
  } catch (error) {
    console.log(
      "🌐 PRODUCTS FETCH ERROR FULL:",
      error
    );

    throw error;
  }
}

export async function getAllProducts(
  forceRefresh = false
): Promise<Product[]> {
  const now = Date.now();

  if (
    !forceRefresh &&
    cacheAll.length > 0 &&
    now - cacheTimestamp < 30_000
  ) {
    return cacheAll;
  }

  const json = await requestJson(
    "/api/productos"
  );

  const list = extractList(json)
    .map(normalizeProduct)
    .filter(
      (product) =>
        isMongoObjectId(product.id) &&
        product.price > 0
    );

  cacheAll = list;
  cacheTimestamp = now;

  return list;
}

export async function getFeaturedProducts(): Promise<
  Product[]
> {
  const all = await getAllProducts();

  return all
    .filter(
      (product) =>
        product.featured ||
        product.isFeatured
    )
    .slice(0, 10);
}

export async function getProductsByCategory(
  category: string
): Promise<Product[]> {
  const all = await getAllProducts();

  const cleanCategory = String(
    category || ""
  )
    .trim()
    .toLowerCase();

  if (!cleanCategory) {
    return [];
  }

  return all.filter(
    (product) =>
      product.category
        .trim()
        .toLowerCase() === cleanCategory
  );
}

export async function getProductById(
  id: string
): Promise<Product | null> {
  const cleanId = String(
    id || ""
  ).trim();

  if (!isMongoObjectId(cleanId)) {
    return null;
  }

  const cached = cacheAll.find(
    (product) =>
      product.id === cleanId ||
      product.mongoId === cleanId
  );

  if (cached) {
    return cached;
  }

  const json = await requestJson(
    `/api/productos/${cleanId}`
  );

  const raw =
    json?.data ||
    json?.producto ||
    json?.product ||
    json;

  const product =
    normalizeProduct(raw);

  if (!isMongoObjectId(product.id)) {
    return null;
  }

  return product;
}

export async function searchProducts(
  text: string
): Promise<Product[]> {
  const all = await getAllProducts();

  const query = String(
    text || ""
  )
    .trim()
    .toLowerCase();

  if (!query) {
    return all;
  }

  return all
    .map((product) => ({
      product,

      score:
        (product.name
          .toLowerCase()
          .includes(query)
          ? 2
          : 0) +
        (product.category
          .toLowerCase()
          .includes(query)
          ? 1
          : 0) +
        (product.description
          ?.toLowerCase()
          .includes(query)
          ? 1
          : 0),
    }))
    .filter(
      (item) =>
        item.score > 0
    )
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .map(
      (item) =>
        item.product
    );
}

export async function getRelatedProducts(
  product: Product
): Promise<Product[]> {
  const all = await getAllProducts();

  return all
    .filter(
      (item) =>
        item.id !== product.id
    )
    .filter(
      (item) =>
        item.category
          .trim()
          .toLowerCase() ===
        product.category
          .trim()
          .toLowerCase()
    )
    .slice(0, 8);
}

export async function getRecommendedProducts(): Promise<
  Product[]
> {
  const all = await getAllProducts();

  return all.slice(0, 12);
}