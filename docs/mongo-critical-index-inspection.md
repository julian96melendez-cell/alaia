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

## Revised private Terminal procedure (remote execution still requires approval)

Use `scripts/mongo-critical-index-inspection-private.sh` with the inert Node wrapper
`scripts/mongo-critical-index-inspection-private.js`. This supersedes the earlier
procedure that exported a URI or passed it as an `env` argument. No real credential
is embedded in either file. The wrapper fixes the inspection username to
`alaia_index_inspector`, project ID to `6934caf0d4e66132196bd495`, cluster to
`Cluster0` and database to `backendmulti`; the operator supplies the visually
confirmed lowercase hostname and the full explicit confirmation. It calls the
unchanged inspector `main(config)` only in `--inspect` mode. The metadata scope,
command budgets, sequential cleanup and comparison semantics are unchanged.

Run from the repository root, after reviewing these files:

```bash
cd /Users/eduardomelendez/Developer/alaia2/alaia-clean
env -i PATH="$PATH" /bin/bash --noprofile --norc \
  backend-multi/scripts/mongo-critical-index-inspection-private.sh --validate
```

The prompts request the hostname (no URI), confirmation, and hidden password, in
that order. Confirmation must be exactly:
`6934caf0d4e66132196bd495|Cluster0|HOST|backendmulti|usuarios,counters,webhookevents`,
substituting only `HOST` with the confirmed hostname. Do not supply a URI template.
`--validate` imports only the inert inspector and validates the in-memory URI; it
never calls `main`, loads the driver or verifies authentication/network permissions.
No state or credential persists for a later command: the password must be entered
again for an independently authorized inspection.

Only after explicit remote authorization:

```bash
(
  umask 077
  alaia_index_results=$(mktemp -d /private/tmp/alaia-index-result.XXXXXX) || exit 1
  git rev-parse HEAD > "$alaia_index_results/head.txt" || exit 1
  env -i PATH="$PATH" /bin/bash --noprofile --norc \
    backend-multi/scripts/mongo-critical-index-inspection-private.sh --inspect \
    > "$alaia_index_results/resultado.json" 2> "$alaia_index_results/stderr.log"
  alaia_index_code=$?
  printf '%s\n' "$alaia_index_code" > "$alaia_index_results/exit-code.txt"
  printf 'Código de salida: %s\nResultados privados: %s\n' \
    "$alaia_index_code" "$alaia_index_results"
)
```

Input prompts use `/dev/tty`, so output redirection does not put the password in a
result file. Bash `read -s` keeps input hidden; its builtin `printf` writes directly
to an anonymous pipe. The password is an unexported shell variable, never an
external process argument or environment variable. The child receives only PATH
and the five noncredential target/confirmation variables. macOS may inject
`__CF_USER_TEXT_ENCODING`; this noncredential system metadata is also accepted.
All other environment keys are rejected by the Node wrapper. Both Bash startups
are isolated with `env -i`, and no profile, BASH_ENV, NODE_OPTIONS, debug setting,
production credential or dotenv file is inherited by the supplied procedure.
PATH still selects the installed trusted Node executable; this is not a sandbox
against altered executables/dependencies or a compromised workstation.

Node limits input to 4096 bytes, rejects empty/invalid UTF-8/newline/NUL input,
builds the URI only in memory and suppresses arbitrary preparation errors. Signals
prevent subsequent inspector admission and preserve its wait for local cleanup;
no close races pending queries. The wrapper's 45-second watchdog also bounds
credential input and pending cleanup. Forced exit reports failed/unknown cleanup
and never certifies remote cancellation. Invalid mode/preparation fails before
loading a driver. Inspector failures retain their generic report and nonzero exit.
No raw driver exception is forwarded to either output channel.

Residual risk: plaintext necessarily exists temporarily in Bash/Node/driver memory
and anonymous-pipe buffers. Buffer wiping and removing references are best effort;
immutable strings, garbage collection, crash dumps, OS diagnostics or privileged
process inspection may retain/expose copies. Fatal runtime/native failures and
externally injected diagnostics are outside script-level redaction guarantees.
Do not use shell tracing, process-environment dumps or `tee`; review private output
before sharing. No password/URI variable remains exported after this procedure.
The tests use synthetic credentials and driver doubles only, including real child
stdout/stderr capture; they certify neither Atlas authentication nor remote cleanup.

Local verification of this revision: 23/23 focused tests and 386/386 full backend
tests passed (the full suite required local loopback permission outside the default
socket-restricted sandbox). Web TypeScript with incremental output disabled,
JavaScript/Bash syntax and whitespace checks including new files passed. No real
credential, Atlas connection, metadata inspection or production service was used.

## Sanitized diagnostics after the first failed inspection

The original private evidence is unchanged. Its `stage: connect`, empty report and
exit 1 do not distinguish client construction, DNS/TLS/network/authentication or
initial namespace assertion. No remote index defect was demonstrated. New diagnostics
cannot retroactively recover the suppressed cause of that execution.

The inspector now adds `failureCode`, `cleanupFailureCode` and
`connectionEstablished` to its redacted report. The connection flag becomes true
only after `client.connect()` resolves; it does not certify project labels or least
privilege. Failure codes are a fixed allowlist: `configuration_invalid`,
`client_configuration_invalid`, `authentication_failed`, `authorization_denied`,
`dns_failed`, `tls_failed`, `network_failed`, `server_selection_failed`,
`operation_timeout`, `ambiguous` or `unknown`. Classification examines only exact
structured codes/names, bounded `cause`/`reason` chains and topology server errors.
It does not examine or print messages, stacks, endpoints or documents. Cycles are
bounded; oversized/unsupported structures remain unknown. Conflicting concrete
categories are ambiguous. Network/selection wrappers do not override a concrete
nested cause. Cleanup diagnostics are separate; cleanup still runs sequentially.
Error codes describe observed local error metadata, not a verified root cause,
server timeout effectiveness, remote cancellation or a reason to widen privileges.

The installed driver is exactly 7.0.0. A disconnected test constructs the real
MongoClient with the inspector's unchanged options while DNS and socket access are
forbidden; it does not call connect. The driver accepts pool/selection/connect,
CSOT, socket/wait-queue and logging options. Its source marks socketTimeoutMS and
waitQueueTimeoutMS as legacy options favoring timeoutMS; they remain accepted and
have not been removed or enlarged here. Parsing success is not network certification.

Initial setup consists of driver DNS/TLS/topology handshake and SCRAM authentication;
there is no initial listDatabases, connectionStatus, serverStatus or document query.
`authSource=admin` is the authentication namespace, not an administrative grant.
After authentication, the application requests only scoped listCollections and
listIndexes. Cursor getMore/killCursors and client endSessions are driver housekeeping
for the user's own cursors/sessions, not a requirement to grant global session or
index administration. No additional role privilege has been identified as necessary.
An authorization error must be traced to a concrete command under separate review;
never add read/dbAdmin/clusterMonitor as an automatic remedy.

Local tests include synthetic authentication, DNS, TLS, network and configuration
errors through actual child stdout/stderr, along with existing query/cleanup
redaction tests. No real credentials, DNS resolution, MongoDB connection or new
metadata inspection were used. A new connection requires separate authorization.

Diagnostic revision checks: 26/26 focused tests and 389/389 full local backend tests
passed, with web TypeScript, JavaScript/Bash syntax and whitespace checks passing.
The full suite used authorized loopback-only test infrastructure; no remote
inspector execution was performed.

## Bounded structured diagnostics — second local revision

The first and second private execution artifacts remain unchanged. Neither can
retroactively reveal a suppressed cause. This revision adds `substage`, with only
`client_construction`, `client_connect`, `namespace_identity` or null, while
preserving `stage`. Substage clears before metadata reads and survives later failure
cleanup as context; it is not a certificate of which remote component caused an
error. `connectionEstablished` still becomes true only after connect resolves.

`eventDiagnostic`, `exceptionDiagnostic` and `cleanupDiagnostic` are separate
redacted summaries, each containing only a fixed `code`, sorted closed-list
`descriptors`, and `traversalTruncated`. Event summaries merge successive events;
they are not a timestamped event log. Unknown events cannot mask a recognized final
exception. Conflicting recognized event/exception categories yield ambiguous.
Cleanup summaries remain separate so a cleanup error does not rewrite the original
failure; if there was no primary diagnostic, its category supplies failureCode.

Traversal now includes AggregateError.errors as well as cause/error/reason and
server-topology error values, never topology map keys. Limits are depth 8, 32 unique
objects, 32 array/map entries per container and 128 admitted references. Cycles are
skipped. Truncation/access failures are reported and conservatively produce unknown
unless contradictory recognized categories already establish ambiguous. No raw
unknown code/name or original error escapes. Descriptors are exclusively
`native_type_error`, `driver_runtime_error`, `aggregate_error`,
`recognized_error_type`, `unrecognized_error`. No message or stack is consulted.
Network/selection error-type wrappers alone remain fallback evidence; concrete
conflicting structured categories are not arbitrarily prioritized.

These diagnostics are orientative observations of local error structure. They do
not independently prove an authentication, DNS, network or TLS root cause, server
cancellation, effective timeout enforcement, index absence or a need for wider
permissions. Some driver/native failures have no recognized structured cause and
remain unknown. The read-only requests, client count, pool/options, retry settings,
sequential cursor/client cleanup and failure exit codes are unchanged. No new
connection, query, permission check or recovery attempt has been added.

Disconnected regressions exercise locally constructed MongoServerError,
MongoRuntimeError, MongoNetworkError and MongoServerSelectionError, aggregate
causes, cycles, depth/quantity limits, successive events, construction/connect/
identity substages and independent cleanup errors. Actual child stdout/stderr is
captured with synthetic secrets. Driver error construction is not a real MongoDB
connection or evidence about the previous execution.

Second diagnostic revision verification: 30/30 focused tests and 393/393 full local
backend tests passed, with web TypeScript, JavaScript/Bash syntax and whitespace
checks passing. Full-suite HTTP tests used local loopback only. No real credentials,
remote inspector invocation or connectivity test was performed.

## Private trace capture without a commit

`scripts/mongo-critical-index-inspection-trace.js` is a local-only, inert helper.
It has only `--prepare` and `--finish DIR`; it cannot execute an inspector. It reads
an explicit nine-file allowlist: inspector, private Node/Bash wrappers, trace
helper, the three relevant test files, this document and backend package-lock.json.
It stores SHA-256 only, never source contents. It also captures Git HEAD/branch and
porcelain status for these approved files; unrelated pending paths are redacted to
`otherPendingCount`. Thus git-before/after are a sanitized status summary rather
than a full dump of arbitrary filenames. No diff content, environment, URI or
password is captured. Git is called without optional locks or external fsmonitor.

Runtime metadata consists of Node version and resolved executable path, installed
mongodb package version and the SHA-256 of its package.json. No driver/API/model is
imported. These do not certify the entire installed dependency tree or executable
contents. Manifests are endpoint observations, not atomic snapshots of all files;
changes made and reverted between captures are not detectable. Keep files and
dependencies unchanged during execution. The execution's head.txt must not be
presented as proof that the dirty working tree matched that commit.

Prepare creates a fresh /private/tmp/alaia-index-result.* directory mode 0700 and
exclusive mode-0600 output files. Existing captures are not overwritten. Finish
checks private directory ownership/mode and rejects symlinked final source/result
files. It records second hashes/runtime/status and trace-summary.json. Failure or
changed files yields a nonzero trace exit; that exit is separate from the saved
inspector exit code. A forced process/OS exit may prevent after capture; mark the
trace incomplete and never rerun an inspector automatically to repair evidence.
Same-user privileged tampering and intermediate path replacement are not excluded
by these filesystem checks; hashes are evidence, not an immutable code snapshot.

Local-only rehearsal (no password, URI, inspector or connection):

```bash
cd /Users/eduardomelendez/Developer/alaia2/alaia-clean
(
  alaia_node=$(command -v node) || exit 1
  alaia_trace_dir=$(env -i PATH="$PATH" "$alaia_node" \
    backend-multi/scripts/mongo-critical-index-inspection-trace.js --prepare) || exit 1
  env -i PATH="$PATH" "$alaia_node" \
    backend-multi/scripts/mongo-critical-index-inspection-trace.js --finish "$alaia_trace_dir"
  alaia_trace_code=$?
  printf 'Registro privado: %s\n' "$alaia_trace_dir"
  exit "$alaia_trace_code"
)
```

For a future separately authorized inspection, the proposed capture replaces the
previous mktemp/head-only procedure:

```bash
(
  umask 077
  alaia_node=$(command -v node) || exit 1
  alaia_index_results=$(env -i PATH="$PATH" "$alaia_node" \
    backend-multi/scripts/mongo-critical-index-inspection-trace.js --prepare) || exit 1

  # REMOTE STEP: do not execute without separate explicit authorization.
  env -i PATH="$PATH" /bin/bash --noprofile --norc \
    backend-multi/scripts/mongo-critical-index-inspection-private.sh --inspect \
    > "$alaia_index_results/resultado.json" 2> "$alaia_index_results/stderr.log"
  alaia_index_code=$?
  printf '%s\n' "$alaia_index_code" > "$alaia_index_results/exit-code.txt"

  env -i PATH="$PATH" "$alaia_node" \
    backend-multi/scripts/mongo-critical-index-inspection-trace.js --finish "$alaia_index_results" \
    > "$alaia_index_results/trace-finish.log" 2> "$alaia_index_results/trace-stderr.log"
  alaia_trace_code=$?
  printf '%s\n' "$alaia_trace_code" > "$alaia_index_results/trace-exit-code.txt"
  printf 'Código inspector: %s\nCódigo trazabilidad: %s\nResultados privados: %s\n' \
    "$alaia_index_code" "$alaia_trace_code" "$alaia_index_results"
  if [ "$alaia_index_code" -ne 0 ] || [ "$alaia_trace_code" -ne 0 ]; then exit 1; fi
)
```

Neither the local trace nor its tests performs any remote connection. Tests use
synthetic errors/content/environment sentinels, construct before/after records and
capture subprocess stdout/stderr. The only local data writes are private trace
artifacts and temporary test fixtures. Inspect private reports for privacy before
sharing; do not add these operational records to Git.


Trace preparation verification: 5/5 dedicated tests and 35/35 combined inspector,
private-wrapper and trace regressions passed. Web TypeScript, JavaScript syntax
and whitespace checks passed. No inspector invocation or connectivity test was
performed. Synthetic test result directories were removed by their own cleanup.

## Closure of unsuccessful connection diagnostics (2026-10-03)

The following application indexes remain **NOT VERIFIED**; no attempt below reached
index metadata, so neither existence nor incompatibility has been demonstrated:

| Collection | Ordered keys | Required properties | Status |
| --- | --- | --- | --- |
| usuarios | email: 1 | unique: true | NOT VERIFIED |
| usuarios | stripeAccountId: 1 | sparse: true | NOT VERIFIED |
| counters | key: 1 | unique: true | NOT VERIFIED |
| webhookevents | provider: 1, eventId: 1 | unique: true | NOT VERIFIED |

The operator reports confirming the exact Cluster0 SRV hostname, active Atlas IP
allowlisting, SRV resolution to three servers, and successful TCP and certificate-
validated TLS checks for all three nodes (00-00, 00-01, 00-02). Those checks do not
verify MongoDB authentication, primary selection or index metadata.

Four inspector attempts failed during connection:

1. `stage=connect`, exit 1; the initial report had no structured failure code.
2. `stage=connect`, `failureCode=unknown`, `connectionEstablished=false`, exit 1.
3. `stage=connect`, `substage=client_connect`, `failureCode=server_selection_failed`,
   `connectionEstablished=false`, exit 1; diagnostic traversal was not truncated.
4. After locally increasing server selection/connect limits to 15000/10000 ms:
   `stage=connect`, `substage=client_connect`, `failureCode=unknown`,
   `connectionEstablished=false`, exit 1; traversal was not truncated.

The last two captures recorded unchanged before/after manifests and successful
local cleanup, with no cleanup failure code. Reports were empty. The fourth
attempt did not establish a root cause, and longer limits did not establish that
short timeouts caused the earlier failures. Structured descriptors are broad
categories, not original exception names or independently verified causes.

One subsequent operator-run official `mongosh` attempt exited 1 without index
results. Its original error was intentionally suppressed and is unavailable;
its failure stage/cause cannot be inferred from that exit code. This result is
operator-reported rather than a separately inspected full error capture.

**Incorrect password has not been demonstrated.** Authentication, selection and
other client/connection causes must not be asserted as established facts. No
further attempt, credential change, permission expansion or inspector extension is
authorized by this record. A launch remains blocked on independent read-only
verification of these four real indexes. No private result paths, credentials or
raw driver errors are copied into this document.
