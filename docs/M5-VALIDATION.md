# M5 validation

Run the full project gate, then the focused review and trace acceptance tests:

```sh
bun check
bun test test/review_workspace.test.ts test/trace_recovery.test.ts
```

For a live GitHub collection, make daemon-held credentials available and create
an external desired configuration before starting the service:

```sh
export YAFS_GITHUB_TOKEN=...
```

`YAFS_GITHUB_TOKEN` never enters a manifest, VFS file, WAL, provenance record,
or audit log. The manifest separately requests `secret.github-token`; without
that grant, the provider uses an unauthenticated API client. `YAFS_GITHUB_HOST`
supports GitHub Enterprise host mapping, while `YAFS_GITHUB_API_URL` sets an
explicit HTTPS API endpoint and takes precedence.

Create a bounded collection manifest:

```yaml
version: 1
plugins:
  - id: review
    path: reviews
    plugin: github
    config: { repository: acme/widget, query: "is:pr is:open", max: 25 }
    refresh: { interval: 15m }
    capabilities: [network.github-api, secret.github-token]
```

Save it as `yafs.plugins.yaml`, start the daemon, then validate the operator
flow:

```sh
bun run yafsd -- start --config yafs.plugins.yaml
bun run yash
plugins status
plugins plan
cat reviews/pulls/42/diff.patch
mkdir notes; mkdir notes/42
capture reviews/pulls/42 notes/42/alice
inspect reviews/pulls/42/diff.patch
cat notes/42/alice/trace.json
# after changing the desired configuration, inspect and publish its refresh:
plugins plan
plugins apply
restore notes/42/alice restored-42
cat restored-42/diff.patch
```

`trace.json` records the source path, provider provenance, PR head SHA when
available, capture time, and a digest for every captured file. `reify` reads
those blobs rather than the refreshed collection. After a daemon restart,
`blobs gc` must preserve the trace’s blobs because startup rebuilt retention
from the durable manifests.

Check `.yafs/audit.ndjson` after activation or refresh. It contains linked
fetch and lifecycle entries with named capabilities, revision, and outcome;
it never includes credentials or fetched payloads. Command-level failures are
recorded in that audit trail, not `daemon.log`.
