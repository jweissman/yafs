# Yafs

Yafs is a local-first workspace appliance: one durable, composable filesystem
tree that can combine local files with explicit, capability-scoped provider
mounts. Yash (the interactive shell), the loopback RPC protocol, and an MCP
adapter are equal clients of the same `yafsd` service.

It is not a POSIX shell, a host command runner, or a drop-in Redis, S3,
Kubernetes, or Docker replacement.

## Getting started

Start the daemon and connect a client:

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

`yash --local` runs an ephemeral, in-process instance with no daemon or
journal — useful for trying the shell without any durable state. `yash -c
'COMMAND'` runs one command non-interactively.

## Configuring plugin projections

Host-side infrastructure configuration declares provider-backed subtrees. Keep
it outside `.yafs`; the daemon data directory holds runtime state, not desired
configuration. A minimal fixture configuration looks like this:

```yaml title="yafs.plugins.yaml"
version: 1
plugins:
  - id: demo
    plugin: fixture
    path: fixture
    config: { files: { hello.txt: hi } }
    capabilities: []
```

Start the daemon with that configuration, then inspect and use the published
projection:

```sh
yafsd start --config yafs.plugins.yaml
yash -c 'plugins status'
yash -c 'cat fixture/hello.txt'
yash -c 'inspect fixture/hello.txt'
```

`plugins status` reports active instances without revealing the host pathname
of the configuration. `plugins plan` is a machine-readable diff: `[]` means
the active namespace is already in sync. After editing the YAML, inspect the
proposed change with `plugins plan` and publish it with `plugins apply`.

Once active, a projection is read-only (`echo x > fixture/hello.txt` fails
with `read_only_mount`) and every path beneath it carries structured
provenance. `inspect` shows which plugin and revision produced a file, not
just its content. See [M5 validation](M5-VALIDATION.md) for the same flow
against a real GitHub collection.

## Automation and agents

`yafs-mcp` lets an MCP client — Claude Code, Claude Desktop, or any other
MCP-speaking agent — browse a running `yafsd` instance without shell access.
It's a separate small process that bridges MCP's stdio protocol to the same
loopback RPC `yash` uses; the agent never gets a shell, only the four tools
below.

With `yafsd` already running, register it (Claude Code example; other MCP
clients take the same command and args, just via their own config):

```sh
claude mcp add yafs -- yafs-mcp
```

Three of its four tools are fixed, narrow operations — `yafs.list PATH`,
`yafs.read PATH`, and `yafs.inspect PATH` do exactly what they say and
nothing else. The fourth, `yafs.query SOURCE`, is different in kind: it runs
one arbitrary **read-only** Yash command — so an agent can `cat`, `ls`,
`inspect`, or `origins` anything it could as a human at the prompt, but the
parser rejects redirects, session changes, mount lifecycle commands, and
every mutating command before it runs, including inside a command
substitution. There is no MCP tool for writing yet — see [the command
reference](COMMANDS.md#automation-and-mcp) for the exact rejection rules.

## Documentation map

- [Yash command reference](COMMANDS.md) — available syntax, commands, and exclusions.
- [M5 validation](M5-VALIDATION.md) — walkthrough for mounting a real GitHub collection.
- [M6 validation](M6-VALIDATION.md) — walkthrough for the agent persona against a real local model server.
- [M6.3 validation](M6.3-VALIDATION.md) — external plugin-instance configuration and lifecycle walkthrough.
- [Product spec](PRODUCT-SPEC.md) — operator-facing provider promise and acceptance criteria.
- [Architecture decision record](ADR.md) — kernel decisions, invariants, and deferred design work.
- [Feature roadmap](FEATURE-ROADMAP.md) — implementation order, current status, and what's gated.
