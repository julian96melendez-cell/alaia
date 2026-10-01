# Phase 3: active mobile checkout

## Route and contract

`app/(tabs)/cart.tsx` pushes `/checkout`; Expo Router resolves `app/checkout.tsx`.
No route/import consumes `screens/CheckoutScreen.tsx`; it remains a candidate for
later removal, not a replacement of the active UI. Its response checks were updated
because paymentIntentId is no longer exposed.

POST `/api/stripe/payment-sheet` uses `Authorization: Bearer <Firebase ID token>`.
Body: `{ items: [{ producto, cantidad }], couponCode, shippingAddress }`.
Address fields: `fullName`, `phone`, `street`, `city`, `state`, `zip`.
No monetary fields, identity, email, order references, metadata or paid state are sent.
The active Firebase user refreshes the token immediately before the HTTP request.
The backend verifies token revocation and derives UID/email only from that identity.

Response: `{ ok, data: { clientSecret, ordenId, pricing }, clientSecret, ordenId, pricing }`.
Root aliases preserve the inactive checkout's compatibility. `pricing` includes
subtotal, tax, shipping, discount and total. Only the required PaymentSheet client
credential is exposed; no PaymentIntent/customer IDs or ephemeral credentials.

Mongo products supply prices, availability and currency. Backend policy computes
shipping/tax and validates coupons. Existing BIENVENIDO10, ENVIOFREE and VIP20 are
backend static policy, not a database coupon system. No new coupon source was added.
The UI/cart estimates (including locally stored coupons) are not authoritative.
When any component of the server breakdown differs, the summary updates and the
first attempt stops before init/present PaymentSheet. A second button press is
explicit confirmation and reuses the same prepared order/payment in this mount.

## Order/payment lifecycle

The backend validates items/address before creating a pending Mongo order.
Address mapping: fullName->nombre, phone->telefono, street->direccion,
city->ciudad, state->provincia, zip->codigoPostal; email comes from the token.
The current UI does not collect a country; the schema keeps its existing default.
Order ID and verified UID go into server-generated Stripe metadata. The PaymentIntent
ID is stored in Mongo, with Stripe idempotency `mobile_pi_<Mongo order ID>`.
The signed webhook resolves that metadata and controls financial state.

Phase 4 adds persisted opaque intent keys, mandatory Mongo transactions and an
explicit cancellation/recovery lifecycle. See `checkout-phase4.md`. Cancellation
of the PaymentSheet UI alone retains the intention and cart; financial state still
comes exclusively from Stripe/webhook.

Only local PaymentSheet success clears the cart. It is presented as received/verifying,
never as backend-paid. A completed guard prevents another charge in this mount even
if cart cleanup fails. Tracking navigates using the same Mongo `ordenId` that the
backend history maps from `_id`. No orders/payment state are written to Firestore.
CartContext's existing Firestore cart/coupon storage is outside this phase.

## Inventory update

Phase 4 replaces the simple stock check with transactional reservation and an
idempotent release/consume lifecycle. Production still requires a verified Mongo
replica-set/sharded topology, scheduled expiration and reconciliation operations.

## Verification boundaries

All automated tests mock network, Firebase, Mongo and Stripe; no real/test external
payment, worker, deployment or migration was run. Existing TypeScript failures remain.
Before external tests: configure the frontend backend URL, matching Firebase project,
backend Stripe/webhook credentials and endpoint; validate the app's existing Stripe
publishable key/account pairing, mobile return scheme and actual device connectivity.
See Phase 4 for the remaining topology, scheduling and reconciliation prerequisites.
