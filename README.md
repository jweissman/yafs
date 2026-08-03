# Yafs

Yafs is a local-first, composable workspace service. Its kernel makes local
state, links, and read-only unions inspectable through one virtual tree, with
explicit, capability-scoped provider mounts — a fixture provider and a real
GitHub pull-request provider today.

`yafsd` is the loopback service, `yash` is its interactive client, and
`yafs-mcp` is a local MCP adapter — all clients of the same service. This is
not a POSIX shell, a Redis clone, or a container orchestrator.

```sh
bun link        # one-time: puts yafsd and yash on PATH
yafsd start
yash
```

See the [documentation](docs/index.md) for a full getting-started guide, the
[product spec](docs/PRODUCT-SPEC.md) for the provider-backed workspace
experience, the [ADR](docs/ADR.md) for decisions and invariants, and the
[feature roadmap](docs/FEATURE-ROADMAP.md) for implementation sequencing.
