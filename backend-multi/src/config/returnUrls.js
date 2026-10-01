"use strict";
function validateReturnUrl(value, name) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw new Error(`Configura ${name} con una URL de retorno válida`); }
  const local = /^(localhost|127\.|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?)/i.test(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || /tu-dominio|your-domain|example\.(com|org|net)|placeholder/i.test(url.hostname) || (process.env.NODE_ENV === "production" && (url.protocol !== "https:" || local))) {
    throw new Error(`${name} debe contener una URL de retorno real y segura`);
  }
  return url.toString();
}
module.exports = { validateReturnUrl };
