#!/bin/sh
# tools/bundle.sh [OUT]: OUT/slyng.tgz (slyng/ at the top) and its sha256, for Time's seed workflow
# (teahubxyz/time, Actions -> seed), when the bundle can reach the runner (a Boring blob download link).
set -eu
cd "$(dirname "$0")/.."
OUT=${1:-/tmp/slyng-dist}
export COPYFILE_DISABLE=1
rm -rf "$OUT/slyng" "$OUT/slyng.tgz"
mkdir -p "$OUT/slyng"
for f in *; do [ "$f" = "$(basename "$OUT")" ] || cp -R "$f" "$OUT/slyng/"; done
find "$OUT/slyng" \( -name .DS_Store -o -name __pycache__ \) -prune -exec rm -rf {} +
tar -czf "$OUT/slyng.tgz" -C "$OUT" slyng
sum=$( (shasum -a 256 "$OUT/slyng.tgz" 2>/dev/null || sha256sum "$OUT/slyng.tgz") | cut -d' ' -f1)
echo "$sum" > "$OUT/slyng.tgz.sha256"
echo "bundle $OUT/slyng.tgz: $(wc -c < "$OUT/slyng.tgz" | tr -d ' ') bytes, sha256 $sum"
