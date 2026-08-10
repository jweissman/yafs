# Yash command reference

Yash evaluates commands against a Yafs workspace. It does not search the host
`PATH`, invoke host executables, or promise POSIX shell compatibility. Every
server command has the same structured RPC result: output, status, error, and
updated session state.

## Current syntax

```sh
command arg1 arg2                 # invoke a Yafs command
printf 'text' > file              # replace one local file atomically
echo "$USER at $PWD"              # session variables in double quotes
echo $((2 + 2))                   # integer arithmetic
echo $(cat note.md)               # capture a nested Yash command's output
```

Single quotes preserve their contents. Double quotes allow variables and
command substitution. Command substitution executes in a nested snapshot: it
can read the current workspace, but its session and VFS mutations are discarded.

There are no pipelines, command separators, loops, globbing, aliases, job
control, host executable lookup, or shell `eval`.

## Commands

All paths resolve from the session's current directory unless they begin with
`/`. **Access** is the command's own declared category — `read` never mutates
anything; `session` changes session state (only `cd`); `mutate` produces a
durable VFS operation; `control` manages mount lifecycle. `yafs.query` (see
"Automation and MCP" below) allows only `read` commands; everything else is
rejected before it runs.

### Session

| Command | Access | Meaning |
| --- | --- | --- |
| `pwd` | read | Print the absolute path of the current directory. |
| `cd PATH` | session | Change the current directory. Errors if `PATH` doesn't resolve to a directory. |
| `whoami` | read | Print the session's user name. |
| `date` | read | Print the current time (server clock, ISO 8601) — not the host machine's clock. |
| `help` | read | List every registered command's synopsis. |
| `version` | read | Print the running `yafs` version. |
| `true` | read | Succeed with no output. |
| `false` | read | Always fail (status 1) with no output. |

### Text

| Command | Access | Meaning |
| --- | --- | --- |
| `echo [WORD...]` | read | Print the given words, space-joined. Human convenience; behavior may not match every host shell. |
| `printf [WORD...]` | read | Print the given words concatenated with no separator — the exact-bytes primitive redirection should target. |
| `grep [-n] PATTERN PATH...` | read | Print lines containing `PATTERN` from each `PATH`. `-n` prefixes matching lines with their line number. |
| `head -n COUNT PATH` | read | Print the first `COUNT` lines of `PATH`. |
| `tail -n COUNT PATH` | read | Print the last `COUNT` lines of `PATH`. |
| `wc -l PATH` | read | Print the number of lines in `PATH`. |

### Filesystem

| Command | Access | Meaning |
| --- | --- | --- |
| `ls [PATH]` | read | List the names in a directory (current directory if omitted). |
| `cat PATH` | read | Print a file's contents. |
| `mkdir PATH` | mutate | Create a directory. The parent must already exist — there is no `-p`. |
| `touch PATH` | mutate | Create an empty file, or update an existing file's modified time. |
| `rm PATH` | mutate | Remove a file. Directories are refused (`is_directory`); this does not recurse. |
| `rmdir PATH` | mutate | Remove an empty directory (`not_empty` if it has children, `not_directory` if it's a file). Still no recursive removal of a non-empty tree. |

### Links and composition

| Command | Access | Meaning |
| --- | --- | --- |
| `ln -s TARGET LINK` | mutate | Create a symbolic link. `-s` is required; only symbolic links are supported. |
| `readlink PATH` | read | Print a symlink's stored target string, unresolved. |
| `union NAME LAYER...` | mutate | Create a new read-only directory at `NAME` that resolves lookups against `LAYER...` in order, first match wins. |

### Inspection

| Command | Access | Meaning |
| --- | --- | --- |
| `stat PATH` | read | Report type (`file`/`directory`/`symlink`), following a final symlink. |
| `lstat PATH` | read | Same as `stat`, but does not follow a final symlink. |
| `origins PATH` | read | List the source path(s) behind `PATH` — every candidate in precedence order for a union, the provider path for a mounted resource. |
| `inspect PATH` | read | Structured JSON: path, type, and full provenance (mount, provider, revision, activation/fetch time). |
| `mounts` | read | List VFS composition: unions and active plugin projections. It has no lifecycle subcommands. |

### Plugin lifecycle and desired configuration

| Command | Access | Meaning |
| --- | --- | --- |
| `plugins describe [NAME]` | read | List built-in plugin definitions, including declared capabilities, actions, and designed-but-disabled exposures. |
| `plugins status` | read | Describe the daemon-selected external configuration. |
| `plugins plan` | read | Read-only reconciliation plan for the selected configuration. |
| `plugins apply [--prune]` | control | Activate or refresh declared plugin instances; only `--prune` removes undeclared active instances. |
| `plugin deactivate ID` | control | Durably detach an active plugin projection. |

A daemon configuration is external infrastructure-as-code, selected by
`yafsd --config FILE` or `YAFS_CONFIG`; it has no implicit data-directory
default. Its canonical YAML uses `plugins:` and each declaration uses
`plugin:`. The `mount` (singular) command has been removed; `plugins
status|plan|apply` plus `plugin deactivate` above is its sole replacement.
There is no in-VFS way to configure a plugin: `plugin validate|activate|
refresh MANIFEST` accepting a manifest read out of the VFS was removed as a
security fix — writing a file into your own workspace and granting yourself
real external capabilities (a GitHub token, a Slack token, an LLM
credential) were, until this removal, the same permission, since both paths
converged on the identical capability check. `plugin activate`/`validate`/
`refresh` now fail immediately with a message pointing at `yafs.plugins.yaml`
and `plugins apply`; only `plugin deactivate ID` survives, since it grants no
capability and reads no manifest. The older `mounts:`/`provider:` manifest
YAML key spelling is a separate, still-unscheduled compatibility alias (see
the ADR's "Capabilities, distribution, and adapters" removal policy) — don't
build new tooling against it, but existing `yafs.plugins.yaml` files using it
keep working.

```yaml
version: 1
plugins:
  - id: reviews
    plugin: github
    path: reviews
    config: { repository: acme/widget, query: "is:pr is:open", max: 25 }
    capabilities: [network.github-api]
```

A manifest with a field no plugin schema recognizes fails with
`Unknown <section> field: <the field name> (expected one of: <allowed
fields>)` — the offending key and the valid set are always named, not just
"unknown field" with no indication of what or where. `plugins apply`
targeting a VFS path that already holds *something* (a stray plain
directory from an earlier `mkdir`, not necessarily a mount) fails with
`Mount path already exists: PATH` — that content has to be removed first
(`rmdir` if it's an empty directory) before the path can be mounted.

GitHub mounts additionally need an explicit named capability and daemon-held
configuration — see [M5 validation](M5-VALIDATION.md).

### Built-in plugins

| Provider | Config | Capability | Notes |
| --- | --- | --- | --- |
| `fixture` | `{ files: {PATH: CONTENT}, streams?: {PATH: {chunks, intervalMs}} } ` | none required | Static, config-sourced content. `streams` delivers `chunks` into `PATH` on a timer, for exercising background/`ctl` mechanics with no external dependency — not a production feature. |
| `github` | `{ repository, query, max }` | `network.github-api`, `secret.github-token` for authenticated access | Bounded PR query collection; see [M5 validation](M5-VALIDATION.md). |
| `agent` | `{ personas: { NAME: { prompt, endpoint?, model? } }, endpoint?, model? }` | `chat.completion` | Publishes `NAME/prompt.md` per persona from `config.personas.NAME.prompt`. One mount can host several personas. `endpoint`/`model` resolve persona → mount → the `YAFS_LLM_BASE_URL`/`YAFS_LLM_MODEL` env vars, so a single manifest can mix personas backed by different local, OpenAI-compatible model servers. |
| `slack` | `{ channel, max? }` | `network.slack-api`, `secret.slack-token` | Publishes the channel's recent messages as an ordered `NAME/messages.ndjson` snapshot; `channel` is a Slack channel ID (e.g. `C0123456789`), not a name. `secret.slack-token` reads the `YAFS_SLACK_TOKEN` env var daemon-side — there is no per-manifest token field and no `SLACK_CHANNEL_ID` env var; the channel is config, the token is the only secret. See [Slack validation](SLACK-VALIDATION.md). |

### Plugin actions (`ctl`) and exposure boundary

A write to a file named exactly `ctl`, inside a directory a provider or
background driver has registered a handler for, is never stored as content —
it's parsed as a structured action request and dispatched. The write itself
returns as soon as the action is *accepted* (parsed, and — for `agent`
mounts — capability-checked); the underlying work runs outside the command
queue and its result appears later as ordinary durable files. A `ctl` write
targeting an unregistered path, or one whose directory sits under an
otherwise read-only mount with no handler, is written as ordinary content —
`ctl` bypasses the read-only guard by name, not by registration state.

The one shipped action: writing `{"message": "..."}` to an active `agent`
mount's `NAME/ctl` calls that persona's configured model with its `prompt`
as the system prompt. An accepted action writes `status.json` as `queued` and
`request.md` under `NAME/runs/<run-id>/` before the call starts, then moves
through `running` to `complete`/`failed`; `response.md` joins it on success.
The model is always called with `stream: true`, and `response.md` is
republished incrementally (roughly every 100ms) as the reply arrives — a
client can watch a long reply grow by re-reading `response.md`, not just
wait for the final `complete` status. A stuck or failed run is therefore
visible without tailing the daemon log. Invoking a persona without
`chat.completion`, or sending invalid JSON, rejects the write before any run
is recorded; the connection stays open either way.

An optional `chatId` field on the `ctl` payload (or `agent send`'s `--chat
CHATID` flag) turns a one-shot request into one turn of a durable, multi-turn
conversation: the persona's `prompt` becomes the system message, and every
prior turn tagged with that `chatId` is included as real `{role, content}`
history (not a flattened text blob) sent to the model. Turns accumulate at
`NAME/chats/CHATID/messages.ndjson` — one JSON object per line, appended as
soon as each turn is accepted (so a crash mid-run still preserves what was
asked) and again once the reply completes. `--context PATH` and `--chat
CHATID` compose: context still folds into only the *current* turn's message,
exactly as it does without `--chat`.

Yash supplies a friendlier adapter over that same action definition:

```sh
agent send agents/reviewer "Review this change"
agent send agents/reviewer --context source/pulls/482/diff.patch "Review this PR"
agent send agents/reviewer --chat mychat "First turn of a conversation"
agent send agents/reviewer --chat mychat "Second turn, sees the first as history"
agent status agents/reviewer/runs/RUN_ID
agent cancel agents/reviewer RUN_ID
agent personas
agent target agents/reviewer
```

`agent personas` lists every configured persona across active agent mounts
as `{mountPath, persona}` JSON pairs — the read-only introspection surface
`agent chat` uses to pick a default when no persona is named. `agent target
PERSONA` resolves a persona reference (bare name or path, same rules as
`agent send`) to its absolute mount-relative directory, as plain text.

`agent chat [PERSONA]` is a synchronous, interactive, multi-turn
conversation with one persona — defaulting to the sole configured persona if
exactly one exists, otherwise requiring an explicit choice. It's a
client-side yash feature (like `edit`), not a server command: it mints one
`chatId` per chat session, writes each turn directly to the persona's `ctl`
(bypassing yash's command-line quoting entirely, so arbitrary message text —
quotes, `$`, anything — is safe), and polls `response.md` to print the reply
as it streams in. Requires an interactive terminal; see
[agent chat validation](AGENT-CHAT-VALIDATION.md) for a full walkthrough.

`slack send PLUGIN_ID MESSAGE` is the same `ctl`-write mechanism under a
different adapter: it writes `{"message": MESSAGE}` to the named Slack
mount's `ctl` and returns `accepted: PLUGIN_ID` once the write is parsed —
before the Slack API call happens, not after it succeeds. A successful post
refreshes `messages.ndjson` to include it; a failed post (bad channel,
network error, revoked token) writes `last-error.json` with the message text,
error detail, and timestamp instead of raising a Yash error, since the
write already returned by the time the post is attempted. There is currently
no durable record of an in-flight send between the `ctl` write and either
outcome — see the M6.4 roadmap entry in `FEATURE-ROADMAP.md`.

`plugins describe agent` also reports a planned `conversation` HTTP exposure.
That is metadata, not a listening endpoint: no plugin can open a port by being
installed or activated. A future exposure must be separately enabled by the
operator with a bind address, authentication, scope, quota, and audit policy.

### Durable local cache

`cache` is a built-in local service, not a remote provider mount or a Redis
compatibility claim. It stores one UTF-8 value in the shared content-addressed
blob store and writes inspectable metadata under `cache/metadata/`.

| Command | Meaning |
| --- | --- |
| `cache put --ttl DURATION KEY VALUE` | Atomically publish a value with an explicit `ms`, `s`, `m`, or `h` TTL. |
| `cache get KEY` | Return the active value; expired entries are a cache miss. |
| `cache stat KEY` | Return metadata with `active` or `expired` state. |
| `cache delete KEY` | Remove the entry and release its retained blob after the VFS mutation commits. |
| `cache gc` | Reclaim unretained blobs, including bytes behind expired entries. |

The first contract accepts UTF-8 values up to 1 MiB and TTLs up to one year.
It does not fetch upstreams, evict active entries, implement Redis operations,
or expose a network service. Local JSON-lines clients can use typed
`cache` requests (`put`, `get`, `stat`, `delete`, `gc`) through the same daemon
protocol; Yash is only one adapter.

`--context` snapshots the named UTF-8 virtual file into the accepted run's
`context.md`; the model receives that exact captured text. Cancellation is a
durable terminal state and suppresses a late model response, although it does
not yet abort an already-issued HTTP request.

### Durable artifacts

| Command | Access | Meaning |
| --- | --- | --- |
| `trace SOURCE ARTIFACT_DIRECTORY` | mutate | Capture a directory’s current UTF-8 Yafs files into content-addressed blobs, then durably write `ARTIFACT_DIRECTORY/trace.json`. Provider-backed sources include provenance and an immutable resource reference when their provider supplies one. |
| `reify ARTIFACT_DIRECTORY DESTINATION` | mutate | Reconstruct a trace at a new, absent local directory. It reads local blobs first; a daemon-installed provider reifier may restore a missing blob only from the recorded immutable reference. It never reads the current mount path as fallback. |
| `blobs gc` | control | Explicitly reclaim zero-reference blobs. On `yafsd`, this runs in the serialized request queue after startup has rebuilt trace retention from durable manifests. |

Traces currently capture Yafs's UTF-8 text file surface. The blob store itself
stores bytes; binary VFS file semantics are a separate kernel extension, not
silently emulated by text decoding.

## Automation and MCP

The versioned loopback RPC protocol is the automation API; terminal text is not
the protocol. `yafs-mcp` currently exposes only safe workspace inspection:

- `yafs.list PATH`
- `yafs.read PATH`
- `yafs.inspect PATH`

`yafs.query SOURCE` evaluates one **read-only** Yash command for an agent or
script. It parses the source first and rejects redirects, session changes,
mount lifecycle changes, and every mutating command, including in a command
substitution — so an MCP agent cannot trigger a `ctl` action today; only a
`yash` session or a raw structured write can. A broader operator execution
tool must remain distinct from host-process execution.

## Deliberately not implemented

Pipes, loops, conditionals, `find`, recursive removal of a non-empty tree
(`rmdir` only removes an empty directory), `mv`/`cp`, host execution, and an
MCP tool for writing (including `ctl`) are not available yet. Provider
actions themselves are implemented (`ctl`, one shipped action on `agent`
mounts) — GitHub-specific actions like commenting on a PR are not; see
"Provider actions" above.
