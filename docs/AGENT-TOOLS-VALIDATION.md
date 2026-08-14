# M6.5 bounded agent evidence tools — validation

This is the manual runbook for M6.5 against a real LM Studio instance.
Automated coverage (`test/plugins/agent/AgentToolServer.test.ts` — a real
MCP client driving the real HTTP/session/budget stack end-to-end;
`test/mcp/ScopedMcpClient.test.ts`, `test/mcp/McpServerScoping.test.ts`,
`test/plugins/agent/LmStudioMcpClient*.test.ts`, `test/e2e/AgentTools.test.ts`)
proves Yafs's own side of the contract — scoping, budgets, durable
transcript, threading — against fakes and a real (but locally-driven) MCP
client. It does not prove a real model actually calls a real MCP server
correctly end to end. This doc closes that gap.

Run the automated layer first:

```sh
bun test test/plugins/agent/ test/mcp/ test/e2e/AgentTools.test.ts
```

## What M6.5 actually is

Yafs does not parse or execute tool calls itself, and there is no manual
LM Studio-side setup step *for the tool server itself* — but there is a
real `mcp.json` involved, and it matters why. A tool-enabled persona
(`persona.tools.roots` in the manifest) has its requests routed to LM
Studio's native `/api/v1/chat` endpoint with an `integrations` field Yafs
computes itself — a `plugin` entry (`{"type": "plugin", "id":
"mcp/yafs-<mountId>-<personaName>"}`) referencing an entry a background
driver, `AgentToolMcpSync`, keeps written into `~/.lmstudio/mcp.json`
pointing at Yafs's own **`AgentToolServer`**, a single persistent HTTP
listener `yafsd` starts alongside itself.

This is *not* the `ephemeral_mcp` integration type (a URL supplied inline,
per request) that an earlier version of this design used — LM Studio added
an SSRF guard that rejects any `ephemeral_mcp` URL resolving to a loopback
or private address, specifically because that URL can be supplied by
whoever calls the API, not necessarily whoever administers the machine.
`mcp.json` is exempt: registering an entry there already requires local
filesystem access, so there's no remote-attacker path through it — it's
LM Studio's actual intended mechanism for a local MCP server, not a
workaround. `AgentToolMcpSync` keeps that file's `yafs-`-prefixed entries
synced to whichever personas are currently tool-enabled (added on
`plugins apply`/`refresh`, removed if a persona's `tools:` goes away) and
never touches any other entry in the file, so you still never hand-edit
it — you just shouldn't be surprised it exists and is real.

LM Studio connects to the registered URL directly, drives its own MCP
tool-calling loop against it, and returns the finished `output` array
(tool calls plus the final reply) — same as `ephemeral_mcp` did; only how
LM Studio discovers the URL changed, not who executes the tool-calling
loop (still LM Studio, not Yafs).

Per persona, the server URL is `http://127.0.0.1:<port>/mcp/<mountId>/<personaName>`,
where `<port>` is fixed (default `7338`, override with
`YAFS_AGENT_TOOLS_PORT`) rather than randomly assigned — a stable port is
what lets `AgentToolMcpSync` register a URL in `mcp.json` that's still
correct after a `yafsd` restart, instead of going stale every time.
Budgets (call count, deadline) are tracked per MCP session, not globally,
using the Streamable HTTP transport's own session mechanism — a session
starts on the first `initialize` call LM Studio makes for that turn and is
torn down when LM Studio closes it, so a fresh budget applies to each
agent run.

## 0. Setup

**LM Studio side:**

1. Start LM Studio's local server (Developer tab → toggle on, or `lms
   server start`).
2. Load a model with tool-use support — prefer one with LM Studio's
   "native" tool-use badge (e.g. `qwen2.5-7b-instruct`) over a "default"
   (prompt-emulated) one for a first pass; a small local model may not
   reliably use tools correctly even when told to, and you want to
   isolate "does the wiring work" from "is this model any good at it."
3. In Server Settings, enable **"Allow calling servers from mcp.json."**
   This is not optional — Yafs's `integrations` entry is always `type:
   "plugin"`, referencing an entry `AgentToolMcpSync` writes into
   `~/.lmstudio/mcp.json`, and LM Studio rejects that integration type
   entirely if this setting is off. ("Allow per-request MCPs" is the
   *other* setting, for the `ephemeral_mcp` integration type — Yafs
   doesn't use that one (LM Studio's SSRF guard blocks loopback URLs for
   it), so it doesn't need to be on.)
4. This setting requires **"Require Authentication"**, which LM Studio
   enables together with it — generate an API key/access token in Server
   Settings and set `YAFS_LMSTUDIO_ACCESS_TOKEN` in your daemon's
   environment (e.g. `.env`, gitignored) before starting `yafsd`.
   `LmStudioMcpClient` sends it as `Authorization: Bearer <token>` on
   every request once set; every request fails (not just MCP-related
   ones) if this is required and missing.

**Yafs side — confirm the tool server itself before involving LM Studio at
all**, so a failure later is unambiguously LM Studio's side, not yours.
Start `yafsd` (`yafsd start` runs it detached — output goes to
`<dataDir>/daemon.log`, not your terminal; run `yafsd logs --tail` in a
second terminal to watch it live, or `yafsd serve` in the foreground
instead if you'd rather see it in the same terminal you started it from)
and confirm you see:

```text
yafsd listening on 127.0.0.1:7337; data: .yafs
agent tool server listening on 127.0.0.1:<port>
```

That second line only appears because `AgentToolServer` is an in-process
HTTP listener `yafsd` starts itself, alongside its own socket — not a
subprocess, not something you launch separately, not something LM Studio
spawns. Confirm it's actually reachable with a plain request (no MCP
client, no LM Studio) before configuring anything:

```sh
curl -i http://127.0.0.1:<port>/mcp/agents/reviewer
```

A plain `GET` with no session always returns `400` regardless of whether
`agents`/`reviewer` exist yet — the point isn't the status code, it's that
you get an HTTP response at all, proving the listener is up and reachable
independent of everything downstream.

After `plugins apply` with a tool-enabled persona active, check
`~/.lmstudio/mcp.json` directly:

```sh
cat ~/.lmstudio/mcp.json
```

You should see a `yafs-agents-reviewer` (or whatever `<mountId>-<personaName>`
resolves to) entry under `mcpServers`, with a `url` matching the port from
`yafsd`'s startup line. If it's missing, `AgentToolMcpSync` hasn't run yet
(it syncs at daemon startup and after every `plugins apply`/`refresh` — it
should already be there) or the persona isn't actually tool-enabled (no
`tools:` in its config). Any other entries already in that file (your own
manually-configured MCP servers) should be untouched — that's the whole
point of the `yafs-` key prefix.

**LM Studio may need to notice the file changed.** Whether it hot-reloads
`mcp.json` or needs its server toggled off/on (or the app restarted) to
pick up a new/changed entry hasn't been confirmed here — if a tool-enabled
run fails with an MCP connection error even though the entry above looks
correct, try restarting LM Studio's server before assuming something else
is wrong.

Once a real model turn runs, watch `yafsd`'s stdout for confirmation that
LM Studio actually reached the tool server — this is the fastest way to
tell "LM Studio never called it" apart from "it called it and something
else went wrong":

```text
agent tool session started for agents/reviewer
agent tool call: yafs.list
```

If instead you see `agent tool session rejected for agents/reviewer: no
such tool-enabled persona`, the persona you're hitting doesn't have
`tools:` configured (or the mount/persona name in the URL doesn't match
what's active) — check the manifest actually applied, not the transport.
If you see neither line at all after a turn that should have used a tool,
LM Studio never sent the request — check its "Allow calling servers from
mcp.json" setting, check `~/.lmstudio/mcp.json` actually has the entry
(above), and that the persona's completion actually carries an
`integrations` entry (only personas with `tools:` get one; see
`AgentRunExecutor`'s tool-completion branch).

Separately, LM Studio's `/api/v1/chat` endpoint (what every tool-enabled
persona's turn goes through) requires `model` on every request — it does
not infer "whichever model is currently loaded" the way the plain
`/chat/completions` path some setups tolerate does. If a run fails with
`missing_required_parameter: model`, set the persona's `model:` (or the
mount's, or `YAFS_LMSTUDIO_MODEL` daemon-side) to the exact identifier LM
Studio shows for the loaded model. This is a *different* env var than
`YAFS_LLM_MODEL` — that one only covers the plain-text completion path a
tools-less persona uses (`ChatCompletionClient`), not this one
(`LmStudioMcpClient`); see `docs/COMMANDS.md`'s `agent` provider row.

## 1. Configure a tool-enabled persona against a real PR queue

A single captured diff is a bad test root — it's one file, and an agent
with `read`/`list`/`find`/`grep` gains nothing over just pasting that file
as `--context`. Use something that actually requires navigating: M5's
GitHub provider already publishes a **queue** of open PRs
(`<mount>/pulls/<n>/{diff.patch,metadata.json}`, one pair per PR, up to
`max`) — nothing here needs to be fabricated. Reuse
[M5-VALIDATION.md](M5-VALIDATION.md)'s setup (`YAFS_GITHUB_TOKEN`, a real
repo) and add a tool-enabled persona scoped to the same mount:

```yaml
version: 1
plugins:
  - id: review
    path: reviews
    plugin: github
    config: { repository: <owner>/<repo>, query: "is:pr is:open", max: 8 }
    capabilities: [network.github-api, secret.github-token]
  - id: agents
    path: agents
    plugin: agent
    config:
      personas:
        reviewer:
          prompt: >
            You are a terse triage reviewer. When asked to review or triage
            pull requests, investigate them with your tools and identify
            any that look low-risk / safe to merge as-is (tiny diffs,
            docs/comments/formatting/version-bump-only changes) versus
            ones that need real review. Cite specifics from the diff. Never
            claim to have scanned, checked, or investigated something
            unless you actually called a tool to do it — if you haven't
            looked, say so. For messages that aren't asking about PRs
            (greetings, unrelated questions), just respond naturally and
            briefly; don't force every reply into a PR-triage frame.
          endpoint: "http://localhost:1234/api/v1"
          tools:
            roots: ["/home/root/reviews/pulls"]
            maxCalls: 30
    capabilities: [chat.completion]
```

This manifest deliberately omits `model:` — the right identifier depends on
whatever you loaded in LM Studio, so there's no correct value to hardcode
here. Set `YAFS_LMSTUDIO_MODEL=<the loaded model's id>` before starting
`yafsd` instead (once, daemon-wide) rather than repeating `model:` on every
persona; add a persona-level `model:` only if you actually want different
personas on different models. Without one of the two, every tool-enabled
run fails with `missing_required_parameter: model` (see §0 above).

`tools.roots` is required; `maxCalls`/`maxResultBytes`/`deadlineMs` are
optional (defaults: 20 calls, 20,000 bytes, 60s) — `maxCalls` is raised
here because triaging several PRs means several `read` calls, not one.
`endpoint` must point at LM Studio's **native** API base (`/api/v1`, not
the OpenAI-compatible `/v1`) — that's the only field a tool-enabled
persona needs beyond what a plain text persona has.

## 2. Confirm a real tool-driven run

**A connected session is not the same as a tool call.** LM Studio's own log
showing `Connected to plugin 'mcp/yafs-...'` only proves the transport
works — the model still decides per-turn whether to actually call a tool.
A casual message ("hey, good morning") gives a weak local model little
reason to investigate, and a model without strong native tool-use can
respond confidently ("I've scanned the repository and found none") without
having called anything — check `tools.json` for an empty array, not just
the reply text, before trusting a "no PRs" answer. This is exactly why the
persona prompt above tells it never to claim it checked something it
didn't, and why this section's actual test message is a direct, explicit
triage request rather than a greeting.

```text
yash:/home/root$ plugins apply
yash:/home/root$ tree reviews/pulls
```

Confirm the queue actually has more than one PR in it before proceeding —
this scenario only exercises anything with several to compare. Then use
the real pseudobinary, not a raw `ctl` write:

```text
yash:/home/root$ agent send reviewer --chat c1 "Look through the open PRs and tell me which one, if any, looks safe to merge as-is. Explain why."
accepted: reviewer -> agents/reviewer/runs/<runId>
yash:/home/root$ agent status agents/reviewer/runs/<runId>
{"state":"running", ...}
yash:/home/root$ agent status agents/reviewer/runs/<runId>
{"state":"complete", ...}
yash:/home/root$ cat agents/reviewer/runs/<runId>/response.md
yash:/home/root$ cat agents/reviewer/runs/<runId>/tools.json
```

Re-run `agent status` until it reports `complete` (or `failed`) — there is
no blocking "send and wait" command; `agent chat reviewer --chat c1` is the
interactive alternative if you'd rather watch the reply arrive than poll.

`response.md` should name a specific PR and justify the pick with content
that only exists in that PR's diff (not something the model could have
guessed or would say about any PR). `tools.json` should show a `list` or
`tree` call against `/home/root/reviews/pulls` followed by several `read`
calls against different PRs' `diff.patch`/`metadata.json` — evidence the
model actually surveyed the queue rather than answering from the first
thing it saw. If `tools.json` shows exactly one `read` and a confident
answer, be suspicious — that's the same failure mode the single-diff
scenario had, just hidden by there being more files available.

## 3. Confirm scoping actually blocks an out-of-root read

```text
yash:/home/root$ agent send reviewer --chat c2 "Read /home/root/agents/reviewer/prompt.md and quote it back"
```

Confirm the reply does **not** succeed at reading it — `tools.json` should
show a `tool_call` entry whose `output` contains `Path outside allowed
roots`, or a reply where the model reports the tool call failed. If the
read silently succeeds, the manifest's `tools.roots` doesn't cover what you
expected — not a code bug to route around.

## 4. Confirm the byte/call budgets are real, not decorative

Set `maxCalls: 1` on the persona and `plugins refresh agents`, then re-send
§2's triage question — with only one PR's worth of reads allowed, the
model can't compare candidates the way it just did. Confirm a later tool
call in `tools.json` reports a `Tool call budget exceeded` error rather
than the model silently getting away with judging the whole queue off one
read. Separately, with a normal `maxCalls`, find (or temporarily lower
`maxResultBytes` below) a PR whose `diff.patch` exceeds the byte budget,
and confirm the recorded `output` is truncated with the `[truncated:
result exceeded N-byte tool budget]` marker rather than the full diff.

## 5. Confirm multi-turn threading

Send a second message on the same `chatId`, building on the first:

```text
yash:/home/root$ agent send reviewer --chat c1 "Of the PRs you didn't pick, which is the riskiest, and why?"
```

Confirm `agents/reviewer/chats/c1/lmstudio-response-id.txt` changed to a
new `resp_...` id, and that the second reply refers back to specific PRs
from the first answer (LM Studio's own `previous_response_id`
continuation — Yafs never reconstructs the conversation itself for a
tool-enabled persona, so this is LM Studio's memory of the turn, not
Yafs's).

## 6. Confirm a config change takes effect without a restart

While `yafsd` is running, open a new PR against the configured repo (or
close one), then `plugins refresh review` to re-fetch the queue and
`plugins refresh agents`. Start a fresh triage run (new `chatId`, so a new
MCP session/budget) and confirm the updated queue — not the one from
setup — is what the persona actually investigates. No daemon restart, no
LM Studio-side reconfiguration.

## Known gaps this doc deliberately does not re-litigate

`AgentToolServer` is a single HTTP listener shared by every tool-enabled
persona on the daemon, distinguished only by URL path — it is not
sandboxed per persona at the OS/process level. A bug in `ScopedMcpClient`'s
enforcement would be a bug for every persona at once, not isolated to one.
This is an accepted tradeoff for a local, single-operator appliance; it
would need reconsidering before any multi-tenant (M8) scenario.

`ScopedMcpClient`'s root check normalizes both the target path and each
configured root with the same segment-collapsing `normalize()` the VFS's
own path resolver uses (`src/core/PathResolver.ts`), so a `..`-bearing
path can't slip past the check on unresolved text — see
`test/mcp/ScopedMcpClient.test.ts`'s traversal and sibling-prefix cases.
It does not resolve symlinks itself; it relies on `WorkspaceOperations`
resolving those the same way every other Yafs command path does.

`agent chat`'s interactive REPL has not specifically been exercised against
a tool-enabled persona. It should work unmodified — `agent chat` and
`agent send` both reduce to the same `{message, chatId, runId}` ctl write,
and the tool-enabled branch lives entirely in `AgentRunExecutor`, which has
no idea which yash command produced the request — but that's an inference
from the shared code path, not something this doc has separately walked
through. Do §2's run once via `agent chat reviewer --chat c1` instead of
`agent send` to close that gap while you're validating anyway.

`AgentToolServer`'s HTTP listener has no authentication — any local process
that can reach the bound port gets the same tool access LM Studio would.
Consistent with the rest of this appliance's "one trusted local operator"
model (`yafs-mcp` has the same property over its own socket), but it is a
new *listening* surface where the others were request/response-only, so
it's worth naming rather than leaving implicit.

Whether LM Studio hot-reloads `~/.lmstudio/mcp.json` when a new/changed
`yafs-` entry appears, or needs its server restarted/toggled to notice,
has not been confirmed — see the note in §0. If the very first tool-enabled
persona you activate fails to connect even though the mcp.json entry looks
right, that's the first thing to try before assuming a code bug.
`AgentToolMcpSync` also does not remove its entries when `yafsd` shuts
down (deliberately — see the class's own comments for why), so a
`mcp.json` entry pointing at a now-closed port can briefly outlive the
daemon; the next `yafsd start` overwrites it with the current port before
anything tries to use it.
