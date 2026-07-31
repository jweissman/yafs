# ADR: Yafs as a composable workspace service

**Status:** Proposed for review

## Decision

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

## Product horizon and extension hypotheses

The committed product horizon is a useful local workspace service through the
review-workspace proof: M0–M5. That is enough to validate the central claim
that explicit, inspectable composition makes remote and local project state
more useful than either a plain filesystem or a provider-specific UI.

Cache, agent, remote/multi-user, and runtime work are **extension hypotheses**,
not promised deliverables. They remain in this ADR to constrain the kernel and
make its intended seams concrete, but each needs a separate go/no-go decision
after M5. No later milestone should expand the delivery commitment by existing
in this document.

## Primary use cases

### Review workspace — first product wedge

This proves read-only providers, composition, caching, provenance, and
human/agent collaboration without unrestricted execution.

```text
/reviews/482/
  repo/              # pinned source revision
  pull-request/      # title, files, diff, comments, checks
  notes/             # writable review notes
  workspace/         # union(notes, pull-request, repo)
```

```sh
yash:/reviews/482$ cat pull-request/summary.json
yash:/reviews/482$ origins workspace/src/auth.ts
yash:/reviews/482$ echo "check token expiry" > notes/auth-review.md
```

The first GitHub provider may be deliberately narrow: a repository and PR
number yield read-only metadata, changed-file views, and a diff. That is enough
for basic human or agent review.

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

| Need | Contract |
| --- | --- |
| Interactive use | Prompt templates, local persisted history, up/down, Ctrl-R, and virtual-path completion belong in Yash. |
| Automation | Versioned RPC returns typed output/error/session information; terminal text is not the API. |
| Familiar commands | Start with `pwd`, `cd`, `ls`, `cat`, `mkdir`, `echo`, links, inspection, and explicit mount commands. |
| Small language | Add quoting, variables, arithmetic expansion, command substitution, redirection, pipes, and exit status in documented increments. |
| Explicit incompatibility | No POSIX-script promise, job control, signals/traps, aliases, globbing, or ambient host executable lookup. |

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
abstract class BuiltinCommand {
  abstract readonly name: string
  abstract readonly synopsis: string
  abstract execute(context: CommandContext, args: string[]): string
}
```

`CommandContext` supplies the session, VFS, clock, and eventually typed input/
output streams. This gives `help` a single source of truth, makes commands
unit-testable, and keeps client-only actions (`history`, terminal editing) out
of the server registry. Command instances are context-free; the interpreter
supplies context only at invocation time. This is implemented for the current
built-ins and is the required extension point for mount-aware commands.

Adopt familiar commands only when their Yafs meaning is documented:

| Tier | Commands | Rule |
| --- | --- | --- |
| Core VFS | `pwd`, `cd`, `ls`, `cat`, `mkdir`, `ln`, `stat`, `lstat`, `readlink`, `origins`, `mounts`, `inspect` | Operate through the VFS and preserve mount/provider semantics. |
| Safe session | `help`, `version`, `whoami`, `true`, `false`, `date` | Need no host-process access. `date` uses an injected server clock and an explicit stable format. |
| Metadata-aware | `touch` | Add only with node timestamps and a defined create/update policy; never pretend an empty-file shortcut has POSIX touch semantics. |
| Stream-oriented | `printf`, `head`, `tail`, `wc`, `grep`, `sort` | Add after typed stdin/stdout streams and pipe behavior are settled. |
| Transactional/destructive | `rm`, `mv`, `cp`, `chmod` | Add only with provider write/delete, rollback, and audit semantics. |
| Process-oriented | `time`, `ps`, `kill`, jobs | Defer until Yafs deliberately owns process execution. `time` is not meaningful while commands are not yet composable processes. |

This is compatibility by clear semantics, not a promise of a growing POSIX
clone. A separate `now`/RPC field may be preferable to text `date` for
automation; `date` exists primarily for interactive and script convenience.

## Provider boundary

**Status:** M4 contract decisions are documented below; no manifest parser,
mount runtime, provider fixture, provenance records, or audit stream exists in
code yet. M4 remains pending until those acceptance artifacts are implemented
and tested.

M4 introduces a mount lifecycle, not arbitrary executable directories:

```text
declared → validated → authorized → activating → active → refreshing | failed → unmounted
```

Discovery only finds `.yafsmeta`; it must not load code, contact a provider, or
create a mount. Validation parses a strict declarative manifest. Authorization
compares each requested capability with daemon-held grants. Only then may the
kernel create an `activating` mount and call its provider. Every transition is
an audit event and remains visible through `mounts`/`inspect`, including a
failed activation.

The provider receives a mount-relative path only. It cannot resolve arbitrary
VFS paths, follow links outside its mount, pick union precedence, or write the
kernel journal. The kernel resolves paths, links, unions, identity, mount
boundaries, authorization, revision assignment, and audit events.

```ts
type ProviderMode = 'read-only' | 'authoritative' | 'staged'

interface Provider {
  describe(): { mode: ProviderMode, capabilities: string[] }
  stat(path: RelativePath, options: { followLinks: boolean }): Promise<Node | undefined>
  list(path: RelativePath): AsyncIterable<DirEntry>
  read(path: RelativePath): AsyncIterable<Uint8Array>
  refresh?(): Promise<{ revision: string }>
  write?(change: StagedChange): Promise<{ revision: string }>
}
```

M4 implements only `read-only` through a deterministic fixture provider.
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
files. The minimum event envelope is:

```text
sequence, at, actor, mountId, provider, action, relativePath,
capabilitiesUsed, outcome, beforeRevision, afterRevision, correlationId
```

Actions include declaration validation, grant/deny, activation, read, refresh,
write proposal, write commit, failure, and unmount. Never place secret values,
tokens, prompt contents, or file payloads in the generic audit log; record
content digests or provider-specific redacted references when needed.

The mount record and audit stream are kernel data: a provider may contribute
facts, but it cannot erase, forge, or silently omit its own capability use.


## Valuable increments

| Milestone | Product proof | Acceptance checkpoint |
| --- | --- | --- |
| M0 — composable VFS | A tree can represent composed state predictably. | Canonical paths, links with loop handling, read-only ordered unions, origins, and explicit errors. **Complete.** |
| M1 — command/session contract | Yash and RPC describe the same safe operation. | Typed result (`stdout`, `stderr`, status, structured error, session state); `help`, `version`, `whoami`, `mounts`, and `inspect`; documented built-ins and deterministic error codes. |
| M2 — usable Yash | A human can comfortably explore a persistent workspace. | Prompt templates, persisted local history, up/down, Ctrl-R, basic final-token path completion, `yash -c`, and JSON result output. **Baseline complete; polish remains.** |
| M3 — durable local service | Work survives restart and recovery is principled. | Versioned bounded loopback protocol; checksummed, sync-before-apply VFS operations; torn-final-record recovery; corruption refusal; snapshots/compaction; exclusive data-dir lock; `yash --local`; and managed `yafsd serve/start/stop/restart/status` lifecycle. **Complete for the single-tenant local appliance.** |
| M4 — mount/provider contract | External state enters without special cases. | Provider interface, strict schema-validated YAML mounts, capability grants, fixture provider, provenance/audit. |
| M5 — review workspace | The product helps with a real task. | Git/GitHub read-only mounts plus composed review workspace, explicit refresh, source revision. |
| M6 — cache provider *(decision gate)* | Yafs is useful as an observable state service. | Durable local TTL cache, atomic replacement, expiry metadata, eviction/limit policy, concurrent-write tests. |
| M7 — agent workspace *(decision gate)* | An agent can work visibly and safely. | Durable runs, scoped context/capabilities, artifacts, restart behavior, audit trail. |
| M8 — remote/multi-user *(decision gate)* | The service works safely beyond localhost. | Authenticated transport, per-user authorization, quotas, remote Yash/SSH adapter, audit retention. |
| M9 — runtime bridge *(decision gate)* | Workspaces intentionally drive external processes. | Allowlisted execution against materialized snapshots; staged imports with base-revision conflict checks and explicit commit. |

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
- Treat M5 as the primary product decision gate. Continue to cache, agents,
  remote service, or runtime work only if the review workspace demonstrates
  that composition and provenance are valuable to real users.
- Defer writeable union copy-up: it needs an upper layer, tombstones, conflict
  behavior, and transactions.
- Defer FTP and Telnet. SSH is the likely remote terminal adapter; RPC remains
  the automation transport.
- Defer multi-user ACLs until the per-user service model is designed, while
  provider capabilities are explicit from the beginning.

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
- **Persistence versus watch:** WAL safety does *not* require public file-watch
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
