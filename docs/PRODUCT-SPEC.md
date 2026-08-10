# Product spec: provider-backed workspaces

## Purpose

Yafs is a local-first workspace appliance. It gives an operator one durable,
inspectable filesystem tree whose subtrees may be backed by explicit providers.
The value is not that a provider makes an API look like files; it is that local
notes, remote snapshots, provenance, and later model output can be composed,
inspected, and—when it matters—captured as durable artifacts in one place.

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
| Understand state | `mounts` shows mounted subtrees and state; `mount validate`, `activate`, `refresh`, and `unmount` remain explicit. |
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
mounts:
  - id: github-acme-widget
    path: source
    provider: github
    config:
      repository: acme/widget
      query: "is:pr is:open"
      max: 50
    capabilities:
      - network.github-api
      - secret.github-token
```

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
`mounts plan`, `mounts apply`, and `mounts status`.

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
| Reconciled resource | `machines/acme/image/` | Creating the resource path is a durable desired-state request; the controller creates an instance only after authorization and records actual status. |
| Reconciled agent | `agents/reviewer/prompt.md` | Writing the prompt declares a named running agent resource. The controller starts/restarts it only after the write is durable and its grants are authorized. |

This is the unifying shape for GitHub, machines, and agents: a mount is a
controller boundary; its children are resources. Each mutable resource needs a
visible distinction between desired configuration, observed status, and durable
history. `mkdir` can be a resource-creation operation, but only where the
provider documents it as such; it is never a hidden consequence of browsing.

```text
/machines/acme/image/
  volume/                 # VFS files supplied to the instance
  desired.json             # requested image/configuration
  status.json              # observed lifecycle, revision, ports, errors
  logs/

/agents/reviewer/
  prompt.md                # durable desired prompt
  context/                 # explicitly readable VFS material
  status.json              # run/reconciliation state
  transcript.ndjson
  output/
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

The first useful proof should be small enough to explain in one screen:

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

## Explicitly deferred

- GitHub writes, provider writes, and distributed transactions.
- Arbitrary third-party provider code and a package marketplace.
- Autonomous multi-agent orchestration and host-process execution.
- Public MCP, SSH, FUSE write support, and multi-user authorization.
- Streaming shell pipelines and a general binary CLI.

## M5 entry checklist

Before writing `github`, implement and test:

1. a daemon-held named network grant and secret-reference policy;
2. Unicode-NFC path normalization at provider boundaries;
3. provider revision/freshness fields in `inspect` and audit;
4. a bounded response contract for PR metadata and diffs; and
5. explicit and persisted daemon-scheduled collection refresh, including
   coalescing, failure retention, and audit, with no GitHub write authority;
6. durable source bindings for local review artifacts; and
7. a synchronous resolver over published snapshots, with node-level
   provenance and read-only enforcement.

Before or alongside the review demo, a local-only MCP adapter can dogfood the
same structured API. It currently offers `yafs.list`, `yafs.read`, and
`yafs.inspect`; a local-note write requires a structured mutation API and is
not implemented through shell-string escaping. The adapter is a separate client
process, not a provider, an embedded kernel API, or a shell-execution endpoint.

## Documentation ownership

- [ADR.md](ADR.md) records durable architectural decisions and explicit
  non-goals.
- This product spec defines the operator promise and success criteria for the
  review-workspace proof.
- [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md) records implementation order and
  current status. It should link to decisions rather than repeat them.
