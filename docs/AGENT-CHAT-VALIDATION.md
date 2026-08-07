# `agent chat` validation

`src/yash/chat.ts`, `chatSession.ts`, `chatPoll.ts`, and `chatTypes.ts` have
no automated test coverage — they're pure client-side yash modules, and
(like `edit.ts` before them) nothing in `test/` imports them, so `bun test
--coverage` never even sees them. This is the manual runbook that stands in
for automated coverage on this layer, matching `docs/M6-VALIDATION.md`'s
role for the agent persona feature it built on.

Everything below runs inside an interactive `yash` session (`bun run yash`)
— `agent chat` refuses to start under `yash -c` or a non-TTY pipe, by
design.

## Setup

Start LM Studio (or any OpenAI-compatible local server) listening at
`http://localhost:1234/v1` — set `YAFS_LLM_BASE_URL` first if yours listens
elsewhere. Without a real server, every step below still runs: the turn is
still accepted and `response.md` still appears, but the run ends in
`failed` with a connection error rather than a reply — useful for
confirming §3's failure path even with no model available.

```sh
bun run yafsd -- start
bun run yash
```

```text
yash:/home/root$ printf '{version: 1, plugins: [{id: agents, path: agents, plugin: agent, config: {personas: {reviewer: {prompt: "You are a terse, careful code reviewer."}}}, capabilities: [chat.completion]}]}' > .yafsmeta
yash:/home/root$ plugin activate .yafsmeta
```

## 1. Sole-persona default and a real multi-turn exchange

```text
yash:/home/root$ agent chat
Chatting with reviewer. Type "exit" to leave.
you>
```

Confirm it resolved the sole configured persona (`reviewer`) without you
naming it. Type a first message and watch the reply grow in place rather
than appear all at once (a long question — "explain in detail how you'd
review a 500-line diff" — makes the streaming easiest to see):

```text
you> explain in detail how you'd review a 500-line diff
<reply streams in token by token, then a blank line>
you> what would you check first
<reply arrives, this time referencing your first question if the model supports context>
you> exit
yash:/home/root$
```

Confirm you're back at the ordinary yash prompt (not still inside chat),
and that the whole exchange is durable and inspectable as ordinary files.
Yash doesn't support wildcard globbing, so list the chat directory first to
find the `chatId` `agent chat` generated, then `cat` it directly:

```text
yash:/home/root$ ls agents/reviewer/chats
<a uuid>
yash:/home/root$ cat agents/reviewer/chats/<that uuid>/messages.ndjson
```

should show four ndjson lines — `user`/`assistant` alternating, your two
messages and the model's two replies, in order. This is the same content
`--chat`'s structured history was built to produce; `agent chat` is just an
interactive adapter over it.

## 2. Ctrl-C during chat returns to yash, not out of it

This is the one thing that's easy to get subtly wrong (a shared SIGINT
listener would abort the *outer* session too — see the comment in
`chatSession.ts`'s `withSigintCleanup` for why). Concretely:

```text
yash:/home/root$ agent chat
Chatting with reviewer. Type "exit" to leave.
you> <press Ctrl-C here, before typing anything>
yash:/home/root$ pwd
/home/root
```

Confirm `pwd` (or any ordinary command) still works immediately after —
the outer REPL must not have been silently killed or left in an aborted
state. Repeat `agent chat` again in the same session afterward to confirm
it's not a one-shot capability.

## 3. Failure path is visible, not silent

With no model server running (or pointed at a deliberately wrong
`YAFS_LLM_BASE_URL`):

```text
yash:/home/root$ agent chat reviewer
Chatting with reviewer. Type "exit" to leave.
you> hello
[failed: Chat completion request failed: ...]
you> exit
```

Confirm the failure prints inline (not a silent hang) and you can still
type another message or exit normally afterward.

## 4. Multiple personas require an explicit choice

Activate a second, differently-pathed manifest alongside the first one from
Setup (same persona-lookup mechanism `agent send` already uses, so this
mirrors the existing "ambiguous persona" test):

```text
yash:/home/root$ printf '{version: 1, plugins: [{id: agents2, path: agents2, plugin: agent, config: {personas: {second: {prompt: "second"}}}, capabilities: [chat.completion]}]}' > .yafsmeta2
yash:/home/root$ plugin activate .yafsmeta2 second
yash:/home/root$ agent chat
```

should print `Multiple personas configured; specify one:
/home/root/agents/reviewer, /home/root/agents2/second` and return you to
the ordinary prompt (no chat loop starts without an explicit choice).
Confirm the listed paths work directly: `agent chat agents/reviewer` (or
`agent chat second`, unambiguous on its own) should start chatting
normally.

## 5. Non-interactive refusal

`agent chat` is a client-side interception in `handleLine` — it only
exists inside the interactive REPL loop. `yash -c "agent chat"` does **not**
reach it at all; `-c` sends its command straight to the server via
`client.execute`, bypassing `handleLine` entirely, so it fails instead with
the ordinary server-side error `agent expects send, status, cancel,
personas, or target` (confirm this if you want, it's a one-line sanity
check, but it's not exercising `chat.ts` — don't mistake it for §5's actual
target).

The `!stdin.isTTY` guard in `chat()` exists for the case where the
interactive REPL loop itself is running against a non-TTY stdin (piped
input, no `-c`) and receives an `"agent chat"` line from the pipe:

```sh
printf 'agent chat\n' | bun run yash --local
```

must print `agent chat requires an interactive terminal` (via `runChat`'s
`console.error`) rather than hanging on a `question()` prompt that can
never be answered from a closed pipe. What happens immediately after (yash
exiting on the subsequent EOF vs. erroring) isn't the point of this check —
just confirm the TTY guard message itself appears and nothing hangs.
