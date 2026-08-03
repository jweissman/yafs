# M5 validation

Run the automated acceptance suite first:

```sh
bun check
bun test test/review_workspace.test.ts test/provider_audit.test.ts
```

For a live GitHub collection, start the daemon with daemon-held settings:

```sh
export YAFS_GITHUB_TOKEN=...          # required for a private repo; strongly recommended even for a
                                       # public one, since unauthenticated GitHub API rate limits are low
bun run yafsd -- start
bun run yash
```

Setting the env var makes an authenticated client *available* to the daemon;
it does not make any mount use it. A manifest must separately request the
`secret.github-token` capability to actually get the authenticated client —
without it, activation silently uses the unauthenticated one regardless of
the env var, and typically fails with 401 against a private repo or under
rate limiting.

By default this targets `api.github.com`. For GitHub Enterprise Cloud with data
residency or GitHub Enterprise Server, set `YAFS_GITHUB_HOST` to the same
hostname you'd give `gh`'s `GH_HOST` (e.g. `va.ghe.com`); it is mapped to
`https://api.va.ghe.com` for a `*.ghe.com` host, or `https://HOST/api/v3`
otherwise. `YAFS_GITHUB_API_URL` remains available to set the exact API base
URL directly, and takes precedence over `YAFS_GITHUB_HOST` if both are set.

Create `.yafsmeta` with a bounded collection. The token is never placed in the
manifest.

```yaml
version: 1
mounts:
  - id: review
    path: reviews
    provider: github
    config: { repository: acme/widget, query: "is:pr is:open", max: 25 }
    refresh: { interval: 15m }
    capabilities: [network.github-api, secret.github-token]
```

Then validate the operator flow:

```sh
mount validate .yafsmeta
mount activate .yafsmeta
cat reviews/pulls/42/diff.patch
mkdir notes; mkdir notes/42
review bind reviews/pulls/42 notes/42/alice
inspect reviews/pulls/42/diff.patch
cat notes/42/alice/source.json
mount refresh .yafsmeta review
```

Check `.yafs/audit.ndjson` after activation or refresh. It contains linked
`fetch` and lifecycle entries with the named capability, revision, and outcome;
it must never contain a token or fetched file payload. A failed `fetch` event
carries a `detail` field with the thrown error's message (for the GitHub
provider, that includes the HTTP status and GitHub's own response body) — this
is the durable record of *why* an activation or refresh failed, including for
a daemon-scheduled refresh with no attached client. `daemon.log` only covers
server process-level failures (startup, crashes); command-level failures
(a failed `mount activate`, a failed scheduled refresh) are never written
there — check the audit trail instead.
