# Setting up and validating a git-backed `source/` mount

What this is: a `github`-provider mount, granted the extra `host.git-read`
capability, publishes a `source/` subtree that mirrors the repository's real
file tree at a pinned commit. Unlike `pulls/`/`commits/`, reading it uses
ordinary `ls`/`tree`/`cat`/`grep` — no new syntax — but `cat`/`grep` are live
reads against a host-maintained git mirror, not resident VFS content. See
`docs/FEATURE-ROADMAP.md`'s M6.9 for the design and why it's shaped this way.

This doc is the operator-facing walkthrough: configure it, verify it from
three angles (the host, the VFS, an agent persona), and a troubleshooting
table mapping the errors you're likely to actually hit to their cause. It
assumes a real repository and the same `YAFS_GITHUB_*` credentials the
`github` plugin's `pulls/`/`commits/` already use — there is no separate
credential to set up. It applies against your regular running daemon and
regular config, the same way any other manifest change does — no separate
disposable instance needed.

No repository/token handy, or just want to sanity-check the underlying
mirror logic with no daemon and no credentials involved at all? See
["If you don't have a repo/token handy yet"](#if-you-dont-have-a-repotoken-handy-yet)
at the bottom.

## 1. Configure it

Add `host.git-read` to an existing (or new) `github` mount's `capabilities:`
list. `repository:` is reused for both the API calls and the mirror.
`pulls:`/`commits:` are each independently optional, and when neither is
configured the API collection fetch is skipped entirely — no
`secret.github-token` needed, even for a private repository, since nothing
calls the GitHub API at all. (The mirror clone itself still needs
`YAFS_GITHUB_TOKEN` set in the daemon's environment if the repo is
private — that's the git-level auth, separate from this capability.)

```yaml
- id: reviews
  plugin: github
  config:
    repository: acme/widget
  capabilities: [network.github-api, host.git-read]
```

Add `secret.github-token` (and a `pulls:`/`commits:` block) if you also
want the existing `pulls/`/`commits/` collections alongside `source/`:

```yaml
- id: reviews
  plugin: github
  config:
    repository: acme/widget
    pulls:
      query: "is:pr is:open"
      max: 50
  capabilities: [network.github-api, secret.github-token, host.git-read]
```

Apply it the normal way:

```sh
yash -c "plugins apply"
```

The first apply will take longer than usual for this mount — it's doing a
real, one-time shallow clone. Subsequent refreshes (interval-based or
`plugins refresh reviews`) are fast (`git fetch --depth 1`, a few hundred
milliseconds even for a large repository).

## 2. Verify from the host

The mirror is a real bare git repository, maintained outside the VFS
entirely, at:

```text
<os tmpdir>/yafs-git-mirrors/<mount id>
```

This is Node's `os.tmpdir()`, **not literally `/tmp`** — on Linux they're
usually the same, but on macOS `os.tmpdir()` resolves to a per-user
directory under `/var/folders/...`, not `/tmp` (a real gotcha: looking in
`/tmp` there finds nothing, even after a successful clone). Ask the
daemon's own runtime for the real path rather than guessing:

```sh
bun -e "console.log(require('node:os').tmpdir())"
```

(Not yet wired to the daemon's own `--data-dir`; see M6.9's own note on
this in `FEATURE-ROADMAP.md`.) You can inspect it with ordinary git
commands, once you know the real path for `<mount id>` = `reviews`:

```sh
cd "$(bun -e "console.log(require('node:os').tmpdir())")/yafs-git-mirrors/reviews"
git log --oneline FETCH_HEAD              # the currently pinned commit
git ls-tree -r --name-only FETCH_HEAD | head    # the real path list
```

**Use `FETCH_HEAD`, not `HEAD`/`--all`:** the mirror is fetched with `git
fetch --depth 1 origin HEAD` and read back via `FETCH_HEAD` on purpose — a
bare mirror's own branch refs are ambiguous to advance correctly across
repeated shallow fetches (see `GitMirror.ts`'s own comment). `git log
--all`/`git branch` against the mirror will look empty; that's expected,
not a sign anything's broken.

If this directory doesn't exist after `plugins apply`, the mount didn't
actually get `host.git-read` granted (check `capabilities:` in the manifest,
not just requested — see the troubleshooting table).

## 3. Verify in the VFS

```sh
yash -c "ls reviews/source"
yash -c "tree reviews/source/lib" 2>&1 | head -20
yash -c "cat reviews/source/README.md"
yash -c "grep -n TODO reviews/source"
```

`ls`/`tree`/`find`/`cd` return instantly and synchronously — they're
answered from the mount record's own cached file list, not from anything
published into the VFS (`source/` writes zero VFS entries, at any repo
size). `cat`/`grep` take a beat longer than a normal file read — they're
shelling out to the real mirror each time, not reading resident content.
Confirm nothing was durably written by this:

```sh
yash -c "inspect reviews/source/README.md"   # still shows provider origin, not a local write
```

## 4. Verify an agent persona can see it

Nothing special is needed — `source/` is just another path under the
mount's root, so an existing `tools.roots` entry for the mount already
covers it:

```yaml
personas:
  reviewer:
    tools:
      roots: ["/world/github/acme/widget"]
```

Ask the persona something that requires reading actual code (not just PR
metadata) — e.g. "where is X defined in this repo" — and check the run's
`tools.json` transcript for a `yafs.grep`/`yafs.read` call against a
`source/...` path, the same way you'd check any other tool call.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `reviews/source` doesn't exist after `plugins apply` | `host.git-read` wasn't in the mount's `capabilities:` list | Add it and re-apply |
| `plugins apply` fails with `GitHub plugin 'reviews' requires secret.github-token, but YAFS_GITHUB_TOKEN was unavailable` | You've configured `pulls:`/`commits:` (which need the API) but not granted `secret.github-token` | Set `YAFS_GITHUB_TOKEN` in the daemon's environment, or drop `pulls:`/`commits:` if you only wanted `source/` |
| `plugins apply` fails cloning a private repo even with no `pulls:`/`commits:` configured | The mirror clone itself still needs a token for a private repo — that's separate from `secret.github-token` (which only gates the API-based `pulls/`/`commits/` fetch) | Set `YAFS_GITHUB_TOKEN` in the daemon's environment |
| `cat`/`grep` under `source/` throws `Command requires asynchronous execution` | Called through the synchronous `yafs.exec()` path (e.g. embedding `Yafs` directly in a script) instead of the async path every real client (Yash, MCP) already uses. `ls`/`tree`/`find`/`cd` don't have this restriction — only `cat`/`grep` need real mirror content | Use `executeAsync`/a real client connection, not `Yafs.exec()` directly — this is expected, not a bug |
| `cat`/`grep` fails with `mirror is missing pinned commit <sha>: run plugins refresh` | The mirror's pinned SHA is missing from its own mirror directory (deleted, pruned, or a force-push moved history out from under it) | The mount fails closed on purpose — `plugins refresh <id>` to re-sync |
| `source/` shows old content after the remote changed | Refresh hasn't run yet | `plugins refresh <id>`, or wait for the configured `refresh: interval` |
| A grep for a whole directory returns nothing you expect, or fails outright | Only a single git-backed target path is supported per `grep` call — mixing git and non-git paths, or globbing across the mount, isn't (see `commands/GrepCommand.ts`) | Grep the `source/` root or one specific path, not a mixed set |

## If you don't have a repo/token handy yet

`script/validate-git-mirror.ts` (`bun run validate:git-mirror`) is a
lower-level, credential-free sanity check: it runs the same
`GitMirror.ts`/`GitGrep.ts` sync/read logic directly against a synthetic
local repo it creates itself — no daemon, no `yash`, no network, nothing
of yours touched. It's useful for confirming the underlying plumbing
works before you go through the real-config steps above, but it doesn't
exercise `yafsd`/`yash`/the VFS at all — treat the walkthrough above as
the actual validation, and that script as a quick pre-flight check. Set
`KEEP=1` to leave its work directory in place afterward and poke at the
mirror by hand with ordinary git commands (same `FETCH_HEAD`-not-branches
caveat as above).
