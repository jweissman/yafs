# Yafs

Yafs is a local-first workspace appliance: one durable, composable filesystem
tree that can combine local files with explicit, capability-scoped provider
mounts. Yash (the interactive shell), the loopback RPC protocol, and an MCP
adapter are equal clients of the same `yafsd` service.

It is not a POSIX shell, a host command runner, or a drop-in Redis, S3,
Kubernetes, or Docker replacement.

## Getting started

One-time setup so `yafsd` and `yash` are plain commands on your `PATH`:

```sh
bun link
```

Then start the daemon and connect a client:

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

## Mounting a provider

A `.yafsmeta` manifest declares a provider-backed subtree. `mount` is a
control-plane command with four subcommands — see the "Mount lifecycle" row
in the [command reference](COMMANDS.md#commands) for the full syntax and side
effects of each. Concretely, with the fixture provider (no network access
needed, so this works with nothing else configured):

```sh
yash:/home/root$ printf '{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hi}}, capabilities: []}]}' > .yafsmeta
yash:/home/root$ mount validate .yafsmeta
{"id":"demo","path":"/home/root/fixture","provider":"fixture","config":{"files":{"hello.txt":"hi"}},"manifestPath":"/home/root/.yafsmeta","manifestDigest":"d7dcff...","revision":"fixture:d7dcff6f4aef","state":"active","activatedAt":"2026-08-03T22:19:39.987Z","correlationId":"demo:2026-08-03T22:19:39.987Z","capabilities":[]}
yash:/home/root$ mount activate .yafsmeta
demo active
yash:/home/root$ cat fixture/hello.txt
hi
yash:/home/root$ inspect fixture/hello.txt
{"path":"/home/root/fixture/hello.txt","type":"file","origins":[{"kind":"provider","path":"/home/root/fixture/hello.txt","mountId":"demo","provider":"fixture","revision":"fixture:d7dcff6f4aef","activatedAt":"2026-08-03T22:19:40.040Z","readOnly":true}]}
```

`validate` is a pure dry run — it parses and reports the proposed mount
record with no side effects, network activity, or durable state; nothing
changes until `activate`. Once active, the mount is read-only (`echo x >
fixture/hello.txt` fails with `read_only_mount`) and every path beneath it
carries structured provenance — `inspect` shows exactly which mount and
provider a file came from, not just its content. See [M5
validation](M5-VALIDATION.md) for the same flow against a real GitHub
collection, including GitHub Enterprise Cloud/Server host configuration.

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
- [Product spec](PRODUCT-SPEC.md) — operator-facing provider promise and acceptance criteria.
- [Architecture decision record](ADR.md) — kernel decisions, invariants, and deferred design work.
- [Feature roadmap](FEATURE-ROADMAP.md) — implementation order, current status, and what's gated.
