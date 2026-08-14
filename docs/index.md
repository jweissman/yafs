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

```yaml
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
just its content. See [PRODUCT-SPEC.md](PRODUCT-SPEC.md#first-demo-collaborative-pr-review-collection)
for the same flow against a real GitHub collection.

## Local model personas and Slack

The built-in `agent` provider publishes named personas backed by a local
model server (any OpenAI-compatible `/chat/completions` endpoint, or LM
Studio's native API for tool-enabled personas):

```sh
agent send agents/reviewer "Review this change"
agent chat agents/reviewer
```

`agent send` is one-shot; `agent chat` is a synchronous, interactive,
multi-turn REPL. A persona with a `tools:` block gets bounded, scoped MCP
access back into this same `yafsd` instance — `AgentToolServer` registers it
automatically in LM Studio's own `mcp.json`, so tool calls need no manual
LM Studio-side wiring beyond enabling "Allow calling servers from mcp.json."
The built-in `slack` provider bridges a channel to a persona the same way.
See [the command reference](COMMANDS.md#built-in-plugins) for the full
`agent`/`slack` config shape and [the product
spec](PRODUCT-SPEC.md#first-demo-collaborative-pr-review-collection) for
the end-to-end PR-review demo this is built toward.

## Browsing Yafs from an external MCP client

`yafs-mcp` lets an MCP client — Claude Code, Claude Desktop, or any other
MCP-speaking agent — browse a running `yafsd` instance without shell access.
It's a separate small process that bridges MCP's stdio protocol to the same
loopback RPC `yash` uses; the agent never gets a shell, only the four tools
below. (This is a different surface from the `agent` provider above: that's
Yafs driving a local model via MCP, this is an external agent browsing
Yafs.)

With `yafsd` already running, register it (Claude Code example; other MCP
clients take the same command and args, just via their own config):

```sh
claude mcp add yafs -- yafs-mcp
```

Most of its tools are fixed, narrow operations — `yafs.list PATH`,
`yafs.read PATH`, `yafs.inspect PATH`, `yafs.tree`, `yafs.find`, `yafs.test`,
`yafs.diff`, and `yafs.grep` do exactly what they say and nothing else.
`yafs.query SOURCE` is different in kind: it runs one arbitrary
**read-only** Yash command — so an agent can `cat`, `ls`, `inspect`, or
`origins` anything it could as a human at the prompt, but the parser
rejects redirects, session changes, mount lifecycle commands, and every
mutating command before it runs, including inside a command substitution.
`yafs.capture`/`yafs.restore` are the one durable-write exception: they
capture a provider-backed source into a local artifact and reconstruct it
later, the same operations `capture`/`restore` expose at the Yash prompt.
See [the command reference](COMMANDS.md#automation-and-mcp) for the exact
rejection rules and the full tool list.

## Documentation map

- [Yash command reference](COMMANDS.md) — available syntax, commands, and exclusions.
- [Product spec](PRODUCT-SPEC.md) — operator-facing provider promise and acceptance criteria.
- [Architecture decision record](ADR.md) — kernel decisions, invariants, and deferred design work.
- [Feature roadmap](FEATURE-ROADMAP.md) — implementation order, current status, and what's gated.
