"use strict";

const mongoose = require("mongoose");

const ESTADOS = ["abierto", "en_revision", "resuelto"];
const PRIORIDADES = ["baja", "media", "alta"];
const TIPOS = [
  "pedido",
  "pago",
  "envio",
  "reembolso",
  "cuenta",
  "otro",
];

function safeStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

const HistorialSchema = new mongoose.Schema(
  {
    estado: {
      type: String,
      enum: ESTADOS,
      required: true,
    },
    fecha: {
      type: Date,
      default: Date.now,
    },
    actor: {
      type: String,
      default: "system",
      trim: true,
    },
    nota: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  { _id: false }
);

const SoporteTicketSchema = new mongoose.Schema(
  {
    ordenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Orden",
      default: null,
      index: true,
    },

    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
      index: true,
    },

    usuarioEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },

    tipo: {
      type: String,
      enum: TIPOS,
      default: "otro",
      index: true,
    },

    mensaje: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    estado: {
      type: String,
      enum: ESTADOS,
      default: "abierto",
      index: true,
    },

    prioridad: {
      type: String,
      enum: PRIORIDADES,
      default: "media",
      index: true,
    },

    notasInternas: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },

    asignadoA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
      index: true,
    },

    cerradoAt: {
      type: Date,
      default: null,
      index: true,
    },

    historial: {
      type: [HistorialSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    optimisticConcurrency: true,
  }
);

SoporteTicketSchema.pre("validate", function () {
  this.usuarioEmail = safeStr(this.usuarioEmail).toLowerCase();
  this.mensaje = safeStr(this.mensaje);
  this.notasInternas = safeStr(this.notasInternas);

  if (!Array.isArray(this.historial)) {
    this.historial = [];
  }
});

SoporteTicketSchema.pre("save", function () {
  if (this.isModified("estado")) {
    this.historial.push({
      estado: this.estado,
      fecha: new Date(),
      actor: "system",
      nota: "",
    });

    if (this.estado === "resuelto" && !this.cerradoAt) {
      this.cerradoAt = new Date();
    }

    if (this.estado !== "resuelto") {
      this.cerradoAt = null;
    }
  }
});

SoporteTicketSchema.index({ createdAt: -1 });
SoporteTicketSchema.index({ estado: 1, prioridad: 1, createdAt: -1 });
SoporteTicketSchema.index({ usuario: 1, createdAt: -1 });
SoporteTicketSchema.index({ ordenId: 1, createdAt: -1 });

module.exports = mongoose.model("SoporteTicket", SoporteTicketSchema);