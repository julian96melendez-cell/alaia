const express = require("express");
const router = express.Router();
const { proteger } = require("../middleware/auth");
const Usuario = require("../models/Usuario");

router.post("/register", proteger, async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ ok: false, message: "Token requerido" });
  }

  await Usuario.updateOne(
    { _id: req.usuario._id },
    { $addToSet: { pushTokens: token } }
  );

  res.json({ ok: true });
});

module.exports = router;