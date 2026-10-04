# Firestore minimum privilege — LOCAL PROPOSAL, NOT PUBLISHED

Target reviewed visually: ShiboApp `shiboapp-7ec65`, database `(default)`.
The published version marked with a star on May 15, 2026 at 6:37 pm allowed
authenticated clients to read/write every document. This proposal replaces that
global grant; it does not overlay it. Nothing here has been published.

## Code inventory

| Path | Consumer / operations | Proposal |
| --- | --- | --- |
| `users/{uid}` | Active `app/(auth)/register.tsx`: create/merge; `app/profile-info.tsx`: profile update | Owner get/create/update; no list/delete. Creation has fixed customer role and token email/UID; updates only name/photo/timestamp |
| `carts/{uid}/items/{id}` | Active `context/CartContext.tsx`: listen/list, transaction get/set/update, delete, batch clear | Owner only, bounded shape and quantity; no authorization based on stored fields |
| `carts/{uid}/meta/coupon` | Active CartContext: get/set/delete | Owner only, display metadata. Price/coupon authority remains backend |
| `users/{uid}/cart/{id}` | `services/cart.ts`: get/set/update/delete; no current consumer found | Owner-only compatibility with strict item shape |
| `orders/{id}`, `users/{uid}/orders/{id}` | `services/orders.ts`: batch financial order creation and reads/listeners; `screens/OrdersScreen.tsx`: list and direct cancellation | Deny all clients. No consumers found in current Expo Router app; active orders use backend HTTP |
| `users/{uid}/wishlist/{id}` | Legacy `screens/WishlistScreen.tsx`: listener/delete | Deny; active `app/(tabs)/wishlist.tsx` uses product service/cart, not this collection |
| `products/{id}` | `hooks/useProducts.ts`, legacy `screens/ProductListScreen.tsx`: reads; misleadingly named `screens/OrderDetailScreen.tsx`: product create/update/delete | Deny; no imports from active `app/` found. Current product/catalog service uses backend |
| `users/{uid}` legacy variant | `screens/RegisterScreen.tsx`: role=user, onboarded, Storage photo upload | Denied creation shape; no active app import found. Do not reactivate without adapting |
| `ordenes`, `usuarios`, `cupones`, `admin_sessions`, `security_alerts` | Next server handlers read with Firebase Admin; security-log/anomaly helpers write with Admin but no call sites found | Deny client access. Admin SDK bypasses rules; these server permissions are not certified by this policy |
| `orders`, `users/{uid}/orders` mirrors | Backend `firestoreOrderSync.js` and `firestoreAdminOrderSync.js` use Admin SDK | Server-only; rules do not constrain Admin SDK |
| payments/pagos, payouts, balances/saldos, inventory/productos, unknown paths | No legitimate client grant required | Default deny reads and all client writes, even with an admin custom claim |

Previously retired Next users/fulfillment/coupon write handlers remain HTTP 410.
The proposal trusts only `request.auth.uid` and auth token email for identity. It
never grants authority based on a document role/admin/uid, including cart fields.
The customer role is constant and cannot be changed/deleted by profile updates.
Existing privileged fields cannot be modified; they are not authorization inputs.
No wildcard owner grant permits financial subcollections under users.

## Minimal client adjustments

- Profile update now sends name and serverTimestamp only, not email. Email/UID
  changes require a separately authorized identity workflow. Existing profiles can
  be updated without rewriting identity or arbitrary legacy fields.
- Cart normalization omits undefined optional stock/maxQty fields so Firestore
  serialization accepts normal items. Those values and prices are display hints,
  not inventory mutations or checkout authority. Backend reprices by product ID
  and revalidates coupon code.

The active registration payload matches the create allowlist. If registration
created an Auth user but failed to create its profile earlier, editing that missing
profile remains denied; repair must use a verified creation/recovery contract.
Legacy financial-order writes, product writes and legacy registration intentionally
stop working. Existing malformed cart documents may fail updates (owner deletion
still allowed); no real documents were read to establish compatibility. Quantities
must be integers 1–9999, profile names 1–100 characters. Unsupported extra fields
fail closed. Anonymous carts remain local AsyncStorage.

## Emulator validation — required before publication

Tests live in `security/firestore-tests/rules.test.cjs`. They insist on
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8089` before importing test SDKs and use only
`demo-alaia-rules`. No credentials or real project may be used. Synthetic privileged
fixtures are seeded only through the emulator's disabled-rules test context.

Local validation completed on 2026-10-02 (America/Chicago): **5/5 test groups
passed, 0 failed**, runner exit code 0. The emulator compiled the actual proposed
rules. One intermediate added client test failed because of an incorrect relative
source path; the test path was fixed and the complete suite passed. No rule was
relaxed to accommodate that failure.

Isolated dev tools: Firebase CLI 14.22.0, firebase SDK 12.12.1 (same package version
as the mobile project), @firebase/rules-unit-testing 5.0.0, Firestore emulator
1.19.8, Node 20.19.5 and Java 17.0.16. Package metadata requires Node >=20;
rules-unit-testing's peer dependency accepts Firebase ^12.0.0. Installation used
ignore-scripts and did not change production manifests/lockfiles. A dedicated
package-lock.json records test dependencies. Installation initially resolved Node
26 in the elevated environment, producing a superstatic engine warning; emulator
and all final tests explicitly ran with Node 20 and its PATH.

The emulator ran only `demo-alaia-rules` on loopback with a blank environment and
an isolated HOME at `/private/tmp/alaia-firestore-local-home`, without Google login,
ADC, production environment variables or service-account files. Runtime download
was tooling provisioning; tests themselves used only the local emulator. Processes
stopped cleanly; no listeners remained on 8089/4409/4509. Generated logs and
node_modules are ignored. CLI 14 reports Java <21 support will be removed in CLI
15; the pinned test environment works with the current JDK, and an upgrade would
require a separate compatibility check.

For a repeat local run with the pinned tools and cached runtime, from the `security`
directory, with production credential environment variables removed and an
isolated HOME containing no real Firebase/Google login:

```bash
firestore-tests/node_modules/.bin/firebase emulators:exec --project demo-alaia-rules \
  --config firebase.local.json --only firestore \
  'cd firestore-tests && npm test'
```

The CLI supplies the emulator environment. UI is disabled and endpoints are bound
to loopback. A missing dependency/runtime must fail rather than connect remotely.
Do not use real Auth accounts, service-account credentials, production project ID
or rules simulator against production. No remote validation was performed here.

Coverage executed: registration/profile identity and field restrictions; different
UIDs and unauthenticated users; owner cart transaction/list/batch/delete; coupon
metadata; unknown paths; financial/inventory create/update/delete/read denial;
admin claim cannot bypass. An additional group extracts actual registration and
profile setDoc payloads with the TypeScript parser and executes the actual cart
normalizer in a sandbox, then sends their structures to the local emulator. It
covers cart data both with and without stock/maxQty hints. This is contract/rules
coverage, not a full mobile UI, Firebase Auth registration or payment flow test.
Emulation does not certify IAM, Admin SDK paths,
Storage rules, deployment identity, or live document shapes.

## Future publication instructions (NOT AUTHORIZED)

1. Review complete emulator results and client compatibility; review Storage
   separately. Preserve the previous published rules for rollback review without
   automatically restoring the insecure global allow.
2. Confirm the real project, default database and full replacement text. Obtain
   explicit authorization to publish Firestore rules only.
3. In Firebase console's already-open Rules tab, replace the entire published
   rules with `security/firestore.rules`, review the diff, and publish only under
   that separate authorization. Do not change Storage, IAM, documents or indexes.
4. Confirm the new published version/date and retain the sanitized rule evidence.

No CLI deployment or application deployment is part of this local preparation.
