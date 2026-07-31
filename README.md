# Yafs

Yafs is a local-first, composable workspace service. Its kernel makes local
state, links, and read-only unions inspectable through one virtual tree; future
providers may add explicit, capability-scoped mounts.

`yafsd` is the loopback service and `yash` is its interactive client. This is
not a POSIX shell, a Redis clone, or a container orchestrator. Git/GitHub,
cache, agent, remote, and runtime capabilities are deliberately gated work,
not ambient behavior.

Current capabilities include an in-memory VFS with symlinks and ordered unions,
a small command language, and a versioned loopback JSON-lines service. The local
appliance journals checksummed VFS operations before applying them, recovers a
torn final record, rejects earlier corruption, snapshots/compacts durable state,
and locks its data directory. `yafsd serve` runs in the foreground; `start`,
`stop`, `restart`, and `status` manage a detached process through the selected
data directory. Authenticated remote access and plugin activation are not
implemented yet.

See the [ADR](docs/ADR.md) for product decisions and acceptance criteria, and
the [feature roadmap](docs/FEATURE-ROADMAP.md) for implementation sequencing.
