# Dusk

Dusk is the look laid over the Live Wire design system (`design-system.md`) for the AI
Builder Cup's Best UI/UX round. It changes how the app looks and adds one screen. It does
not change what any existing screen does.

## The idea

The house is light and spacious. The stage is dark and flooded with the colour of the
pod's cover. Going live is the lights going down.

| Rule | In practice |
|---|---|
| Say one thing in ink, the next in grey | Headlines are two short lines in Manrope 500, the second in `--grey` (`h1.two` with `.ask`) |
| Filled, not outlined | Fields, chips, quiet buttons and cards are filled tiles; no 1 px boxes |
| One filled pill per screen | The main action is the only `.btn.white`; everything else is quiet |
| Colour comes from covers | The house is paper, ink and grey; red (`--tally`) means on air and nothing else |
| Material at about 35% | `--mat: .35` scales the light, the halftone dots and the grain together |
| Movement means work | A host's shape moves only while they speak or write; idle is still |

## Where it lives

| File | What it holds |
|---|---|
| `static/css/dusk.css` | Everything visual, in one late cascade layer (`@layer dusk`). Removing its `<link>` from `index.html` restores Live Wire |
| `static/js/cover.js` | Generated covers: a gradient in the pod's gel, soft lights and one of four dot figures, seeded by the title, painted once on a canvas and cached as a blob URL |
| `static/js/views/explore.js` | The Explore deck (`/explore`), also shown to signed-out visitors on Home |
| `static/js/components.js` | `material()`, `orb()`, `hostState()`, and host chips drawn as voice shapes |
| `static/js/golive.js` | The house-lights dim (`.gl-dim`) behind the studio as it opens |
| `static/fonts/manrope-*.woff2` | Manrope (OFL), self-hosted like the other faces |

Two details worth knowing before changing them:

- The system's titles ask for weights of 760 to 860, tuned for the old condensed face.
  `--f-display` now names a family ("Dusk Display") whose `@font-face` range stops at 640.
  A variable font is clamped to its face's range, so those titles render semibold without
  each rule being rewritten. Use `--f-head` (plain Manrope, 200 to 800) for new rules.
- The stage is flooded with `--flood`, the gel taken down to a fixed lightness in OKLCH,
  so every gel floods to the same depth. Text on the stage still uses the tokens the
  design system's contrast check covers.

## Hosts as voice shapes

`hostState(store, ctl, pos)` returns who is speaking and whether the hosts are working.

| State | When | What moves |
|---|---|---|
| idle | nothing is being said or written, or playback is paused | nothing |
| `talk` | this host's line is playing | the shape turns and scales with the real audio level (`--lv`) |
| `work` | no script yet, or playback has caught up and the next part is being written | a ring of dots turns around a still shape |

Under reduced motion nothing turns; the states still read by brightness.

## Explore

A deck of cards: public pods (anything on air first), with a show idea after every second
pod. Right keeps a card, left passes, a tap opens it.

- Every gesture has a button and a key: the three buttons under the deck; Left, Right and
  Enter on the deck itself. A status line announces each result.
- What you keep is stored in this browser only (`localStorage`, key `gp_kept`), up to 12.
- Passing loses nothing: the deck can be dealt again.

## Not built yet

Planned and mocked, held for a second pass: host notebooks and memory (with the swipe to
approve), the merged cast of house hosts, hard rules, and roleplay as a fourth co-host
mode.

## Checking it

`python -m tests.visual` compares against baselines recorded before Dusk, so every shot
differs until they are re-recorded with `--update`. Its contract checks (gel contrast, no
stray loaders, no sideways scroll at 390 px) still apply as they are.
