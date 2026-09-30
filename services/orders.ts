import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export type OrderStatus =
  | "pendiente_pago"
  | "confirmada"
  | "en_preparacion"
  | "en_camino"
  | "entregada"
  | "cancelada";

export type PaymentStatus =
  | "pendiente"
  | "autorizado"
  | "pagado"
  | "fallido"
  | "reembolsado";

export type PaymentMethod = "stripe" | "card" | "cash";

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
  category?: string | null;
};

export type CreateOrderPayload = {
  userId: string;
  userEmail?: string | null;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  stripePaymentIntentId?: string | null;
  shippingAddress?: {
    name?: string;
    phone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
};

export type AppOrder = {
  id: string;
  orderId: string;
  userId: string;
  userEmail?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  stripePaymentIntentId?: string | null;
  stripeLatestEventId?: string | null;
  items: Array<OrderItem & { lineTotal: number }>;
  itemsCount: number;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  shippingAddress?: CreateOrderPayload["shippingAddress"];
  tracking: {
    currentStep: OrderStatus;
    history: Array<{
      status: OrderStatus;
      title: string;
      description: string;
      createdAt: string;
    }>;
  };
  createdAt?: any;
  updatedAt?: any;
};

function cleanMoney(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function createOrderId() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

  const random = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `ORD-${stamp}-${random}`;
}

function normalizeItems(items: OrderItem[]) {
  return items.map((item) => {
    const price = cleanMoney(item.price);
    const quantity = Math.max(1, Number(item.quantity || 1));

    if (!item.id) throw new Error("Uno de los productos no tiene ID válido.");
    if (!item.name?.trim()) throw new Error("Uno de los productos no tiene nombre válido.");
    if (price <= 0) throw new Error(`El producto "${item.name}" tiene un precio inválido.`);

    return {
      id: String(item.id),
      name: String(item.name).trim(),
      price,
      quantity,
      image: item.image || null,
      category: item.category || null,
      lineTotal: cleanMoney(price * quantity),
    };
  });
}

function validateTotals(
  payload: CreateOrderPayload,
  items: ReturnType<typeof normalizeItems>
) {
  const subtotalFromItems = cleanMoney(
    items.reduce((acc, item) => acc + item.lineTotal, 0)
  );

  const subtotal = cleanMoney(payload.subtotal);
  const tax = cleanMoney(payload.tax);
  const shipping = cleanMoney(payload.shipping);
  const discount = cleanMoney(payload.discount);
  const total = cleanMoney(payload.total);

  const expectedTotal = cleanMoney(subtotal + tax + shipping - discount);

  if (subtotal <= 0) throw new Error("El subtotal de la orden no es válido.");
  if (total <= 0) throw new Error("El total de la orden no es válido.");

  if (Math.abs(subtotalFromItems - subtotal) > 0.05) {
    throw new Error("El subtotal no coincide con los productos del carrito.");
  }

  if (Math.abs(expectedTotal - total) > 0.05) {
    throw new Error("El total no coincide con el resumen de la orden.");
  }

  return { subtotal, tax, shipping, discount, total };
}

function validateOrder(payload: CreateOrderPayload) {
  if (!payload.userId?.trim()) {
    throw new Error("Usuario no válido para crear la orden.");
  }

  if (!payload.items?.length) {
    throw new Error("No hay productos en el carrito.");
  }

  if (!payload.paymentMethod) {
    throw new Error("Debes indicar un método de pago válido.");
  }
}

function normalizeOrderSnap(snap: any): AppOrder {
  return {
    id: snap.id,
    ...(snap.data() as Omit<AppOrder, "id">),
  };
}

export async function createOrder(payload: CreateOrderPayload) {
  validateOrder(payload);

  const items = normalizeItems(payload.items);
  const totals = validateTotals(payload, items);
  const orderId = createOrderId();

  const status: OrderStatus = "pendiente_pago";
  const paymentStatus: PaymentStatus = "pendiente";

  const trackingHistory = [
    {
      status: "pendiente_pago" as OrderStatus,
      title: "Orden creada",
      description:
        payload.paymentMethod === "stripe"
          ? "Tu orden fue creada y está esperando confirmación de Stripe."
          : "Tu orden fue creada correctamente y está pendiente de pago.",
      createdAt: new Date().toISOString(),
    },
  ];

  const orderData = {
    orderId,
    userId: payload.userId,
    userEmail: payload.userEmail || null,

    status,
    paymentStatus,
    paymentMethod: payload.paymentMethod,
    stripePaymentIntentId: payload.stripePaymentIntentId || null,
    stripeLatestEventId: null,

    items,
    itemsCount: items.reduce((acc, item) => acc + item.quantity, 0),

    subtotal: totals.subtotal,
    tax: totals.tax,
    shipping: totals.shipping,
    discount: totals.discount,
    total: totals.total,

    shippingAddress: payload.shippingAddress || null,

    tracking: {
      currentStep: status,
      history: trackingHistory,
    },

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const globalOrderRef = doc(db, "orders", orderId);
  const userOrderRef = doc(db, "users", payload.userId, "orders", orderId);

  const batch = writeBatch(db);

  batch.set(globalOrderRef, {
    ...orderData,
    source: "global_order",
  });

  batch.set(userOrderRef, {
    ...orderData,
    source: "user_order",
  });

  await batch.commit();

  return {
    id: orderId,
    ...orderData,
  };
}

export async function getOrderById(orderId: string) {
  if (!orderId?.trim()) throw new Error("ID de orden requerido.");

  const ref = doc(db, "orders", orderId.trim());
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error("Orden no encontrada.");

  return normalizeOrderSnap(snap);
}

export async function getUserOrderById(userId: string, orderId: string) {
  if (!userId?.trim()) throw new Error("Usuario requerido.");
  if (!orderId?.trim()) throw new Error("ID de orden requerido.");

  const ref = doc(db, "users", userId.trim(), "orders", orderId.trim());
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("Orden no encontrada para este usuario.");
  }

  return normalizeOrderSnap(snap);
}

export async function getUserOrders(userId: string, max = 50) {
  if (!userId?.trim()) throw new Error("Usuario requerido.");

  const ref = collection(db, "users", userId.trim(), "orders");
  const q = query(ref, orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);

  return snap.docs.map(normalizeOrderSnap);
}

export function subscribeUserOrders(
  userId: string,
  callback: (orders: AppOrder[]) => void,
  onError?: (error: Error) => void
) {
  if (!userId?.trim()) {
    throw new Error("Usuario requerido.");
  }

  const ref = collection(db, "users", userId.trim(), "orders");
  const q = query(ref, orderBy("createdAt", "desc"), limit(50));

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map(normalizeOrderSnap));
    },
    (error) => {
      onError?.(error as Error);
    }
  );
}

export function subscribeOrderById(
  orderId: string,
  callback: (order: AppOrder | null) => void,
  onError?: (error: Error) => void
) {
  if (!orderId?.trim()) {
    throw new Error("ID de orden requerido.");
  }

  const ref = doc(db, "orders", orderId.trim());

  return onSnapshot(
    ref,
    (snap) => {
      callback(snap.exists() ? normalizeOrderSnap(snap) : null);
    },
    (error) => {
      onError?.(error as Error);
    }
  );
}

export function subscribeUserOrderById(
  userId: string,
  orderId: string,
  callback: (order: AppOrder | null) => void,
  onError?: (error: Error) => void
) {
  if (!userId?.trim()) throw new Error("Usuario requerido.");
  if (!orderId?.trim()) throw new Error("ID de orden requerido.");

  const ref = doc(db, "users", userId.trim(), "orders", orderId.trim());

  return onSnapshot(
    ref,
    (snap) => {
      callback(snap.exists() ? normalizeOrderSnap(snap) : null);
    },
    (error) => {
      onError?.(error as Error);
    }
  );
}