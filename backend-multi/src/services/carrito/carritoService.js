// ==================================================
// carritoService.js — Lógica avanzada del carrito PRO
// ==================================================

const Carrito = require('../../models/carrito/carritoModel');
const Producto = require('../../models/Producto');

class CarritoService {

  async obtenerCarrito(usuarioId) {
    let carrito = await Carrito.findOne({ usuario: usuarioId }).populate('items.producto');
    if (!carrito) {
      carrito = await Carrito.create({ usuario: usuarioId, items: [] });
    }
    return carrito;
  }

  async agregarItem(usuarioId, productoId, cantidad = 1) {
    const producto = await Producto.findById(productoId);
    if (!producto) throw new Error('Producto no encontrado');

    let carrito = await this.obtenerCarrito(usuarioId);

    const itemExistente = carrito.items.find(i => i.producto.toString() === productoId);

    if (itemExistente) {
      itemExistente.cantidad += cantidad;
    } else {
      carrito.items.push({
        producto: productoId,
        cantidad
      });
    }

    await carrito.save();
    return carrito;
  }

  async actualizarCantidad(usuarioId, productoId, cantidad) {
    const carrito = await this.obtenerCarrito(usuarioId);

    const item = carrito.items.find(i => i.producto.toString() === productoId);

    if (!item) throw new Error('El producto no está en el carrito');

    item.cantidad = cantidad;
    await carrito.save();
    return carrito;
  }

  async eliminarItem(usuarioId, productoId) {
    const carrito = await this.obtenerCarrito(usuarioId);

    carrito.items = carrito.items.filter(i => i.producto.toString() !== productoId);

    await carrito.save();
    return carrito;
  }

  async vaciarCarrito(usuarioId) {
    const carrito = await Carrito.findOneAndUpdate(
      { usuario: usuarioId },
      { items: [] },
      { new: true }
    );

    return carrito;
  }
}

module.exports = new CarritoService();