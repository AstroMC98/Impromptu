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

## Desktop

From 1024 px the layouts change, in one block near the end of `dusk.css`. Signed-out Home
puts the pitch on the left and the deck on the right; signed-in Home puts your pods beside
four templates; Explore shows the card as a cover with a detail panel and takes the arrow
keys from anywhere on the page; New pod keeps the cover preview and Go live fixed beside
the form (`aside.create-side`, which is `display: contents` on phones). Phone layouts are
not affected.

## Second pass

| Feature | Where | State |
|---|---|---|
| Hard rules | `hard_rules` on a pod's or call's request; `prompts.hard_rules` closes every system prompt; editor in `static/js/rules.js` | built |
| Roleplay and Educate | two more co-host modes in `catalog.COHOST_MODES`; the setup page asks for a scene or for something to learn | built |
| Memory | `app/memory.py`, `/api/memories`, the Memory page (`static/js/views/memory.js`), "Use memory" on the co-host setup page | first slice built |
| Notebooks | `app/notebook.py`, `/api/notebook`, `static/js/views/notebook.js` (`/notebook?host=Name`) | built |
| Caller memory | `memory.propose_callers` / `returning`, the room's `_load_caller_memory` and `_remember_callers`, the switch on the Memory page | built |
| Caller consent | `remember_me` on the account, `Conn.remember_me`, `ShowRoom._may_remember`, the note on the call-in box | built |
| Listener notes | `app/feedback.py`, `/api/shows/{id}/notes`, `/api/notes`, the More sheet, Listeners on the Memory page | built |
| The cast | `catalog.CAST`: 18 house hosts shared by templates and pickers, a voice each | built |

Memory, as built: a call started with "Use memory" hands the co-host what you have
approved for them (their own memories, then the shared ones) and, once the episode is
saved, asks the model what is worth remembering. Those proposals wait on the Memory page:
right keeps one, left forgets it, and a button shares it with every co-host. Memories are
saved items of kind `memories`, so they need no new store code. The whole list fits in the
prompt, so there is no search yet.

A notebook is up to 100 pages (about 100,000 characters) of your own material for one host;
long text is split into pages on import. On a co-host call it joins the notes, so a long one
is briefed and searched with `check_notes` while you talk. For a written pod, the pages that
best match the topic (BM25) are added to that host's private notes. There are no embeddings
yet: search is by words.

Caller memory is off until the creator turns on "Remember callers". Then each signed-in
listener who calls a live pod is proposed as a memory for that pod's hosts, and, once approved,
the writers are told when the same person calls one of those hosts again. The note goes to
the writers only, never to other listeners.

The caller has a say too: "Let hosts remember me" on the Memory page, on unless they turn it
off (`remember_me` on the account; only an explicit `false` opts out). It is read when their
socket joins a room (`Conn.remember_me`), and `ShowRoom._may_remember` needs both switches.
While both are on, the call-in box shows "The hosts may remember you…" when they go to type
(`may_remember` in the snapshot, `.callin-note`).

Listener notes (`app/feedback.py`): a signed-in listener can leave a pod's hosts a note from
the More sheet, live or on a replay. It is never read on air and one note changes nothing.
When notes from three different listeners are waiting, the model is asked what they share;
a sentiment counts only if three different people back it, by the server's own count of the
notes the model cites. What passes becomes a proposal on the Memory page (scope `audience`,
"3 listeners said"), and once approved goes into those hosts' private notes for later pods
and into their memory on co-host calls. The creator sees every note under Listeners on the
Memory page and can switch the feature off there ("Take notes from listeners",
`listener_notes`, on unless false).

Memories and notebooks belong to a host by name, so renaming a host leaves them behind.

Memory is on with local storage and off on GCP until `MEMORY_ENABLED=true`
(`settings.memory_on`), so a deploy does not start writing memories to Firestore.

## Third pass: scrolling, the show intro, open panels

Scrolling moves the lights rather than a strip of paper. All of it is tied to the scroll
position with CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`), inside
`@supports` and `prefers-reduced-motion: no-preference`, so where it isn't supported, or
motion is reduced, everything sits still. One block in `dusk.css` ("scrolling"):

| What | How |
|---|---|
| The header firms up over content | `head-settle` on `scroll(root)`, first 140 px |
| How far down you are, in dots | `.app-head::after`, a dotted line revealed by `head-dots` |
| The title steps back as you leave it | `title-leave` on the h1's own `view()` exit |
| Sections and rows settle as they arrive | `settle` / `settle-row` on `view()` entry, a fixed 110 to 160 px so tall sections aren't dimmed for long |
| Shelves | snap to cards; cards come up to size (`shelf-in`, `view(inline)`); the edge with more behind it fades (`shelf-edges` animating the registered `--edge-l` / `--edge-r`) |

A full-page screenshot does not scroll, so anything below the fold is caught mid-arrival:
check these with real scrolling.

The show intro (`static/js/views/intro.js`) is a page of choices with a small stage that
shows what the hosts will say: a name, a line of your own with starters to tap, how it opens
(`catalog.INTRO_OPENINGS`: warm welcome, cold open, radio announcer, news desk, late night,
hype; saved as `opening`, sent to the planner as `intro_style` and to a co-host's opening
through `prompts.intro_opening`), and the theme, as tiles you can listen to
(`/api/music/{id}/preview`).

Personas (`static/js/views/personas.js`) follow the same pattern. Browsing: yours and the
cast as tiles, and the one you pick on a stage with what you can do (beside the list on a
wide window, in a sheet on a phone). Making or editing one (`/personas?edit=new`,
`?edit=<id>`, `?from=<cast id>`) is a page of choices: name, gender and voice as tiles,
personality with starters, traits, private notes, with the stage showing them as you go.
The host editor on New pod and the Styles page still use the shared fields in a sheet.
Tapping a voice tile picks it and plays its sample, and the stage has a play button;
the samples are `static/voices/<Name>.mp3`, recorded once by `tools/build_voice_samples.py`.

Briefings (`static/js/views/briefings.js`) too: templates are tiles you pick from (yours
first, tagged), with Edit, Delete or "Make it your own" for the one picked; the stage shows
the briefing you'll get (name, hosts, length, its run of segments, what's waiting on your
watchlist) with Make under it. The watchlist and the morning schedule follow as sections;
"Ready for you" appears at the top only when there are briefings. On a phone, Make sits
right after the length. The template editor is still a sheet.

You (`youView` in `static/js/views/library.js`): the balance is a stage (ring, number,
what it buys, the demo top-up), with the recent ledger, the account and Sign out under it;
everything that's yours is tiles in three groups (Make something, Your sound, People and
numbers). Beside each other on a wide window; on a phone the stage leads and the ledger,
account and Sign out come after the tiles.

New pod and Co-host live (`views/create.js`, `views/cohost-setup.js`): what you're making
stands on a stage beside the form (the pod's cover, title, vibe, hosts and what they have to
go on; or you and your co-host, the mode and the topic), with Go live or Start the call under
it. Hosts are tiles with their voice shapes, co-host modes are tiles, and both pages cast
hosts through one sheet (`static/js/cast.js`, `openCastSheet`): the host on a stage with a
voice sample, your personas and the cast as tiles, and the detailed fields folded under
"Fine-tune them". `cast.js` also holds the stage, voice shape and sample player the Personas
page uses.

Styles (`static/js/views/styles.js`) mirror Personas: yours and the house vibes as tiles, the
picked one on a stage, and an editor page (`/styles?edit=new`, `?edit=<id>`, `?from=<vibe>`)
with a name, how it should sound (with starters) and a colour. `views/saved.js` is gone.
The voice memo page keeps its recorder first; on a wide window a stage beside it says what
you'll get (memo or not, format, length and music, whether you review the outline), with
Make under it. On a phone that stage is hidden and the bar at the bottom carries Make.

Panels that were a form in a white box (`.page .card`, apart from the topic box, the memo
recorder and the credit card) are open sections on the page like New pod, and the saved
cards (personas, styles, templates) are filled tiles rather than outlined ones.

## Checking it

`python -m tests.visual` compares against baselines recorded before Dusk, so every shot
differs until they are re-recorded with `--update`. Its contract checks (gel contrast, no
stray loaders, no sideways scroll at 390 px) still apply as they are.
