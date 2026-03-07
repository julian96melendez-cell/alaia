/**
 * Orden.js (TAICHIGO FULL / Production-grade) — ULTRA PRO (MAX) + ✅ MODO A (ESCROW ULTRA SEGURO)
 * ------------------------------------------------------------
 * ✅ Mantiene TODO lo que tú enviaste
 * ✅ NO rompe compatibilidad: solo añade campos / helpers / índices nuevos
 *
 * ✅ MODO A (RECOMENDADO — MÁXIMA SEGURIDAD / BLINDAJE):
 * - Los payouts a vendedores NO se consideran “elegibles” al pagarse.
 * - Se consideran elegibles SOLO cuando:
 *    1) estadoPago === "pagado"
 *    2) estadoFulfillment === "entregado"
 *    3) y pasan N días de hold (PAYOUT_HOLD_DAYS) -> ventana anti-fraude/chargeback
 * - Esto te protege de:
 *    - fraude
 *    - contracargos
 *    - reembolsos tardíos
 *    - disputas
 *
 * 🧩 Lo que habilita este modelo:
 * - Un CRON/worker puede buscar órdenes “payout eligible” y ejecutar Stripe Connect Transfers.
 * - El modelo deja todo preparado con timestamps + status por vendedor + bloqueo automático.
 */

"use strict";

const mongoose = require("mongoose");
const Counter = require("./Counter");

// ============================================================
// Utils
// ============================================================
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toStringSafe = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  return String(v);
};

const normalizeCurrency = (c) => {
  const cur = toStringSafe(c, "usd").trim().toLowerCase();
  return cur || "usd";
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nowDate() {
  return new Date();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d;
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = toStringSafe(v).trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ============================================================
// ✅ Comisiones (config)
// - Default por ENV: PLATFORM_COMMISSION_PCT
// - Puedes sobreescribir por item con item.comisionPorcentaje
// ============================================================
const DEFAULT_COMMISSION_PCT = clamp(
  toNumber(process.env.PLATFORM_COMMISSION_PCT, 0),
  0,
  100
);

function normalizePct(v, fallbackPct = DEFAULT_COMMISSION_PCT) {
  const n = toNumber(v, fallbackPct);
  return clamp(n, 0, 100);
}

// ============================================================
// ✅ MODO A (ESCROW) — Config de hold (seguridad)
// ============================================================
const DEFAULT_PAYOUT_HOLD_DAYS = clamp(
  toNumber(process.env.PAYOUT_HOLD_DAYS, 7), // recomendado 7–14
  0,
  60
);

// ============================================================
// Enums (Single Source of Truth)
// ============================================================
const ESTADOS_PAGO = Object.freeze([
  "pendiente",
  "pagado",
  "fallido",
  "reembolsado",
]);
const ESTADOS_FUL = Object.freeze([
  "pendiente",
  "procesando",
  "enviado",
  "entregado",
  "cancelado",
]);
const TIPOS_PRODUCTO = Object.freeze([
  "marketplace",
  "dropshipping",
  "afiliado",
]);
const METODOS_PAGO = Object.freeze([
  "stripe",
  "paypal",
  "transferencia",
  "contraentrega",
]);

const PROVEEDOR_PAGO = Object.freeze(["pendiente", "pagado"]);

// ✅ NUEVO: payouts por vendedor (snapshot)
const VENDEDOR_PAYOUT_STATUS = Object.freeze([
  "pendiente",
  "procesando",
  "pagado",
  "fallido",
  "bloqueado",
]);

// ✅ NUEVO: payout policy (modo A)
const PAYOUT_POLICY = Object.freeze([
  "escrow_delivered_hold", // ✅ MODO A
]);

// ============================================================
// State Machine (última línea de defensa)
// ============================================================
const PAGO_TRANSITIONS = {
  pendiente: new Set(["pendiente", "pagado", "fallido"]),
  pagado: new Set(["pagado", "reembolsado"]),
  fallido: new Set(["fallido", "pendiente"]),
  reembolsado: new Set(["reembolsado"]),
};

const FUL_TRANSITIONS = {
  pendiente: new Set(["pendiente", "procesando", "cancelado"]),
  procesando: new Set(["procesando", "enviado", "cancelado"]),
  enviado: new Set(["enviado", "entregado"]),
  entregado: new Set(["entregado"]),
  cancelado: new Set(["cancelado"]),
};

function canTransition(map, from, to) {
  const set = map[from];
  if (!set) return false;
  return set.has(to);
}

// ============================================================
// Subschemas
// ============================================================

/**
 * ITEM
 * - snapshot de compra
 * - recalcula subtotal/ganancia
 * ✅ comisiones por item (plataforma)
 * ✅ vendedor + sellerType (marketplace multi-vendor)
 */
const ItemSchema = new mongoose.Schema(
  {
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true,
      index: true,
    },

    // snapshot
    nombre: { type: String, required: true, trim: true },

    cantidad: { type: Number, required: true, min: 1 },

    precioUnitario: { type: Number, required: true, min: 0 },
    costoProveedorUnitario: { type: Number, required: true, min: 0 },

    proveedor: { type: String, required: true, trim: true, index: true },

    tipoProducto: {
      type: String,
      enum: TIPOS_PRODUCTO,
      required: true,
      index: true,
    },

    // ✅ para diferenciar producto de plataforma vs vendedor
    sellerType: {
      type: String,
      enum: ["platform", "seller"],
      default: "platform",
    },
    vendedor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
      index: true,
    },

    subtotal: { type: Number, required: true, min: 0 },
    ganancia: { type: Number, required: true },

    // ======================================================
    // ✅ COMISIONES
    // ======================================================
    comisionPorcentaje: {
      type: Number,
      default: DEFAULT_COMMISSION_PCT,
      min: 0,
      max: 100,
    },
    comisionMonto: { type: Number, default: 0, min: 0 },
    ingresoVendedor: { type: Number, default: 0 },
  },
  { _id: false }
);

ItemSchema.pre("validate", function () {
  const qty = Math.max(1, parseInt(this.cantidad, 10) || 1);
  const precio = toNumber(this.precioUnitario, 0);
  const costo = toNumber(this.costoProveedorUnitario, 0);

  this.cantidad = qty;
  this.precioUnitario = round2(Math.max(0, precio));
  this.costoProveedorUnitario = round2(Math.max(0, costo));

  this.subtotal = round2(qty * this.precioUnitario);
  this.ganancia = round2(this.subtotal - qty * this.costoProveedorUnitario);

  this.nombre = toStringSafe(this.nombre).trim();
  this.proveedor = toStringSafe(this.proveedor, "local").trim() || "local";

  // sellerType/vendedor normalización segura (NO rompe):
  const st = toStringSafe(this.sellerType, "platform").trim().toLowerCase();
  this.sellerType = st === "seller" ? "seller" : "platform";
  if (this.sellerType === "seller") {
    if (!this.vendedor || !isObjectId(this.vendedor)) {
      this.vendedor = null;
      this.sellerType = "platform";
    }
  } else {
    this.vendedor = null;
  }

  // ======================================================
  // ✅ COMISIONES (CÁLCULO CONSISTENTE)
  // - afiliado => comisión 0
  // ======================================================
  const tipo = toStringSafe(this.tipoProducto).trim().toLowerCase();
  const pct =
    tipo === "afiliado" ? 0 : normalizePct(this.comisionPorcentaje, DEFAULT_COMMISSION_PCT);

  this.comisionPorcentaje = round2(pct);

  const comision = round2(Math.max(0, (this.subtotal * pct) / 100));
  this.comisionMonto = comision;

  // ingreso “del vendedor”
  this.ingresoVendedor = round2(this.subtotal - this.comisionMonto);
});

/**
 * PROVEEDOR (agregado por proveedor único)
 */
const ProveedorSchema = new mongoose.Schema(
  {
    proveedor: { type: String, trim: true, default: "" },

    estadoPagoProveedor: {
      type: String,
      enum: PROVEEDOR_PAGO,
      default: "pendiente",
      index: true,
    },

    referenciaProveedor: { type: String, trim: true, default: "" },
    tracking: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

/**
 * ✅ VendedorPayout (snapshot por vendedor)
 */
const VendedorPayoutSchema = new mongoose.Schema(
  {
    vendedor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },
    stripeAccountId: { type: String, default: "", trim: true, index: true }, // snapshot

    monto: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: VENDEDOR_PAYOUT_STATUS,
      default: "pendiente",
      index: true,
    },

    stripeTransferId: { type: String, default: "", trim: true, index: true },
    stripeTransferGroup: { type: String, default: "", trim: true, index: true },

    processingAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },

    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

/**
 * HISTORIAL
 * - source + fingerprint para idempotencia
 */
const HistorialSchema = new mongoose.Schema(
  {
    estado: { type: String, required: true, trim: true },
    fecha: { type: Date, default: Date.now },

    source: { type: String, trim: true, default: "system", index: true },

    fingerprint: { type: String, trim: true, default: "" },

    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

// ============================================================
// Orden Schema
// ============================================================
const OrdenSchema = new mongoose.Schema(
  {
    // Human order number
    orderNumber: { type: Number, index: true },

    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    items: {
      type: [ItemSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "La orden debe contener al menos un producto",
      },
    },

    // ==============================
    // Breakdown totales
    // ==============================
    subtotal: { type: Number, default: 0, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },

    total: { type: Number, required: true, min: 0 },
    totalCostoProveedor: { type: Number, required: true, min: 0 },
    gananciaTotal: { type: Number, required: true },

    // ✅ Comisiones
    comisionTotal: { type: Number, default: 0, min: 0 },
    ingresoVendedorTotal: { type: Number, default: 0 },

    // ✅ payouts por vendedor (multi-vendor)
    vendedorPayouts: { type: [VendedorPayoutSchema], default: [] },

    // ==============================
    // Pago / Provider
    // ==============================
    metodoPago: {
      type: String,
      enum: METODOS_PAGO,
      default: "stripe",
      index: true,
    },
    paymentProvider: {
      type: String,
      enum: METODOS_PAGO,
      default: "stripe",
      index: true,
    },

    moneda: { type: String, default: "usd", trim: true, lowercase: true, index: true },

    estadoPago: {
      type: String,
      enum: ESTADOS_PAGO,
      default: "pendiente",
      index: true,
    },
    estadoFulfillment: {
      type: String,
      enum: ESTADOS_FUL,
      default: "pendiente",
      index: true,
    },

    paymentStatusDetail: { type: String, trim: true, default: "" },

    paidAt: { type: Date, default: null, index: true },
    failedAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },

    // ==============================
    // Stripe fields
    // ==============================
    stripeSessionId: { type: String, trim: true, default: "" },
    stripePaymentIntentId: { type: String, trim: true, default: "" },
    stripeLatestEventId: { type: String, trim: true, default: "" },

    // auditoría monetaria
    stripeAmountTotal: { type: Number, default: 0 },
    stripeAmountReceived: { type: Number, default: 0 },
    stripeCustomerId: { type: String, trim: true, default: "" },

    // Ledger: últimos N event ids (idempotencia)
    stripeEventIds: { type: [String], default: [] },

    // ==============================
    // ✅ MODO A (ESCROW) — Payout Security Layer
    // ==============================
    payoutPolicy: {
      type: String,
      enum: PAYOUT_POLICY,
      default: "escrow_delivered_hold",
      index: true,
    },

    // Hold configurado en el momento de la orden (snapshot)
    payoutHoldDays: { type: Number, default: DEFAULT_PAYOUT_HOLD_DAYS, min: 0, max: 60 },

    // Cuándo la orden se vuelve elegible para payout (solo si pagada+entregada)
    payoutEligibleAt: { type: Date, default: null, index: true },

    // Marcadores operativos
    payoutReleasedAt: { type: Date, default: null, index: true },

    // Bloqueo de payouts por riesgo/reembolso/disputa
    payoutBlocked: { type: Boolean, default: false, index: true },
    payoutBlockedReason: { type: String, trim: true, default: "" },

    // ==============================
    // Proveedores agregados
    // ==============================
    proveedores: { type: [ProveedorSchema], default: [] },

    // ==============================
    // Dirección (snapshot)
    // ==============================
    direccionEntrega: {
      nombre: { type: String, trim: true, default: "" },
      direccion: { type: String, trim: true, default: "" },
      ciudad: { type: String, trim: true, default: "" },
      provincia: { type: String, trim: true, default: "" },
      pais: { type: String, trim: true, default: "" },
      codigoPostal: { type: String, trim: true, default: "" },
      telefono: { type: String, trim: true, default: "" },
    },

    // ==============================
    // Historial
    // ==============================
    historial: { type: [HistorialSchema], default: [] },
  },
  {
    timestamps: true,
    versionKey: "__v",
    optimisticConcurrency: true,
    minimize: false,
  }
);

// ============================================================
// Auto-increment orderNumber (Counter)
// ============================================================
async function nextOrderNumber() {
  const doc = await Counter.findOneAndUpdate(
    { key: "order" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();

  return doc.seq;
}

// ============================================================
// Helpers internos (historial / fingerprint / safe arrays)
// ============================================================
function ensureHistorialArray(doc) {
  if (!doc) return;
  if (!Array.isArray(doc.historial)) doc.historial = [];
}

function buildFingerprint({ estado, source, meta }) {
  const s = toStringSafe(source, "system").trim().toLowerCase();
  const e = toStringSafe(estado, "").trim().toLowerCase();
  let m = "";
  try {
    m = meta ? JSON.stringify(meta) : "";
  } catch {
    m = "";
  }
  return `${s}::${e}::${m}`.slice(0, 500);
}

function normalizeStripeId(v) {
  return toStringSafe(v, "").trim();
}

// ============================================================
// Agrupar payouts por vendedor desde items
// ============================================================
function buildVendedorPayoutsFromItems(items = [], prevPayouts = []) {
  const map = new Map(); // vendedorId -> monto
  for (const it of items || []) {
    if (toStringSafe(it.sellerType, "platform") !== "seller") continue;
    if (!it.vendedor) continue;
    const vid = String(it.vendedor);
    const monto = round2(toNumber(it.ingresoVendedor, 0));
    if (monto <= 0) continue;
    map.set(vid, round2((map.get(vid) || 0) + monto));
  }

  const prev = Array.isArray(prevPayouts) ? prevPayouts : [];
  const out = [];

  for (const [vendedorId, monto] of map.entries()) {
    const old = prev.find((p) => String(p?.vendedor) === String(vendedorId));
    out.push({
      vendedor: vendedorId,
      stripeAccountId: toStringSafe(old?.stripeAccountId, "").trim(),
      monto: round2(Math.max(0, monto)),
      status:
        old?.status && VENDEDOR_PAYOUT_STATUS.includes(old.status)
          ? old.status
          : "pendiente",
      stripeTransferId: toStringSafe(old?.stripeTransferId, "").trim(),
      stripeTransferGroup: toStringSafe(old?.stripeTransferGroup, "").trim(),
      processingAt: old?.processingAt || null,
      paidAt: old?.paidAt || null,
      failedAt: old?.failedAt || null,
      meta: old?.meta ?? null,
    });
  }

  return out;
}

function hasSellerItems(items = []) {
  return (items || []).some((it) => toStringSafe(it?.sellerType, "platform") === "seller" && it?.vendedor);
}

function shouldBlockPayoutByPaymentStatus(estadoPago) {
  return estadoPago === "reembolsado" || estadoPago === "fallido";
}

// ============================================================
// Validaciones y normalizaciones pre-validate (core consistency)
// ============================================================
OrdenSchema.pre("validate", async function () {
  // orderNumber solo al crear
  if (this.isNew && !this.orderNumber) {
    try {
      this.orderNumber = await nextOrderNumber();
    } catch {
      this.orderNumber = undefined;
    }
  }

  // Asegurar items array
  const items = Array.isArray(this.items) ? this.items : [];

  // subtotal desde items
  const subtotalItems = round2(items.reduce((acc, it) => acc + toNumber(it.subtotal, 0), 0));
  this.subtotal = Math.max(0, subtotalItems);

  // breakdown
  this.shipping = round2(Math.max(0, toNumber(this.shipping, 0)));
  this.tax = round2(Math.max(0, toNumber(this.tax, 0)));
  this.discount = round2(Math.max(0, toNumber(this.discount, 0)));

  // total final
  const computedTotal = round2(this.subtotal + this.shipping + this.tax - this.discount);
  this.total = Math.max(0, computedTotal);

  // costo proveedor
  this.totalCostoProveedor = round2(
    items.reduce((acc, it) => {
      const costoU = Math.max(0, toNumber(it.costoProveedorUnitario, 0));
      const qty = Math.max(1, toNumber(it.cantidad, 1));
      return acc + costoU * qty;
    }, 0)
  );

  // ganancia total
  this.gananciaTotal = round2(this.total - this.totalCostoProveedor);

  // totales comisiones
  const comisionTotal = round2(items.reduce((acc, it) => acc + toNumber(it.comisionMonto, 0), 0));
  const ingresoVendedorTotal = round2(items.reduce((acc, it) => acc + toNumber(it.ingresoVendedor, 0), 0));

  this.comisionTotal = Math.max(0, comisionTotal);
  this.ingresoVendedorTotal = ingresoVendedorTotal;

  // payouts por vendedor (multi-vendor)
  this.vendedorPayouts = buildVendedorPayoutsFromItems(items, this.vendedorPayouts);

  // Stripe strings
  this.stripeSessionId = normalizeStripeId(this.stripeSessionId);
  this.stripePaymentIntentId = normalizeStripeId(this.stripePaymentIntentId);
  this.stripeLatestEventId = normalizeStripeId(this.stripeLatestEventId);
  this.stripeCustomerId = normalizeStripeId(this.stripeCustomerId);

  // Auditoría monetaria safe
  this.stripeAmountTotal = Math.max(0, toNumber(this.stripeAmountTotal, 0));
  this.stripeAmountReceived = Math.max(0, toNumber(this.stripeAmountReceived, 0));

  // ledger stripeEventIds limitado + normalizado + único
  this.stripeEventIds = uniqStrings(this.stripeEventIds).slice(-50);

  // currency/provider consistency
  this.moneda = normalizeCurrency(this.moneda);

  if (!this.paymentProvider) this.paymentProvider = this.metodoPago || "stripe";
  if (!this.metodoPago) this.metodoPago = this.paymentProvider || "stripe";

  this.paymentStatusDetail = toStringSafe(this.paymentStatusDetail).trim();

  // payout config snapshot
  this.payoutHoldDays = clamp(toNumber(this.payoutHoldDays, DEFAULT_PAYOUT_HOLD_DAYS), 0, 60);
  if (!this.payoutPolicy) this.payoutPolicy = "escrow_delivered_hold";
  if (!PAYOUT_POLICY.includes(this.payoutPolicy)) this.payoutPolicy = "escrow_delivered_hold";

  // Sync proveedores[] desde items (un proveedor por nombre)
  const proveedoresSet = new Set(
    items.map((it) => toStringSafe(it.proveedor, "").trim()).filter(Boolean)
  );

  const existing = Array.isArray(this.proveedores) ? this.proveedores : [];
  const out = [];

  for (const p of proveedoresSet) {
    const found = existing.find((x) => toStringSafe(x.proveedor).trim() === p);
    out.push(found || { proveedor: p, estadoPagoProveedor: "pendiente", referenciaProveedor: "", tracking: "" });
  }

  for (const pr of out) {
    pr.proveedor = toStringSafe(pr.proveedor).trim();
    pr.referenciaProveedor = toStringSafe(pr.referenciaProveedor).trim();
    pr.tracking = toStringSafe(pr.tracking).trim();
    if (!PROVEEDOR_PAGO.includes(pr.estadoPagoProveedor)) pr.estadoPagoProveedor = "pendiente";
  }

  this.proveedores = out;

  // Sanitiza dirección
  if (this.direccionEntrega) {
    for (const k of ["nombre", "direccion", "ciudad", "provincia", "pais", "codigoPostal", "telefono"]) {
      this.direccionEntrega[k] = toStringSafe(this.direccionEntrega[k]).trim();
    }
  }
});

// ============================================================
// Métodos de instancia (Historial / Stripe ledger / helpers)
// ============================================================

/**
 * pushHistorial
 * - Inserta un evento de historial con idempotencia por fingerprint
 */
OrdenSchema.methods.pushHistorial = function (estado, meta = null, opts = {}) {
  ensureHistorialArray(this);

  const source = toStringSafe(opts.source, "system").trim() || "system";
  const fingerprint =
    toStringSafe(opts.fingerprint, "").trim() || buildFingerprint({ estado, source, meta });

  const last = this.historial[this.historial.length - 1];
  if (last && last.fingerprint && last.fingerprint === fingerprint) return false;

  this.historial.push({ estado, meta, source, fingerprint });
  return true;
};

/**
 * addStripeEventId
 * - Agrega eventId si no existe (idempotencia)
 */
OrdenSchema.methods.addStripeEventId = function (eventId) {
  const id = normalizeStripeId(eventId);
  if (!id) return false;

  if (!Array.isArray(this.stripeEventIds)) this.stripeEventIds = [];
  if (this.stripeEventIds.includes(id)) return false;

  this.stripeEventIds.push(id);
  this.stripeEventIds = this.stripeEventIds.slice(-50);
  return true;
};

OrdenSchema.methods.isPagada = function () {
  return this.estadoPago === "pagado";
};

OrdenSchema.methods.isCancelable = function () {
  return !["enviado", "entregado"].includes(this.estadoFulfillment);
};

OrdenSchema.methods.setPaymentDetail = function (detail, meta = null, source = "system") {
  this.paymentStatusDetail = toStringSafe(detail).trim();
  this.pushHistorial("payment_detail", meta || { detail: this.paymentStatusDetail }, { source });
};

/**
 * breakdown por vendedor (solo sellerType==='seller')
 */
OrdenSchema.methods.getBreakdownPorVendedor = function () {
  const out = {};
  const items = Array.isArray(this.items) ? this.items : [];
  for (const it of items) {
    if (toStringSafe(it.sellerType, "platform") !== "seller") continue;
    const vid = it.vendedor ? String(it.vendedor) : "";
    if (!vid) continue;
    if (!out[vid]) out[vid] = { monto: 0, itemsCount: 0 };
    out[vid].monto = round2(out[vid].monto + toNumber(it.ingresoVendedor, 0));
    out[vid].itemsCount += 1;
  }
  return out;
};

/**
 * ✅ MODO A: ¿La orden es elegible para payout?
 * Requisitos:
 * - pagada
 * - entregada
 * - NO bloqueada
 * - payoutEligibleAt <= now
 * - debe tener items de seller
 */
OrdenSchema.methods.isPayoutEligible = function () {
  if (this.payoutPolicy !== "escrow_delivered_hold") return false;
  if (this.payoutBlocked) return false;
  if (this.estadoPago !== "pagado") return false;
  if (this.estadoFulfillment !== "entregado") return false;

  const items = Array.isArray(this.items) ? this.items : [];
  if (!hasSellerItems(items)) return false;

  if (!this.payoutEligibleAt) return false;
  return new Date(this.payoutEligibleAt).getTime() <= Date.now();
};

/**
 * Cambiar status de payout por vendedor (safe)
 */
OrdenSchema.methods.setVendedorPayoutStatus = function (vendedorId, status, opts = {}) {
  const vid = toStringSafe(vendedorId, "").trim();
  if (!vid) throw new Error("vendedorId requerido");

  const st = toStringSafe(status, "").trim();
  if (!VENDEDOR_PAYOUT_STATUS.includes(st)) {
    throw new Error(`payout status inválido: ${st}`);
  }

  if (!Array.isArray(this.vendedorPayouts)) this.vendedorPayouts = [];
  const row = this.vendedorPayouts.find((p) => String(p.vendedor) === String(vid));
  if (!row) throw new Error("payout row no existe para este vendedor");

  const prev = row.status;
  row.status = st;

  if (st === "procesando") row.processingAt = row.processingAt || nowDate();
  if (st === "pagado") row.paidAt = row.paidAt || nowDate();
  if (st === "fallido") row.failedAt = row.failedAt || nowDate();

  if (isNonEmptyString(opts.stripeTransferId)) row.stripeTransferId = String(opts.stripeTransferId).trim();
  if (isNonEmptyString(opts.stripeTransferGroup)) row.stripeTransferGroup = String(opts.stripeTransferGroup).trim();

  this.pushHistorial(
    "vendedor_payout_update",
    { vendedorId: vid, from: prev, to: st, ...opts },
    { source: toStringSafe(opts.source, "system") }
  );

  return true;
};

/**
 * Reservar ledger en historial (idempotencia simple)
 */
OrdenSchema.methods.reserveLedger = function (ledgerKey, meta = null, source = "system") {
  const key = toStringSafe(ledgerKey, "").trim();
  if (!key) return false;

  ensureHistorialArray(this);

  const exists = this.historial.some((h) => h?.estado === key);
  if (exists) return false;

  this.historial.push({
    estado: key,
    fecha: nowDate(),
    source: toStringSafe(source, "system"),
    fingerprint: buildFingerprint({ estado: key, source, meta }),
    meta: meta || null,
  });

  return true;
};

/**
 * Actualiza estadoPago de forma segura (state machine + auditoría)
 */
OrdenSchema.methods.setEstadoPago = function (nuevoEstado, meta = null, source = "system") {
  const to = toStringSafe(nuevoEstado).trim();
  if (!ESTADOS_PAGO.includes(to)) throw new Error(`estadoPago inválido: ${to}`);

  const from = this.estadoPago;
  if (from && !canTransition(PAGO_TRANSITIONS, from, to)) {
    throw new Error(`Transición estadoPago inválida: ${from} -> ${to}`);
  }

  this.estadoPago = to;
  this.pushHistorial(`pago_${to}`, meta || { from, to }, { source });
  return true;
};

/**
 * Actualiza estadoFulfillment de forma segura
 */
OrdenSchema.methods.setEstadoFulfillment = function (nuevoEstado, meta = null, source = "system") {
  const to = toStringSafe(nuevoEstado).trim();
  if (!ESTADOS_FUL.includes(to)) throw new Error(`estadoFulfillment inválido: ${to}`);

  const from = this.estadoFulfillment;
  if (from && !canTransition(FUL_TRANSITIONS, from, to)) {
    throw new Error(`Transición fulfillment inválida: ${from} -> ${to}`);
  }

  this.estadoFulfillment = to;
  this.pushHistorial(`fulfillment_${to}`, meta || { from, to }, { source });
  return true;
};

/**
 * Marca proveedor como pagado
 */
OrdenSchema.methods.marcarProveedorPagado = function (proveedorNombre, referencia = "", meta = null, source = "system") {
  const p = toStringSafe(proveedorNombre).trim();
  if (!p) return false;

  if (!Array.isArray(this.proveedores)) this.proveedores = [];
  const row = this.proveedores.find((x) => toStringSafe(x.proveedor).trim() === p);
  if (!row) return false;

  row.estadoPagoProveedor = "pagado";
  if (referencia) row.referenciaProveedor = toStringSafe(referencia).trim();

  this.pushHistorial("proveedor_pagado", meta || { proveedor: p, referencia }, { source });
  return true;
};

/**
 * ✅ MODO A: bloquear payouts (por disputa / reembolso / riesgo)
 */
OrdenSchema.methods.blockPayouts = function (reason, meta = null, source = "system") {
  this.payoutBlocked = true;
  this.payoutBlockedReason = toStringSafe(reason).trim().slice(0, 300);

  // bloquea vendedores que no estén pagados
  if (Array.isArray(this.vendedorPayouts)) {
    for (const vp of this.vendedorPayouts) {
      if (vp && vp.status !== "pagado") vp.status = "bloqueado";
    }
  }

  this.pushHistorial("payouts_blocked", { reason: this.payoutBlockedReason, ...(meta || {}) }, { source });
  return true;
};

// ============================================================
// Hooks de estado (auditoría + timestamps + state machine)
// ============================================================

/**
 * Guardar prev states para state machine
 */
OrdenSchema.pre("init", function (doc) {
  this.$locals = this.$locals || {};
  this.$locals.prevEstadoPago = doc.estadoPago;
  this.$locals.prevEstadoFulfillment = doc.estadoFulfillment;
});

OrdenSchema.pre("save", function () {
  ensureHistorialArray(this);

  const items = Array.isArray(this.items) ? this.items : [];
  const hasSellers = hasSellerItems(items);

  // -----------------------------
  // estadoPago
  // -----------------------------
  if (this.isModified("estadoPago")) {
    const from = this.$locals?.prevEstadoPago ?? null;
    const to = this.estadoPago;

    if (from && !canTransition(PAGO_TRANSITIONS, from, to)) {
      throw new Error(`Transición estadoPago inválida: ${from} -> ${to}`);
    }

    this.pushHistorial(`pago_${to}`, { from, to }, { source: "system" });

    if (to === "pagado") {
      if (!this.paidAt) this.paidAt = nowDate();
      this.failedAt = null;
      this.refundedAt = null;
    } else if (to === "fallido") {
      if (!this.failedAt) this.failedAt = nowDate();
    } else if (to === "reembolsado") {
      if (!this.refundedAt) this.refundedAt = nowDate();
    }

    // ✅ MODO A: si se vuelve fallido/reembolsado => bloquear payouts
    if (shouldBlockPayoutByPaymentStatus(to) && hasSellers) {
      this.payoutBlocked = true;
      this.payoutBlockedReason = `payment_${to}`;
      for (const vp of this.vendedorPayouts || []) {
        if (vp && vp.status !== "pagado") vp.status = "bloqueado";
      }
      this.pushHistorial("payouts_blocked", { reason: this.payoutBlockedReason }, { source: "system" });
    }
  }

  // -----------------------------
  // estadoFulfillment
  // -----------------------------
  if (this.isModified("estadoFulfillment")) {
    const from = this.$locals?.prevEstadoFulfillment ?? null;
    const to = this.estadoFulfillment;

    if (from && !canTransition(FUL_TRANSITIONS, from, to)) {
      throw new Error(`Transición fulfillment inválida: ${from} -> ${to}`);
    }

    this.pushHistorial(`fulfillment_${to}`, { from, to }, { source: "system" });

    // ✅ MODO A: si se entrega y está pagada -> programar elegibilidad (hold)
    if (
      this.payoutPolicy === "escrow_delivered_hold" &&
      hasSellers &&
      to === "entregado" &&
      this.estadoPago === "pagado" &&
      !this.payoutBlocked
    ) {
      const holdDays = clamp(toNumber(this.payoutHoldDays, DEFAULT_PAYOUT_HOLD_DAYS), 0, 60);

      // Si no existía, lo fijamos. Si ya existe, no lo movemos (evita manipulación).
      if (!this.payoutEligibleAt) {
        this.payoutEligibleAt = addDays(nowDate(), holdDays);
        this.pushHistorial(
          "payouts_scheduled",
          { policy: this.payoutPolicy, holdDays, payoutEligibleAt: this.payoutEligibleAt },
          { source: "system" }
        );
      }
    }

    // ✅ Si cancelado: bloquear payouts (por seguridad)
    if (to === "cancelado" && hasSellers) {
      this.payoutBlocked = true;
      this.payoutBlockedReason = "fulfillment_cancelado";
      for (const vp of this.vendedorPayouts || []) {
        if (vp && vp.status !== "pagado") vp.status = "bloqueado";
      }
      this.pushHistorial("payouts_blocked", { reason: this.payoutBlockedReason }, { source: "system" });
    }
  }
});

// ============================================================
// Statics (consultas comunes / helpers)
// ============================================================

OrdenSchema.statics.findByOrderNumber = function (orderNumber) {
  const n = Number(orderNumber);
  if (!Number.isFinite(n)) return Promise.resolve(null);
  return this.findOne({ orderNumber: n });
};

OrdenSchema.statics.findByStripeSessionId = function (sessionId) {
  const id = normalizeStripeId(sessionId);
  if (!id) return Promise.resolve(null);
  return this.findOne({ stripeSessionId: id });
};

OrdenSchema.statics.findByStripePaymentIntentId = function (pi) {
  const id = normalizeStripeId(pi);
  if (!id) return Promise.resolve(null);
  return this.findOne({ stripePaymentIntentId: id });
};

/**
 * buscar órdenes por vendedor (multi-vendor)
 */
OrdenSchema.statics.findByVendedor = function (vendedorId, { limit = 50, skip = 0 } = {}) {
  const id = toStringSafe(vendedorId, "").trim();
  if (!id || !isObjectId(id)) return Promise.resolve([]);
  const lim = clamp(parseInt(limit, 10) || 50, 1, 200);
  const sk = Math.max(0, parseInt(skip, 10) || 0);

  return this.find({ "items.vendedor": id, "items.sellerType": "seller" })
    .sort({ createdAt: -1 })
    .skip(sk)
    .limit(lim);
};

/**
 * Búsqueda simple admin
 */
OrdenSchema.statics.searchAdmin = function (q, limit = 50) {
  const query = toStringSafe(q).trim();
  const lim = clamp(parseInt(limit, 10) || 50, 1, 200);

  if (!query) {
    return this.find({}).sort({ createdAt: -1 }).limit(lim);
  }

  const rx = new RegExp(escapeRegex(query), "i");
  const n = Number(query);

  const or = [
    { stripeSessionId: rx },
    { stripePaymentIntentId: rx },
    { stripeLatestEventId: rx },
    { "items.proveedor": rx },
    { "items.nombre": rx },
    { "vendedorPayouts.stripeTransferId": rx },
  ];

  if (Number.isFinite(n)) or.push({ orderNumber: n });

  return this.find({ $or: or }).sort({ createdAt: -1 }).limit(lim);
};

/**
 * ✅ MODO A: encontrar órdenes elegibles para payout (para CRON/worker)
 * - pagadas + entregadas + payoutEligibleAt <= now + no bloqueadas
 */
OrdenSchema.statics.findPayoutEligible = function ({ limit = 50, skip = 0 } = {}) {
  const lim = clamp(parseInt(limit, 10) || 50, 1, 200);
  const sk = Math.max(0, parseInt(skip, 10) || 0);

  return this.find({
    payoutPolicy: "escrow_delivered_hold",
    payoutBlocked: false,
    estadoPago: "pagado",
    estadoFulfillment: "entregado",
    payoutEligibleAt: { $ne: null, $lte: new Date() },
    "vendedorPayouts.status": { $in: ["pendiente", "fallido"] }, // lo que falta por pagar
  })
    .sort({ payoutEligibleAt: 1, createdAt: 1 })
    .skip(sk)
    .limit(lim);
};

// ============================================================
// Índices (PRO / escalabilidad)
// ============================================================

// Core timelines
OrdenSchema.index({ createdAt: -1 });
OrdenSchema.index({ usuario: 1, createdAt: -1 });
OrdenSchema.index({ estadoPago: 1, estadoFulfillment: 1, createdAt: -1 });

// Stripe lookups
OrdenSchema.index({ stripeSessionId: 1, createdAt: -1 });
OrdenSchema.index({ stripePaymentIntentId: 1 });
OrdenSchema.index({ stripeLatestEventId: 1 });

// Queries por pagos/moneda
OrdenSchema.index({ paidAt: -1 });
OrdenSchema.index({ moneda: 1, estadoPago: 1 });

// Soporte
OrdenSchema.index({ orderNumber: -1 });

// Analítica / proveedor
OrdenSchema.index({ "items.proveedor": 1, createdAt: -1 });

// Analítica vendedor / payouts
OrdenSchema.index({ "items.vendedor": 1, createdAt: -1 });
OrdenSchema.index({ "vendedorPayouts.vendedor": 1, "vendedorPayouts.status": 1, createdAt: -1 });
OrdenSchema.index({ "vendedorPayouts.stripeTransferId": 1 });

// ✅ MODO A: payout scheduling queries
OrdenSchema.index({ payoutPolicy: 1, payoutBlocked: 1, payoutEligibleAt: 1 });
OrdenSchema.index({ payoutEligibleAt: 1, payoutReleasedAt: 1 });

// Nota: no indexamos stripeEventIds como multikey por defecto.

// ============================================================
// Export
// ============================================================
module.exports = mongoose.model("Orden", OrdenSchema);