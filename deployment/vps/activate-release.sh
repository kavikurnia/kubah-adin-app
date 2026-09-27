#!/usr/bin/env bash
set -euo pipefail
# Usage: sudo bash activate-release.sh <release-dir-name> <expected-current-dir-or-NONE>
# Prepared releases are immutable and contain webroot plus SHA256SUMS.
base=/srv/kubah-nabawi
release=${1:?release required}
expected=${2:?expected current required}
[[ "$release" =~ ^[A-Za-z0-9._-]+$ ]] || exit 2
target="$base/releases/$release"
[[ -d "$target/webroot" && ! -L "$target" && -f "$target/SHA256SUMS" ]] || exit 3
exec 9>"$base/.deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 4; }
actual=''
if [[ -e "$base/current" || -L "$base/current" ]]; then
  actual=$(readlink -f "$base/current")
fi
if [[ "$expected" == NONE ]]; then
  [[ ! -e "$base/current" && ! -L "$base/current" ]] || { echo 'Current release exists; review before replacing'; exit 5; }
else
  [[ "$expected" =~ ^[A-Za-z0-9._-]+$ && "$actual" == "$base/releases/$expected" ]] || { echo 'Current release changed'; exit 6; }
fi
(cd "$target" && sha256sum --strict --check SHA256SUMS)
nginx -t
if [[ -n "$actual" ]]; then
  [[ "$actual" == "$base/releases/"* ]] || exit 7
  ln -s "$actual" "$base/.previous.$$"
  mv -Tf "$base/.previous.$$" "$base/previous"
fi
ln -s "$target" "$base/.current.$$"
mv -Tf "$base/.current.$$" "$base/current"
printf 'Activated %s\nPrevious %s\n' "$target" "$actual"
# No database write, no stock import, no deleting old releases, no service restart.
