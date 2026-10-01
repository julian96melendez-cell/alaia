"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("../../node_modules/typescript");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("crypto");
const mobile = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require("node:path").join(__dirname, "../../services/checkoutIntent.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: mobile });
function fixture() {
 const data = new Map(); let randomCalls = 0;
 const storage = { getItem: async key => data.get(key) || null, setItem: async (key, value) => data.set(key, value), removeItem: async key => data.delete(key) };
 const make = () => mobile.createCheckoutIntentStore(storage, () => `fixture-intention-random-${++randomCalls}`, async value => crypto.createHash('sha256').update(value).digest('hex'));
 return { data, make, randomCalls: () => randomCalls };
}
test("client key survives retries and screen remount without storing secrets or address", async () => {
 const h = fixture(); const payload = { shippingAddress: { street: 'private fixture address' } };
 const a = await h.make().get('buyer', payload); const b = await h.make().get('buyer', payload);
 assert.equal(a.key, b.key); assert.equal(h.randomCalls(), 1);
 assert.equal([...h.data.values()][0].includes('private fixture address'), false);
 assert.deepEqual(Object.keys(JSON.parse([...h.data.values()][0])).sort(), ['fingerprint', 'key', 'submitted']);
});
test("double client requests on the same store generate one opaque key", async () => {
 const h = fixture(); const store = h.make(); const [a, b] = await Promise.all([store.get('buyer', {}), store.get('buyer', {})]);
 assert.equal(a.key, b.key); assert.equal(h.randomCalls(), 1);
});
test("commercial edits do not silently replace the key of an active intention", async () => {
 const h = fixture(); const store = h.make(); const a = await store.get('buyer', { items: 1 }); const b = await store.get('buyer', { items: 2 });
 assert.equal(a.key, b.key); assert.equal(b.matchesPayload, false);
});
test("new purchase gets another key only after explicit completion of the same owner/key", async () => {
 const h = fixture(); const store = h.make(); const a = await store.get('buyer', {});
 await store.complete('buyer', 'another-key'); assert.equal((await store.get('buyer', {})).key, a.key);
 await store.complete('buyer', a.key); assert.notEqual((await store.get('buyer', {})).key, a.key);
});
test("submitted intent persists, isolates users and never clears a changed cart through an old digest", async () => {
 const h = fixture(); const store = h.make(); const a = await store.get('buyer', { cart: 'old' }); await store.submitted('buyer', a.key);
 const remounted = await h.make().get('buyer', { cart: 'new' });
 assert.equal(remounted.submitted, true); assert.equal(remounted.fingerprint, a.fingerprint); assert.equal(remounted.matchesPayload, false);
 assert.notEqual((await store.get('other-buyer', {})).key, a.key);
});
