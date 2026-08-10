# Agent persona validation

Trace/reify, `blobs gc`, and the fixture-stream/`ctl` mechanics are already
covered by earlier validation passes and don't need re-checking here. The
one M6/M7 piece not yet proven against something real is the agent
persona — it needs a live, OpenAI-compatible local model server, which is
why it's split out on its own.

Create `yafs.plugins.yaml` — this is the only way to activate a plugin
instance; there is no in-VFS equivalent:

```yaml
version: 1
plugins:
  - id: agents
    path: agents
    plugin: agent
    config:
      personas:
        reviewer:
          prompt: "You are a terse code reviewer."
    capabilities: [chat.completion]
```

Start clean:

```sh
yafsd start --config yafs.plugins.yaml
yash
```

## One mount, one persona

Start LM Studio (or any OpenAI-compatible local server) so something is
listening at `http://localhost:1234/v1` — set `YAFS_LLM_BASE_URL` first if
yours listens elsewhere. Without a real server, the steps below still run:
the `ctl` write is still accepted and `status.json` still appears
immediately as `queued` (then `running`), but it never turns to `complete` — after 60s it
turns to `failed` with the connection error in `status.json`, visible
without touching `.yafs/daemon.log`.

```sh
yash:/home/root$ plugins apply
yash:/home/root$ cat agents/reviewer/prompt.md
You are a terse code reviewer.
yash:/home/root$ printf '{"message":"What should I check for in a large diff?"}' > agents/reviewer/ctl
yash:/home/root$ ls agents/reviewer
prompt.md  runs
yash:/home/root$ ls agents/reviewer/runs
2026-08-04T...
yash:/home/root$ cat agents/reviewer/runs/2026-08-04T.../status.json
{"state":"queued","startedAt":"2026-08-04T..."}
yash:/home/root$ cat agents/reviewer/runs/2026-08-04T.../status.json
{"state":"complete","startedAt":"2026-08-04T...","completedAt":"2026-08-04T..."}
yash:/home/root$ cat agents/reviewer/runs/2026-08-04T.../request.md
What should I check for in a large diff?
yash:/home/root$ cat agents/reviewer/runs/2026-08-04T.../response.md
```

The raw `ctl` form is useful for diagnostics, but normal Yash use is:

```sh
yash:/home/root$ agent send agents/reviewer --context source/pulls/482/diff.patch "Review this PR"
accepted: agents/reviewer
yash:/home/root$ agent status agents/reviewer/runs/2026-08-04T...
{"state":"complete", ...}
```

The accepted run contains `context.md` with the exact text supplied to the
model. `agent cancel agents/reviewer RUN_ID` records `cancelled` and prevents
a late model result from replacing that terminal status.

`ls agents/reviewer` never shows `ctl` — the write is dispatched, never
stored. Check `.yafs/audit.ndjson` — each run lands there as a `refresh`
event on the `agents` mount whose `detail` field reads `persona=reviewer
run=<run-id> state=running` and then `state=complete` (or `failed`), so you
can tell which persona did what without cross-referencing file content.

Try changing `capabilities` in `yafs.plugins.yaml` to `[]` and re-running
`plugins apply` instead — the instance refreshes either way (nothing about
publishing `prompt.md` needs the network), but the `ctl` write is rejected
with a `chat.completion is not granted` error before a run is created, and
the model is never called.

## One mount, two personas, two endpoints

A single mount can host more than one persona, each optionally pinned to
its own endpoint — nothing about one persona's endpoint affects another's.
Replace `yafs.plugins.yaml`'s `agents` instance with:

```yaml
version: 1
plugins:
  - id: agents
    path: agents
    plugin: agent
    config:
      personas:
        alpha:
          prompt: "alpha"
          endpoint: "http://localhost:1234/v1"
        beta:
          prompt: "beta"
          endpoint: "http://localhost:1235/v1"
    capabilities: [chat.completion]
```

```sh
yash:/home/root$ plugins apply
yash:/home/root$ printf '{"message":"hi"}' > agents/alpha/ctl
yash:/home/root$ printf '{"message":"hi"}' > agents/beta/ctl
```

Point two different local model servers at `:1234` and `:1235` and each
persona's `ctl` writes go to its own configured endpoint; neither reads
`YAFS_LLM_BASE_URL` since both declare their own. A persona with no
`endpoint` of its own falls back to the mount's `config.endpoint`, then to
`YAFS_LLM_BASE_URL` — same resolution order for `model`.

## Known rough edges

- **No `model` configured means no `model` field is sent.** If your server
  needs an explicit model id even with one model loaded (some do, some
  don't), set `YAFS_LLM_MODEL` or a persona's `model` — otherwise a request
  that should succeed may come back as a 4xx, visible in full in
  `status.json`'s `error` field either way, not just a generic failure.
- ~~`mount refresh` wipes run history~~ **Fixed.** `plugins refresh agents`
  after a `ctl` run used to silently drop every persona's `runs/`
  directory; it now carries run history forward while still applying any
  prompt change in the manifest — safe to use mid-session if you want to
  edit a persona's prompt without unmounting.
