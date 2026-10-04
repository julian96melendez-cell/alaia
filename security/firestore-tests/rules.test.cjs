'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../node_modules/typescript');
// Fail before importing SDKs for any non-emulator destination.
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8089');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, runTransaction, writeBatch } = require('firebase/firestore');
let env, alice, bob, guest, admin;
test.before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-alaia-rules', firestore: {
    host: '127.0.0.1', port: 8089, rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
  } });
  alice = env.authenticatedContext('alice', { email: 'alice@fixture.test' }).firestore();
  bob = env.authenticatedContext('bob', { email: 'bob@fixture.test' }).firestore();
  guest = env.unauthenticatedContext().firestore();
  admin = env.authenticatedContext('administrator', { admin: true }).firestore();
});
test.after(async () => { if (env) await env.cleanup(); });
function profile() { return { uid: 'alice', displayName: 'Alice', email: 'alice@fixture.test', photoURL: null, role: 'customer', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }; }
function item(id) { return { id, name: 'Fixture', price: 10, quantity: 1, image: null, color: null, size: null, category: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }; }
function clientPayload(relative, context) {
  const filename = path.join(__dirname, '../..', relative);
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const payloads = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'setDoc') payloads.push(node.arguments[1].getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(payloads.length, 1);
  const result = {};
  vm.runInNewContext(`exports.payload = (${payloads[0]});`, { exports: result, serverTimestamp, ...context });
  return { ...result.payload };
}
test('actual registration/profile payloads and cart normalizer are accepted by the emulator', async () => {
  const db = env.authenticatedContext('client-fixture', { email: 'client@fixture.test' }).firestore();
  const registration = clientPayload('app/(auth)/register.tsx', {
    credential: { user: { uid: 'client-fixture', photoURL: null } }, cleanName: 'Client', cleanEmail: 'client@fixture.test',
  });
  await assertSucceeds(setDoc(doc(db, 'users/client-fixture'), registration, { merge: true }));
  const changes = clientPayload('app/profile-info.tsx', { cleanName: 'Updated client' });
  assert.deepEqual(Object.keys(changes).sort(), ['displayName', 'updatedAt']);
  await assertSucceeds(setDoc(doc(db, 'users/client-fixture'), changes, { merge: true }));
  const source = fs.readFileSync(path.join(__dirname, '../../context/CartContext.tsx'), 'utf8');
  const start = source.indexOf('function normalizeItem('), end = source.indexOf('function clampQuantity(', start);
  assert.ok(start >= 0 && end > start);
  const javascript = ts.transpileModule('export ' + source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(javascript, { exports });
  for (const input of [{ id: 'plain', name: 'Plain', price: 5 }, { id: 'hints', name: 'Hints', price: 5, stock: 10, maxQty: 10 }]) {
    const data = exports.normalizeItem(input, 1);
    assert.equal(Object.values(data).includes(undefined), false);
    await assertSucceeds(setDoc(doc(db, `carts/client-fixture/items/${input.id}`), {
      ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(db, `carts/client-fixture/items/${input.id}`), { quantity: 2, updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(db, `carts/client-fixture/items/${input.id}`)));
  }
});
test('registration/profile: owner only, identity and privileges immutable', async () => {
  await assertFails(setDoc(doc(guest, 'users/alice'), profile()));
  await assertFails(setDoc(doc(bob, 'users/alice'), profile()));
  for (const extra of [{ role: 'admin' }, { admin: true }, { uid: 'bob' }, { email: 'bob@fixture.test' }, { balance: 100 }])
    await assertFails(setDoc(doc(alice, 'users/alice'), { ...profile(), ...extra }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice'), profile(), { merge: true }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice'), { displayName: 'New name', updatedAt: serverTimestamp() }, { merge: true }));
  await assertSucceeds(getDoc(doc(alice, 'users/alice')));
  await assertFails(getDoc(doc(bob, 'users/alice')));
  await assertFails(getDoc(doc(guest, 'users/alice')));
  await assertFails(getDocs(collection(alice, 'users')));
  for (const data of [{ role: 'admin' }, { admin: true }, { uid: 'bob' }, { email: 'new@fixture.test' }, { balance: 100 }, { createdAt: serverTimestamp() }])
    await assertFails(updateDoc(doc(alice, 'users/alice'), data));
  await assertFails(deleteDoc(doc(alice, 'users/alice')));
});
test('active and legacy carts: transactions, listing and batch deletion stay owner-only', async () => {
  for (const base of ['carts/alice/items', 'users/alice/cart']) {
    await assertSucceeds(setDoc(doc(alice, `${base}/sku`), item('sku')));
    await assertSucceeds(runTransaction(alice, async tx => {
      const ref = doc(alice, `${base}/sku`), snap = await tx.get(ref);
      tx.update(ref, { quantity: snap.data().quantity + 1, updatedAt: serverTimestamp() });
    }));
    await assertSucceeds(getDocs(collection(alice, base)));
    for (const client of [bob, guest]) {
      await assertFails(getDoc(doc(client, `${base}/sku`)));
      await assertFails(getDocs(collection(client, base)));
      await assertFails(setDoc(doc(client, `${base}/other`), item('other')));
      await assertFails(updateDoc(doc(client, `${base}/sku`), { quantity: 2 }));
      await assertFails(deleteDoc(doc(client, `${base}/sku`)));
    }
    for (const data of [{ quantity: 0 }, { quantity: 1.5 }, { id: 'other' }, { role: 'admin' }, { paymentStatus: 'paid' }])
      await assertFails(updateDoc(doc(alice, `${base}/sku`), data));
    const batch = writeBatch(alice); batch.delete(doc(alice, `${base}/sku`));
    await assertSucceeds(batch.commit());
  }
});
test('coupon is only private display metadata, not an authoritative discount', async () => {
  const data = { code: 'FIXTURE', type: 'percent', value: 10, updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(alice, 'carts/alice/meta/coupon'), data, { merge: true }));
  await assertFails(getDoc(doc(bob, 'carts/alice/meta/coupon')));
  await assertFails(setDoc(doc(bob, 'carts/alice/meta/coupon'), data));
  await assertFails(updateDoc(doc(alice, 'carts/alice/meta/coupon'), { admin: true }));
  await assertSucceeds(deleteDoc(doc(alice, 'carts/alice/meta/coupon')));
});
test('default deny: financial/inventory/legacy paths cannot be read or mutated by clients', async () => {
  const paths = ['orders/x', 'users/alice/orders/x', 'ordenes/x', 'payments/x', 'pagos/x', 'payouts/x', 'balances/x', 'saldos/x', 'products/x', 'productos/x', 'inventory/x', 'usuarios/alice', 'admin_sessions/x', 'security_alerts/x', 'cupones/x', 'users/alice/wishlist/x', 'unknown/x'];
  await env.withSecurityRulesDisabled(async ctx => {
    for (const p of paths) await setDoc(doc(ctx.firestore(), p), { owner: 'alice', uid: 'alice', role: 'admin', amount: 1 });
  });
  for (const db of [alice, bob, guest, admin]) for (const p of paths) {
    await assertFails(getDoc(doc(db, p)));
    await assertFails(setDoc(doc(db, p), { amount: 99 }));
    await assertFails(updateDoc(doc(db, p), { amount: 99 }));
    await assertFails(deleteDoc(doc(db, p)));
  }
});
