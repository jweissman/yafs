# Yash language roadmap

This is the language track within the main product roadmap. It does not promise
POSIX compatibility or a general-purpose programming language. Its purpose is
to make a durable Yafs workspace pleasant to explore and safe to automate.

## The service boundary comes first

Yash is a terminal client: it parses text, keeps history and prompt state, and
renders results. It is not the reusable command API. MCP, a web UI, an
in-process browser build, and future SDKs need the same workspace-bound typed
service without manufacturing shell strings.

```text
Yash text parser ─┐
MCP tool adapter ─┼─> WorkspaceCommandService ─> VFS / actions / audit
Web or SDK adapter┘       (session + authority)
```

The service is an instance, not a global `Yash.executes` object: every call is
bound to one workspace, session identity, capability set, and cancellation
scope. A command definition supplies a stable name, typed input/output schema,
effect category, and executor. Yash adapters translate words to typed input;
MCP and web adapters pass typed input directly. Provider pseudobinaries are
adapters over the same declared provider action, never a second action path.

`yafs.query` is a temporary read-only convenience, not the target MCP API.
New MCP tools should wrap named typed operations (`list`, `read`, `find`,
`inspect`) and return structured values. Terminal formatting is an adapter.

An eventual shape, shown for boundary design rather than as a TypeScript API
commitment, is:

```ts
type WorkspaceOperation<Input, Output> = {
  id: string;
  effect: Effect;
  input: Schema<Input>;
  output: Schema<Output>;
  invoke(context: InvocationContext, input: Input): Promise<Result<Output>>;
};
```

`InvocationContext` owns session identity, authorization, cancellation, and
the operation queue. An adapter cannot supply a wider context than it received.
The operation layer validates paths and input once; MCP must not maintain its
own path regular expressions and Yash must not be the only client that knows
how to turn an operation into a result.

`WorkspaceOperations` is the working name for this application-service layer.
It lives with the workspace/server implementation, not in the Yash REPL or a
transport adapter. An in-browser embedding may implement the same interface,
but L0 does not promise browser persistence, daemon compatibility, or access
to daemon-held secrets; those are properties of the embedding's context.

## North star: scripts and durable workflows

At its most capable, Yash supports three related but distinct experiences:

| Surface | Job | Durable unit |
| --- | --- | --- |
| Interactive Yash | Explore a workspace and invoke one operation. | A command result and, where applicable, a VFS operation. |
| Yash script | Express short, operator-authored local procedures. | A reviewed source file and a bounded run record. |
| Workflow | Coordinate consequential or long-running work. | A durable run with named, checkpointed steps. |

A workflow is not merely a script that has run for a long time. Its external
actions need input snapshots, idempotency, explicit retry/cancel policy, and
visible `queued`/`running`/terminal state. This is the natural home for an
approved Slack proposal, scheduled review sweep, or eventual reconciled
resource. It is not scope for L0–L2.

Providers remain implementation code, not Yash programs: they own upstream
protocols, secrets, snapshot production, and lifecycle hooks. Scripts may
orchestrate declared provider actions and compose their local artifacts; they
cannot define a new provider, grant a capability, or open a listener.

## Language contract

Yash accepts familiar shell spelling only where Yafs gives it a smaller,
documented meaning. It has no host `PATH`, inherited daemon environment,
`eval`, `source`, aliases, job control, process groups, signal traps, or
POSIX-conformance promise.

Commands have effects: `read`, `session`, `local-write`, `control`, or
`external-action`. Expansion contexts, including command substitution and
future predicates, may execute only `read` commands. Restoring a queued VFS
mutation afterwards is not an adequate substitute for that rule: an operation
can allocate durable content or start work before queue restoration.

Values begin small: UTF-8 text, paths, integers, booleans, JSON records, and
typed path lists. A terminal command may render any value as text, but neither
scripts nor MCP should need to recover paths by splitting text output. File
bytes and stream values remain a separate, later contract.

## Working decisions before L0

These decisions make scripting compatible with the capability boundary rather
than an escape hatch around it:

| Question | Working decision | Consequence |
| --- | --- | --- |
| What grants authority? | Only daemon-owned policy and the invocation context grant authority. A virtual file, script, artifact, provider view, or MCP request never does. | An agent-written script is inert data until an operator explicitly invokes it. |
| What does `yash run PATH` execute? | Initially a local VFS script at an explicit path, captured to a source digest and workspace revision when accepted. Provider-backed scripts need an explicit local capture first. | A later reader can identify exactly what source ran; refresh cannot change it underneath a run. |
| How do local scripts commit? | Script v1 is a bounded read/session/local-write program: evaluate against a pinned workspace revision, produce a visible plan, then commit its local operations atomically if the base revision still matches. | Scripts are reproducible and dry-run is real; external actions are excluded. |
| Where do external actions go? | Into the durable workflow/action system, with accepted intent, idempotency, status, approval, retry, and cancellation. | A `for` loop cannot accidentally become an untracked Slack or model-action fanout. |
| Are effects capabilities? | No. Effect labels classify operation behavior; authorization separately checks actor, scope, and named grants. | A `read` operation may still be denied by path visibility; an `external-action` may be accepted only as a proposal. |
| Are commands the API? | No. A command is a Yash spelling and rendering of a typed operation. | Web/MCP/SDK consumers use schemas and structured results directly. |

The source-digest rule is particularly important once agents can write local
files. A human can inspect and invoke an agent-produced script, but automatic
execution, `source`, executable bits, filesystem watches, and “run on write”
are outside this language contract.

## Paving stones

| Gate | Outcome | Acceptance checkpoint | Dependency |
| --- | --- | --- | --- |
| L0 — typed command boundary | One typed command/action service serves Yash, MCP, web, and SDK adapters. | A typed `list`/`read`/`inspect` call and its Yash and MCP adapters yield the same typed result/error; substitutions reject every non-read operation before execution. | Complete the daemon-owned capability cleanup; precedes wider MCP writes. |
| L1 — workspace literacy | Exploration and evidence vocabulary are useful without host tools. | Deterministic `tree`, bounded `find`, literal `grep`, `diff`, and `test`; user-facing `capture`/`restore` create and inspect a durable artifact. | Can run before M7. |
| L2 — bounded scripts | Operators can write small, reviewable local workflows. | `yash run FILE -- ARGS…`, sequence/block AST, local parameters/variables, `if`/`else`, source locations, and dry-run plans for local writes. | Requires L0 effect enforcement. |
| L3 — path iteration | Scripts can operate on many virtual paths without word splitting. | A typed path-list/glob expression and bounded `for` iteration handle spaces and empty matches unambiguously. | Add only after L2 use proves it. |
| L4 — composable streams | Text/byte commands can safely compose with `|`. | Typed input/output streams, backpressure, cancellation, explicit stderr/status rules, and a useful read-only pipeline. | Separate design gate; not required for M7. |

L0 and L1 are the only language gates proposed before the supervised-agent
experiment. L2–L4 are evidence-gated, not a commitment to turn Yash into Bash
or Nushell.

## L0 delivery strategy

L0 is a boundary migration, not a rewrite of every builtin or a new script
grammar. It should proceed in these small, testable slices:

1. Define `Effect`, typed invocation/result envelopes, and a command catalog.
   Preserve the existing `BuiltinCommand` registry behind an adapter while the
   first operations move; do not fork two command rosters.
2. Add direct typed operations for `list`, `read`, and `inspect`. They are
   read-only, narrow, and already have Yash/MCP consumers.
3. Make Yash parse to an invocation of that catalog and render its typed result.
   Keep `Yafs.execute(source)` as a compatibility text entry point during the
   migration, not as the service API.
4. Change fixed MCP tools to call those operations directly. Keep
   `yafs.query` as a constrained compatibility tool, with no new features
   built on it.
5. Enforce effects recursively before expansion: command substitution and any
   future predicate reject `session`, `local-write`, `control`, and
   `external-action` before a command is invoked.
6. Add an adapter-parity test matrix: equivalent Yash, typed, and MCP calls
   return the same value, structured error, provenance, and access denial.

L0 is complete only when a future web or browser adapter can call `list`,
`read`, and `inspect` in-process without constructing Yash text, and when a
non-read command inside `$()` demonstrably has no opportunity to allocate
blobs, enqueue work, or contact a provider.

The next L0 review should settle only implementation-facing details: operation
identifier/versioning, structured error envelope, schema representation,
session serialization, and how the existing builtin registry adapts. It should
not settle script syntax, pipeline framing, or a public HTTP API.

## Command policy

L1 commands are selected for inspecting a composed workspace, not for filling
out a Unix roster:

```sh
tree --depth 3 reviews
find reviews --name '*.patch'
grep -n --fixed 'TODO' reviews/pulls/482/diff.patch
diff artifacts/reviews/482 current/482
test -f reviews/pulls/482/diff.patch
```

`tree` is sorted, output-bounded, and does not follow symlinks by default.
`find` traverses virtual paths with explicit type/name filters and result
limits. `grep` is literal by default; any future regular-expression mode is
opt-in and bounded. `test` has a small documented predicate set rather than
shell-expression compatibility. `diff` compares Yafs paths with deterministic
text output.

The north-star command set also needs typed structured operations rather than
terminal-only equivalents: `paths` yields a path list, `capture` yields an
artifact descriptor, an agent invocation yields a run descriptor, and an
outbound request yields an action descriptor. Human commands may render those
as paths or JSON; scripts, MCP, and web clients retain their structure.

## Evidence vocabulary

Provider projections are current query views and may legitimately lose a PR
after refresh. A capture is a separate durable evidence object. The normal
user workflow should become:

```sh
capture reviews/pulls/482 artifacts/reviews/482
restore artifacts/reviews/482 work/482
```

`capture` immediately creates a browsable immutable artifact with its manifest
and exact bytes, backed by deduplicated blobs. With no destination it chooses a
provider-derived artifact path and prints it. `restore` makes an explicit
writable local copy. Existing `Trace`/`reify` types may remain internal during
migration, but their storage mechanics should not be required vocabulary.

This gives retention a clear meaning: projections are replaceable; private
fetch caches are reclaimable; captures persist until explicit deletion or a
future quota policy. “Keep every provider response forever” is not a safe
implicit promise.

## Design exercises

These are acceptance exercises for language additions. A feature that does not
make at least one clearer should not enter merely for POSIX familiarity:

1. **Review evidence pack:** select PRs, capture exact source artifacts, and
   create a durable local index that remains meaningful after refresh.
2. **Review triage:** inspect candidate diffs, write local findings, and pass
   only a captured context to a named reviewer persona.
3. **Approved digest:** compose proposed Slack messages from artifacts, then
   list, approve, and send through the durable outbox rather than a loop with
   hidden network effects.
4. **Cache maintenance:** calculate an explicit reclamation plan, show it, and
   apply collection only through a named operation.
5. **Conversation facilitation:** read a local channel, invoke one named
   persona with a bounded snapshot, and record the attributable reply without
   recursive autonomous turns.

The first two should be executable before L3 or L4. They are the evidence for
whether typed iteration, pipelines, modules, concurrency, or richer values are
actually the next language investment.

## Script and pipeline boundaries

L2 should begin with explicit parameters and conditions, not POSIX word
splitting:

```sh
if test -f "$1/diff.patch" {
  grep -n --fixed 'TODO' "$1/diff.patch"
} else {
  echo "no diff available"
}
```

L3 iteration must consume a typed path list, never `for x in $(ls ...)`.
L4 pipelines need a real stream contract: text versus bytes, backpressure,
cancellation, partial failure, stderr, and whether any non-read command can
participate. Initially, pipelines should permit read commands only. Agent runs
remain durable server actions with run IDs and explicit cancellation, not shell
background jobs.

If repeated use earns a larger language, the next capabilities are lexical
variables, functions/modules, records/lists, `match`, `return`, errors,
deterministic fixtures/clock, formatter, linter, and source-level tests. They
belong to a deliberately designed workflow language, not to an accidental
sequence of shell-parser exceptions.

Open questions deliberately deferred until use earns them are module
distribution/locking, a regex engine and limits, byte streams, pipeline frame
types, workflow concurrency, event subscriptions, schedules, and public API
authentication. None should be decided by making a shell construct happen to
parse first.
