"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { createRequire } = require("node:module");
const { createReconciliationReviewService } = require("../src/services/reconciliationReviewService");
const { parseKey, hash, validateReview, pagination, auditDTO } = require("../src/services/reconciliationContracts");
const { listPipeline, pendingEvents, createMongoRepository } = require("../src/services/reconciliationRepository");
const { createAdminReconciliationController, requireReviewOrigin } = require("../src/controllers/adminReconciliationController");
const Case = require("../src/models/ReconciliationCase");
const Audit = require("../src/models/ReconciliationAudit");
const ID = "aaaaaaaaaaaaaaaaaaaaaaaa", ACTOR = "bbbbbbbbbbbbbbbbbbbbbbbb", OTHER = "cccccccccccccccccccccccc";
const KEY = `order:${ID}`, EVENT = `event:${OTHER}`, IDEM = "review-idempotency-key-00001";
const copy = value => value == null ? value : structuredClone(value);
const source = {
  _id: ID, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"),
  inventoryReservation: { state: "reserved", needsReconciliation: true, lines: [{ producto: OTHER, cantidad: 1 }], reconciliationReason: "private-reason" },
  checkoutIntent: { keyHash: "private-hash", stripeCorrelation: "private-correlation" },
  estadoPago: "pendiente", estadoFulfillment: "pendiente", total: 10, moneda: "usd", payoutBlocked: true,
  direccionEntrega: { street: "private-address" }, clienteEmail: "private-email", stripeCustomerId: "private-customer", vendedorPayouts: [{ status: "bloqueado" }],
};
function harness(sources = new Map([[KEY, copy(source)]])) {
  const cases = new Map(), audits = new Map(); let lock = Promise.resolve(), failAudit = false;
  const repo = {
    getCase: async id => copy(cases.get(id)), getAudit: async id => copy(audits.get(id)),
    getSource: async reference => copy(sources.get(reference.key)),
    listAudits: async (id, options) => {
      const rows = [...audits.values()].filter(audit => audit.caseId === id).sort((a,b) => b.resultVersion - a.resultVersion);
      return { items: copy(rows.slice((options.page - 1) * options.limit, options.page * options.limit)), total: rows.length };
    },
    writeCase: async (record, expected, session) => {
      assert.ok(session);
      if (expected === 0 && cases.has(record._id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
      assert.equal(cases.get(record._id)?.version || 0, expected);
      cases.set(record._id, { ...copy(record), createdAt: new Date() });
    },
    createAudit: async (record, session) => {
      assert.ok(session); if (failAudit) throw new Error("fixture-audit-storage-failure");
      const saved = { ...copy(record), createdAt: new Date() }; audits.set(record._id, saved); return saved;
    },
    transaction: async fn => {
      const previous = lock; let release; lock = new Promise(resolve => { release = resolve; }); await previous;
      const oldCases = copy([...cases]), oldAudits = copy([...audits]);
      try { return await fn({ active: true }); }
      catch(error) { cases.clear(); audits.clear(); for (const [id,row] of oldCases) cases.set(id,row); for (const [id,row] of oldAudits) audits.set(id,row); throw error; }
      finally { release(); }
    },
  };
  repo.readSnapshot = fn => repo.transaction(fn);
  const service = createReconciliationReviewService(repo);
  return { service, repo, cases, audits, sources, failAudit: () => { failAudit = true; },
    input: async (key = KEY, overrides = {}) => {
      const detail = await service.detail(key, {});
      return { expectedVersion: detail.version, sourceVersion: detail.sourceVersion, status: "under_review", conclusion: "awaiting_evidence", evidence: [{ kind: "internal_ticket", reference: "OPS-123" }], ...overrides };
    },
  };
}
const rejected = code => error => error.publicCode === code;
function response() { return { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } }; }

test("review: read-only detail creates neither case nor audit and excludes private fields", async () => {
  const h=harness(); const result=await h.service.detail(KEY, {});
  assert.equal(result.version,0); assert.equal(result.source.operationalPending,true);
  assert.doesNotMatch(JSON.stringify(result), /private-|stripeCorrelation|clienteEmail|direccionEntrega|keyHash/);
  assert.equal(h.cases.size,0); assert.equal(h.audits.size,0);
});
test("review: evidence creates only administrative records, closing leaves operational blocks unchanged", async () => {
  const h=harness(); const original=copy([...h.sources]);
  const result=await h.service.review(KEY,await h.input(KEY,{status:"closed",conclusion:"payment_confirmed"}),IDEM,ACTOR);
  assert.equal(result.review.status,"closed"); assert.equal(result.financialActionsAllowed,false);
  assert.deepEqual([...h.sources],original); assert.equal(h.cases.size,1); assert.equal(h.audits.size,1);
  const detail=await h.service.detail(KEY,{});
  assert.equal(detail.source.needsReconciliation,true); assert.equal(detail.source.payoutBlocked,true); assert.equal(detail.source.paymentState,"pendiente");
});
test("review: exact retry replays original result even after a later review", async () => {
  const h=harness(), input=await h.input();
  await h.service.review(KEY,input,IDEM,ACTOR);
  await h.service.review(KEY,await h.input(KEY,{status:"closed",conclusion:"no_operational_resolution"}),IDEM+"later",ACTOR);
  const replay=await h.service.review(KEY,input,IDEM,ACTOR);
  assert.equal(replay.replayed,true); assert.equal(replay.review.version,1); assert.equal(h.audits.size,2);
  assert.equal((await h.service.detail(KEY,{})).version,2);
});
test("review: changed payload with the same idempotency key is rejected", async () => {
  const h=harness(), input=await h.input(); await h.service.review(KEY,input,IDEM,ACTOR);
  await assert.rejects(h.service.review(KEY,{...input,conclusion:"discrepancy"},IDEM,ACTOR),rejected("REVIEW_IDEMPOTENCY_CONFLICT"));
  assert.equal(h.audits.size,1);
});
test("review: simultaneous identical requests append once", async () => {
  const h=harness(),input=await h.input(); const results=await Promise.all([h.service.review(KEY,input,IDEM,ACTOR),h.service.review(KEY,input,IDEM,ACTOR)]);
  assert.equal(h.audits.size,1); assert.equal(results.filter(row=>row.replayed).length,1);
});
test("review: competing reviewers using the same version cannot overwrite each other", async () => {
  const h=harness(),input=await h.input(); const results=await Promise.allSettled([h.service.review(KEY,input,IDEM,ACTOR),h.service.review(KEY,input,IDEM,OTHER)]);
  assert.equal(results.filter(row=>row.status==="fulfilled").length,1);
  assert.equal(results.find(row=>row.status==="rejected").reason.publicCode,"REVIEW_STALE_VERSION"); assert.equal(h.audits.size,1);
});
test("review: stale administrative version fails before audit", async () => {
  const h=harness(),input=await h.input(); await h.service.review(KEY,input,IDEM,ACTOR);
  await assert.rejects(h.service.review(KEY,input,IDEM+"new",ACTOR),rejected("REVIEW_STALE_VERSION"));
});
test("review: changed observed operational source requires a fresh read", async () => {
  const h=harness(),input=await h.input(); h.sources.get(KEY).estadoPago="pagado";
  await assert.rejects(h.service.review(KEY,input,IDEM,ACTOR),rejected("REVIEW_STALE_VERSION")); assert.equal(h.audits.size,0);
});
test("review: audit failure rolls back administrative case, never touches financial sources", async () => {
  const h=harness(),input=await h.input(),before=copy([...h.sources]); h.failAudit();
  await assert.rejects(h.service.review(KEY,input,IDEM,ACTOR)); assert.equal(h.cases.size,0); assert.deepEqual([...h.sources],before);
});
test("review: historical flagged orders are inspectable without inventing Stripe binding", async () => {
  const h=harness(); delete h.sources.get(KEY).checkoutIntent;
  assert.equal((await h.service.detail(KEY,{})).source.managed,false);
  await h.service.review(KEY,await h.input(KEY,{conclusion:"discrepancy"}),IDEM,ACTOR);
  assert.equal(h.sources.get(KEY).checkoutIntent,undefined);
});
test("review: orphan/manual-review events stay separate despite metadata and reported order", async () => {
  const event={_id:OTHER,provider:"stripe",status:"skipped",eventId:"evt_fixture",updatedAt:new Date("2026-01-01"),ordenId:ID,summary:{ordenId:ID},raw:{metadata:{ordenId:ID,password:"private-password"}},errorMessage:"private-error"};
  const h=harness(new Map([[EVENT,event],[KEY,copy(source)]]));
  const result=await h.service.detail(EVENT,{}); assert.equal(result.sourceKind,"event");
  assert.doesNotMatch(JSON.stringify(result),/private-|ordenId|metadata|summary|raw/);
  await h.service.review(EVENT,await h.input(EVENT),IDEM,ACTOR);
  assert.equal(h.cases.values().next().value.sourceKind,"event"); assert.equal(h.cases.size,1);
});
test("review: nonexistent or unflagged sources cannot be opened by arbitrary ID", async () => {
  const h=harness(); h.sources.get(KEY).inventoryReservation.needsReconciliation=false;
  await assert.rejects(h.service.detail(KEY,{}),rejected("REVIEW_NOT_FOUND"));
  await assert.rejects(h.service.detail(EVENT,{}),rejected("REVIEW_NOT_FOUND"));
});
test("review: deleted source leaves audit accessible without inventing a new association", async () => {
  const h=harness(); await h.service.review(KEY,await h.input(),IDEM,ACTOR); h.sources.delete(KEY);
  const detail=await h.service.detail(KEY,{}); assert.equal(detail.source.missing,true); assert.equal(detail.audits.length,1);
});
test("review: audit pages are bounded and ordered by recorded version", async () => {
  const h=harness(); await h.service.review(KEY,await h.input(),IDEM,ACTOR); await h.service.review(KEY,await h.input(),IDEM+"next",ACTOR);
  const result=await h.service.detail(KEY,{page:"2",limit:"1"}); assert.equal(result.audits.length,1); assert.equal(result.audits[0].version,1); assert.equal(result.auditTotal,2);
});
test("review: validation rejects financial fields, prose, credentials, duplicate evidence and invalid versions", async () => {
  const h=harness(),input=await h.input();
  for(const body of [{...input,estadoPago:"pagado"},{...input,note:"free text"},{...input,actorId:OTHER},{...input,expectedVersion:-1},{...input,expectedVersion:1.5},{...input,sourceVersion:"bad"},{...input,status:"paid"},{...input,evidence:[]},{...input,evidence:[{kind:"stripe_object",reference:"pi_fixture_secret_private"}]},{...input,evidence:[{kind:"internal_ticket",reference:"user@example.invalid"}]},{...input,evidence:[...input.evidence,...input.evidence]},{...input,evidence:[{...input.evidence[0],password:"private"}]}]) assert.throws(()=>validateReview(body,IDEM));
  assert.throws(()=>validateReview(input,"short")); assert.throws(()=>parseKey("order:bad"));
});
test("review: query filters are allowlisted and pagination has a hard bound",()=>{
  for(const query of [{limit:"101"},{page:"0"},{page:"1000",limit:"100"},{limit:["1"]},{estadoPago:"pagado"},{status:"paid"},{kind:"unknown"}]) assert.throws(()=>pagination(query,true));
  assert.equal(pagination({limit:"100"},true).limit,100);
});
test("review: legacy audit output redacts unsupported evidence and unknown stored fields",()=>{
  const result=auditDTO({_id:ID,actorId:ACTOR,resultVersion:1,status:"under_review",conclusion:"discrepancy",evidence:[{kind:"private-kind",reference:"private-password"}],sourceSnapshot:{...source,raw:"private-raw",password:"private-password"},createdAt:new Date(),requestHash:"private-hash"});
  assert.doesNotMatch(JSON.stringify(result),/private-|requestHash|password|direccionEntrega/);
});

for(const [identity,status] of [[null,401],[{rol:"usuario"},403],[{rol:"vendedor"},403]]) test(`review controller: denies ${status} before service`,async()=>{
  let calls=0; const controller=createAdminReconciliationController(()=>{calls++; throw Error("forbidden");}); const res=response();
  await controller.list({usuario:identity,query:{}},res); assert.equal(res.statusCode,status); assert.equal(calls,0);
});
test("review controller: actor is the authenticated administrator and errors are sanitized",async()=>{
  let captured; const controller=createAdminReconciliationController(()=>({review:async(...args)=>{captured=args;throw new Error("private-uri private-password");}}));
  const res=response(); await controller.review({usuario:{_id:ACTOR,rol:"admin"},params:{caseKey:KEY},body:{},headers:{"idempotency-key":IDEM}},res);
  assert.equal(captured[3],ACTOR); assert.equal(res.statusCode,503); assert.doesNotMatch(JSON.stringify(res.body),/private-/); assert.equal(res.headers["Cache-Control"],"no-store");
});
test("review origin: rejects missing/null/hostile origins and non-JSON, permits exact allowlisted origin",()=>{
  const previous=process.env.CORS_ALLOWED_ORIGINS; process.env.CORS_ALLOWED_ORIGINS="https://admin.example.invalid";
  try {
    for(const origin of [undefined,"null","https://hostile.example.invalid","https://admin.example.invalid/path"]) { const res=response();requireReviewOrigin({headers:{origin,"content-type":"application/json"}},res,()=>assert.fail("unexpected next"));assert.equal(res.statusCode,403); }
    const res=response();requireReviewOrigin({headers:{origin:process.env.CORS_ALLOWED_ORIGINS,"content-type":"text/plain"}},res,()=>assert.fail());assert.equal(res.statusCode,415);
    let called=false; requireReviewOrigin({headers:{origin:process.env.CORS_ALLOWED_ORIGINS,"content-type":"application/json; charset=utf-8"}},response(),()=>{called=true;});assert.equal(called,true);
  } finally { if(previous===undefined) delete process.env.CORS_ALLOWED_ORIGINS;else process.env.CORS_ALLOWED_ORIGINS=previous; }
});
test("review routes: authentication/soloAdmin cover every route and origin protection covers sole write",()=>{
  const calls=[],router={use:(...args)=>calls.push(["use",...args]),get:(...args)=>calls.push(["get",...args]),post:(...args)=>calls.push(["post",...args])};
  const proteger=()=>{},soloAdmin=()=>{},origin=()=>{},handlers={list:()=>{},detail:()=>{},review:()=>{}};
  const filename=path.join(__dirname,"../src/routes/adminReconciliationRoutes.js"),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,"utf8"),{module,require:name=>name==="express"?{Router:()=>router}:name==="../middleware/auth"?{proteger,soloAdmin}:{createAdminReconciliationController:()=>handlers,requireReviewOrigin:origin}});
  assert.deepEqual(calls[0],["use",proteger,soloAdmin]); assert.equal(calls.length,4); assert.deepEqual(calls[3],["post","/:caseKey/reviews",origin,handlers.review]);
  const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8"); assert.ok(server.indexOf('app.use("/api/ordenes/admin/reconciliation"')<server.indexOf('app.use("/api/ordenes",'));
});
test("review repository: candidate query includes order flags, independent Stripe cases and closed flagged cases",()=>{
  const pipeline=listPipeline({page:1,limit:25},{events:"events",cases:"cases"},new Date("2026-01-01"));
  assert.equal(pipeline[0].$match.$or[0]["inventoryReservation.needsReconciliation"],true);
  assert.equal(pipeline[0].$match.$or[1]["inventoryReservation.state"],"reconciliation_required");
  assert.deepEqual(pendingEvents(new Date("2026-01-01")).$or[0].status.$in,["failed","skipped"]);
  assert.equal(pipeline.filter(stage=>stage.$unionWith).length,2);
  const serialized=JSON.stringify(pipeline);assert.doesNotMatch(serialized,/\$merge|\$out|ordenId|metadata|raw/);
  // Only persisted case-only rows exclude closed; live signals still include them.
  assert.equal(pipeline[3].$unionWith.pipeline[0].$match.status.$ne,"closed");
});
test("review Mongo repository: CAS update and audit creation use the same session without business writes",async()=>{
  const calls=[],session={endSession:async()=>calls.push("end"),withTransaction:async fn=>fn()};
  const cases={updateOne:async(filter,update,opts)=>{calls.push({filter,update,opts});return {modifiedCount:1};}},audits={create:async(rows,opts)=>{calls.push({rows,opts});return [{toObject:()=>rows[0]}];}};
  const repo=createMongoRepository({mongoose:{startSession:async()=>session},Case:cases,Audit:audits,Orden:new Proxy({}, {get:()=>{throw Error("Business write forbidden");}}),WebhookEvent:{}});
  await repo.transaction(async s=>{await repo.writeCase({_id:ID,status:"closed",lastAuditId:OTHER},1,s);await repo.createAudit({_id:OTHER},s);});
  assert.equal(calls[0].filter.version,1);assert.equal(calls[0].update.$inc.version,1);assert.equal(calls[0].opts.session,session);assert.equal(calls[1].opts.session,session);assert.equal(calls.at(-1),"end");
  cases.updateOne=async()=>({modifiedCount:0}); await assert.rejects(repo.writeCase({_id:ID},1,session),rejected("REVIEW_STALE_VERSION"));
});
test("review models: automatic creation/indexing disabled; case identity and append-only audit guarded",async()=>{
  for(const model of [Case,Audit]) {assert.equal(model.schema.options.autoIndex,false);assert.equal(model.schema.options.autoCreate,false);}
  const valid=new Case({_id:parseKey(KEY).caseId,caseKey:KEY,sourceKind:"order",sourceId:ID,status:"under_review",version:1,lastAuditId:OTHER});await valid.validate();
  valid.caseKey=EVENT; await assert.rejects(valid.validate());
  for(const op of [()=>Audit.updateOne({_id:ID},{$set:{status:"closed"}}),()=>Audit.updateMany({},{$set:{status:"closed"}}),()=>Audit.findOneAndUpdate({_id:ID},{$set:{status:"closed"}}),()=>Audit.deleteOne({_id:ID}),()=>Audit.deleteMany({}),()=>Audit.findOneAndDelete({_id:ID}),()=>Audit.replaceOne({_id:ID},{}),()=>Audit.bulkWrite([])]) await assert.rejects(op(),/append-only/);
});

test("review authentication: actual cookie middleware rejects revoked, inactive, locked and non-admin sessions",async()=>{
  const filename=path.join(__dirname,"../src/middleware/auth.js"),module={exports:{}};
  let profile={_id:ACTOR,rol:"admin",activo:true,tokenVersion:1};const authLogs=[];
  vm.runInNewContext(fs.readFileSync(filename,"utf8"),{module,exports:module.exports,require:name=>name==="./reconciliationLogging"?require("../src/middleware/reconciliationLogging"):name==="../models/Usuario"?{findById:()=>({select:async()=>profile})}:{verificarAccessToken:token=>{if(token!=="fixture_session")throw Error("invalid");return{id:ACTOR,tokenVersion:1};}},process:{env:{}},console:{error:(...args)=>authLogs.push(args)},Date});
  const {proteger,soloAdmin}=module.exports;
  async function check(cookies,expected) {
    const res=response();let allowed=false;
    await proteger({headers:{},cookies},res,()=>soloAdmin({usuario:profile},res,()=>{allowed=true;}));
    assert.equal(res.statusCode,expected);assert.equal(allowed,expected===200);
  }
  await check({},401);await check({alaia_access_token:"invalid"},401);
  await check({alaia_access_token:"fixture_session"},200);
  for(const [patch,expected] of [[{tokenVersion:2},401],[{activo:false},403],[{bloqueado:true},403],[{lockedUntil:new Date(Date.now()+60000)},403],[{rol:"usuario"},403],[{rol:"vendedor"},403]]) {
    profile={_id:ACTOR,rol:"admin",activo:true,tokenVersion:1,...patch};await check({alaia_access_token:"fixture_session"},expected);
  }
});
test("review: canonical evidence ordering is idempotent and rejected closes cannot bypass validation",async()=>{
  const h=harness(),input=await h.input(KEY,{evidence:[{kind:"internal_ticket",reference:"OPS-123"},{kind:"stripe_event",reference:"evt_fixture"}]});
  await h.service.review(KEY,input,IDEM,ACTOR);
  const repeat=await h.service.review(KEY,{...input,evidence:[...input.evidence].reverse()},IDEM,ACTOR);assert.equal(repeat.replayed,true);
  assert.throws(()=>validateReview({...input,status:"closed",conclusion:"awaiting_evidence"},IDEM));
  await assert.rejects(h.service.review(KEY,input,IDEM,"invalid-actor"),rejected("REVIEW_FORBIDDEN"));
});
test("review: duplicate-key race replays a committed audit or reports a stale version",async()=>{
  const h=harness(),input=await h.input();await h.service.review(KEY,input,IDEM,ACTOR);
  const saved=copy([...h.audits.values()][0]);let reads=0;
  const repo={...h.repo,getAudit:async()=>++reads===1?null:saved,transaction:async()=>{throw Object.assign(Error("duplicate"),{code:11000});}};
  const result=await createReconciliationReviewService(repo).review(KEY,input,IDEM,ACTOR);assert.equal(result.replayed,true);
  repo.getAudit=async()=>null;
  await assert.rejects(createReconciliationReviewService(repo).review(KEY,input,IDEM,ACTOR),rejected("REVIEW_STALE_VERSION"));
});
test("review: operational source projections contain no PII, metadata, correlation or payload",async()=>{
  const selections=[];const query={select:fields=>{selections.push(fields);return query;},session:()=>query,lean:async()=>null};
  const repo=createMongoRepository({mongoose:{},Orden:{findById:()=>query},WebhookEvent:{findById:()=>query},Case:{},Audit:{}});
  await repo.getSource(parseKey(KEY));await repo.getSource(parseKey(EVENT));
  assert.doesNotMatch(selections.join(" "),/stripeCorrelation|direccionEntrega|clienteEmail|raw|summary|errorMessage|ordenId/);
});
test("review audit model: validates structured evidence and forbids a second document save",async()=>{
  const operationHash=hash([KEY,ACTOR,IDEM]);
  const audit=new Audit({_id:operationHash.slice(0,24),caseId:parseKey(KEY).caseId,actorId:ACTOR,operationHash,requestHash:hash("request"),resultVersion:1,status:"under_review",conclusion:"discrepancy",evidence:[{kind:"internal_ticket",reference:"OPS-123"}],sourceSnapshot:{missing:true,operationalPending:false}});
  await audit.validate();const existing=Audit.hydrate(audit.toObject());
  await assert.rejects(existing.save(),/append-only/);
  audit.evidence=[{kind:"stripe_object",reference:"pi_fixture_secret_private"}];await assert.rejects(audit.validate());
});

test("review detail: interleaved commit and source change cannot mix case, source and audit snapshots", async () => {
  const h = harness(); await h.service.review(KEY, await h.input(), IDEM, ACTOR);
  let entered, release;
  const observed = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const repo = { ...h.repo,
    readSnapshot: async fn => fn({ cases: copy(h.cases), audits: copy(h.audits), sources: copy(h.sources) }),
    getCase: async (id, session) => { const row = session.cases.get(id); entered(); await gate; return row; },
    getSource: async (reference, session) => session.sources.get(reference.key),
    listAudits: async (id, options, session) => { const rows = [...session.audits.values()].filter(row => row.caseId === id); return { items: rows, total: rows.length }; },
  };
  const pending = createReconciliationReviewService(repo).detail(KEY, {});
  await observed;
  await h.service.review(KEY, await h.input(KEY, { status: "closed", conclusion: "discrepancy" }), IDEM + "race", ACTOR);
  h.sources.get(KEY).estadoPago = "pagado"; release();
  const old = await pending, fresh = await h.service.detail(KEY, {});
  assert.equal(old.version, 1); assert.equal(old.auditTotal, 1); assert.equal(old.audits[0].version, 1);
  assert.equal(old.source.paymentState, "pendiente"); assert.equal(old.readConsistency, "snapshot");
  assert.equal(fresh.version, 2); assert.equal(fresh.auditTotal, 2); assert.equal(fresh.source.paymentState, "pagado");
});
test("review repository: audit items and count share a single facet and the detail session", async () => {
  const mongoose = require("mongoose"), session = { marker: true }; let commands = 0;
  const Audit = { aggregate: pipeline => {
    commands++; assert.equal(String(pipeline[0].$match.caseId), ID);
    assert.equal(pipeline.at(-1).$facet.items[0].$skip, 2);
    assert.deepEqual(pipeline.at(-1).$facet.total, [{ $count: "count" }]);
    assert.equal(pipeline[1].$project.requestHash, undefined);
    return { option(options) { assert.equal(options.maxTimeMS, 2000); return this; }, session: async actual => { assert.equal(actual, session); return [{ items: [{ resultVersion: 1 }], total: [{ count: 3 }] }]; } };
  } };
  const repo = createMongoRepository({ mongoose, Audit, Orden: {}, WebhookEvent: {}, Case: {} });
  assert.deepEqual(await repo.listAudits(ID, { page: 2, limit: 2 }, session), { items: [{ resultVersion: 1 }], total: 3 });
  assert.equal(commands, 1); // No second find/count can observe a later insertion.
});
test("review list: source DTOs come from the aggregation even when sources change after it", async () => {
  let commands = 0;
  const Orden = { collection: { name: "orders" }, aggregate: pipeline => ({ option: async options => {
    assert.equal(options.maxTimeMS, 2000); commands++; assert.ok(pipeline.some(stage => stage.$lookup?.from === "orders"));
    assert.ok(pipeline.some(stage => stage.$lookup?.from === "events"));
    return [{ items: [{ _id: KEY, source: copy(source) }], total: [{ count: 1 }] }];
  } }), findById: () => { throw Error("Inconsistent follow-up read"); } };
  const repo = createMongoRepository({ mongoose: { startSession: () => { throw Error("union transaction forbidden"); } }, Orden, WebhookEvent: { collection: { name: "events" } }, Case: { collection: { name: "cases" } }, Audit: {} });
  const result = await repo.list({ page: 1, limit: 25 });
  assert.equal(commands, 1); assert.equal(result.readConsistency, "single_aggregation");
  assert.equal(result.items[0].source.paymentState, "pendiente"); assert.equal(result.total, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-|clienteEmail|direccionEntrega/);
});
test("review detail: snapshot transaction is explicit, sequential and always closes its session", async () => {
  let options, closed = 0; const session = { withTransaction: async (fn, opts) => { options = opts; await fn(); }, endSession: async () => { closed++; } };
  const repo = createMongoRepository({ mongoose: { startSession: async () => session }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  await assert.rejects(repo.readSnapshot(async actual => { assert.equal(actual, session); throw Error("fixture failure"); }), /fixture failure/);
  assert.equal(closed, 1); assert.deepEqual(options.readConcern, { level: "snapshot" }); assert.equal(options.readPreference, "primary");
});
