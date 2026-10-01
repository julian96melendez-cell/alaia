"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";

import { useAuth } from "./AuthContext";
import type { UsuarioBase } from "../lib/types";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
  color?: string | null;
  size?: string | null;
  category?: string | null;
  maxQty?: number;
  stock?: number;
}

export interface Coupon {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotal?: number;
  appliesToCategory?: string;
  appliesToProductIds?: string[];
  expiresAt?: number;
  singleUse?: boolean;
}

type CartState = {
  owner: string | null;
  items: CartItem[];
  loading: boolean;
  syncing: boolean;
  coupon: Coupon | null;
};

type CartAction =
  | { type: "LOAD"; owner: string; items: CartItem[]; coupon: Coupon | null }
  | { type: "SET_ITEMS"; owner: string; payload: CartItem[] }
  | { type: "SET_COUPON"; owner: string; payload: Coupon | null };

type CartContextType = {
  user: UsuarioBase | null;
  items: CartItem[];
  loading: boolean;
  syncing: boolean;
  totalItems: number;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  coupon: Coupon | null;
  addItem: (item: CartItem, qty?: number) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearCart: () => Promise<void>;
  applyCoupon: (code: string) => Promise<{ ok: boolean; message: string }>;
  removeCoupon: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const LOCAL_CART_KEY = "ALAIA_GUEST_CART_V1";
const LOCAL_COUPON_KEY = "ALAIA_GUEST_COUPON_V1";

const initialState: CartState = {
  owner: null,
  items: [],
  loading: true,
  syncing: false,
  coupon: null,
};

function cartReducer(state: CartState, action: CartAction): CartState {
  if (action.type !== "LOAD" && action.owner !== state.owner) return state;
  switch (action.type) {
    case "LOAD":
      return { owner: action.owner, items: action.items, coupon: action.coupon, loading: false, syncing: false };
    case "SET_ITEMS":
      return { ...state, items: action.payload };

    case "SET_COUPON":
      return { ...state, coupon: action.payload };

    default:
      return state;
  }
}

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

async function storageSetItem(key: string, value: string) {
  if (!isBrowser()) return;
  localStorage.setItem(key, value);
}

async function storageGetItem(key: string): Promise<string | null> {
  if (!isBrowser()) return null;
  return localStorage.getItem(key);
}

async function storageRemoveItem(key: string) {
  if (!isBrowser()) return;
  localStorage.removeItem(key);
}

function cleanCartItem(item: CartItem): CartItem {
  return {
    id: String(item.id),
    name: String(item.name || "Producto"),
    price: Number(item.price || 0),
    quantity: Math.max(1, Number(item.quantity || 1)),
    image: item.image || null,
    color: item.color || null,
    size: item.size || null,
    category: item.category || null,
    maxQty:
      typeof item.maxQty === "number" && Number.isFinite(item.maxQty)
        ? item.maxQty
        : undefined,
    stock:
      typeof item.stock === "number" && Number.isFinite(item.stock)
        ? item.stock
        : undefined,
  };
}

function clampQuantity(quantity: number, max?: number) {
  const safeQty = Math.max(1, Number(quantity || 1));

  if (typeof max === "number" && max > 0) {
    return Math.min(safeQty, max);
  }

  return safeQty;
}

export function CartProvider({ children }: React.PropsWithChildren) {
  const { user, loading: authLoading } = useAuth();
  const owner = authLoading ? null : user ? `user:${user._id || user.id}` : "guest";
  const [storedState, dispatch] = useReducer(cartReducer, initialState);
  // Cookie identity scopes browser storage; it never authorizes Firestore access.
  // Hide the previous owner's cart immediately, before effects run.
  const state = owner !== null && storedState.owner === owner ? storedState : initialState;
  const cartKey = owner === "guest" ? LOCAL_CART_KEY : `ALAIA_CART_V1:${owner}`;
  const couponKey = owner === "guest" ? LOCAL_COUPON_KEY : `ALAIA_COUPON_V1:${owner}`;

  useEffect(() => {
    let alive = true;
    if (owner === null) return;
    async function load() {
      let items: CartItem[] = [];
      let coupon: Coupon | null = null;
      try {
        const rawItems = await storageGetItem(cartKey);
        const parsed = rawItems ? JSON.parse(rawItems) : [];
        if (Array.isArray(parsed)) items = parsed.map(cleanCartItem);
        const rawCoupon = await storageGetItem(couponKey);
        coupon = rawCoupon ? JSON.parse(rawCoupon) : null;
      } catch {
        // Invalid/unavailable local storage is not an authenticated remote cart.
      }
      if (alive) dispatch({ type: "LOAD", owner: owner!, items, coupon });
    }
    void load();
    return () => { alive = false; };
  }, [owner, cartKey, couponKey]);

  function requireLoadedCart() {
    if (state.loading) throw new Error("Espera a que termine de cargar el carrito");
  }
  async function saveCart(items: CartItem[]) {
    await storageSetItem(cartKey, JSON.stringify(items.map(cleanCartItem)));
  }
  async function saveCoupon(coupon: Coupon | null) {
    if (coupon) await storageSetItem(couponKey, JSON.stringify(coupon));
    else await storageRemoveItem(couponKey);
  }

  const totalItems = useMemo(
    () => state.items.reduce((acc, item) => acc + Number(item.quantity || 0), 0),
    [state.items]
  );

  const subtotal = useMemo(
    () =>
      state.items.reduce(
        (acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 0),
        0
      ),
    [state.items]
  );

  const shipping = useMemo(
    () => (subtotal === 0 || subtotal >= 100 ? 0 : 6.99),
    [subtotal]
  );

  const discount = useMemo(() => {
    const coupon = state.coupon;

    if (!coupon) return 0;
    if (coupon.expiresAt && Date.now() > coupon.expiresAt) return 0;
    if (coupon.minSubtotal && subtotal < coupon.minSubtotal) return 0;

    let baseAmount = subtotal;

    if (coupon.appliesToCategory) {
      baseAmount = state.items
        .filter(
          (item) =>
            item.category?.toLowerCase() ===
            coupon.appliesToCategory?.toLowerCase()
        )
        .reduce(
          (acc, item) =>
            acc + Number(item.price || 0) * Number(item.quantity || 0),
          0
        );
    }

    if (coupon.appliesToProductIds?.length) {
      baseAmount = state.items
        .filter((item) => coupon.appliesToProductIds?.includes(item.id))
        .reduce(
          (acc, item) =>
            acc + Number(item.price || 0) * Number(item.quantity || 0),
          0
        );
    }

    if (baseAmount <= 0) return 0;

    const rawDiscount =
      coupon.type === "percent"
        ? (baseAmount * Number(coupon.value || 0)) / 100
        : Number(coupon.value || 0);

    return Math.min(rawDiscount, subtotal);
  }, [state.coupon, state.items, subtotal]);

  const total = useMemo(
    () => Math.max(0, subtotal - discount + shipping),
    [subtotal, discount, shipping]
  );

  const addItem = async (item: CartItem, qty: number = 1) => {
    const cleanItem = cleanCartItem(item);

    requireLoadedCart();

    const existing = state.items.find((cartItem) => cartItem.id === cleanItem.id);

    let nextItems: CartItem[];

    if (existing) {
      const max =
        existing.maxQty ?? existing.stock ?? cleanItem.maxQty ?? cleanItem.stock;

      const nextQty = clampQuantity((existing.quantity || 0) + qty, max);

      nextItems = state.items.map((cartItem) =>
        cartItem.id === cleanItem.id
          ? { ...cartItem, quantity: nextQty }
          : cartItem
      );
    } else {
      const max = cleanItem.maxQty ?? cleanItem.stock;
      nextItems = [
        ...state.items,
        {
          ...cleanItem,
          quantity: clampQuantity(qty, max),
        },
      ];
    }

    dispatch({ type: "SET_ITEMS", owner: owner!, payload: nextItems });
    await saveCart(nextItems);
  };

  const updateQuantity = async (id: string, quantity: number) => {
    requireLoadedCart();

    if (quantity <= 0) {
      const nextItems = state.items.filter((item) => item.id !== id);
      dispatch({ type: "SET_ITEMS", owner: owner!, payload: nextItems });
      await saveCart(nextItems);
      return;
    }

    const nextItems = state.items.map((item) => {
      if (item.id !== id) return item;

      const max = item.maxQty ?? item.stock;

      return {
        ...item,
        quantity: clampQuantity(quantity, max),
      };
    });

    dispatch({ type: "SET_ITEMS", owner: owner!, payload: nextItems });
    await saveCart(nextItems);
  };

  const removeItem = async (id: string) => {
    requireLoadedCart();

    const nextItems = state.items.filter((item) => item.id !== id);
    dispatch({ type: "SET_ITEMS", owner: owner!, payload: nextItems });
    await saveCart(nextItems);
  };

  const clearCart = async () => {
    requireLoadedCart();

    dispatch({ type: "SET_ITEMS", owner: owner!, payload: [] });
    dispatch({ type: "SET_COUPON", owner: owner!, payload: null });
    await storageRemoveItem(cartKey);
    await storageRemoveItem(couponKey);
  };

  const applyCoupon = async (code: string) => {
    requireLoadedCart();
    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode) {
      return { ok: false, message: "Ingresa un código de cupón." };
    }

    const coupons: Record<string, Coupon> = {
      BIENVENIDO10: {
        code: "BIENVENIDO10",
        type: "percent",
        value: 10,
        minSubtotal: 30,
      },
      ENVIOFREE: {
        code: "ENVIOFREE",
        type: "fixed",
        value: 6.99,
        minSubtotal: 50,
      },
      VIP20: {
        code: "VIP20",
        type: "percent",
        value: 20,
        minSubtotal: 120,
        appliesToCategory: "vip",
      },
    };

    const coupon = coupons[normalizedCode];

    if (!coupon) {
      return { ok: false, message: "Cupón inválido o no reconocido." };
    }

    if (coupon.expiresAt && Date.now() > coupon.expiresAt) {
      return { ok: false, message: "Este cupón ha expirado." };
    }

    if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
      return {
        ok: false,
        message: `Requiere mínimo $${coupon.minSubtotal.toFixed(
          2
        )} de subtotal.`,
      };
    }

    dispatch({ type: "SET_COUPON", owner: owner!, payload: coupon });

    await saveCoupon(coupon);

    return { ok: true, message: "Cupón aplicado." };
  };

  const removeCoupon = () => {
    requireLoadedCart();
    dispatch({ type: "SET_COUPON", owner: owner!, payload: null });
    void saveCoupon(null).catch(() => {});
  };

  const value: CartContextType = {
    user,
    items: state.items,
    loading: state.loading,
    syncing: state.syncing,
    totalItems,
    subtotal,
    discount,
    shipping,
    total,
    coupon: state.coupon,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    applyCoupon,
    removeCoupon,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart debe usarse dentro de CartProvider");
  }

  return context;
}
