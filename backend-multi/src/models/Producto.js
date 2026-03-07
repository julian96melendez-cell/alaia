const mongoose = require('mongoose');

/**
 * ============================================================
 * Producto.js — ENTERPRISE (Marketplace / Dropshipping / Afiliado)
 * ============================================================
 * - Anti-NaN (normaliza numbers)
 * - Precios: costoProveedor + margen -> precioFinal
 * - Afiliado: no pasa por Stripe, requiere affiliateUrl
 * - Índices útiles para catálogo grande
 *
 * ✅ Marketplace Multi-Vendor READY:
 * - vendedor (Usuario) + sellerType (platform/seller)
 * - comisión opcional por producto (rate/flat) para calcular en Orden.js
 * ============================================================
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const ProductoSchema = new mongoose.Schema(
  {
    // ============================
    // Identidad y contenido
    // ============================
    nombre: { type: String, required: true, trim: true, index: true },
    descripcion: { type: String, default: '', trim: true },

    imagenes: [{ type: String, trim: true }],
    imagenPrincipal: { type: String, default: '', trim: true },

    categoria: { type: String, default: '', trim: true, index: true },
    tags: [{ type: String, trim: true, index: true }],

    // ============================
    // Tipo de producto
    // ============================
    tipo: {
      type: String,
      enum: ['marketplace', 'dropshipping', 'afiliado'],
      default: 'marketplace',
      index: true,
    },

    // ============================
    // 🔥 Marketplace: dueño/vendedor del producto
    // - platform: producto tuyo (vendedor null)
    // - seller: producto de vendedor externo (vendedor apunta a Usuario)
    // ============================
    sellerType: {
      type: String,
      enum: ['platform', 'seller'],
      default: 'platform',
      index: true,
    },

    vendedor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
      index: true,
    },

    // ============================
    // Proveedor (marketplace/dropshipping)
    // ============================
    proveedor: { type: String, default: 'local', trim: true, index: true },
    proveedorProductoId: { type: String, default: '', trim: true, index: true },

    // ============================
    // Moneda / precios
    // ============================
    moneda: { type: String, default: 'USD', trim: true },

    costoProveedor: { type: Number, default: 0, min: 0 },
    margenPorcentaje: { type: Number, default: 20, min: 0, max: 1000 },
    precioFinal: { type: Number, default: 0, min: 0, index: true },

    // ============================
    // ✅ Comisión (opcional por producto)
    // - Se usa cuando sellerType === 'seller' (vendedor externo)
    // - Si se deja en null/0, Orden.js podrá usar defaults globales por ENV
    // ============================
    commissionRatePct: {
      type: Number,
      default: null, // null => usa default global (ENV) en Orden.js
      min: 0,
      max: 100,
    },

    commissionFlat: {
      type: Number,
      default: 0, // monto fijo por item o por orden (lo decides en Orden.js)
      min: 0,
    },

    // ============================
    // Inventario
    // ============================
    gestionStock: { type: Boolean, default: false },
    stock: { type: Number, default: 0, min: 0 },

    // ============================
    // Afiliados
    // ============================
    affiliateUrl: { type: String, default: '', trim: true },
    plataformaAfiliado: { type: String, default: '', trim: true },

    // ============================
    // Control / visibilidad
    // ============================
    activo: { type: Boolean, default: true, index: true },
    visible: { type: Boolean, default: true, index: true },

    // ============================
    // Metadata flexible
    // ============================
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices “de verdad” para catálogo
ProductoSchema.index({
  nombre: 'text',
  categoria: 1,
  proveedor: 1,
  tipo: 1,
  activo: 1,
  visible: 1,
  sellerType: 1,
  vendedor: 1,
});

ProductoSchema.virtual('gananciaUnitaria').get(function () {
  return round2((this.precioFinal || 0) - (this.costoProveedor || 0));
});

// Anti-NaN + cálculo consistente
ProductoSchema.pre('validate', function (next) {
  this.costoProveedor = toNumber(this.costoProveedor, 0);
  this.margenPorcentaje = toNumber(this.margenPorcentaje, 0);
  this.precioFinal = toNumber(this.precioFinal, 0);
  this.stock = toNumber(this.stock, 0);

  // Comisiones
  if (this.commissionRatePct === undefined) this.commissionRatePct = null;
  if (this.commissionRatePct !== null) {
    this.commissionRatePct = toNumber(this.commissionRatePct, 0);
    this.commissionRatePct = clamp(this.commissionRatePct, 0, 100);
  }
  this.commissionFlat = toNumber(this.commissionFlat, 0);
  this.commissionFlat = round2(Math.max(0, this.commissionFlat));

  // Normaliza strings
  if (typeof this.proveedor !== 'string' || !this.proveedor.trim()) this.proveedor = 'local';
  if (typeof this.moneda !== 'string' || !this.moneda.trim()) this.moneda = 'USD';

  // Normaliza sellerType con reglas seguras
  if (this.tipo === 'afiliado') {
    // Afiliado no se cobra por Stripe y no es “vendible” dentro de tu marketplace
    this.sellerType = 'platform';
    this.vendedor = null;
    this.commissionRatePct = null;
    this.commissionFlat = 0;

    // Afiliado no se cobra por Stripe
    this.costoProveedor = 0;
    this.margenPorcentaje = 0;
    // precioFinal puede quedar 0
  } else {
    // marketplace/dropshipping: recalcular si hace falta
    const shouldRecalc =
      !this.precioFinal ||
      this.isModified('costoProveedor') ||
      this.isModified('margenPorcentaje');

    if (shouldRecalc) {
      const base = Math.max(0, this.costoProveedor);
      const margen = Math.max(0, this.margenPorcentaje);
      this.precioFinal = base === 0 ? this.precioFinal : round2(base * (1 + margen / 100));
    }

    // Regla simple: si sellerType es seller pero no hay vendedor, cae a platform
    if (this.sellerType === 'seller' && !this.vendedor) {
      this.sellerType = 'platform';
    }
  }

  // Redondeo final consistente
  this.costoProveedor = round2(this.costoProveedor);
  this.precioFinal = round2(this.precioFinal);
  this.stock = Math.max(0, Math.floor(this.stock));

  next();
});

// Reglas por tipo
ProductoSchema.pre('save', function (next) {
  if (this.tipo === 'afiliado') {
    if (!this.affiliateUrl) return next(new Error('Los productos afiliados requieren affiliateUrl'));
  } else {
    if (this.affiliateUrl) this.affiliateUrl = '';
    if (this.plataformaAfiliado) this.plataformaAfiliado = '';
  }

  // Stock safe
  if (this.gestionStock && this.stock < 0) this.stock = 0;

  next();
});

ProductoSchema.methods.calcularGanancia = function () {
  return round2((this.precioFinal || 0) - (this.costoProveedor || 0));
};

module.exports = mongoose.model('Producto', ProductoSchema);