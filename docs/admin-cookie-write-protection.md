# Cookie-authenticated writes — local origin protection

The shared `proteger` middleware now checks POST/PUT/PATCH/DELETE after validating
the selected access token and before reading the user or reaching a controller.
If the selected credential came from a cookie (including legacy accessToken/token
aliases), Origin must exactly match `CORS_ALLOWED_ORIGINS` (or existing CLIENT_URL
fallback). Empty allowlist, absent Origin, `null`, foreign origin or a URL containing
a path fail closed with generic 403 `COOKIE_WRITE_ORIGIN_FORBIDDEN`. No reflected
origin or token. CORS, cookie attributes and secrets are unchanged.

A selected valid Bearer remains independent of cookies; invalid Bearer never falls
back to a cookie. Refresh preferentially uses its configured refresh cookie, so it
has a separate guard before validation: an added Bearer/body token cannot bypass
Origin when that cookie is present. With no cookie the existing body-token contract
and missing-session behavior remain intact. GET/HEAD are unchanged. This is an
Origin-based CSRF control, not a new CSRF token protocol; trusted origins must be
strictly owned and maintained. Cookie-writing automation must send an allowed
Origin or use its separately authorized Bearer contract.

## Active routes mounted in server.js

| Cookie-capable write | Previous explicit origin control | New control |
| --- | --- | --- |
| POST `/api/productos`; PUT/DELETE `/api/productos/:id` | None | proteger |
| POST `/api/seller/productos`; PUT/DELETE `/api/seller/productos/:id` | None | proteger via router.use |
| POST `/api/ordenes/crear` | None | proteger |
| PUT `/api/ordenes/admin/:id/estado` | None | proteger |
| PUT `/api/ordenes/admin/:id/{fulfillment,pago}` and `/api/ordenes/admin/ordenes/:id/{fulfillment,pago}` | None | proteger |
| POST `/api/admin/payouts/:ordenId/retry` | None | proteger |
| POST `/api/ordenes/admin/reconciliation/:caseKey/reviews` | requireReviewOrigin already present | proteger plus existing review guard |
| POST `/api/stripe/checkout`, `/api/stripe/web/checkout-intent/cancel` | None | proteger |
| POST `/api/auth/logout` | None | proteger |
| POST `/api/auth/refresh` | None | protectRefreshCookie |

Conciliation retains its stricter existing Origin requirement even for Bearer.
The change does not grant a financial action or change any financial invariant.

## Excluded flows and pending contracts

- Mobile `/api/stripe/payment-sheet` and `/api/stripe/checkout-intent/cancel`
  exclusively validate Firebase Bearer; no cookie gate is added.
- `/api/stripe/webhook` retains raw-body/signature verification and does not use
  session authentication. No Origin requirement added.
- `/api/auth/login` and `/registrar` establish sessions rather than authenticate
  writes using an existing cookie. Their login-CSRF/origin contract is outside this
  change and remains pending a separate decision; CORS remains enforced.
- carrito, vendedor, push, payments, user, soporte and adminSoporte route modules
  are not mounted by this server. Do not describe them as active or enable them
  as part of this correction. Any future cookie-authenticated routes using
  proteger inherit the gate; independent authentication needs its own review.

Tests are disconnected: synthetic token verifier and user lookup exercise real
auth middleware; refresh cookie precedence is exercised separately. Existing
webhook/checkout tests cover signed-event processing with local doubles; none
certify production signatures/configuration. New tests verify route exclusions,
allowlisted/foreign/absent Origin, missing session, Bearer precedence and reads.
An additional test verifies a synthetic HMAC signature with Stripe SDK's local
constructEvent function without Origin or any network/API call; invalid signatures
remain rejected. This is not evidence of the deployed webhook's configuration.
No real configuration or credentials were read or changed.
