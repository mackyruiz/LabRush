#!/usr/bin/env bash
# Fetch the selected Kenney CC0 assets used by LabRush.
# Idempotent: downloads into .cache/kenney and copies the selected files only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/.cache/kenney"
OUT="$ROOT/public/assets"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
SOURCE_NOTE="$CACHE/source.txt"

mkdir -p "$CACHE" "$OUT/kenney/ui" "$OUT/fonts" "$OUT/audio"

die() {
  printf 'fetch-assets: %s\n' "$1" >&2
  printf 'fetch-assets: if kenney.nl changed its download endpoint, download the pack manually,\n' >&2
  printf 'fetch-assets: extract it to .cache/kenney/<pack>/ and re-run this script.\n' >&2
  exit 1
}

have_pack() {
  [ -f "$CACHE/$1/.complete" ]
}

fetch_pack() {
  local pack="$1"
  local zip="$CACHE/$pack.zip"
  local dest="$CACHE/$pack"
  if have_pack "$pack"; then
    return 0
  fi
  local hex json url
  hex="$(printf 'assets/%s' "$pack" | xxd -p | tr -d '\n')"
  printf 'fetch-assets: requesting %s\n' "$pack"
  if json="$(curl -fsS -m 60 \
      -H "User-Agent: $UA" \
      -H "Referer: https://kenney.nl/assets/$pack" \
      -H "Origin: https://kenney.nl" \
      "https://kenney.nl/download-link/$hex" 2>/dev/null)"; then
    url="$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])' 2>/dev/null)" \
      || die "could not parse the signed URL JSON for $pack"
    curl -fL -m 300 -H "User-Agent: $UA" -o "$zip" "$url" \
      || die "download failed for $pack"
    printf 'kenney:https://kenney.nl/assets/%s\n' "$pack" >> "$SOURCE_NOTE"
  else
    case "$pack" in
      rpg-urban-pack)
        printf 'fetch-assets: signed link failed; using CC0 GitHub mirror for %s\n' "$pack"
        curl -fL -m 600 -H "User-Agent: $UA" \
          "https://codeload.github.com/shorepine/kenney/tar.gz/refs/heads/main" -o "$CACHE/kenney-mirror.tar.gz" \
          || die "mirror download failed for $pack"
        rm -rf "$dest"
        mkdir -p "$dest"
        tar -xzf "$CACHE/kenney-mirror.tar.gz" -C "$dest" --strip-components=2 --wildcards '*/2d/RPG\ Urban\ Pack/*' \
          || die "mirror extract failed for $pack"
        printf 'github:https://github.com/shorepine/kenney/2d/RPG%%20Urban%%20Pack\n' >> "$SOURCE_NOTE"
        ;;
      *)
        die "kenney.nl returned an error for $pack and no mirror is configured"
        ;;
    esac
  fi
  if [ -f "$zip" ]; then
    mkdir -p "$dest"
    unzip -qo "$zip" -d "$dest" || die "unzip failed for $pack"
  fi
  touch "$CACHE/$pack/.complete"
}

find_src() {
  local pack="$1" rel="$2" found
  found="$(find "$CACHE/$pack" -type f -path "*${rel}" | sort | head -n 1)"
  if [ -z "$found" ]; then
    local base
    base="$(basename "$rel")"
    found="$(find "$CACHE/$pack" -type f -iname "$base" | sort | head -n 1)"
  fi
  printf '%s' "$found"
}

copy_asset() {
  local pack="$1" rel="$2" out="$3" src
  if [ -f "$out" ]; then
    return 0
  fi
  src="$(find_src "$pack" "$rel")"
  if [ -z "$src" ]; then
    die "missing $rel in $pack (asset layout changed)"
  fi
  mkdir -p "$(dirname "$out")"
  cp "$src" "$out"
  printf 'fetch-assets: %s -> %s\n' "${src#"$CACHE/"}" "${out#"$ROOT/"}"
}

# ---- rpg-urban-pack -------------------------------------------------------
fetch_pack rpg-urban-pack
copy_asset rpg-urban-pack "Tilemap/tilemap_packed.png" "$OUT/kenney/tiles.png"
copy_asset rpg-urban-pack "Tilemap/tilemap.txt" "$OUT/kenney/tiles.txt"
copy_asset rpg-urban-pack "License.txt" "$OUT/kenney/License-rpg-urban-pack.txt"

# ---- ui-pack --------------------------------------------------------------
fetch_pack ui-pack
for f in star.png star_outline.png icon_checkmark.png icon_cross.png arrow_basic_e.png arrow_basic_w.png; do
  copy_asset ui-pack "PNG/Blue/Default/$f" "$OUT/kenney/ui/$f"
done
copy_asset ui-pack "License.txt" "$OUT/kenney/License-ui-pack.txt"

# ---- kenney-fonts ---------------------------------------------------------
fetch_pack kenney-fonts
copy_asset kenney-fonts "Fonts/Kenney Pixel.ttf" "$OUT/fonts/kenney-pixel.ttf"
copy_asset kenney-fonts "Fonts/Kenney Mini Square.ttf" "$OUT/fonts/kenney-mini-square.ttf"
copy_asset kenney-fonts "License.txt" "$OUT/fonts/License-kenney-fonts.txt"

# ---- interface-sounds -----------------------------------------------------
fetch_pack interface-sounds
copy_asset interface-sounds "Audio/click_003.ogg" "$OUT/audio/click.ogg"
copy_asset interface-sounds "Audio/confirmation_003.ogg" "$OUT/audio/confirm.ogg"
copy_asset interface-sounds "Audio/error_006.ogg" "$OUT/audio/error.ogg"
copy_asset interface-sounds "Audio/tick_001.ogg" "$OUT/audio/scan.ogg"
copy_asset interface-sounds "Audio/glass_004.ogg" "$OUT/audio/glass.ogg"
copy_asset interface-sounds "Audio/glass_005.ogg" "$OUT/audio/glass2.ogg"
copy_asset interface-sounds "Audio/open_003.ogg" "$OUT/audio/open.ogg"
copy_asset interface-sounds "Audio/close_003.ogg" "$OUT/audio/close.ogg"
copy_asset interface-sounds "Audio/switch_001.ogg" "$OUT/audio/switch.ogg"
copy_asset interface-sounds "Audio/maximize_007.ogg" "$OUT/audio/run.ogg"
copy_asset interface-sounds "License.txt" "$OUT/audio/License-interface-sounds.txt"

# ---- rpg-audio ------------------------------------------------------------
fetch_pack rpg-audio
copy_asset rpg-audio "Audio/footstep00.ogg" "$OUT/audio/footstep00.ogg"
copy_asset rpg-audio "Audio/footstep01.ogg" "$OUT/audio/footstep01.ogg"
copy_asset rpg-audio "Audio/footstep02.ogg" "$OUT/audio/footstep02.ogg"
copy_asset rpg-audio "Audio/footstep03.ogg" "$OUT/audio/footstep03.ogg"
copy_asset rpg-audio "Audio/doorOpen_1.ogg" "$OUT/audio/door.ogg"
copy_asset rpg-audio "License.txt" "$OUT/audio/License-rpg-audio.txt"

printf 'fetch-assets: done\n'
