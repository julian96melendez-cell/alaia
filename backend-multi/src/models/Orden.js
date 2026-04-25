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
// Config
// ============================================================
const DEFAULT_COMMISSION_PCT = clamp(
  toNumber(process.env.PLATFORM_COMMISSION_PCT, 0),
  0,
  100
);

const DEFAULT_PAYOUT_HOLD_DAYS = clamp(
  toNumber(process.env.PAYOUT_HOLD_DAYS, 7),
  0,
  60
);

// ============================================================
// Enums
// ============================================================
const PAYMENT_PROVIDERS = Object.freeze([
  "stripe",
  "paypal",
  "manual",
  "contraentrega",
]);

const ESTADOS_PAGO = Object.freeze([
  "pendiente",
  "pagado",
  "fallido",
  "reembolsado",
  "reembolsado_parcial",
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

const ESTADOS_PAGO_PROVEEDOR = Object.freeze([
  "pendiente",
  "pagado",
]);

const VENDEDOR_PAYOUT_STATUS = Object.freeze([
  "pendiente",
  "procesando",
  "pagado",
  "fallido",
  "bloqueado",
]);

const PAYOUT_POLICY = Object.freeze([
  "escrow_delivered_hold",
]);

// ============================================================
// State machine
// ============================================================
const PAGO_TRANSITIONS = {
  pendiente: new Set(["pendiente", "pagado", "fallido"]),
  pagado: new Set(["pagado", "reembolsado", "reembolsado_parcial"]),
  fallido: new Set(["fallido", "pendiente"]),
  reembolsado: new Set(["reembolsado"]),
  reembolsado_parcial: new Set(["reembolsado_parcial", "reembolsado"]),
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

function normalizePct(v, fallbackPct = DEFAULT_COMMISSION_PCT) {
  const n = toNumber(v, fallbackPct);
  return clamp(n, 0, 100);
}

function getItemSellerId(item) {
  return (
    item?.vendedor ||
    item?.vendedorId ||
    item?.sellerId ||
    null
  );
}

function getItemIngresoVendedor(item) {
  if (item?.ingresoVendedor !== undefined && item?.ingresoVendedor !== null) {
    return toNumber(item.ingresoVendedor, 0);
  }

  if (item?.netoVendedor !== undefined && item?.netoVendedor !== null) {
    return toNumber(item.netoVendedor, 0);
  }

  return 0;
}

// ============================================================
// Subschemas
// ============================================================

const ItemSchema = new mongoose.Schema(
  {
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true,
      index: true,
    },

    nombre: {
      type: String,
      required: true,
      trim: true,
    },

    cantidad: {
      type: Number,
      required: true,
      min: 1,
    },

    precioUnitario: {
      type: Number,
      required: true,
      min: 0,
    },

    costoProveedorUnitario: {
      type: Number,
      required: true,
      min: 0,
    },

    proveedor: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    tipoProducto: {
      type: String,
      enum: TIPOS_PRODUCTO,
      required: true,
      index: true,
    },

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

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    ganancia: {
      type: Number,
      required: true,
    },

    // Campo canon
    comisionPorcentaje: {
      type: Number,
      default: DEFAULT_COMMISSION_PCT,
      min: 0,
      max: 100,
    },

    comisionMonto: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Campo canon
    ingresoVendedor: {
      type: Number,
      default: 0,
    },
  },
  { _id: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Compatibilidad de nombres
ItemSchema.virtual("comisionPct")
  .get(function () {
    return this.comisionPorcentaje;
  })
  .set(function (value) {
    this.comisionPorcentaje = value;
  });

ItemSchema.virtual("netoVendedor")
  .get(function () {
    return this.ingresoVendedor;
  })
  .set(function (value) {
    this.ingresoVendedor = value;
  });

ItemSchema.virtual("vendedorId")
  .get(function () {
    return this.vendedor || null;
  })
  .set(function (value) {
    this.vendedor = value || null;
  });

ItemSchema.virtual("sellerId")
  .get(function () {
    return this.vendedor || null;
  })
  .set(function (value) {
    this.vendedor = value || null;
  });

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

  const tipo = toStringSafe(this.tipoProducto).trim().toLowerCase();
  const pct =
    tipo === "afiliado"
      ? 0
      : normalizePct(this.comisionPorcentaje, DEFAULT_COMMISSION_PCT);

  this.comisionPorcentaje = round2(pct);

  const comision = round2(Math.max(0, (this.subtotal * pct) / 100));
  this.comisionMonto = comision;
  this.ingresoVendedor = round2(this.subtotal - this.comisionMonto);
});

const ProveedorSchema = new mongoose.Schema(
  {
    proveedor: {
      type: String,
      trim: true,
      default: "",
    },

    estadoPagoProveedor: {
      type: String,
      enum: ESTADOS_PAGO_PROVEEDOR,
      default: "pendiente",
      index: true,
    },

    referenciaProveedor: {
      type: String,
      trim: true,
      default: "",
    },

    tracking: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const VendedorPayoutSchema = new mongoose.Schema(
  {
    vendedor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },

    stripeAccountId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    monto: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: VENDEDOR_PAYOUT_STATUS,
      default: "pendiente",
      index: true,
    },

    stripeTransferId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    stripeTransferGroup: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    processingAt: {
      type: Date,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const HistorialSchema = new mongoose.Schema(
  {
    estado: {
      type: String,
      required: true,
      trim: true,
    },

    fecha: {
      type: Date,
      default: Date.now,
    },

    source: {
      type: String,
      trim: true,
      default: "system",
      index: true,
    },

    fingerprint: {
      type: String,
      trim: true,
      default: "",
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

// ============================================================
// Orden schema
// ============================================================
const OrdenSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: Number,
      index: true,
    },

   usuario: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Usuario",
  default: null,
  required: false,
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

    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    shipping: {
      type: Number,
      default: 0,
      min: 0,
    },

    tax: {
      type: Number,
      default: 0,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    totalCostoProveedor: {
      type: Number,
      required: true,
      min: 0,
    },

    gananciaTotal: {
      type: Number,
      required: true,
    },

    // Campo canon
    comisionTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Campo canon
    ingresoVendedorTotal: {
      type: Number,
      default: 0,
    },

    vendedorPayouts: {
      type: [VendedorPayoutSchema],
      default: [],
    },

    metodoPago: {
      type: String,
      enum: METODOS_PAGO,
      default: "stripe",
      index: true,
    },

    paymentProvider: {
      type: String,
      enum: PAYMENT_PROVIDERS,
      default: "stripe",
      index: true,
    },

    moneda: {
      type: String,
      default: "usd",
      trim: true,
      lowercase: true,
      index: true,
    },

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

    paymentStatusDetail: {
      type: String,
      trim: true,
      default: "",
    },

    paidAt: {
      type: Date,
      default: null,
      index: true,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    stripeSessionId: {
      type: String,
      trim: true,
      default: "",
    },

    stripePaymentIntentId: {
      type: String,
      trim: true,
      default: "",
    },

    stripeLatestEventId: {
      type: String,
      trim: true,
      default: "",
    },

    stripeAmountTotal: {
      type: Number,
      default: 0,
    },

    stripeAmountReceived: {
      type: Number,
      default: 0,
    },

    stripeRefundAmount: {
      type: Number,
      default: 0,
    },

    stripeCustomerId: {
      type: String,
      trim: true,
      default: "",
    },

    stripeEventIds: {
      type: [String],
      default: [],
    },

    payoutPolicy: {
      type: String,
      enum: PAYOUT_POLICY,
      default: "escrow_delivered_hold",
      index: true,
    },

    payoutHoldDays: {
      type: Number,
      default: DEFAULT_PAYOUT_HOLD_DAYS,
      min: 0,
      max: 60,
    },

    payoutEligibleAt: {
      type: Date,
      default: null,
      index: true,
    },

    payoutReleasedAt: {
      type: Date,
      default: null,
      index: true,
    },

    payoutBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    payoutBlockedReason: {
      type: String,
      trim: true,
      default: "",
    },

    proveedores: {
      type: [ProveedorSchema],
      default: [],
    },

    direccionEntrega: {
      nombre: { type: String, trim: true, default: "" },
      direccion: { type: String, trim: true, default: "" },
      ciudad: { type: String, trim: true, default: "" },
      provincia: { type: String, trim: true, default: "" },
      pais: { type: String, trim: true, default: "" },
      codigoPostal: { type: String, trim: true, default: "" },
      telefono: { type: String, trim: true, default: "" },
    },

    historial: {
      type: [HistorialSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
    optimisticConcurrency: true,
    minimize: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compatibilidad de nombres a nivel orden
OrdenSchema.virtual("totalComisiones")
  .get(function () {
    return this.comisionTotal;
  })
  .set(function (value) {
    this.comisionTotal = value;
  });

OrdenSchema.virtual("totalNetoVendedores")
  .get(function () {
    return this.ingresoVendedorTotal;
  })
  .set(function (value) {
    this.ingresoVendedorTotal = value;
  });

// ============================================================
// Auto increment
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
// Helpers internos
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

function buildVendedorPayoutsFromItems(items = [], prevPayouts = []) {
  const map = new Map();

  for (const it of items || []) {
    if (toStringSafe(it.sellerType, "platform") !== "seller") continue;

    const vendedorId = getItemSellerId(it);
    if (!vendedorId) continue;

    const monto = round2(getItemIngresoVendedor(it));
    if (monto <= 0) continue;

    map.set(String(vendedorId), round2((map.get(String(vendedorId)) || 0) + monto));
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
  return (items || []).some((it) => {
    const sellerType = toStringSafe(it?.sellerType, "platform");
    const sellerId = getItemSellerId(it);
    return sellerType === "seller" && sellerId;
  });
}

function shouldBlockPayoutByPaymentStatus(estadoPago) {
  return ["reembolsado", "reembolsado_parcial", "fallido"].includes(estadoPago);
}

// ============================================================
// Pre validate
// ============================================================
OrdenSchema.pre("validate", async function () {
  if (this.isNew && !this.orderNumber) {
    try {
      this.orderNumber = await nextOrderNumber();
    } catch {
      this.orderNumber = undefined;
    }
  }

  const items = Array.isArray(this.items) ? this.items : [];

  const subtotalItems = round2(
    items.reduce((acc, it) => acc + toNumber(it.subtotal, 0), 0)
  );
  this.subtotal = Math.max(0, subtotalItems);

  this.shipping = round2(Math.max(0, toNumber(this.shipping, 0)));
  this.tax = round2(Math.max(0, toNumber(this.tax, 0)));
  this.discount = round2(Math.max(0, toNumber(this.discount, 0)));

  const computedTotal = round2(this.subtotal + this.shipping + this.tax - this.discount);
  this.total = Math.max(0, computedTotal);

  this.totalCostoProveedor = round2(
    items.reduce((acc, it) => {
      const costoU = Math.max(0, toNumber(it.costoProveedorUnitario, 0));
      const qty = Math.max(1, toNumber(it.cantidad, 1));
      return acc + costoU * qty;
    }, 0)
  );

  this.gananciaTotal = round2(this.total - this.totalCostoProveedor);

  const comisionTotal = round2(
    items.reduce((acc, it) => acc + toNumber(it.comisionMonto, 0), 0)
  );

  const ingresoVendedorTotal = round2(
    items.reduce((acc, it) => acc + getItemIngresoVendedor(it), 0)
  );

  this.comisionTotal = Math.max(0, comisionTotal);
  this.ingresoVendedorTotal = ingresoVendedorTotal;

  this.vendedorPayouts = buildVendedorPayoutsFromItems(items, this.vendedorPayouts);

  this.stripeSessionId = normalizeStripeId(this.stripeSessionId);
  this.stripePaymentIntentId = normalizeStripeId(this.stripePaymentIntentId);
  this.stripeLatestEventId = normalizeStripeId(this.stripeLatestEventId);
  this.stripeCustomerId = normalizeStripeId(this.stripeCustomerId);

  this.stripeAmountTotal = Math.max(0, toNumber(this.stripeAmountTotal, 0));
  this.stripeAmountReceived = Math.max(0, toNumber(this.stripeAmountReceived, 0));
  this.stripeRefundAmount = Math.max(0, toNumber(this.stripeRefundAmount, 0));

  this.stripeEventIds = uniqStrings(this.stripeEventIds).slice(-50);

  this.moneda = normalizeCurrency(this.moneda);

  if (!this.paymentProvider) this.paymentProvider = "stripe";
  if (!PAYMENT_PROVIDERS.includes(this.paymentProvider)) this.paymentProvider = "stripe";

  if (!this.metodoPago) this.metodoPago = "stripe";
  if (!METODOS_PAGO.includes(this.metodoPago)) this.metodoPago = "stripe";

  this.paymentStatusDetail = toStringSafe(this.paymentStatusDetail).trim();

  this.payoutHoldDays = clamp(
    toNumber(this.payoutHoldDays, DEFAULT_PAYOUT_HOLD_DAYS),
    0,
    60
  );

  if (!this.payoutPolicy) this.payoutPolicy = "escrow_delivered_hold";
  if (!PAYOUT_POLICY.includes(this.payoutPolicy)) {
    this.payoutPolicy = "escrow_delivered_hold";
  }

  const proveedoresSet = new Set(
    items.map((it) => toStringSafe(it.proveedor, "").trim()).filter(Boolean)
  );

  const existing = Array.isArray(this.proveedores) ? this.proveedores : [];
  const out = [];

  for (const p of proveedoresSet) {
    const found = existing.find((x) => toStringSafe(x.proveedor).trim() === p);
    out.push(
      found || {
        proveedor: p,
        estadoPagoProveedor: "pendiente",
        referenciaProveedor: "",
        tracking: "",
      }
    );
  }

  for (const pr of out) {
    pr.proveedor = toStringSafe(pr.proveedor).trim();
    pr.referenciaProveedor = toStringSafe(pr.referenciaProveedor).trim();
    pr.tracking = toStringSafe(pr.tracking).trim();

    if (!ESTADOS_PAGO_PROVEEDOR.includes(pr.estadoPagoProveedor)) {
      pr.estadoPagoProveedor = "pendiente";
    }
  }

  this.proveedores = out;

  if (this.direccionEntrega) {
    for (const k of [
      "nombre",
      "direccion",
      "ciudad",
      "provincia",
      "pais",
      "codigoPostal",
      "telefono",
    ]) {
      this.direccionEntrega[k] = toStringSafe(this.direccionEntrega[k]).trim();
    }
  }
});

// ============================================================
// Métodos de instancia
// ============================================================
OrdenSchema.methods.pushHistorial = function (estado, meta = null, opts = {}) {
  ensureHistorialArray(this);

  const source = toStringSafe(opts.source, "system").trim() || "system";
  const fingerprint =
    toStringSafe(opts.fingerprint, "").trim() ||
    buildFingerprint({ estado, source, meta });

  const last = this.historial[this.historial.length - 1];
  if (last && last.fingerprint && last.fingerprint === fingerprint) return false;

  this.historial.push({ estado, meta, source, fingerprint });
  return true;
};

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

OrdenSchema.methods.getBreakdownPorVendedor = function () {
  const out = {};
  const items = Array.isArray(this.items) ? this.items : [];

  for (const it of items) {
    if (toStringSafe(it.sellerType, "platform") !== "seller") continue;
    const vid = getItemSellerId(it);
    if (!vid) continue;

    if (!out[String(vid)]) out[String(vid)] = { monto: 0, itemsCount: 0 };

    out[String(vid)].monto = round2(
      out[String(vid)].monto + getItemIngresoVendedor(it)
    );
    out[String(vid)].itemsCount += 1;
  }

  return out;
};

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

  if (isNonEmptyString(opts.stripeTransferId)) {
    row.stripeTransferId = String(opts.stripeTransferId).trim();
  }

  if (isNonEmptyString(opts.stripeTransferGroup)) {
    row.stripeTransferGroup = String(opts.stripeTransferGroup).trim();
  }

  this.pushHistorial(
    "vendedor_payout_update",
    { vendedorId: vid, from: prev, to: st, ...opts },
    { source: toStringSafe(opts.source, "system") }
  );

  return true;
};

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

OrdenSchema.methods.setEstadoFulfillment = function (
  nuevoEstado,
  meta = null,
  source = "system"
) {
  const to = toStringSafe(nuevoEstado).trim();
  if (!ESTADOS_FUL.includes(to)) {
    throw new Error(`estadoFulfillment inválido: ${to}`);
  }

  const from = this.estadoFulfillment;
  if (from && !canTransition(FUL_TRANSITIONS, from, to)) {
    throw new Error(`Transición fulfillment inválida: ${from} -> ${to}`);
  }

  this.estadoFulfillment = to;
  this.pushHistorial(`fulfillment_${to}`, meta || { from, to }, { source });
  return true;
};

OrdenSchema.methods.marcarProveedorPagado = function (
  proveedorNombre,
  referencia = "",
  meta = null,
  source = "system"
) {
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

OrdenSchema.methods.blockPayouts = function (reason, meta = null, source = "system") {
  this.payoutBlocked = true;
  this.payoutBlockedReason = toStringSafe(reason).trim().slice(0, 300);

  if (Array.isArray(this.vendedorPayouts)) {
    for (const vp of this.vendedorPayouts) {
      if (vp && vp.status !== "pagado") vp.status = "bloqueado";
    }
  }

  this.pushHistorial(
    "payouts_blocked",
    { reason: this.payoutBlockedReason, ...(meta || {}) },
    { source }
  );

  return true;
};

// ============================================================
// Hooks de estado
// ============================================================
OrdenSchema.pre("init", function (doc) {
  this.$locals = this.$locals || {};
  this.$locals.prevEstadoPago = doc.estadoPago;
  this.$locals.prevEstadoFulfillment = doc.estadoFulfillment;
});

OrdenSchema.pre("save", function () {
  ensureHistorialArray(this);

  const items = Array.isArray(this.items) ? this.items : [];
  const hasSellers = hasSellerItems(items);

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
    } else if (to === "reembolsado" || to === "reembolsado_parcial") {
      if (!this.refundedAt) this.refundedAt = nowDate();
    }

    if (shouldBlockPayoutByPaymentStatus(to) && hasSellers) {
      this.payoutBlocked = true;
      this.payoutBlockedReason = `payment_${to}`;

      for (const vp of this.vendedorPayouts || []) {
        if (vp && vp.status !== "pagado") vp.status = "bloqueado";
      }

      this.pushHistorial(
        "payouts_blocked",
        { reason: this.payoutBlockedReason },
        { source: "system" }
      );
    }
  }

  if (this.isModified("estadoFulfillment")) {
    const from = this.$locals?.prevEstadoFulfillment ?? null;
    const to = this.estadoFulfillment;

    if (from && !canTransition(FUL_TRANSITIONS, from, to)) {
      throw new Error(`Transición fulfillment inválida: ${from} -> ${to}`);
    }

    this.pushHistorial(`fulfillment_${to}`, { from, to }, { source: "system" });

    if (
      this.payoutPolicy === "escrow_delivered_hold" &&
      hasSellers &&
      to === "entregado" &&
      this.estadoPago === "pagado" &&
      !this.payoutBlocked
    ) {
      const holdDays = clamp(
        toNumber(this.payoutHoldDays, DEFAULT_PAYOUT_HOLD_DAYS),
        0,
        60
      );

      if (!this.payoutEligibleAt) {
        this.payoutEligibleAt = addDays(nowDate(), holdDays);
        this.pushHistorial(
          "payouts_scheduled",
          {
            policy: this.payoutPolicy,
            holdDays,
            payoutEligibleAt: this.payoutEligibleAt,
          },
          { source: "system" }
        );
      }
    }

    if (to === "cancelado" && hasSellers) {
      this.payoutBlocked = true;
      this.payoutBlockedReason = "fulfillment_cancelado";

      for (const vp of this.vendedorPayouts || []) {
        if (vp && vp.status !== "pagado") vp.status = "bloqueado";
      }

      this.pushHistorial(
        "payouts_blocked",
        { reason: this.payoutBlockedReason },
        { source: "system" }
      );
    }
  }
});

// ============================================================
// Statics
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

OrdenSchema.statics.findByVendedor = function (vendedorId, { limit = 50, skip = 0 } = {}) {
  const id = toStringSafe(vendedorId, "").trim();
  if (!id || !isObjectId(id)) return Promise.resolve([]);

  const lim = clamp(parseInt(limit, 10) || 50, 1, 200);
  const sk = Math.max(0, parseInt(skip, 10) || 0);

  return this.find({
    $or: [
      { "items.vendedor": id, "items.sellerType": "seller" },
      { "items.vendedorId": id, "items.sellerType": "seller" },
      { "items.sellerId": id, "items.sellerType": "seller" },
    ],
  })
    .sort({ createdAt: -1 })
    .skip(sk)
    .limit(lim);
};

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

OrdenSchema.statics.findPayoutEligible = function ({ limit = 50, skip = 0 } = {}) {
  const lim = clamp(parseInt(limit, 10) || 50, 1, 200);
  const sk = Math.max(0, parseInt(skip, 10) || 0);

  return this.find({
    payoutPolicy: "escrow_delivered_hold",
    payoutBlocked: false,
    estadoPago: "pagado",
    estadoFulfillment: "entregado",
    payoutEligibleAt: { $ne: null, $lte: new Date() },
    "vendedorPayouts.status": { $in: ["pendiente", "fallido"] },
  })
    .sort({ payoutEligibleAt: 1, createdAt: 1 })
    .skip(sk)
    .limit(lim);
};

// ============================================================
// Índices
// ============================================================
OrdenSchema.index({ createdAt: -1 });
OrdenSchema.index({ usuario: 1, createdAt: -1 });
OrdenSchema.index({ estadoPago: 1, estadoFulfillment: 1, createdAt: -1 });

OrdenSchema.index({ stripeSessionId: 1, createdAt: -1 });
OrdenSchema.index({ stripePaymentIntentId: 1 });
OrdenSchema.index({ stripeLatestEventId: 1 });

OrdenSchema.index({ paidAt: -1 });
OrdenSchema.index({ moneda: 1, estadoPago: 1 });

OrdenSchema.index({ orderNumber: -1 });

OrdenSchema.index({ "items.proveedor": 1, createdAt: -1 });

OrdenSchema.index({ "items.vendedor": 1, createdAt: -1 });
OrdenSchema.index({ "vendedorPayouts.vendedor": 1, "vendedorPayouts.status": 1, createdAt: -1 });
OrdenSchema.index({ "vendedorPayouts.stripeTransferId": 1 });

OrdenSchema.index({ payoutPolicy: 1, payoutBlocked: 1, payoutEligibleAt: 1 });
OrdenSchema.index({ payoutEligibleAt: 1, payoutReleasedAt: 1 });

// ============================================================
// Export
// ============================================================
module.exports = mongoose.model("Orden", OrdenSchema);