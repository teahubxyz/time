#!/bin/sh
# tools/brand/restore.sh: put branding/img/ back from the live site, every file checked against branding/img/MANIFEST.
#
# The brand page's images are made by tools/brand/make.py (Python, fontTools, Chrome) and land on gh-pages with the
# seed workflow; the branch keeps only their MANIFEST. tools/build.sh runs this so a refresh from the branch brings
# them along instead of dropping them. Files already here with the right sha256 are left alone. Anything missing
# from the live site, or different from MANIFEST, stops the build, so a refresh never lands the page without them.
set -eu
cd "$(dirname "$0")/../.."
SITE=${SLYNG_SITE:-https://slyng.yolopreneur.lol}
M=branding/img/MANIFEST
[ -f "$M" ] || { echo "no $M: nothing to restore"; exit 0; }
sum() { (sha256sum "$1" 2>/dev/null || shasum -a 256 "$1") | cut -d' ' -f1; }
got=0
kept=0
while read -r want name; do
  [ -n "${name:-}" ] || continue
  case $name in */* | .*) echo "bad name in $M: $name" >&2; exit 1 ;; esac
  f="branding/img/$name"
  if [ -f "$f" ] && [ "$(sum "$f")" = "$want" ]; then kept=$((kept + 1)); continue; fi
  curl -fsS --retry 3 --max-time 60 -o "$f.part" "$SITE/branding/img/$name" || {
    rm -f "$f.part"; echo "couldn't fetch $SITE/branding/img/$name: run tools/brand/make.py and land branding/img with the seed workflow" >&2; exit 1; }
  have=$(sum "$f.part")
  [ "$have" = "$want" ] || {
    rm -f "$f.part"; echo "$SITE/branding/img/$name has sha256 $have, $M says $want: land the new images with the seed workflow first" >&2; exit 1; }
  mv "$f.part" "$f"
  got=$((got + 1))
done < "$M"
echo "branding/img: $got fetched from $SITE, $kept already here"
