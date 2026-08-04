# ADR: Yafs as a composable workspace service

## Persistent virtual workspace

Build Yafs as a persistent, inspectable virtual workspace service. It makes
local, remote, cached, generated, and long-running state look like one
composable filesystem tree.

It is intended as a broadly useful brick for developers, system administrators,
DevOps workflows, lower-level personal knowledge management, and agent/chat
backends. “Broadly useful” means one trustworthy kernel with narrow providers,
not a core that attempts to reproduce Redis, Docker, a chat service, and a
shell at once. A provider may offer an adapter or compatible endpoint where that
is valuable; Yafs itself promises composition, provenance, identity, and
durable state semantics.

Yash is the human-facing client for that tree; a structured RPC API is an equal
client for scripts, services, and agents. Yafs is not a POSIX shell, a
distributed filesystem, a Redis replacement, or a container orchestrator.

```text
Yash / SSH / API / agent
          |
       session API
          |
 VFS kernel: paths, links, unions, mounts, identity, audit
          |
 local store | provider mounts | cache | GitHub | agent runs | runtimes
```

The defining rule is: **capabilities are explicit mounts; their state and
provenance remain inspectable through the tree.**

## Product invariants

1. **One tree, explicit provenance.** A path can be local, linked, unioned, or
   provider-backed; inspection explains which source supplied it.
2. **Composition is kernel behavior.** Links and unions are not plugins. A
   provider uses them; it cannot redefine their semantics.
3. **The shell is a client, not the control plane.** Every shell action should
   have an RPC equivalent with a result, error code, and session state.
4. **No ambient authority.** Browsing cannot clone a repository, start an
   agent, fetch the network, execute a process, or reveal a secret.
5. **Readable state beats opaque state.** Runs, cache entries, refresh status,
   provenance, and errors appear as files or explicit metadata.
6. **Host execution stays conspicuous.** Materializing virtual state for a host
   tool is an explicit, auditable bridge.
7. **Host writes are proposals, never ambient mutations.** A runtime can only
   produce a staged change set against the exact snapshot it received. Import
   requires an explicit commit, scoped paths, a matching base revision, and an
   auditable conflict policy; mismatch rejects by default.
8. **Authority is identity plus scope, not shell access alone.** A privileged
   local operator may be granted broad access, but provider semantics still
   apply: a read-only mirror cannot be mutated by an incidental file write.
   Public endpoints use a distinct, least-privileged service identity.

## Namespace semantics

`yafs` uses one provider-neutral namespace resolver. Local nodes,
provider snapshots, and ordered unions are alternative sources of _logical
nodes_, not separate filesystem implementations. Every pathname operation,
including symlink traversal, re-enters that resolver.

One published snapshot is authoritative for direct reads, links, unions, and provenance.

The resolver is an extension of the synchronous `NodeStore` model, not a
provider callback interface. A provider is never called while resolving,
listing, reading, or following a link. Only explicit, authorized activation or
refresh may perform provider I/O; it builds and validates a detached snapshot,
then atomically publishes that snapshot and its node-level provenance/read-only
metadata. A command therefore observes one committed snapshot, never a mix of
pre- and post-refresh content.

### Terms and resolution

- A **mount** attaches one provider snapshot at an otherwise unoccupied
  namespace path. It never replaces or silently hides a local node. Overlap
  with another mount, a local node, or a union target is an activation error.
  Ancestor directories remain ordinary namespace directories and show mounted
  children during listing.
- A **logical node** has a type, a stable source identity, a read/list
  operation where applicable, a writability decision, and structured
  provenance. It is not necessarily an in-memory `FSNode`.
- A **symlink** stores a path string exactly as written. Resolution follows that
  string relative to the link's parent (or from `/` for an absolute target),
  then asks the namespace resolver again. Links may therefore cross from local
  state into a provider or union, subject to the same 40-link loop limit.
- A **union** is a newly created, read-only logical directory with an ordered
  list of existing logical-directory layer paths. Lookup is left-to-right: the
  first layer containing a name supplies that child. Listing is the stable
  union of names. `inspect` reports the winner and every shadowed candidate.
  A union resolves those paths on every operation; a missing layer contributes
  nothing, and a later mount at the same path joins the union with its current
  provenance. A union itself has no backing provider and does not mutate its
  layers.
- A write, create, delete, or rename through any union path fails. Copy-up,
  tombstones, and merge behavior are a later, separate design; no command may
  infer them.

The present `union NAME LAYER...` builtin is a small syntax for this operation:
`NAME` is the newly created union directory and the remaining arguments are
layers in precedence order. It is **not** a Plan 9 `bind` implementation: it
does not attach a source over an arbitrary existing target, modify a namespace
per process, or adopt Plan 9's union-write behavior. We retain the name only
while this limited ordered-directory composition is useful; a future public
configuration syntax may call the operation `compose` if that is clearer.

### Mount lifecycle commands

`mount` is a control-plane builtin, with equivalent structured RPC operations;
it is not the POSIX host-mount command.

| Command                        | Meaning                                                                                                                                                    | Side effects                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `mount validate MANIFEST [ID]` | Parse strict `.yafsmeta`, select exactly one declaration when `ID` is supplied, validate its provider configuration, and report the proposed mount record. | None: no provider activation, network activity, secret access, or durable state.                                  |
| `mount activate MANIFEST [ID]` | Validate and authorize the declaration, prepare a read-only snapshot if needed, then durably attach that exact snapshot at its declared path.              | A private read cache may be prepared before commit; it becomes visible only after the mount operation is durable. |
| `mount refresh MANIFEST [ID]`  | Prepare and atomically replace one active mount with a new immutable snapshot.                                                                             | Provider I/O is explicit and authorized; the resulting snapshot is durable before its refresh operation commits.  |
| `mount unmount ID`             | Durably detach the active mount.                                                                                                                           | It does not delete a provider's private cache or remote data; cache retention is provider policy.                 |

A mounted provider view is an immutable, byte/file-count-bounded
snapshot. Explicit refresh atomically replaces the active view with a new
revision/freshness record. A declared kernel-owned, daemon-executed interval
may request the same refresh operation; it is durable policy, not ambient
provider activity.
It is persisted with the mount, coalesces overlapping attempts, retains the
last successful snapshot on failure, and audits every attempt. Refresh never
changes local review artifacts; those artifacts must record the source revision
they address.

Fixture snapshots are bounded and embedded in their WAL operations. A future
provider whose snapshots live in a content-addressed store must sync content
before syncing the WAL record that names its digest. Recovery reads only that
durable content; it never refetches a provider or acquires network authority.

## Product horizon and extension hypotheses

Explicit, inspectable composition makes remote and local project state
more useful than either a plain filesystem or a provider-specific UI.

Cache, agent, remote/multi-user, and runtime work are **extension hypotheses**,
not promised deliverables. They remain in this ADR to constrain the kernel and
make its intended seams concrete, but each needs a separate go/no-go decision. No later milestone should expand the delivery commitment by existing
in this document.

## Namespace execution models and long-term direction

Yafs has two deliberately distinct provider shapes:

1. A **collection projection** makes bounded external state inspectable as an
   immutable namespace snapshot. The GitHub PR collection is the first and
   weakest example: it has no provider write authority and no reconciliation.
2. A **reconciled resource** maps durable desired state to observed state and
   history. An eventual machine, agent, cache, or infrastructure controller
   may expose `desired`, `status`, logs, and artifacts beneath one resource
   path, but it may act only after durable authorization and must record its
   outcome.

M5 proves collection projection, provenance, and shared local artifacts. It
does not prove that Yafs should provision infrastructure; it keeps the required
seams—desired versus observed state, explicit authority, idempotent lifecycle
actions, and durable history—available for a later decision gate.

The lineage is Plan 9's useful namespace idea, not Plan 9 compatibility:
composition should make remote and local state feel like one tree. Yafs adds
the constraints modern automation needs: explicit capability grants, durable
provenance, auditable lifecycle actions, and no ambient authority. It does not
promise Plan 9 bind semantics, POSIX semantics, or transparent network mounts.

Providers can have two deliberately separate surfaces. A **view** publishes
bounded, inspectable state beneath a mount. An **action** is a named,
structured request such as `gh comment`, `slack send`, or `agent start`; Yash
may offer concise command syntax, but RPC carries the typed request/result.
Mounting a view never grants action authority. M5 implements a GitHub view and
mount lifecycle actions only; provider actions and remote writes remain later
work with their own intent/outcome protocol.

## Actions and durable traces

Two mechanisms make the view/action split concrete enough to build against.
Neither is committed work; both need their own decision gate, most plausibly
alongside M6/M7, not M5. They are recorded now because M5 usage surfaced the
gap directly rather than by inspection.

### The `ctl` mechanism

**Decision:** a provider action is triggered by a write to a conventionally
named file, `ctl`, inside the resource directory it acts on — not by a new
kernel command-dispatch primitive. The write is never stored as content. The
provider that owns the mount recognizes `ctl` and interprets the written bytes
as a structured action request (JSON, with a schema the provider declares,
validated the same way `.yafsmeta` config already is per provider) scoped to
exactly that resource's path. The kernel's role does not change: resolve the
path, check the mount's capability grants, pass the write through the same
structured write path ordinary content writes already use. The provider's role
is new: recognize `ctl`, validate the action, and perform it using a capability
checked the same way `secret.github-token` is today — most likely a distinct,
per-action capability (e.g. `action.gh-comment`), since "post a comment on a
remote system" is not the same authority as "write inside this mount," which
the existing Writes capability class already covers. An action's result is
never the write's return value; it appears as any other reconciled-resource
change does — new files, an updated `status.json`, visible on the next `ls`
or `cat`.

Two things this decision does not yet resolve: whether a `ctl` action is
synchronous (the write blocks until the provider confirms, e.g. the comment
posted) or staged (the write records intent; something else performs it and
reports outcome asynchronously, mirroring the reconciled-agent pattern). The
"Writes and external side effects" contract above already requires durable
intent, an idempotency key, and a durable outcome for any remote mutation —
`ctl` is the first concrete mechanism that contract needs to apply to, not a
new invariant.

### Pseudobinaries are a Yash convenience, not a kernel feature

A command like `gh comment "text"` is client-side sugar over a `ctl` write,
exactly as `edit` is client-side sugar over the structured write RPC today.
Yash resolves the target resource, constructs the `ctl` write, and sends it
through the existing write path. The kernel never learns "gh" exists as a
concept, and a new pseudobinary is addable entirely in Yash with zero server
changes, provided the target provider already implements a `ctl` handler for
that verb. This keeps invariant 3 intact: the shell stays a client, not a
second control plane.

### A cheap experiment before the M7 decision gate

`model.invoke` is already a named capability class; nothing above requires
inventing a new one to try it. Two shapes of "invoke a local model" differ
enormously in cost, and conflating them would misprice the experiment worth
running before M7's actual decision gate:

- **One-shot invocation**: a `ctl` write on some resource sends a prompt to a
  configured local endpoint (LM Studio, say) and durably records the text that
  comes back — no loop, no multi-step run, no transcript beyond the one
  exchange. This is small: structurally the same HTTP-client shape
  `GitHubApiClient` already is, triggered by the same `ctl` mechanism above.
  It's cheap enough to just build and try against a real model, and it alone
  would show whether an autonomous "here's what changed, does it matter" pass
  ever produces something worth reading.
- **Recursive tool use**: the model calling `yafs_read`/`yafs_list`/write
  _itself_, mid-generation, deciding what to look at next, in a loop that
  continues until it's done. This needs an orchestrator — send the prompt and
  tool schemas, execute whatever the model requests against the live
  instance, feed results back, repeat, then record the full transcript. That
  orchestrator is not incidentally similar to M7's checkpoint ("durable runs,
  scoped context/capabilities, artifacts, restart behavior, audit trail") — it
  _is_ M7's checkpoint, with a concrete reason to build it instead of a
  hypothesis.

Try the first before committing to the second. It answers a real question
(is an autonomous pass ever useful) for a small fraction of the cost of
answering it by building the full agent workspace first.

### Agent personas and the ctl execution model

**Decision:** a persona is a standing, named directory —
`/agents/<name>/prompt.md` — not an anonymous `model.invoke` action. Each
persona gets its own capability grant and its own durable run history under
`runs/<run-id>/`, the same shape the agent workspace sketch above already
uses (`status.json`, `transcript.ndjson`). The one-shot experiment above
becomes concrete this way: write a prompt to `/agents/<name>/ctl`, get back a
recorded, inspectable run.

Persona directories are not fetched content, unlike every provider mount so
far — `prompt.md` is written directly into the VFS by whoever configures the
persona, not published by a provider fetching from an external source. So
`ctl` cannot stay coupled to "the provider that owns this fetched mount," as
originally scoped; it needs to be a directory-scoped handler convention any
registered handler can claim, whether or not the directory sits under a
fetch-based provider mount. GitHub's `ctl` handler and a persona's `ctl`
handler are the same mechanism serving structurally different directories,
which is a stronger validation of the mechanism than a second fetch-based
provider would have been.

**Decision:** nothing fires without an explicit trigger the user wrote
themselves. A persona is inert by default — a `ctl` write is the only way to
invoke it in v1. Cron-style autonomous firing is deferred, and if built later
must require the same explicit, visible opt-in mount `refresh: {interval}`
already does; a `prompt.md` file existing must never by itself be sufficient
to make something run. This keeps "no ambient authority" intact for what
would otherwise be the system's first autonomous, unprompted behavior.

**Deferred to M7, not scoped down:** "spaces" — multiple personas taking
turns, reading each other's output, invoking MCP tools mid-generation — is
not a smaller version of one-shot invocation. It is the "recursive tool use"
case above, already named as M7's actual checkpoint: an orchestrator, scoped
per-agent capabilities, restart behavior, and an audit trail across multiple
autonomous actors. Build the one-shot case first; let real usage of it — not
the appeal of the idea — decide whether spaces is worth M7's cost.

### Background execution, not a worker thread

A model call is slow enough (seconds to tens of seconds, not the sub-second
shape mount refresh assumed) that the concurrency defect just found and fixed
in the refresh path would be far worse here: `YafsServer` runs every client
command and every scheduled refresh through one serialized queue
(`this.queue: Promise<void>`), so a single in-flight call would stall every
other session for its entire duration, not only on failure.

**Decision:** because LM Studio and any realistic first target are reached
over HTTP, the actual work is I/O-bound, not CPU-bound — async `fetch` does
not block the event loop regardless of thread count, in the same way
`GitHubApiClient` never needed one. No worker thread or subprocess is needed
for this. What changes is not routing the wait itself through the shared
queue at all: a `ctl` write commits a fast, durable "run started" record
through the ordinary queue, the actual call runs unserialized against
nothing but its own state, and only the result — or periodic checkpoints, see
below — gets committed back through the queue. Every use of the shared queue
stays fast and bounded; the wait itself never does. A worker thread only
becomes relevant if inference ever runs in-process (an embedded model rather
than a call to an already-separate server); that is not the current plan and
should not be designed for yet.

### Streaming is genuinely unresolved — prove it cheaply first

Whether a durable file can meaningfully "stream" is an open question this
system hasn't faced. Committing every chunk through the WAL is safe but could
mean dozens of journal writes per second for token-level streaming; buffering
everything and committing once at the end is simple but isn't streaming at
all — `cat` during a long response would just hang until it finishes. The
likely middle ground is periodic checkpointed commits (buffer chunks, flush a
durable update on an interval or byte threshold, whichever comes first), but
the right cadence, and whether a `cat` mid-stream should see partial content
or block until the next checkpoint, are not yet decided.

**Decision:** answer this with a dummy stream fixture before wiring any real
model. Extend `FixtureConfig` with an optional slow-feed mode — content for a
given path arrives in configured chunks on a timer rather than all at once —
and drive `ctl` and the background-execution/checkpoint mechanics above
against it. This proves the mechanism (non-blocking execution, checkpoint
cadence, partial-read semantics) with no network dependency, no model server
to run, and a fully deterministic test. Wire in a real LM Studio endpoint
only once this experiment settles what a durable, watchable stream should
actually look like.

### Trace capture and reification

**Decision:** M6 replaces `review bind SOURCE ARTIFACT_DIRECTORY` with two
top-level, symmetric commands that name what actually happens — `trace SOURCE
ARTIFACT_DIRECTORY` captures a **trace** of a provider-backed artifact at a
moment in time; `reify ARTIFACT_DIRECTORY DESTINATION` reconstructs the
artifact it records. Neither is a `mount`-style namespace with subcommands:
trace and reify are peers (capture / reconstruct), not one operation's variant
of the other. `abstract`/`reify` was considered and rejected specifically for
`abstract` as a bare verb — read in isolation, without the pairing already in
mind, it's ambiguous between "extract a reference to" and "make generic,"
which a command name shouldn't require context to parse. `snapshot` was
rejected for either half on collision grounds: that word already names a
distinct concept (VFS/WAL snapshots) elsewhere in this system, and reusing it
here would blur two things that need to stay separate. The mechanism
generalizes to any provider-backed source; nothing about it is review-specific.

The M5 source binding recorded only a collection-level revision digest (a hash
of the entire fetched query result, not the individual resource). M6 replaces
that unresolvable pointer with durable captured content and two facts a pointer
alone cannot provide:

- **Independent verification**: the trace should record the provider's own
  immutable reference for that specific resource where one exists — a PR's
  head SHA, not a digest of the whole collection it was fetched alongside.
  That reference stays checkable against the real external source indefinitely,
  independent of what this Yafs instance's local mount does later.
- **Reification**: given only a trace — not the live mount, which may have
  refreshed, narrowed its query, or been unmounted — recover the actual
  content the trace refers to. This needs a durable, content-addressed local
  store (fetched entries hashed and written once to something like
  `.yafs/blobs/<digest>`, deduplicated by content) that a trace's digest can be
  resolved against, independent of the current published snapshot. A `reify
TRACE` operation checks that store first; if the entry has been reclaimed,
  and the provider supports point lookup by immutable reference, it may
  attempt a scoped, capability-checked re-fetch pinned to that exact
  reference; otherwise it fails cleanly, naming the reference it could not
  resolve, rather than silently returning current-not-historical content.

This store is not new scope invented for traces alone: it is also most of
what the cache provider (M6.1) needs — a durable, digest-addressed local store
with a retention policy. Building it once, driven by the trace/reification
need, is preferable to solving durability three separate times: this is the
same gap behind the orphaned-notes case already named in the M5 demo
(`trace.json` remaining reifiable after its PR leaves the query window) and
the WAL-determinism requirement already stated above ("a future provider whose
snapshots live in a content-addressed store must sync content before syncing
the WAL record that names its digest").

Retention/GC for that store must reference-count against durable traces, not
only active mounts — a blob a trace still points to must not be reclaimed
merely because no mount currently references it, or reification silently
degrades into the same unresolvable-pointer problem this decision exists to
fix.

**Implemented M6 foundation:** local content-addressed blobs, `trace`, local
`reify`, recovery-time retention reconstruction, explicit serialized `blobs
gc`, and an injectable, reference-only provider reifier hook. GitHub traces
record a PR `{ repository, number, headSha }`; a daemon defaults to a GitHub
point-reifier (`GitHubTraceReifier`) that re-fetches the pinned pull by number
and reconstructs the missing entry, verified against the recorded digest
before it's trusted — so a missing GitHub blob is recoverable without an
operator installing anything, as long as the pull itself is still reachable.
It remains overridable via `StartOptions.traceReifier` for other providers or
tests.

#### Trace artifact contract

**Decision:** `trace SOURCE ARTIFACT_DIRECTORY` writes a durable
`ARTIFACT_DIRECTORY/trace.json`; `reify ARTIFACT_DIRECTORY DESTINATION`
materializes the captured tree only at the explicit destination. `reify` never
replaces the trace directory, never mutates a provider mount, and fails if the
destination already exists. This makes reconstruction a visible local mutation,
not an implicit remount or a substitution of current provider state.

`trace.json` is a versioned UTF-8 manifest. Its minimum v1 shape is:

```json
{
  "kind": "yafs-trace",
  "version": 1,
  "sourcePath": "/reviews/pulls/42",
  "capturedAt": "…",
  "origin": {
    "kind": "provider",
    "mountId": "review",
    "provider": "github",
    "revision": "…"
  },
  "resourceReference": {
    "kind": "github-pr",
    "repository": "acme/widget",
    "number": 42,
    "headSha": "…"
  },
  "capturedAt": "…",
  "entries": [
    { "path": "diff.patch", "digest": "0123abcd...64-lowercase-hex-characters" }
  ]
}
```

Each `entries` path is relative, normalized, and names one blob containing the
exact captured UTF-8 file bytes. The collection revision/fetch time is context,
not a substitute for the per-resource immutable reference. A v1 `reify`
resolves every entry from local blobs first. A daemon-installed provider
reifier is an explicit miss path: it receives only the trace and recorded
`resourceReference`; Yafs verifies its digest and writes recovered bytes to the
blob store before materializing anything. It otherwise reports an unresolved
trace. It never reads the current
collection path as fallback.

```ts
type BlobStore = {
  put(bytes: Uint8Array): Promise<string>; // returns a digest
  get(digest: string): Promise<Uint8Array | undefined>;
  retain(digest: string, ownerId: string): void;
  release(digest: string, ownerId: string): void;
  gc(): Promise<{ reclaimed: string[] }>;
};
```

- **Content addressing and layout.** A digest is `sha256(bytes)` hex-encoded,
  the same primitive `Journal`/`MountPersistence` already use for checksums.
  Blobs live at `.yafs/blobs/<digest[0:2]>/<digest>`, sharded by the first two
  hex characters — git's own `.git/objects` layout, adopted now rather than
  after a large flat directory forces a migration later.
- **The store holds bytes only, nothing else.** No TTL, no owner list, no
  metadata envelope. Those belong to whichever caller is using the store — a
  future trace file, a future cache entry — as their own durable record
  referencing a digest. The store does not know or care what a blob means.
- **Durability** follows the pattern `MountPersistence`'s `writeSynced`
  already establishes: write to a uniquely-named temporary file, `fsync`,
  rename into place, `fsync` the containing shard directory. `put` for
  already-present content is a no-op after an existence check — no rewrite,
  no re-sync.
- **Concurrent `put` of identical content is safe by construction, not by
  locking.** Two writers racing to store the same bytes write to two
  different temp files and both rename to the same final path; because the
  path is derived from the content, whichever rename wins is byte-identical
  to the one it clobbers. No coordination needed.
- **`get`/`retain`/`release` must reject a malformed digest** (wrong length,
  non-hex characters) before it ever reaches path construction — the same
  discipline `Manifest.ts`'s `relative()` and `SnapshotMaterializer`'s
  fixture-path check already apply to caller-supplied strings that become
  file paths.
- **The dangerous lifecycle case, stated explicitly so it can be tested
  against:** `retain`/`release` are in-memory only and start empty on every
  construction. If `gc()` is ever called before every owner has replayed its
  own durable state and re-issued `retain()` for what it still references,
  every blob on disk looks unreferenced and `gc()` will delete all of them.
  The store does not enforce this ordering itself — it has no way to know
  when replay is "done" — so the contract is a caller obligation: finish
  every owner's replay-time `retain()` calls before the first `gc()` after
  construction, not a property the store can check for you.
- **`gc()` must run as an ordinary serialized command**, through the same
  queue as every other mutation, never a free-running timer — a background
  GC racing an in-flight activation that's about to reference the exact
  digest being reclaimed is a real, not hypothetical, failure mode.
- **Reference counts are not their own persisted ledger.** Deriving them by
  replaying the journal and scanning durable owner records at startup keeps
  the WAL as the single source of truth, the same way `MountManager`'s
  in-memory records are already reconstructed by replay rather than trusted
  from a separate durable counter. A second persisted ref-count is one more
  thing that can drift from reality; a replay-derived one cannot, at the cost
  of a startup scan.

### Historical views and federation

Historical inspection is a valuable future product feature, but current WAL
compaction deliberately preserves recoverability, not history: it retains the
latest snapshot and discards compacted journal records. `inspect --revision` or
`yash --at` therefore needs retained checkpoints/event segments, retention and
redaction policy, and references to the exact provider snapshots that supplied
external content. It is a distinct time-travel design increment, not a free
consequence of the current journal.

Mounting one Yafs instance from another is explicitly deferred. Federation
requires authenticated service identities, delegated grants, loop prevention,
cross-instance revision semantics, failure policy, and audit correlation. It
belongs no earlier than the remote/multi-user decision gate.

## Primary use cases

### Review workspace — first product wedge

This proves read-only providers, composition, caching, provenance, and
human/agent collaboration without unrestricted execution.

```text
/reviews/acme/widget/
  source/            # read-only, explicit GitHub collection snapshot
    pulls/482/        # metadata, changed files, diff, revision/freshness
  notes/482/          # durable local review artifacts for that source revision
```

```sh
yash:/reviews/acme/widget$ cat source/pulls/482/metadata.json
yash:/reviews/acme/widget$ echo "check token expiry" > notes/482/alice.md
yash:/reviews/acme/widget$ inspect source/pulls/482/diff.patch
```

The first GitHub provider is deliberately narrow: a repository plus query
produces a read-only collection snapshot. A PR number is a child of that
collection, never a mount declaration. The review workspace can use an
explicit ordered union when composition is genuinely useful; it is not needed
merely to place source and notes next to one another.

### Cache-like service — valuable, but not a Redis clone

Yafs can expose durable, inspectable cache entries for cached API results,
generated artifacts, model outputs, or build intermediates.

```text
/cache/http/
  values/github:openai:yafs:pr:482.json
  metadata/github:openai:yafs:pr:482.json
```

```sh
yash:/cache/http$ cache put --ttl 5m github:openai:yafs:pr:482.json < payload.json
yash:/cache/http$ cat metadata/github:openai:yafs:pr:482.json
# {"createdAt":"…","expiresAt":"…","source":"github",…}
```

The cache provider must define TTL, eviction, atomic replacement, size limits,
and concurrent-write semantics. It should not claim Redis compatibility unless
it deliberately supports its atomic operations, pub/sub, transactions, and
wire protocol. The initial promise is a durable observable cache with a
filesystem projection.

The first cache is durable local state only. It may be populated explicitly by
its caller, but it does not fetch or refresh declared upstreams; that is a
mirror/provider concern and should not be smuggled into cache semantics.

Any later public cache endpoint is an adapter with its own narrow service
identity, path/capability scope, quotas, and audit trail. Providers may declare
such endpoints, but the kernel—not provider code alone—enforces identity,
mount scope, and resource limits.

### Agent workspace — later, after authority and durability

```text
/work/bug-184/
  prompt.md
  context/
  runs/<run-id>/status.json
  runs/<run-id>/transcript.ndjson
  output/
```

An agent provider owns only its declared workspace and capabilities. It records
inputs, run state, output, and failures as visible files.

### Machine/image workspace — later still

An image/runtime provider may materialize an explicit volume snapshot and
publish logs/status under `run/`. It must not default to an unrestricted host
bind mount or Docker daemon capability.

## Yash and scripting contract

Yash should feel excellent interactively, but it should not imitate every
historical shell behavior.

| Need                     | Contract                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Interactive use          | Prompt templates, local persisted history, up/down, Ctrl-R, and virtual-path completion belong in Yash.                           |
| Automation               | Versioned RPC returns typed output/error/session information; terminal text is not the API.                                       |
| Familiar commands        | Start with `pwd`, `cd`, `ls`, `cat`, `mkdir`, `echo`, links, inspection, and explicit mount commands.                             |
| Small language           | Add quoting, variables, arithmetic expansion, command substitution, redirection, pipes, and exit status in documented increments. |
| Explicit incompatibility | No POSIX-script promise, job control, signals/traps, aliases, globbing, or ambient host executable lookup.                        |

`PROMPT` is a client template over server-provided state, for example
`{user}@{server}:{cwd} [{revision}]$`. The server reports state; it does not
send terminal control sequences.

An interactive `yash` first attempts its configured loopback endpoint. If it
is unavailable, Yash offers to run `yafsd start`; it never silently switches to
an ephemeral filesystem. Non-interactive `yash -c` fails with the exact start
command instead, so scripts cannot accidentally create a daemon. `yash --local`
is explicit and intentionally ephemeral: useful for parser/VFS development,
not a fallback for durable work.

### Command architecture and roster

Built-ins should not accumulate in one interpreter switch statement. Each is a
logical command object registered in a command registry:

```ts
interface BuiltinCommand {
  readonly name: string;
  readonly synopsis: string;
  execute(context: CommandContext, args: string[]): string;
}
```

`CommandContext` supplies the session, VFS, clock, and eventually typed input/
output streams. Concrete command classes implement that small interface and
share narrowly scoped helpers where useful; the command registry remains the
single source of truth for `help`. This keeps client-only actions (`history`,
terminal editing) out of the server registry. Command instances are
context-free; the interpreter supplies context only at invocation time.

Adopt familiar commands only when their Yafs meaning is documented:

| Tier                      | Commands                                                                                             | Rule                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Core VFS                  | `pwd`, `cd`, `ls`, `cat`, `mkdir`, `ln`, `stat`, `lstat`, `readlink`, `origins`, `mounts`, `inspect` | Operate through the VFS and preserve mount/provider semantics.                                                                    |
| Safe session              | `help`, `version`, `whoami`, `true`, `false`, `date`                                                 | Need no host-process access. `date` uses an injected server clock and an explicit stable format.                                  |
| Metadata-aware            | `touch`                                                                                              | Add only with node timestamps and a defined create/update policy; never pretend an empty-file shortcut has POSIX touch semantics. |
| Stream-oriented           | `printf`, `head`, `tail`, `wc`, `grep`, `sort`                                                       | Add after typed stdin/stdout streams and pipe behavior are settled.                                                               |
| Transactional/destructive | `rm`, `mv`, `cp`, `chmod`                                                                            | Add only with provider write/delete, rollback, and audit semantics.                                                               |
| Process-oriented          | `time`, `ps`, `kill`, jobs                                                                           | Defer until Yafs deliberately owns process execution. `time` is not meaningful while commands are not yet composable processes.   |

This is compatibility by clear semantics, not a promise of a growing POSIX
clone. A separate `now`/RPC field may be preferable to text `date` for
automation; `date` exists primarily for interactive and script convenience.

## Provider boundary

**Status:** M4/M4.5 implement the zero-capability, read-only fixture slice:
strict manifest validation; explicit validate, activate, refresh, and unmount
lifecycle; durable mount state; structured provenance; append-only lifecycle
audit; and one published snapshot resolver. Provider writes, non-empty grants,
scheduled refresh, and external providers remain M5 work.

The VFS journal authoritatively orders mount/unmount intent. `mounts.json` is a
durably-synced materialized index required to restore mount policy after journal
compaction; it is rebuilt or corrected by journal replay. `audit.ndjson` is a
durably-synced append-only ledger, but it is not yet atomically committed in the
same durable envelope as a lifecycle operation. M5 must add durable lifecycle
event IDs and replay reconciliation before a provider can use a capability or
perform an external side effect.

The complete provider model introduces this lifecycle, not arbitrary executable
directories:

```text
declared → validated → authorized → activating → active → refreshing | failed → unmounted
```

Discovery only finds `.yafsmeta`; it must not load code, contact a provider, or
create a mount. Validation parses a strict declarative manifest. Authorization
compares each requested capability with daemon-held grants. Only then may the
kernel create an `activating` mount and call its provider. The full model audits
every transition and makes it visible through `mounts`/`inspect`, including a
failed activation. The M4 fixture implements only its active/unmounted subset.

The provider receives a mount-relative path only. It cannot resolve arbitrary
VFS paths, follow links outside its mount, pick union precedence, or write the
kernel journal. The kernel resolves paths, links, unions, identity, mount
boundaries, authorization, revision assignment, and audit events.

```ts
type ProviderMode = "read-only" | "authoritative" | "staged";

interface Provider {
  describe(): { mode: ProviderMode; capabilities: string[] };
  stat(
    path: RelativePath,
    options: { followLinks: boolean },
  ): Promise<Node | undefined>;
  list(path: RelativePath): AsyncIterable<DirEntry>;
  read(path: RelativePath): AsyncIterable<Uint8Array>;
  refresh?(): Promise<{ revision: string }>;
  write?(change: StagedChange): Promise<{ revision: string }>;
}
```

M4 implements only `read-only` through a deterministic fixture provider. Its
grant policy is intentionally deny-by-default: an empty requested capability
list activates; any non-empty request is rejected before activation
until daemon-held grant policy is implemented.
`authoritative` means a provider's successful write is immediately its own
source of truth; `staged` means it returns a proposal that requires a later,
explicit commit. Neither mode is implied by merely implementing `write`.

### Manifest schema

`.yafsmeta` is strict YAML, decoded without custom tags or aliases, then
validated against a versioned schema. Unknown fields are errors, not extension
points. A manifest requests privileges; it does not grant them.

```yaml
version: 1
mounts:
  - id: review-repo
    path: repo
    provider: fixture
    config:
      fixture: review-repo
    capabilities: []
```

Required mount fields are `id`, `path`, `provider`, `config`, and
`capabilities`. `id` is stable within the containing workspace; `path` is a
clean relative path and cannot overlap another active mount; `provider` is a
registered provider name, never a package URL or command; `config` is checked
by that provider's declared JSON-schema-like validator; capabilities are named
strings from a kernel-owned taxonomy. The daemon records a canonical manifest
digest and the granted subset alongside the active mount. Comments stay useful
to operators but never affect the digest.

### Provenance and audit

`origins PATH` must eventually report a structured origin for every candidate,
not only a rendered path: local node or mount ID, provider name, provider
revision, fetched/refreshed time, and union precedence. `inspect PATH` reports
the winner plus shadowed candidates. Provider values may be cached, but their
last known revision and freshness are never hidden.

Audit is append-only, sequenced, and separate from human-readable provider
files. The full provider model's minimum event envelope is:

```text
sequence, at, actor, mountId, provider, action, relativePath,
capabilitiesUsed, outcome, beforeRevision, afterRevision, correlationId
```

Actions include declaration validation, grant/deny, activation, read, refresh,
write proposal, write commit, failure, and unmount. Never place secret values,
tokens, prompt contents, or file payloads in the generic audit log; record
content digests or provider-specific redacted references when needed.

The fixture currently emits activation, refresh, and unmount events with this envelope:
the mount-relative path is empty for those mount-level events, and revision
fields describe the fixture revision before or after the transition. Validation,
denials, reads, and provider I/O acquire audit events with the relevant future
provider and authorization work.

The mount record and audit stream are kernel data: a provider may contribute
facts, but it cannot erase, forge, or silently omit its own capability use.

### Scheduled refresh policy

**Decision:** `refresh.interval` is durable mount policy, not a provider-owned
timer. **Status: implemented.** The daemon computes a mount's next attempt from
its last successful `fetchedAt` (or activation time), permits one in-flight
refresh per mount, and retains the published snapshot when preparation fails. A
failed attempt is audited but does not advance freshness or postpone the next
eligible attempt. Recovery restores the durable snapshot and policy only; it
never contacts a provider while replaying the WAL. The scheduler submits the
same prepared snapshot through the normal WAL-then-publication path as `mount
refresh` — there is no separate refresh mechanism for the daemon-scheduled
case.

## Valuable increments

| Milestone                                           | Product proof                                                    | Acceptance checkpoint                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — composable VFS                                 | A tree can represent composed state predictably.                 | Canonical paths, links with loop handling, read-only ordered unions, origins, and explicit errors. **Complete.**                                                                                                                                                                                                                                     |
| M1 — command/session contract                       | Yash and RPC describe the same safe operation.                   | Typed result (`stdout`, `stderr`, status, structured error, session state); `help`, `version`, `whoami`, `mounts`, and `inspect`; documented built-ins and deterministic error codes.                                                                                                                                                                |
| M2 — usable Yash                                    | A human can comfortably explore a persistent workspace.          | Prompt templates, persisted local history, up/down, Ctrl-R, basic final-token path completion, `yash -c`, and JSON result output. **Baseline complete; polish remains.**                                                                                                                                                                             |
| M3 — durable local service                          | Work survives restart and recovery is principled.                | Versioned bounded loopback protocol; checksummed, sync-before-apply VFS operations; torn-final-record recovery; corruption refusal; snapshots/compaction; exclusive data-dir lock; `yash --local`; and managed `yafsd serve/start/stop/restart/status` lifecycle. **Complete for the single-tenant local appliance.**                                |
| M4 — mount/provider contract                        | External state enters without special cases.                     | Strict schema-validated YAML mounts, explicit validate/activate/unmount lifecycle, durable zero-capability fixture mount, structured provenance, and activation audit. **Read-only fixture slice complete.**                                                                                                                                         |
| M4.5 — published snapshots                          | Composed paths cannot observe divergent provider copies.         | One synchronous resolver over atomically published snapshots; node-level provenance/read-only metadata; explicit refresh; and recovery/unmount/link/union consistency tests.                                                                                                                                                                         |
| M5 — review workspace                               | The product helps with a real task.                              | Bounded GitHub query collection, explicit/interval refresh, source revision/freshness, and local review artifacts bound to their source revision. **Mechanically complete and exercised against a real GitHub Enterprise Cloud repository; product-value evidence (repeated real use, not a single session) is still open — see "Extension gates."** |
| M6 — durable artifacts and traces _(decision gate)_ | External work remains inspectable after the source view changes. | Durable content-addressed blobs, provider-neutral `trace`, local-only `reify`, replay-derived retention, and explicit serialized GC.                                                                                                                                                                                                                 |
| M6.1 — cache provider _(decision gate)_             | Yafs is useful as an observable state service.                   | Durable local TTL cache, atomic replacement, expiry metadata, eviction/limit policy, concurrent-write tests.                                                                                                                                                                                                                                         |
| M7 — agent workspace _(decision gate)_              | An agent can work visibly and safely.                            | Durable runs, scoped context/capabilities, artifacts, restart behavior, audit trail.                                                                                                                                                                                                                                                                 |
| M8 — remote/multi-user _(decision gate)_            | The service works safely beyond localhost.                       | Authenticated transport, per-user authorization, quotas, remote Yash/SSH adapter, audit retention.                                                                                                                                                                                                                                                   |
| M9 — runtime bridge _(decision gate)_               | Workspaces intentionally drive external processes.               | Allowlisted execution against materialized snapshots; staged imports with base-revision conflict checks and explicit commit.                                                                                                                                                                                                                         |

Each increment is useful on its own and proves a product property needed by the
next one.

### M1 command policy

M1 establishes semantic coherence, not broad Unix compatibility. The initial
documented command surface is:

```text
help  version  whoami  true  false  date  pwd  cd  ls  cat
stat  lstat  readlink  origins  mounts  inspect
mkdir  touch  rm  ln  union  printf  echo
```

`printf` is the exact scripting/output primitive and works with redirection.
`echo` is a human convenience; its behavior must be documented rather than
assumed to match every host shell. `touch` and non-recursive `rm` currently
operate only on the durable local store and produce journal mutations. They do
not promise provider-backed deletion or POSIX compatibility. `mv`, `cp`,
recursive deletion, and broad search remain deferred until provider write/delete
and transaction semantics are designed.

## Consequences and deferred decisions

- Build terminal ergonomics before claiming Yash is compelling.
- Build Git/GitHub before agents: it tests the provider contract with lower
  authority and clearer state.
- M5 is the primary product decision gate — see "Product horizon and
  extension hypotheses" above and "Extension gates" below for what that
  means and what would earn a specific extension.
- Defer writeable union copy-up: it needs an upper layer, tombstones, conflict
  behavior, and transactions.
- Defer FTP and Telnet. SSH is the likely remote terminal adapter; RPC remains
  the automation transport.
- Defer multi-user ACLs until the per-user service model is designed, while
  provider capabilities are explicit from the beginning.

## Provider and adapter contract decisions

These decisions are required before a real external provider or adapter. The
fixture proves mount mechanics, not these broader contracts.

### Paths and file data

- **Path names:** kernel paths are Unicode scalar-value strings normalized to
  NFC at every kernel/provider boundary. A component cannot contain NUL or
  `/`. Providers encode names as UTF-8 unless their upstream has a documented
  adapter rule. This prevents visually identical names from becoming different
  paths across clients. The current string-based implementation must add this
  canonicalization before an external provider is accepted.
- **File data:** the VFS/provider data plane is bytes. Yash is initially a
  UTF-8 text client: `cat`, `echo`, redirection, and command output work on
  text, while later binary APIs carry arbitrary bytes. This prevents images,
  archives, patches, and model artifacts from being silently corrupted by a
  string-only interface.
- **Limits and flow control:** no streaming shell pipeline is promised yet.
  Before streaming reads are exposed, the daemon must set an inline response
  limit and use pull-based byte streams so a slow client cannot cause an
  unbounded provider read or memory buffer. This is both a large-file rule and
  a cancellation/resource-control rule.

### Writes and external side effects

- **Local write v1:** each user-visible local file write is a whole-file,
  atomic replacement represented by one durable VFS operation. There is no
  streaming write or multi-operation transaction promise.
- **Read-only provider fetch:** a provider may fetch or prepare a private cache
  before a mount record is committed. If the WAL commit fails, it exposes no
  mount; the cache may be discarded or reused on retry.
- **External provider write:** a remote mutation must use a durable intent,
  an idempotency key, provider execution, and a durable outcome record. WAL
  alone cannot atomically commit a GitHub/API mutation and a local journal.
  M5 is read-only specifically to avoid claiming this protocol early.

```text
read-only: fetch/prepare → durable mount record → expose
remote write: durable intent → idempotent provider call → durable outcome → expose
```

### Revisions, freshness, and commands

- **Content revision:** every provider-backed origin names the source content
  version, such as a Git commit SHA, PR head SHA/ETag, cache generation, or
  model/context snapshot digest. It is not the provider package version.
- **Freshness:** `inspect` must eventually report the content revision plus
  fetched/refreshed time and applicable expiry/staleness state. Provider build
  provenance is separate metadata.
- **Control plane:** provider commands and RPC use structured request/results;
  file reads/writes use bytes. Yash adapts simple UTF-8 commands to that model.
  The current string-only fixture is deliberately not a final provider API.

### Capabilities, distribution, and adapters

- **Capabilities:** grants are kernel-owned, deny-by-default, and audited.
  The initial vocabulary is a narrowly configured model endpoint
  (`model.invoke`), named network destinations, and named secret references.
  Writes remain mount-relative; "write outside this mount" is not a grant.
  Host execution stays the separate, allowlisted M9 bridge.
- **Provider distribution:** M0–M5 use built-in trusted providers while the
  ABI changes. Later, `yash add @org/provider` may use GitHub as a registry,
  but must resolve an immutable revision, record it in a lockfile, inspect a
  declarative manifest without executing code, and require explicit enablement
  and grants. Discovery is never installation or execution.
- **MCP:** `yafs-mcp` is an adapter executable and a client of `yafsd`, not a
  mount provider. Its first local-only surface is narrow read/introspection
  tools; unrestricted shell execution and public access wait for identity and
  authorization design.
- **FUSE:** FUSE is a possible local, read-only adapter after provider read
  semantics stabilize. It is not an M5 prerequisite, a POSIX-conformance
  promise, or a bypass for mount capabilities/provider write policy.
- **Wire-protocol gateways are adapters, and a different thing from Yash
  commands with similar-sounding semantics.** A Yash command like `cache put
--ttl` only ever serves yash/RPC clients — it is not compatibility with
  anything. A gateway that speaks an existing wire protocol (Redis's RESP; a
  bounded S3 REST subset) lets an _unmodified_ existing client talk to Yafs
  without knowing it exists, which is the actual value in "Redis/S3
  compatibility" and is not delivered by the commands alone. Both are
  legitimate, but naming a mount "Redis-compatible" should mean the gateway,
  not a handful of verbs that merely resemble one. See "Near-term provider
  and surface candidates" in the roadmap for scope and sequencing.
- **A query provider (e.g. over CSV tables) is a collection projection, not a
  step toward simulating an RDBMS.** Filtering is a `ctl`-triggered structured
  request against a small predicate set; it is not a SQL grammar or a query
  planner. This boundary is deliberate and should hold as such a provider
  grows — a real embedded query/RDBMS capability is a different project by an
  order of magnitude and needs its own decision gate if it's ever pursued.
- **Materializing a resolved tree for a container is the M9 mechanism, not a
  new one.** The same operation `SnapshotMaterializer` already performs for a
  provider mount — resolve unions to their winning view, resolve or copy
  symlinks, write the result out as real files — generalizes to the whole
  composed tree, written to a private host directory instead of virtual
  nodes, for the M9 runtime bridge to hand to a container. The open question
  for container/Docker support was never how to expose the tree; it is the
  new host-compute capability class real container execution needs, which
  does not exist yet and should not be implied by this mechanism being simple.
- **A container image may back a command only through explicit,
  non-speculative declaration — never ambient resolution.** Running a
  container so it behaves like a native command (input via the mount, output
  as stdout/stderr/exit status, indistinguishable from a `BuiltinCommand` at
  the prompt) is appealing, but Yash resolving an arbitrary typed word against
  a container registry would reopen "no ambient host executable lookup,"
  which the shell contract has held as a non-goal since its first version —
  a container substituted for a host binary is still ambient authority. Each
  such command must be declared (image, requested capability) before its name
  resolves to anything, the same way a mount path doesn't exist before
  activation. If pursued, stage it: read-only/stdout-only first; a command
  that produces file output needs the staged-import/explicit-commit machinery
  invariant 7 already requires and nothing has designed yet; long-running or
  stateful containers are a further step past that.

## M5 demo: bounded collaborative review room

The M5 proof is not "an agent platform" or one mount per PR. It is a filtered
GitHub PR collection that independent humans or model clients can inspect and
annotate through one durable tree:

```text
/reviews/acme/widget/
  source/pulls/482/       # read-only PR metadata and diff
  source/pulls/483/
  artifacts/              # durable local reviewer artifacts
    482/alice/trace.json  # source provenance, PR head SHA, captured blobs
    482/alice/review.md
    482/reviewer-b/trace.json
    482/reviewer-b/review.md
```

The demo succeeds when two independent sessions inspect a PR from the same
filtered source collection, add separate artifacts without provider write authority,
and a later reader can answer which revision they saw, which artifacts each
produced, and when the source was fetched. `trace.json` persists exact captured
content, provenance, and a PR head SHA where GitHub provides one: if a later
query refresh removes the PR, local reviewer artifacts remain reifiable without
reading the live collection. A local LM Studio client may
participate as one such reviewer, but it is not yet an agent runtime provider.
This is the product proof for provenance, composition, and shared inspectable
state.

M5 implementation began only after the external-read path had a named
GitHub network grant, an explicit secret-reference policy if authentication is
needed, and revision/freshness fields in the provider record. It remains
read-only; no GitHub write, autonomous loop, host execution, or public MCP
endpoint is part of the demo.

**Current foundation:** a GitHub declaration contains `repository`, `query`, and
bounded `max` only. `YAFS_GITHUB_API_URL` is a daemon-only HTTPS endpoint
setting; `YAFS_GITHUB_TOKEN` is a daemon-only credential. A manifest must name
`network.github-api` to make a collection request and may name
`secret.github-token` only when that daemon-held token exists. Snapshot content,
collection revision, and fetch time are durable; endpoint and token are not.

## Questions that need product answers

1. **Who operates Yafs, and where?** Is the first form a personal local
   appliance, a team service, or an embeddable library? This determines install,
   daemon lifecycle, backup, authentication, and support expectations.
2. **What is the source of truth for writes?** For each provider, are writes
   immediately authoritative, staged proposals, append-only events, or cached
   copies? The answer must be visible before a user risks important work.
3. **How does change reach consumers?** Is polling enough for the first review
   workspace, or do `watch`/event subscriptions become a kernel requirement for
   caches, agents, and chat-like use cases?
4. **What data is safe to persist and inspect?** Prompts, transcripts, diffs,
   cache values, and provider tokens have radically different retention and
   redaction needs. A local-first default should be stated explicitly.
5. **What makes this better than a directory plus scripts?** The measurable
   answer should be provenance, composition, durable state, and a shared human /
   agent workspace—not merely a new command language.

### Working answers

- **Operator model:** start with an explicitly privileged local operator. Add
  authenticated user and service identities before remote/public exposure; do
  not infer public access from a mount being present.
- **Authority:** the VFS is authoritative for local writable nodes. A provider
  must state whether it is a read-only mirror, a writable source of truth, a
  cache, or a staged proposal. Shell access grants actions allowed by that
  provider and identity; it does not erase provider write policy.
- **Persistence versus watch:** WAL safety does _not_ require public file-watch
  events. It requires serial mutation, durable journal commit before success,
  atomic snapshots, and recovery. Watches/events are a separate consumer
  feature, though a sequenced internal mutation log can later support them.
- **Persisted data:** direct privileged access may inspect ordinary stored data,
  but secrets/tokens need separate secret references and redaction. Public
  exposure must be opt-in and scoped by the kernel even when a provider defines
  the route.
- **Extension gates:** M5 earns a post-review extension when users repeatedly
  rely on composition/provenance to complete work: for example, humans and
  agents use the same review tree, origin/freshness resolves real ambiguity,
  and users request a next provider because the workspace is useful—not because
  the architecture has an empty slot. Cache is justified by recurring TTL,
  reuse, and invalidation needs; agents by durable, inspectable run workflows;
  runtime bridging by an explicit need to execute a composed snapshot.

## Review questions

1. What specific evidence at M5 would justify continuing beyond the committed
   review-workspace horizon?
2. Should the first cache provider be the first post-M5 extension, or should it
   wait for actual review-workspace usage to reveal the next need?
3. Should Yash scripts use only the small language, or should JSON-lines RPC be
   a first-class scripting surface?
4. Should `ctl` be generalized now from "the provider that owns this fetched
   mount" to any directory with a registered handler, given personas need the
   latter and GitHub only ever needed the former as a special case of it?
5. What checkpoint cadence for a streamed `ctl` result balances WAL load
   against a meaningfully "live" `cat` during a long-running response?
