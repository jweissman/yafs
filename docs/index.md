# Yafs

Yafs is a local-first workspace appliance. It gives one privileged local
operator a durable filesystem tree that can combine local files with explicit,
inspectable provider views. Yash, RPC clients, and MCP are clients of the same
service.

The product promise is deliberately small: composed state has clear provenance,
durable local changes survive restart, and actions are explicit rather than a
side effect of browsing a path. It is not a POSIX shell, a host command runner,
or a drop-in Redis, S3, Kubernetes, or Docker replacement.

## Current product

The local appliance supports files, directories, symlinks, read-only ordered
unions, a small Yash language, durable loopback service operation, and
declarative read-only fixture mounts. The local MCP adapter can list, read,
inspect, and run one parser-checked read-only Yash query against the workspace.

## Next proof: M5 review workspace

M5 will mount one filtered GitHub pull-request collection as a bounded,
read-only snapshot. People or local model clients can browse the same source
revision and keep durable local review artifacts bound to that revision. It
does not include GitHub writes, autonomous agents, host execution, public
network access, or a promise of general provider compatibility.

Cache, agents, runtimes, remote service, FUSE, and protocol-compatible adapters
are hypotheses after that proof—not current product commitments.

## Documentation map

- [Yash command reference](COMMANDS.md) — available syntax, commands, and exclusions.
- [Product spec](PRODUCT-SPEC.md) — M5 operator experience and acceptance criteria.
- [Architecture decision record](ADR.md) — kernel decisions and deferred design work.
- [Feature roadmap](FEATURE-ROADMAP.md) — implementation order and current status.
