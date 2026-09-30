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

async function saveGuestCart(items: CartItem[]) {
  await storageSetItem(LOCAL_CART_KEY, JSON.stringify(items.map(cleanCartItem)));
}

async function loadGuestCart(): Promise<CartItem[]> {
  try {
    const raw = await storageGetItem(LOCAL_CART_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(cleanCartItem);
  } catch {
    return [];
  }
}

async function clearGuestCart() {
  await storageRemoveItem(LOCAL_CART_KEY);
  await storageRemoveItem(LOCAL_COUPON_KEY);
}

async function saveGuestCoupon(coupon: Coupon | null) {
  if (!coupon) {
    await storageRemoveItem(LOCAL_COUPON_KEY);
    return;
  }

  await storageSetItem(LOCAL_COUPON_KEY, JSON.stringify(coupon));
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

async function addItemInFirestore(uid: string, item: CartItem, qty: number) {
  const cleanItem = cleanCartItem(item);
  const itemRef = doc(db, "carts", uid, "items", cleanItem.id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);

    if (snap.exists()) {
      const current = cleanCartItem(snap.data() as CartItem);
      const max = current.maxQty ?? cleanItem.maxQty ?? current.stock ?? cleanItem.stock;
      const nextQty = clampQuantity((current.quantity || 0) + qty, max);

      tx.update(itemRef, {
        ...current,
        quantity: nextQty,
        updatedAt: serverTimestamp(),
      });

      return;
    }

    const max = cleanItem.maxQty ?? cleanItem.stock;
    const nextQty = clampQuantity(qty, max);

    tx.set(itemRef, {
      ...cleanItem,
      quantity: nextQty,
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
  const itemRef = doc(db, "carts", uid, "items", id);

  if (quantity <= 0) {
    await deleteDoc(itemRef);
    return;
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) return;

    const current = cleanCartItem(snap.data() as CartItem);
    const max = current.maxQty ?? current.stock;
    const nextQty = clampQuantity(quantity, max);

    tx.update(itemRef, {
      quantity: nextQty,
      updatedAt: serverTimestamp(),
    });
  });
}

async function removeItemInFirestore(uid: string, id: string) {
  await deleteDoc(doc(db, "carts", uid, "items", id));
}

async function clearCartInFirestore(uid: string) {
  const colRef = collection(db, "carts", uid, "items");
  const snap = await getDocs(colRef);

  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.forEach((item) => batch.delete(item.ref));
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

export function CartProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [state, dispatch] = useReducer(cartReducer, initialState);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let unsubscribeCart: (() => void) | null = null;
    let alive = true;

    async function setupCart() {
      dispatch({ type: "SET_LOADING", payload: true });

      try {
        if (!user?.uid) {
          const [guestItems, guestCoupon] = await Promise.all([
            loadGuestCart(),
            loadGuestCoupon(),
          ]);

          if (!alive) return;

          dispatch({ type: "SET_ITEMS", payload: guestItems });
          dispatch({ type: "SET_COUPON", payload: guestCoupon });
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

        if (!alive) return;

        dispatch({ type: "SET_COUPON", payload: savedCoupon });

        const cartItemsRef = collection(db, "carts", user.uid, "items");

        unsubscribeCart = onSnapshot(
          cartItemsRef,
          (snapshot) => {
           const items = snapshot.docs.map((itemDoc) =>
  cleanCartItem({
    ...(itemDoc.data() as CartItem),
    id: itemDoc.id,
  })
);

            dispatch({ type: "SET_ITEMS", payload: items });
            dispatch({ type: "SET_LOADING", payload: false });
            dispatch({ type: "SET_SYNCING", payload: false });
          },
          (error) => {
            console.log("CART SNAPSHOT ERROR:", error);
            dispatch({ type: "SET_LOADING", payload: false });
            dispatch({ type: "SET_SYNCING", payload: false });
          }
        );
      } catch (error) {
        console.log("CART SETUP ERROR:", error);

        if (!alive) return;

        dispatch({ type: "SET_LOADING", payload: false });
        dispatch({ type: "SET_SYNCING", payload: false });
      }
    }

    setupCart();

    return () => {
      alive = false;

      if (unsubscribeCart) {
        unsubscribeCart();
      }
    };
  }, [user?.uid]);

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

    if (user?.uid) {
      await addItemInFirestore(user.uid, cleanItem, qty);
      return;
    }

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

    dispatch({ type: "SET_ITEMS", payload: nextItems });
    await saveGuestCart(nextItems);
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (user?.uid) {
      await updateQuantityInFirestore(user.uid, id, quantity);
      return;
    }

    if (quantity <= 0) {
      const nextItems = state.items.filter((item) => item.id !== id);
      dispatch({ type: "SET_ITEMS", payload: nextItems });
      await saveGuestCart(nextItems);
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

    dispatch({ type: "SET_ITEMS", payload: nextItems });
    await saveGuestCart(nextItems);
  };

  const removeItem = async (id: string) => {
    if (user?.uid) {
      await removeItemInFirestore(user.uid, id);
      return;
    }

    const nextItems = state.items.filter((item) => item.id !== id);
    dispatch({ type: "SET_ITEMS", payload: nextItems });
    await saveGuestCart(nextItems);
  };

  const clearCart = async () => {
    if (user?.uid) {
      await clearCartInFirestore(user.uid);
      await saveCouponInFirestore(user.uid, null);
      dispatch({ type: "SET_COUPON", payload: null });
      return;
    }

    dispatch({ type: "SET_ITEMS", payload: [] });
    dispatch({ type: "SET_COUPON", payload: null });
    await clearGuestCart();
  };

  const applyCoupon = async (code: string) => {
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

    dispatch({ type: "SET_COUPON", payload: coupon });

    if (user?.uid) {
      await saveCouponInFirestore(user.uid, coupon);
    } else {
      await saveGuestCoupon(coupon);
    }

    return { ok: true, message: "Cupón aplicado." };
  };

  const removeCoupon = () => {
    dispatch({ type: "SET_COUPON", payload: null });

    if (user?.uid) {
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
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart debe usarse dentro de CartProvider");
  }

  return context;
}