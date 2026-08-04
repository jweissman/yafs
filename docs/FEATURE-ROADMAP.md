# Yafs feature roadmap

This file tracks implementation sequencing. The product decision, use cases,
and acceptance-level milestones live in [ADR.md](ADR.md).

The committed delivery horizon ends at durable traces of external artifacts.
Cache, agents, remote multi-user service, and runtime execution are gated
extension hypotheses; they are not implied commitments merely because they are
listed below.

## Product thesis

Yafs is a virtual filesystem service whose directories can acquire explicit
provider views. A user can browse, inspect, and compose ordinary-looking
paths, then preserve the exact external artifacts they acted on. Providers may
separately expose named, typed actions through Yash and RPC. Mounting a view
never implies authority to invoke an action.

The stable center is the VFS. The shell, network transports, and plugins are
clients of it.

Yafs is a composable workspace server, not a POSIX shell implementation. Yash
is the human-facing command client; a structured RPC/API is equally first-class
for scripts, services, and agents.

```text
Yash / loopback RPC / later SSH adapter
          |
       shell session
          |
  VFS kernel: paths, nodes, links, identity, mounts, metadata
          |
  local store | collection views | reconciled resources | adapters
```

## Non-goals for the first releases

- A POSIX-compatible shell or a general-purpose container runtime.
- Implicit host access from a virtual path.
- Running arbitrary plugin code merely because a directory is listed.
- Making a remote filesystem behave identically to a host filesystem for every
  native utility.

Those are useful later possibilities, but each needs an explicit security and
execution model.

## Illustrative future: an agent-backed directory

An `agents` plugin could make a small, inspectable workspace around a
long-lived workflow. It should expose files, not hide a proprietary state
machine. This is deliberately an illustrative direction, not a current
provider configuration contract or a promise that writing `prompt.md` starts a
process; M7 must define that controller lifecycle first.

```text
/work/bug-184/
  .yafsmeta
  prompt.md
  context/
    issue.md
    reproduction.txt
  runs/
    2026-07-30T1412Z/
      status.json
      transcript.ndjson
      patch.diff
      artifacts/
  output/
    summary.md
```

```yaml
# /work/bug-184/.yafsmeta
mounts:
  - id: reviewer
    path: agents/reviewer
    provider: agent
    config:
      prompt: prompt.md
      context: [context]
    capabilities: [model.invoke]
```

From the Yafs REPL, a realistic first interaction could be:

```sh
yafs:/work/bug-184$ ls
agents  context  prompt.md
yafs:/work/bug-184$ agent start agents
run: 2026-07-30T1412Z
yafs:/work/bug-184$ cat agents/runs/2026-07-30T1412Z/status.json
{"state":"running","step":"reproducing"}
yafs:/work/bug-184$ agent send agents "Try the smaller reproduction first."
yafs:/work/bug-184$ cat agents/output/summary.md
```

`agent start` and `agent send` are Yafs commands backed by the plugin. The run
state, transcript, and output remain ordinary virtual files. This makes the
important questions answerable with normal filesystem operations: what ran,
what it was allowed to read, and what it produced.

## Shell contract

Yafs should be shell-like, not claim POSIX conformance. It can deliberately use
the familiar POSIX spelling where it has the same meaning:

| Input | Meaning |
| --- | --- |
| `echo hello` | Invoke a command with literal words. |
| `echo "$USER"` | Expand a session variable within a quoted word. |
| `echo $((2 + 2))` | Planned canonical spelling for integer arithmetic expansion. |
| `echo $(cat /notes/today.md)` | Run a nested Yafs command and substitute captured stdout. |
| `cat /a | select error` | Planned pipeline syntax; not implemented. |

In POSIX, `$()` is command substitution: it runs the enclosed command and
replaces the construct with the command's standard output (with trailing
newlines removed). `$((...))` is arithmetic expansion. The parentheses are
therefore not a generic `eval` mechanism; the extra pair disambiguates
arithmetic from a nested command. A parenthesized command group, `( command )`,
is a separate shell construct. [POSIX Shell Command Language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html)

Today’s parser builds arithmetic and command-substitution AST nodes before
execution. `$((...))` evaluates integer arithmetic; bare `$(...)` executes a
nested Yafs command only during word expansion, captures stdout without trailing
newlines, and discards nested session/VFS mutations. It also works as a part
of a double-quoted word. Pipes remain later grammar work.

The eventual parser should build this shape before execution:

```text
Command(name="echo",
  words=[Literal("total="), Arithmetic(Binary("+", Number(2), Number(2)))])
```

Then a separate expansion/execution phase evaluates words against a `Session`
(cwd, variables, identity, streams, and VFS handle). Never pass user input to
JavaScript `eval`, a host shell, or a plugin runtime to implement parsing.

### First grammar boundary

Implement these, in order:

1. Practical words and paths: `-`, `_`, `.`, absolute paths, whitespace, and
   single/double quotes.
2. Command AST and word parts: literal, variable expansion, arithmetic
   expansion, and bare command substitution as distinct AST nodes.
3. Built-in command dispatch and useful errors with source locations.
4. Pipes and redirection only after streams have a settled type/encoding model.

Do not add globbing, shell functions, `for`/`if`, aliases, job control,
backticks, or full POSIX word splitting in the first shell. Quoting and command
substitution are already enough complexity; POSIX expansion ordering is subtle.

### POSIX is a reference, not a target

POSIX shell conformance is much larger than recognizing `>` and familiar command
names. It includes shell grammar and quoting, parameter/command/arithmetic
expansion, field splitting and pathname expansion, functions and compound
commands, pipelines and redirections, command search, exit status, asynchronous
lists, interactive job control, signal/trap behavior, and defined execution
environments. The standard also defines a large set of utilities separately.
[POSIX Shell Command Language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html)

Yafs should instead publish a small command-language contract. Borrow spellings
where their behavior is genuinely equivalent: `cat`, `ls`, `cd`, `pwd`, `mkdir`,
`echo`, and `>` are good examples. Do not reserve the word “POSIX” or accept a
POSIX script as input until the full semantics are intentionally implemented.

For automation, Yafs must offer both a small, documented command language and
a structured RPC/API. Scripts should not have to scrape terminal output, and
the shell should not become the only way to operate the service.

## VFS composition comes first

Symlinks and union mounts are core VFS mechanisms, not plugins. They are what
let a Git mirror, cache, agent workspace, or eventually a machine workspace be
composed into a useful tree.

### Symlinks

Represent a symlink as a node whose payload is an uninterpreted target path.
Path resolution, not directory listing, follows it. `lstat` must expose the
link itself; `stat`, `cat`, and `cd` follow it. Start with a bounded link-depth
limit and clear loop errors. Relative targets resolve relative to the link's
parent, not the session cwd.

### Union mounts

Start with a **read-only, ordered union**. A mount has named layers and lookup
uses the first layer containing the path; directory listings merge unique names
in layer order. Expose the winning layer and every shadowed candidate through
an inspection command, rather than concealing precedence.

```text
/workspace = union([scratch, generated, git:main])

lookup /workspace/config.yml -> scratch/config.yml, if present
otherwise                    -> generated/config.yml
otherwise                    -> git:main/config.yml
```

Do not add union writes until the policy is explicit. Copy-up into a writable
upper layer is likely the right eventual behavior, but deleting a lower-layer
name needs tombstones and conflict rules. That is a valuable later milestone,
not a default side effect.

## Command execution boundary

There are two different things that should not share an ambiguous `git status`
spelling at first:

1. **Yafs commands** operate through the VFS API. `cat`, `ls`, `cd`, `mount`,
   `agent`, and plugin-provided commands belong here.
2. **Host commands** use `execve` and only understand host paths. They need an
   explicit bridge.

For a Git-backed mount, prefer a plugin command or virtual files:

```sh
yafs:/repos/yafs$ git status .
# dispatched to the git plugin; reports its mirror state
```

If native Git is required, make the boundary visible and controlled:

```sh
yafs:/repos/yafs$ host exec --mount /repos/yafs -- git status
```

The bridge materializes a read-only snapshot in a private host directory,
executes an allowlisted tool, streams output, and deletes the snapshot. Writes
need a separate, transactional import step. This is safer and more honest than
pretending the host process can see Yafs paths.

POSIX shells themselves resolve commands among shell functions, built-ins, and
executables. Yafs can borrow the idea of ordered resolution, but should have a
small explicit registry: built-ins first, an enabled plugin command next, then
the opt-in host bridge. [POSIX command search and execution](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html)

## Plugin model

Each mount declares a provider, configuration, and granted capabilities in
`.yafsmeta`. Plugin discovery must be separate from activation; merely finding
metadata should not start an agent, clone a repository, or launch a container.

```ts
interface VfsProvider {
  manifest: { name: string; version: string; capabilities: Capability[] }
  mount(config: unknown, context: MountContext): Promise<Mount>
}

interface Mount {
  stat(path: RelativePath): Promise<Node | undefined>
  list(path: RelativePath): AsyncIterable<DirEntry>
  read(path: RelativePath): AsyncIterable<Uint8Array>
  write?(path: RelativePath, input: AsyncIterable<Uint8Array>): Promise<void>
  command?(name: string, invocation: Invocation): Promise<CommandResult>
}
```

Design checkpoints for every plugin:

- Declared configuration is validated before activation.
- Access is scoped to the mounted subtree and explicit granted capabilities.
- Reads, writes, network fetches, and process launches are auditable events.
- Mount state can be inspected, refreshed, and unmounted predictably.
- Failures are represented as filesystem/command errors, never silent omissions.

## Milestones

### Current status

- M0 and M1 are complete for local nodes: the in-memory tree supports canonical
  paths, symbolic links (including loop detection), read-only ordered unions,
  and `origins` inspection; commands return typed result/error/session data.
- M2 is substantially implemented: Yash has client-local persisted history,
  readline up/down navigation, Ctrl-R lookup, last-token virtual-path
  completion, `PROMPT`, `-c`, and `--json` result output. Completion and JSON
  CLI ergonomics remain deliberately modest.
- M3 is complete: loopback `yafsd`/`yash`, per-connection sessions, a usable
  `yash --local` development mode, versioned/bounded protocol frames,
  checksummed sync-before-apply operations, recovery, snapshots, and an
  exclusive data-directory lock are covered by integration tests. `yafsd`
  manages foreground and detached lifecycle through its data directory.
- M4 and M4.5 are complete for the read-only fixture: `.yafsmeta` is strict
  YAML with unknown-field rejection; validate, activate, refresh, and unmount
  are explicit. A bounded snapshot is durably recorded before publication;
  direct reads, links, unions, provenance, recovery, and unmount use that one
  resolver path. Provider writes, grants, and external providers remain
  follow-up work. Command substitution is implemented as a deferred nested-
  command AST, including inside double quotes; pipes remain later work.
- M5 is mechanically complete: the GitHub provider, named network/secret
  grants, daemon-scheduled and explicit refresh, and `trace` source bindings
  are implemented and were exercised against a real GitHub Enterprise Cloud
  repository, including real authentication failure modes. What M5 has not
  yet produced is the evidence its own extension gates ask for — repeated
  real use across sessions, not one — which is the actual open question
  before M6/M7 are worth starting, not anything left to build in M5 itself.
- `yafs-mcp` is a local stdio client of `yafsd`, not a provider or a second VFS
  implementation. Its current tools are `yafs.list`, `yafs.read`, and
  `yafs.inspect`; arbitrary shell execution, MCP writes, and public access are
  deliberately absent.

### M0 — Foundation: composable in-memory filesystem

Completed checkpoint: a persistent `Yafs` instance can create directories/files, resolve
canonical paths (`.`, `..`, absolute and relative), and list/read/write them
through one VFS API. Add `symlink`, `readlink`, `stat`, and `lstat`; tests cover
relative links, absolute links, and loop detection. Add read-only ordered union
mounts with deterministic lookup/listing and introspectable shadowing. Errors
distinguish not-found, not-a-directory, link loop, and access denied.

Implementation order: define the node/path resolution contract; add symlink
resolution with a depth limit; implement a read-only in-memory provider; then
compose providers with the ordered union. Do not add copy-up or union writes in
M0.

### M1 — Command and session contract

Checkpoint: every invocation produces a typed result with `stdout`, `stderr`,
status, structured error information, and updated session state (identity,
cwd, and revision/mount context when available). The same result is returned
through Yash and RPC.

Implemented: `help`, `version`, `whoami`, `mounts`, `inspect`, the existing VFS
commands (`pwd`, `cd`, `ls`, `cat`, `stat`, `lstat`, `readlink`, `origins`,
`mkdir`, and `ln`). Add `printf` as the exact output primitive; define `echo`
as a documented convenience. The parser still returns a typed AST with no
parse-time side effects. Add quoted words and variables before command
substitution, pipes, or broad POSIX compatibility.

### M2 — Interactive Yash UX

Implemented baseline: Yash has client-local, persisted history; up/down navigation;
Ctrl-R reverse search; and completion for commands and virtual paths. The
server exposes session state such as cwd, user, mounts, and revision; Yash
renders it through a configurable `PROMPT` template. Keep history and terminal
editing client-side, while a `history` command may expose an explicit,
redacted session history for introspection. Add `yash -c` and a structured
JSON result output for `-c`. The internal protocol is JSON-lines; a dedicated
public JSON-lines CLI mode remains an explicit automation follow-up.

### M3 — Service and client boundary

Completed checkpoint: a long-lived `yafsd serve` process owns a VFS
instance and exposes a versioned loopback-only local RPC protocol. A thin `yash` CLI creates a
session, sends one parsed command or input line at a time, and renders stdout,
stderr, and status. Add authentication before exposing the protocol beyond the
local machine. `yash --local` remains an in-process development mode.

`yash --local` creates an ephemeral private VFS in the CLI process: it has no
socket, daemon, or journal. Its colored default prompt labels that mode `local`;
the normal client labels the connected loopback endpoint (`host:port`). The
endpoint is intentionally shown rather than a PID: the client is connected to a
service endpoint, not entitled to manage an arbitrary local process.

`yafsd serve` is the explicit foreground process. `yafsd start`, `stop`,
`restart`, and `status` manage one detached local process without relying on a
shell backgrounding trick. The resolved data directory holds `daemon.json`,
`daemon.log`, and the journal; stale state is removed after its recorded PID is
gone. A live state or journal lock refuses a second owner. A system service
manager may still supervise `serve` directly.

Persist canonical VFS operations as an append-only journal and replay them at
startup. M3 uses this contract:

```text
validate → append committed record → sync → apply in memory → respond
```

Each record carries a protocol/schema version and checksum. The data directory
is locked; snapshots compact every bounded number of operations. A torn final
record is truncated during recovery, while corruption before the final record
refuses startup. SQLite remains a later implementation option, not a
prerequisite.

This proves Yafs can be used as a cache, router/proxy, scripting target, agent
hub, or chat backend: they all speak the same VFS/session API rather than each
embedding the filesystem. Build SSH or Telnet as adapters over that session API,
not as part of the kernel. SSH is the sensible first remote transport; Telnet is
only worth adding for an intentionally retro or constrained client use case.

### M4 — Mount/provider contract

Checkpoint: a fixture provider is mounted through a strict, schema-validated
`.yafsmeta` declaration. Discovery does not activate it; activation receives
only its configured subtree and granted capabilities. Mount state, refresh,
unmount, provenance, and capability use are inspectable and auditable.

### M4.5 — Published snapshot resolver

Completed fixture checkpoint: replace the fixture's split direct-provider/materialized-copy paths
with one synchronous resolver over published snapshots. Provider I/O occurs
only during explicit activation or refresh, which builds a detached snapshot
and atomically publishes it with node-level provenance and read-only metadata.
Recovery, direct reads, symlinks, unions, `inspect`, unmount, and refresh now
all observe the same snapshot revision. This is a correctness milestone, not
GitHub work.

The narrow VFS usability pass now includes `grep -n PATTERN PATH...`,
`head`, `tail`, and `wc -l` over virtual files, plus parser-checked read-only
MCP query execution. These aid review and MCP dogfooding without claiming
pipelines, globbing, or POSIX text semantics.

### M5 — Collaborative review room

Checkpoint: expose a filtered GitHub PR collection as a read-only source
subtree, with PR numbers as virtual child paths. Compose it with durable local
notes keyed by PR. Two independent sessions—human or model client—must be able
to inspect the same source revision, write separate review artifacts, and leave
an inspectable source revision/freshness trail. Do not depend on host Git,
GitHub writes, autonomous agent loops, or public MCP.

The declaration names a repository and PR query, never one PR. Explicit refresh
atomically publishes the next whole matching collection. Each refresh reports
its source revision and freshness. A durable `notes/<number>/` source capture
is available through `trace` and can be reconstructed through `reify` (see
"Trace capture and reification" in the ADR). GitHub traces carry the PR head
SHA rather than only the collection digest. The daemon runs durable interval
refresh through the normal WAL publication path and retains the last snapshot
when a fetch fails. Its due-time/restart acceptance test remains the final M5
check.

Prerequisite: complete M4.5's published-snapshot resolver contract. GitHub
adds an external collection provider to that proven kernel; it does not create
an alternative namespace or refresh path.

Pipes remain a language increment after typed stream contracts are designed.

The M5 foundation includes a local-only `yafs-mcp` adapter as a separate client
executable. It currently exposes read/list/inspect only; a future structured,
mount-scoped local-note write tool must not accept unrestricted shell strings.
It does not expose provider activation. Dogfooding it against Yafs's own roadmap is
an acceptance exercise for the structured API, not a reason to widen authority.

## Near-term provider and surface candidates

Recorded for sequencing discipline, not as a committed batch: everything here
was checked against the same question every earlier idea in this document was
checked against — does it reduce to primitives already decided (collection
projection, reconciled resource, `ctl`, the adapter-client pattern), or does
it need something genuinely new? Most of it reduces cleanly. The two items
that don't are called out as such, deliberately not sequenced alongside the
rest.

**Ready — no new primitive needed:**

- **Slack provider.** Channel mirroring is the same collection-projection
  shape the GitHub provider already proved; posting a comment is a `ctl`
  action, same mechanism as `gh comment`. Nothing about this is new design.
- **CSV `db` provider.** Rows are resources under a mount, same shape as PRs
  under GitHub — browsable with zero new primitives. See "Capabilities,
  distribution, and adapters" in the ADR for why this stays a collection
  projection and not a step toward simulating an RDBMS.
- **A local-only webui.** Not a multi-user or remote feature — it talks only
  to the operator's own `yafsd`, same trust model Yash already has. The one
  real piece of new plumbing is a thin adapter process bridging HTTP (or a
  WebSocket, for something that feels live) to the existing loopback RPC,
  exactly the shape `yafs-mcp` already is, just a different wire format. Once
  that bridge exists, a static htmx/tailwind frontend over it is a reasonable,
  cheap choice.
- **Local multi-agent group chat.** Deliberately *not* relayed through Slack:
  a shared local append-only log (`chat/room/messages.ndjson`) that several
  agent directories and a human read and append to needs no external-provider
  write authority at all — it sidesteps the durable-intent/idempotency-key
  machinery real remote writes need, because nothing here leaves the local
  store. Buildable as repeated one-shot `model.invoke` calls (see the M7
  section above) — each agent's "turn" reads recent history and optionally
  appends — without needing the recursive tool-use orchestrator that real M7
  requires. This is close to assembly of pieces already decided, not new
  design, and is worth treating as the actual near-term target it looks like.

**Ready, but a distinct engineering task, not a rider on the above:**

- **Redis/S3 compatibility.** Wire-protocol gateway versus cache-shaped Yash
  commands are different projects with different value — see "Capabilities,
  distribution, and adapters" in the ADR for the distinction and why it
  matters. Bounded and buildable, sequenced after M6, not folded into it.

**Deliberately not sequenced — new capability class, only build when a
concrete need forces the question:**

- **Docker / container support** covers two distinct ideas, worth keeping
  separate since they carry different risk:
  - *Standing up long-running containers* (services, a mini-k3s-shaped
    workspace). The mounting half — materializing a resolved mirror of the
    composed tree into a private host directory for a container to
    bind-mount — reuses the existing M9/`SnapshotMaterializer` mechanism; see
    the ADR. The blocker is the container-execution capability itself, not
    the mount.
  - *Resolving a command name to a container image*, so `imagemagick convert
    ...` runs a declared image and returns stdout/stderr/exit status exactly
    like a native command. This needs explicit, non-speculative declaration
    per command (a `.yafsmeta`-style manifest naming the image, requested
    like any other capability) — never resolving an arbitrary typed word
    against a registry, which would reopen the "no ambient host executable
    lookup" line this design has held since the first version of the shell
    contract. If pursued, stage it: read-only, stdout-only commands first
    (no VFS writes); a container that produces file output is a distinctly
    harder second step needing the staged-import machinery invariant 7
    already requires and nothing has designed yet; long-running/stateful
    containers are a third step past that.

  Both need the same new capability class (`container.run`-shaped, naming an
  allowlisted image/registry and resource limits) that doesn't exist yet, and
  the risk compounds if either is ever looped recursively through an agent.
  Hold both until a concrete need forces the question, not because they're
  interesting.

### M6 — Durable artifacts and traces *(decision gate)*

Checkpoint: a source subtree can be captured as a versioned `trace.json` plus
content-addressed blobs, then `reify`d after the provider refreshes or is
unmounted. Blob bytes are synced before the WAL record that names them;
startup rebuilds live references from durable traces before an explicit,
serialized GC can reclaim anything. The command never falls back to the
current provider view when a historical blob is missing.

**Foundation implemented.** The remaining M6 decision is whether a real
provider-specific point reifier earns its network/capability surface; the
generic reference-only hook is exercised without allowing a fallback to the
current collection mount.

The shared blob store is deliberately provider-neutral: `put(bytes) ->
digest`, `get(digest) -> bytes | undefined`, `retain`/`release(digest,
ownerId)`, and a `gc()` that reclaims zero-reference blobs. It is durable
content substrate, not a cache API.

### M6.1 — Cache provider *(decision gate)*

Checkpoint: durable local TTL entries have atomic replacement, expiry metadata,
size/eviction limits, and concurrent-write tests. The cache accepts explicit
caller-populated values; it does not silently become an upstream mirror.

### M7 — Agents plugin *(decision gate)*

Checkpoint: `agent start`, `agent send`, and `agent stop` manage a durable run;
the prompt, allowed context, transcript, state, and generated artifacts are
visible as files. Restarting the service recovers or clearly marks interrupted
runs. The plugin has no implicit host-process or network capability.

Before this gate, a much smaller experiment is worth running: a one-shot
`ctl`-triggered `model.invoke` action against a real local model (no run
lifecycle, no recursive tool use — prompt in, text recorded out) is cheap
relative to the full checkpoint above and answers the actual open question,
whether an autonomous pass ever produces something worth reading, before
committing to the orchestrator a real agent loop needs. See "A cheap
experiment before the M7 decision gate" in the ADR.

### M8 — Remote/multi-user service *(decision gate)*

Checkpoint: an authenticated API/SSH transport supports per-user sessions,
authorization, mount visibility rules, quotas, and audit events. The initial
local-operator service is intentionally not a public endpoint.

### M9 — Runtime bridge *(decision gate)*

Checkpoint: an administrator-controlled, allowlisted `host exec` can run a
tool against a read-only materialized mount snapshot. It records command,
identity, snapshot revision, exit status, and output. Importing writes requires
an explicit staged change set, a matching base revision, conflict checks, and
an explicit commit command; no runtime write mutates the VFS implicitly.

#### Machine/image provider — later runtime specialization

Checkpoint: an explicit `machines/` or `images/` mount exposes declared image
definitions and a volume subtree. The plugin can build or run only after its
manifest grants process/image-registry/network capabilities. Its input volume
is a VFS snapshot or a materialized union, and its output is imported through a
declared mount—not an implicit host bind mount.

```text
/deployments/site/
  .yafsmeta
  image/                 # build context or image reference
  volume/                # files exposed to the workload
  run/                   # status, logs, ports, artifacts
```

## M5 design gate

Before implementing the GitHub source provider, turn its named network grant,
secret-reference policy, Unicode path boundary, revision/freshness metadata,
bounded snapshot behavior, and explicit refresh into code and acceptance tests.
