"use strict";
function preserveOmittedStock(body, payload) {
  if (!Object.hasOwn(body, "stock")) delete payload.stock;
  if (!Object.hasOwn(body, "gestionStock")) delete payload.gestionStock;
  return payload;
}
async function updateProductWithReservationGuard({ mongoose, Orden, Producto, filter, payload }) {
  if (!Object.hasOwn(payload, "stock") && !Object.hasOwn(payload, "gestionStock")) return Producto.findOneAndUpdate(filter, payload, { new: true, runValidators: true });
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const reserved = await Orden.exists({ "inventoryReservation.state": "reserved", "inventoryReservation.lines": { $elemMatch: { producto: filter._id } } }).session(session);
      if (reserved) throw Object.assign(new Error("Existe inventario reservado; no se puede sustituir stock ni gestión de stock"), { statusCode: 409, publicCode: "STOCK_RESERVED" });
      // Writing the same product as reserveProductStock causes a write conflict
      // if a competing reservation commits after this transaction's snapshot.
      result = await Producto.findOneAndUpdate(filter, payload, { new: true, runValidators: true, session });
    });
    return result;
  } finally { await session.endSession(); }
}
module.exports = { preserveOmittedStock, updateProductWithReservationGuard };
