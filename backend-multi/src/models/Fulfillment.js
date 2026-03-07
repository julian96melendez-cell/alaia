const mongoose = require('mongoose');

/**
 * ============================================================
 * Fulfillment.js — ENTERPRISE Fulfillment / Shipping Model
 * ============================================================
 * Objetivo:
 * - Gestionar el “cumplimiento” de una orden (envío, tracking, estados)
 * - Soportar MULTI-proveedor por orden
 * - Preparar automatización: pago proveedor, creación pedido proveedor, tracking
 * ============================================================
 */

const FulfillmentItemSchema = new mongoose.Schema(
  {
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    nombre: { type: String, required: true, trim: true },
    cantidad: { type: Number, required: true, min: 1 },

    proveedor: { type: String, required: true, trim: true, index: true }, // coincide con Producto.proveedor o Proveedor.slug
    proveedorProductoId: { type: String, trim: true, default: '' },

    // Costos “operativos” opcionales
    costoProveedorUnitario: { type: Number, default: 0, min: 0 },
    costoEnvioEstimado: { type: Number, default: 0, min: 0 },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const TrackingSchema = new mongoose.Schema(
  {
    carrier: { type: String, trim: true, default: '' },
    trackingNumber: { type: String, trim: true, default: '' },
    trackingUrl: { type: String, trim: true, default: '' },
    estado: { type: String, trim: true, default: '' }, // “in_transit”, “delivered”, etc.
    ultimaActualizacion: { type: Date, default: Date.now },
    eventos: [
      {
        fecha: { type: Date, default: Date.now },
        descripcion: { type: String, trim: true, default: '' },
        ubicacion: { type: String, trim: true, default: '' },
      },
    ],
  },
  { _id: false }
);

const FulfillmentSchema = new mongoose.Schema(
  {
    // Relación principal
    orden: { type: mongoose.Schema.Types.ObjectId, ref: 'Orden', required: true, index: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },

    // Estado Fulfillment
    estado: {
      type: String,
      enum: ['pendiente', 'preparando', 'enviado', 'en_transito', 'entregado', 'cancelado', 'fallido'],
      default: 'pendiente',
      index: true,
    },

    // Subestado de proveedor (si divides por proveedor)
    proveedor: { type: String, required: true, trim: true, index: true },

    // Referencia externa (si el proveedor te da orderId)
    proveedorOrdenId: { type: String, trim: true, default: '', index: true },

    // Items incluidos en este fulfillment (normalmente los que pertenecen a ese proveedor)
    items: {
      type: [FulfillmentItemSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'El fulfillment debe contener al menos un item',
      },
      required: true,
    },

    // Dirección destino “snapshoteada” (para no depender de cambios posteriores)
    direccionEntrega: {
      nombre: { type: String, trim: true, default: '' },
      direccion: { type: String, trim: true, default: '' },
      ciudad: { type: String, trim: true, default: '' },
      provincia: { type: String, trim: true, default: '' },
      pais: { type: String, trim: true, default: '' },
      codigoPostal: { type: String, trim: true, default: '' },
      telefono: { type: String, trim: true, default: '' },
    },

    // Tracking
    tracking: { type: TrackingSchema, default: {} },

    // Control de pagos al proveedor (tu flujo: cobras tú y luego pagas)
    pagoProveedor: {
      estado: { type: String, enum: ['pendiente', 'pagado', 'fallido', 'no_aplica'], default: 'pendiente', index: true },
      metodo: { type: String, trim: true, default: 'manual' },
      monto: { type: Number, default: 0, min: 0 },
      moneda: { type: String, trim: true, default: 'USD' },
      referencia: { type: String, trim: true, default: '' },
      fechaPago: { type: Date },
    },

    // Historial
    historial: [
      {
        estado: { type: String, trim: true, required: true },
        nota: { type: String, trim: true, default: '' },
        fecha: { type: Date, default: Date.now },
      },
    ],

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Índices
FulfillmentSchema.index({ orden: 1, proveedor: 1, estado: 1 });
FulfillmentSchema.index({ proveedorOrdenId: 1 });

// Historial automático de estado
FulfillmentSchema.pre('save', function (next) {
  if (this.isNew) {
    this.historial.push({ estado: this.estado, nota: 'Creado' });
  } else if (this.isModified('estado')) {
    this.historial.push({ estado: this.estado, nota: 'Cambio de estado' });
  }
  next();
});

// Helpers
FulfillmentSchema.methods.marcarEnviado = async function ({ carrier, trackingNumber, trackingUrl } = {}) {
  this.estado = 'enviado';
  this.tracking = {
    ...(this.tracking || {}),
    carrier: carrier || this.tracking?.carrier || '',
    trackingNumber: trackingNumber || this.tracking?.trackingNumber || '',
    trackingUrl: trackingUrl || this.tracking?.trackingUrl || '',
    ultimaActualizacion: new Date(),
  };
  return this.save();
};

FulfillmentSchema.methods.marcarEntregado = async function () {
  this.estado = 'entregado';
  if (this.tracking) {
    this.tracking.estado = 'delivered';
    this.tracking.ultimaActualizacion = new Date();
  }
  return this.save();
};

module.exports = mongoose.model('Fulfillment', FulfillmentSchema);