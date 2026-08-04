# Yash command reference

Yash evaluates commands against a Yafs workspace. It does not search the host
`PATH`, invoke host executables, or promise POSIX shell compatibility. Every
server command has the same structured RPC result: output, status, error, and
updated session state.

## Current syntax

```sh
command arg1 arg2                 # invoke a Yafs command
printf 'text' > file              # replace one local file atomically
echo "$USER at $PWD"              # session variables in double quotes
echo $((2 + 2))                   # integer arithmetic
echo $(cat note.md)               # capture a nested Yash command's output
```

Single quotes preserve their contents. Double quotes allow variables and
command substitution. Command substitution executes in a nested snapshot: it
can read the current workspace, but its session and VFS mutations are discarded.

There are no pipelines, command separators, loops, globbing, aliases, job
control, host executable lookup, or shell `eval`.

## Commands

All paths resolve from the session's current directory unless they begin with
`/`. **Access** is the command's own declared category — `read` never mutates
anything; `session` changes session state (only `cd`); `mutate` produces a
durable VFS operation; `control` manages mount lifecycle. `yafs.query` (see
"Automation and MCP" below) allows only `read` commands; everything else is
rejected before it runs.

### Session

| Command | Access | Meaning |
| --- | --- | --- |
| `pwd` | read | Print the absolute path of the current directory. |
| `cd PATH` | session | Change the current directory. Errors if `PATH` doesn't resolve to a directory. |
| `whoami` | read | Print the session's user name. |
| `date` | read | Print the current time (server clock, ISO 8601) — not the host machine's clock. |
| `help` | read | List every registered command's synopsis. |
| `version` | read | Print the running `yafs` version. |
| `true` | read | Succeed with no output. |
| `false` | read | Always fail (status 1) with no output. |

### Text

| Command | Access | Meaning |
| --- | --- | --- |
| `echo [WORD...]` | read | Print the given words, space-joined. Human convenience; behavior may not match every host shell. |
| `printf [WORD...]` | read | Print the given words concatenated with no separator — the exact-bytes primitive redirection should target. |
| `grep [-n] PATTERN PATH...` | read | Print lines containing `PATTERN` from each `PATH`. `-n` prefixes matching lines with their line number. |
| `head -n COUNT PATH` | read | Print the first `COUNT` lines of `PATH`. |
| `tail -n COUNT PATH` | read | Print the last `COUNT` lines of `PATH`. |
| `wc -l PATH` | read | Print the number of lines in `PATH`. |

### Filesystem

| Command | Access | Meaning |
| --- | --- | --- |
| `ls [PATH]` | read | List the names in a directory (current directory if omitted). |
| `cat PATH` | read | Print a file's contents. |
| `mkdir PATH` | mutate | Create a directory. The parent must already exist — there is no `-p`. |
| `touch PATH` | mutate | Create an empty file, or update an existing file's modified time. |
| `rm PATH` | mutate | Remove a file. Directories are refused (`is_directory`); this does not recurse. |

### Links and composition

| Command | Access | Meaning |
| --- | --- | --- |
| `ln -s TARGET LINK` | mutate | Create a symbolic link. `-s` is required; only symbolic links are supported. |
| `readlink PATH` | read | Print a symlink's stored target string, unresolved. |
| `union NAME LAYER...` | mutate | Create a new read-only directory at `NAME` that resolves lookups against `LAYER...` in order, first match wins. |

### Inspection

| Command | Access | Meaning |
| --- | --- | --- |
| `stat PATH` | read | Report type (`file`/`directory`/`symlink`), following a final symlink. |
| `lstat PATH` | read | Same as `stat`, but does not follow a final symlink. |
| `origins PATH` | read | List the source path(s) behind `PATH` — every candidate in precedence order for a union, the provider path for a mounted resource. |
| `inspect PATH` | read | Structured JSON: path, type, and full provenance (mount, provider, revision, activation/fetch time). |
| `mounts` | read | List every active union and provider mount, with state. |

### Mount lifecycle

| Command | Access | Meaning |
| --- | --- | --- |
| `mount validate MANIFEST [ID]` | control | Parse and validate a `.yafsmeta` manifest with no side effects; prints the proposed mount record as JSON. All `mount` subcommands share `control` access at the registry level, so `yafs.query` cannot run even this side-effect-free one. |
| `mount activate MANIFEST [ID]` | control | Validate, authorize, and durably activate a mount; prints `ID active`. |
| `mount refresh MANIFEST [ID]` | control | Prepare and durably publish a new snapshot for an already-active mount; prints `ID refreshed`. |
| `mount unmount ID` | control | Durably detach an active mount; prints `ID unmounted`. |

GitHub mounts additionally need an explicit named capability and daemon-held
configuration — see [M5 validation](M5-VALIDATION.md).

### Durable artifacts

| Command | Access | Meaning |
| --- | --- | --- |
| `trace SOURCE ARTIFACT_DIRECTORY` | mutate | Capture a directory’s current UTF-8 Yafs files into content-addressed blobs, then durably write `ARTIFACT_DIRECTORY/trace.json`. Provider-backed sources include provenance and an immutable resource reference when their provider supplies one. |
| `reify ARTIFACT_DIRECTORY DESTINATION` | mutate | Reconstruct a trace at a new, absent local directory. It reads local blobs first; a daemon-installed provider reifier may restore a missing blob only from the recorded immutable reference. It never reads the current mount path as fallback. |
| `blobs gc` | control | Explicitly reclaim zero-reference blobs. On `yafsd`, this runs in the serialized request queue after startup has rebuilt trace retention from durable manifests. |

Traces currently capture Yafs's UTF-8 text file surface. The blob store itself
stores bytes; binary VFS file semantics are a separate kernel extension, not
silently emulated by text decoding.

## Automation and MCP

The versioned loopback RPC protocol is the automation API; terminal text is not
the protocol. `yafs-mcp` currently exposes only safe workspace inspection:

- `yafs.list PATH`
- `yafs.read PATH`
- `yafs.inspect PATH`

`yafs.query SOURCE` evaluates one **read-only** Yash command for an agent or
script. It parses the source first and rejects redirects, session changes,
mount lifecycle changes, and every mutating command, including in a command
substitution. A broader operator execution tool must remain distinct from
host-process execution.

## Deliberately not implemented

Pipes, loops, conditionals, `find`, recursive `rm`, `mv`/`cp`, provider
actions such as `gh comment`, and host execution are not available yet.
