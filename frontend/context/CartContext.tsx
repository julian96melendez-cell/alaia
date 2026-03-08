"use client";

import { onAuthStateChanged, User } from "firebase/auth";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    setDoc,
    writeBatch,
} from "firebase/firestore";
import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useState,
} from "react";
import { auth } from "../firebase/firebaseConfig";

/* ───────────────────────── Tipos base ───────────────────────── */

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  color?: string;
  size?: string;
  category?: string;
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

interface CartState {
  items: CartItem[];
  loading: boolean;
  syncing: boolean;
  coupon: Coupon | null;
}

type CartAction =
  | { type: "SET_ITEMS"; payload: CartItem[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SYNCING"; payload: boolean }
  | { type: "SET_COUPON"; payload: Coupon | null }
  | { type: "RESET" };

interface CartContextType {
  user: User | null;
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
}

/* ───────────────────────── Constantes ───────────────────────── */

const CartContext = createContext<CartContextType | undefined>(undefined);

const db = getFirestore();

const LOCAL_CART_KEY = "ALAIA_GUEST_CART_V1";
const LOCAL_COUPON_KEY = "ALAIA_GUEST_COUPON_V1";

/* ───────────────────────── Storage helpers web-safe ───────────────────────── */

function isBrowser() {
  return typeof window !== "undefined";
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

/* ───────────────────────── Reducer ───────────────────────── */

const initialState: CartState = {
  items: [],
  loading: true,
  syncing: false,
  coupon: null,
};

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "SET_ITEMS":
      return { ...state, items: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SYNCING":
      return { ...state, syncing: action.payload };
    case "SET_COUPON":
      return { ...state, coupon: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

/* ───────────────────────── Helpers async ───────────────────────── */

async function saveGuestCart(items: CartItem[]) {
  try {
    await storageSetItem(LOCAL_CART_KEY, JSON.stringify(items));
  } catch {}
}

async function loadGuestCart(): Promise<CartItem[]> {
  try {
    const raw = await storageGetItem(LOCAL_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

async function clearGuestCart() {
  try {
    await storageRemoveItem(LOCAL_CART_KEY);
    await storageRemoveItem(LOCAL_COUPON_KEY);
  } catch {}
}

async function saveGuestCoupon(coupon: Coupon | null) {
  try {
    if (!coupon) {
      await storageRemoveItem(LOCAL_COUPON_KEY);
      return;
    }
    await storageSetItem(LOCAL_COUPON_KEY, JSON.stringify(coupon));
  } catch {}
}

async function loadGuestCoupon(): Promise<Coupon | null> {
  try {
    const raw = await storageGetItem(LOCAL_COUPON_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Coupon;
  } catch {
    return null;
  }
}

/* ───────────────────────── Helpers Firestore ───────────────────────── */

async function addItemInFirestore(
  uid: string,
  item: CartItem,
  qty: number
): Promise<void> {
  const itemRef = doc(db, "carts", uid, "items", item.id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);

    if (snap.exists()) {
      const current = snap.data() as CartItem;
      const currentQty = current.quantity || 0;
      let nextQty = currentQty + qty;

      const max = current.maxQty ?? item.maxQty ?? current.stock ?? item.stock;
      if (typeof max === "number" && max > 0) {
        nextQty = Math.min(nextQty, max);
      }

      tx.update(itemRef, {
        ...current,
        quantity: nextQty,
        updatedAt: serverTimestamp(),
      });
    } else {
      let nextQty = qty;
      const max = item.maxQty ?? item.stock;
      if (typeof max === "number" && max > 0) {
        nextQty = Math.min(nextQty, max);
      }

      tx.set(itemRef, {
        ...item,
        quantity: nextQty,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

async function updateQuantityInFirestore(
  uid: string,
  id: string,
  quantity: number
): Promise<void> {
  const itemRef = doc(db, "carts", uid, "items", id);

  if (quantity <= 0) {
    await deleteDoc(itemRef);
    return;
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) return;

    const current = snap.data() as CartItem;
    let nextQty = quantity;

    const max = current.maxQty ?? current.stock;
    if (typeof max === "number" && max > 0) {
      nextQty = Math.min(nextQty, max);
    }

    tx.update(itemRef, {
      quantity: nextQty,
      updatedAt: serverTimestamp(),
    });
  });
}

async function removeItemInFirestore(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "carts", uid, "items", id));
}

async function clearCartInFirestore(uid: string): Promise<void> {
  const colRef = collection(db, "carts", uid, "items");
  const snap = await getDocs(colRef);
  const batch = writeBatch(db);

  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function saveCouponInFirestore(uid: string, coupon: Coupon | null) {
  const couponRef = doc(db, "carts", uid, "meta", "coupon");

  if (!coupon) {
    await deleteDoc(couponRef).catch(() => {});
    return;
  }

  await setDoc(
    couponRef,
    {
      ...coupon,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function loadCouponFromFirestore(uid: string): Promise<Coupon | null> {
  const couponRef = doc(db, "carts", uid, "meta", "coupon");
  const snap = await getDoc(couponRef);
  if (!snap.exists()) return null;
  return snap.data() as Coupon;
}

/* ───────────────────────── Provider ───────────────────────── */

export const CartProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [state, dispatch] = useReducer(cartReducer, initialState);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let unsubCart: (() => void) | null = null;

    const setup = async () => {
      dispatch({ type: "SET_LOADING", payload: true });

      if (!user) {
        const [items, savedCoupon] = await Promise.all([
          loadGuestCart(),
          loadGuestCoupon(),
        ]);

        dispatch({ type: "SET_ITEMS", payload: items });
        dispatch({ type: "SET_COUPON", payload: savedCoupon });
        dispatch({ type: "SET_LOADING", payload: false });
        return;
      }

      dispatch({ type: "SET_SYNCING", payload: true });

      const guestItems = await loadGuestCart();
      if (guestItems.length > 0) {
        for (const it of guestItems) {
          await addItemInFirestore(user.uid, it, it.quantity || 1);
        }
        await clearGuestCart();
      }

      const savedCoupon = await loadCouponFromFirestore(user.uid);
      dispatch({ type: "SET_COUPON", payload: savedCoupon });

      const colRef = collection(db, "carts", user.uid, "items");
      unsubCart = onSnapshot(colRef, (snap) => {
        const list: CartItem[] = snap.docs.map((d) => d.data() as CartItem);
        dispatch({ type: "SET_ITEMS", payload: list });
        dispatch({ type: "SET_LOADING", payload: false });
        dispatch({ type: "SET_SYNCING", payload: false });
      });
    };

    setup();

    return () => {
      if (unsubCart) unsubCart();
    };
  }, [user]);

  /* ───────────────────────── Derivados ───────────────────────── */

  const totalItems = useMemo(
    () => state.items.reduce((acc, it) => acc + (it.quantity || 0), 0),
    [state.items]
  );

  const subtotal = useMemo(
    () =>
      state.items.reduce(
        (acc, it) => acc + (it.price || 0) * (it.quantity || 0),
        0
      ),
    [state.items]
  );

  const shipping = useMemo(
    () => (subtotal > 100 || subtotal === 0 ? 0 : 6.99),
    [subtotal]
  );

  const discount = useMemo(() => {
    const c = state.coupon;
    if (!c) return 0;
    if (c.minSubtotal && subtotal < c.minSubtotal) return 0;

    let baseAmount = subtotal;

    if (c.appliesToCategory) {
      baseAmount = state.items
        .filter(
          (it) =>
            it.category &&
            it.category.toLowerCase() === c.appliesToCategory!.toLowerCase()
        )
        .reduce((acc, it) => acc + it.price * (it.quantity || 0), 0);
    } else if (c.appliesToProductIds && c.appliesToProductIds.length > 0) {
      baseAmount = state.items
        .filter((it) => c.appliesToProductIds!.includes(it.id))
        .reduce((acc, it) => acc + it.price * (it.quantity || 0), 0);
    }

    if (baseAmount <= 0) return 0;

    const now = Date.now();
    if (c.expiresAt && now > c.expiresAt) return 0;

    const raw = c.type === "percent" ? (baseAmount * c.value) / 100 : c.value;
    return Math.min(raw, subtotal);
  }, [state.coupon, subtotal, state.items]);

  const total = useMemo(
    () => Math.max(0, subtotal - discount + shipping),
    [subtotal, discount, shipping]
  );

  /* ───────────────────────── API pública ───────────────────────── */

  const addItem = async (item: CartItem, qty: number = 1) => {
    if (user) {
      await addItemInFirestore(user.uid, item, qty);
      return;
    }

    const existing = state.items.find((it) => it.id === item.id);
    let nextItems: CartItem[];

    if (existing) {
      const max =
        existing.maxQty ?? existing.stock ?? item.maxQty ?? item.stock;
      const currentQty = existing.quantity || 0;
      let nextQty = currentQty + qty;

      if (typeof max === "number" && max > 0) {
        nextQty = Math.min(nextQty, max);
      }

      nextItems = state.items.map((it) =>
        it.id === item.id ? { ...it, quantity: nextQty } : it
      );
    } else {
      let nextQty = qty;
      const max = item.maxQty ?? item.stock;
      if (typeof max === "number" && max > 0) {
        nextQty = Math.min(nextQty, max);
      }
      nextItems = [...state.items, { ...item, quantity: nextQty }];
    }

    dispatch({ type: "SET_ITEMS", payload: nextItems });
    await saveGuestCart(nextItems);
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (user) {
      await updateQuantityInFirestore(user.uid, id, quantity);
      return;
    }

    if (quantity <= 0) {
      const next = state.items.filter((it) => it.id !== id);
      dispatch({ type: "SET_ITEMS", payload: next });
      await saveGuestCart(next);
      return;
    }

    const next = state.items.map((it) => {
      if (it.id !== id) return it;

      let nextQty = quantity;
      const max = it.maxQty ?? it.stock;
      if (typeof max === "number" && max > 0) {
        nextQty = Math.min(nextQty, max);
      }

      return { ...it, quantity: nextQty };
    });

    dispatch({ type: "SET_ITEMS", payload: next });
    await saveGuestCart(next);
  };

  const removeItem = async (id: string) => {
    if (user) {
      await removeItemInFirestore(user.uid, id);
      return;
    }

    const next = state.items.filter((it) => it.id !== id);
    dispatch({ type: "SET_ITEMS", payload: next });
    await saveGuestCart(next);
  };

  const clearCart = async () => {
    if (user) {
      await clearCartInFirestore(user.uid);
      return;
    }

    dispatch({ type: "SET_ITEMS", payload: [] });
    await clearGuestCart();
  };

  const applyCoupon = async (code: string) => {
    const normalized = code.trim().toUpperCase();

    if (!normalized) {
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

    const found = coupons[normalized];

    if (!found) {
      return { ok: false, message: "Cupón inválido o no reconocido." };
    }

    if (found.minSubtotal && subtotal < found.minSubtotal) {
      return {
        ok: false,
        message: `Requiere mínimo $${found.minSubtotal.toFixed(
          2
        )} de subtotal.`,
      };
    }

    const now = Date.now();
    if (found.expiresAt && now > found.expiresAt) {
      return { ok: false, message: "Este cupón ha expirado." };
    }

    dispatch({ type: "SET_COUPON", payload: found });

    if (user) {
      await saveCouponInFirestore(user.uid, found);
    } else {
      await saveGuestCoupon(found);
    }

    return { ok: true, message: "Cupón aplicado." };
  };

  const removeCoupon = () => {
    dispatch({ type: "SET_COUPON", payload: null });

    if (user) {
      saveCouponInFirestore(user.uid, null).catch(() => {});
    } else {
      saveGuestCoupon(null).catch(() => {});
    }
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
};

/* ───────────────────────── Hook ───────────────────────── */

export const useCart = (): CartContextType => {
  const ctx = useContext(CartContext);

  if (!ctx) {
    throw new Error("useCart debe usarse dentro de CartProvider");
  }

  return ctx;
};