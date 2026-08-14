# Common dev-loop operations for yafs. Run `just` with no args to list them.

default:
    @just --list

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
    threshold=$(grep coverageThreshold bunfig.toml | grep -oE '[0-9]+\.[0-9]+')
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
