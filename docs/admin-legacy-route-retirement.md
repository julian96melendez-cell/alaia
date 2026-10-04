# Administrative legacy routes — local retirement

Next's admin layout/AuthContext verify the Express cookie session through
`/api/auth/me`. `frontend/lib/api.ts` sends requests to the configured Express
origin, not to Next's local API handlers. Firebase's `session` cookie and admin
claim are a separate legacy authorization system.

## Disabled writes

These handlers now return HTTP 410, `ok: false`, fixed code
`LEGACY_ADMIN_WRITE_DISABLED` and `Cache-Control: no-store`. They import only
NextResponse: no Firebase initialization, request parsing, redirect or replacement
write. This applies even to callers outside the current UI.

| Next handler | Previous effect | Repository UI consumers |
| --- | --- | --- |
| PUT `/api/admin/usuarios/[id]` | Firestore usuario role/active update | Users page used the same path on Express; not this Next handler |
| PUT `/api/admin/fulfillment/[id]` | Firestore order fulfillment/tracking update | Fulfillment page used the same path on Express; not this Next handler |
| POST `/api/admin/cupones` | Firestore coupon insertion | None found |

The users and legacy fulfillment pages now show **Función temporalmente no
disponible**, without fetching, editing or reporting success. Their previous
Express endpoint contracts do not exist in the mounted routes. No automatic
mapping was introduced. External consumers cannot be ruled out by repository
search; they will receive 410 from the retired write handlers.

## Legacy authentication inventory (reads unchanged)

All these Next GET handlers still verify Firebase `session`/admin and read
Firestore, except session-me which only verifies authentication:

- `/api/admin/usuarios`, `/api/admin/fulfillment`: former same-path page calls
  targeted Express, not Next; corresponding pages are now unavailable.
- `/api/admin/security-logs`: security page uses this path on Express, where no
  matching endpoint is mounted. Security view remains pending; no write action.
- `/api/admin/analytics`: no consumer found; current analytics page uses Express
  `/api/admin/analytics/overview`, `/series`, `/top-productos`, `/top-vendedores`.
- `/api/admin/cupones/list`, `/api/admin/security/sessions`,
  `/api/admin/security/sessions/alerts`, `/api/session-me`: no consumers found.

`/api/session-login` was already disabled (410). `/api/session-logout` only clears
the obsolete cookie; it does not write application data. Security-log/anomaly
helpers have no call sites found and were not changed. The public coupon validator
is not an administrative write and is outside this change.

## Preserved backend functions and pending work

Unchanged UI paths: order list/detail and guarded order actions, product management,
analytics, payout views/retry; seller dashboard and product management. Existing
Express authentication, authorization and financial invariants remain authoritative.
This describes local wiring, not production certification or new financial approval.
Administrative reconciliation endpoints also remain untouched.

Pending: users management (verify/add a backend contract), legacy fulfillment
tracking/carrier/note editing (verify backend fields; use the existing guarded order
screen for supported state transitions), coupons administration and security view.
Do not re-enable Firestore writes to make those screens work. Legacy read removal
can be considered separately; this change only retires the bypassing writes.

Disconnected regression tests execute all three real transpiled handlers using
NextResponse, reject any other import, and fail on any request access. They assert
410/no-store and repeat safety. Static server rendering verifies the unavailable
pages contain no actions. They do not certify Firebase rules or remote data.
