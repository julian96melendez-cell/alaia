const fetch = require("node-fetch");
const Usuario = require("../models/Usuario");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

module.exports = async function enviarPush({
  usuarioId,
  title,
  body,
  data = {},
}) {
  const usuario = await Usuario.findById(usuarioId).lean();
  if (!usuario?.pushTokens?.length) return;

  const messages = usuario.pushTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data,
  }));

  await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
};