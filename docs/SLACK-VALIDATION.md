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

There is no in-VFS way to activate a plugin — `yafs.plugins.yaml`, selected
by `yafsd --config`, is the only mechanism that can grant a capability.

Confirm `messages.ndjson` has one JSON line per recent channel message, most
recent last, and that it matches what's actually in the channel.

## 1. Send a message and confirm the round trip

```text
slack send updates "validation pass, ignore this"
cat updates/messages.ndjson
```

Confirm the command returns `accepted: updates` immediately — before you've
had time to check Slack — then confirm the message actually appears in the
real channel, and that `messages.ndjson` picks it up on the next read (the
driver refreshes the snapshot after a successful post; if it hasn't landed
yet, `plugins refresh updates` forces it).

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

Confirm the `slack send` command still returns `accepted: wrong` (the write
is accepted before the API call happens — this is the exact behavior the
M6.4 roadmap entry exists to change), and that `last-error.json` then appears
with the attempted message text, an error detail from the Slack API
(`channel_not_found` or similar), and a timestamp. This is the whole point of
checking it: a failed send must be discoverable by reading a file, not by
noticing a message never arrived.

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
Slack config to opt that channel into inbound polling:

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
    capabilities: [chat.completion]
  - id: updates
    plugin: slack
    path: updates
    config: { channel: C0123456789, max: 25, persona: reviewer }
    capabilities: [network.slack-api, secret.slack-token]
```

```sh
plugins apply
```

From the real Slack channel (not `slack send` — an actual message typed by a
human or posted via another tool, so the inbound poller has something new to
find), post a message addressed to the bot, then watch for the reply to
land in the same channel within a few poll intervals (default 3s):

```text
cat agents/reviewer/chats/*/messages.ndjson
```

should show a `user` turn whose content is prefixed with the Slack sender's
user ID (`"U0123456: <your message>"`) followed by an `assistant` turn with
the reply — and the reply should also now be visible in the real Slack
channel, posted through the ordinary `slack send` ctl path (confirm this by
checking `cat updates/messages.ndjson` picks it up, same as §1).

Post a second message in the same channel and confirm it appends to the
*same* `chats/<chatId>/messages.ndjson` rather than starting a new one — the
bridge keys one continuous conversation per channel, not per message.

Finally, confirm the bot does not reply to itself: after its own reply
posts, no new run should start from that post. If it did, you'd see runaway
back-and-forth replies in the channel; seeing exactly one reply per human
message, with no follow-on reply to the bot's own text, confirms the
identity filter (`SlackApiClient.identity`) is working.

## Known gaps this doc deliberately does not re-litigate

`slack send` posts to the real Slack API via fire-and-forget before any
durable record of the attempt exists (confirmed in `SlackDirectoryDriver.ts`
— `void this.attempt(...)`). §2 above proves the *outcome* is always visible
after the fact; it does not prove a crash between the API call and that
outcome can't lose the record or double-post on retry. That's tracked as
M6.4 in `FEATURE-ROADMAP.md`, not something to fix while validating. §4's
reply leg posts through this exact same undurable path — the inbound bridge
does not close this gap, it inherits it; see the ADR's revised "M7 decision"
section for why this was still shipped ahead of M6.4 closing.

The inbound poller's last-seen cursor is in-memory only: restarting `yafsd`
re-delivers the last `max` messages on that channel as if new, which can
produce a duplicate reply to an already-answered message. Not fixed this
milestone; a real fix needs a durable cursor, which is the same class of
work as M6.4.
