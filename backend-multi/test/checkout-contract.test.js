"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("../../node_modules/typescript");
const { createFirebaseAuth } = require("../src/middleware/firebaseAuth");
const ID = "0123456789abcdef01234567";
const address = { fullName: "Test Buyer", phone: "123456789", street: "Test Street", city: "Test City", state: "Test State", zip: "00000" };
const mongoose = { Types: { ObjectId: { isValid: value => /^[a-f\d]{24}$/i.test(value) } } };
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
const exportsMobile = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../services/checkout.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
 { exports: exportsMobile, fetch() { throw new Error("No real network allowed"); }, AbortController, setTimeout, clearTimeout });
const { requestCheckout, pricingChanged } = exportsMobile;
const input = { items: [{ producto: ID, cantidad: 1 }], couponCode: "", shippingAddress: address };
const pricing = { subtotal: 40, tax: 2.8, shipping: 6.99, discount: 0, total: 49.79 };
const user = { uid: "fixture-buyer", getIdToken: async () => "fixture-token" };
const success = async () => ({ ok: true, json: async () => ({ ok: true, data: { ordenId: ID, clientSecret: "fixture-sheet-credential", pricing } }) });
function loadSource(file, mocks, extra = {}) {
  const filename = path.join(__dirname, "..", file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const context = {
    module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name),
    console: { log() {}, warn() {}, error() {} },
    process: { env: {} }, Buffer, Date, Math, Set, Map,
    setInterval: () => 1, clearInterval() {}, ...extra,
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return module.exports;
}
function checkoutHarness(productOverrides = {}) {
  const routes = new Map();
  let created; let payment;
  const router = { post: (route, ...handlers) => routes.set(route, handlers) };
  loadSource("src/routes/stripeRoutes.js", {
    express: { Router: () => router }, mongoose,
    "../models/Producto": { find: () => ({ lean: async () => [{ _id: ID, nombre: "Item", precioFinal: 40, costoProveedor: 5, categoria: "general", gestionStock: true, stock: 10, ...productOverrides }] }) },
    "../models/Orden": { create: async (payload) => { created = payload; return { ...payload, _id: ID, save: async () => {} }; }, updateOne: async () => ({}) },
    "../middleware/firebaseAuth": { verificarFirebase: createFirebaseAuth(() => ({ verifyIdToken: async () => ({ uid: "verified-buyer", email: "buyer@example.test" }) })) },
    "../controllers/ordenController": { crearOrdenYCheckoutStripe() {} },
    "../payments/stripeWebhookController": { procesarWebhookStripe() {} },
    "../payments/stripeService": { crearPaymentIntentMobile: async (payload) => { payment = payload; return { paymentIntentId: "pi_fixture", clientSecret: "fixture-client-secret", amount: payload.amount }; } },
  });
  return { routes, created: () => created, payment: () => payment };
}

test("mobile obtains a refreshed token and sends only the secure request contract", async () => {
 let sent; let refresh;
 const result = await requestCheckout({ ...user, getIdToken: async flag => { refresh = flag; return "fixture-token"; } }, "/fixture", { ...input, userId: "forged", total: 0.01, discount: 999 }, async (_url, options) => { sent = options; return success(); });
 assert.equal(refresh, true); assert.equal(sent.headers.Authorization, "Bearer fixture-token");
 assert.deepEqual(Object.keys(JSON.parse(sent.body)).sort(), ["couponCode", "items", "shippingAddress"]);
 assert.equal(result.ordenId, ID); assert.equal(result.pricing.total, 49.79);
});
test("missing or expired session never contacts the backend", async () => {
 for (const account of [null, { ...user, getIdToken: async () => { throw new Error("expired"); } }]) {
  await assert.rejects(requestCheckout(account, "/fixture", input, async () => assert.fail("must not fetch")), error => error.code === "SESSION");
 }
});
test("client validates addresses and quantities before sending a token", async () => {
 for (const payload of [{ ...input, shippingAddress: {} }, { ...input, items: [{ producto: ID, cantidad: 0 }] }, { ...input, items: [{ producto: "invalid", cantidad: 1 }] }]) {
  await assert.rejects(requestCheckout(user, "/fixture", payload, async () => assert.fail("must not fetch")));
 }
});
test("mobile errors are categorized without exposing backend details", async () => {
 for (const [status, message, code] of [[401, "fixture internal", "SESSION"], [404, "fixture internal", "PRODUCT"], [409, "fixture internal", "STOCK"], [400, "Cupón inválido", "COUPON"], [400, "Dirección inválida", "ADDRESS"], [500, "fixture internal", "SERVER"]]) {
  await assert.rejects(requestCheckout(user, "/fixture", input, async () => ({ ok: false, status, json: async () => ({ message }) })), error => error.code === code && !error.message.includes("fixture internal"));
 }
 await assert.rejects(requestCheckout(user, "/fixture", input, async () => { throw new Error("fixture internal"); }), error => error.code === "NETWORK");
 await assert.rejects(requestCheckout(user, "/fixture", input, async () => ({ ok: false, status: 400, json: async () => ({ code: "STRIPE_ERROR", message: "fixture internal" }) })), error => error.code === "STRIPE" && !error.message.includes("fixture internal"));
});
test("authoritative price differences require a new confirmation; malformed response is rejected", async () => {
 assert.equal(pricingChanged(pricing, { ...pricing, total: 50 }), true);
 assert.equal(pricingChanged(pricing, { ...pricing, shipping: 5, tax: 4.79 }), true);
 assert.equal(pricingChanged(pricing, { ...pricing }), false);
 await assert.rejects(requestCheckout(user, "/fixture", input, async () => ({ ok: true, json: async () => ({ ok: true, data: { ordenId: ID, clientSecret: "fixture", pricing: { ...pricing, total: "49.79" } } }) })), error => error.code === "RESPONSE");
});
test("backend rejects absent token before checkout writes", async () => {
 const harness = checkoutHarness(); const res = response();
 await harness.routes.get("/payment-sheet")[0]({ headers: {}, body: input }, res, () => assert.fail("must reject"));
 assert.equal(res.statusCode, 401); assert.equal(harness.created(), undefined);
});
test("backend correlates verified identity/order/Stripe, ignores money and paid flag, returns minimal DTO", async () => {
 const harness = checkoutHarness(); const [authenticate, checkout] = harness.routes.get("/payment-sheet");
 const req = { headers: { authorization: "Bearer fixture-token" }, socket: {}, body: { ...input, userId: "forged", userEmail: "forged@example.test", total: .01, discount: 999, pagado: true, estadoPago: "pagado" } };
 const res = response(); await authenticate(req, res, () => {}); await checkout(req, res);
 assert.equal(res.statusCode, 201); assert.equal(harness.created().firebaseUserId, "verified-buyer");
 assert.equal(harness.created().estadoPago, "pendiente"); assert.equal(harness.created().discount, 0);
 assert.equal(harness.payment().amount, 4979); assert.equal(harness.payment().metadata.ordenId, ID);
 assert.equal(harness.payment().metadata.firebaseUserId, "verified-buyer");
 assert.deepEqual(Object.keys(res.body.data).sort(), ["clientSecret", "ordenId", "pricing"]);
 for (const key of ["paymentIntentId", "customerId", "ephemeralKeySecret", "stripeSecretKey", "firestoreOrderId"]) assert.equal(res.body[key], undefined);
 const mapping = { nombre: "fullName", telefono: "phone", direccion: "street", ciudad: "city", provincia: "state", codigoPostal: "zip" };
 for (const [field, source] of Object.entries(mapping)) assert.equal(harness.created().direccionEntrega[field], address[source]);
});
test("backend rejects invalid product/quantity, stock, coupon and address before Stripe", async () => {
 for (const [product, payload, status] of [[{}, { items: [{ producto: "invalid", cantidad: 1 }] }, 400], [{}, { items: [{ producto: ID, cantidad: 1.5 }] }, 400], [{ stock: 0 }, {}, 409], [{}, { couponCode: "INVALID" }, 400], [{}, { shippingAddress: {} }, 400], [{ _id: "ffffffffffffffffffffffff" }, {}, 404]]) {
  const harness = checkoutHarness(product); const res = response();
  await harness.routes.get("/payment-sheet")[1]({ firebaseUser: { uid: user.uid }, headers: {}, socket: {}, body: { ...input, ...payload } }, res);
  assert.equal(res.statusCode, status); assert.equal(harness.created(), undefined); assert.equal(harness.payment(), undefined);
 }
});
