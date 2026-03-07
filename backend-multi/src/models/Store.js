const mongoose = require('mongoose');

/**
 * ============================================================
 * Store.js — ENTERPRISE STORE MODEL (FINAL)
 * ============================================================
 * Soporta:
 * - Multi-tienda (multi-vendor / multi-seller)
 * - Dropshipping / Marketplace / Afiliados
 * - App móvil (App Store / Google Play)
 * - Branding, métricas, estados, pagos
 * - Escalable a SaaS
 * ============================================================
 */

const StoreSchema = new mongoose.Schema(
  {
    // ======================================================
    // IDENTIDAD DE LA TIENDA
    // ======================================================
    nombre: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      // ej: "mi-tienda-oficial"
    },

    descripcion: {
      type: String,
      default: '',
      trim: true,
    },

    // ======================================================
    // PROPIETARIO
    // ======================================================
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },

    // ======================================================
    // BRANDING
    // ======================================================
    branding: {
      logo: { type: String, default: '' },
      banner: { type: String, default: '' },
      colorPrimario: { type: String, default: '#000000' },
      colorSecundario: { type: String, default: '#ffffff' },
    },

    // ======================================================
    // TIPO DE STORE
    // ======================================================
    tipo: {
      type: String,
      enum: ['marketplace', 'dropshipping', 'afiliado', 'mixto'],
      default: 'marketplace',
      index: true,
    },

    // ======================================================
    // CONFIGURACIÓN COMERCIAL
    // ======================================================
    configuracion: {
      moneda: {
        type: String,
        default: 'USD',
      },

      margenDefaultPorcentaje: {
        type: Number,
        default: 20,
        min: 0,
        max: 1000,
      },

      impuestosIncluidos: {
        type: Boolean,
        default: false,
      },

      permitirAfiliados: {
        type: Boolean,
        default: false,
      },
    },

    // ======================================================
    // MÉTODOS DE PAGO
    // ======================================================
    pagos: {
      stripeEnabled: { type: Boolean, default: true },
      paypalEnabled: { type: Boolean, default: false },
      transferenciaEnabled: { type: Boolean, default: false },
    },

    // ======================================================
    // ESTADOS DE LA STORE
    // ======================================================
    estado: {
      type: String,
      enum: ['borrador', 'activa', 'suspendida', 'cerrada'],
      default: 'borrador',
      index: true,
    },

    visible: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ======================================================
    // MÉTRICAS (NO CRÍTICAS – ANALYTICS)
    // ======================================================
    metrics: {
      productos: { type: Number, default: 0 },
      ventas: { type: Number, default: 0 },
      ingresos: { type: Number, default: 0 },
      visitas: { type: Number, default: 0 },
    },

    // ======================================================
    // METADATA LIBRE (EXTENSIBLE)
    // ======================================================
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ======================================================
// ÍNDICES AVANZADOS
// ======================================================
StoreSchema.index({
  nombre: 'text',
  slug: 1,
  owner: 1,
  estado: 1,
  tipo: 1,
});

// ======================================================
// VIRTUALS
// ======================================================
StoreSchema.virtual('estaActiva').get(function () {
  return this.estado === 'activa' && this.visible === true;
});

// ======================================================
// PRE-SAVE (NORMALIZACIÓN)
// ======================================================
StoreSchema.pre('save', function (next) {
  if (this.slug) {
    this.slug = this.slug.toLowerCase();
  }
  next();
});

module.exports = mongoose.model('Store', StoreSchema);