"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { getAllowedOrigins, createOriginValidator } = require("../src/config/cors");
const { calculateCheckoutPricing, normalizeCheckoutItems } = require("../src/services/checkoutPricing");
const { createFirebaseAuth } = require("../src/middleware/firebaseAuth");
const { toPublicOrder, toPublicTimeline } = require("../src/dto/publicOrder");
const { sanitize, redactText } = require("../src/utils/safeLogging");

const ID = "0123456789abcdef01234567";
const address = { fullName: "Test Buyer", phone: "123456789", street: "Test Street", city: "Test City", state: "Test State", zip: "00000" };
const mongoose = { Types: { ObjectId: { isValid: (value) => /^[a-f\d]{24}$/i.test(value) } } };

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}

// Executes only source definitions. Network/DB/SDK modules are replaced before evaluation.
function loadSource(file, mocks, extra = {}) {
  const filename = path.join(__dirname, "..", file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const context = {
    module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : name === "../services/checkoutLifecycle" ? { getLifecycle: () => ({ settlePaid: async () => ({ managed: false }) }) } : localRequire(name),
    console: { log() {}, warn() {}, error() {} },
    process: { env: {} }, Buffer, Date, Math, Set, Map,
    setInterval: () => 1, clearInterval() {}, ...extra,
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return module.exports;
}

test("CORS accepts only explicit origins and legitimate native requests", () => {
  const allowed = getAllowedOrigins({ CORS_ALLOWED_ORIGINS: "https://shop.example,https://admin.example" });
  const validate = createOriginValidator(allowed);
  for (const origin of [undefined, "https://shop.example", "https://admin.example"]) {
    validate(origin, (error, ok) => { assert.equal(error, null); assert.equal(ok, true); });
  }
  for (const origin of ["https://attacker.vercel.app", "https://shop.example.attacker.test", "null", "http://localhost:3000"]) {
    validate(origin, (error) => assert.equal(error.statusCode, 403));
  }
  assert.throws(() => getAllowedOrigins({ CLIENT_URL: "https://*.vercel.app/path" }));
  assert.throws(() => getAllowedOrigins({ CLIENT_URL: "https://user:pass@shop.example" }));
});

test("Firebase token verification checks revocation and never accepts body identity", async () => {
  const verifier = createFirebaseAuth(() => ({ verifyIdToken: async (token, revoked) => {
    assert.equal(token, "fixture-token"); assert.equal(revoked, true);
    return { uid: "verified-buyer", email: "buyer@example.test" };
  } }));
  const req = { headers: { authorization: "Bearer fixture-token", "idempotency-key": "fixture-checkout-key-00000001" }, body: { userId: "attacker-choice" } };
  let called = false;
  await verifier(req, response(), () => { called = true; });
  assert.equal(called, true); assert.equal(req.firebaseUser.uid, "verified-buyer");
  for (const headers of [{}, { authorization: "Basic fixture-token" }, { authorization: "Bearer bad token" }]) {
    const res = response(); await verifier({ headers }, res, () => assert.fail("must reject"));
    assert.equal(res.statusCode, 401);
  }
  const reject = createFirebaseAuth(() => ({ verifyIdToken: async () => { throw new Error("revoked fixture"); } }));
  const res = response(); await reject(req, res, () => assert.fail("must reject")); assert.equal(res.statusCode, 401);
});

test("public DTO strips internal financial fields and all raw event metadata", () => {
  const order = {
    _id: ID, total: 40, estadoPago: "pagado", estadoFulfillment: "procesando", createdAt: "2026-01-01",
    clienteEmail: "private@example.test", direccionEntrega: address,
    stripePaymentIntentId: "private-fixture", stripeSessionId: "private-fixture",
    totalCostoProveedor: 2, gananciaTotal: 38, comisionTotal: 5,
    items: [{ nombre: "Item", cantidad: 2, precioUnitario: 20, subtotal: 40, proveedor: "private-fixture", costoProveedorUnitario: 1, vendedor: ID, ingresoVendedor: 35, comisionMonto: 5 }],
    historial: [
      { estado: "creada", fecha: "2026-01-01", meta: { secret: "private-fixture" }, source: "private-fixture" },
      { estado: "fulfillment_procesando", fecha: "2026-01-02", meta: { proveedor: "private-fixture" } },
      { estado: "private-fixture", fecha: "2026-01-03", meta: {} },
      { estado: "creada", fecha: "invalid date" },
    ],
  };
  const dto = toPublicOrder(order);
  assert.equal(dto.status, "en_preparacion"); assert.equal(dto.itemsCount, 2); assert.equal(dto.total, 40);
  const serialized = JSON.stringify({ dto, timeline: toPublicTimeline(order) });
  for (const blocked of ["private-fixture", "proveedor", "vendedor", "comision", "ganancia", "Costo", "stripe", "clienteEmail", "direccionEntrega", '"meta"', '"source"']) {
    assert.equal(serialized.includes(blocked), false, blocked);
  }
  assert.equal(dto.historial.length, 2);
  assert.equal(toPublicTimeline(order).timeline.at(-1).isCurrent, true);
});

test("server pricing enforces coupon policy and quantity limits", () => {
  const items = [{ subtotal: 80, category: "general" }];
  assert.deepEqual(calculateCheckoutPricing(items, "", {}), { subtotal: 80, shipping: 6.99, tax: 5.6, discount: 0, total: 92.59 });
  assert.equal(calculateCheckoutPricing(items, "BIENVENIDO10", {}).total, 84.59);
  assert.equal(calculateCheckoutPricing([{ subtotal: 150, category: "vip" }], "VIP20", {}).discount, 30);
  assert.throws(() => calculateCheckoutPricing(items, "UNAPPROVED", {}));
  assert.throws(() => calculateCheckoutPricing(items, "__proto__", {}));
  assert.throws(() => calculateCheckoutPricing([{ subtotal: 10 }], "BIENVENIDO10", {}));
  assert.throws(() => calculateCheckoutPricing(items, "", { CHECKOUT_TAX_RATE: "invalid" }));
  assert.deepEqual(normalizeCheckoutItems([{ producto: ID, cantidad: 1 }, { producto: ID, cantidad: 2 }]), [{ producto: ID, cantidad: 3 }]);
  for (const cantidad of [-1, 0, 1.5, 101, Infinity]) assert.throws(() => normalizeCheckoutItems([{ producto: ID, cantidad }]));
});

function checkoutHarness(productOverrides = {}) {
  const routes = new Map();
  let created; let payment;
  const router = { post: (route, ...handlers) => routes.set(route, handlers), get: (route, ...handlers) => routes.set(route, handlers) };
  loadSource("src/routes/stripeRoutes.js", {
    express: { Router: () => router }, mongoose,
    "../models/Producto": { find: () => ({ lean: async () => [{ _id: ID, nombre: "Item", precioFinal: 40, costoProveedor: 5, categoria: "general", gestionStock: true, stock: 10, ...productOverrides }] }) },
    "../services/checkoutLifecycle": {
      prepareCheckout: async ({ uid, email, key, input, buildOrder }) => {
        require("../src/services/checkoutLifecycle").identity(uid, key);
        created = await buildOrder({ ...input, firebaseUserId: uid, userEmail: email });
        const order = { ...created, _id: ID };
        payment = { amount: Math.round(order.total * 100), metadata: { ordenId: ID, userId: uid, firebaseUserId: uid } };
        return { order, clientSecret: "fixture-client-secret" };
      },
    },
    "../models/Orden": { create: async (payload) => { created = payload; return { ...payload, _id: ID, save: async () => {} }; }, updateOne: async () => ({}) },
    "../middleware/firebaseAuth": { verificarFirebase: createFirebaseAuth(() => ({ verifyIdToken: async () => ({ uid: "verified-buyer", email: "buyer@example.test" }) })) },
    "../controllers/ordenController": { crearOrdenYCheckoutStripe() {} },
    "../payments/stripeWebhookController": { procesarWebhookStripe() {} },
    "../payments/stripeService": { crearPaymentIntentMobile: async (payload) => { payment = payload; return { paymentIntentId: "pi_fixture", clientSecret: "fixture-client-secret", amount: payload.amount }; } },
  });
  return { routes, created: () => created, payment: () => payment };
}

test("mobile route ignores forged amounts and identity and persists the verified buyer/address", async () => {
  const harness = checkoutHarness();
  const [auth, checkout] = harness.routes.get("/payment-sheet");
  const req = { headers: { authorization: "Bearer fixture-token", "idempotency-key": "fixture-checkout-key-00000001" }, body: {
    userId: "forged", userEmail: "forged@example.test", orderId: "forged", currency: "eur",
    amount: 0.01, total: 0.01, subtotal: 0.01, tax: 0, shipping: 0, discount: 999,
    metadata: { userId: "forged", ordenId: "forged" },
    items: [{ producto: ID, cantidad: 2, price: 0.01 }], shippingAddress: address,
  }, socket: {} };
  const res = response();
  await auth(req, res, () => {}); await checkout(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(harness.created().firebaseUserId, "verified-buyer");
  assert.equal(harness.created().clienteEmail, "buyer@example.test");
  assert.equal(harness.created().direccionEntrega.direccion, address.street);
  assert.equal(harness.created().estadoPago, "pendiente");
  assert.equal(harness.created().discount, 0);
  assert.equal(harness.payment().amount, 9259);
  assert.equal(harness.payment().metadata.userId, "verified-buyer");
  assert.equal(res.body.pricing.total, 92.59);
});

test("mobile route rejects stock/currency/coupon/address issues before contacting Stripe", async () => {
  for (const [product, body, status] of [
    [{ stock: 0 }, {}, 409], [{ moneda: "eur" }, {}, 400], [{ precioFinal: 6000 }, {}, 400],
    [{}, { couponCode: "UNAPPROVED" }, 400], [{}, { shippingAddress: {} }, 400],
  ]) {
    const harness = checkoutHarness(product);
    const req = { headers: { "idempotency-key": "fixture-checkout-key-00000001" }, firebaseUser: { uid: "buyer", email: "buyer@example.test" }, body: { items: [{ producto: ID, cantidad: 1 }], shippingAddress: address, ...body }, socket: {} };
    const res = response(); await harness.routes.get("/payment-sheet")[1](req, res);
    assert.equal(res.statusCode, status); assert.equal(harness.payment(), undefined); assert.equal(harness.created(), undefined);
  }
});

test("logs redact structured tokens, client secrets, URI credentials and raw SDK errors", () => {
  const serialized = JSON.stringify(sanitize({ password: "fixture-password", clientSecret: "fixture-secret", nested: { idToken: "fixture-token" }, error: new Error("fixture-private-error") }));
  for (const value of ["fixture-password", "fixture-secret", "fixture-token", "fixture-private-error"]) assert.equal(serialized.includes(value), false);
  assert.equal(redactText("mongodb+srv://user:fixture-password@example.test/db").includes("fixture-password"), false);
  assert.equal(redactText('response {"clientSecret":"fixture-secret","idToken":"fixture-token"}').includes("fixture-secret"), false);
});

test("public SSE sanitizes snapshots and both emitter call signatures", async () => {
  const raw = { _id: ID, estadoPago: "pagado", estadoFulfillment: "pendiente", historial: [{ estado: "creada", fecha: "2026-01-01", meta: { secret: "private-fixture" } }], stripePaymentIntentId: "private-fixture", items: [] };
  const controller = loadSource("src/controllers/ordenRealtimeController.js", {
    mongoose, "../models/Orden": { findById: () => ({ select: () => ({ lean: async () => raw }) }) },
  });
  const messages = [];
  const res = { setHeader() {}, flushHeaders() {}, setTimeout() {}, write: (message) => messages.push(message), end() {} };
  await controller.conectarOrdenStream({ params: { id: ID }, on() {} }, res);
  controller.emitOrdenUpdate(raw); controller.emitOrdenUpdate(ID, raw);
  assert.equal(messages.length, 3); assert.equal(messages.join("").includes("private-fixture"), false);
  assert.equal(messages.join("").includes('"estadoPago":"pagado"'), true);
});

test("HTTP admin updates cannot override Stripe payment state", async () => {
  let saved = false;
  const order = { _id: ID, paymentProvider: "stripe", metodoPago: "stripe", estadoPago: "pendiente", historial: [], save: async () => { saved = true; } };
  const controller = loadSource("src/controllers/adminOrdenController.js", {
    mongoose, "../models/Orden": { findById: () => ({ populate: async () => order }) },
    "../services/payoutService": {}, "../services/firestoreAdminOrderSync": {},
    "./ordenRealtimeController": {}, "../services/emailService": {}, "../models/Usuario": {},
  });
  const res = response();
  await controller.adminActualizarEstado({ usuario: { rol: "admin" }, params: { id: ID }, headers: { "idempotency-key": "fixture-checkout-key-00000001" }, body: { estadoPago: "pagado" } }, res);
  assert.equal(res.statusCode, 400); assert.equal(saved, false); assert.equal(order.estadoPago, "pendiente");
});

test("mobile history filters by verified UID and uses the buyer DTO", async () => {
  let filter;
  const raw = { _id: ID, total: 40, estadoPago: "pendiente", items: [], stripePaymentIntentId: "private-fixture" };
  const query = { select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => [raw] };
  const controller = loadSource("src/controllers/ordenController.js", {
    mongoose, "../models/Orden": { find: (value) => { filter = value; return query; } },
    "../models/Producto": {}, "../payments/stripeService": {},
  });
  const res = response();
  await controller.obtenerMisOrdenesMobile({ firebaseUser: { uid: "verified-buyer" }, body: { userId: "forged" } }, res, (error) => { throw error; });
  assert.equal(filter.firebaseUserId, "verified-buyer");
  assert.equal(res.body.data[0]._id, ID);
  assert.equal(JSON.stringify(res.body).includes("private-fixture"), false);
});

function webhookHarness(ledger, order = {}, syncCache = async () => false) {
  const event = { id: "evt_fixture", type: "payment_intent.succeeded", data: { object: { id: "pi_fixture", amount: 4000, amount_received: 4000, currency: "usd", metadata: { ordenId: ID, source: "mobile_payment_sheet" } } } };
  const mocks = {
    "../models/Orden": order,
    "../services/financialCoordinator": { applyFinancialEvent: async (_id, fields) => order.applyFinancial(fields) },
    "../models/WebhookEvent": ledger,
    "./stripeService": {
      construirEventoDesdeWebhook: () => event,
      resumirEventoStripe: () => ({ eventId: event.id, eventType: event.type, ordenId: ID }),
    },
    "../services/emailService": {},
    "../services/firestoreOrderSync": { updateFirestoreOrderFromStripe: syncCache },
  };
  return loadSource("src/payments/stripeWebhookController.js", mocks, { process: { env: { EMAIL_ON_PAYMENT: "false" } } });
}

test("webhook returns retryable errors when its ledger is unavailable or still processing", async () => {
  const req = { headers: { "stripe-signature": "fixture-signature" }, body: Buffer.from("{}") };
  let writes = 0;
  for (const ledger of [
    { create: async () => { throw new Error("DB unavailable"); } },
    { create: async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); }, findOneAndUpdate: async () => null, findOne: async () => ({ status: "received" }) },
  ]) {
    const controller = webhookHarness(ledger, { updateOne: async () => { writes++; } });
    const res = response(); await controller.procesarWebhookStripe(req, res);
    assert.equal(res.statusCode, 503);
  }
  assert.equal(writes, 0);
});

test("webhook reclaims failed delivery atomically and marks paid only after a verified event", async () => {
  let paymentUpdate; let claim;
  let cacheWrites = 0;
  const ledger = {
    create: async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); },
    findOneAndUpdate: async (filter) => { claim = filter; return { _id: ID, status: "received" }; },
    updateOne: async () => ({}),
  };
  const order = {
    findById: () => ({ select: () => ({ then: resolve => resolve({ _id: ID, stripePaymentIntentId: "pi_fixture", total: 40, moneda: "usd", estadoPago: "pendiente" }), lean: async () => ({ total: 40, moneda: "usd", estadoPago: "pendiente" }) }) }),
    updateOne: async () => ({}),
    applyFinancial: async fields => { paymentUpdate = { $set: fields }; return { _id: ID }; },
  };
  const controller = webhookHarness(ledger, order, async () => { cacheWrites++; });
  const res = response();
  await controller.procesarWebhookStripe({ headers: { "stripe-signature": "fixture-signature" }, body: Buffer.from("{}") }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(paymentUpdate.$set.estadoPago, "pagado");
  assert.equal(claim.$or[0].status, "failed");
  assert.equal(claim.$or[1].status, "received");
  assert.equal(cacheWrites, 0);
});

test("webhook refuses invalid signatures before writing anything", async () => {
  const controller = loadSource("src/payments/stripeWebhookController.js", {
    "../models/Orden": {}, "../models/WebhookEvent": {},
    "./stripeService": { construirEventoDesdeWebhook: () => { throw new Error("fixture-private-error"); } },
    "../services/emailService": {}, "../services/firestoreOrderSync": {},
  });
  const res = response();
  await controller.procesarWebhookStripe({ headers: { "stripe-signature": "invalid" }, body: Buffer.from("{}") }, res);
  assert.equal(res.statusCode, 400); assert.equal(res.body.includes("fixture-private-error"), false);
});
