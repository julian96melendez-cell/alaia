# API configuration and Render preparation

Expo uses only `EXPO_PUBLIC_BACKEND_URL` through `config/api.ts` and `apiUrl(path)`.
Next uses only `NEXT_PUBLIC_BACKEND_URL` through `frontend/lib/backend.ts`.
Both variables must contain the backend origin (no `/api` suffix). Production
requires public HTTPS and fails clearly when configuration is missing. Variables
are embedded at build time: rebuild the corresponding frontend after changes.
Only explicit development mode falls back to `http://localhost:3001`; a physical
phone cannot reach the developer computer through its own localhost.

## Consumers inspected

- Expo active: `services/products.ts`, `app/checkout.tsx`, `app/(tabs)/orders.tsx`,
  `components/tracking/TrackingClient.tsx`. Cart is local context, without a backend URL.
- Duplicate checkout: `screens/CheckoutScreen.tsx` (no current route import).
- `services/api.ts`: consumed by `screens/AdminOrdersScreen.tsx`; the screen itself
  has no current route import. Keep its response/auth contract for future migration.
- Root `lib/api.ts`: no imports found, candidate for later removal.
- Tracking `useTracking.ts`, `useTrackingStream.ts`, `hooks/useTrackingWeb.ts`:
  no current imports found, candidates for later removal.
- `components/admin/AdminGuard.tsx`: legacy Next browser component, no imports found;
  now uses Next configuration, candidate for later relocation/removal.
- Next active `frontend/lib/api.ts`: catalog, orders, seller and admin pages.
  Login, auth/logout, seller/admin layouts and payment success page share its origin.
- `pago-exitoso.client.tsx`: alternative client with no imports found, retained.

## Render web service

Use `backend-multi` as root directory, `npm ci` to install and `npm start` to run.
Render provides `PORT`; the API binds `0.0.0.0`. `/healthz` is liveness;
`/readyz` returns 503 unless Mongoose is connected. MongoDB remains required.
API workers default to disabled; enabling `API_WORKERS_ENABLED=true` is an explicit
operational choice that can initiate payout work. No infrastructure was changed.
Redis queues/standalone workers are not started by the default HTTP process.
Set an explicit `CORS_ALLOWED_ORIGINS` list for browser origins (mobile requests
without Origin remain supported).

Stripe hosted-checkout return URLs use `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL`,
or paths derived from `FRONTEND_URL`. Connect onboarding uses only
`STRIPE_ONBOARD_REFRESH_URL` and `STRIPE_ONBOARD_RETURN_URL`; client overrides are
no longer accepted. Placeholder hosts and unsafe production URLs are rejected
before these URLs are used. Local ignored env files were not modified.

## Known checkout integration gap

The active `app/checkout.tsx` predates the hardened mobile API: it omits Firebase
Authorization and shippingAddress. The alternate `screens/CheckoutScreen.tsx`
already implements that contract. API unification does not fix this UI contract;
the active flow still needs a deliberate checkout migration in a subsequent phase.
