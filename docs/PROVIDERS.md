# Built-in provider reference

This is the operator-facing contract for built-in providers. A declaration is
host-side desired configuration: it is selected by `yafsd --config FILE` or
`YAFS_CONFIG`, never read from the virtual workspace. `plugins plan` shows the
change; `plugins apply` activates it.

The parser rejects unknown fields, duplicate keys, YAML tags, aliases, and
anchors. A provider requests capabilities; only the daemon's configuration and
grant policy can provide them.

## Common declaration

```yaml
version: 1
plugins:
  - id: example                   # unique deployment identifier
    plugin: fixture               # built-in provider kind
    path: example                 # virtual mount root; some providers default it
    config: {}                    # provider-specific validated object
    capabilities: []              # named grants, never secrets themselves
    refresh: { interval: 1m }      # optional, provider snapshot refresh
```

`plugins:`/`plugin:` are the canonical spellings. The older
`mounts:`/`provider:` aliases are compatibility-only. A projection is normally
read-only; writes to a provider's declared action endpoint are a separate,
typed capability, not ordinary file mutation.

## Providers

| Provider | Required config | Optional config | Capability / daemon settings | Published shape |
| --- | --- | --- | --- | --- |
| `fixture` | `files: { PATH: UTF8_TEXT }` | `streams` test fixture | none | Declared static files under `path`. |
| `github` | `repository: owner/repo` | `pulls: { query, max }`, `commits: { max }` | `network.github-api`; `secret.github-token` resolves `YAFS_GITHUB_TOKEN`; `host.git-read` enables the source-tree experiment | PR and commit collections; optionally `source/`. |
| `agent` | `personas: { NAME: { prompt } }` | mount/persona `endpoint`, `model`; persona `tools` | `chat.completion`; generic model env or LM Studio settings | `NAME/prompt.md`, chats, and durable runs. |
| `slack` | `channel` | `max`, `persona`, `requireMention`, `replyTimeoutMs`, `reactions` | `network.slack-api`, `secret.slack-token` resolves `YAFS_SLACK_TOKEN` | Message snapshot and, when configured, inbound bridge/action state. |
| `scheduler` | `script`, `intervalMs`, `allow` | `args` | `control.scheduled-execution` | No provider tree of its own; runs a declared script. This is an explicitly non-durable spike, not workflow infrastructure. |

`max` values for GitHub pull/commit collections are bounded to 1–100; Slack's
message `max` is bounded to 1–200. `agent.tools.roots` must be a non-empty list
of absolute virtual paths; optional tool budgets are `maxResultBytes`,
`maxCalls`, and `deadlineMs`.

## Copyable examples

These declarations are intentionally small. Add them to one `plugins:` list,
then run `plugins plan` before `plugins apply`.

### Fixture

```yaml
- id: welcome
  plugin: fixture
  path: demo
  config:
    files:
      hello.txt: hello
      notes/start.md: "This is provider-backed test content."
  capabilities: []
```

This is the safe provider-development and documentation fixture. Its files are
published read-only beneath `demo/`.

### GitHub

```yaml
- id: reviews
  plugin: github
  config:
    repository: acme/widget
    pulls:
      query: "is:pr is:open"
      max: 25
    commits:
      max: 12
  refresh: { interval: 15m }
  capabilities: [network.github-api, secret.github-token]
```

The default mount path is `/world/github/acme/widget`. `secret.github-token`
authorizes daemon-side use of `YAFS_GITHUB_TOKEN`; remove it for a public
repository when unauthenticated GitHub API access is sufficient.

To include the experimental pinned source-tree projection, add
`host.git-read` to `capabilities:`. Follow the [git source walkthrough](GIT-SOURCE-SETUP.md)
before doing so; it has distinct host-mirror and recovery requirements.

### Agent

```yaml
- id: agents
  plugin: agent
  path: agents
  config:
    endpoint: http://127.0.0.1:1234/v1
    model: local-model
    personas:
      reviewer:
        prompt: "Give concise, cited engineering reviews."
        tools:
          roots: ["/world/github/acme/widget"]
          maxCalls: 12
          maxResultBytes: 24000
          deadlineMs: 120000
  capabilities: [chat.completion]
```

Without `tools`, the persona uses an OpenAI-compatible completion endpoint.
With `tools`, the current implementation uses LM Studio's integration flow;
the model/endpoint fallback details and command syntax live in
[COMMANDS.md](COMMANDS.md#built-in-plugins).

### Slack

```yaml
- id: engineering-chat
  plugin: slack
  config:
    channel: C0123456789
    max: 100
    persona: reviewer
    requireMention: true
    reactions: false
  capabilities: [network.slack-api, secret.slack-token]
```

Its default path is `/world/slack/channels/C0123456789`. The channel ID is not
a display name. The daemon resolves `YAFS_SLACK_TOKEN`; it is never a YAML
field. `persona` enables the configured inbound route, while `slack send` is a
separate durable outbound action.

### Scheduler — development spike only

```yaml
- id: pulse
  plugin: scheduler
  path: pulse
  config:
    script: /home/root/scripts/heartbeat.yash
    intervalMs: 30000
    allow: [read, mutate]
  capabilities: [control.scheduled-execution]
```

The scheduler publishes `pulse/config.json` and repeatedly launches the named
VFS script. It has no source pinning, durable tick record, path-root scope, or
overlap policy, so it must not drive consequential automation. It is a
mechanism experiment, not the workflow product.

## GitHub and git source trees

GitHub's regular projection is a collection: a repository/query creates paths
for matching PRs, rather than one mount per PR. The optional `host.git-read`
grant is a separate source-tree experiment: it exposes a pinned `source/`
tree for ordinary exploration and is deliberately read-only. Its host setup,
revision behavior, and failure modes are documented in the
[git source walkthrough](GIT-SOURCE-SETUP.md).

Do not put GitHub credentials in YAML. `YAFS_GITHUB_API_URL`,
`YAFS_GITHUB_HOST`, and `YAFS_GITHUB_TOKEN` are daemon configuration and are
not projected into the VFS or journal.

## Agent and Slack configuration

An agent persona is configuration plus a bounded model invocation action; it
is not an arbitrary process. A tool-enabled LM Studio persona gets only the
declared MCP roots and budgets. A Slack channel may route an explicitly
mentioned message to a configured persona, but outbound delivery and agent
execution remain independently visible durable actions.

See [COMMANDS.md](COMMANDS.md#built-in-plugins) for exact invocation syntax,
including `agent send`, `agent chat`, `agent status`, and `slack send`.

## Documentation source of truth

Today, validation code and `plugins describe` are the executable source of
truth; this page is a reviewed operator guide. The command classes currently
provide names and synopses but not enough structured descriptions/examples to
generate this reference faithfully. M6.10 should add a shared description
model, then a `just` documentation check/generator that produces command and
provider reference sections from it. Until then, do not generate polished
docs from terse runtime strings and accidentally call them complete.
