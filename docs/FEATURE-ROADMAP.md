# Yafs feature roadmap

This file tracks implementation sequencing. The product decision, use cases,
and acceptance-level milestones live in [ADR.md](ADR.md).

The committed delivery horizon now extends through M6.5 — local durable
cache, the agent runtime, bounded agent tool access, and the durable Slack
bridge are implemented and tested (see "Current status" below), not
hypotheses. Remote multi-user service (M8), runtime execution (M9), and
federation remain genuinely gated extension hypotheses; they are not
implied commitments merely because they are listed below.

Yash has a linked language track in [LANGUAGE-ROADMAP.md](LANGUAGE-ROADMAP.md).
L0 (the typed command boundary) and L1 (workspace literacy) are planned paving
stones before broader MCP or web surfaces; later script, iteration, and pipeline
work is evidence-gated rather than an implicit POSIX-compatibility commitment.

## Product thesis

See [PRODUCT-SPEC.md](PRODUCT-SPEC.md#purpose) for the full product
thesis and long-range direction; this file only needs the structural
summary below to frame sequencing. Yafs is a virtual filesystem service
whose directories can acquire explicit provider views. A user can browse,
inspect, and compose ordinary-looking paths. Providers may separately
expose named, typed actions through Yash and RPC. A provider is a
composition of a published view, optional resource layout, and optional
actions; mounting a view never implies authority to invoke an action.

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

The built-in `agent` provider now proves the narrow one-shot action slice:
personas publish prompts, `agent send` durably accepts a request, and the run
records queued/running/terminal state. The layout below is still a future,
long-lived workflow shape. It should expose files, not hide a proprietary
state machine; M7 must define its controller lifecycle before it is promised.

```text
/work/bug-184/
  agents/reviewer/
    prompt.md
    runs/
      2026-07-30T1412Z/
        status.json
        transcript.ndjson
        patch.diff
        artifacts/
```

```yaml
# yafs.plugins.yaml — host-side, outside the VFS; see COMMANDS.md
version: 1
plugins:
  - id: reviewer
    path: agents/reviewer
    plugin: agent
    config:
      personas:
        reviewer:
          prompt: "You are a careful reviewer."
    capabilities: [chat.completion]
```

(In-VFS `.yafsmeta` plugin configuration was removed as a security fix —
see "Current status" below and the ADR — `yafs.plugins.yaml` selected by
`yafsd --config` is the only way to grant a capability now.) From the Yafs
REPL, a realistic first interaction could be:

```sh
yafs:/work/bug-184$ agent send agents/reviewer --context context/issue.md "Review the reproduction."
accepted: agents/reviewer
yafs:/work/bug-184$ cat agents/reviewer/runs/2026-07-30T1412Z/status.json
{"state":"running","step":"reproducing"}
yafs:/work/bug-184$ cat agents/reviewer/runs/2026-07-30T1412Z/response.md
```

`agent send` is a Yafs command backed by the provider. The run
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
nested **read-only** Yafs command only during word expansion and captures
stdout without trailing newlines. A session, mutation, control, or provider
action is rejected before it runs; queue restoration is not treated as a
security boundary. It also works as a part of a double-quoted word. Pipes
remain later grammar work.

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

Each mount declares a provider, configuration, and requested capabilities in
host-side `yafs.plugins.yaml`, selected by `yafsd --config` — there is no
in-VFS way to declare or activate one. A provider package contributes declarative metadata, snapshot
preparation, and (where applicable) resource/action definitions. The kernel
continues to own VFS mutation, path resolution, grants, journal commits,
auditing, and lifecycle transitions. Plugin discovery must be separate from
activation; merely finding metadata should not start an agent, clone a
repository, or launch a container.

```ts
interface ProviderDefinition<Config> {
  manifest: { name: string; version: string; capabilities: Capability[] }
  validate(config: unknown): Config
  prepare(config: Config, context: PrepareContext): Promise<PublishedSnapshot>
  layout?(config: Config): ResourceLayout
  actions?(config: Config): ActionDefinition[]
}

interface ActionDefinition {
  name: string
  capability: Capability
  request: RequestSchema
  accept(request: unknown, context: ActionContext): Promise<AcceptedAction>
}
```

The current built-in contract is deliberately smaller: a compositional
`ProviderDefinition` names a provider, declares its capabilities, and prepares
its bounded published snapshot. Strict manifest validation remains kernel-owned.
The agent provider is the first consumer of the optional layout/action seam;
its `ctl` request and Yash adapter are typed today, but provider-defined action
metadata has not yet become a package ABI. This avoids promising a third-party
plugin inheritance hierarchy before built-in providers establish the right
boundaries.

`ResourceLayout` describes provider-owned files such as a persona's
`prompt.md`, `runs/`, and status artifacts. `ActionDefinition` describes the
typed request that the kernel must durably accept before background work may
begin. Yash pseudobinaries and MCP tools are adapters over these definitions;
they are not a second provider mechanism. A provider action can never mutate
the VFS directly or bypass its mount scope.

Design checkpoints for every plugin:

- Declared configuration is validated before activation.
- Access is scoped to the mounted subtree and explicit granted capabilities.
- Reads, writes, network fetches, and process launches are auditable events.
- Mount state can be inspected, refreshed, and unmounted predictably.
- Failures are represented as filesystem/command errors, never silent omissions.

## Milestones

### Current status

"Complete" below means the delivery gate is mechanically met — implemented
and tested. It is not a claim that the product decision is validated; that
requires someone repeatedly preferring this review loop to existing tools,
which is separately tracked, not implied by a milestone checkbox.

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
  grants, daemon-scheduled and explicit refresh, and `capture`/`restore`
  source bindings are implemented and were exercised against a real
  GitHub Enterprise Cloud repository, including real authentication failure
  modes.
- M6/M6.2/M6.3 are complete: the agent runtime (durable acceptance, streaming
  runs, cancellation, restart interruption), the compositional provider/
  plugin registry, and canonical `plugins`/`plugin` configuration vocabulary
  are implemented and regression-tested. In-VFS plugin configuration
  (`.yafsmeta` + `plugin validate|activate|refresh`) has been removed
  outright, not just superseded; `yafs.plugins.yaml` is the sole way to grant
  a capability.
- M6.4 (durable outbound actions) is **implemented**: `slack send` and the
  inbound bridge's replies both accept into a durable per-action outbox
  (`outbox/<id>/{message.md,status.json}`) before the ctl write is
  acknowledged, transition `queued → running → succeeded|failed`, and are
  swept to `unknown` (not retried, not dropped) on restart if a post was
  in flight — matching the same accept-then-transition durability pattern
  as `AgentRunStore`, but with `unknown` instead of `interrupted` on
  recovery, since a half-sent Slack post may already have landed. See
  `SlackOutboxStore`/`SlackOutboxStatus`/`SlackOutboxRecovery` and
  `test/e2e/SlackOutboxRecovery.test.ts` for the exercised recovery paths.
- M7.0 (a bounded, explicit-invocation, single-persona local conversation,
  plus a one-way Slack bridge into it) is **complete** — full M7 (durable
  multi-speaker semantics plus a deliberate orchestration decision) is not
  yet begun; see the M7.0 checkpoint below and the ADR's "M7 decision"
  section for what shipped versus the original channel design.
- M6.5 (bounded agent evidence tools) is **implemented**: a tool-enabled
  persona's requests go through LM Studio's native `/api/v1/chat` +
  `integrations` mechanism (LM Studio drives its own tool loop; Yafs never
  parses `tool_calls` itself) against `AgentToolServer`, a persistent MCP
  HTTP listener `yafsd` starts itself — one URL per mount/persona, no
  manual LM Studio-side registration — enforcing an operation allowlist,
  root scoping, and byte/call/deadline budgets in code, scoped per MCP
  session. See the M6.5 checkpoint below. **Its live-validation gate is now
  met**: a real LM Studio persona, not a fake one, used the loop end to end
  against a live GitHub PR collection and returned an accurate,
  evidence-cited recommendation — see "Review radar proof — achieved"
  below. M6.6 (runtime-overlay/registry consolidation) and M6.7 (scheduled
  review digest, the reviewer's recommended "second flow") are both named
  and scoped, not yet built.
- `yafs-mcp` is a local stdio client of `yafsd`, not a provider or a second VFS
  implementation, and its surface is **bounded local operations, not purely
  read-only** — alongside the L0/L1 workspace operations (`yafs.list`/
  `yafs.read`/`yafs.inspect`/`yafs.query`/`yafs.tree`/`yafs.find`/`yafs.test`/
  `yafs.diff`/`yafs.grep`) it also exposes `yafs.capture`/`yafs.restore`,
  which are durable local mutations, reasonable for a trusted local operator
  but deliberately excluded from `AgentToolServer`'s agent-facing allowlist.
  Arbitrary shell execution, MCP writes beyond capture/restore, and public
  access are deliberately absent from both.

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

**Later removal:** the in-VFS `.yafsmeta` declaration + `plugin
validate|activate|refresh` lifecycle described above was the sole activation
mechanism through M4/M4.5, then removed entirely as a security fix once
external providers made it possible to grant real capabilities this way —
see M6.2/M6.3's "later removal" note and the ADR's "Capabilities,
distribution, and adapters" removal policy. Host-side `yafs.plugins.yaml` is
now the only way to activate a plugin instance.

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
is available through `capture` and can be reconstructed through `restore`
(originally named `trace`/`reify`; see "Trace capture and reification" in
the ADR for the decision record, and LANGUAGE-ROADMAP.md's "Implemented L1
slice" for the rename to current vocabulary). GitHub captures carry the PR
head SHA rather than only the collection digest. The daemon runs durable
interval refresh through the normal WAL publication path and retains the
last snapshot
when a fetch fails. Its due-time/restart acceptance test remains the final M5
check.

Prerequisite: complete M4.5's published-snapshot resolver contract. GitHub
adds an external collection provider to that proven kernel; it does not create
an alternative namespace or refresh path.

Pipes remain a language increment after typed stream contracts are designed.

The M5 foundation includes a local-only `yafs-mcp` adapter as a separate client
executable — at M5 it exposed `read`/`list`/`inspect` only; see "Current
status" above for its full present-day tool set (`tree`/`find`/`test`/
`diff`/`grep`/`capture`/`restore`/`query` added since). It does not expose
provider activation. Dogfooding it against Yafs's own roadmap is an
acceptance exercise for the structured API, not a reason to widen authority.

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
- **Single-agent synchronous chat (`agent chat`) — implemented.** A live,
  multi-turn conversation with one named persona (defaulting to the sole
  configured persona if only one exists), structured as a real
  `[{role, content}, ...]` message array via `ChatCompletionClient.
  completeChat`, not the flattened `message + context` string `agent send`
  builds without `--chat`. Turns accumulate at
  `NAME/chats/<chat-id>/messages.ndjson`; each still produces a
  `runs/<run-id>/` entry for provenance, same durable-run invariant as every
  other agent action. Streaming turned out not to need the RPC protocol
  change this entry originally assumed: the model is always called with
  `stream: true`, and `response.md` is republished incrementally (~100ms
  cadence) via the same durable-write mechanism fixture streams already
  proved — a client observes growth by re-reading the file, no
  request/response-per-chunk primitive required. `agent chat` is a
  client-side yash feature (`src/yash/chat.ts`), not a server command; see
  `test/e2e/AgentChatTurn.test.ts`.
- **Local multi-agent group chat — deferred behind the above.** A shared
  local append-only log (`chat/room/messages.ndjson`) that several agent
  directories and a human read and append to still needs no
  external-provider write authority and sidesteps the durable-intent/
  idempotency-key machinery real remote writes need. But it surfaces a real,
  unresolved question the single-agent case doesn't have: other agents in the
  room aren't naturally `system`/`user`/`assistant` in the chat-completion
  role model, and a persona must not confuse another agent's turn for its
  own. Single-agent `agent chat` is solid now; the role-representation
  question gets a real design pass once that foundation exists, not before.

**Ready, but a distinct engineering task, not a rider on the above:**

- **Redis/S3 compatibility.** Wire-protocol gateway versus cache-shaped Yash
  commands are different projects with different value — see "Capabilities,
  distribution, and adapters" in the ADR for the distinction and why it
  matters. Bounded and buildable, sequenced after M6, not folded into it.
- **`yafs-mcp` as an HTTP service, with write tools.** `yafs-mcp` is
  currently a local stdio client exposing only `yafs.list`/`yafs.read`/
  `yafs.inspect` — read-only, and not reachable by anything that expects an
  HTTP MCP server (LM Studio's `integrations` envelope, for one). Recorded
  here as a known, real gap, not sequenced yet: it needs the same
  HTTP-adapter-over-loopback-RPC bridge the local webui candidate above
  needs, plus a write-capable tool boundary that doesn't just hand an MCP
  client the same authority as a `yash` session (today `yafs.query` explicitly
  refuses every mutating command, including `ctl`, for exactly this reason).
  Real token streaming for MCP responses would need its own solution here —
  the durable-file-plus-polling approach `agent chat` uses works because the
  client already has a full command surface to poll with; an MCP tool
  response doesn't have that same shape. An agent recursively calling back
  into Yafs over MCP is the concrete "real demo" this unlocks, but it's
  gated behind both pieces existing.

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
content-addressed blobs, then restored after the provider refreshes or is
unmounted (`trace`/`reify` were the original command names for this at
design time; delivered as `capture`/`restore` — see "Implemented L1
slice" in LANGUAGE-ROADMAP.md). Blob bytes are synced before the WAL record
that names them;
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

### M6.1 — Durable local cache *(decision gate)*

Checkpoint: durable local TTL entries have atomic replacement, expiry metadata,
size/eviction limits, and concurrent-write tests. The cache accepts explicit
caller-populated values; it does not silently become an upstream mirror.

**Implemented local slice:** `cache put/get/stat/delete/gc` stores UTF-8 values
in the shared blob store, records durable metadata in the local VFS, requires
an explicit bounded TTL, and rebuilds active-blob retention on restart. A
typed local JSON-lines request exists for future Ruby/HTTP adapters. It is not
RESP, S3, an upstream cache, active-entry eviction, or a public endpoint.
The next decision is whether repeated external use warrants an adapter—not
whether the cache core needs to imitate another datastore.

### M6.2 — Provider/controller foundation *(delivery gate)*

Checkpoint: built-in providers share a compositional definition for validated
configuration, bounded published layouts, typed actions, required
capabilities, and lifecycle hooks. The daemon owns an explicit desired-mount
configuration outside the virtual tree and can report a side-effect-free
reconciliation plan and apply it idempotently. A default daemon configuration
location makes `plugins plan`, `plugins apply`, and `plugins status` ordinary
client commands; a host file is only an explicit `yafsd --config` deployment
override. Removal is never implicit: reconciliation needs an explicit prune
choice.

The first controller action must be accepted durably before it returns to the
client, then run asynchronously with visible `queued`, `running`, terminal,
and restart-interrupted state. Registration and unregistration are tied to
mount lifecycle, not polling. This gate proves the common mechanism with the
agent provider before adding a provider marketplace or another controller.

**Current wave:** the compositional built-in provider registry, daemon-owned
desired configuration (`yafsd --config` only as a deployment override),
`plugins status|plan|apply [--prune]`, lifecycle-bound agent `ctl` registration,
durable agent acceptance/cancellation/restart interruption, and a
capture → restore → context-bound review run are implemented and regression-tested.
The remaining delivery decision is whether to promote the built-in action
schema into a stable package-facing ABI; it is intentionally not implied by
the current provider object.

### M6.3 — Plugin-instance contract *(pre-M7 delivery gate)*

Checkpoint: the external configuration uses canonical `plugins`/`plugin`
terminology; the daemon reconciles it without exposing host paths to Yash; and
`plugins describe` makes built-in capabilities, typed actions, pseudobinary
adapters, and designed-but-disabled exposure requests inspectable. `union`
remains the VFS composition command. A public HTTP/RESP/S3 listener, package
installation, and a stable third-party ABI are explicitly out of scope.

**Current wave:** canonical configuration and lifecycle vocabulary are being
implemented with a compatibility alias for `mounts`/`provider`. This is the
final terminology and action-boundary cleanup before M7, not a claim that
`yash add` or public plugin endpoints exist.

**Later removal:** `plugin validate|activate|refresh MANIFEST [ID]` — the
in-VFS counterpart to `plugins status|plan|apply`, dating back to M4 — has
since been removed outright, not just renamed. It read a manifest out of the
VFS and activated it through the identical `ProviderRegistry.assertGranted`
capability check host-side `yafs.plugins.yaml` uses, with no session/
authorization concept anywhere to distinguish "write a file" from "grant a
real external credential." Only `plugin deactivate ID` survives, since it
grants no capability. See the ADR's "Capabilities, distribution, and
adapters" removal policy for the full rationale; the still-unscheduled
`mounts:`/`provider:` YAML *key* alias mentioned above is unaffected by this
and remains separately open.

### M6.4 — Durable outbound actions *(implemented)*

Checkpoint: an outbound write to an external system (starting with `slack
send`) records durable intent — an idempotency key and a queued state — before
any network call, not after. A crash between the API call and the durable
record can no longer lose the record of the attempt or double-post on retry.
Status is visible as ordinary queued→running→succeeded/failed/unknown state,
the same shape `agent send` already proved for run acceptance; a generic
action-dispatch path shared between `agent send` and `slack send` is the
target, not two parallel bespoke mechanisms.

**Why this gated M7.0's Slack outbox:** M7.0's local channel adds a Slack
"reply" action on top of `slack send`. Building that before this milestone
would mean the reply path sat in front of a write that could still silently
double-post or lose the record of what it sent — the durability has to
exist under the mechanism before anything (a human approval, an automatic
reply) is asked to trust an action built on top of it.

**Implemented.** Both `slack send` and the M7.0 inbound bridge's reply leg now
accept into a durable per-action outbox (`SlackOutboxStore`, entries at
`outbox/<actionId>/{message.md,status.json}`) before the ctl write returns —
the same accept-then-transition durability `AgentRunStore` already proved for
run acceptance, reusing `PluginDriver`'s optional `recover()` hook (see
`BackgroundDrivers.ts`) via `SlackOutboxRecovery`. A restart sweeps any
`queued`/`running` action to `unknown` rather than `interrupted`, because
unlike a half-finished model call, a half-sent Slack post may already have
landed — retrying would risk a double-post, so the operator is left to check
Slack directly. See `test/e2e/SlackOutboxRecovery.test.ts` for the exercised
recovery coverage.

**Language dependency:** after the capability cleanup, L0 in
[LANGUAGE-ROADMAP.md](LANGUAGE-ROADMAP.md) must make typed effects enforceable
across Yash, MCP, and future web adapters. L1's read/evidence toolbox may run
in parallel. M7 does not require scripts, iteration, or pipelines.

### M7.0 — Local conversation channel *(supervised single-persona spike, complete)*

**Naming split, per review:** calling this milestone "M7" made the ADR's
"exit criterion... is met" read as if M7 overall were done, when what
shipped is a narrower, real thing — a supervised, single-persona,
explicit-invocation spike. **"M7 complete"** is reserved for durable
multi-speaker/message semantics (stable message IDs, structural
attribution beyond a name-prefixed string, a real deduplication
guarantee — see "First stage prototype" below) plus a deliberate
orchestration decision (subscriptions, automatic turn scheduling,
budgets, retries, agent-to-agent conversation) — neither of which this
milestone attempted. Everything below describes what M7.0 actually is.

Checkpoint: a human and named local personas use one durable, append-only
channel — `agent send`/`agent chat`'s persona-scoped `chats/<chatId>/` history
— to review a traced source snapshot, with `--context`/`--chat` giving the
interactive REPL the same context-attach and resume capability the one-shot
command already had. Messages, per-reply runs, chosen context, cancellation,
and terminal state are ordinary files (see the ADR's revised "M7 decision"
section for the exact shape). Restart marks an in-flight reply interrupted.
The channel has no unrestricted or recursive agent authority — M6.5 below
gives a persona a specific, bounded, read-only tool surface; it is never
given a general-purpose MCP connection it can drive however it wants.

**"First stage prototype," not "first stage delivered."** The current chat
history and Slack routing demonstrate the *interaction* — a human and a
persona can hold a durable, resumable exchange — but not yet the durable
message/event *contract* a channel product implies (stable message IDs,
structural attribution beyond a name-prefixed string, a real deduplication
guarantee). Treat this the same way as M0–M6.3 below: mechanically real,
product-unvalidated.

This milestone also added a one-way Slack bridge: a channel configured with
`persona:` in its `yafs.plugins.yaml` entry routes new, non-bot messages to
that persona (one run per message, one continuous history per channel) and
posts the reply back through the ordinary `slack send` path. By default a
message must explicitly `<@mention>` the bot (`requireMention: true`,
implicit); an operator who knows a channel is effectively 1:1 with the bot
can set `requireMention: false` on that mount to drop the requirement — an
explicit per-channel choice, not a global one. It has no implicit
host-process or network authority beyond that single hop; its reply leg now
goes through the durable M6.4 outbox rather than a fire-and-forget post.

**Treat this bridge as a spike, not the architecture to keep.** Review
correctly identified what it discovered: `SlackInboundRouting.ts` directly
imports `AgentPersonaLookup` and constructs an agent ctl request, the Slack
plugin's own config carries `persona:` (a routing policy a provider plugin
shouldn't own), and the poller reads agent-run files and writes Slack's ctl
directly — real cross-plugin coupling, not an architectural decision worth
defending. It proved the end-to-end shape (`Slack message → agent run →
durable response → Slack reply`) is the right demo. M6.5 below and the
"provider-neutral event/workflow boundary" section after it are the seam
this coupling points at — a bounded tool surface for the persona, and
eventually a workflow-binding layer that owns the cross-plugin composition
instead of either plugin knowing about the other — without pre-designing
either before they're needed.

M7 remains deliberately staged. What shipped is explicit-invocation only; the
next decision — earned only by repeated use — covers subscriptions, automatic
turn scheduling, rate/budget limits, retries, and agent-to-agent conversation.
A text exchange alone is not success: the validation must show who said what,
the precise source/context they read, why a reply ran, and how the operator
stopped it — see `test/e2e/AgentChatTurn.test.ts` and the
`test/e2e/SlackInbound*.test.ts` suite. The detailed data and lifecycle
decisions live in the ADR's “M7 decision: local conversation channels”
section.

### M6.5 — Bounded agent evidence tools *(implemented)*

Checkpoint: a persona can investigate, not just receive pasted context. It
gets a specific, bounded tool loop — reusing the exact operation layer
`yafs-mcp` already exposes to Claude Code/Codex (`WorkspaceOperations`
via `LiteracyTools`/`EvidenceTools`: `list`/`read`/`inspect`/`tree`/`find`/
`grep`/`diff`/`test`), not a second, bespoke tool vocabulary invented for
self-hosted models. Yafs does not parse or execute tool calls itself:

```text
Agent model (in LM Studio)
  → LM Studio's own tool-calling loop, driven against a real MCP server
  → AgentToolServer: one persistent MCP-over-Streamable-HTTP listener,
    started by yafsd itself, one URL per mount/persona (no mcp.json, no
    manual registration — the manifest's persona.tools.roots is the whole
    contract)
  → ScopedMcpClient (fresh per MCP session): operation allowlist, root
    scoping, byte/call/time budgets
  → LM Studio returns the finished output array (tool calls + final reply)
  → durable transcript: request, every tool call + bounded result, final reply
```

**Why this shape, not a hand-rolled OpenAI `tools`/`tool_calls` loop:**
`ChatCompletionClient` stays completely untouched — no `tools`/`tool_calls`
parsing, no streaming tool-call delta accumulation, no second copy of
whatever quirks a given model has around tool-call formatting. Instead, a
tool-enabled persona (`persona.tools.roots` in the manifest) talks to LM
Studio's native `/api/v1/chat` endpoint (`LmStudioMcpClient`,
`input`/`system_prompt`/`integrations`/`previous_response_id` in;
an `output` array of `message`/`tool_call`/`reasoning`/`invalid_tool_call`
items out) instead of the OpenAI-compatible `/v1/chat/completions` path —
LM Studio drives its own tool loop against whichever MCP server the
`integrations` field names, the same way any other MCP client would.
Multi-turn threading reuses LM Studio's own `previous_response_id`, not a
resent message history — recorded per-chat at
`chats/<chatId>/lmstudio-response-id.txt`.

**`AgentToolServer` is a standalone, persistent HTTP listener yafsd starts
alongside itself — not a subprocess spawned per run, and not the
unrestricted `yafs-mcp` reused directly.** `yafs-mcp` remains an
operator-facing stdio adapter with a full daemon connection and no scope
of its own — appropriate for Codex/Claude Code, wrong for an unattended
agent run. `AgentToolServer` speaks MCP's Streamable HTTP transport (via
`@modelcontextprotocol/sdk`, used only for the transport/session layer —
tool dispatch still runs through Yafs's own `WorkspaceOperations`/`Tools.ts`)
and serves one URL per mount/persona
(`http://127.0.0.1:<port>/mcp/<mountId>/<personaName>`), resolving that
persona's `tools` config fresh from the live mount on every new MCP
session — no restart needed when config changes. Each session gets its own
`ScopedMcpClient`, which enforces (in code, not left to model good
behavior or to LM Studio's own `allowed_tools` filter alone): a hardcoded
operation allowlist (`list`/`read`/`inspect`/`tree`/`find`/`grep`/`diff`/
`test` only — never `capture`/`restore`, `yafs.query`, `ctl`, or
`slack send`), an allowed-root prefix check on every path-bearing argument
(normalized against `..` traversal the same way the VFS's own path
resolver is), a byte-truncation budget per result, a call-count budget
scoped to that one MCP session (so it resets per agent run, not
per-persona-forever), and a wall-clock deadline. `AgentToolCompletion`
computes the `plugin` integration entry itself, per call, referencing an
entry `AgentToolMcpSync` keeps written into LM Studio's own `mcp.json` for
every currently tool-enabled persona — an operator never hand-authors an
`integrations` list or edits `mcp.json` directly (LM Studio's SSRF guard
on its `ephemeral_mcp` integration type rejects loopback URLs supplied
inline per-request; `mcp.json`-registered servers are exempt, since
registering one already requires local filesystem access).

Every tool call and its bounded result — the LM Studio `output` array
verbatim — is recorded durably at `runs/<runId>/tools.json`, alongside the
existing `request.md`/`context.md`/`response.md`/`status.json` — inspectable
the same way those already are. See
`test/plugins/agent/AgentToolServer.test.ts` (a real MCP client driving the
real HTTP/session/budget stack end-to-end) for the exercised behavior; a
live LM Studio instance still needs a manual pass — there is no automated
substitute for that leg yet.

This is the milestone that turns "text-in/text-out" into "agent" in the
sense that matters for a demo: a persona reading the live PR via bounded
read tools (never `capture`/`restore` — excluded from the allowlist above)
rather than only replying to whatever text was pasted in.

### Later: a provider-neutral event/workflow boundary (not yet scoped)

The M7.0 Slack bridge's cross-plugin coupling (flagged above) still points at
a real future need — Slack shouldn't own agent-routing policy, and the
poller's bespoke dispatch-then-poll-then-reply shape shouldn't be the only
way an event turns into a bounded action. But per review, this should not
be pre-designed as a named milestone before it's needed: "let the first
generic workflow/action runtime emerge from M6.4 plus the bridge," once
M6.4 (durable outbox) and M6.5 (bounded tools) exist and have been used for
real. **M6.4 and M6.5 are both now used for real** (see M6.5's entry
below); M6.7's scheduled digest is the deliberate second instance this
section has been waiting on — a workflow/event boundary designed from one
data point is a guess, from two it's at least a comparison. Don't design
this boundary before M6.7 ships and both are compared. L2 (see
[LANGUAGE-ROADMAP.md](LANGUAGE-ROADMAP.md)) is explicitly not a
prerequisite for this first workflow either — an event-triggered workflow
needs durable triggering, typed argument binding, idempotency, approvals,
retries, and cancellation, which is more than a script; L2's role is to
later give operators a reviewable way to author bounded local procedures
against whatever that stable model turns out to be, not to be that model
itself.

**Sequencing and initial demo scope:** M6.5 depended on M6.4 closing first —
an agent proposing a Slack reply through a still-fire-and-forget outbound
write would have made any approval step sit in front of a write that could
still silently double-post or lose the record of what it sent. Both are now
implemented, so the demo is:

```text
Human mentions reviewer in Slack
  → at-least-once, mention-filtered inbound delivery (baseline cursor +
    @mention filter — filtering mechanics, not a durable event record; the
    cursor is in-memory only, so a daemon restart re-delivers whatever sat
    in the channel's last `max` messages as if new — a known, accepted
    poller crash-window gap, not yet closed)
  → agent reads the live review material using bounded tools (M6.5)
  → durable proposed reply (run artifact, including the tool transcript)
  → operator approves
  → durable Slack outbox delivers it (M6.4)
```

That demonstrates useful work, not just chat — and it demonstrates why Yafs
exists (source, context, tool calls, intent, and outcome are all inspectable
and recoverable in one durable workspace) rather than why Slack bots exist.
Keep the narrow trigger already in place (one channel, `@mention` only by
default, bounded message size, one persona, no recursive replies, no
autonomous bot loop) rather than expanding the spike further.

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

### Review radar proof — achieved

The checkpoint near-term work through M6.5 was judged against. Everything
else in this section — the `/world`/`/home`/`/commons` namespace direction
(see
[PRODUCT-SPEC.md](PRODUCT-SPEC.md#long-range-direction-a-legible-federated-world)),
federation (see the ADR's federation section), commons functions (see
[LANGUAGE-ROADMAP.md](LANGUAGE-ROADMAP.md#paving-stones)) — is a downstream
hypothesis worth recording, not allowed to obscure whether this proof is
useful:

> A scoped agent explores a live GitHub PR collection, identifies a
> candidate worth reviewing, explains its evidence, and produces a
> human-approved Slack response.

**Verified live, not just plumbing-tested:** a real LM Studio persona,
mentioned in Slack, called `yafs.start_here` then `yafs.tree`/`yafs.read`
against the real `/world/github/software/vets-api` mount and returned a
grounded recommendation for PR #30018 — correctly identified as a
five-line, declarative-only feature-flag addition
(`disability_compensation_conditions_evidence_messaging_test`) with no
logic changes, safe to merge. Checked against the real diff, not taken on
faith: the summary matched exactly. This is the fake-model e2e proof
(`test/e2e/SlackToolEnabledReview.test.ts`) confirmed against a real model
for the first time.

### Review-radar product validation — next evidence, before broadening scope

The live run proves feasibility once. It does **not** yet prove that Yafs is a
better appliance than GitHub plus a chat bot. Before adding a broad provider
catalog, run the same bounded review loop across several real queues and record
the result in a small scorecard:

| Measure | What to record | Why it matters |
| --- | --- | --- |
| Grounding | Candidate PR number, observed mount revision, exact files/tools read | Distinguishes evidence-backed triage from a plausible chat summary. |
| Usefulness | Whether a human accepted, edited, deferred, or rejected the recommendation | Tests the actual user job, not tool-call completion. |
| Efficiency | Tool calls, bytes read, elapsed time, and unnecessary full snapshots | Tells us whether `/world` and `start_here` improve discovery rather than merely add ceremony. |
| Safety | Scope/budget rejection, stale revision, retry, or outbox recovery events | Makes the appliance's claimed control properties visible. |

The first planned scheduled digest (M6.7) should emit the same record. Only
after comparing it to the Slack-initiated path should Yafs generalize an event
or workflow runtime. A second provider earns priority only when this scorecard
identifies context that GitHub cannot supply — for example an incident/alert
provider needed to explain why a failing PR matters — rather than because the
plugin architecture has unused capacity.

**Efficiency row is now fillable, not just aspirational:** each tool-enabled
reply already carries a deterministic receipt (`AgentToolCitations.ts`) —
tool-call count, elapsed wall-clock time, and which resources were actually
read, with `runs/<runId>/status.json`'s `durationMs` giving the same number
structurally. What's still missing for a real scorecard pass: nothing
currently records byte counts per call, and Grounding/Usefulness/Safety
still need a human to fill them in by hand (no accept/edit/reject signal
exists yet — Slack reactions were disabled for missing scope, so that
channel isn't available without a fresh token grant).

### `yafs.start_here` — implemented

A single typed, read-only MCP operation (same shape as the existing
`yafs.tree`/`yafs.find`) returning structured orientation instead of
prose: current principal/cwd, the caller's allowed roots and tool
budgets, mounted provider roots with provider name/revision/freshness,
and recommended first operations.

Motivated by a real live failure: a tool-enabled persona with genuine
read/list access to a PR queue replied "I haven't pulled the list of open
PRs yet... give me the PR URLs" instead of just looking. A stopgap already
shipped — the persona's system prompt now states its scoped roots
explicitly (`AgentToolCompletion.ts`'s `systemPromptFor`) — but a
discoverable, always-current tool call is the more durable fix than a
prompt snapshot that goes stale the moment mount config changes.

**Acceptance criterion:** does it materially improve tool-use reliability
in the review-radar task above, measured, not assumed? If it doesn't move
that number, it isn't worth keeping regardless of how principled it looks
on paper. Also worth checking as a matter of habit whenever "the model has
no context" recurs before building anything: today scope is static per
persona, so a `tools.roots` that doesn't actually point at the mount that
matters produces exactly this symptom and is a config bug, not a product
gap.

**Correction to an earlier version of this note:** it previously framed a
Slack persona recursively driving its own Yafs tool calls as blocked on a
not-yet-built path-scoping primitive. That was wrong — the bounded case is
already built (M6.5's `AgentToolServer`/`ScopedMcpClient`, above) and now
proven to chain through Slack end-to-end:
`test/e2e/SlackToolEnabledReview.test.ts` drives one inbound Slack message
to a `tools.roots`-scoped persona and asserts `runs/<runId>/tools.json`
recorded a real tool call against live mount data before the reply posted,
with a fake LM Studio client standing in for the model. `yafs.start_here`
adds orientation on top of that already-working loop; it is not what makes
recursion possible.

What genuinely remains deferred is the *general/unbounded* case: a persona
reading or writing outside its own mount, chaining across multiple
personas or mounts in one run, or any actor other than a
`ScopedMcpClient` session needing the same root-scoping — see
[ADR.md](ADR.md)'s "Path-scoping primitive" section, sharpened to name
this distinction explicitly. That gap is M7 "spaces" territory, not a
prerequisite for the one-hop, one-mount case this experiment targets.
**Acceptance criterion met:** a real LM Studio model, not a fake one,
reliably called `start_here` then read real content before replying — see
"Review radar proof — achieved" above.

### M6.6 — Runtime-overlay and plugin-registry consolidation *(decision gate, before M7)*

A doc-review pass over the whole codebase surfaced two architectural items
that are real but orthogonal to M6.5/`yafs.start_here`/`/world` above, and
were deliberately deferred rather than folded into that work:

- **Provider snapshots as mutable runtime state.** A mount's published
  snapshot is meant to be the immutable, provider-fetched view; runtime
  writers (agent runs/chats, the Slack outbox) currently republish the
  *whole* mount snapshot on every write (`MountEntryPublish.ts`'s
  `publishEntries`, called from `AgentRunStore.ts`, `AgentChatStore.ts`,
  and `SlackOutboxStore.ts`) rather than layering their own mutable state
  over a snapshot that stays untouched. This works today but conflates two
  things that should stay separable: what a provider fetched, and what a
  runtime actor wrote on top of it.
- **Plugin-registry fragmentation.** Registering a new provider means
  wiring it separately into `ProviderRegistry`, `BackgroundDrivers`, the
  command set, and (where applicable) pseudobinary actions — four
  call sites per plugin instead of one declarative registration point.
  Tolerable at four providers; each new plugin makes the seams more
  visible.
- **Snapshot payload scaling.** A 100-PR GitHub collection has already
  required a 2 MiB snapshot allowance. Raising a bounded limit is acceptable
  for the live demo, but copying full provider bytes into every published VFS
  snapshot and WAL record is not the data-plane shape to scale. The existing
  blob store is the intended direction: a provider snapshot should become a
  small immutable manifest/root record whose file bytes are durable,
  content-addressed payloads. The payloads must be synced before the WAL
  record that names them; recovery reads only those bytes and never refetches.
  Compression may be a blob-storage implementation detail later, not the
  primary scaling strategy or a substitute for deduplication.

**Why before M7, not before this milestone:** M7 ("spaces" — multiple
personas taking turns, invoking MCP tools mid-generation, per ADR.md's
"Deferred to M7, not scoped down") multiplies both problems — more
concurrent runtime writers racing to republish snapshots, and more
plugin/persona combinations flowing through the same fragmented
registration path. Fixing the shape once here is cheaper than fixing it
under M7's added concurrency. Not a blocker for `yafs.start_here`, `/world`
default pathing, or the M6.5 tool loop, all of which ship first.

**Decision gate, not yet designed:** this entry exists so the reviewer's
two largest concerns are named and scheduled rather than silently dropped.
Actual design (an explicit snapshot/overlay split; content-addressed provider
payloads; and a single declarative plugin-registration surface) is deferred to
when M7 work is scoped.

**M6.6 exit evidence:** a repeated snapshot refresh does not duplicate an
unchanged diff payload in the WAL; runtime writes do not republish provider
content; and a restart can rebuild the same view from durable manifests and
payloads with network disabled. This is a scalability/correctness change, not
a license to make provider reads lazy during ordinary pathname resolution.

### M6.7 — Scheduled review digest *(second hand-built automation)*

Checkpoint: after the review-radar proof, the reviewer's own stated
sequencing is the plan, verbatim: *"build one deliberately narrow second
flow — perhaps a scheduled GitHub review sweep that creates a proposed
Slack digest — and compare it with the inbound Slack path... generalize
only the parts that are demonstrably identical."* This milestone **is**
that second flow — not a general scheduler, not a manifest `scheduled:`
block, not a change to L2. Those all stay exactly where "Later: a
provider-neutral event/workflow boundary" above and
[LANGUAGE-ROADMAP.md](LANGUAGE-ROADMAP.md)'s L2 scoping section already
put them: deferred until there's more than one real trigger/action pair to
generalize from. A workflow boundary designed from one data point (the
Slack bridge) is a guess; from two, it's at least a comparison. This
milestone's job is to *produce* that second data point — deliberately
built bespoke, on purpose, so the eventual comparison is honest.

- A new background driver, the same shape as `SlackInboundPoller` (a
  hand-built timer loop, not a generic trigger runtime): during a
  configured working-hours window, it `plugin refresh`es a GitHub mount
  (host-triggered — the persona's MCP tool set stays read-only per
  `BoundedToolSet.ts`; the model never gains refresh/mutate authority by
  being asked in a message), invokes a persona with a "surface
  safe-to-merge PRs" prompt, and posts through the existing durable Slack
  outbox (M6.4) — the same delivery guarantee the inbound reply path
  already gets, not a new fire-and-forget post.
- Scoped design questions this milestone answers concretely (not the
  deferred general ones): what "safe to merge" means as a prompt/bar
  (same evidence-cited standard the interactive case already validated,
  or looser); how to avoid re-surfacing the same PR every cycle (durable
  dedup/seen-state, following M6.4's own durability precedent — not an
  in-memory set that a restart forgets); what the work-hours window means
  in code for v1 (a fixed window is enough to prove the shape; timezones,
  weekends, and holidays are explicitly out of scope until there's a
  second operator who needs them).
- **Why M6.6 doesn't block this:** per the reviewer, M6.6 "should not
  block the current live validation... it should, however, block a
  durable general workflow system." One narrow scheduled spike, reusing
  the same durable-outbox/bounded-tools primitives the Slack bridge
  already proved, is not a durable general workflow system. M6.6 is a
  prerequisite for generalizing *after* this and the Slack bridge are
  compared, not for building this.
- **Exit criterion:** ship it, let it run for real, then compare its
  driver against `SlackInboundPoller`'s. Same dispatch-then-post shape?
  Same need for durable dedup? That comparison — not speculation — is
  what tells M6.6 and the event/workflow boundary what to actually
  design, and is the evidence L2's own "second decision, earned only by
  repeated use" principle is waiting on.

### Later: on-demand, single-resource provider fetch (not yet scoped)

Named here so it isn't lost, not designed. Motivated by a concrete richer
digest idea: alongside `pulls/`, capture `commits/` for the last 10-15
`master` commits (CI status, run number, optionally diffs), and — the part
that actually needs new architecture — let a persona ask a provider to
fetch one specific thing on demand, e.g. a single GitHub Actions run's log
(`actions/<runId>/...`), *only when requested*, not pre-fetched for every
recent commit "just in case."

**Why this is a new primitive, not a bigger snapshot.** Every provider
today is bulk-publish-only: `Plugin.prepare()` fetches everything a mount's
config asks for in one pass and materializes one immutable snapshot
(`SnapshotMaterializer`/`populateSnapshot`); there is no "fetch just this
one thing" verb anywhere in the codebase. CI logs make eager bulk-fetch
actively wrong, not just wasteful — pulling every recent run's full log
on every refresh is exactly the "large data" cost a scheduled poll (M6.7)
would multiply on a timer, and most of it would never be read. This also
isn't the same gap M6.6 names: M6.6 is about separating a provider's
immutable fetched content from a runtime actor's mutable writes on top of
it; this is about a provider needing two *fetch* modes — eager/bulk (what
exists) and lazy/on-demand-by-id (what doesn't) — with their own capability
and cost-control story (an on-demand verb is a new way to spend the
network/secret grant a mount already holds, per-call rather than
per-refresh, and needs its own accounting).

**Deliberately not designed here:** how a persona would even express "fetch
this one thing" (a new bounded MCP tool? A `ctl` verb, like actions
already use for `send`? Something else?), how it composes with the
read-only bounded tool set (`BoundedToolSet.ts`) without becoming a way to
trigger arbitrary provider API calls, and how/whether it's audited the
same way mount activation already is. Scope this for real once M6.7 (or
whatever next needs it) makes the "we want to check something specific,
not the whole collection" shape concrete rather than hypothetical.

**GitHub-specific direction, not a new provider yet:** enrich the existing
repository projection before adding unrelated integrations. A bounded refresh
can publish PR metadata, changed-file summaries, head-SHA check results, and a
small recent-commit collection; these are ordinary collection resources with
known bounds. Full Actions job logs are different: GitHub exposes them through
a short-lived redirect and they can be large, so they must be fetched only by
an explicitly authorized, bounded hydrate/capture action that produces a
durable artifact tied to repository, job, and observed revision. `cat` must
never become an ambient network call merely because a log-shaped path exists.

## M5 design gate

Before implementing the GitHub source provider, turn its named network grant,
secret-reference policy, Unicode path boundary, revision/freshness metadata,
bounded snapshot behavior, and explicit refresh into code and acceptance tests.
