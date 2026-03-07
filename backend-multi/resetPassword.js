require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Usuario = require("./src/models/Usuario");

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = "julian96melendez@gmail.com"; // ← tu email exacto
    const nuevaPassword = "12345678";

    const user = await Usuario.findOne({ email }).select("+password");

    if (!user) {
      console.log("❌ Usuario no encontrado");
      process.exit();
    }

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(nuevaPassword, salt);

    await user.save();

    console.log("✅ Password actualizada correctamente");
    process.exit();
  } catch (err) {
    console.error("Error:", err);
    process.exit();
  }
}

run();