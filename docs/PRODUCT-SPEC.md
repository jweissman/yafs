# Product spec: provider-backed workspaces

## Purpose

Yafs is a local-first workspace appliance. It gives an operator one durable,
inspectable filesystem tree whose subtrees may be backed by explicit providers.
The value is not that a provider makes an API look like files; it is that local
notes, remote snapshots, provenance, and later model output can be composed and
inspected in one place.

This document describes the operator-facing provider promise and the first
demonstrable product experience. [ADR.md](ADR.md) owns architectural decisions;
[FEATURE-ROADMAP.md](FEATURE-ROADMAP.md) owns sequencing.

## Product boundary

The first shipped appliance is a single, privileged local operator talking to
`yafsd` through Yash or the loopback RPC protocol. A mount is not public merely
because it exists. Remote identities, public endpoints, and multi-user policy
are later work.

The kernel owns paths, links, union precedence, durability, identity, mount
boundaries, provenance, and audit. A provider has a bounded state **view** and,
only when explicitly designed, named typed **actions**. The M5 provider shape supplies a bounded,
immutable logical snapshot at its configured subtree; the kernel resolver makes
that one source participate consistently in direct reads, links, unions, and
provenance. A mount does not normally name one remote object.

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
than calling a provider. External fetch, non-empty capability grants, provider
writes, and user-defined provider packages are still deliberately out of
scope; M5 must preserve the published-snapshot rule for a real provider.

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

`.yafsmeta` is restricted YAML, not arbitrary plugin code. It is schema
validated, versioned, rejects unknown fields, duplicate keys, tags, aliases,
and anchors, and requests capabilities rather than granting them.

```yaml
version: 1
mounts:
  - id: github-acme-widget
    path: source
    provider: github
    config:
      repository: acme/widget
      pulls:
        query: "is:pr is:open"
    refresh:
      interval: 15m
    capabilities:
      - network.github-api
      - secret.github-token
```

This mounts a GitHub collection, not PR 482. Its provider projects matching PRs
under `source/pulls/<number>/`; a PR number is a virtual child path, not mount
configuration. Its kernel-owned, daemon-executed refresh policy publishes a new complete
collection snapshot at most once per interval; it never updates individual PR
paths in place. The operator may also request a refresh explicitly. The example
shows the intended M5 shape, not currently accepted syntax. The implemented
fixture accepts only `provider: fixture`, a declarative file map, and
`capabilities: []`.

Activation proceeds through this visible lifecycle:

```text
declared → validated → authorized → activating → active → refreshing | failed → unmounted
```

The fixture implements the active/unmounted portion. A real provider must not
fetch, execute code, or reveal a secret merely because a manifest was found.

## Resource namespaces and controllers

Provider roots may project a collection of resources or reconcile declared
resources. A provider may separately register named actions with typed RPC
requests and concise Yash syntax. In every case, reads are never side effects;
only explicit durable mutations can request creation, refresh, start, stop, or
deletion.

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
        files/
        diff.patch
        provenance.json
      483/
        ...
  notes/                    # durable local review artifacts, keyed by PR
    482/source.json          # source revision/freshness bound to these notes
    482/alice.md
    482/reviewer-b.md
    482/safety.json
```

The operator configures a repository and PR query, explicitly activates the
collection mount, and opens two Yash/RPC sessions. Each session can browse the
same bounded PR snapshot and write an independent artifact under the
corresponding `notes/<number>/` directory. The durable `source.json` records
the source provider/resource/revision/freshness for that note set; it remains
meaningful if a later query refresh removes the PR from `source/`. `inspect
source/pulls/482/diff.patch` and `provenance.json` answer what was reviewed and
when. A local model client can act as one reviewer, but no agent runtime,
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
