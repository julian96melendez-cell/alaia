# Administrative reconciliation: consultation and review evidence only

Prepared locally from `d2aeed6` on `fix/production-hardening`. This delivery provides
an administrative API, not a financial resolver or a new UI. Initial implementation
and local verification did not contact external databases or payment services.
The operator subsequently reported one isolated real-Mongo run, whose evidence
status is recorded below. Nothing was deployed and no scheduler/worker was enabled. New schemas have `autoCreate:false` and `autoIndex:false`.

**Closing a review NEVER clears `needsReconciliation`, changes a reservation,
marks a payment, moves stock, advances fulfillment or authorizes/retries a payout.**
A conclusion such as `payment_confirmed` is the reviewer's classification, not a
financial confirmation. No route in this delivery can execute a financial action.

## Routes and access

Mount: `/api/ordenes/admin/reconciliation`, before generic order routes.
All routes use the existing `proteger` and `soloAdmin` middleware. Revoked,
inactive/blocked and temporarily locked sessions remain subject to existing auth.
Responses are `Cache-Control: no-store`; no new authentication mechanism is added.

- `GET /?page=1&limit=25`: combined operational queue. Optional `kind=order|event`
  and `status=open|under_review|awaiting_evidence|closed` filters are allowlisted.
- `GET /:caseKey?page=1&limit=25`: source snapshot, administrative version and
  paginated append-only reviews, newest version first. `caseKey` must be exactly
  `order:<24 lowercase hex>` or `event:<24 lowercase hex>`.
- `POST /:caseKey/reviews`: append a classification/evidence and update only the
  administrative case. Requires exact allowlisted `Origin` from existing
  `CORS_ALLOWED_ORIGINS`/`CLIENT_URL`, JSON content type and `Idempotency-Key`
  (20–128 ASCII letters, digits, hyphen or underscore). Missing/null/untrusted
  origins and non-JSON bodies are rejected; no Referer or origin-less fallback.
  JSON plus strict Origin protects cookie writes from cross-site form requests;
  CORS alone is not used as the write guard. This does not protect against XSS in
  an authorized origin, stolen sessions or privileged database operators.

Pagination defaults to 25, is limited to 100 per page, and limits offset to 10,000.
Unknown query/body/evidence fields are rejected. Review POST accepts no query
parameters. No unrestricted filters, Mongo operators or client-supplied actor IDs.

## Queue and association policy

GETs do not create administrative records. Candidate sources are:

- Orders with `inventoryReservation.needsReconciliation=true` OR reservation state
  `reconciliation_required`, including historical/unmanaged orders.
- Stripe ledger events with `failed` or `skipped` status, or `received` without an
  update for five minutes. All skipped events are included conservatively; listing
  one is not evidence of a payment or a financial discrepancy.
- Previously recorded non-closed cases, even if their live source is no longer
  pending. Deleted sources remain inspectable via their audit history.

Sources are deduplicated by their typed source key, paginated and sorted by source/
case creation time and key. A closed case with a live operational signal remains
in the queue: closing the review cannot hide the outstanding operational problem.
Closed cases without live signals remain accessible by their key.

Event cases stay independent. `ordenId`, metadata, summaries and references supplied
by a reviewer are never used to infer/establish an order association. A Stripe
reference is evidence supplied by the operator, not a verified binding. Historical
orders are not backfilled and receive no invented correlation or payment identity.

## Review payload and concurrency

Example administrative payload (no credentials):

```json
{
  "expectedVersion": 0,
  "sourceVersion": "<64 lowercase hex returned by GET>",
  "status": "under_review",
  "conclusion": "awaiting_evidence",
  "evidence": [{ "kind": "internal_ticket", "reference": "OPS-123" }]
}
```

Statuses: `open`, `under_review`, `awaiting_evidence`, `closed`. Conclusions:
`payment_confirmed`, `payment_not_confirmed`, `late_payment`, `discrepancy`,
`awaiting_evidence`, `no_operational_resolution`. A closed review cannot use
`awaiting_evidence`. Reopening is an explicit, version-checked administrative review;
there is no silent overwrite or automatic close.

Evidence consists of 1–10 unique structured references, canonically sorted:
internal ticket IDs, Stripe event/object IDs, or lowercase SHA-256 document digests.
There is no free-text note, attachment, URL, customer address or raw Stripe body.
Store the underlying evidence only in an approved restricted evidence system; do
not paste credentials or opaque binding tokens into any reference/digest field.
Lexical validation cannot determine the meaning of an arbitrary digest/ticket ID.

The server obtains the actor from the authenticated session. Each logical review
has a deterministic `_id` from case key + actor + idempotency key. Full operation
and normalized-payload hashes are retained privately to fail closed on collisions
and reject key reuse with different content. Exact retries return the original
recorded result, even after subsequent reviews; they do not rewrite current status.
The key is scoped to actor and case. Evidence ordering does not change intent.

`expectedVersion=0` denotes a virtual case's first review. Creating/updating the case
and inserting its audit take place in one Mongo transaction. Subsequent writes
compare the expected version and increment it once; concurrent different reviewers
cannot both overwrite the same version. Audit failure rolls back the case change.
A duplicate-key race replays its committed audit or returns a 409 conflict.

`sourceVersion` hashes the allowlisted source snapshot, including its update time.
Changed snapshots require a fresh GET. It describes the observed database state;
it is not a lock over concurrent webhook/stock operations and is not evidence that
Stripe was consulted. Those operations may proceed concurrently under their own
existing guards. Because this delivery changes no business state, such a review
cannot override the subsequent operational result.

409 conflicts require a fresh read and a new intentional key; retries of the same
logical request retain their key. Validation failures return 400, unauthorized
requests 401/403, unavailable sources 404 and unexpected storage errors a fixed 503
without driver messages, documents, URIs or stack traces.

## Storage, privacy and deployment prerequisites

`ReconciliationCase`: immutable typed source reference, administrative status,
version and last audit reference. Identity is deterministic from the source key.
`ReconciliationAudit`: actor, classification, bounded references, safe observed
snapshot, resulting version and private operation/payload hashes. No order/event
model is updated. GETs never retrieve Stripe bodies, error messages, customer PII
or correlation tokens. DTOs use allowlists and revalidate stored evidence; they do
not serialize whole documents or private hashes.

Audit updates, deletes, replacement, repeat document saves and bulk writes are
blocked through the Mongoose API. This is application-level append-only behavior,
not a WORM store: a privileged/raw database connection could bypass it. Audit
retention, database roles, backups and stronger tamper evidence require separate
operational review. No TTL is defined and no automatic data deletion is introduced.

Correctness uses the built-in unique `_id` indexes, including full-hash collision
checks. Additional lookup/queue/audit indexes are declared for performance only;
automatic creation is disabled and no index command is executed. Before any future
external activation, separately approve provisioning the two collections and
review their indexes, transaction-capable deployment and database access. Do not
assume implicit collection creation within a transaction works on every topology.
The combined queue uses `$unionWith`, `$lookup` and `$facet`; its real deployment
compatibility/query plans and behavior on missing namespaces still need an isolated,
explicitly authorized integration check. Bounded responses do not bound database
scan work; assess scale before enabling this in production.

This delivery does not fix the financial/payout risks identified in the audit and
does not activate a reconciliation resolver. Payments, releases, refunds, stock
allocation, block removal and payout retries remain outside these routes.

## Local verification

`node --test backend-multi/test/*.test.js` includes new review tests for authorization,
privacy, strict input, origin/JSON guard, idempotency, concurrent versions, stale
snapshots, rollback, historical/orphan sources, closed-but-blocked orders, source
projection, route order, Mongo adapter arguments and append-only model hooks.
Tests use in-memory repositories/mocked adapters and do not connect externally.
Web TypeScript: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit --incremental false --pretty false`.
Real Mongo transaction/aggregate behavior and browser end-to-end checks are not
certified by these local tests.

Initial delivery result: **158/158 tests passed**, including the previous 127 and 31 new
administrative review tests. Web TypeScript passed; tracked diff whitespace,
new-file whitespace and JavaScript syntax checks passed. These results do not
certify a deployed API or an external MongoDB integration.

## Read consistency after the local correction

Detail runs **sequential** case, source and audit reads in one read-only transaction
with `readConcern: snapshot`, primary preference and majority write concern. It
returns `readConsistency: snapshot`. Audit pagination uses one `$facet` for items
and total in that same session. Concurrent administrative commits cannot produce
an old case version with a newer audit count, or combine a source observed outside
that snapshot. The snapshot describes database state; the five-minute event-age
classification still uses application time. Separate requests/pages have separate
snapshots and may see newly committed reviews. This does not freeze operational
writers or consult Stripe.

The queue remains **outside transactions** because it uses `$unionWith`. All case
and allowlisted source data is obtained inside one aggregation with `$lookup`;
there are no subsequent source reads. A final `$facet` derives items and total from
the same candidate stream. It returns `readConsistency: single_aggregation`.
This is an observational queue, **not** a guaranteed point-in-time snapshot across
collections: candidate selection, lookups and concurrent changes can disagree,
and offset pagination can shift across requests. In particular a row may have a
source whose current pending flag cleared after candidate selection, or a case
version that changes before a source lookup. Refresh detail before submitting a
review; its transactional version/source checks remain authoritative. Do not use
queue totals or statuses as authorization for any financial operation.

The alternative avoids `$unionWith` inside a transaction, adds no materialized
queue or worker, and requires MongoDB 5.0+ for concise `$lookup` pipelines. Scanning
and lookups may be expensive; declared optional performance indexes are still not
applied. Missing namespaces, actual transaction retries and query plans must be
validated on the isolated deployment before activation.

## Isolated real-Mongo validation: procedure and evidence

Runner: `backend-multi/scripts/mongo-reconciliation-review-integration.js`.
Importing it is inert. It never loads dotenv, the server, payment SDKs, workers or
financial services. It uses a separate Mongoose instance, clones model schemas
with auto-creation/indexing disabled, and supplies the confirmed database explicitly.
It provisions synthetic collections only **after** all isolation checks pass;
no optional index or production model initialization is run. Built-in `_id`
indexes are sufficient for administrative correctness.

Before executing, separately approve a new random `alaia_` + 32 lowercase hexadecimal
database and a test user's **only** `readWrite` role on that database. Never use any
previous attempted database, including these permanently excluded names:

- `alaia_integration_ef588efb1b388be659120f9c1b6254cc`
- `alaia_78943cf524ef883d31e9628163931fe8`
- `alaia_ba98fd0d1a69e51e79c3bd384d23916c`
- `alaia_faf7a4d2651ecd5fb67539a6eb5889ad`

The runner requires all three variables (no production fallback):

- `ALAIA_MONGO_TEST_DB`: the new 38-character name.
- `ALAIA_MONGO_TEST_CONFIRM`: exactly that same name.
- `ALAIA_MONGO_TEST_URI`: Atlas SRV URI, username `alaia_integration_test`, nonempty
  percent-encoded password, path exactly `/<confirmed name>`. Optional `authSource`
  must be `admin`, TLS/retryWrites must be `true`, `w` must be `majority`; duplicate
  or unsupported options, other databases/users and production environment flags
  or URI/payment credential variables are rejected.

Use a clean Terminal environment. Construct the URI **in memory** using a hidden
password prompt (`read -s` in zsh); never paste a credential into a visible command,
chat, history, repository or `.env`. Encode the password as a URI component and
never print either it or the complete URI. Have the operator prepare these
variables using the same hidden-input process already used in Phase 5B.

Before fixture creation the runner reads `connectionStatus` with `showPrivileges`
and requires exactly the test user, one `readWrite` role on the confirmed database,
and effective privileges scoped exclusively to that database. Unsupported or
unavailable privilege introspection fails closed. This verifies permissions without
reading `backendmulti`; it cannot prove a password was never used elsewhere.
It also requires a primary replica set with sessions, MongoDB 5.0+, the exact
selected connection database and **zero existing collections**, even empty ones.
Known historical names and repeat attempts in the same process are rejected.
Before loading models or running the first trial, it claims a permanent marker
collection with a unique single-use document. A concurrent claimant must fail before
fixtures; even a failed first aggregation leaves the database nonempty and unusable
for a second run. This marker is synthetic test data, not an optional performance
index or a production write.
No runner can infer an unknown past attempt on a database whose collections were
externally deleted: preserve all attempted databases and maintain the operator's
no-reuse record. Never delete/reset a database to make the empty check pass.

Show and obtain explicit approval for this command **before execution**:

```sh
node backend-multi/scripts/mongo-reconciliation-review-integration.js
```

Trial definitions (these descriptions do not certify outcomes):

A. Single-use marker claim, empty/missing-namespace union aggregation, then explicit
   isolated fixture provisioning.
B. Union/lookup/facet deduplication, filters, pagination, historical and independent
   orphan events, with privacy assertions.
C. Identical concurrent requests, competing reviewers, stale versions and original
   result replay after later revisions; different payload with same key is rejected.
D. Direct CAS mismatch and injected audit failure after the case write: transaction
   rollback leaves the case and audit count unchanged.
E. Hold a detail reader after its first snapshot read, commit a separate review,
   then continue: old case/audits/count remain coherent and a fresh read sees the
   new version. No serial mock is used by the real runner.
F. Close an administrative review while its operational signal remains in the
   queue; compare full synthetic orders/events/products/counters before/after to
   prove no payment, reservation, stock, fulfillment or payout effect.

Output contains only stage names, passed trials, numeric driver codes when safely
available and the validated test database on success. Driver messages, raw errors,
URI and credentials are suppressed. Any failure exits nonzero. Data is retained
on success or failure; never reuse that database. After results are reviewed,
rotate the test password through Atlas with separate approval and `unset
ALAIA_MONGO_TEST_URI ALAIA_MONGO_TEST_DB ALAIA_MONGO_TEST_CONFIRM` in the original
Terminal; also unset any temporary password/encoding variables. Do not enable the
administrative API externally based on local tests alone.


## Real execution evidence and proposed local checkpoint

**Execution reported by the operator:** the runner was executed once on
`alaia_faf7a4d2651ecd5fb67539a6eb5889ad`. Terminal returned to the prompt;
the operator described a visible summary with passed trials,
`syntheticDataRetained: true` and `doNotReuseDatabase: true`.
Atlas UI verification previously showed the dedicated user's sole `readWrite`
permission on that database. No further connection, trial, cleanup, index command
or permission change was performed during this local checkpoint preparation.

**Confirmed locally:** code defines the assertions A–F above. The two retention
flags are emitted in BOTH success and failure output, so those flags and return
to the prompt alone do not prove success. Stored local regression results belong
to local tests, not to the real Atlas run. The current runner permanently rejects
this consumed database before importing the driver, even with a matching URI and
confirmation. Its marker also prevents reuse while retained; never delete data
to bypass either guard. This database is no longer a fresh candidate.

**Evidence still pending:** the complete final JSON for this exact database,
including all six expected entries in `passed` and no failure status. An exit
status of zero, if recorded immediately after the original command, corroborates
completion; do not infer it from a later `$?`. Exact executed-code identity and
independent database audit evidence were not captured. Do not rerun the consumed
database to recover any missing evidence.

| Trial | Expected `passed` entry | Confirmed outcome |
| --- | --- | --- |
| A | `A empty aggregation` | Pending final JSON |
| B | `B aggregation and privacy` | Pending final JSON |
| C | `C idempotency and concurrency` | Pending final JSON |
| D | `D CAS and rollback` | Pending final JSON |
| E | `E snapshot under concurrent commit` | Pending final JSON |
| F | `F administrative close and financial immutability` | Pending final JSON |

If F is confirmed, its digest comparison demonstrates equality before/after of
complete synthetic order, Stripe-ledger-event, product and counter documents,
after initial fixture seeding. It does not prove absence of transient changes or
provide an independent audit of all other databases. Exclusive runtime privileges
and the single explicit database connection support isolation if the success
output is confirmed. Administrative close never authorizes a financial action.

Three equivalent explicit order indexes were removed locally:
`firestoreOrderId`, `mobileOrderRef`, `vendedorPayouts.stripeTransferId`.
Each retains its original `index: true`, ascending key and non-unique/non-sparse
options. This is schema declaration deduplication only: no MongoDB index is created,
altered or dropped. A fresh-process regression checks one effective declaration
per key and absence of their duplicate-index warnings; it never opens a connection.

The proposed checkpoint records administrative consultation/review, read consistency,
isolated-runner protections and the evidence boundary. It does not certify A–F,
production readiness, external HTTP/CSRF behavior or a financial resolver. Real
query-plan/performance evaluation, operational provisioning and end-to-end checks
remain separate prerequisites. The observational queue limitations above remain.

Local verification for this checkpoint: **173/173 tests passed**, web TypeScript
passed, syntax checks passed for all pending JavaScript files, and tracked/new-file
whitespace checks passed. The index regression first failed against the duplicate
declarations, then passed after removing exactly the three redundant lines.
The three targeted order warnings no longer appear. The full suite still emits
unrelated existing `email` and `stripeAccountId` duplicate-index warnings from the
user schema; those declarations were outside this authorized correction and were
left unchanged. No commit is created by this preparation.

## Local HTTP end-to-end validation from `3a02b86`

`backend-multi/test/reconciliation-http.test.js` sends real HTTP requests over
`127.0.0.1` to an ephemeral port, then closes every server. It loads the actual
reconciliation router, controller, service, contracts, auth middleware and
`authService` token generation/verification. Users and administrative persistence
are doubles in memory; signing keys are random, test-only values confined to the
fixture environment. Nothing loads real `.env` files or connects to MongoDB,
Stripe, Firebase, workers or a scheduler. No SDK/production startup is imported.

The fixture reads `server.js` as text and evaluates only its existing CORS,
the scoped raw-query guard, Mongo sanitization/HPP and production-mode global error-handler middleware
registrations. Cookie parsing and JSON/form parsing use the real Express packages
and the production 1 MB limit. A whitelist of module dependencies fails on any
unexpected infrastructure import. This tests the transport-to-service boundary
without running the complete production server. The existing generic order routers
are replaced by a 404 sentinel; unknown reconciliation paths still traverse the
real `proteger`/`soloAdmin` checks before that fallback.

The 18 HTTP tests cover:

- GET list/detail, POST review and unknown reconciliation paths reject missing
  sessions and non-admin users. Real JWT verification covers malformed, expired,
  refresh, missing-user, revoked, inactive, blocked, temporarily locked and
  role-changed sessions, including invalid Bearer precedence over a valid cookie.
- Actual CORS preflight is 204 with no data or repository access. Credentialed
  reads emit the allowed origin and `Cache-Control: no-store`.
- Cookie writes reject missing/null/untrusted/wrong-protocol/path origins, and
  trusted Referer cannot replace Origin. Non-JSON/form content types are 415.
  A separate fixture proves the route Origin guard works without global CORS.
- Invalid source keys, absent cases, unknown query fields, nested operators,
  pagination bounds and repeated page/limit/status parameters are rejected.
  Review queries, financial/fulfillment fields, supplied actors, prose/sensitive
  evidence, malformed versions, duplicates and invalid idempotency keys fail.
- Malformed JSON/URI encoding and oversized bodies return sanitized 400/413
  responses through the existing production-mode error handler. Unexpected
  list/detail/review/audit failures return the controller's fixed 503 response.
  Injected audit failure rolls back the administrative write in the repository
  double. Sensitive fixture markers, raw URIs, private hashes and stacks never
  appear in response bodies.
- Exact retries replay the original audit after a subsequent review; changed
  payloads with the same key return 409. Two simultaneous HTTP requests are held
  at their initial audit reads: identical requests append once; different reviewers
  using one version produce one 200 and one 409. Stale source hashes/versions cannot
  append or overwrite a review.
- Read DTOs are paginated/redacted and event cases remain independent. Closing a
  review changes only case/audit data and leaves the operational block visible.
  Full synthetic orders/events/products/counters/payout fixtures are compared
  after every HTTP response and again on teardown: their business state is unchanged.
  Payment/release/refund/payout/fulfillment action URLs have no handler in this router.

**Localized query ambiguity protection:** `server.js` mounts
`rejectAmbiguousReconciliationQuery` exclusively on
`/api/ordenes/admin/reconciliation`, before Mongo sanitization and HPP. The guard
reads raw `originalUrl` query names through `URLSearchParams`, including decoded
percent aliases. It rejects every repeated name and bracket notation (these
endpoints support scalar query parameters only), returning fixed HTTP 400
`REVIEW_AMBIGUOUS_QUERY` without echoing names or values. This prevents repeated
`kind`, page, limit or status, including mixed scalar/array syntax, from being
collapsed into an accepted value. It does not alter the global query parser or HPP
whitelist. Unknown single fields and invalid scalar values remain subject to the
existing strict contracts.

Previously HPP reduced `kind=order&kind=event` to `event`; the validator received
a scalar while the original array remained in `req.queryPolluted.kind`.
Whitelisted page/limit/status were restored as arrays and rejected by contracts.
The new guard rejects ambiguity before either sanitizer can normalize it. As a
transport syntax check it runs before route authentication: malformed queries can
receive 400 without a session, disclose no case data and never reach persistence.
Valid queries still require `proteger` and `soloAdmin`; write origin protection
remains unchanged. Existing global CORS/parser rejection may precede the guard.
Tests cover list/detail/write paths, encoded aliases, bracket syntax, case variants,
trailing slashes, valid filters and non-reconciliation/near-prefix routes retaining
their previous HPP behavior. This protects query parameters; it does not introduce
a raw JSON duplicate-key detector or change header/body parsing on other APIs.

**Integration boundaries still pending:** a real browser's automatic cookie,
SameSite/Secure and CORS behavior; login/refresh/logout flows; deployed CORS/proxy
configuration, Helmet, rate limits and request-correlation/logging middleware;
interaction with actual generic order routers; and real MongoDB persistence,
aggregations, CAS, transaction conflicts/retries and rollback. The in-memory
transaction double serializes commits, so concurrent HTTP coverage is not evidence
of MongoDB write-conflict handling. Error-response redaction is verified; production
logging redaction is not certified by these tests. The new local HTTP tests do not
certify the earlier Atlas A–F run: its final JSON remains pending and its consumed
database stays permanently blocked.

Run locally with `node --test backend-multi/test/reconciliation-http.test.js` or the
full `node --test backend-multi/test/*.test.js` suite. The environment must permit
loopback listening; restricted sandboxes may require explicit local-port approval.
No test is skipped to turn a port-permission failure into a pass.

HTTP delivery verification: **18/18 HTTP tests and 191/191 total local tests
passed**. Web TypeScript, JavaScript syntax and tracked/new-file whitespace checks
passed. The HTTP assertions also check that session JWTs and fixture signing keys
never appear in response bodies or headers.
No commit, push, merge or deploy is performed for this delivery.
