#!/usr/bin/env zsh
set -euo pipefail

root=${0:A:h:h}
work=$(mktemp -d -t yafs-m6-3)
export YAFS_DATA_DIR="$work/data" YAFS_PORT="${YAFS_VALIDATION_PORT:-7453}"
config="$work/yafsmeta.yaml"

cleanup() { (cd "$root" && bun run yafsd -- stop >/dev/null 2>&1) || true; rm -rf "$work" }
trap cleanup EXIT INT TERM

write_config() {
  printf '%s\n' 'version: 1' 'plugins:' '  - id: demo' '    plugin: fixture' '    path: demo' \
    '    config:' '      files:' "        hello.txt: $1" '    capabilities: []' > "$config"
}

run() { (cd "$root" && "$@") }
expect() { [[ "$1" == "$2" ]] || { print -u2 "expected: $1"; print -u2 "received: $2"; exit 1; } }

write_config hello
run bun run yafsd -- start --config "$config"
expect hello "$(run bun run yash -- -c 'cat demo/hello.txt')"
expect '[]' "$(run bun run yash -- -c 'plugins plan')"
run bun run yash -- -c 'plugins describe agent' | rg '"conversation"'
run bun run yash -- -c 'cache put --ttl 5m validation durable'
run bun run yafsd -- restart --config "$config"
expect durable "$(run bun run yash -- -c 'cache get validation')"
write_config refreshed
expect '[{"id":"demo","action":"refresh"}]' "$(run bun run yash -- -c 'plugins plan')"
run bun run yash -- -c 'plugins apply'
expect refreshed "$(run bun run yash -- -c 'cat demo/hello.txt')"
if run bun run yash -- -c 'mounts status'; then print -u2 'mounts status unexpectedly succeeded'; exit 1; fi
print 'M6.3 validation passed; disposable data directory was removed.'
