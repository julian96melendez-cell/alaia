"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");
const Stripe = require("stripe");
const secret = "whsec_synthetic_http_fixture";
const privateText = "PRIVATE_WEBHOOK_SENTINEL";
const sdk = new Stripe("sk_test_synthetic_unused");
const forbidden = () => { throw Error("External/financial dependency forbidden"); };
function load(relative, dependencies, logs, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src", relative), "utf8"), {
    module, exports: module.exports, Buffer, Date, process: { env },
    console: Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args) => logs.push({ level, args })])),
    require(name) {
      if (name === "../config/financialOperations") return require("../src/config/financialOperations");
      assert.ok(Object.hasOwn(dependencies, name), `Forbidden import: ${name}`);
      return dependencies[name];
    },
  }, { filename: relative });
  return module.exports;
}
function signature(body, timestamp = Math.floor(Date.now()/1000), signingSecret = secret) {
  return `t=${timestamp},v1=${crypto.createHmac("sha256", signingSecret).update(`${timestamp}.${body}`).digest("hex")}`;
}
function payload() {
  return JSON.stringify({ id:"evt_http_synthetic", type:"payment_intent.succeeded", livemode:false,
    data:{object:{id:"pi_http_synthetic", object:"payment_intent", metadata:{source:"mobile_payment_sheet", privateText}}} });
}
async function harness(t, mode = "success") {
  const logs = [], calls = { verify:0, summary:0, ledgerCreate:0, ledgerUpdate:0, orderRead:0, financial:0 };
  let ledgerState, recovered = false;
  const ledger = {
    async create(fields) {
      calls.ledgerCreate++;
      if (mode === "unavailable") throw Error(privateText);
      if (mode === "pending" || (mode === "failed_retry" && !recovered)) throw Object.assign(Error(privateText), {code:11000});
      ledgerState = fields.status; return { _id:"ledger_fixture", status:fields.status };
    },
    async findOneAndUpdate(filter) {
      if (mode !== "failed_retry") return null;
      assert.equal(filter.$or[0].status, "failed");
      recovered = true; ledgerState = "received";
      return { _id:"ledger_fixture", status:"received" };
    },
    async findOne() { return {status:"received"}; },
    async updateOne(_filter, update) {
      calls.ledgerUpdate++;
      if (mode === "update_unavailable") throw Error(privateText);
      ledgerState = update.$set.status;
      return {acknowledged:true, matchedCount:1, modifiedCount:1};
    },
  };
  const service = load("payments/stripeService.js", {
    stripe: function() { return new Proxy({webhooks:sdk.webhooks}, {get(target,key) {
      if (key === "webhooks") return target.webhooks;
      return new Proxy({}, {get:()=>forbidden});
    }}); },
    "../config/returnUrls": {validateReturnUrl:forbidden},
  }, logs, {STRIPE_SECRET_KEY:"sk_test_synthetic_unused", STRIPE_WEBHOOK_SECRET:secret});
  const controller = load("payments/stripeWebhookController.js", {
    "./stripeService": {...service,
      construirEventoDesdeWebhook(...args) { calls.verify++; return service.construirEventoDesdeWebhook(...args); },
      resumirEventoStripe(...args) { calls.summary++; return service.resumirEventoStripe(...args); },
    },
    "../models/Orden": {
      findOne() { calls.orderRead++; return {select:()=>({lean:async()=>null})}; },
      updateOne() { calls.financial++; return forbidden(); },
    },
    "../models/WebhookEvent":ledger,
    "../services/checkoutLifecycle":{getLifecycle:forbidden},
    "../services/emailService":{enviarCorreoOrdenPagada:forbidden},
    "../services/firestoreOrderSync":{updateFirestoreOrderFromStripe:forbidden},
  }, logs, {EMAIL_ON_PAYMENT:"false"});
  const router = load("routes/stripeRoutes.js", {
    express, crypto, mongoose:{}, "../models/Orden":{}, "../models/Producto":{},
    "../services/checkoutLifecycle":{prepareCheckout:forbidden,getLifecycle:forbidden},
    "../dto/publicOrder":{toPublicOrder:forbidden}, "../middleware/auth":{proteger:forbidden},
    "../middleware/firebaseAuth":{verificarFirebase:forbidden},
    "../services/checkoutPricing":{calculateCheckoutPricing:forbidden,normalizeCheckoutItems:forbidden},
    "../payments/stripeWebhookController":controller,
    "../controllers/ordenController":{crearOrdenYCheckoutStripe:forbidden},
    "../payments/stripeService":{crearPaymentIntentMobile:forbidden},
  }, logs);
  // Reproduce the production raw-before-JSON ordering without importing server.js.
  const app = express();
  app.use("/api/stripe/webhook", express.raw({type:"application/json",limit:"16kb"}));
  app.use((req,res,next) => req.originalUrl.startsWith("/api/stripe/webhook") ? next() : express.json()(req,res,next));
  app.use("/api/stripe", router);
  app.use((_err,_req,res,_next) => res.status(500).json({ok:false}));
  const server = http.createServer(app);
  const sockets = new Set(); server.on("connection",socket => { sockets.add(socket);socket.once("close",()=>sockets.delete(socket)); });
  t.after(async () => { for(const socket of sockets) socket.destroy(); await new Promise(resolve=>server.close(resolve)); });
  await new Promise((resolve,reject) => {server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  async function request(body, sig, contentType="application/json") {
    return new Promise((resolve,reject) => {
      const req=http.request({host:"127.0.0.1",port:server.address().port,path:"/api/stripe/webhook",method:"POST",
        headers:{"content-type":contentType,...(sig===undefined?{}:{"stripe-signature":sig})}},res=>{
        let text="";res.setEncoding("utf8");res.on("data",chunk=>text+=chunk);res.on("end",()=>resolve({status:res.statusCode,text}));
      });
      req.setTimeout(3000,()=>req.destroy(Error("Local HTTP timeout")));req.on("error",reject);req.end(body);
    });
  }
  return {request,logs,calls,state:()=>ledgerState};
}
for(const mode of ["invalid","altered","expired","missing","content_type"]) {
  test(`HTTP ${mode}: rejects before event processing or persistence; logs are redacted`,async t=>{
    const h=await harness(t), original=payload();
    const signed= mode==="invalid" ? signature(original,undefined,"whsec_wrong_synthetic") : mode==="expired" ? signature(original,Math.floor(Date.now()/1000)-1000) : signature(original);
    const body= mode==="altered" ? original+" " : original;
    const result=await h.request(body,mode==="missing"?undefined:signed,mode==="content_type"?"text/plain":"application/json");
    assert.equal(result.status,mode==="content_type"?415:400);
    assert.equal(h.calls.summary,0);assert.equal(h.calls.ledgerCreate,0);assert.equal(h.calls.ledgerUpdate,0);
    assert.equal(h.calls.orderRead,0);assert.equal(h.calls.financial,0);
    const visible=JSON.stringify(h.logs)+result.text;
    for(const sentinel of [secret,privateText,signed,original,"No signatures found","Timestamp outside"]) assert.ok(!visible.includes(sentinel));
    if(["invalid","altered","expired"].includes(mode)) {
      const entry=h.logs.find(row=>row.args[0].includes("Stripe signature invalid"));assert.ok(entry);
      assert.equal(JSON.parse(entry.args[0]).code,"STRIPE_SIGNATURE_INVALID");
      assert.equal(Object.hasOwn(JSON.parse(entry.args[0]),"err"),false);
    }
  });
}
test("HTTP valid signature: real SDK verifies raw bytes; unlinked synthetic event is quarantined without financial effects",async t=>{
  const h=await harness(t), body=payload();const result=await h.request(body,signature(body));
  assert.equal(result.status,200);assert.equal(h.calls.verify,1);assert.equal(h.calls.summary,1);
  assert.equal(h.calls.ledgerCreate,1);assert.equal(h.state(),"skipped");assert.equal(h.calls.financial,0);
});
for(const mode of ["unavailable","pending"]) {
  test(`HTTP ledger ${mode}: 503 without processed acknowledgement or financial mutations`,async t=>{
    const h=await harness(t,mode),body=payload();const result=await h.request(body,signature(body));
    assert.equal(result.status,503);assert.ok(!result.text.includes('"received":true'));
    assert.equal(h.calls.ledgerUpdate,0);assert.equal(h.calls.financial,0);
    assert.ok(!JSON.stringify(h.logs).includes(privateText));
  });
}
test("HTTP failed delivery can be reclaimed, while keeping financial effects blocked for an unlinked event",async t=>{
  const h=await harness(t,"failed_retry"),body=payload();const result=await h.request(body,signature(body));
  assert.equal(result.status,200);assert.equal(h.state(),"skipped");assert.equal(h.calls.financial,0);
});
test("HTTP final ledger write failure must remain retryable, never acknowledge success",async t=>{
  const h=await harness(t,"update_unavailable"),body=payload();const result=await h.request(body,signature(body));
  assert.equal(result.status,503);assert.ok(!result.text.includes('"received":true'));
  assert.equal(h.state(),"received");assert.equal(h.calls.financial,0);
  assert.ok(!JSON.stringify(h.logs).includes(privateText));
});
