// Regla avanzada simple (luego la hacemos por categoría/país)
const DEFAULT_MARGIN_PERCENT = 20; // 20%
const MIN_MARGIN_USD = 2;          // mínimo $2

function calcularPrecioFinal(precioBase) {
  const base = Number(precioBase) || 0;
  const margenPct = base * (DEFAULT_MARGIN_PERCENT / 100);
  const margen = Math.max(margenPct, MIN_MARGIN_USD);
  const precioFinal = Math.round((base + margen) * 100) / 100; // 2 decimales
  return { margen: Math.round(margen * 100) / 100, precioFinal };
}

module.exports = { calcularPrecioFinal };