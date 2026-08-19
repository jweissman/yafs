# Yafs

Yafs is a local-first operating environment for bounded humans and agents. It
combines live, provider-backed views of external systems with private working
space and explicit, inspectable actions.

The point is not to make every API look like a file. The point is to give a
task a coherent world that people and agents can explore with the same paths,
provenance, and authority boundaries.

```text
live provider views          private work              explicit effects
/world/github/...       +   /home/<actor>/...     +   typed actions/runs
```

Yash, loopback RPC, MCP, and a future local operator UI are clients of the
same service. A provider may project a read-only resource tree and separately
declare typed actions; browsing never implies authority to act.

Yafs is intentionally not a POSIX implementation, a general host shell, or a
drop-in replacement for Redis, S3, Kubernetes, or Docker. Those may become
narrow adapters or experiments only when they can honestly use the kernel
without widening its authority model.

## Start here

For a local durable workspace:

```sh
yafsd start
yash
```

```sh
yash:/home/root$ mkdir notes
yash:/home/root$ echo "hello" > notes/first.md
yash:/home/root$ cat notes/first.md
hello
```

`yash --local` is an ephemeral, in-process development session. `yash -c
'COMMAND'` runs one non-interactive command.

## Learning trails

- **Operate a local workspace** — start above, then use the [Yash command
  reference](COMMANDS.md) for paths, inspection, composition, and daemon
  lifecycle.
- **Configure a provider projection** — read the [provider reference](PROVIDERS.md),
  then use `plugins status`, `plugins plan`, and `plugins apply` against the
  daemon-selected host-side YAML. For a Git-backed source tree, follow the
  [git source walkthrough](GIT-SOURCE-SETUP.md).
- **Use an agent safely** — the [product spec](PRODUCT-SPEC.md) describes
  `/world`, private workspaces, bounded tools, actions, and the intended task
  environment. The current MCP and agent surfaces are in [COMMANDS.md](COMMANDS.md).
- **Understand why a capability exists** — the [ADR decision index](ADR.md)
  states the durable constraints; the [feature roadmap](FEATURE-ROADMAP.md)
  states what is actively being proved next.

## Current product direction

The next product proof is an engineering investigation desk: a bounded agent
should be able to inspect repository, CI, Slack, and eventually incident data;
produce a cited diagnosis; and propose a separately approved handoff to a
coding actor. This tests the broader thesis — an agent can inhabit a legible,
scoped world — rather than merely demonstrating another chat bot.

The longer horizon is a world of provider projections, faceted task views,
reviewed local procedures under `/commons`, and later federation under an
identity/trust model. It is a direction, not a promise that every integration
or infrastructure protocol will ship.
