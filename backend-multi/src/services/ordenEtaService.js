// =====================================================
// ordenEtaService.js — ETA Inteligente (Amazon-like)
// =====================================================

const addMinutes = (date, m) => new Date(date.getTime() + m * 60000);
const addHours = (date, h) => new Date(date.getTime() + h * 3600000);

function calcularETA(orden) {
  const base = orden.updatedAt || orden.createdAt || new Date();

  switch (orden.estadoFulfillment) {
    case "pendiente":
      return addMinutes(base, 5);

    case "procesando":
      return addHours(base, 2);

    case "enviado":
      return addHours(base, 24);

    case "entregado":
      return new Date();

    default:
      return null;
  }
}

function progresoPorEstado(estado) {
  switch (estado) {
    case "pendiente": return 10;
    case "procesando": return 40;
    case "enviado": return 75;
    case "entregado": return 100;
    default: return 0;
  }
}

module.exports = {
  calcularETA,
  progresoPorEstado,
};