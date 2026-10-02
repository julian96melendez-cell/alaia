# Critical MongoDB index metadata inspection — local preparation only

No remote inspection has been authorized or performed. Production deployment
remains blocked pending a separately authorized verification of the destination,
critical remote indexes and required collections. This inspector does not authorize
index provisioning, correction, deletion, data reads or production activation.

## Scope and expected local declarations

The independent script is `backend-multi/scripts/mongo-critical-index-inspector.js`.
Importing it loads no driver, connects nowhere and starts no timer or service.
It has no API, Mongoose, model, worker, Stripe, Firebase or dotenv dependency.
The manifest is explicit and a disconnected regression compares it to the actual
local schema declarations and collection names; schema drift must fail that test.

| Collection | Key (ordered) | unique | sparse |
| --- | --- | --- | --- |
| usuarios | email: 1 | true | false |
| usuarios | stripeAccountId: 1 | false | true |
| counters | key: 1 | true | false |
| webhookevents | provider: 1, eventId: 1 | true | false |

No partial filter or TTL is declared for these indexes. Expected collation inherits
the collection default, or simple collation if absent. Hidden indexes still enforce
uniqueness: report the hidden flag without treating it as proof of query readiness.
A missing `_id` index, missing namespace, view, incompatible options, duplicate
matching key patterns or build-in-progress metadata makes the report non-successful.
Additional indexes are counted, not deleted or automatically deemed incorrect.

## Explicit configuration contract

No default project, cluster, host or application database is provided. In particular,
`backendmulti` is not assumed, and integration databases are never used.
Required variables, all prefixed `ALAIA_INDEX_INSPECTION_`:

- `URI`: explicit Atlas SRV URI, with exact /DB path, username and nonempty password.
- `PROJECT_ID`: exactly 24 lowercase hexadecimal characters.
- `CLUSTER_NAME`: 1–64 ASCII letters/numbers/underscore/hyphen, starting alphanumeric.
- `HOST`: exact approved lowercase SRV hostname ending in .mongodb.net.
- `DB`: 1–63 ASCII letters/numbers/underscore/hyphen, starting with a letter.
- `CONFIRM`: exact concatenation
  `PROJECT_ID|CLUSTER_NAME|HOST|DB|usuarios,counters,webhookevents`.

The URI host and path must match the explicit target. No fragment or explicit port
is allowed. The only optional query parameters are authSource=admin, tls=true and
an appName of 1–64 letters/numbers/underscore/hyphen; duplicates are rejected.
Standard driver templates may contain other options and must be prepared separately
in memory under review, never blindly accepted. Credential placeholders are rejected.
Integration usernames (case-insensitive "integration") are rejected, as are ALL
`alaia_` databases, consumed or otherwise, plus admin/local/config/test. This stronger
namespace exclusion avoids consulting or mutating the consumption ledger.

Presence of any `ALAIA_MONGO_TEST_*` or `MONGODB_LOG_*` variable is rejected.
Unknown `ALAIA_INDEX_INSPECTION_*` names are rejected. NODE_OPTIONS/NODE_DEBUG/DEBUG
must be absent, including empty values. Nonempty implicit connection/service variables
MONGO_URI, MONGODB_URI, MONGO_URL, MONGODB_URL, DATABASE_URL, STRIPE_SECRET_KEY,
STRIPE_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_CONFIG and
GOOGLE_APPLICATION_CREDENTIALS are rejected. No .env is read and no fallback is used.

**Identity limitation:** the MongoDB protocol cannot certify Atlas PROJECT_ID or
CLUSTER_NAME. Their association with HOST is an explicit human attestation, to be
verified in Atlas before remote authorization. TLS plus exact host/path selection
binds the connection to that endpoint/namespace; it does not verify dashboard labels.
The output explicitly says human_attestation_not_server_verified. Do not infer
production identity from a successful login or from an arbitrary label supplied
in configuration. Project names are not accepted in place of project IDs.

## Allowed operations and privileges

The caller-facing capability exposes only a fixed-filter listCollections and
listIndexes for usuarios/counters/webhookevents. No raw Db, Collection or client is
exposed through it, and disallowed namespace requests fail before collection access.
The filter is fixed to these three names. Raw schema validators, index names,
partial-filter literals and other unapproved metadata never enter the report.
There are no document, aggregation, write, create, sync or drop calls.

The driver necessarily performs normal DNS/TLS/authentication/topology work;
metadata cursors may use getMore and killCursors. "Only listCollections/listIndexes"
means application-level metadata requests, not a promise that no other protocol
command is sent. The capability is a caller-side restriction, not a substitute for
server authorization or a sandbox against malicious code or modified dependencies.

For remote approval, prefer a dedicated custom role with listCollections on the
approved database and listIndexes on the three approved collections, without find,
writes, index-management or global privileges. A built-in read role is broader.
The inspector does not query connectionStatus or admin to inspect effective grants:
that is outside its strict two-operation scope. Role verification must therefore
occur separately in Atlas. Creating or changing that role/user needs distinct
approval. Never repurpose the integration account or automatically expand access
when metadata permission checks fail.

## Budgets, cleanup and redaction

The driver must be exactly mongodb 7.0.0 before a client is constructed. Configuration
is validated first. One explicit client has maxPoolSize=1, minPoolSize=0,
maxConnecting=1, primary reads, TLS and disabled logging/retries. Selection/connect
and socket limits are 5000 ms; pool wait is 2000 ms. Metadata cursors use timeoutMS
and maxTimeMS of 3000 ms; close uses timeoutMS=2000. Collection metadata is limited
to three records and each index listing to 256. Exceeding a bound is a failure.
No parallel metadata reads or parallel cleanup are used.

These options are locally observed by doubles, not certified server behavior.
SIGINT/SIGTERM stop subsequent admission and wait for pending local operation and
cursor cleanup before client close. A blocked client close remains pending: there
is no Promise.race that claims settlement. The CLI's 45-second watchdog exits 1
with pending_or_unknown cleanup; it is forced termination, not graceful closure or
proof of remote cancellation. Cleanup errors, interruption, rejected configuration,
metadata errors and critical differences produce failed status and nonzero CLI exit.

Output contains fixed collection/index labels, statuses, reason codes, booleans and
counts. No URI, username, password, raw driver error, index name, document or filter
literal is printed. The report distinguishes matching, missing, incompatible and
ambiguous indexes; missing/noncollection namespaces are separate failures. Code 0
means completed comparisons, not production approval, effective least privilege,
performance certification or proof that metadata will remain unchanged afterward.

## Further approval gates (no remote command is authorized here)

1. Review this local inspector, its tests and destination contract.
2. Confirm real Atlas project ID, cluster name, SRV hostname and application database
   independently; review the metadata-only identity/grants and restrictions separately.
3. Authorize one remote metadata inspection explicitly for that destination and those
   three namespaces. Prepare credentials in memory with hidden Terminal input; no
   credential files, .env, shell tracing or credentials in arguments/history.
4. Capture a private redacted report, stderr, execution HEAD and exit code separately;
   review privacy before sharing. Compare findings without automatic correction.
5. Any missing/incompatible index requires a separate analysis and migration approval.
   Checking duplicate documents, performance, other collections or a deployment is
   outside this inspection. No consumed integration namespace may be reused.

Local tests use simulated clients only, plus disconnected model compilation to check
the manifest. They do not run this inspector against MongoDB or certify real metadata,
least-privilege role support on the deployment, network behavior or remote termination.

Preparation verification: **12/12 inspector regressions and 375/375 complete local
tests passed**, none skipped on this workspace. Web TypeScript, JavaScript syntax
and new-file whitespace checks passed. No remote operation was attempted and Git
HEAD remains 41e0706d217becd675574849d53c445796cc2d74 with only these three new files
pending review. Sequential metadata listings are not an atomic snapshot across
collections: coordinate the inspection with any other index-management activity
and do not treat the result as a permanent guarantee. The application pool cap does
not include the driver's monitoring connections.
