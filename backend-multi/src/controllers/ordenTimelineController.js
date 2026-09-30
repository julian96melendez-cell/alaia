"use strict";
const mongoose = require("mongoose");
const Orden = require("../models/Orden");
const { PUBLIC_ORDER_PROJECTION, toPublicTimeline } = require("../dto/publicOrder");

exports.obtenerTimelinePublico = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, message: "ID inválido" });
    }
    const orden = await Orden.findById(req.params.id).select(PUBLIC_ORDER_PROJECTION).lean();
    if (!orden) return res.status(404).json({ ok: false, message: "Orden no encontrada" });
    return res.json({ ok: true, message: "Timeline público", data: toPublicTimeline(orden) });
  } catch (error) { next(error); }
};
