"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { financialOperationsEnabled, financialWriteGuard, assertFinancialOperationsEnabled } = require("../src/config/financialOperations");
const fs = require("node:fs"), path = require("node:path");
for (const value of [undefined, "false", "TRUE", "1", " true", "true ", "", "yes"]) test("financial switch fails closed: " + String(value), () => {
 assert.equal(financialOperationsEnabled({ ALAIA_FINANCIAL_OPERATIONS_ENABLED: value }), false);
});
test("only exact explicit true enables operations", () => assert.equal(financialOperationsEnabled({ALAIA_FINANCIAL_OPERATIONS_ENABLED:"true"}), true));
const routes = ["/api/stripe/checkout", "/api/stripe/payment-sheet", "/api/stripe/web/checkout-intent/cancel", "/api/stripe/checkout-intent/cancel", "/api/stripe/webhook", "/api/ordenes/crear", "/api/ordenes/admin/id/estado", "/api/ordenes/admin/id/pago", "/api/ordenes/admin/id/fulfillment", "/api/admin/payouts/id/retry", "/api/payments/stripe/checkout", "/api/payments/stripe/checkout-carrito", "/api/payments/stripe/checkout-orden", "/api/vendedor/me/stripe/onboarding", "/api/vendedor/me/stripe/sync", "/API/STRIPE/checkout", "/api/ORDENES/crear"];
function disabled(fn) { const old=process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED; delete process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED; try {fn();} finally {if(old===undefined)delete process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED;else process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED=old;} }
for (const route of routes) test("reject without downstream effects: " + route, () => disabled(() => {
 let called=0,status,body;
 financialWriteGuard({method:"POST",path:route},{status(n){status=n;return this;},json(b){body=b;}},()=>called++);
 assert.equal(called,0);assert.equal(status,503);assert.deepEqual(body,{ok:false,code:"FINANCIAL_OPERATIONS_DISABLED"});
}));
test("health, readiness, reads, login and administrative review remain reachable", () => disabled(() => {
 for(const [method,p] of [["GET","/healthz"],["GET","/readyz"],["GET","/api/ordenes/mias"],["POST","/api/auth/login"],["POST","/api/ordenes/admin/reconciliation/order_id/reviews"]]) {
 let next=0;financialWriteGuard({method,path:p},{status(){throw Error("unexpected rejection");}},()=>next++);assert.equal(next,1);
 }
 assert.throws(assertFinancialOperationsEnabled,{code:"FINANCIAL_OPERATIONS_DISABLED"});
}));
test("integrated gate precedes parsers, routes and worker start", () => {
 const s=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
 assert.ok(s.indexOf('app.use(require("./src/config/financialOperations").financialWriteGuard)')<s.indexOf('app.use("/api/stripe"'));
 assert.match(s,/API_WORKERS_ENABLED === "true" && require/);
});

test("checkout mutations reject before repository or provider calls", async () => {
 const old=process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED;delete process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED;
 try {
  let effects=0; const deps=new Proxy({}, {get(){effects++;throw Error("unexpected effect");}});
  const lifecycle=require("../src/services/checkoutLifecycle").createCheckoutLifecycle(deps,deps);
  for(const name of ["prepare","expire","cancel","cancelledWebhook","expiredWebhook","settlePaid","release"])
   await assert.rejects(lifecycle[name]({}),{code:"FINANCIAL_OPERATIONS_DISABLED"});
  assert.equal(effects,0);
 }finally{if(old===undefined)delete process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED;else process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED=old;}
});
test("HTTP financial routes reject before fake MongoDB, Stripe or auth; health stays open", async () => {
 const old=process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED;delete process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED;
 const http=require("node:http"),express=require("express");const app=express();let effects=0;
 app.use(financialWriteGuard);app.get("/healthz",(q,r)=>r.json({ok:true}));app.get("/readyz",(q,r)=>r.status(503).json({ok:false}));
 app.use((q,r)=>{effects++;r.sendStatus(200);});
 const server=http.createServer(app);
 try {
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const request=(method,path)=>new Promise((resolve,reject)=>{const q=http.request({host:"127.0.0.1",port:server.address().port,path,method},r=>{r.resume();r.on("end",()=>resolve(r.statusCode));});q.on("error",reject);q.end();});
  for(const path of routes)for(const method of ["POST","PUT","PATCH","DELETE"])assert.equal(await request(method,path),503);
  assert.equal(await request("GET","/healthz"),200);assert.equal(await request("GET","/readyz"),503);assert.equal(effects,0);
 }finally{await new Promise(resolve=>server.close(resolve));if(old===undefined)delete process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED;else process.env.ALAIA_FINANCIAL_OPERATIONS_ENABLED=old;}
});
