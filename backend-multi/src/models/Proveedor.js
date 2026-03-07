const mongoose = require('mongoose');

/**
 * ============================================================
 * Proveedor.js — ENTERPRISE Provider Model
 * ============================================================
 * Objetivo:
 * - Registrar proveedores (dropshipping / mayoristas / fulfillment)
 * - Controlar términos, capacidades, monedas, SLA, estados
 * - Preparar integración por API (sin guardar secretos en texto plano)
 * ============================================================
 */

const ProveedorSchema = new mongoose.Schema(
  {
    // Identidad
    nombre: { type: String, required: true, trim: true, index: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true }, // ej: "cjdropshipping"
    tipo: {
      type: String,
      enum: ['dropshipping', 'mayorista', 'fulfillment', 'afiliado', 'otro'],
      default: 'dropshipping',
      index: true,
    },

    // Estado
    activo: { type: Boolean, default: true, index: true },
    verificado: { type: Boolean, default: false, index: true },

    // Contacto / soporte
    contacto: {
      email: { type: String, trim: true, lowercase: true, default: '' },
      telefono: { type: String, trim: true, default: '' },
      website: { type: String, trim: true, default: '' },
      soporteUrl: { type: String, trim: true, default: '' },
    },

    // Operación
    paisOperacion: { type: String, trim: true, default: '' },
    monedasSoportadas: [{ type: String, trim: true, default: 'USD' }],
    categoriasSoportadas: [{ type: String, trim: true }],
    tiempoProcesamientoDias: { type: Number, default: 2, min: 0 }, // prepara pedido
    tiempoEnvioDiasMin: { type: Number, default: 5, min: 0 },
    tiempoEnvioDiasMax: { type: Number, default: 15, min: 0 },

    // SLA / políticas
    sla: {
      devolucionesDias: { type: Number, default: 14, min: 0 },
      garantiaDias: { type: Number, default: 0, min: 0 },
      requiereTracking: { type: Boolean, default: true },
      manejaImpuestos: { type: Boolean, default: false },
    },

    // Pagos al proveedor (tu modelo: cobras tú y luego pagas proveedor)
    payout: {
      metodoPreferido: { type: String, enum: ['manual', 'transferencia', 'paypal', 'stripe_connect', 'otro'], default: 'manual' },
      monedaPayout: { type: String, trim: true, default: 'USD' },
      ciclo: { type: String, enum: ['por_orden', 'diario', 'semanal', 'quincenal', 'mensual'], default: 'por_orden' },
      margenRecomendadoPct: { type: Number, default: 20, min: 0, max: 1000 },
      notas: { type: String, trim: true, default: '' },
    },

    // Integración API (NO guardes tokens en texto plano)
    integracion: {
      tieneApi: { type: Boolean, default: false, index: true },
      tipo: { type: String, enum: ['rest', 'graphql', 'csv', 'manual'], default: 'manual' },
      baseUrl: { type: String, trim: true, default: '' },
      version: { type: String, trim: true, default: '' },

      // Referencias a secretos (recomendación)
      // Guarda aquí solo "keys references" o ids de tu secret manager.
      secretsRef: {
        apiKeyRef: { type: String, trim: true, default: '' },
        apiSecretRef: { type: String, trim: true, default: '' },
        accessTokenRef: { type: String, trim: true, default: '' },
      },

      webhooks: {
        soportaWebhooks: { type: Boolean, default: false },
        eventos: [{ type: String, trim: true }],
      },
    },

    // Config extra
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Índices extra
ProveedorSchema.index({ nombre: 'text', slug: 1, tipo: 1, activo: 1 });

ProveedorSchema.pre('validate', function (next) {
  if (!this.slug && this.nombre) {
    this.slug = String(this.nombre)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
  next();
});

ProveedorSchema.methods.resumenPublico = function () {
  return {
    id: this._id,
    nombre: this.nombre,
    slug: this.slug,
    tipo: this.tipo,
    activo: this.activo,
    verificado: this.verificado,
    paisOperacion: this.paisOperacion,
    monedasSoportadas: this.monedasSoportadas,
    sla: this.sla,
    payout: this.payout,
  };
};

module.exports = mongoose.model('Proveedor', ProveedorSchema);