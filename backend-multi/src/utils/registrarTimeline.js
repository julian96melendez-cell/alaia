const OrdenTimeline = require("../models/OrdenTimeline");

async function registrarTimeline({ ordenId, estado, descripcion, origen }) {
  await OrdenTimeline.create({
    ordenId,
    estado,
    descripcion,
    origen,
  });
}

module.exports = registrarTimeline;