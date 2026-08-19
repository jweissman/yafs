# Product spec: provider-backed workspaces

## Purpose

Yafs is a local-first, inspectable world model for humans and agents: live
provider views for discovery, private workspaces for local work, and
durable records for consequential effects. The value is not that a
provider makes an API look like files; it is that local notes, remote
snapshots, provenance, and agent output can be composed and inspected in
one coherent, legible place — with durable capture available for the
moments that need it, not as the default way of engaging with any of it.

This document describes the operator-facing provider promise and the first
demonstrable product experience. [ADR.md](ADR.md) owns architectural decisions;
[FEATURE-ROADMAP.md](FEATURE-ROADMAP.md) owns sequencing.

## Product boundary

The first shipped appliance is a single, privileged local operator talking to
`yafsd` through Yash or the loopback RPC protocol. A mount is not public merely
because it exists. Remote identities, public endpoints, and multi-user policy
are later work.

The kernel owns paths, links, union precedence, durability, identity, mount
boundaries, provenance, audit, and durable artifacts. A provider has a bounded
state **view** and, only when explicitly designed, named typed **actions**. The
M5 provider shape supplies a bounded, immutable logical snapshot at its
configured subtree; the kernel resolver makes that one source participate
consistently in direct reads, links, unions, and provenance. A mount does not
normally name one remote object.

This boundary rules out a misleading product claim: Yafs is not a generic
replacement for Redis, S3, Kubernetes, Docker, or a host shell. A cache, an
image controller, or an RPC gateway may be a useful later adapter, but must
earn its place as a narrow consumer of these kernel properties rather than
silently widening the appliance's authority.

## What every mount affords

An active mount is visible through ordinary VFS operations and is always
inspectable:

| Operator need | Contract |
| --- | --- |
| Browse | `ls`, `cat`, `stat`, and `inspect` work beneath the mount path. |
| Locate source | `inspect` identifies local versus provider content, mount ID, provider, revision, and activation time. |
| Understand state | `mounts` shows mounted subtrees and state; `plugins status`/`plan`/`apply`/`refresh ID` and `plugin deactivate ID` remain the explicit lifecycle surface (see [ADR.md](ADR.md#capabilities-distribution-and-adapters) — the earlier in-VFS `mount validate/activate/refresh/unmount` commands were removed as a capability-granting security gap). |
| Know authority | Writes are accepted only when the provider mode and mount scope allow them. A read-only mount rejects them. |
| Recover | Mount declarations and lifecycle operations survive restart; audit records explain activation and unmount transitions. |

M4.5 makes a fixture activation or refresh publish one bounded, immutable
snapshot into the NodeStore. Recovery consumes that recorded snapshot rather
than calling a provider. M5 extends this with a bounded GitHub fetch behind
named grants; provider writes and user-defined provider packages remain out of
scope. M6 adds a separate durable-artifact store, but recovery still never
refetches missing historical bytes.

Unions retain declared canonical layer paths, not object references. A missing
layer is omitted; remounting at that path makes its current snapshot available
to the existing union. A future external snapshot store must sync content
before the WAL record that references its digest; recovery never refetches.

Provider I/O is never part of pathname traversal. Activation and refresh build
a detached snapshot, validate it, and atomically publish it; ordinary reads,
links, unions, and provenance queries use that one published snapshot. This is
both the consistency rule for refresh and the boundary that prevents browsing a
path from acquiring network or secret authority.

## Configuration model

A plugin manifest is restricted YAML, not arbitrary plugin code. It is schema
validated, versioned, rejects unknown fields, duplicate keys, tags, aliases,
and anchors, and requests capabilities rather than granting them. There is no
in-VFS way to declare or activate one — `yafs.plugins.yaml`, selected by
`yafsd --config`, is the sole deployment configuration and the sole
capability-granting mechanism (see `docs/ADR.md`'s "Capabilities,
distribution, and adapters" removal policy).

```yaml
version: 1
plugins:
  - id: github-acme-widget
    path: source
    plugin: github
    config:
      repository: acme/widget
      pulls:
        query: "is:pr is:open"
        max: 50
    capabilities:
      - network.github-api
      - secret.github-token
```

(`mounts:`/`provider:` still parses — the legacy key spelling — but `plugins:`/`plugin:` is the
canonical form new configuration should use; see [ADR.md](ADR.md#capabilities-distribution-and-adapters).)

This mounts a GitHub collection, not PR 482. Its provider projects matching PRs
under `source/pulls/<number>/`; a PR number is a virtual child path, not mount
configuration. Its kernel-owned, daemon-executed refresh policy publishes a new complete
collection snapshot; it never updates individual PR paths in place. The operator
may request `plugins refresh github-acme-widget` explicitly. A declared
interval is daemon-scheduled through that same refresh publication path; it is
never silently inferred from the manifest.

The GitHub API endpoint and credential are daemon configuration, never manifest
data: `YAFS_GITHUB_API_URL` defaults to `https://api.github.com` and must use
HTTPS; `YAFS_GITHUB_HOST` offers the usual GitHub Enterprise host mapping; and
`YAFS_GITHUB_TOKEN`, when present, permits the separate
`secret.github-token` grant. A public collection needs only `network.github-api`.
Neither value is stored in the VFS, WAL snapshot, provenance, or inspection output.

Activation proceeds through this visible lifecycle:

```text
declared → validated → authorized → activating → active → refreshing | failed → unmounted
```

The fixture implements the active/unmounted portion. A real provider must not
fetch, execute code, or reveal a secret merely because a manifest was found.

### Daemon-owned desired configuration

An operator may make mount declarations persistent across deployments through
the daemon's configured desired-state file. This file lives beside daemon data,
not at a virtual path: it is the operator's deployment input and remains
present even if the virtual workspace is reset. `yafsd start --config FILE` is
an explicit override for a container image, service manager, or development
environment. Normal clients use the daemon's selected configuration through
`plugins plan`, `plugins apply`, and `plugins status`.

Planning is read-only and reports additions, changed declarations, and—only
when requested—removals. Applying is idempotent. It refreshes a declaration
whose validated configuration or requested grants changed, but does not prune a
mount simply because it is absent from a file unless the operator explicitly
chooses that policy. This keeps configuration reconciliation distinct from
ordinary VFS mutation and makes deployment authority visible.

## Resource namespaces and controllers

Provider roots may project a collection of resources or reconcile declared
resources. A provider contributes a composition of a validated configuration,
published snapshot/layout, and optional typed actions; it does not receive a
general-purpose mutable VFS object. A provider may separately register named
actions with typed RPC requests and concise Yash syntax. In every case, reads
are never side effects; only explicit durable mutations can request creation,
refresh, start, stop, or deletion.

| Namespace kind | Example | Meaning |
| --- | --- | --- |
| Collection projection | `source/pulls/482/diff.patch` | The provider enumerates remote objects as files/directories. Its query/filter controls which children exist. |
| Reconciled resource | `machines/acme/image/` | Illustrative, not built: creating the resource path would be a durable desired-state request; a controller would create an instance only after authorization and record actual status. |
| Reconciled agent | `agents/reviewer/{prompt.md,ctl}` | Built, but not by VFS write: the mount's host-side plugin config declares each persona, and `prompt.md` is published **read-only** from it. Writing `ctl` is what invokes the persona; the controller runs it only after capability authorization and records status/response durably under `runs/<run-id>/`. |

This is the unifying shape for GitHub, machines, and agents: a mount is a
controller boundary; its children are resources — though "desired state" for
an agent persona lives in host configuration, not a VFS write, unlike the
hypothetical machine controller above. Each mutable resource needs a visible
distinction between desired configuration, observed status, and durable
history. `mkdir` can be a resource-creation operation, but only where the
provider documents it as such; it is never a hidden consequence of browsing.

```text
/machines/acme/image/            # illustrative future shape, not built
  volume/                 # VFS files supplied to the instance
  desired.json             # requested image/configuration
  status.json              # observed lifecycle, revision, ports, errors
  logs/

/agents/reviewer/                # built — current shape
  prompt.md                # published read-only, from the mount's config
  ctl                       # write here to invoke the persona
  chats/<chatId>/
    messages.ndjson          # append-only turn history for that chat
  runs/<run-id>/
    request.md                # the message that started the run
    context.md                 # optional attached context (--context)
    response.md                 # the model's reply
    status.json                  # queued/running/complete/failed
```

An eventual public chat endpoint is an adapter bound to an agent resource, not
a socket opened directly by plugin code. It needs its own service identity,
route policy, quotas, and audit record before public exposure.

## Capabilities

Capabilities are a boundary around provider behavior, even for a privileged
local operator. They make authority reviewable and prevent a convenient mount
from becoming ambient host authority.

| Capability class | Intended first rule |
| --- | --- |
| Network | Grant a named destination, such as `network.github-api`, rather than general network access. |
| Model invocation | Grant a configured endpoint through `model.invoke`; it is not host process execution. |
| Secrets | Grant a named daemon-resolved reference. Providers receive the usable credential only as needed and do not expose it as a file. |
| Writes | A provider may write only inside its mount when its mode supports it. Outside-mount writes are never a capability. |
| Host execution | Never a provider grant. It is the separate, allowlisted runtime bridge. |

M5 needs a daemon-held grant policy and audit records for authorization and
provider use before `github` can leave the fixture stage.

## Data, revisions, and durability

The kernel-facing future file API is bytes. Yash is initially a UTF-8 text
client. This keeps ordinary review files convenient while preserving a path for
binary diffs, archives, and model artifacts without silently corrupting them.

V1 local writes are whole-file atomic replacements represented by one durable
operation. There is no streaming-write or multi-file transaction promise.
Provider reads will eventually use bounded, pull-based streams; until then a
provider must have a documented maximum inline response size.

Every provider-backed view needs two related facts:

- **Revision:** the exact source content version—Git SHA, PR head SHA/ETag,
  cache generation, or model/context digest.
- **Freshness:** when it was fetched or refreshed, plus expiry or staleness
  information when relevant.

This is content provenance, not the version of provider software. Provider
package/build provenance is recorded separately.

Read-only fetches may prepare a private cache before the mount record is
durable; a failed WAL commit simply leaves no visible mount. A future remote
write requires a durable intent, idempotent provider call, and durable outcome;
it is out of scope for the first review provider.

## First demo: collaborative PR review collection

**Delivered, M5-era proof — not the current active experiment.** This demo
shipped and is still true today, but it is not what near-term work is being
judged against; that's [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md#review-radar-proof-achieved)'s
"review radar" (now live-validated against a real model, not just a
hypothesis), a materially different shape (one scoped agent exploring
live, proposing one candidate, human-approved) that grew out of what this
demo taught. Read this section as "what M5 proved," not "what to expect
next." The first useful proof should be small enough to explain in one screen:

```text
/reviews/acme/widget/
  source/                   # read-only filtered GitHub collection
    pulls/
      482/
        metadata.json
        diff.patch
      483/
        ...
  artifacts/                # durable local review artifacts, keyed by PR
    482/alice/trace.json     # source provenance, PR head SHA, captured blobs
    482/alice/review.md
    482/reviewer-b/trace.json
    482/reviewer-b/review.md
```

The operator configures a repository and PR query, explicitly activates the
collection mount, and opens two Yash/RPC sessions. Each session can browse the
same bounded PR snapshot and write an independent artifact under the
corresponding `artifacts/<number>/` directory. Its `trace.json` records exact
captured source content, provider provenance, revision/freshness, and a PR
head SHA where available; it remains reifiable if a later query refresh removes
the PR from `source/`. `inspect source/pulls/482/diff.patch` and `trace.json`
answer what was reviewed and when. A local model client can act as one reviewer, but no agent runtime,
GitHub write, host execution, or public MCP service is required.

The demo is successful only if a later reader can reconstruct:

1. the PR/source revision and freshness;
2. which reviewer produced each artifact;
3. what each reviewer could access and mutate; and
4. the final review assembled from independently durable notes.

## Provider delivery and adapters

M0–M5 use built-in trusted providers while the ABI settles. Later,
`yash add @org/provider` may resolve a GitHub repository, but it must pin an
immutable revision, write a lockfile, inspect a declarative manifest without
executing provider code, then require explicit enablement and grants.

MCP and FUSE are adapters, not providers:

- `yafs-mcp` is a client executable. Its first local-only surface should offer
  narrow read/introspection tools, not unrestricted shell execution.
- FUSE is a possible local read-only projection after provider read semantics
  stabilize. It does not promise general POSIX behavior or bypass mount policy.

## Long-range direction: a legible, federated world

Vision, not a committed milestone. Recorded in full here — not compressed,
not deleted — because the destination matters even while implementation
stays ruthlessly sequenced behind it; see
[FEATURE-ROADMAP.md](FEATURE-ROADMAP.md)'s "Next proof" and "Next
experiment" sections for the actual near-term work this is downstream of.

**The question this direction is really asking:** can agents become more
useful when they inhabit a coherent, self-describing world, can preserve
successful procedures, and can share them under explicit trust and
capability rules? That's a richer question than "can a Slack bot review a
PR" — and the whole point of sequencing hard behind a concrete near-term
proof is to keep this question live without letting it stall real
progress. Working tagline for where this points: **Yafs gives humans and
agents a legible world of live external resources, private workspaces,
reusable procedures, and inspectable effects** — broader and more
distinctive than "virtual filesystem with plugins," while preserving the
same kernel discipline (capability grants, durable operations, provenance)
everything else in this spec already assumes.

Motivated by a real live failure, not just aesthetics: a tool-enabled
persona with genuine read/list access to a PR queue replied "I haven't
pulled the list of open PRs yet... give me the PR URLs" instead of just
looking. A tool-enabled model got no world model and no obvious first
tool call — "I don't have repo context" was the predictable result, not a
fluke of one weak model.

### Namespace: three concepts, not one blended `/home`

```text
/world/                  # provider-backed, current external reality — read-only
/home/<principal>/        # private writable work area — proposals, notes, runs
/commons/                 # shared, versioned, explicitly trusted procedures
```

```text
/world/github/acme/widget/pulls/482/{metadata.json,diff.patch}
/world/slack/channels/reviews/messages.ndjson
/home/reviewer/{notes/,proposals/,runs/}
/commons/github/pr/identify-smallest-fixable/{fn.yash,README.md,manifest.json,tests/}
```

`/world` is read-only by default and self-describing — its job is
discovery and context, not durable ownership. `/home` is the only place
proposals/notes/scripts get written; keeping provider mounts and private
working files apart (rather than an agent home merely symlinked into a
jailed world) is a real clarity win on its own.

**Implemented:** plugins get a *default* path derived from provider
identity — `github` mounts default to `/world/github/<owner>/<repo>` (from
the manifest's already-validated `owner/repo` `repository` field),
`slack` mounts default to `/world/slack/channels/<channel>` — rather than
requiring the operator to choose and communicate one per deployment;
`path:` stays an explicit override, not removed, so this composes with the
existing manifest contract rather than replacing it (see `Plugin.
defaultPath`, `GitHubPlugin.ts`, `SlackPlugin.ts`, and
`ManifestMountPath.ts`'s `resolvedPath`). `fixture` and `agent` mounts have
no natural identity field to default from, so `path:` stays required for
those, unchanged. **No sweeping migration**: this is a documented
convention for new configurations only — no rename of any existing
mount/test path, and no compatibility symlink/projection layer exists or
is planned unless a real need for one shows up.

**This is a path-default convention, not a declared contract.** Nothing
stops an operator from setting `path:` to place a `github` mount outside
`/world` entirely, and each provider's layout *beneath* its own mount root
(`pulls/482/{metadata.json,diff.patch}` for GitHub, `messages.ndjson` for
Slack) is implicit in that provider's own code, not a schema any tool
validates against. That is an acceptable shape for a convention; it would
not be enough if `/world` needed to be a machine-checkable guarantee
(e.g. "every mount under `/world` exposes a `tree`-walkable resource of a
declared shape") — no such contract is designed or built.

**Known accepted gap: Slack default-path collisions across workspaces.**
`SlackConfig` has no team/workspace field, so two Slack mounts for the
same channel ID in two different workspaces would default to the same
`/world/slack/channels/<channel>` path and collide. This is not solved by
a schema change (a deliberate decision, not an oversight) — `path:`
is the required override the moment a deployment has more than one Slack
workspace. Single-workspace deployments, the only case in production
today, are unaffected.

**Known accepted gap: GitHub default paths omit host identity.**
`GitHubConfig` has no `host` field — every GitHub mount is implicitly
github.com — so `/world/github/<owner>/<repo>` cannot collide today. This
is recorded now so it isn't forgotten: if GitHub Enterprise host
configuration is ever added, two hosts sharing an `owner/repo` would
collide under the current default unless the path scheme adds a host
segment at that time.

**Still an open question, not decided either way:** whether a
resource-type segment belongs in the default path at all (`/world/github/
<owner>/<repo>/pulls/482` as shown above, versus a more regularized
`/world/github/repos/<owner>/<repo>/prs/482` that names the collection
kind explicitly and might generalize better across providers whose
resources aren't all "pull requests"). Defaulting to the mount root
(`/world/github/<owner>/<repo>`) ships now without resolving this; a
resource-type segment is additive path structure *beneath* that root, not
a change to what's already shipped.

### Faceted task environments: a view is not a jail

An agent needs an obvious, small world, not a prompt that describes an
unbounded appliance. A future task view should compose a declared set of
read-only resources with one private writable root:

```text
/home/reviewer/labs/triage-482/
  world/       # selected GitHub, Slack, and incident-source views
  notes/       # private, writable analysis and proposed procedure
  evidence/    # explicit captures, not hidden read caches
  runs/        # accepted action/run records
```

This is deliberately a **faceted namespace**, not merely a convention of
symlinks. Union mounts are useful composition machinery, but neither a union
nor a symlink enforces authority. The eventual resolver/invocation boundary
must carry the principal, allowed roots, and action grants, so `cat`, MCP,
Yash, and a future web client observe the same jail. Today's scoped MCP roots
are a useful first consumer, not yet that general primitive.

The first operator-facing legibility contract should be small: `start_here`
or an equivalent structured operation returns the task's roots, each source's
provider/revision/freshness, writable locations, available typed actions, and
remaining budgets. An agent should be able to discover its world with
`tree`, `inspect`, and `find`; it should not need deployment-specific prompt
instructions to guess where a repository or incident feed lives.

### Services and actions are separate resource modes

The filesystem is the common inspection and composition surface, not a claim
that every integration has file-like semantics. Keep five modes distinct:

| Mode | Example | Rule |
| --- | --- | --- |
| Projection | GitHub PRs, Slack messages, incident groups | Read paths expose a revisioned view and never cause an external side effect. |
| Faceted workspace | an agent task lab | Ordered views plus a private writable root, evaluated under one scope. |
| Typed action | `agent send`, `slack send`, later `incident acknowledge` | An accepted envelope names actor, input revisions, authority, budget, idempotency key, and outcome. |
| Service facade | a cache's RESP subset or an object store's S3 subset | A network adapter is honest only about operations and consistency it actually implements; it is not generic protocol compatibility. |
| Reconciler | a future machine or deployment resource | Desired state, observed status, and controller action remain separately visible. |

`ctl` is currently a diagnostic transport for a few of these actions. The
product surface should become provider-declared typed actions, with Yash
pseudobinaries, MCP tools, RPC, and the web UI all adapting the same action
descriptor. That keeps Slack-to-agent wiring from becoming a privileged
TypeScript-only exception and gives scripts a vocabulary that can later be
reviewed, tested, and shared.

### Operator web UI: a projection, not a second control plane

An early local-only UI is worthwhile once it consumes the same typed workspace
operations and action descriptors as Yash/MCP. Its initial job is to make the
appliance inspectable: browse `/world` and task views; show mount/provider
revision and health; inspect runs, accepted actions, outbox state, and timer
state; and invoke only actions already exposed to the local operator. It must
not gain a private plugin API or duplicate lifecycle/business rules in a web
backend. Public sharing, remote identities, and a chat product remain later
separate decisions.

### Capture stays secondary

The default for an exploratory task (find a low-risk PR, triage a queue)
is live exploration — tree/find/read/inspect against the live mount, not
a capture-first workflow. `capture` remains useful once a consequential
decision has been made: preserving the exact source behind a
recommendation, building an audit bundle, or continuing work after a PR
falls out of the query window. Related and still open from earlier
reviewer feedback this project owes a real answer to: a **run input
record** — record which mount revisions/roots an agent actually observed
during a run, and flag if they changed mid-run. That's a better
consistency primitive than forcing every exploratory task through
capture, and hasn't been designed yet.

### `/commons`: versioned, trusted procedures — not a live union of arbitrary public code

A federated registry (tentatively "yashub") of reviewed, published local
procedures — functions crystallized from successful agentic work, not a
package marketplace of arbitrary third-party code (that stays explicitly
deferred below). A function needs more than `fn.yash` + a README: a
`manifest.json` declaring name/version, input schema, declared effects,
required provider capabilities, allowed roots, source digest, and test
command/results — treating a commons function like a capability-declaring
unit, consistent with how mounts/plugins already work everywhere else in
this system, not a bare script drop. Publication is an **explicit,
human-reviewed external action** — an agent may *propose* extracting a
successful procedure into a function, but a human approves publishing it,
the same approval discipline M6.4/M6.5 already apply to a proposed Slack
reply. Object-member call syntax (`commons.github.pr.identify_smallest_
fixable(...)`) is deliberately deferred — it pulls parser and type-system
complexity forward for a nicety; start with one explicit script/function
invocation command with typed inputs, add syntax sugar only if repeated
real use earns it.

The falsifiable hypothesis, stated precisely: *do reviewed, tested
procedures distilled from successful runs make later agents noticeably
more effective?* That's the thing worth a cheap experiment designed to
falsify, not the registry build itself. Design of the bundle/manifest
contract can proceed alongside L2 scripting (see
[LANGUAGE-ROADMAP.md](LANGUAGE-ROADMAP.md#paving-stones)); actually
publishing or invoking a function is gated strictly after L2 lands for
real, since there's no script to publish or invoke before then.

**First candidate feedstock, not yet a publication:** M6.8's investigation
"cases" (see [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md)) are the first
concrete instance of "a procedure that worked" this system has produced —
a repeatable fetch → narrow → isolate → explain → capture pipeline with a
durable, inspectable record of each run. Whether a specific case-shaped
procedure (e.g. "explain a red master commit") is used often enough and
well enough to be worth distilling into a published, reviewed `/commons`
function is exactly the falsifiable question above — not assumed here,
and not before L2 exists to express the distilled version as a script. Federation
(a `/commons/public` sourced from an actual external registry) is a
second, separate concern layered on top — explicitly **beyond
identity/auth work**, recorded as a post-M8 hypothesis with its own
preconditions in [ADR.md](ADR.md#federation), not solved by or blocking
anything else here. A `/commons/public` entry is executable code from an
untrusted third party — a real supply-chain surface, equivalent to
installing an unaudited package — and needs its own trust/sandboxing
design regardless of when federation itself lands.

### A `lab` is not a plugin, at least not yet

Start as a bounded writable area under an agent's `/home/<principal>/runs`
— ordinary local workspace semantics, no new subsystem. Only promote it
to a real plugin if a concrete experiment actually needs lifecycle,
external resources, or execution that local-write semantics can't
express. This is the most speculative item in this whole direction —
unlike `/world` (motivated by a bug just hit) and `/commons` (a scoped,
falsifiable hypothesis), there's no concrete scenario driving anything
beyond "a writable subdirectory" yet.

## Explicitly deferred

- GitHub writes, provider writes, and distributed transactions.
- Arbitrary third-party provider code and a package marketplace — distinct
  from the reviewed, human-published `/commons` procedures above.
- Autonomous multi-agent orchestration and host-process execution, in
  general. **Narrow exception:** [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md)'s
  M6.8 spikes one deliberately bounded case — a disposable, content-addressed
  worktree plus a frontier-model CLI invocation to explain a CI failure,
  gated behind a new, small, explicit capability
  (`host.investigate-repository`, not general `host.exec`), human-approved
  before delivery. Validated live (real failure, real grounded explanation,
  independently fact-checked) before this exception was written down. It
  does not reverse this deferral — general autonomous orchestration and
  unrestricted host execution stay out of scope.
- **General/unbounded** recursive-MCP tool-calling: a persona reading or
  writing outside its own mount, or chaining across multiple personas/mounts
  in one run — blocked on a per-actor path-scoping primitive that does not
  exist yet; see the ADR's "Path-scoping primitive" section. The **bounded**
  case — a tool-enabled persona driving its own read-only tool loop scoped
  to its own `tools.roots` — is implemented (M6.5) and proven to chain
  through Slack end-to-end; it is not what's deferred here.
- Public MCP, SSH, FUSE write support, and multi-user authorization.
- Streaming shell pipelines and a general binary CLI.
- Federation/`yashub` — see "Long-range direction" above and
  [ADR.md](ADR.md#federation): explicitly gated on identity/trust work
  beyond M8, not a near-term commitment.

## M5 checklist — delivered

M5 (the GitHub provider) implemented and tested:

1. a daemon-held named network grant and secret-reference policy;
2. Unicode-NFC path normalization at provider boundaries;
3. provider revision/freshness fields in `inspect` and audit;
4. a bounded response contract for PR metadata and diffs; and
5. explicit and persisted daemon-scheduled collection refresh, including
   coalescing, failure retention, and audit, with no GitHub write authority;
6. durable source bindings for local review artifacts, later extended to
   `capture`/`restore`; and
7. a synchronous resolver over published snapshots, with node-level
   provenance and read-only enforcement.

The local-only MCP adapter (`yafs-mcp`) dogfoods the same structured API. Its
tools are the L0/L1 workspace operations (`yafs.list`/`yafs.read`/
`yafs.inspect`/`yafs.query`/`yafs.tree`/`yafs.find`/`yafs.test`/`yafs.diff`/
`yafs.grep`) plus `yafs.capture`/`yafs.restore`; a local-note write would
require a structured mutation API and is not implemented through
shell-string escaping. The adapter is a separate client process, not a
provider, an embedded kernel API, or a shell-execution endpoint.

## Documentation ownership

- [ADR.md](ADR.md) records durable architectural decisions, explicit
  non-goals, and the trust/security preconditions for later hypotheses
  (e.g. federation).
- This product spec defines the operator promise, success criteria for the
  review-workspace proof, and the long-range direction — where the product
  is headed, not when. Keep vision material here, in full, not compressed
  into the roadmap.
- [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md) stays short: current state, the
  one active next proof, near-term experiments with acceptance criteria,
  and the milestone table. It should link to decisions and vision rather
  than repeat them.
- [LANGUAGE-ROADMAP.md](LANGUAGE-ROADMAP.md) owns script/function/operation
  language decisions only.
