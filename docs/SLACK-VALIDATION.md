# Slack provider validation

The Slack provider was built and moved (`src/plugins/slack/`) without a
dedicated validation doc before now — `slack send` has been confirmed working
against a real workspace and channel by hand, but there was no runbook to
repeat that check or exercise the failure path. This is that runbook.

Run the full project gate first:

```sh
bun check
bun test test/slack_api_client.test.ts test/slack_commands.test.ts test/slack_provider.test.ts
```

## Live setup

You need a Slack app/bot token with `channels:read` and `chat:write` scope,
invited to the channel you'll post to, and that channel's ID (not its name —
right-click the channel in Slack, "Copy channel ID", looks like
`C0123456789`).

```sh
export YAFS_SLACK_TOKEN=xoxb-...
```

`YAFS_SLACK_TOKEN` never enters a manifest, VFS file, WAL, or audit log — the
manifest only requests the `secret.slack-token` capability; the daemon reads
the token from this env var at request time. There is no
`SLACK_CHANNEL_ID` env var and no per-manifest token field — the channel is
ordinary manifest config, not a secret.

Create a manifest:

```yaml
version: 1
plugins:
  - id: updates
    plugin: slack
    path: updates
    config: { channel: C0123456789, max: 25 }
    capabilities: [network.slack-api, secret.slack-token]
```

Save it as `yafs.plugins.yaml`, then from a clean local appliance:

```sh
bun run yafsd -- start --config yafs.plugins.yaml
bun run yash
plugins apply
cat updates/messages.ndjson
```

`yafsd start` runs the daemon detached — its stdout/stderr go to
`<dataDir>/daemon.log`, not your terminal, so nothing prints where you ran
`start`. Keep a second terminal open with `bun run yafsd -- logs --tail`
(same `--config`/`YAFS_DATA_DIR` as above) to watch this in real time —
every session/tool-call/poll-failure/reply-abandoned line this doc
mentions below lands there, live, as it happens. `bun run yafsd -- logs`
with no `--tail` just prints the last 50 lines and exits, useful for a
quick "what happened" check without leaving a terminal open.

There is no in-VFS way to activate a plugin — `yafs.plugins.yaml`, selected
by `yafsd --config`, is the only mechanism that can grant a capability.

Confirm `messages.ndjson` has one JSON line per recent channel message, most
recent last, and that it matches what's actually in the channel.

## 1. Send a message and confirm the round trip

```text
slack send updates "validation pass, ignore this"
cat updates/messages.ndjson
```

Confirm the command returns `accepted: updates -> updates/outbox/<actionId>`
immediately — before you've had time to check Slack — then confirm the
message actually appears in the real channel, and that `messages.ndjson`
picks it up on the next read (the driver refreshes the snapshot after a
successful post; if it hasn't landed yet, `plugins refresh updates` forces
it). Also confirm the durable record the accepted path names:

```text
cat updates/outbox/<actionId>/message.md
cat updates/outbox/<actionId>/status.json
```

`message.md` should hold the exact text you sent; `status.json` should show
`{"state":"succeeded", ...}` with `startedAt`/`completedAt` timestamps once
the post lands (it's `"running"` in the brief window before that). See §5
for what this record is for and how to validate it survives a crash.

## 2. Confirm the failure path is visible, not silent

Add a second instance to `yafs.plugins.yaml`, alongside `updates`, with a
different `id`/`path` and a channel the bot token can't post to (wrong ID, or
a real channel the bot was never invited to) — a different `path` matters:
activating a second instance at the same `path` as the still-active `updates`
mount fails with `Mount path already exists`, not the failure this step is
trying to exercise.

```yaml
version: 1
plugins:
  - id: updates
    plugin: slack
    path: updates
    config: { channel: C0123456789, max: 25 }
    capabilities: [network.slack-api, secret.slack-token]
  - id: wrong
    plugin: slack
    path: wrong-channel
    config: { channel: C_WRONG_ID, max: 25 }
    capabilities: [network.slack-api, secret.slack-token]
```

```text
plugins apply
slack send wrong "this should fail"
cat wrong-channel/last-error.json
```

Confirm the `slack send` command still returns
`accepted: wrong -> wrong-channel/outbox/<actionId>` (the write is durably
recorded as `queued` before the API call happens — the durable record exists
first, then the network attempt), and that `last-error.json` then appears
with the attempted message text, an error detail from the Slack API
(`channel_not_found` or similar), and a timestamp. Also confirm
`wrong-channel/outbox/<actionId>/status.json` shows `{"state":"failed",
"error": "..."}` — the same failure, visible two ways: the legacy
`last-error.json` snapshot and the per-action outbox record. This is the
whole point of checking it: a failed send must be discoverable by reading a
file, not by noticing a message never arrived.

## 3. Confirm the capability gate, not just the happy path

Add a third instance to `yafs.plugins.yaml`, copying the `wrong` entry from
step 2 with its `id` changed to `ungated` and `path` to `ungated-channel`
(again, a fresh path — reusing `wrong-channel` collides with the still-active
mount from step 2), and set `capabilities: []`. Then:

```text
plugins apply
```

should fail with `Capabilities are not granted: network.slack-api,
secret.slack-token` — the mount never activates without both, so there's no
window where a `slack send` could reach `SlackDirectoryDriver` ungated.

## 4. Inbound bridge: a real Slack message reaches a persona and a reply comes back

Requires an `agents` mount alongside `updates`, and `persona:` added to the
Slack config to opt that channel into inbound polling. By default the
poller only routes messages that `@mention` the bot — this is a safety
default for shared/populated channels, not a hardcoded requirement; see
§4b below for turning it off on a channel you know is effectively 1:1
with the bot.

```yaml
version: 1
plugins:
  - id: agents
    path: agents
    plugin: agent
    config:
      personas:
        reviewer:
          prompt: "You are a terse, careful code reviewer."
          tools: { roots: ["/home/root"], maxCalls: 30 }
    capabilities: [chat.completion]
  - id: updates
    plugin: slack
    path: updates
    config: { channel: C0123456789, max: 25, persona: reviewer }
    capabilities: [network.slack-api, secret.slack-token]
```

The persona's `tools:` block is what makes the completion request carry a
`plugin` integration at all — without it, LM Studio never sees
anything MCP-related, by design (`AgentRunExecutor` only takes the
tool-completion path when `persona.tools` is set). This is easy to trip
over live: `docs/AGENT-TOOLS-VALIDATION.md` uses a persona also named
`reviewer`, but its manifest sets `tools:`; this doc's manifest, above, did
not until this line was added. If you ask a Slack-routed persona "can you
use the yafs mcp" and see no sign of it in LM Studio, check this first
before assuming the wiring is broken. Combining Slack routing with actual
tool use (the scenario in `docs/AGENT-TOOLS-VALIDATION.md`) hasn't been
validated end-to-end as one flow — only each half separately.

Also: don't rely on LM Studio's UI alone to tell you whether it reached the
tool server at all — watch `yafsd`'s own stdout, which now logs `agent tool
session started for agents/reviewer` (or `... rejected ...: no such
tool-enabled persona` if the `tools:` block is missing/misapplied) the
moment a request lands, plus one `agent tool call: <name>` line per actual
tool invocation. See `docs/AGENT-TOOLS-VALIDATION.md` §0 for the full
walkthrough of this signal.

Separately: `plugins apply` returning `[]` is not a failure signal by
itself. `yafsd` reconciles its config file against a fresh manifest hash
at startup (`server.ts`'s `await s.reconcile()`), so if you connect and run
`plugins apply` without having changed the file since the daemon started,
`[]` correctly means "nothing to do," not "nothing happened." It only
means something's wrong if you *just* edited the config and still get
`[]` — in that case the daemon may be reading a different file than the
one you edited (check `yafsd`'s `data:` path and how it was started with
`--config`).

```sh
plugins apply
```

Wait at least one poll interval (default 3s) before posting anything. The
mount's first tick after activation only establishes a baseline cursor and
processes nothing — this is deliberate (see "Known gaps" below): it means
an old `@mention` already sitting in the channel's history from before the
bridge was configured is never retroactively picked up.

From the real Slack channel (not `slack send` — an actual message typed by a
human or posted via another tool, so the inbound poller has something new to
find), **@mention the bot** in a message (e.g. `@reviewer-bot can you check
this?` — use Slack's actual autocomplete to insert the mention, not typed
text, so it resolves to `<@BOTUSERID>`), then watch for the reply to land in
the same channel within a few poll intervals. Also post a message in the
same channel *without* mentioning the bot and confirm it is never picked up
— this is the main behavior this section validates.

You should see a 👀 (`eyes`) reaction appear on your message almost
immediately (added right after the message is routed, before the model has
replied) and disappear once the reply posts — a live "it's working on
this" indicator, independent of and faster than the reply itself. It's
best-effort: a reaction failure is logged (`Slack reaction update failed:
...`) but never blocks the actual reply. If you see the reaction appear
but never disappear, the run is still in progress or got abandoned — check
`agent status` / `yafsd logs` rather than assuming the reaction itself is
broken.

The chat id is deterministic, not random — `channelChatId()` builds it as
`slack-<mountId>-<channel>`, so for this manifest (`id: updates`, `channel:
C0123456789`) it's `slack-updates-C0123456789`. Yash does not do glob
expansion (`chats/*/...` is a literal path, not a wildcard, and will fail
to resolve), so either name it directly or list first if unsure:

```text
ls agents/reviewer/chats
cat agents/reviewer/chats/slack-updates-C0123456789/messages.ndjson
```

should show a `user` turn whose content is prefixed with the Slack sender's
user ID (`"U0123456: <your message>"`, with the mention token itself
stripped out) followed by an `assistant` turn with the reply — and the
reply should also now be visible in the real Slack channel, posted through
the ordinary `slack send` ctl path (confirm this by checking `cat
updates/messages.ndjson` picks it up, same as §1).

Post a second mentioning message in the same channel and confirm it appends
to the *same* `chats/<chatId>/messages.ndjson` rather than starting a new
one — the bridge keys one continuous conversation per channel, not per
message.

Finally, confirm the bot does not reply to itself: after its own reply
posts, no new run should start from that post. If it did, you'd see runaway
back-and-forth replies in the channel; seeing exactly one reply per human
message, with no follow-on reply to the bot's own text, confirms the
identity filter (`SlackApiClient.identity`) is working.

## 4b. Turning off the @mention requirement for a 1:1 channel

If a channel is genuinely just you and the bot (a DM-equivalent, not a
shared team channel), requiring `@mention` on every message is unnecessary
friction. Add `requireMention: false` to that specific mount's config —
this is an explicit, per-channel opt-out, not a global default change:

```yaml
    config:
      channel: C0123456789
      max: 25
      persona: reviewer
      requireMention: false
```

```sh
plugins apply
```

Post a plain message with no `@mention` and confirm it is now routed and
replied to, the same as a mentioning message would be in §4. Confirm the
identity/self-reply filter (§4's last paragraph) still holds — that check
is independent of `requireMention` and always applies.

**Only turn this off on channels you control the membership of.** The
reviewer concern this default exists for is real: on a channel with other
people in it, `requireMention: false` means the bot replies to every
message anyone posts, not just ones meant for it.

## 5. Durable outbox survives a daemon restart mid-send

This validates M6.4: the write is durably recorded as `queued` before the
API call happens, so a crash mid-send can't silently lose the record of what
was attempted. You can exercise this without a real Slack call by pointing
`slack send` at the `wrong` mount from §2 (any target works — the crash
happens before the outcome matters) and killing the daemon in the narrow
window after `accepted:` returns:

```text
slack send wrong "durability check"
```

Immediately (same terminal, right after `accepted:` prints):

```sh
kill -9 <yafsd pid>
cat <datadir>/wrong-channel/outbox/<actionId>/status.json   # before restart, if you're fast enough
bun run yafsd -- start --config yafs.plugins.yaml
bun run yash
cat wrong-channel/outbox/<actionId>/status.json
```

If the daemon is killed while the action is still `queued` or `running`,
recovery on restart (`SlackOutboxRecovery`, run from `recoverAll` at
startup — the same seam `AgentRunRecovery` uses) marks it `"unknown"`, with
an error explaining the daemon restarted while the action was in flight.
This is deliberately **not** `"interrupted"` (what a half-finished agent run
gets) and not auto-retried: unlike an in-progress model call, a half-sent
Slack post may already have landed, so retrying risks a double-post and
silently dropping it risks losing a message the operator thinks went out.
`"unknown"` means: check Slack directly before deciding what to do. Confirm
the message never lands twice in the real channel across a few repeats of
this test with the `updates` mount instead of `wrong`.

## Known gaps this doc deliberately does not re-litigate

**Call the inbound side "at-least-once, mention-filtered inbound delivery,"
not "durable inbound event."** The baseline cursor and `@mention` filter
(§4) are safe-ish filtering mechanics — they stop replay-on-restart and
stop replying to unaddressed messages — not a durable event record with
its own accept/commit step the way M6.4's outbox has for the outbound
leg. The gap below is exactly why that distinction matters.

The M6.4 durable outbox (§5) closes the outbound fire-and-forget gap this
section used to describe — both `slack send` and §4's inbound-bridge reply
leg now go through it. What §5 does not close: the *inbound* leg. The
inbound poller's last-seen cursor is in-memory only, but a restart no
longer re-delivers prior messages as new — a mount's first tick after
`yafsd` starts only establishes a baseline (the latest message's
timestamp) and processes nothing, so a restart cannot produce a duplicate
reply to an already-answered message. What remains a real, smaller gap: if
`yafsd` restarts in the narrow window after a message arrived but before
that tick's `route()` call has durably dispatched it to the persona, that
specific inbound message is silently dropped rather than retried or
duplicated — silent loss, not duplication. Closing that needs a durable
cursor and a durable record of in-flight routing, which is the same class
of work as M6.4/M6.5, not fixed this milestone.
