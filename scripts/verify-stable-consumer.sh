#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tarball_directory="$(mktemp -d "${TMPDIR:-/tmp}/texaryn-stable-release-packages.XXXXXX")"
trap 'rm -rf "$tarball_directory"' EXIT

for package_dir in packages/core packages/schema-json packages/react; do
  (
    cd "$root_dir/$package_dir"
    pnpm pack --pack-destination "$tarball_directory" >/dev/null
  )
done

node "$root_dir/scripts/verify-stable-consumer.mjs" "$tarball_directory"
