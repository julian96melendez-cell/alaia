// =============================================
// carritoModel.js — Modelo de Carrito (PRO)
// =============================================

const mongoose = require('mongoose');

const CarritoItemSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true,
  },
  cantidad: {
    type: Number,
    min: 1,
    required: true,
  }
});

const CarritoSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      unique: true
    },
    items: [CarritoItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Carrito', CarritoSchema);