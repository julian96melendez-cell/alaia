"use strict";

const round2 = (number) => Math.round(number * 100) / 100;
const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });

function readNumber(env, key, fallback, max = Infinity) {
  const value = env[key] === undefined || env[key] === "" ? fallback : Number(env[key]);
  if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Configuración inválida: ${key}`);
  return value;
}

// These defaults preserve the existing mobile policy; clients cannot override them.
function calculateCheckoutPricing(items, couponCode = "", env = process.env) {
  const taxRate = readNumber(env, "CHECKOUT_TAX_RATE", 0.07, 1);
  const shippingFee = readNumber(env, "CHECKOUT_SHIPPING_FEE", 6.99);
  const freeShippingAbove = readNumber(env, "CHECKOUT_FREE_SHIPPING_ABOVE", 100);
  const subtotal = round2(items.reduce((sum, item) => sum + item.subtotal, 0));
  const shipping = subtotal > freeShippingAbove ? 0 : round2(shippingFee);
  const tax = round2(subtotal * taxRate);
  let discount = 0;
  if (typeof couponCode !== "string") throw invalid("Código de cupón inválido");
  const code = couponCode.trim().toUpperCase();
  if (code) {
    const coupons = {
      BIENVENIDO10: { min: 30, rate: 0.10 },
      ENVIOFREE: { min: 50, fixed: 6.99 },
      VIP20: { min: 120, rate: 0.20, category: "vip" },
    };
    const coupon = Object.hasOwn(coupons, code) ? coupons[code] : null;
    if (!coupon) throw invalid("Cupón inválido o no reconocido");
    if (subtotal < coupon.min) throw invalid("No se cumple el mínimo del cupón");
    const base = coupon.category
      ? items.filter((item) => String(item.category).toLowerCase() === coupon.category).reduce((sum, item) => sum + item.subtotal, 0)
      : subtotal;
    discount = round2(Math.min(subtotal, coupon.fixed ?? base * coupon.rate));
  }
  const total = round2(subtotal + tax + shipping - discount);
  if (!Number.isFinite(total) || total <= 0) throw invalid("Total de orden inválido");
  return { subtotal, shipping, tax, discount, total };
}

function normalizeCheckoutItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw invalid("Envía entre 1 y 100 productos");
  const combined = new Map();
  for (const item of items) {
    const producto = String(item?.producto || item?.productId || item?.id || "");
    const cantidad = Number(item?.cantidad ?? item?.quantity);
    if (!/^[a-f\d]{24}$/i.test(producto) || !Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 100) {
      throw invalid("Producto o cantidad inválidos");
    }
    const key = producto.toLowerCase();
    const quantity = (combined.get(key) || 0) + cantidad;
    if (quantity > 100) throw invalid("Cantidad máxima excedida");
    combined.set(key, quantity);
  }
  return [...combined].map(([producto, cantidad]) => ({ producto, cantidad }));
}

module.exports = { calculateCheckoutPricing, normalizeCheckoutItems };
