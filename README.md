# LabRush

A touch-first, top-down learning game about the medical laboratory specimen lifecycle. You play **Riley Chen, MLT**, a California-licensed Medical Laboratory Technician on your first solo shift at the fictional **Bay 7 Clinical Laboratory, Sacramento, CA**. **Maya Nguyen, CLS** is on site at the desk.

One shift, three patients, four minigames, and a scorecard that scores accuracy, turnaround time, and specimen integrity.

Disclaimer: I am no where near a medical professional but i know how to use AI to vibecode stuff.

## Run it

```bash
npm install
npm run fetch-assets   # downloads Kenney CC0 packs (idempotent)
npm run dev            # http://localhost:5173
```

Other scripts:

| Script | Purpose |
|---|---|
| `npm run build` | type-check and production build |
| `npm run test` | Vitest unit tests (content, rules, engine, scoring, save) |
| `npm run e2e` | Playwright full-shift test (builds and previews automatically) |
| `npm run fetch-assets` | re-download the selected Kenney CC0 files |

Landscape is required. Phone target: 844×390. Desktop target: 1280×720 and up.

## Deploy to GitHub Pages

This build is subpath-safe: `vite.config.ts` uses `base: './'`, so it works at `https://<user>.github.io/<repo>/` and at a custom domain root.

1. Push the repository to GitHub (branch `main`).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) runs `npm ci && npm run build` and deploys `dist/` on every push to `main`, or manually via **Run workflow**.

Or build locally and publish `dist/` with any static host:

```bash
npm run build
# upload the contents of dist/
```

`dist/` contains `index.html` and `assets/`; the debug API (`window.__labrush`) is compiled out of production builds and only exists in `npm run dev` / `npm run build:e2e`.

GitHub Pages must serve the app from the repository root URL (`/<repo>/`). No client-side router is used, so no SPA fallback is needed.

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Move | drag the joystick, or tap the floor to pathfind | arrows / WASD |
| Interact | tap the `A` button or tap a station | E / Space |
| Journal | HUD button | J |
| Pause | HUD button | Esc |

Minigames are pointer-only by design: drag or tap the tubes, rotor slots, pipette, and QC points.

## Shift flow

1. **Morning QC** — review CHEM, HEMA, and COAG Levey–Jennings charts. COAG fails 1_3s; repeat before patient testing.
2. **Receive** the next order at the receiving window.
3. **Accession** — verify two patient identifiers, tube type, fill volume, and order of draw.
4. **Process** — balance and spin the rotor; pipette 500 µL into a sample cup.
5. **Analyze** on CHEM / HEMA / COAG.
6. **Review** results, call critical values with read-back, release, and close the order.

The objective chip in the HUD is always authoritative. The lab engine enforces every gate, so a hidden button can never let you skip a step.

## California MLT scope in this game

Under [17 CCR §1030.6](https://www.law.cornell.edu/regulations/california/17-CCR-1030.6), a licensed MLT may perform waived and moderate-complexity testing in chemistry (including urinalysis), microbiology, diagnostic immunology, and hematology (including coagulation and blood-smear review **other than manual leukocyte differentials**), plus moderate-complexity ABO/Rh, under onsite CLS or physician supervision.

- Riley starts the shift with **Competency: verified**, so results do not require a CLS co-sign at the bench. The CLS desk is for consults and escalation.
- The manual WBC differential is **out of scope**: the game teaches you to escalate it to Nguyen, CLS.
- RBC morphology review is in scope and is an optional step on the CBC report.

## Educational disclaimer

Every laboratory number in this game is a **simulation value chosen for teaching**. Reference intervals and critical limits are educational values drawn from the sources below; the laboratory-validated intervals in force at your site always prevail.

- NBME Laboratory Reference Values — https://www.nbme.org/sites/default/files/2025-03/NBME_Laboratory_Reference_Values.pdf
- MedlinePlus PT/INR — https://medlineplus.gov/ency/article/003652.htm
- ARUP Critical Values List — https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf
- CLSI order of blood draw — https://clsi.org/resources/insights/order-of-blood-draw-tubes-and-additives
- 17 CCR §1030.6 (California MLT scope) — https://www.law.cornell.edu/regulations/california/17-CCR-1030.6

Critical-value callback content (identify, state the value, obtain read-back, document) follows standard laboratory practice; always follow your own facility's policy.

## Assets

GUI tiles, UI icons, fonts, and audio are **Kenney CC0** packs. See [CREDITS.md](./CREDITS.md) for pack names, links, and licenses.

Lab consumables (tubes, cup, slide, pipette, liquid, smear cells) are original Phaser vector drawings created for this project — no third-party lab-equipment art is used.

## Layout

```
src/game/
  content/     # tests, shift 01, law cards, quiz, content validation
  state/       # ShiftEngine (pure TS), scoring, save store
  world/       # map, pathfinding, player, stations, LabScene
  minigames/   # accession, centrifuge, pipette, QC
  ui/          # DOM HUD, panels, modals, journal, scorecard
  scenes/      # boot + title
tests/         # Vitest unit tests
e2e/           # Playwright full-shift test
scripts/       # asset fetcher
```

## Debug API

In dev builds (`npm run dev`) and E2E builds (`VITE_E2E=1`) the page exposes:

```js
window.__labrush.engine        // ShiftEngine
window.__labrush.ui            // UIRoot
window.__labrush.lab()         // LabScene
window.__labrush.startShift()
window.__labrush.openStation('centrifuge')
window.__labrush.forceMinigame('PipetteScene')
window.__labrush.lastMinigameResult
```

It is absent in normal production builds.
