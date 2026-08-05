# M7 entry validation

M7 should start only when the local appliance can demonstrate a useful,
inspectable hand-off from source material to an explicitly invoked persona.
This is an operator checklist, not an autonomous-agent test.

## Required automated evidence

`bun check` must pass, including coverage for:

- cache expiry, replacement, deletion, collection, and restart retention;
- typed local cache protocol requests carrying values outside shell quoting;
- trace → reify → one-shot agent context preservation; and
- agent cancellation and restart interruption.

## Optional live validation

With a local OpenAI-compatible model service configured, start `yafsd`, mount a
source collection and an agent persona, then run:

```sh
mkdir artifacts
trace source artifacts/review-42
reify artifacts/review-42 restored-42
cache put --ttl 30m review-42-status pending
agent send agents/reviewer --context restored-42/diff.patch "Review this change."
```

Confirm that the run’s `context.md` exactly matches the reified diff, its
status reaches a visible terminal state or can be cancelled, and
`cache stat review-42-status` records an active TTL entry. Restart the daemon
once and verify the trace and active cache entry still read correctly.

## M7 design gate

Before adding `chat`, approve the channel message schema, redaction model,
context snapshot rules, explicit invocation mechanics, and the limits that
would govern any later subscription or automatic turn. The full decision is in
[ADR.md](ADR.md#m7-decision-local-conversation-channels-before-autonomous-orchestration).
