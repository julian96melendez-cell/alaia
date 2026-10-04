import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";

import { auth, db } from "../firebase/firebaseConfig";

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
  items: CartItem[];
  loading: boolean;
  syncing: boolean;
  coupon: Coupon | null;
};

type CartAction =
  | { type: "SET_ITEMS"; payload: CartItem[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SYNCING"; payload: boolean }
  | { type: "SET_COUPON"; payload: Coupon | null }
  | { type: "RESET" };

type CartContextType = {
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
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const LOCAL_CART_KEY = "ALAIA_GUEST_CART_V1";
const LOCAL_COUPON_KEY = "ALAIA_GUEST_COUPON_V1";

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

function normalizeItem(item: Partial<CartItem>, qty?: number): CartItem {
  const quantity = Math.max(1, Number(qty ?? item.quantity ?? 1) || 1);
  const price = Math.max(0, Number(item.price ?? 0) || 0);

  return {
    id: String(item.id || ""),
    name: String(item.name || "Producto"),
    price,
    quantity,
    image: item.image ?? null,
    color: item.color ?? null,
    size: item.size ?? null,
    category: item.category ?? null,
    ...(typeof item.maxQty === "number" && Number.isFinite(item.maxQty)
      ? { maxQty: item.maxQty } : {}),
    ...(typeof item.stock === "number" && Number.isFinite(item.stock)
      ? { stock: item.stock } : {}),
  };
}

function clampQuantity(item: CartItem, quantity: number) {
  let nextQty = Math.max(0, Number(quantity) || 0);
  const max = item.maxQty ?? item.stock;

  if (typeof max === "number" && max > 0) {
    nextQty = Math.min(nextQty, max);
  }

  return nextQty;
}

async function saveGuestCart(items: CartItem[]) {
  await AsyncStorage.setItem(
    LOCAL_CART_KEY,
    JSON.stringify(items.map((item) => normalizeItem(item)))
  );
}

async function loadGuestCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_CART_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item?.id)
      .map((item) => normalizeItem(item));
  } catch {
    return [];
  }
}

async function clearGuestCart() {
  await AsyncStorage.multiRemove([LOCAL_CART_KEY, LOCAL_COUPON_KEY]);
}

async function saveGuestCoupon(coupon: Coupon | null) {
  if (!coupon) {
    await AsyncStorage.removeItem(LOCAL_COUPON_KEY);
    return;
  }

  await AsyncStorage.setItem(LOCAL_COUPON_KEY, JSON.stringify(coupon));
}

async function loadGuestCoupon(): Promise<Coupon | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_COUPON_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Coupon;
    if (!parsed?.code || !parsed?.type) return null;

    return parsed;
  } catch {
    return null;
  }
}

function assertFirebaseReady() {
  if (!auth || !db) {
    throw new Error("Firebase no está inicializado correctamente.");
  }
}

async function addItemInFirestore(uid: string, item: CartItem, qty: number) {
  assertFirebaseReady();

  const cleanItem = normalizeItem(item, qty);
  const itemRef = doc(db, "carts", uid, "items", cleanItem.id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);

    if (snap.exists()) {
      const current = normalizeItem({
        ...(snap.data() as CartItem),
        id: cleanItem.id,
      });

      const nextQty = clampQuantity(
        { ...current, ...cleanItem },
        Number(current.quantity || 0) + qty
      );

      tx.update(itemRef, {
        ...current,
        ...cleanItem,
        quantity: nextQty,
        updatedAt: serverTimestamp(),
      });

      return;
    }

    tx.set(itemRef, {
      ...cleanItem,
      quantity: clampQuantity(cleanItem, cleanItem.quantity),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

async function updateQuantityInFirestore(
  uid: string,
  id: string,
  quantity: number
) {
  assertFirebaseReady();

  const itemRef = doc(db, "carts", uid, "items", id);

  if (quantity <= 0) {
    await deleteDoc(itemRef);
    return;
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) return;

    const current = normalizeItem({
      ...(snap.data() as CartItem),
      id,
    });

    const nextQty = clampQuantity(current, quantity);

    if (nextQty <= 0) {
      tx.delete(itemRef);
      return;
    }

    tx.update(itemRef, {
      quantity: nextQty,
      updatedAt: serverTimestamp(),
    });
  });
}

async function removeItemInFirestore(uid: string, id: string) {
  assertFirebaseReady();
  await deleteDoc(doc(db, "carts", uid, "items", id));
}

async function clearCartInFirestore(uid: string) {
  assertFirebaseReady();

  const colRef = collection(db, "carts", uid, "items");
  const snap = await getDocs(colRef);

  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function saveCouponInFirestore(uid: string, coupon: Coupon | null) {
  assertFirebaseReady();

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
  assertFirebaseReady();

  const couponRef = doc(db, "carts", uid, "meta", "coupon");
  const snap = await getDoc(couponRef);

  if (!snap.exists()) return null;

  const data = snap.data() as Coupon;
  if (!data?.code || !data?.type) return null;

  return data;
}

function calculateDiscount(
  coupon: Coupon | null,
  items: CartItem[],
  subtotal: number
) {
  if (!coupon) return 0;
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) return 0;
  if (coupon.expiresAt && Date.now() > coupon.expiresAt) return 0;

  let baseAmount = subtotal;

  if (coupon.appliesToCategory) {
    baseAmount = items
      .filter(
        (item) =>
          item.category?.toLowerCase() ===
          coupon.appliesToCategory?.toLowerCase()
      )
      .reduce((acc, item) => acc + item.price * item.quantity, 0);
  }

  if (coupon.appliesToProductIds?.length) {
    baseAmount = items
      .filter((item) => coupon.appliesToProductIds?.includes(item.id))
      .reduce((acc, item) => acc + item.price * item.quantity, 0);
  }

  if (baseAmount <= 0) return 0;

  const raw =
    coupon.type === "percent"
      ? (baseAmount * Number(coupon.value || 0)) / 100
      : Number(coupon.value || 0);

  return Math.max(0, Math.min(raw, subtotal));
}

export function CartProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [state, dispatch] = useReducer(cartReducer, initialState);

  useEffect(() => {
    if (!auth) {
      console.log("CART AUTH ERROR: auth is undefined");
      setUser(null);
      setAuthReady(true);
      dispatch({ type: "SET_LOADING", payload: false });
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
      },
      (error) => {
        console.log("CART AUTH STATE ERROR:", error);
        setUser(null);
        setAuthReady(true);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authReady) return;

    let unsubscribeCart: (() => void) | null = null;
    let cancelled = false;

    async function setupCart() {
      dispatch({ type: "SET_LOADING", payload: true });

      try {
        if (!user?.uid || !db) {
          const [items, savedCoupon] = await Promise.all([
            loadGuestCart(),
            loadGuestCoupon(),
          ]);

          if (cancelled) return;

          dispatch({ type: "SET_ITEMS", payload: items });
          dispatch({ type: "SET_COUPON", payload: savedCoupon });
          dispatch({ type: "SET_LOADING", payload: false });
          dispatch({ type: "SET_SYNCING", payload: false });
          return;
        }

        dispatch({ type: "SET_SYNCING", payload: true });

        const guestItems = await loadGuestCart();

        if (guestItems.length > 0) {
          for (const item of guestItems) {
            await addItemInFirestore(user.uid, item, item.quantity || 1);
          }

          await clearGuestCart();
        }

        const savedCoupon = await loadCouponFromFirestore(user.uid);

        if (!cancelled) {
          dispatch({ type: "SET_COUPON", payload: savedCoupon });
        }

        const cartItemsRef = collection(db, "carts", user.uid, "items");

        unsubscribeCart = onSnapshot(
          cartItemsRef,
          (snap) => {
            if (cancelled) return;

            const list = snap.docs.map((d) =>
              normalizeItem({
                ...(d.data() as CartItem),
                id: d.id,
              })
            );

            dispatch({ type: "SET_ITEMS", payload: list });
            dispatch({ type: "SET_LOADING", payload: false });
            dispatch({ type: "SET_SYNCING", payload: false });
          },
          (error) => {
            console.log("CART SNAPSHOT ERROR:", error);

            if (cancelled) return;

            dispatch({ type: "SET_LOADING", payload: false });
            dispatch({ type: "SET_SYNCING", payload: false });
          }
        );
      } catch (error) {
        console.log("CART SETUP ERROR:", error);

        if (cancelled) return;

        dispatch({ type: "SET_LOADING", payload: false });
        dispatch({ type: "SET_SYNCING", payload: false });
      }
    }

    setupCart();

    return () => {
      cancelled = true;
      if (unsubscribeCart) unsubscribeCart();
    };
  }, [authReady, user?.uid]);

  const totalItems = useMemo(
    () => state.items.reduce((acc, item) => acc + Number(item.quantity || 0), 0),
    [state.items]
  );

  const subtotal = useMemo(
    () =>
      state.items.reduce(
        (acc, item) =>
          acc + Number(item.price || 0) * Number(item.quantity || 0),
        0
      ),
    [state.items]
  );

  const shipping = useMemo(
    () => (subtotal > 100 || subtotal === 0 ? 0 : 6.99),
    [subtotal]
  );

  const discount = useMemo(
    () => calculateDiscount(state.coupon, state.items, subtotal),
    [state.coupon, state.items, subtotal]
  );

  const total = useMemo(
    () => Math.max(0, subtotal - discount + shipping),
    [subtotal, discount, shipping]
  );

  const addItem = useCallback(
    async (item: CartItem, qty: number = 1) => {
      const cleanItem = normalizeItem(item, qty);

      if (user?.uid && db) {
        await addItemInFirestore(user.uid, cleanItem, qty);
        return;
      }

      const existing = state.items.find((it) => it.id === cleanItem.id);

      let nextItems: CartItem[];

      if (existing) {
        const nextQty = clampQuantity(
          { ...existing, ...cleanItem },
          Number(existing.quantity || 0) + qty
        );

        nextItems = state.items.map((it) =>
          it.id === cleanItem.id
            ? { ...it, ...cleanItem, quantity: nextQty }
            : it
        );
      } else {
        nextItems = [
          ...state.items,
          {
            ...cleanItem,
            quantity: clampQuantity(cleanItem, cleanItem.quantity),
          },
        ];
      }

      dispatch({ type: "SET_ITEMS", payload: nextItems });
      await saveGuestCart(nextItems);
    },
    [state.items, user?.uid]
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      if (user?.uid && db) {
        await updateQuantityInFirestore(user.uid, id, quantity);
        return;
      }

      if (quantity <= 0) {
        const next = state.items.filter((item) => item.id !== id);
        dispatch({ type: "SET_ITEMS", payload: next });
        await saveGuestCart(next);
        return;
      }

      const next = state.items.map((item) => {
        if (item.id !== id) return item;

        return {
          ...item,
          quantity: clampQuantity(item, quantity),
        };
      });

      dispatch({ type: "SET_ITEMS", payload: next });
      await saveGuestCart(next);
    },
    [state.items, user?.uid]
  );

  const removeItem = useCallback(
    async (id: string) => {
      if (user?.uid && db) {
        await removeItemInFirestore(user.uid, id);
        return;
      }

      const next = state.items.filter((item) => item.id !== id);
      dispatch({ type: "SET_ITEMS", payload: next });
      await saveGuestCart(next);
    },
    [state.items, user?.uid]
  );

  const clearCart = useCallback(async () => {
    if (user?.uid && db) {
      await clearCartInFirestore(user.uid);
      await saveCouponInFirestore(user.uid, null);
    }

    dispatch({ type: "SET_ITEMS", payload: [] });
    dispatch({ type: "SET_COUPON", payload: null });
    await clearGuestCart();
  }, [user?.uid]);

  const applyCoupon = useCallback(
    async (code: string) => {
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

      if (found.expiresAt && Date.now() > found.expiresAt) {
        return { ok: false, message: "Este cupón ha expirado." };
      }

      dispatch({ type: "SET_COUPON", payload: found });

      if (user?.uid && db) {
        await saveCouponInFirestore(user.uid, found);
      } else {
        await saveGuestCoupon(found);
      }

      return { ok: true, message: "Cupón aplicado." };
    },
    [subtotal, user?.uid]
  );

  const removeCoupon = useCallback(() => {
    dispatch({ type: "SET_COUPON", payload: null });

    if (user?.uid && db) {
      saveCouponInFirestore(user.uid, null).catch(() => {});
    } else {
      saveGuestCoupon(null).catch(() => {});
    }
  }, [user?.uid]);

  const value = useMemo<CartContextType>(
    () => ({
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
    }),
    [
      user,
      state.items,
      state.loading,
      state.syncing,
      state.coupon,
      totalItems,
      subtotal,
      discount,
      shipping,
      total,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      applyCoupon,
      removeCoupon,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);

  if (!ctx) {
    throw new Error("useCart debe usarse dentro de CartProvider");
  }

  return ctx;
}