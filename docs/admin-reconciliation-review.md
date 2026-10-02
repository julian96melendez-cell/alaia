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


## Local read privacy and availability preparation from `9b9bd42`

This change does not alter aggregation stages, pagination, indexes, financial
writes, admin authorization or write-origin protection. List/detail (including
Express' HEAD handling for GET routes) share one admission runtime for the mounted
administrative router in each API process. Review POSTs do not consume read slots.
The runtime starts after authentication/authorization; malformed transport input
can still be rejected earlier without database work.

Morgan skips its ordinary format exclusively for the reconciliation path and its
subpaths. A separate formatter emits only JSON `method`, normalized route template
and HTTP `status` (null when no headers were sent). It never emits query strings,
case/source identifiers, unmatched path contents, hostnames, IPs, request IDs,
headers, user agents, referrers or body data. Case variants and absolute-form HTTP
targets are classified using pathname parsing compatible with Express. Fixed
routes are the list, `/:caseKey`, `/:caseKey/reviews` and `/:unmatched`. Normal
logging for other APIs remains unchanged. Morgan is registered before body parsing
and the ambiguity guard, so their early rejections get the same restricted format.
Existing CORS rejections/preflights that finish before Morgan need not produce an
access log. This guarantee covers Morgan access logs, not an external proxy or all
other logging sources.

Configuration is server-only, read at runtime initialization; no request can
choose these limits and no `.env` file is changed by this preparation:

| Variable | Default | Accepted range | Meaning |
|---|---:|---:|---|
| `ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS` | 2000 | 100–10000 | Server execution cap per read command, also capped by the remaining shared budget. |
| `ALAIA_RECONCILIATION_READ_TIMEOUT_MS` | 8000 | 500–15000 | Shared elapsed-time budget and HTTP deadline for an admitted read. |
| `ALAIA_RECONCILIATION_MAX_CONCURRENT_READS` | 4 | 1–16 | Maximum admitted, unsettled read operations per API process. |

Only positive decimal integers within the range are accepted; invalid settings
fail configuration with a fixed message that does not echo the supplied value.
List and audit aggregations always receive `maxTimeMS`. Detail case/source finds
also receive it and remain sequential inside their existing snapshot transaction.
The shared deadline uses a monotonic clock. The remaining budget is checked before
later reads and transaction callback
retries; a bounded `maxCommitTimeMS` is supplied for the read-only snapshot commit.
Direct service list/detail callers receive a budget too, but admission and an
HTTP deadline belong to the HTTP controller. The review write transaction is not
changed to use this read budget.

Saturation returns generic **503 `REVIEW_READ_BUSY`**, `Retry-After: 1` and no queue.
Mongo `MaxTimeMSExpired`/code 50 and the local read deadline return generic **504
`REVIEW_READ_TIMEOUT`**. Other storage failures keep the fixed 503 response.
Responses contain no driver messages, queries, URI or documents. Late completion
cannot write a second response; late rejection is awaited and handled.

Two counters intentionally measure different lifetimes: active admitted HTTP
requests and unsettled operations. Success/error releases the operation slot after
the promise, including snapshot session cleanup, settles. HTTP timeout or client
disconnection ends HTTP accounting and stops future detail reads, but **does not
release the operation slot while database work is still awaited**. This is the
safer fail-closed behavior: even if a driver promise stalls indefinitely, at most
the configured number of admitted operations remain, and subsequent reads receive
503 rather than multiplying unobserved work. Capacity is recovered when those
operations actually settle, not merely when the client disappears.

There is no explicit `killOp`, driver AbortSignal or guaranteed immediate database
cancellation. `maxTimeMS` is a server command budget, not a bound on buffering,
pool acquisition, network transit or all transaction/session cleanup and retry
activity. A driver error can settle locally while remote termination is uncertain;
the counter bounds application promises, **not provably all remote MongoDB
operations**. The total deadline cannot preempt synchronous JavaScript work or a
blocked event loop. Multiple processes/replicas each have their own limit; there
is no distributed semaphore. Authentication lookups, POST reviews, workers and
other APIs are outside this read admission limit.

Before stronger cancellation claims, validate the installed driver/server behavior
in a new isolated database. The next alternative is a dedicated read execution
path/pool with compatible driver client-side operation/session timeouts and abort
support, still retaining admission until termination is acknowledged and keeping
server `maxTimeMS`. A shared deployment-level admission policy would be needed for
a global limit. None of these alternatives is enabled by this local preparation.

Local regressions cover confidential/malformed/repeated queries before auth,
sensitive and unmatched paths, absolute-form and case-varied targets, unchanged
Morgan output on other APIs, strict config bounds, command options and unchanged
pipelines, shrinking detail budgets, cleanup, saturation, timeout, disconnection,
late success/failure and admission recovery. HTTP tests compare business fixtures
after responses; existing auth/CSRF/idempotency/CAS/rollback tests remain in place.
Mongo timeout errors are injected doubles and execution options are inspected
locally; this does not certify server interruption or real query performance.

Local verification for this preparation: **204/204 tests passed**, including
**24 HTTP tests**. Web TypeScript, syntax for all changed/new JavaScript files and
tracked/new-file whitespace checks passed. Existing unrelated user-schema index
warnings remain outside scope. No real connection, index operation, commit, push,
merge or deployment was performed.


### Additional pre-checkpoint lifecycle review

The review found two lifecycle races and corrected them locally without changing
HTTP contracts, pipelines or indexes:

- A transport already aborted/closed/ended was transiently admitted before being
  discarded. Admission now checks it before touching counters, even when capacity
  is full; the controller avoids starting a read on an already disconnected
  transport. Request `aborted` events also stop the budget and detach HTTP listeners.
- A final query that completed after timeout/disconnection could let its snapshot
  callback return normally and attempt commit. The service and repository now
  re-check the budget after reads/callback completion. Rejection occurs **inside**
  `withTransaction`, where the installed driver's error path awaits
  `abortTransaction` before the repository's finally awaits `endSession`.

No timeout handler starts `abortTransaction` or `endSession` in parallel with an
outstanding query. A transaction may remain active after a 504 while that query
is pending; its operation slot is held throughout. After the query settles, budget
rejection prevents later source/audit reads and enters serialized cleanup. If
commit was already underway before timeout, it is awaited; there is no claim that
HTTP timeout can cancel an ongoing commit. `maxCommitTimeMS` is a per-commit server
budget computed at transaction entry, not a total transaction/driver retry deadline.
The driver may retry commit independently of the callback's budget checks.

The local tests invoke the installed MongoDB driver's real `withTransaction` and
`endSession` implementations with fake sessions/commit/abort commands; no client
connects and no server command is sent. They verify callback failure/timeout,
commit failure, transient retries, session acquisition after disconnect, cleanup
failure, and retention of capacity during delayed abort and session cleanup.
They also verify admission before disconnect, repeated/reordered abort/finish/close
notifications, non-negative counters, no duplicate release or response, and the
unchanged write-transaction options. HTTP detail timeout coverage verifies that
later source/audit reads are not started. These tests certify the local ordering,
not the remote server's termination or the transport reliability of real aborts.

`endSession` releases client-side resources. Its installed-driver implementation
aborts an active transaction when needed and suppresses most abort errors; client
session completion therefore does **not** prove the remote abort was acknowledged.
A driver rejection/session cleanup completion releases the local operation slot
but may leave uncertainty about remote execution. Generic 503/504 responses do not
expose cleanup diagnostics. The per-process limit remains a limit on admitted,
unsettled application operations, never a verified global/remote operation count.

An operation can retain a slot indefinitely during Mongoose buffering, pool/network
waits or unresolved query, abort or session-cleanup promises. HTTP timeout and
`maxTimeMS` cannot make these client waits finite. The fail-closed retention is
intentional: a timer-based release or detached cleanup would admit additional work
without evidence that the first operation stopped. A compatible next mitigation
requires an isolated read execution path with validated driver client-side timeouts
covering acquisition, queries, transaction retries and abort/session cleanup;
explicit abort support where compatible; no Mongoose buffering on that read path;
and monitoring of admitted operations versus active HTTP requests. Retain permits
until awaited cleanup settles, and separately track unknown remote outcomes.
Validate these options against the installed Mongoose/driver and MongoDB versions
in a fresh isolated database before enabling them. No shared connection setting,
write timeout or production configuration was changed for this review.

Verification after this lifecycle review: **213/213 local tests passed**, including
**25 HTTP tests**. Web TypeScript, all pending JavaScript syntax checks and tracked/
new-file whitespace checks passed. The same 11 pending files are preserved; HEAD
remains `9b9bd42` on `fix/production-hardening`, with no commit or external action.

### Native reader prototype (not routed or enabled)

The independent `src/services/reconciliationNativeReader.js` prototype targets the
installed MongoDB driver **7.0.0**, now declared as a direct, pinned dependency.
`ALAIA_RECONCILIATION_NATIVE_READER_ENABLED` defaults to absent/`false`; only literal
`true` permits construction. Even with `true`, no production route imports this
module, no client connects automatically, and Mongoose remains the current reader.
Connection requires an explicit `connect({ uri, database, collectionNames })` by a
future bootstrap. There is no `MONGO_URI` fallback or dotenv loading. Do not enable
or mount it before the isolated integration described below. POST, review writes,
financial code, existing pipelines, indexes and HTTP contracts are unchanged.

The prototype exposes only list/detail handlers suitable for GET/HEAD. Future
mounting must retain existing authentication, `soloAdmin`, query guards and scoped
logging. It imports the existing pure pipelines, validators and DTOs. List remains
one aggregation outside transactions (`$unionWith`); its existing consistency
limitations remain. Detail uses a manual, read-only transaction with snapshot read
concern and primary preference, on a session created by this same independent
client. Case, source and audit facet are sequential within that transaction.
No models, automatic collection/index creation or financial writes are provided.

Native configuration uses the prefix `ALAIA_RECONCILIATION_NATIVE_`:

| Suffix | Default | Allowed range | Scope |
| --- | ---: | --- | --- |
| SERVER_SELECTION_TIMEOUT_MS | 1000 | 100–5000 | server selection |
| CONNECT_TIMEOUT_MS | 2000 | 100–5000 | connection establishment |
| WAIT_QUEUE_TIMEOUT_MS | 1000 | 100–5000 | legacy pool wait; CSOT takes precedence |
| SOCKET_TIMEOUT_MS | 3000 | 100–10000 | socket inactivity, not total work duration |
| CLEANUP_TIMEOUT_MS | 2000 | 100–5000 | each explicit cursor/abort/session cleanup |
| MAX_POOL_SIZE | 6 | 2–20 | application connections per server per process |

Existing bounded limits also apply: `ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS`
(default 2000, range 100–10000 ms), `ALAIA_RECONCILIATION_READ_TIMEOUT_MS`
(default 8000, range 500–15000 ms) and `ALAIA_RECONCILIATION_MAX_CONCURRENT_READS`
(default 4, range 1–16). The HTTP timeout also bounds subsequent detail work. Pool size must
be at least concurrency plus one; this is headroom, not a reserved cleanup socket.
The client has `minPoolSize: 0`, `maxConnecting: 2`, retries disabled and command
monitoring/driver component logging disabled. Replica-set monitoring adds sockets;
multiple servers/processes multiply resource cost. The independent client isolates
pool settings from checkout, webhooks and administrative writes; it does not
isolate server CPU or storage load.

Each cursor operation receives both `maxTimeMS` and CSOT `timeoutMS`, set to the
minimum of remaining monotonic work budget and command maximum. Driver 7 can
replace wire `maxTimeMS` using CSOT, so a longer CSOT is deliberately never passed.
Manual transactions avoid a shared `withTransaction` timeout context that would
prevent these per-command overrides. No operation starts after the work budget
expires or the HTTP request disconnects. Commit receives the remaining capped
budget; cleanup receives its separately bounded budget. Selection and pool waits
participate in CSOT; with CSOT enabled, `waitQueueTimeoutMS` is not an additional
independent acquisition deadline. Explicit initial `connect()` is outside this
per-operation CSOT and is completed before reads become ready. Driver/network/DNS
behavior can still delay initial connection or shutdown.

Cursor reads are awaited, then cursor close is explicitly awaited, followed by
commit or sequential abort and `endSession`. No AbortSignal is passed: the installed
driver's detached abort-listener cursor cleanup would undermine this ordering.
Cleanup is never raced against an active operation. No timer or `Promise.race`
releases concurrency. HTTP 504/disconnect stops further work, but capacity stays
occupied until the local operation and all cleanup promises settle. Cleanup failure
fails the reader closed (generic 503); saturation also returns generic 503. A stuck
operation/cleanup can hold its slot indefinitely. Independent cleanup deadlines
and driver internal cleanup may refresh budgets, so the HTTP budget is neither a
strict total cleanup deadline nor proof of remote cancellation. `endSession` and
driver rejection do not certify remote abort acknowledgement. A client shutdown
awaits pending reads before closing; it too may remain blocked. Operational
mitigation requires alerting on retained slots and fail-closed isolation/restart,
not early permit release or unlimited replacement clients.

Local tests use driver doubles and an isolated loopback HTTP server. They compare
pipelines/projections/DTOs, simulate snapshot races, inspect actual driver option
parsing and wire command construction without connecting, and exercise selection,
acquisition, query, cursor/abort/session failures, delayed errors, disconnects,
HTTP timeouts and shutdown races. GET/HEAD and absence of a native POST route are
covered. These prove local ownership, option forwarding and awaited ordering;
they do not certify a real MongoDB snapshot, server timeout enforcement or remote
termination. Production routes remain unwired because these guarantees need real
integration before activation.

Next validation requires approval and a **new, empty** `alaia_` + 32 lowercase hex
base, never an earlier test base, and a user with readWrite only on that base. A
future guarded runner must validate URI/database/confirmation, effective privileges
and emptiness before synthetic setup, leave a permanent no-reuse marker, and never
read production. Compare native and current DTOs/aggregations; exercise concurrent
case/source/audit commits, rollback and snapshot consistency; inspect actual wire
options and server maxTimeMS behavior under pool contention and slow operations;
measure cleanup/retained slots after disconnect, timeout and network interruption.
Inspect transaction/server logs only with redacted approved tooling. Confirm no
financial fixture mutations, repeated cleanup or cross-client sessions. This
prototype adds no new real runner and performs none of these external experiments.

Prototype checkpoint validation (local only): **246/246 tests passed**, including
33 native-reader regressions and isolated HTTP GET/HEAD coverage. Web TypeScript,
syntax and tracked/new-file whitespace checks passed. Existing duplicate-index
warnings for Usuario email/stripeAccountId remain outside this change; no index
operation was performed. Branch remains `fix/production-hardening`, HEAD `d25928d`.
No prototype routing, external connection, deployment or commit was performed.


Final local lifecycle review: leave `ALAIA_RECONCILIATION_NATIVE_READER_ENABLED`
unset or exactly `false` to keep the prototype disabled. Missing connection or
budget variables do not enable it. No router/bootstrap currently imports it, even
when that flag is `true`; activation would require a separately reviewed mounting
change after isolated real-server validation. There is no automatic reconnect or
replacement-client retry. Repeated initialization is rejected; repeated shutdown
awaits the same promise, including rejection or unresolved cleanup. A failed close
leaves the reader unavailable and does not certify that sockets or remote work
ended. Fresh-process import tests forbid driver/service loading, network connection
and timer/microtask scheduling during import and default-disabled construction.
Initialization failures at constructor, connect and database-handle acquisition,
concurrent/repeated connect, and failed/blocked/repeated client close are covered.
No native implementation or route change was needed during this final review.

Final verification: **254/254 local tests passed**, including **41 native-reader
regressions**. Web TypeScript, JavaScript syntax and tracked/new-file whitespace
checks passed. The installed driver and both dependency manifests agree on 7.0.0;
comparison to HEAD confirms the lockfile adds only the root direct dependency,
without replacing any resolved package. The same six files remain pending.

### Isolated native-reader integration runner (local preparation history)

`backend-multi/scripts/mongo-native-reconciliation-reader-integration.js` is an
independent opt-in runner. Import is inert; it mounts no Express routes and does
not change the production activation flag. Its native reader is constructed only
inside the isolated trials with a private explicit configuration. No production
model, order hook, Firebase, Stripe client, worker or scheduler is started.

Required variables are exactly the established isolation inputs:

- `ALAIA_MONGO_TEST_DB`: a new `alaia_` plus 32 lowercase hexadecimal characters.
- `ALAIA_MONGO_TEST_CONFIRM`: exactly that same complete database name.
- `ALAIA_MONGO_TEST_URI`: an explicit Atlas SRV URI with user
  `alaia_integration_test`, a nonempty URL-encoded password and the exact database
  path. Only the established safe URI options are accepted. No dotenv or production
  URI fallback exists.

The permanent previous-run denylist is reused from the administrative integration
runner, including `alaia_faf7a4d2651ecd5fb67539a6eb5889ad` and all three earlier
consumed names. An attempted claim is also blocked in this process. In a new
process, even an empty collection/marker causes the empty-database check to fail.
Record every new attempted database in the permanent historical denylist before a
later checkpoint. Never remove the marker or collections to bypass these guards.
Production/ambiguous NODE_ENV values, production URI aliases/service credentials,
ambient reconciliation configuration and driver logging environment overrides are
rejected before loading/constructing the driver. Permission checks occur after
connection but before the first write: exactly one authenticated test user, exactly
readWrite on the target database, no other database/cluster privilege resource.
The runner inspects connectionStatus/hello metadata on admin; it does not query
backendmulti or try a denied production read.

Before writes, the setup client checks its exact database identity, effective
privileges, replica-set primary/session/lookup capability and zero collections;
the listCollections cursor is explicitly closed and awaited. It then creates
`alaia_native_reader_run` and writes a majority-acknowledged unique `_id: single-use`
marker. Namespace creation and that unique ID arbitrate concurrent claims; only a
winner proceeds to fixtures. Partial claims are conservatively non-reusable.
The marker/data remain after success, failure or interruption. There is no delete,
drop, syncIndexes or explicit index-creation command. Creating an isolated
collection implicitly creates its normal `_id` index, solely on future authorized
execution; no existing Atlas index is touched.

The runner uses three independent clients, sequentially cleaned up: setup/writer
(native pool maximum 2), prototype reader (maximum 3, two concurrent reads) and
fixture-only Mongoose comparator (maximum 2). These are per-server, per-process
limits; monitoring sockets are additional. Mongoose uses empty fixture schemas
with autoCreate/autoIndex/buffering disabled and the existing repository/service,
not production models or hooks. Thus equivalence certifies repository/DTO reads on
these fixtures, not every production schema, data shape or authorization route.
All namespaces are fixed isolated `native_*` fixture collections.

| Trial | Required assertions/evidence in the complete final JSON | Limits of certification |
| --- | --- | --- |
| A equivalence and privacy | Native/Mongoose listing and detail DTO equality, filter/page/empty-page cases; private sentinels absent | Synthetic fixtures only; no production-volume benchmark or HTTP authorization certification |
| B snapshot | Read paused after case; a same-base synthetic transaction commits administrative case/audit and order updatedAt metadata; old detail has case/audits/source timestamp before commit, fresh detail has all after commit | Requires a real successful run; source metadata is intentionally changed, financial fields are unchanged |
| C driver limits and cleanup | Observed native read commands have positive wire maxTimeMS ≤2000; captured CSOT equals requested cap; same-client sessions; snapshot command observed; no tracked cursors, sessions or checked-out connections after awaited work | Option forwarding/wire evidence only; does not measure server timeout enforcement or certify remote cursor destruction |
| D HTTP timeout | Controlled wait before driver I/O yields generic 504; local slot retained until injected timeout settles and cleanup finishes; later real read succeeds | Explicit local fault injection, not a server-expensive query or proof of remote cancellation |
| E saturation/disconnect/recovery | Two controlled waits retain both slots, third read gets generic 503; disconnected HTTP frees no slot; sequential cleanup settles; later real detail succeeds with same client | Local concurrency lifecycle and usable pool; does not reproduce a network partition, failover or global fleet load |
| F immutability/shutdown | Full fixture fingerprints unchanged except explicitly asserted order updatedAt metadata; financial, stock, payout, event and counter fields unchanged; reader shutdown awaited | Other databases are protected by validated privileges/namespace configuration, not audited by reading them |

Instrumentation stores only approved command scalars and local resource counters,
not commands, filters, raw events, sessions identifiers, connection strings or
sensitive documents in the output. Cursor proxies instrument caller-facing reads
and explicit cleanup without replacing internal driver cursor-close behavior.
Artificial waits are released in finally and their complete work is awaited.
Barrier timer races coordinate fixtures only; they never release a read permit or
detach cleanup. Neither local resource counters nor successful endSession proves
that a remote operation stopped. The result always reports
`remoteTermination: not_verified`, `performance: not_certified` and driver evidence
`serverTimeoutEnforcement: not_certified`. Actual expensive-operation maxTimeMS,
selection/acquisition timeouts, network interruptions and remote cleanup require a
separately approved, controlled integration design, potentially server observability
not available to this narrow readWrite user. Do not broaden its permissions merely
to obtain those metrics.

After explicit approval for a real run, use a new temporary Terminal session and
unset production connection/service variables, ambient reconciliation flags and
MongoDB logging overrides. Obtain only the Atlas SRV hostname. Enter the password
with Terminal's hidden `read -s`, never in chat, files, history or a literal command.
Set the nonsensitive database and exact confirmation variables. Construct the URI
in memory with URL encoding; do not echo it or use printenv, shell tracing, saved
.env files or diagnostic command logs. The direct runner command, once the three
variables are configured in memory and execution is approved, is:

```sh
node backend-multi/scripts/mongo-native-reconciliation-reader-integration.js
```

It must be invoked from the repository root, only once. The runner does not
configure Atlas or create permissions. Keep the **complete final JSON and exit
status**, with `passed` containing exactly A–F, evidence for every row, retained-data
and do-not-reuse flags, plus successful cleanup. A stage enters `passed` only after
all its assertions complete; failures emit generic redacted JSON and nonzero exit.
A prompt returning without this complete evidence is insufficient certification.
Do not rerun after failure, missing output or interruption. Redact diagnostics,
rotate the test password in Atlas after review, and unset all temporary URI,
password, hostname, database and confirmation variables in Terminal.

Evidence at the local preparation checkpoint (before the real execution recorded
below): this runner had **never connected or executed A–F on MongoDB**. Local safety tests validate rejection before connection,
privilege/identity/emptiness guards before writes, marker claim reuse protection,
redaction, and awaited cursor/client cleanup using doubles. Server behavior and
performance remain uncertified; the prototype remains unrouted and disabled.


Local preparation validation: **267/267 tests passed**, including 13 new runner
safety regressions; web TypeScript, both JavaScript syntax checks and tracked/new
file whitespace checks passed. HEAD remains `9dc2211` on
`fix/production-hardening`. Only this runner, its tests and this document changed.
No real run, connection, collection/index creation, permission change or commit
occurred. Runner shutdown and the Mongoose comparator's retries/cleanup have no
certified hard end-to-end deadline: an unresolved driver/cleanup promise may keep
the process pending. Preserve that behavior rather than race cleanup, create
replacement clients, or claim that a returning HTTP response cancels remote work.

### Final security review and proposed Atlas preparation (no external action)

The review adds a snapshot-session-acquisition failure regression: writer session
creation is inside the protected block, and a nested finally awaits the pending
reader before abort/endSession cleanup even if the reader rejects. New CLI tests
confirm exit code 1 and exclusively redacted failed JSON for missing configuration
and a partial claim failure. Marker tests confirm the majority-acknowledged marker
precedes seeding, survives a failed seed, and blocks a newly loaded runner process
through the nonempty-collection guard. Failure evidence includes `claimAttempted`
and `markerAcknowledged`; a failed/unacknowledged claim is not advertised as a
confirmed durable marker. Retention flags express the no-deletion policy, not proof
that every fixture was inserted. A consumed/ambiguous attempt must never be reused.

At the preparation checkpoint, the proposed fresh name was
`alaia_2754d1782faf11ea3681d2eeed70bc47`, generated locally and not yet checked,
created or used in Atlas. This is historical preparation only; the execution
record below permanently supersedes its fresh-candidate status. At that point,
its emptiness still required preflight verification; no manual collection was to
be created through Atlas Data Explorer. The name initially scoped only the test
user role; marker and fixture creation required separate execution approval.

Historical preparation procedure for that run (do not repeat for this consumed
database); any future run requires a different fresh name and separate approvals:

1. In the intended project, open Security → Database Access and Edit the existing
   `alaia_integration_test`. Do not edit another user.
2. Remove the previous test-database role. In Specific Privileges/roles, leave
   exactly `readWrite`, database `alaia_2754d1782faf11ea3681d2eeed70bc47`, collection
   blank (whole database). No built-in general role or additional privilege.
3. Preserve password, authentication method, cluster restrictions and network
   access rules. Confirm there is no backendmulti role or privilege.
4. Present the complete proposed role configuration for approval before Update
   User. No base, collection, index or data is created by preparing this form.
5. Only after explicit saving approval, Update User, wait until Atlas applies the
   change and verify the single role. Stop before the runner.
6. Prepare the three temporary Terminal variables and hidden password entry as
   above. Keep NODE_ENV unset/test/development and remove conflicting production
   variables; never echo the URI. Request separate authorization for the one real
   runner invocation. No manual production probes or broader monitoring roles.

Verification: **17/17 runner safety tests and 271/271 complete local tests passed**;
web TypeScript, syntax and tracked/new-file whitespace checks passed. The same three
pending files remain on `fix/production-hardening`, HEAD `9dc2211`. No Atlas/Stripe
connection, external configuration, collection/index creation or commit occurred.
At that checkpoint, remote termination, server timeout enforcement, performance
and actual snapshot results were uncertified pending the separately authorized
real trial. The execution evidence below supersedes only the tested snapshot
result; the other certification limits remain.


### Confirmed single native-reader execution from `5c42b81`

Reference commit: `5c42b81d9c062f757616ab3b26b7951d85c55da5`, branch
`fix/production-hardening`. The branch, clean working tree and runner blob matching
that commit were verified locally before execution. The operator executed the
runner once after correcting configuration in the original Terminal session;
the earlier configuration failure occurred before connection and attempted no
claim. No run was repeated to obtain this evidence.

Execution date: **2026-10-02 (America/Chicago)**, based on local capture-file
modification times: `resultado.log` at 06:44:30.531188 -05:00 and `exit-code.txt`
at 06:44:30.543038 -05:00. The complete JSON was read from
`/private/tmp/alaia-native-result.8c2FnC/resultado.log`; the adjacent
`exit-code.txt` records **0**. The log contains exactly one JSON object and no
additional lines. Both files have mode 0600 and timestamps approximately 12 ms
apart, consistent with the authorized wrapper capturing output and then the
immediate exit status. Content inspection found no URI, credential, personal
record or sensitive document. No such data is copied into this document.

The common capture directory, wrapper procedure, matching database and adjacent
timestamps support that these files belong to the same execution. Neither file
contains a run identifier, signed provenance, executed commit hash or an embedded
execution timestamp; this is local operator/capture evidence, not independent
server attestation. The date and commit reference have the provenance stated above.

Database: **`alaia_2754d1782faf11ea3681d2eeed70bc47`**. The final JSON includes all
six expected `passed` entries, with the following exact evidence fields:

| Trial / exact `passed` entry | Recorded JSON evidence | Demonstrated scope |
| --- | --- | --- |
| `A equivalence and privacy` | `evidence.equivalence = "native_vs_fixture_mongoose_repository"` | Listing/detail DTO equivalence, tested filters/pages and privacy assertions against the fixture-only Mongoose repository. |
| `B snapshot during synthetic administrative commit` | `evidence.snapshot = "case_source_audits_before_and_after_committed_writer"` | The detail retains coherent case/source/audits before a concurrent synthetic writer commit, and a fresh detail sees the committed state. |
| `C effective driver limits and cursor session cleanup` | `evidence.driver.observedReadCommands = 20`; `evidence.driver.wireCommandCapMS = 2000`; `evidence.driver.serverTimeoutEnforcement = "not_certified"` | Positive bounded read-command limits were observed; option forwarding, same-client snapshot/session use and awaited local cursor/session/pool cleanup assertions passed. This does not certify server enforcement. |
| `D HTTP timeout with retained local operation` | `evidence.timeout = "injected_local_wait_not_server_cancellation"` | Instrumented local waiting yields the generic HTTP timeout while retaining the operation slot until work and cleanup settle; a subsequent real read succeeds. |
| `E concurrent saturation disconnect and pool recovery` | `evidence.concurrency = "two_retained_slots_generic_saturation_then_real_query_recovery"` | Two retained slots cause generic saturation; HTTP disconnect does not prematurely free a slot; after awaited work, a real query recovers on the same reader/client. |
| `F financial immutability and local shutdown` | `evidence.financialState = "unchanged_except_declared_order_updatedAt_metadata"` | Before/after fixture fingerprints and the separately asserted metadata change pass; financial, inventory, fulfillment, payout, event and counter fixture state is unchanged. Local reader shutdown is awaited. |

Successful exit and inclusion in `passed` mean each trial's coded assertions
completed; the compact evidence fields are summaries, not individual command traces
or a count of every assertion. The order `updatedAt` modification in B is intentional
synthetic metadata; this run is not described as making no writes at all.

Retention evidence is explicit: `claimAttempted: true`,
`markerAcknowledged: true`, `syntheticDataRetained: true` and
`doNotReuseDatabase: true`. Execution reached the trials after the runner's identity,
exclusive-permission and empty-collection preflight checks and the majority-acknowledged
marker insert. The marker and synthetic data remain. This name is **permanently
consumed: never reuse it, remove its marker or delete collections to bypass the
empty-base guard**. The native runner now also permanently rejects this exact name
in configuration validation before loading the driver, constructing a client or
connecting, regardless of whether collections still exist. A local regression uses
an empty-collection client double and proves that neither driver loading nor any
client operation is reached. The inherited historical denylist remains unchanged;
retained collections provide an additional runtime guard for all consumed bases.

The final result explicitly retains `remoteTermination: "not_verified"` and
`performance: "not_certified"`. Server enforcement of command timeouts remains
`"not_certified"`. D/E use controlled local fault injection, not evidence that
MongoDB canceled a remote operation. Local settlement, resource counters and
endSession do not attest remote termination. Network partitions, failover,
selection/acquisition failures under real load, production-volume performance,
remote cleanup and behavior outside the enumerated fixture scenarios remain
unverified. Financial comparisons are before/after assertions on fixtures, not an
independent audit of transient changes or other databases. No other database was
queried to establish isolation; that boundary relies on validated permissions and
fixed namespaces.

At the execution-evidence checkpoint, the native reader remained **disabled by
default and unmounted in Express**. Only the isolated runner enabled its private
instance. The later local integration section describes the new opt-in mounting,
which remains disabled by default. This evidence does not
authorize activation, replace the mounted Mongoose reader, enable financial
resolution, or certify deployed HTTP/authentication behavior. Documentation review
performed no Atlas/Stripe connection, runner execution, index operation, permission
change, route change or financial mutation.

Documentation verification: **271/271 local tests passed**, including the 17
runner safety regressions and 41 native-reader regressions. Web TypeScript
(`--noEmit --incremental false`), syntax checks for the runner, safety tests and
both native-reader modules, and `git diff --check` passed. The initial restricted
run had 26 loopback-listening EPERM failures; the complete suite then passed with
local loopback permission. No test was skipped and the real runner was not invoked.
That documentation-only verification preceded the separately authorized
permanent native-run denylist and regression checkpoint.

Checkpoint validation: **18/18 runner safety tests and 272/272 complete local
tests passed**. Web TypeScript, runner/test syntax and `git diff --check` passed.
The only checkpoint changes are the execution record, the native runner's permanent
consumed-name guard and its preconnection regression. Trials, pipelines, routes,
indexes and financial logic are unchanged; private result files are not included.

### Reversible native GET integration from `80819f1` (local preparation only)

The administrative router has an injectable factory. Startup selects its list and
case-detail GET handlers once; Express HEAD uses the same GET registrations.
POST `/:caseKey/reviews` always retains the Mongoose review controller and the
existing origin/content-type protection. Authentication/soloAdmin, raw-query
ambiguity guard, logging redaction, strict validation, DTOs, cache headers and
error contracts remain unchanged. No pipeline or financial operation is changed.

`ALAIA_RECONCILIATION_NATIVE_READER_ENABLED` remains absent/false by default.
Exactly true opts into the native reader; any other value fails configuration.
No environment file is changed. The lifecycle module is inert on import and
snapshots configuration once. It memoizes initialization and shutdown and owns
at most one native reader/client; it cannot change readers in flight or restart
a failed/closed reader. Disabled mode constructs no native client. Only explicit
startup calls connect; handlers become available only after successful connection.

Startup retains the relative order of existing services: primary Mongoose
connection, optional workers, then HTTP. If explicitly enabled, native initialization
is inserted after the primary connection and before optional workers/HTTP. It uses
an independent client with the same configured URI, the connected Mongoose database
name and exact collection names from existing models. Native database identity is
checked before exposing handlers. This adds no index/collection provisioning and
no client per request. Initial failure prevents workers/HTTP startup and triggers
cleanup; no silent Mongoose GET fallback exists. Existing workers, checkout,
webhooks and review writes retain their connections and behavior. The reader pool
and driver limits are unchanged; separate credentials/least-privilege provisioning
remain an external future decision, not performed here.

Later connectivity errors return generic 503/504 using the selected reader. Driver
topology recovery may restore that same client; cleanup failure marks it failed
and no replacement client is created. There is one native read runtime, not a
second wrapper runtime. Slots remain retained through all awaited operation,
cursor, transaction and session cleanup, including after HTTP timeout/disconnect.

SIGINT/SIGTERM handlers are registered before asynchronous initialization.
Shutdown immediately closes native admission, stops HTTP acceptance and awaits
HTTP closure plus reader draining/client closure. Failure of one closure does not
bypass awaiting the other. The existing 10-second watchdog is retained and explicitly
reports forced termination with possibly pending cleanup and unverified remote
termination; it is not a clean shutdown or release of concurrency capacity.
Existing Mongoose/worker shutdown limitations are not broadened into a claim of
fully draining every production service. The whole server module remains the
existing executable entry point with startup side effects; router/lifecycle/native
module imports do not connect. Tests do not execute production startup imports.

`/readyz` retains its existing Mongoose-only contract and does **not** certify native
reader availability. Reversal requires setting the flag false/unset and restarting;
there is no hot toggle and no data change or POST switch. Failed native startup
therefore blocks the instance until corrected or reverted. Native health metrics,
real network interruption/failover, production collection/data-shape compatibility,
server timeout enforcement and deployment-level shutdown remain unverified.
The earlier fixture A–F run does not certify this new Express/lifecycle integration;
any future real validation needs a fresh isolated database and separate approval.

Local tests exercise both router selections, initialization memoization, explicit
failure without HTTP/fallback, closing during initialization, late cleanup errors,
HTTP close failure with retained cleanup and watchdog behavior. Actual loopback
HTTP mounts the factory with native driver doubles, checking auth ordering,
GET/HEAD, validation, no-store, generic unavailability and POST remaining on its
injected write controller. Existing HTTP regressions cover real auth/CSRF,
idempotency/CAS/rollback and financial immutability in default Mongoose mode;
existing native regressions cover saturation, disconnection, timeouts and late
cleanup with retained slots. No Atlas/Stripe connection or runner execution is
performed by this local implementation.

Implementation verification: **284/284 local tests passed**, including 10 new
router/lifecycle/server integration tests and two new native-reader regressions.
Web TypeScript, syntax of all changed/new JavaScript files and whitespace checks
passed. Initial native regressions failed because the old driver double omitted
databaseName; the double now models identity and includes an explicit mismatch
regression. No test was skipped. No commit or external activation is performed.

### Final local lifecycle audit before checkpoint

Two additional failure paths were corrected: a fatal startup error arriving after
a signal now upgrades the pending shutdown exit code instead of retaining zero;
a synchronous reader.close failure is converted to a generic, memoized rejected
cleanup promise without retrying close. Clean/error completion clears the watchdog;
terminal-state guards prevent a later timer from emitting another exit or a forced
exit from later being described as clean. HTTP closure and reader closure still
both settle before any normal shutdown outcome. Initial failure remains reported
by startup; cleanup failure remains reported separately without raw driver errors.

Executable startup regressions cover flag absent, false and true: disabled modes
create no native reader and preserve primary connection → optional workers → HTTP;
enabled mode waits for native connection before workers/HTTP. Signal regressions
hold initialization pending, begin shutdown, and then complete or fail initialization:
neither path opens HTTP afterward. Construction/import, fixed configuration,
repeated initialization/close/signals, synchronous and late close failures,
preinitialization shutdown, factory failures, concurrent HTTP-close errors and
clean-versus-forced shutdown are covered locally. A combined native connect/close
failure regression verifies both failures stay observable, one client is owned
and close is not retried. No fallback or extra client is introduced.

Default-disabled behavior preserves the selected Mongoose handlers, POST path,
worker order and ordinary HTTP startup. Shutdown handling is intentionally hardened
for early signals and late failures; it is not byte-for-byte identical to the old
signal behavior. A signal-related initialization rejection can now yield a nonzero
exit after cleanup rather than silently report success. The existing 10-second
forced-process watchdog remains; pending local cleanup is never equated to remote
cancellation. /readyz remains Mongoose-only. No claim is made that importing the
existing executable server entry point is inert; the new lifecycle module and
router/native modules create no connections at import. Checkout, webhook, financial
code, indexes, pipelines, DTOs, route authentication and write protection are unchanged.

Audit verification: **296/296 local tests passed**, including **21 lifecycle/router/
server tests** and **44 native-reader tests**; web TypeScript, syntax of all six
changed/new JavaScript files and tracked/new-file whitespace checks passed. No
real integration runner, production startup or Atlas/Stripe connection was executed.
The same seven pending files remain on fix/production-hardening at 80819f1;
no commit, external flag change or deployment occurred. The real-environment,
remote-operation and full-service shutdown limitations described above remain.


### Scoped logging privacy and full local Express validation (2026-10-02)

Reference: c8570c8341cc3487712df8343a2b1381d6597f3e, branch
fix/production-hardening. The native reader remains disabled by default; no real
configuration or environment file was changed.

The global error handler previously logged originalUrl and arbitrary error
messages, including CORS/parser errors before authentication. The authentication
catch also logged an arbitrary message. For reconciliation requests both now emit
only method, a constant route template, HTTP status and an allowlisted error code.
Morgan retains the same restricted metadata without an error code. Classification
uses a nonthrowing lexical check of origin/absolute-form targets; it never turns
an authority, case identifier or query into a logged route. Malformed authority,
unknown method/code/type and unmatched subroutes cannot introduce arbitrary log
values. A headers-sent reconciliation error destroys the response rather than
handing arbitrary error details to Express' default logger. Scoped error responses
are generic in development as well as production. Other APIs retain their previous
logging and global-error response behavior; this is not a general privacy audit.

The new harness evaluates every statement of server.js in a VM, capturing only
its startup promise instead of importing/running the production entry point. It
uses real Express, router, controller, authentication middleware, signed synthetic
JWT cookies, validation, CORS, Morgan, parsing, security middleware and reader
lifecycle. Synthetic environment values replace dotenv and host configuration.
Primary Mongoose connectivity, user lookup, repositories and MongoDB driver are
controlled doubles. Non-reconciliation routes are sentinels, not real services.
A test guard rejects Stripe/Firebase/worker/scheduler imports, external DNS,
non-fixture TCP connections and listeners other than 127.0.0.1:0. The negative
regression deliberately attempts blocked actions and verifies denial before action.
No Atlas/Stripe connection, real integration runner or production service starts.

| Local matrix | Evidence and scope |
| --- | --- |
| Reader absent, false, true | Fixed selection; no native client in disabled modes; one client in enabled mode; primary/native initialization precedes HTTP. |
| GET/HEAD and authorization | Actual loopback HTTP with test cookies; unauthenticated/nonadmin rejection, no-store, strict query/reference/pagination validation, native/Mongoose DTO equivalence. |
| POST in both modes | Actual service with in-memory Mongoose-provider repository: origin protection, repeated-request idempotency, CAS conflict and rollback; no native write provider. |
| Logging/error privacy | Actual Morgan output and console.error captured, including authentication errors, CORS, malformed JSON/URI/absolute authority, unsupported charset, oversized bodies and headers-sent errors. Sensitive URL/query/body/cookie/error sentinels are absent from all captured channels and responses. |
| Startup/connectivity | Initial failures/invalid flag prevent listen and fallback; later driver error is generic, same-client recovery does not switch to Mongoose. |
| Capacity/timeout/disconnect | HTTP timeout and client disconnect retain occupied slots through pending local work and sequential cursor/session cleanup; saturation stays generic in both modes. |
| Shutdown/watchdog | Signals during initialization cannot open HTTP; active query/cleanup delays shutdown; forced exit is distinguished from clean completion and does not claim remote cancellation. |
| Readiness/reversal | /readyz retains its Mongoose-only contract; changing configuration in a running fixture does not switch readers; a fresh fixture models restart reversal. |
| Financial separation | Fixture financial/inventory/fulfillment state remains unchanged across tested HTTP operations. Other production routes are not executed or certified. |

Verification: **52/52 targeted HTTP tests passed** (27 full-harness/security tests
plus 25 existing HTTP regressions); **323/323 complete local tests passed**, none
skipped. Web TypeScript, JavaScript syntax and tracked/new-file whitespace checks
passed. The shared HTTP fixture was extracted into test-only helpers; the previous
empty auth logging channel was replaced with captured output.

These are local-double results, not infrastructure certification. The driver
simulates query results and snapshot data; it does not execute MongoDB pipelines,
server timeouts, real transactions, durable CAS or real pool recovery. Signal
callbacks, process exit and watchdog firing are controlled, not OS-level process
termination. Test cookies/CORS are not deployed-browser certification. No claim
is made about remote cancellation, real performance or complete Mongoose/worker
drain. Earlier isolated native A–F evidence does not certify this new HTTP harness.
A later independent integration must use a fresh isolated database, minimum
permissions and separate authorization; it must distinguish command submission,
local cleanup and verifiable remote evidence. No existing consumed base is reused.


### Final local harness isolation audit

The four harness helpers remain under backend-multi/test only. A source inspection
of server.js and src/**/*.js found no references to those helpers; production
configuration and HTTP inputs cannot select them. The production diff still only
changes scoped logging and its authentication/global-error paths. GET/HEAD security,
POST Mongoose selection, pipelines, indexes and financial code are unchanged.
The native option remains absent/false by default.

Additional test-only hardening rejects dotenv imports, credential paths and reads
outside backend-multi, all child-process creation APIs, and the DNS resolve family.
Network access remains limited to registered ephemeral loopback fixture ports.
All construction/evaluation failures in the server sandbox restore its guard,
including failures before VM execution. A teardown regression runs both modes,
waits for HTTP closure and confirms no additional fixture sockets/listeners remain;
it checks restoration of intercepted module/network/filesystem/process APIs,
console.error, signal listener counts and host environment names/selection flags.
It does not read host credential values. No child process is created by the harness.

These guards are scoped, in-process test defenses, not a security boundary for
hostile JavaScript or arbitrary prebound APIs. They assume sequential fixtures in
the test worker; concurrently executing unrelated code inside the same process
would also see the intercepted APIs. Synthetic MongoDB results and controlled
signals/watchdog still do not certify real aggregation, server timeout enforcement,
remote termination, OS-level shutdown or performance. Existing scoped-log tests
capture real Morgan and console.error channels, including errors before auth;
non-reconciliation logging is deliberately preserved and not certified private.

Final audit verification: **55/55 targeted HTTP tests passed** and **326/326 local
tests passed** (including the parent teardown test and its two mode subtests), with
no skips. Web TypeScript, JavaScript syntax and tracked/new-file whitespace checks
passed. The same 11 files remain pending at c8570c8341cc3487712df8343a2b1381d6597f3e;
no real configuration, external connection, runner execution or commit occurred.


### Independent Express + MongoDB integration runner (prepared locally only)

`backend-multi/scripts/mongo-express-native-reconciliation-integration.js` is an
independent opt-in runner prepared from reference commit
199f067d0ffe4a2a74009e48c2d427a0b7c9ff51. It has NOT been run against MongoDB.
The production reader flag, server, routes, models and financial code are unchanged.
Importing the runner does not load MongoDB/Mongoose/Express or connect to services.

#### Explicit configuration and durable single-use admission

Required variables are ALAIA_MONGO_TEST_URI, ALAIA_MONGO_TEST_DB,
ALAIA_MONGO_TEST_CONFIRM (exactly equal to the database) and
ALAIA_MONGO_TEST_LEDGER_PATH (absolute canonical path ending in
consumed-databases.json, outside the repository). The URI must have the exact
/database path, Atlas SRV hostname, alaia_integration_test credentials and the
existing native runner's strict option contract. No dotenv or MONGO_URI fallback
is used. Production/service credentials, ambient reconciliation flags, MongoDB
logging options and NODE_OPTIONS/NODE_DEBUG/DEBUG are rejected. A Node preload
could act before validation; use a clean Terminal process without preloads.

Proposed persistent ledger location on this Mac:
/Users/eduardomelendez/Library/Application Support/Alaia/integration/consumed-databases.json.
No ledger is created at that location by this implementation. Provisioning is a
separate, reviewed step before execution: dedicated directory owned by the current
user with mode 0700, regular single-link file owned by that user with mode 0600,
canonical path without symlink components. Initial content must be exactly an
object with version: 1 and consumed: an array containing ALL names exported as
historical by scripts/reconciliation-integration/consumptionLedger.js. Never
initialize an empty replacement after prior attempts. The five historical names
are also rejected by code even if all remote collections were removed.

A sibling .lock directory is acquired atomically before any client is constructed
and held through cleanup. A missing/corrupt/insecure/locked ledger fails closed.
The full consumed record is written and fsynced, its containing directory is
fsynced, and the record is reread before any database write. A zero-length write,
failed sync or ambiguous update never grants write admission. A crash during an
in-place update may leave corruption or a stale lock; both block subsequent runs.
No automatic stale-lock recovery exists. Verify the owner process is gone and
review/recover the complete consumption history before manually unlocking.

Back up the ledger persistently after each attempt; it contains names, not
credentials. A lost ledger must block execution until history is reconstructed
from trustworthy backups/checkpoints. A user able to erase/replace both this ledger
and the remote marker can defeat historical protection; this is not tamper-proof
storage. Unix owner/mode checks do not certify every filesystem ACL or privileged
actor. Future consumption should also be recorded in the permanent code history
at a separately approved checkpoint. Older runners do not automatically import
this new ledger; do not use them to circumvent this runner's single-use decision.

#### Read-only checks and allowed writes

Before writing, the setup client and isolated Mongoose client check exact database
identity, authenticated user, one readWrite role exclusively on the chosen base,
effective privileges, primary/session/version compatibility and zero collections,
including empty collections. A real snapshot read transaction against the absent
marker namespace is attempted and aborted/endSession awaited. If the deployment
rejects that read-only capability probe, execution stops; topology metadata alone
is insufficient. Each native reader connection also verifies identity/privileges.
Only hello/connectionStatus metadata is requested through admin; backendmulti is
never queried. Newly introduced connection identity discrepancies fail closed.

After durable consumption, the runner creates alaia_express_native_run and inserts
its single-use marker with majority acknowledgment, then checks the stored runId.
Only then may fixtures be seeded in express_users, express_orders, express_events,
express_cases, express_audits, express_counters, express_products and express_payouts.
Marker/fixture failures never permit retry or automatic deletion. The only indexes
are MongoDB's implicit _id indexes. autoCreate/autoIndex/buffering are disabled;
no createIndexes/syncIndexes/ensureIndexes, data deletion or permission changes run.

The caller-facing database fence denies other databases/collections, direct
commands, destructive APIs, explicit index APIs, aggregation output/foreign sources
and source financial updates. It is a defense for this trusted code, not a server
privilege boundary or a proof about arbitrary driver internals. Exclusive Atlas
privileges remain mandatory. The current pipeline sources are unchanged.

#### Real components and deliberate exclusions

An isolated module loader evaluates actual model sources with one private Mongoose
instance, preserving schema hooks, Counter closure binding, financial query guards
and model-level bulkWrite overrides. Usuario uses synthetic users/passwords and
bcrypt; authService generates fresh in-memory JWT keys. ReconciliationCase and
ReconciliationAudit document creation/validation run through actual POST/service
code. Orders are inserted directly as synthetic source fixtures: checkout save
hooks and financial lifecycle creation are deliberately NOT exercised. No business
source is updated during trials; fingerprints compare full source fixture records.

The independent HTTP assembly uses real Express/cookie parsers, auth/soloAdmin,
controller, router, query guard, sanitization/HPP, service/repository and reader
lifecycle. CORS, Morgan and global-error middleware fragments are extracted from
server.js with explicit correspondence checks; server.js itself is not imported or
executed. HTTP binds only 127.0.0.1:0. The assembly has no production workers,
scheduler, Stripe or Firebase imports. It does not reproduce Helmet, production
rate/proxy configuration, other routes or the entire production startup/signal
handler. /readyz uses its actual Mongoose-only handler. Native activation exists
only in synthetic per-instance configuration; production remains default-off.

#### Prepared A–F evidence (historical preparation before the recorded run)

| Trial | Prepared observation | Evidence origin |
| --- | --- | --- |
| A | Disabled/enabled startup, real GET/HEAD/no-store, DTO equivalence and fixed selection via independent restart | real_mongodb |
| B | JWT cookie authentication backed by MongoDB users, authorization, strict validation, preauth parser/CORS errors and captured logs | real_mongodb |
| C | Mongoose-only POST, idempotent replay, stale version rejection, simultaneous reviewers with one CAS winner and actual audit counts | real_mongodb |
| D | A held detail snapshot sees its prior case/audit count while a concurrent POST commits; subsequent detail sees both new versions; financial fixtures unchanged | real_mongodb outcome with local_injection scheduling barrier |
| E | HTTP POST's case write rolls back when audit storage is deliberately made to fail; actual audit override is preserved | real_mongodb outcome with local_injection exception |
| F | Native command options/snapshot submission, no native write commands, cursor/session/pool drain, privacy and readiness; gated timeout/saturation retains capacity, shutdown waits cleanup, injected init failure never opens HTTP | mixed: nested real_mongodb and local_injection evidence |

Results include runId, referenceCommit, start/end timestamps, individual trial
origin/status/evidence, consumptionAttempted, claimAttempted, markerAcknowledged,
markerVerified, cleanup and explicit not_verified fields. syntheticDataRetained is
true only after seeding completed, false before any seed attempt, null when a seed
attempt failed and presence is uncertain. No fixture or marker is deleted.
A cleanup failure yields failed status; CLI failures return nonzero. The 180-second
watchdog emits redacted partial evidence and exits 1 with pending_or_unknown cleanup.
It never releases a reader slot to recover capacity or creates a replacement reader.

Server enforcement of timeouts, remote termination, actual network loss, forced
OS-process shutdown, performance and complete production-service draining remain
not_verified. A locally gated HTTP timeout is NOT evidence of Atlas cancellation.
The slot stays occupied until pending work and sequential cleanup settle. A blocked
cleanup may persist until the watchdog forces process exit; that leaves a stale
ledger lock and requires review. Per-process native pool size is 6 (one active
application at a time), Mongoose 3 and setup 2, plus driver monitoring connections;
this is a low-volume fixture test, not a load test.

#### Execution stages requiring separate approval

1. Review this implementation and all local tests first; no real result is certified.
2. Provision/recover the nonsecret persistent ledger and back it up. Generate a fresh
   alaia_ + 32 lowercase hexadecimal name and separately approve Atlas permissions.
3. Prepare explicit URI/database/confirmation/ledger variables in the same Terminal,
   using hidden password input and no .env or credential files. Validate locally.
4. Obtain separate approval for ONE real execution. Capture stdout JSON, stderr and
   exit code in a private directory (0700, files 0600), without shell tracing; inspect
   for secrets before sharing. Do not include these private outputs in Git.
5. From the first consumption/write attempt, never repeat on the same base, even
   after a timeout or an uncertain write. Preserve fixtures and marker for review.
6. Review A–F individually; add the consumed name to permanent history at a separately
   approved checkpoint. Rotate the test password/clear temporary variables separately.

Local verification exercises configuration rejection before client construction,
ledger failures/exclusive locking/durable reuse rejection, read-only preflight,
uncertain marker writes and cleanup with clients DOUBLED in memory. Runtime tests
exercise actual model hooks/overrides and real loopback HTTP with controlled MongoDB
and user lookup doubles; shutdown/query faults and watchdog use local doubles.
Those tests do not execute the full real A–F workflow or certify MongoDB behavior.


Preparation verification: **22/22 new runner safety/runtime tests passed**;
**348/348 complete local tests passed**, none skipped. Web TypeScript, JavaScript
syntax and tracked/new-file whitespace checks passed. Existing Usuario schema
warnings for duplicate email/stripeAccountId declarations remain local warnings;
no index changes or synchronization were performed. A regression demonstrates
that isolated Counter hooks bind to the same disconnected Mongoose instance and
that the audit model-level override remains effective. Both native and Mongoose
provider work is tracked/drained before a clean application shutdown; HTTP timeout
alone never establishes local completion. The real runner remains unexecuted,
the persistent operational ledger remains unprovisioned, and no Atlas permissions
or production activation were changed. Next steps require review, ledger
provisioning and separate authorization for external setup and real execution.


#### Final local runner audit (2026-10-02)

Reference remains 199f067d0ffe4a2a74009e48c2d427a0b7c9ff51. Configuration
validation precedes ledger acquisition; acquisition and rereading precede client
construction; read-only preflight precedes durable consumption; consumption
precedes marker attempts and fixtures. The ledger pins directory/file descriptors
and compares device/inode identities of directory, file and lock on each access.
Replacement by a symlink or another regular file, modified content, partial write,
failed sync or failed readback rejects admission. Two separate OS child processes
prove occupied-lock rejection and later persisted-consumption rejection. The five
historical namespaces are checked against previous runner sources.

These are cooperative local-filesystem protections, not mandatory OS locks or
tamper-proof storage. In-place interrupted writes may leave old valid content,
corruption or a stale lock; no remote write is admitted until full write, fsync
and exact readback succeed. A stale lock always requires manual review. Ordinary
fsync does not certify power-loss durability on every device/filesystem; network
filesystems, ACLs and hostile same-UID/privileged actors are not certified. Pinned
descriptors and identity checks do not remove every possible pathname race.

SIGINT/SIGTERM stop further admission, request application closure and await
ongoing local work sequentially. A signal during final cleanup also prevents a
success result. Signals cannot undo commands already sent or certify remote
termination. Blocked operation/cleanup remains pending until settlement or the
180-second watchdog exits nonzero with pending_or_unknown cleanup. The watchdog
is explicitly a forced exit, not graceful closure or remote cancellation.

Preflight now rejects ambiguous collection results, missing required privilege
actions and incomplete primary/session/version metadata. Async connection errors
are captured as fixed flags rather than arbitrary messages. Outgoing loopback
HTTP requests are awaited alongside provider work before application closure.
No production files, hooks, pipelines, indexes or financial behavior were changed.
Only synthetic raw order fixtures bypass checkout hooks; real administrative
hooks/overrides and the isolated Counter binding remain exercised locally.

All verification here uses local filesystem/process tests, controlled clients and
loopback HTTP. No Express+MongoDB real execution, production connectivity, server
timeout enforcement, remote cancellation or performance is certified. The real
runner is still unexecuted and the operational ledger has not been provisioned.

Final audit verification: **30/30 runner tests and 356/356 complete local tests passed**, no skips. Web TypeScript, syntax and whitespace checks passed. Git remains on fix/production-hardening at the reference commit; seven new files and this document remain pending for review.

#### Recorded Express + MongoDB integration (2026-10-02)

This section supersedes the earlier preparation/audit statements that this runner
had not yet executed. Those statements describe the local state at their respective
checkpoints, not the present certification status. One authorized execution used
`alaia_ab96febfbef06dfc2c2daabefae08bb9`. It must never be reused; no second execution
was performed to review these results. Original evidence files were read locally
and were not edited or copied into the repository.

The final JSON and separately captured exit code report **status: passed, exit 0**.
Run ID: `17760fd5-24a4-4b9d-affc-6ca7e097c4bb`.
Recorded interval: `2026-10-02T20:32:37.638Z` to `2026-10-02T20:32:57.701Z`.
The evidence files had private mode 0600 and no secrets were found in the reviewed
content. This privacy review is not a guarantee for arbitrary future output.

**Execution HEAD**, captured separately in head.txt:
`e61eb4511c00020094104faf7655c170ac8db075`.
**Implementation reference**, the runner's hard-coded referenceCommit:
`199f067d0ffe4a2a74009e48c2d427a0b7c9ff51`.
These identify different things; referenceCommit does not identify the exact code
executed. Their difference is documented, not repaired by changing original JSON.
Timestamps and the capture procedure are consistent with the same execution but
are not independent, unequivocal proof binding the four files together. Future
capture should separately identify execution HEAD and implementation reference;
a reviewed manifest binding runId, HEAD and file hashes would improve provenance.
No manifest or runtime metadata change is implemented by this documentation update.

| Trial | Confirmed JSON evidence | Boundary |
| --- | --- | --- |
| A startup_and_equivalence | passed; origin real_mongodb; getHead, readersEquivalent, restartSelection all true; http 127.0.0.1_ephemeral | Real MongoDB with independent test Express applications, not full production entry-point startup. |
| B authentication_validation_privacy | passed; origin real_mongodb; jwtCookies, authorization, preauthParsingAndCors, strictValidation all true | Synthetic users/cookies and controlled HTTP requests; logging capture assertions complete in F. |
| C mongoose_review_idempotency_cas | passed; origin real_mongodb; postProvider isolated_mongoose; replayedAuditNotDuplicated, staleVersionRejected, concurrentCasOneWinner all true | Administrative case/audit writes only; no financial resolution. |
| D snapshot_and_financial_invariants | passed; real_mongodb.snapshotTransactionCompleted, concurrentCaseAuditSnapshotObserved, completeFinancialFixturesUnchanged all true | Top-level origin local_injection: schedulingBarrier after_case_cursor_read coordinates the concurrent real MongoDB commit. |
| E administrative_hooks_rollback | passed; real_mongodb.httpPostRollback and auditModelOverridePreserved true | Top-level origin local_injection: audit_failure_after_transactional_case_write deliberately triggers the rollback. |
| F shutdown_and_privacy | passed; real_mongodb.localNativeDrainObserved, loggingCaptured, commandOptionsObserved, snapshotCommandSubmitted, nativeWriteCommandsAbsent, nativePoolCheckedOutZero all true; readyz mongoose_only | Top-level origin local_injection: timeoutHttp, capacityRetainedUntilCleanup, initialFailureNoHttp, queryFailureNoFallbackSameClient all true. The faults and scheduling waits are local, not real network/server failures. |

Consumption and retention fields are explicit: consumptionAttempted, claimAttempted,
markerAcknowledged, markerVerified, syntheticDataRetained and doNotReuseDatabase
are all true. The local persistent ledger was subsequently read without mutation:
it contained six valid unique names including this consumed base, with no mutex
remaining. The marker acknowledgment and verification are runner evidence from
this execution; no remote reread was performed during documentation review.

Cleanup reports local_work_settled, interrupted false, failedStage null. The recorded
invariants cover the synthetic orders/events/products/payouts/counter fixtures,
not independently audited production data or every possible financial scenario.
No native write commands were observed; administrative POST remains in isolated
Mongoose. The production reader remains default-off; fixture activation does not
change production configuration.

**Not verified:** remoteTermination, serverTimeoutEnforcement and performance remain
not_verified. F additionally lists forcedShutdown and realNetworkLoss. Observed
options and snapshot commands do not prove server enforcement of time budgets.
A locally instrumented HTTP timeout does not prove remote cancellation. There is
no certification of production-volume performance, the complete production server,
all services' drainage, or behavior outside the exercised scenarios.

The original stderr contained exactly two Mongoose duplicate-index warnings for
Usuario.email and Usuario.stripeAccountId, with no other unexpected messages.
They are retained as historical evidence. The subsequent local correction removes
only email's nonunique field index declaration (preserving the explicit unique
index), and the explicit duplicate Stripe declaration (preserving its field sparse
index). A fresh-process disconnected regression captures actual stderr and checks
one effective declaration of each index. No init, syncIndexes, index creation or
remote index migration is performed. Production connection configuration does not
explicitly disable autoIndex; actual remote index state and any future startup
index behavior require a separate review and are not certified by this fix.

Local verification of this follow-up: the new disconnected index regression passed;
**357/357 complete local tests passed**, none skipped. Web TypeScript, changed-file
JavaScript syntax and whitespace checks passed. No real runner or external service
was executed, original evidence files were unchanged, and no commit was created.

#### Local preparation: disable automatic Mongoose index/collection provisioning

**NOT AUTHORIZED FOR PRODUCTION.** This local change must not be deployed until a
separately authorized read-only inspection verifies critical remote indexes and
required collections. Disabling autoIndex does not repair a missing unique index.
Email uniqueness, Counter.key uniqueness and WebhookEvent(provider,eventId)
uniqueness must be checked explicitly; absent/incompatible indexes require a
separate reviewed migration, never automatic syncIndexes during application boot.

The shared connection in src/config/db.js now passes autoIndex:false and
autoCreate:false explicitly, preserving its server-selection timeout. This applies
to API, worker and expiration callers regardless of NODE_ENV. The direct utilities
reset-admin-password.js, resetPassword.js and scripts/crearAdminTemporal.js set
both Mongoose options before importing Usuario and pass both options to connect.
No model index declaration, hook, worker selection or financial operation changed.
The earlier audit's automatic-default behavior describes the previous checkpoint.

The guarantee concerns automatic Mongoose provisioning, not all ways MongoDB can
create a collection: an explicitly authorized ordinary insert may still create an
absent collection implicitly. Transactions requiring pre-existing namespaces can
fail if provisioning was previously relied on. Verify required collections before
production use; no collection or index provisioning is performed by this change.
Schemas can override connection defaults, and explicit index APIs bypass automatic
policy. The current model review found no enabling schema override; reconciliation
schemas retain their explicit false overrides. Future overrides and provisioning
APIs require review. Readiness remains a connection indicator, not index readiness.

The disconnected regression evaluates actual operational source with controlled
Mongoose, dotenv and model dependencies. No real dotenv configuration, credentials,
MongoDB driver or service is loaded. It checks absent/development/test/production
NODE_ENV, exact connection options, protected settings before model import, cleanup
following a simulated partial connection failure, and absence of explicit index or
collection operations in the four changed operational files. The isolated runners
and helpers remain unchanged and retain their own false options; their existing
local safety/runtime regressions continue to apply. No real runner is executed.
