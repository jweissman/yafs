# Common dev-loop operations for yafs. Run `just` with no args to list them.

default:
    @just --list

gh:
    gh repo view --web

# Full CI-equivalent gate: tests + coverage, lint, typecheck.
check:
    bun run check

# Lint only.
lint:
    bunx eslint .

# Typecheck only.
typecheck:
    bunx tsc --noEmit

# Format (prettier + eslint --fix).
fmt:
    bun fmt

# Run tests. Pass a path or bun test-filter pattern, or nothing for all.
test PATTERN="":
    bun test {{PATTERN}}

# List every file currently below bunfig.toml's coverageThreshold — the
# same pass/fail table `bun test --coverage` prints, pre-filtered so only
# files actually tripping the threshold show up.
coverage-gaps:
    #!/usr/bin/env bash
    set -uo pipefail
    threshold=$(grep coverageThreshold bunfig.toml | grep -oE '[0-9]+(\.[0-9]+)?')
    min=$(awk -v t="$threshold" 'BEGIN { print t * 100 }')
    bun test --coverage 2>&1 | awk -F'|' -v min="$min" '{
      gsub(/ /, "", $2); gsub(/ /, "", $3);
      if (($2 != "" && $2 + 0 < min) || ($3 != "" && $3 + 0 < min)) print
    }'
    exit 0

# Show exact uncovered line numbers for one source file via lcov. Useful
# when bun's default table leaves "Uncovered Line #s" blank for small gaps.
# Usage: just coverage-lines src/plugins/agent/AgentToolServer.ts
coverage-lines FILE:
    #!/usr/bin/env bash
    set -euo pipefail
    dir=$(mktemp -d)
    bun test --coverage --coverage-reporter=lcov --coverage-dir="$dir" > /dev/null 2>&1
    awk -v f="{{FILE}}" '
      $0 ~ "^SF:.*" f "$" { inblock = 1 }
      inblock && /^DA:/ {
        split($0, a, ":"); split(a[2], b, ",")
        if (b[2] == "0") print b[1]
      }
      inblock && /^end_of_record/ { inblock = 0 }
    ' "$dir/lcov.info"
    rm -rf "$dir"

# One-shot version of coverage-gaps + coverage-lines together: generates
# lcov once, then for every file under bunfig.toml's coverageThreshold
# prints its funcs/lines % plus every uncovered line number. Avoids
# re-running the whole suite once per file the way coverage-lines does
# when checking several gaps in one pass.
coverage-detail:
    #!/usr/bin/env bash
    set -uo pipefail
    threshold=$(grep coverageThreshold bunfig.toml | grep -oE '[0-9]+(\.[0-9]+)?')
    min=$(awk -v t="$threshold" 'BEGIN { print t * 100 }')
    dir=$(mktemp -d)
    bun test --coverage --coverage-reporter=lcov --coverage-dir="$dir" > /dev/null 2>&1
    awk -v min="$min" '
      /^SF:/ { file = substr($0, 4); funcsHit = 0; funcsFound = 0; linesHit = 0; linesFound = 0; split("", uncovered) }
      /^FNH:/ { funcsHit = substr($0, 5) }
      /^FNF:/ { funcsFound = substr($0, 5) }
      /^LH:/ { linesHit = substr($0, 4) }
      /^LF:/ { linesFound = substr($0, 4) }
      /^DA:/ {
        split(substr($0, 4), a, ",")
        if (a[2] == "0") uncovered[length(uncovered)+1] = a[1]
      }
      /^end_of_record/ {
        fpct = (funcsFound > 0) ? (funcsHit / funcsFound * 100) : 100
        lpct = (linesFound > 0) ? (linesHit / linesFound * 100) : 100
        if (fpct < min || lpct < min) {
          printf "%s: funcs=%.2f lines=%.2f uncovered=", file, fpct, lpct
          for (i = 1; i <= length(uncovered); i++) printf "%s%s", (i>1?",":""), uncovered[i]
          print ""
        }
      }
    ' "$dir/lcov.info"
    rm -rf "$dir"

# Verify markdown cross-links across docs/*.md and README.md resolve to
# real files and, for #anchors, real headings. Catches broken links left
# behind when docs are renamed/restructured or headings are reworded.
check-doc-links:
    python3 script/check-doc-links.py docs/*.md README.md

# Print a mount's full activation/refresh/unmount history from a daemon's
# audit.ndjson, in order, for diagnosing why a mount's live VFS state
# doesn't match `mounts`/`plugins status`. Usage:
#   just audit-timeline demo
#   just audit-timeline demo .yafs/audit.ndjson
audit-timeline ID DATADIR=".yafs":
    jq -c 'select(.mountId == "{{ID}}") | {sequence, at, action, outcome, beforeRevision, afterRevision, actor}' {{DATADIR}}/audit.ndjson
