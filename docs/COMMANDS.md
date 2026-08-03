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

| Group | Commands | Current meaning |
| --- | --- | --- |
| Session | `pwd`, `cd PATH`, `whoami`, `date`, `help`, `version`, `true`, `false` | Inspect or change the Yash session. `date` uses the server clock. |
| Text | `echo [WORD...]`, `printf [WORD...]` | Produce text. `printf` is exact concatenation and is the preferred source for redirection. |
| Files | `ls [PATH]`, `cat PATH`, `mkdir PATH`, `touch PATH`, `rm PATH` | Operate on the Yafs tree. `rm` removes files only; it does not remove directories. |
| Links and composition | `ln -s TARGET LINK`, `readlink PATH`, `union NAME LAYER...` | Create/read symbolic links and a read-only ordered directory composition. A union checks layers left-to-right and never copies up writes. |
| Inspection | `stat PATH`, `lstat PATH`, `origins PATH`, `inspect PATH`, `mounts` | Explain type, links, provenance, union candidates, and active compositions. |
| Mount lifecycle | `mount validate MANIFEST [ID]`, `mount activate MANIFEST [ID]`, `mount refresh MANIFEST [ID]`, `mount unmount ID` | Validate and manage declared provider views. Only the zero-capability fixture provider is implemented today. |

All paths resolve from the session's current directory unless they begin with
`/`. `stat` follows a final symlink; `lstat` does not. `inspect` is structured
JSON suitable for clients.

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

Pipes, loops, conditionals, `find`, provider actions such as `gh comment`, and
host execution are not available yet. `grep [-n] PATTERN PATH...`,
`head -n COUNT PATH`, `tail -n COUNT PATH`, and `wc -l PATH` query virtual
UTF-8 text files directly; they do not require a general pipeline runtime.
