# Financial operation gate

`ALAIA_FINANCIAL_OPERATIONS_ENABLED` is disabled when absent, false, empty,
misspelled or any value other than the exact string `true`. No NODE_ENV bypass.
Only a separately authorized configuration change and controlled restart may
set `true`. This local change does not authorize deployment or payments.

The HTTP gate precedes authentication and route handlers. It returns 503 with
FINANCIAL_OPERATIONS_DISABLED for writes under stripe, payments, orders,
admin/payouts and vendedor; administrative reconciliation review is exempt
because it has no financial effects. Health, readiness and reads remain available.
Service/controller guards protect checkout, expiration, settlement, refunds,
transfers, manual orders, payment/fulfillment changes and Connect onboarding.
Schedulers are guarded before claims and API workers do not start while disabled.

Existing financial regression tests must explicitly enable the flag only in the
synthetic child test process. This is not permission to set it in a deployed service.
A disabled webhook intentionally returns non-2xx; Stripe may retry. Never enable
until pending deliveries and the target account/mode have been reviewed.

This does not cancel payments/transfers already started in another process or in
Stripe, protect an older deployed version, or replace authentication/CSRF.
Health/readiness do not certify financial safety of external services.

Internal stock reservation rejects before validation or database access. The
private stock restoration adapter also checks the gate before its update.
The exported Stripe client is a closed, frozen facade containing only methods
used by this backend. Mutations check the gate immediately before invoking the
SDK; retrieve and local webhook signature verification remain available. Raw
request methods and SDK internals are not exported. Future SDK operations must
be added explicitly and classified before use.

Disconnected regressions mount real financial routers behind the same HTTP gate
with simulated authentication, controllers and dependencies. They demonstrate
rejection before downstream calls, including webhook processing/ledger access,
and preservation of health/readiness and read routing. They do not certify
remote health, actual MongoDB persistence or cancellation of work already begun.
