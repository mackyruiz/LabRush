# Credits

## Art, fonts, audio — Kenney (CC0)

All of the following packs are by [Kenney](https://kenney.nl) and released under **CC0 1.0 Universal (public domain)**. The license text shipped with each pack is copied into `public/assets` (`License-*.txt`).

| Pack | Use | Files used | Source |
|---|---|---|---|
| [RPG Urban Pack](https://kenney.nl/assets/rpg-urban-pack) | world tilemap, station props, character sprites | `Tilemap/tilemap_packed.png` → `kenney/tiles.png`; `Tilemap/tilemap.txt` → `kenney/tiles.txt` | kenney.nl |
| [UI Pack](https://kenney.nl/assets/ui-pack) | star, check, cross, arrow icons | `PNG/Blue/Default/{star,star_outline,icon_checkmark,icon_cross,arrow_basic_e,arrow_basic_w}.png` | kenney.nl |
| [Kenney Fonts](https://kenney.nl/assets/kenney-fonts) | headings (`Kenney Pixel`), body (`Kenney Mini Square`) | `Fonts/Kenney Pixel.ttf`, `Fonts/Kenney Mini Square.ttf` | kenney.nl |
| [Interface Sounds](https://kenney.nl/assets/interface-sounds) | clicks, confirmation, error, scan, glass, open/close, switch, analyzer run | `click_003`, `confirmation_003`, `error_006`, `tick_001`, `glass_004`, `glass_005`, `open_003`, `close_003`, `switch_001`, `maximize_007` (`.ogg`) | kenney.nl |
| [RPG Audio](https://kenney.nl/assets/rpg-audio) | footsteps, door | `footstep00`–`footstep03`, `doorOpen_1` (`.ogg`) | kenney.nl |

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

`scripts/fetch-assets.sh` downloads the packs from the signed Kenney download links and copies only the files listed above. All five packs were downloaded from **kenney.nl** (see `.cache/kenney/source.txt` for the recorded source). If Kenney's signed-link endpoint fails, the script falls back to the CC0 [GitHub mirror of the RPG Urban Pack](https://github.com/shorepine/kenney/tree/main/2d/RPG%20Urban%20Pack) (also listed on [OpenGameArt](https://opengameart.org/content/rpg-urban-pack)); whichever source was used is recorded in `.cache/kenney/source.txt`.

## Original work

All lab consumables are original Phaser vector drawings made for this project, not third-party art:

- blood tubes (gold SST, lavender EDTA, light blue citrate) and tube icons
- sample cup, pipette, liquid, meniscus, bubbles
- rotor, slots, progress ring
- blood smear cells (SVG in the DOM smear review)
- station panels, charts, tables, and all interface chrome

No non-CC0 or paid asset pack is included or required.
