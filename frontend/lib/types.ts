// ======================================================
// types.ts — Tipos globales FRONTEND (Enterprise Final)
// ======================================================

/* ======================================================
   PRIMITIVOS / UTILIDADES
====================================================== */
export type ID = string;
export type ISODateString = string;
export type Money = number;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type Meta = {
  page?: number;
  limit?: number;
  total?: number;
  pages?: number;
  reqId?: string;
  from?: string | Date;
  to?: string | Date;
  days?: number;
  [key: string]: JsonValue | Date | undefined;
};

export type ApiErrorItem = {
  campo?: string;
  mensaje?: string;
  code?: string;
  [key: string]: JsonValue | undefined;
};

/* ======================================================
   API RESPONSE
====================================================== */
export type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
  meta?: Meta;
  errors?: ApiErrorItem[] | JsonValue;
};

export type Paginated<T> = {
  items: T[];
  meta?: Meta;
};

/* ======================================================
   AUTH / USUARIO
====================================================== */
export type RolUsuario = "admin" | "usuario" | "vendedor";

export type SellerStatus = "pending" | "approved" | "suspended" | null;

export type UsuarioBase = {
  _id?: ID;
  id?: ID;
  nombre: string;
  email: string;
  rol: RolUsuario;

  activo?: boolean;
  bloqueado?: boolean;
  emailVerificado?: boolean;

  sellerStatus?: SellerStatus;

  stripeAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;

  createdAt?: ISODateString;
  updatedAt?: ISODateString;
};

export type Usuario = UsuarioBase & {
  _id?: ID;
  id?: ID;
};

export type UsuarioRef = ID | UsuarioBase | Usuario;

export type AuthMeData = {
  usuario?: Usuario;
};

/* ======================================================
   ESTADOS DE ORDEN
====================================================== */
export type EstadoPago =
  | "pendiente"
  | "pagado"
  | "fallido"
  | "reembolsado"
  | "reembolsado_parcial";

export type EstadoFulfillment =
  | "pendiente"
  | "procesando"
  | "enviado"
  | "entregado"
  | "cancelado";

/* ======================================================
   HISTORIAL / AUDITORÍA
====================================================== */
export type HistorialOrden = {
  estado: string;
  fecha: ISODateString;
  source?: string;
  fingerprint?: string;
  meta?: JsonObject;
};

/* ======================================================
   PRODUCTO / ORDEN ITEM
====================================================== */
export type TipoProducto = "marketplace" | "dropshipping" | "afiliado";

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

  sellerType?: "platform" | "seller";
  vendedor?: ID | null;

  comisionPct?: number;
  comisionPorcentaje?: number;
  comisionMonto?: Money;

  netoVendedor?: Money;
  ingresoVendedor?: Money;
};

/* ======================================================
   PAGOS / STRIPE
====================================================== */
export type MetodoPago =
  | "stripe"
  | "paypal"
  | "transferencia"
  | "contraentrega";

export type StripeInfo = {
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  stripeLatestEventId?: string;
};

/* ======================================================
   PAYOUTS
====================================================== */
export type PayoutStatus =
  | "pendiente"
  | "procesando"
  | "pagado"
  | "fallido"
  | "bloqueado";

export type VendedorPayout = {
  vendedor: ID | UsuarioRef;
  stripeAccountId?: string;
  monto: Money;
  status: PayoutStatus;
  stripeTransferId?: string;
  stripeTransferGroup?: string;
  processingAt?: ISODateString | null;
  paidAt?: ISODateString | null;
  failedAt?: ISODateString | null;
  meta?: JsonObject | null;
};

export type PayoutMetrics = {
  totalRows: number;
  totalMonto: number;
  pendientes: number;
  procesando: number;
  pagados: number;
  fallidos: number;
  bloqueados: number;
  totalPendienteMonto: number;
  totalPagadoMonto: number;
  totalFallidoMonto: number;
  totalBloqueadoMonto?: number;
};

export type AdminPayoutRow = {
  ordenId: ID;
  orderNumber?: number;
  estadoPago?: EstadoPago;
  estadoFulfillment?: EstadoFulfillment;
  payoutPolicy?: string;
  payoutEligibleAt?: ISODateString | null;
  payoutReleasedAt?: ISODateString | null;
  payoutBlocked?: boolean;
  payoutBlockedReason?: string;
  moneda?: string;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
  vendedor?: {
    _id?: ID;
    nombre?: string;
    email?: string;
  };
  payout?: {
    monto?: Money;
    status?: PayoutStatus;
    stripeAccountId?: string;
    stripeTransferId?: string;
    stripeTransferGroup?: string;
    processingAt?: ISODateString | null;
    paidAt?: ISODateString | null;
    failedAt?: ISODateString | null;
    meta?: JsonObject | null;
  };
};

/* ======================================================
   ORDEN
====================================================== */
export type Orden = {
  _id: ID;
  orderNumber?: number;

  usuario: UsuarioRef;

  items: OrdenItem[];

  subtotal?: Money;
  shipping?: Money;
  tax?: Money;
  discount?: Money;

  total: Money;
  totalCostoProveedor?: Money;
  gananciaTotal?: Money;

  // compatibilidad con variantes de backend
  totalComisiones?: Money;
  totalNetoVendedores?: Money;
  comisionTotal?: Money;
  ingresoVendedorTotal?: Money;

  metodoPago?: MetodoPago;
  paymentProvider?: string;
  moneda?: string;

  estadoPago: EstadoPago;
  estadoFulfillment: EstadoFulfillment;

  paymentStatusDetail?: string;

  stripeSessionId?: StripeInfo["stripeSessionId"];
  stripePaymentIntentId?: StripeInfo["stripePaymentIntentId"];
  stripeLatestEventId?: StripeInfo["stripeLatestEventId"];

  paidAt?: ISODateString | null;
  failedAt?: ISODateString | null;
  refundedAt?: ISODateString | null;

  payoutPolicy?: string;
  payoutHoldDays?: number;
  payoutEligibleAt?: ISODateString | null;
  payoutReleasedAt?: ISODateString | null;
  payoutBlocked?: boolean;
  payoutBlockedReason?: string;

  vendedorPayouts?: VendedorPayout[];

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
   ANALYTICS ADMIN
====================================================== */
export type AdminAnalyticsOverview = {
  totalOrdenes: number;
  ingresosBrutos: Money;
  totalCostoProveedor: Money;
  totalGanancia: Money;
  totalComisiones: Money;
  totalNetoVendedores: Money;
  pagadas: number;
  pendientes: number;
  fallidas: number;
  reembolsadas: number;
  payoutsPendientes: number;
  payoutsPagados: number;
  payoutsFallidos: number;
  payoutsBloqueados: number;
};

export type AdminAnalyticsSeriesRow = {
  date: ISODateString;
  totalOrdenes: number;
  ingresos: Money;
  ganancia: Money;
  pagadas: number;
  pendientes: number;
  fallidas: number;
};

export type AdminAnalyticsTopProducto = {
  productoId?: ID;
  nombre: string;
  cantidadVendida: number;
  ingresos: Money;
  ganancia: Money;
};

export type AdminAnalyticsTopVendedor = {
  vendedorId?: ID;
  nombre: string;
  email: string;
  montoTotal: Money;
  payoutsCount: number;
  pagadosCount: number;
  pendientesCount: number;
  fallidosCount: number;
};

/* ======================================================
   UI
====================================================== */
export type LoadingState = "idle" | "loading" | "success" | "error";

/* ======================================================
   HELPERS
====================================================== */
export function getId(x: { _id?: ID; id?: ID } | null | undefined): ID | null {
  return x?._id || x?.id || null;
}

export function isAdmin(user: UsuarioBase | null | undefined): boolean {
  return user?.rol === "admin";
}

export function isSeller(user: UsuarioBase | null | undefined): boolean {
  return user?.rol === "vendedor";
}

export function isCustomer(user: UsuarioBase | null | undefined): boolean {
  return user?.rol === "usuario";
}