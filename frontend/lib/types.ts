// ======================================================
// types.ts — Tipos globales FRONTEND (ENTERPRISE ULTRA)
// ======================================================

/* ======================================================
   PRIMITIVOS / UTILIDADES
====================================================== */
export type ID = string;
export type ISODateString = string; // "2026-02-18T12:34:56.000Z"
export type Money = number;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

/** Para meta flexible pero no "any" */
export type Meta = {
  page?: number;
  limit?: number;
  total?: number;
  pages?: number;
  [key: string]: JsonValue | undefined;
};

/** Error estándar (valida forms, backends, etc.) */
export type ApiErrorItem = {
  campo?: string;
  mensaje?: string;
  code?: string;
  [key: string]: JsonValue | undefined;
};

/* ======================================================
   API RESPONSE (NORMALIZADO)
====================================================== */
export type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
  meta?: Meta;
  errors?: ApiErrorItem[] | JsonValue;
};

/** Útil para endpoints que devuelven lista paginada */
export type Paginated<T> = {
  items: T[];
  meta?: Meta;
};

/* ======================================================
   USUARIO
====================================================== */
export type RolUsuario = "admin" | "user";

/**
 * Nota: backend a veces usa _id, a veces id.
 * Lo soportamos sin romper tipado.
 */
export type UsuarioBase = {
  _id?: ID;
  id?: ID;
  nombre: string;
  email: string;
  rol: RolUsuario;
};

export type Usuario = Required<Pick<UsuarioBase, "nombre" | "email" | "rol">> & {
  _id: ID; // en frontend lo tratamos como obligatorio
};

/** Helpers de tipado (por si algún endpoint manda "usuario" parcial) */
export type UsuarioRef = ID | UsuarioBase | Usuario;

/* ======================================================
   ESTADOS DE ORDEN
====================================================== */
export type EstadoPago = "pendiente" | "pagado" | "fallido" | "reembolsado";

export type EstadoFulfillment =
  | "pendiente"
  | "procesando"
  | "enviado"
  | "entregado"
  | "cancelado";

/* ======================================================
   HISTORIAL (AUDITORÍA ENTERPRISE)
====================================================== */
export type HistorialOrden = {
  estado: string;
  fecha: ISODateString;
  meta?: JsonObject; // evita any, sigue siendo flexible
};

/* ======================================================
   PRODUCTO / ITEM DE ORDEN
====================================================== */
export type TipoProducto = "marketplace" | "dropshipping" | "afiliado";

/**
 * En orden, a veces backend manda producto como:
 * - string (id)
 * - objeto parcial
 * - o null
 */
export type ProductoRef =
  | ID
  | {
      _id?: ID;
      id?: ID;
      nombre?: string;
      precio?: Money;
      [key: string]: JsonValue | undefined;
    }
  | null
  | undefined;

export type OrdenItem = {
  producto?: ProductoRef;
  nombre: string;
  cantidad: number;

  precioUnitario: Money;
  costoProveedorUnitario?: Money;

  subtotal: Money;
  ganancia?: Money;

  proveedor?: string;
  tipoProducto?: TipoProducto;
};

/* ======================================================
   STRIPE / PAGOS
====================================================== */
export type MetodoPago = "stripe" | "paypal" | "transferencia" | "contraentrega";

export type StripeInfo = {
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  stripeLatestEventId?: string;
};

/* ======================================================
   ORDEN
====================================================== */
export type Orden = {
  _id: ID;

  usuario: UsuarioRef;

  items: OrdenItem[];

  total: Money;
  totalCostoProveedor?: Money;
  gananciaTotal?: Money;

  metodoPago?: MetodoPago;
  paymentProvider?: string;
  moneda?: string;

  estadoPago: EstadoPago;
  estadoFulfillment: EstadoFulfillment;

  paymentStatusDetail?: string;

  // Stripe (separado para claridad)
  stripeSessionId?: StripeInfo["stripeSessionId"];
  stripePaymentIntentId?: StripeInfo["stripePaymentIntentId"];
  stripeLatestEventId?: StripeInfo["stripeLatestEventId"];

  paidAt?: ISODateString | null;
  failedAt?: ISODateString | null;
  refundedAt?: ISODateString | null;

  historial?: HistorialOrden[];

  createdAt: ISODateString;
  updatedAt: ISODateString;
};

/* ======================================================
   MÉTRICAS ADMIN
====================================================== */
export type AdminMetrics = {
  totalOrdenes: number;
  totalIngresos: Money;
  totalCostoProveedor: Money;
  totalGanancia: Money;

  pagadas: number;
  pendientes: number;
  fallidas: number;
  reembolsadas: number;
};

/* ======================================================
   TIPOS ÚTILES PARA UI
====================================================== */
export type LoadingState = "idle" | "loading" | "success" | "error";

/** Útil para normalizar si backend manda {id} o {_id} */
export function getId(x: { _id?: ID; id?: ID } | null | undefined): ID | null {
  return (x?._id || x?.id || null) as ID | null;
}