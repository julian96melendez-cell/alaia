const mongoose = require("mongoose");

const ordenTimelineSchema = new mongoose.Schema({
  ordenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Orden",
    required: true,
    index: true,
  },
  estado: {
    type: String,
    required: true,
  },
  descripcion: {
    type: String,
    required: true,
  },
  origen: {
    type: String,
    enum: ["sistema", "admin", "stripe"],
    default: "sistema",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("OrdenTimeline", ordenTimelineSchema);