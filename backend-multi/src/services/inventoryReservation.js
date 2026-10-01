"use strict";
// Stock is available-to-sell. Decrement only inside a mandatory Mongo transaction.
async function reserveProductStock(Producto, productoId, cantidad, session) {
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 100) throw Object.assign(new Error("Cantidad inválida"), { statusCode: 400 });
  if (!session) throw new Error("Inventory reservation requires a MongoDB transaction");
  const product = await Producto.findById(productoId).session(session).lean();
  if (!product || product.activo === false || product.visible === false) throw Object.assign(new Error("Producto no disponible"), { statusCode: 404 });
  if (product.gestionStock === false) return false;
  const result = await Producto.updateOne(
    { _id: productoId, activo: true, visible: { $ne: false }, gestionStock: { $ne: false }, stock: { $gte: cantidad } },
    { $inc: { stock: -cantidad } }, { session }
  );
  if (result.modifiedCount !== 1) throw Object.assign(new Error("Stock insuficiente"), { statusCode: 409 });
  return true;
}
module.exports = { reserveProductStock };
