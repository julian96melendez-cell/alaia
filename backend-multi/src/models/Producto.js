"use strict";

const mongoose = require("mongoose");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const safeStr = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
};

const ProductoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      index: true,
      maxlength: 300,
    },

    sku: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      index: true,
      maxlength: 120,
    },

    descripcion: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },

    imagenes: [{ type: String, trim: true }],

    imagenPrincipal: {
      type: String,
      default: "",
      trim: true,
    },

    categoria: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    tags: [{ type: String, trim: true }],

    tipo: {
      type: String,
      enum: ["marketplace", "dropshipping", "afiliado"],
      default: "marketplace",
      index: true,
    },

    sellerType: {
      type: String,
      enum: ["platform", "seller"],
      default: "platform",
      index: true,
    },

    vendedor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
      index: true,
    },

    proveedor: {
      type: String,
      default: "local",
      trim: true,
      index: true,
    },

    proveedorProductoId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    moneda: {
      type: String,
      default: "USD",
      trim: true,
      uppercase: true,
    },

    costoProveedor: {
      type: Number,
      default: 0,
      min: 0,
    },

    margenPorcentaje: {
      type: Number,
      default: 20,
      min: 0,
      max: 1000,
    },

    precioFinal: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    comisionPct: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    commissionFlat: {
      type: Number,
      default: 0,
      min: 0,
    },

    gestionStock: {
      type: Boolean,
      default: false,
      index: true,
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    affiliateUrl: {
      type: String,
      default: "",
      trim: true,
    },

    plataformaAfiliado: {
      type: String,
      default: "",
      trim: true,
    },

    activo: {
      type: Boolean,
      default: true,
      index: true,
    },

    visible: {
      type: Boolean,
      default: true,
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ProductoSchema.index({
  nombre: "text",
  sku: 1,
  categoria: 1,
  proveedor: 1,
  tipo: 1,
  activo: 1,
  visible: 1,
  sellerType: 1,
  vendedor: 1,
});

ProductoSchema.index({ precioFinal: 1, activo: 1, visible: 1 });
ProductoSchema.index({ createdAt: -1 });
ProductoSchema.index({ vendedor: 1, activo: 1, visible: 1 });
ProductoSchema.index({ sku: 1, vendedor: 1 });

ProductoSchema.virtual("precio")
  .get(function () {
    return this.precioFinal;
  })
  .set(function (value) {
    this.precioFinal = value;
  });

ProductoSchema.virtual("gananciaUnitaria").get(function () {
  return round2((this.precioFinal || 0) - (this.costoProveedor || 0));
});

ProductoSchema.virtual("vendedorId")
  .get(function () {
    return this.vendedor || null;
  })
  .set(function (value) {
    this.vendedor = value || null;
  });

ProductoSchema.virtual("sellerId")
  .get(function () {
    return this.vendedor || null;
  })
  .set(function (value) {
    this.vendedor = value || null;
  });

ProductoSchema.virtual("commissionRatePct")
  .get(function () {
    return this.comisionPct;
  })
  .set(function (value) {
    this.comisionPct = value;
  });

// ✅ CORREGIDO: sin next()
ProductoSchema.pre("validate", function () {
  this.nombre = safeStr(this.nombre);
  this.sku = safeStr(this.sku).toUpperCase();
  this.descripcion = safeStr(this.descripcion);
  this.imagenPrincipal = safeStr(this.imagenPrincipal);
  this.categoria = safeStr(this.categoria);
  this.proveedor = safeStr(this.proveedor, "local");
  this.proveedorProductoId = safeStr(this.proveedorProductoId);
  this.moneda = safeStr(this.moneda, "USD").toUpperCase();
  this.affiliateUrl = safeStr(this.affiliateUrl);
  this.plataformaAfiliado = safeStr(this.plataformaAfiliado);

  if (!Array.isArray(this.imagenes)) this.imagenes = [];
  this.imagenes = this.imagenes.map((img) => safeStr(img)).filter(Boolean);

  if (!Array.isArray(this.tags)) this.tags = [];
  this.tags = Array.from(
    new Set(
      this.tags
        .map((tag) => safeStr(tag).toLowerCase())
        .filter(Boolean)
    )
  );

  this.costoProveedor = round2(Math.max(0, toNumber(this.costoProveedor, 0)));
  this.margenPorcentaje = clamp(toNumber(this.margenPorcentaje, 0), 0, 1000);
  this.precioFinal = round2(Math.max(0, toNumber(this.precioFinal, 0)));
  this.stock = Math.max(0, Math.floor(toNumber(this.stock, 0)));

  if (this.comisionPct === undefined) {
    this.comisionPct = null;
  }

  if (this.comisionPct !== null) {
    this.comisionPct = clamp(toNumber(this.comisionPct, 0), 0, 100);
  }

  this.commissionFlat = round2(Math.max(0, toNumber(this.commissionFlat, 0)));

  if (this.sellerType !== "platform" && this.sellerType !== "seller") {
    this.sellerType = "platform";
  }

  if (this.sellerType === "seller" && !this.vendedor) {
    this.sellerType = "platform";
  }

  if (this.vendedor && this.sellerType !== "seller" && this.tipo !== "afiliado") {
    this.sellerType = "seller";
  }

  if (this.tipo === "afiliado") {
    this.sellerType = "platform";
    this.vendedor = null;
    this.comisionPct = null;
    this.commissionFlat = 0;
    this.costoProveedor = 0;
    this.margenPorcentaje = 0;
  } else {
    const shouldRecalc =
      !this.precioFinal ||
      this.isModified("costoProveedor") ||
      this.isModified("margenPorcentaje");

    if (shouldRecalc) {
      const base = Math.max(0, this.costoProveedor);
      const margen = Math.max(0, this.margenPorcentaje);

      if (base > 0) {
        this.precioFinal = round2(base * (1 + margen / 100));
      }
    }
  }
});

// ✅ CORREGIDO: sin next()
ProductoSchema.pre("save", function () {
  if (this.tipo === "afiliado") {
    if (!this.affiliateUrl) {
      throw new Error("Los productos afiliados requieren affiliateUrl");
    }
  } else {
    if (this.affiliateUrl) this.affiliateUrl = "";
    if (this.plataformaAfiliado) this.plataformaAfiliado = "";
  }

  if (this.gestionStock && this.stock < 0) {
    this.stock = 0;
  }
});

ProductoSchema.methods.calcularGanancia = function () {
  return round2((this.precioFinal || 0) - (this.costoProveedor || 0));
};

module.exports = mongoose.model("Producto", ProductoSchema);