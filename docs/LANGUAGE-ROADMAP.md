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
| L0 — typed workspace boundary | One typed workspace-operation service serves Yash, MCP, web, and SDK adapters. | A typed `list`/`read`/`inspect` call and its Yash and MCP adapters yield the same typed result/error; substitutions reject every non-read operation before execution. | Complete the daemon-owned capability cleanup; precedes wider MCP writes. |
| L1 — workspace literacy | Exploration and evidence vocabulary are useful without host tools. | Deterministic `tree`, bounded `find`, literal `grep`, `diff`, and `test`; user-facing `capture`/`restore` create and inspect a durable artifact. | Can run before M7. |
| L2 — bounded scripts | Operators can write small, reviewable local workflows. | `yash run FILE -- ARGS…`, sequence/block AST, local parameters/variables, `if`/`else`, source locations, and dry-run plans for local writes. | Requires L0 effect enforcement. |
| L3 — path iteration | Scripts can operate on many virtual paths without word splitting. | A typed path-list/glob expression and bounded `for` iteration handle spaces and empty matches unambiguously. | Add only after L2 use proves it. |
| L4 — composable streams | Text/byte commands can safely compose with `|`. | Typed input/output streams, backpressure, cancellation, explicit stderr/status rules, and a useful read-only pipeline. | Separate design gate; not required for M7. |

L0 and L1 are the only language gates proposed before the supervised-agent
experiment. L2–L4 are evidence-gated, not a commitment to turn Yash into Bash
or Nushell.

**L2 evidence (M7 Slack bridge):** `src/plugins/slack/SlackInboundRouting.ts`
hand-writes exactly the shape L2 exists to replace — dispatch one command,
poll for its terminal state, conditionally run a second command — as
TypeScript orchestration between two plugins rather than a reviewable local
script. This is concrete evidence the L2 bar may now be met, not merely
hypothetical demand. Starting L2 for real requires solving a problem this
bridge sidesteps by construction: safely passing an untrusted value (Slack
message text) as a script argument without string-interpolating it into a
parsed command line, which is a real injection surface with no existing
mitigation. A trigger/event model (what starts a script run) and bounding
rules also remain undesigned. Treat this note as the opening of the L2
evidence case, not as L2 having started. That gap is now scoped — not
implemented — in "L2 scoping" under
[Script and pipeline boundaries](#script-and-pipeline-boundaries) below: the
value-passing problem turns out to be nearly solved already by the grammar's
existing `$variable` support, which is the single most load-bearing finding
of that section.

**Downstream vision, not scoped here:** a federated `/commons` registry of
reviewed, versioned local procedures (a `manifest.json` declaring input
schema, effects, required capabilities, allowed roots, and test
results — not a bare `fn.yash` drop) is captured in full in
[PRODUCT-SPEC.md](PRODUCT-SPEC.md#long-range-direction-a-legible-federated-world)'s
"Long-range direction" section, with the federation-specific trust
preconditions in [ADR.md](ADR.md#federation). It is explicitly downstream
of L2 landing for real — there's nothing to
publish or invoke until a script exists — publication is an explicit,
human-reviewed action rather than agent auto-publish, object-member call
syntax (`commons.foo.bar(...)`) is deliberately deferred in favor of one
plain invocation command, and the whole thing is framed as a falsifiable
hypothesis (do reviewed, tested procedures distilled from successful runs
make later agents noticeably more effective?), not an assumed win.

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

The typed workspace boundary is complete when a future web or browser adapter
can call `list`, `read`, and `inspect` in-process without constructing Yash
text, and when a non-read command inside `$()` demonstrably has no opportunity
to allocate blobs, enqueue work, or contact a provider.

### Implemented L0 slice

The initial vertical slice supplies `WorkspaceOperations` with typed `list`,
`read`, and `inspect` requests/results. Local and loopback clients carry those
requests without shell parsing; fixed MCP tools use them directly while
`yafs.query` remains the constrained text compatibility surface. Recursive
read-only validation rejects a mutating substitution before its command can
run. This completes the typed workspace boundary. It deliberately does not
convert the whole builtin catalog into typed operations; that broader
command/action catalog remains a separate architecture decision rather than an
implied L0 deliverable.

The follow-on catalog decision should settle only implementation-facing details:
identifier/versioning, structured error envelope, schema representation,
session serialization, and how the existing builtin registry adapts. It should
not settle script syntax, pipeline framing, or a public HTTP API.

### Implemented L1 slice

`tree`, `find`, `grep`, `diff`, and `test` are implemented as typed
`WorkspaceOperations`, each with a Yash renderer and a fixed MCP tool
(`yafs.tree`/`yafs.find`/`yafs.grep`/`yafs.diff`/`yafs.test`), matching the L1
operation contract below exactly — bounds, error shapes, and all. `capture`/
`restore` are implemented and have replaced `trace`/`reify` as the only user
vocabulary. This completes L1; the paving-stones row above is met.

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

### L1 operation contract

L1 is a finite inspection vocabulary, not a first pass at POSIX utilities.
Every item below has one typed operation, a Yash renderer, and a fixed MCP
tool. The operation validates its inputs and limits; adapters do not reparse
or reinterpret them.

| Operation | Typed input | Structured result | Fixed bounds and semantics |
| --- | --- | --- | --- |
| `tree` | `path`, optional `depth`, optional `limit` | sorted entries with path and node type | Default depth 3; maximum depth 10; at most 1,000 entries; does not follow final symlinks while walking. |
| `find` | `path`, optional simple `pattern`, optional node `type`, optional `limit` | sorted matching paths | `pattern` permits only `*` as an in-operation filename wildcard—not shell expansion. The walk examines at most 1,000 entries, then the requested result limit applies to matches. |
| `grep` | literal `pattern`, `paths`, optional `limit` | matching path/line/text records | UTF-8 files only; no regex mode; paths remain separate values; at most 10,000 matches. Line records always carry their line number; Yash decides whether to render it. |
| `diff` | `left`, `right`, optional `limit` | deterministic change records | Compare UTF-8 files, or recursively compare two directories in sorted path order; at most 10,000 rendered change lines. |
| `test` | one explicit path predicate and path | boolean result | Initial predicates are `-e`, `-f`, `-d`, and `-L`; no shell expression language, negation, or boolean chaining. |
| `capture` | source directory, destination artifact directory, optional `limit` | artifact descriptor | Preflights at most 10,000 UTF-8 files before storing exact bytes by digest and recording provider provenance/reference. |
| `restore` | artifact directory and absent local destination | restored descriptor | Materializes at most 10,000 recorded bytes or immutable provider references; never falls back to a current provider path. |

`capture` and `restore` replace the user vocabulary `trace` and `reify` when
their adapters land. The durable trace manifest/type and blob mechanics remain
internal implementation terms. There will be no permanent dual command
spelling: migration updates scripts, validation guides, and MCP names together.

The default/maximum limits above are part of the operation contract, not a
terminal-output preference. A limit hit is a structured `result_limit` error;
the command renderer must not silently truncate and make a partial result look
complete.

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

### L2 scoping (design, not implementation)

This is grounded in the current grammar/interpreter, not aspirational — every
fact below is a direct file:line reading of `src/lang/`, done to answer three
questions before any L2 code is written: how does a script safely receive an
untrusted value, what starts a script run, and what can a script do.

**Safe value-passing is nearly already built.** The grammar already has a
variable form — `variable = "$" identifier` in `Yash.ohm` — and it is wired
end to end: `WordAst.ts` produces `{ kind: "variable", name }`,
`evaluate.ts`'s `evaluateWord` resolves it via an injected
`evaluators.variable(name): string`, and `YafsCommandRuntime.ts` supplies
that evaluator today for exactly two session variables, `$USER` and `$PWD`
(`src/YafsValues.ts`). Critically, resolution happens as a **value
substitution after parsing**, not by re-parsing interpolated text — a
`"$MESSAGE"` word is evaluated by looking up the string and using it as-is,
never by splicing it into source and calling `Interpreter.parse()` again.
That is exactly the primitive this session's Slack bridge needed and didn't
have: L2 should extend `variable()` with a script-scoped binding table (a
plain `Record<string, string>` resolved before falling through to session
variables), so a script parameter — a Slack message body, a chat ID, an
arbitrary string — is bound as a **value**, never string-interpolated into
parsed source. This closes the injection risk identified in the L2-evidence
note above by construction, not by escaping. One real grammar gap: `$1`-style
positional parameters (used in this doc's own `if test -f "$1/diff.patch"`
example above) don't parse today, because `identifier = letter (letter |
digit)*` requires a leading letter. Closing it is a small, mechanical Ohm
addition (`variable = "$" (identifier | digit+)`), not a redesign.

**Trigger model: L2 defines the script language, not a new eventing system.**
A script run should be started exactly the same ways commands already start
today — an explicit interactive `yash run FILE -- ARGS`, or a driver
supplying a parameter-binding table where a `PluginDriver` today hand-writes
TypeScript orchestration (this session's `SlackInboundRouting.ts` is the
concrete example: replace its dispatch/poll/reply sequence with a script
body, with the poller's job reduced to "supply `$PERSONA`/`$CHAT_ID`/
`$SENDER`/`$TEXT`/`$CHANNEL` and run the script"). No new scheduling,
subscription, or autonomous-trigger primitive is in scope — that is
explicitly the "second decision, earned only by repeated use" the M7 ADR
section already reserves, and building it here would be the same
autonomous-loop overreach already declined this session.

**Sandboxing reuses `CommandAccess`, it doesn't invent a new effect system.**
`docs/LANGUAGE-ROADMAP.md` has referred to `session`/`local-write`/`control`/
`external-action` "effect" categories as a future design; those do not exist
in code. What exists and already works is `CommandAccess = "read" | "session"
| "mutate" | "control"` (`src/commands/BuiltinCommand.ts`) plus
`assertReadOnlyCommand` (`src/commands/ReadOnlySource.ts`), which recursively
rejects any non-`"read"` command inside `$()` substitution today, including
inside nested substitutions. L2's bounding rule should be the same check,
applied to a whole script body instead of one substitution: a script run
triggered by a human inherits that human's full authority (a human can
already run any command directly, so this adds no new restriction); a script
run triggered by an automated driver should be checked against an explicit
allow-list of `CommandAccess` levels (and, later, specific command names)
declared where the trigger is configured — turning this session's hand-built
"the poller can only ever write two specific ctl paths" property into a
declared policy instead of a TypeScript implementation detail.

**Worked example**, illustrating the target shape without claiming today's
grammar parses it (it doesn't yet — block bodies, `if`/`else`, and
newline-separated sequencing inside `{ }` are still needed; `Command` is
currently the sole top-level parse rule, with no `Program = Command*` root):

```sh
agent send $PERSONA --chat $CHAT_ID "$SENDER: $TEXT"
if test -f runs/$RUN_ID/response.md {
  slack send $CHANNEL "$(cat runs/$RUN_ID/response.md)"
}
```

**Explicitly not decided here:** the concrete block/sequencing grammar (needs
its own Ohm-review pass); whether script files live in the VFS (inspectable
like any file) or are host-config-only, which is the same "capability grant
must not be a plain VFS write" question the `.yafsmeta` removal already
settled once this session, applied to a new surface, and deserving the same
deliberate answer rather than a default; and how a driver's allow-list is
declared (a new manifest field, most likely, but not designed here). This
section is a scoping document, not a green light to implement.

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
