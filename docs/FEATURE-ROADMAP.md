# Yafs feature roadmap

This file tracks implementation sequencing. The product decision, use cases,
and acceptance-level milestones live in [docs/ADR.md](docs/ADR.md).

The committed delivery horizon ends at the Git/GitHub review-workspace proof.
Cache, agents, remote multi-user service, and runtime execution are gated
extension hypotheses; they are not implied commitments merely because they are
listed below.

## Product thesis

Yafs is a virtual filesystem service whose directories can acquire capabilities
through explicit mounts. A user should be able to browse, inspect, compose, and
operate on ordinary-looking paths while plugins supply the backing data or
behavior.

The stable center is the VFS. The shell, network transports, and plugins are
clients of it.

Yafs is a composable workspace server, not a POSIX shell implementation. Yash
is the human-facing command client; a structured RPC/API is equally first-class
for scripts, services, and agents.

```text
SSH / FTP / API / REPL
          |
       shell session
          |
  VFS kernel: paths, nodes, links, ACLs, mounts, metadata
          |
  local store | git mirror | agent workspace | other providers
```

## Non-goals for the first releases

- A POSIX-compatible shell or a general-purpose container runtime.
- Implicit host access from a virtual path.
- Running arbitrary plugin code merely because a directory is listed.
- Making a remote filesystem behave identically to a host filesystem for every
  native utility.

Those are useful later possibilities, but each needs an explicit security and
execution model.

## Worked experience: an agent-backed directory

An `agents` plugin can make a small, inspectable workspace around a long-lived
workflow. It should expose files, not hide a proprietary state machine.

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
  - path: agents
    plugin: agents
    config:
      prompt: prompt.md
      context: [context]
      permissions: [read_workspace, write_output]
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
| `echo $((2 + 2))` | Evaluate a Yafs integer expression. |
| `echo $(cat /notes/today.md)` | Run a Yafs command and substitute captured stdout. |
| `cat /a | select error` | Pipe structured text/bytes between Yafs commands. |

In POSIX, `$()` is command substitution: it runs the enclosed command and
replaces the construct with the command's standard output (with trailing
newlines removed). `$((...))` is arithmetic expansion. The parentheses are
therefore not a generic `eval` mechanism; the extra pair disambiguates
arithmetic from a nested command. A parenthesized command group, `( command )`,
is a separate shell construct. [POSIX Shell Command Language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html)

The parser should build this shape before execution:

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
   expansion, and command substitution.
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

Each mount declares a plugin, configuration, and granted capabilities in
`.yafsmeta`. Plugin discovery must be separate from activation; merely finding
metadata should not start an agent, clone a repository, or launch a container.

```ts
interface VfsPlugin {
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

- The prototype parses a small command AST and supports `pwd`, `cd`, `ls`,
  `cat`, `mkdir`, `echo`, links, union inspection, and output redirection.
- A loopback-only `yafsd` and stateful `yash` client exist, with an append-only
  replay journal. They demonstrate clean-restart recovery, not crash-safe
  persistence or remote authentication.
- M0 is complete. The current in-memory tree supports canonical paths,
  symbolic links (including loop detection), read-only ordered unions, and
  `origins` inspection; its error messages distinguish missing paths,
  non-directories, link loops, and read-only mounts. Full multi-user ACLs and
  authorization remain part of the remote-service milestone.

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

Add `help`, `version`, `whoami`, `mounts`, and `inspect`; keep the existing VFS
commands (`pwd`, `cd`, `ls`, `cat`, `stat`, `lstat`, `readlink`, `origins`,
`mkdir`, and `ln`). Add `printf` as the exact output primitive; define `echo`
as a documented convenience. The parser still returns a typed AST with no
parse-time side effects. Add quoted words and variables before command
substitution, pipes, or broad POSIX compatibility.

### M2 — Interactive Yash UX

Checkpoint: Yash has client-local, persisted history; up/down navigation;
Ctrl-R reverse search; and completion for commands and virtual paths. The
server exposes session state such as cwd, user, mounts, and revision; Yash
renders it through a configurable `PROMPT` template. Keep history and terminal
editing client-side, while a `history` command may expose an explicit,
redacted session history for introspection. Add `yash -c` and a structured
JSON-lines/RPC mode so scripts never need to scrape rendered terminal output.

### M3 — Service and client boundary

Checkpoint: a long-lived `yafsd` process owns a VFS instance and exposes a
versioned loopback-only local RPC protocol. A thin `yash` CLI creates a
session, sends one parsed command or input line at a time, and renders stdout,
stderr, and status. Add authentication before exposing the protocol beyond the
local machine. `yash --local` remains an in-process development mode.

Define foreground and daemon operation explicitly: `yafsd start`, `stop`,
`restart`, and `status` need a PID/state directory, stale-PID handling, stable
log and journal locations, and an unambiguous policy for a second server using
the same data directory. Do not add backgrounding as a shell trick.

Persist canonical mutations as an append-only journal and replay them at
startup. This is the right first persistence format because it makes mutation
semantics visible and testable. Before claiming crash durability, add an atomic
commit protocol (write and sync before exposing a mutation), journal
validation/checksums, snapshot compaction, data-directory locking, and a
recovery policy for a partial final record. SQLite is a reasonable later storage
engine if it simplifies indexing, transactions, or multi-process coordination;
it is not required to establish the VFS model.

This proves Yafs can be used as a cache, router/proxy, scripting target, agent
hub, or chat backend: they all speak the same VFS/session API rather than each
embedding the filesystem. Build SSH or Telnet as adapters over that session API,
not as part of the kernel. SSH is the sensible first remote transport; Telnet is
only worth adding for an intentionally retro or constrained client use case.

### M4 — Command substitution and streams

Checkpoint: `$(...)` parses a nested Yafs command AST, captures its output, and
has well-defined exit/error behavior. Add `|` only when command input/output
are represented as streams rather than incidental strings. No host execution.

### M5 — Mount lifecycle and `.yafsmeta`

Checkpoint: metadata selects a plugin only after schema validation; a mounted
plugin is visible in `mounts`, can be refreshed/unmounted, and cannot escape
its configured subtree. Add an audit log for activation and capability use.

### M6 — Read-only provider and Git/GitHub plugin

Checkpoint: first prove the provider contract with a deterministic fixture
provider, then expose a pinned Git revision or GitHub repository as a read-only
mount. A GitHub view may render PR numbers as files/directories containing
metadata, diffs, and review state. Expose freshness, source revision, and
explicit refresh behavior. Implement Yafs-level status commands only for that
mount; do not depend on host Git yet.

### M7 — Agents plugin *(decision gate)*

Checkpoint: `agent start`, `agent send`, and `agent stop` manage a durable run;
the prompt, allowed context, transcript, state, and generated artifacts are
visible as files. Restarting the service recovers or clearly marks interrupted
runs. The plugin has no implicit host-process or network capability.

### M8 — Machines/images plugin *(decision gate)*

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

### M9 — Optional host execution bridge *(decision gate)*

Checkpoint: an administrator-controlled, allowlisted `host exec` can run a
tool against a read-only materialized mount snapshot. It records command,
identity, snapshot revision, exit status, and output. Importing writes requires
an explicit staged change set, a matching base revision, conflict checks, and
an explicit commit command; no runtime write mutates the VFS implicitly.

### M10 — Remote transports and multi-user service *(decision gate)*

Checkpoint: one authenticated API/SSH transport supports per-user sessions,
authorization, mount visibility rules, quotas, and audit events. Add FTP only
if its client compatibility is worth its weaker interaction model.

## Decisions to make before M4

1. Is `.yafsmeta` YAML, JSON, or a restricted declarative format? YAML is
   approachable but needs strict schema validation and no custom tags.
2. Are paths byte strings, UTF-8 strings, or Unicode-normalized names? Choose
   once; it affects every provider.
3. Are file writes atomic replacements, streaming writes, or transactions?
4. Does a plugin command receive byte streams, text streams, or structured
   values? Starting with UTF-8 text plus explicit binary file operations is a
   reasonable small answer.
5. Which capabilities can ever be granted to `agents`: network, host exec,
   secrets, write outside its subtree? Each should be independently explicit.
