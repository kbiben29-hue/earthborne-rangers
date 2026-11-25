# CLAUDE.md

Earthborne Rangers here is an unofficial browser table for **Earthborne Rangers** (Earthborne Games): the
Lure of the Valley campaign for 1–4 Rangers on one device. Sibling of Argaia (kbiben29-hue/Argaia),
Afterlife and Holodeck; same tooling (Vite + React + TypeScript, Pages + Tauri release workflow).

## Commands

```bash
npm run dev     # Vite app on :5173
npm test        # tsx --test src/**/*.test.ts (node:test)
npm run build   # vite build (base './')
npm run data    # scripts/build-game-data.mjs → src/data/game.json
```

## Layout

- `data/dragncards/card-db.json` — DragnCards Earthborne plugin (id 5) card database, fetched by
  `scripts/fetch-path-cards.mjs` from `https://dragncards.com/be/api/plugins/5` (gzipped base64 JSON).
  Pictures in `images/` come from `game_def.imageUrlPrefix` (S3 `earthborne-rangers/eng/`).
- `data/cards.json`, `data/by-pack/` — the earthborne.build card data (github.com/harababurel/rangers-card-data,
  CC0; a fork of RangersDB that adds every path, location, weather, mission and challenge card), refreshed by
  `scripts/update-cards.mjs` (weekly workflow). `build-game-data.mjs` fills in text, thresholds, presence and
  Ranger-card stats by pack + name wherever DragnCards has a picture but no text (ids differ between the two).
- `data/challenge-deck.json` — read off the challenge card pictures (each aspect column sums to −3).
- `scripts/build-game-data.mjs` — compacts the card db: thresholds (`{n, per}`, `{ranger}`, `{x}`),
  keywords, icons, map links (`links: [{to, path}]`), prebuilt Rangers, copies per card.
- `src/data/data.ts` — typed access, `setCards(pack, set)`, `TERRAINS`, image base URL.
- `src/engine/text.ts` — splits a card's text into parts: keywords, tests (success / "If you fail" /
  "whether you succeed or fail", `(use N token)`), challenge lines, Clear, Refresh, Start of Day, Arrival
  Setup (Lead / Next / Each Ranger), "When this enters play", Exhaust/Response abilities, "Choose one:".
- `src/engine/dsl.ts` — reads one effect into `Effect = { cond, pre, steps }`: conditions (`exists` with
  filters like "an active predator", fatigue, zones, tokens…; unknown ones become a yes/no `ask`), refs
  (this / that / the location / a X (choose) / each X / highest presence / named card / host…) and steps
  (add/remove tokens, exhaust, move, fatigue, injury, soothe, search, attach, energy, either…). Anything
  not understood becomes a `manual` step.
- `src/engine/scripts.ts` — `REWRITE`: plain-sentence rewrites of card parts the reader can't handle
  (same meaning), keyed `id+side:part`; `BY_CHALLENGE` arrivals. Coverage check: count `manual` steps.
- `src/engine/triggers.ts` — Ranger-card abilities that happen at a moment: `readTiming("After you succeed at a
  Traverse test")` → `On`; the engine `fire()`s events (success, fatigue, clear, exhaustRole, travel, arrive,
  rest, play, enters, conduit) and offers matching gear / attachment / role / Response-moment abilities;
  "When you would suffer …" prevention via `offerPrevention`. Test-time extras (spirits, Deployed gear,
  "When a Ranger performs a test" moments) are in `testExtras()` and show as checkboxes on the commit panel.
- Stewards of the Valley: Spirit keyword (common tests can't target spirits; only Spiritual attachments),
  spiritspeaking (`Ranger.spiritspeak`, `SPIRIT_TESTS` replace `COMMON_TESTS` until the role readies,
  `baseTests()`), aspirations (`record` step → `g.records`; `finishDay` adds marks + tokens on objective gear,
  unlocks the Personal Reward into `CampaignRanger.personal`).
- `src/engine/engine.ts` — the rules (one day): `newDay()`, pure `apply(state, intent)` / `tryApply()`.
  Prompts live in `g.queue` (mulligan, test, choose, ask, aspect, manual, guide, scout, equip, travel,
  dayOver); effects run as jobs in `g.jobs` (`runJobs`), stopping only for a prompt. `testOptions()` lists
  what can be added to a test (role/response dodges, greaves, gear boosts, Memlev poles, responses,
  Versatile); `iconsFor()` handles Vigilant-style attributes.
- `src/campaign/campaign.ts` — campaign tracker, Ranger builder rules, `finishDay()`, localStorage.
- `src/ui/` — `Board.tsx` (Holodeck-style table: felt, Ranger mats with piles, fanned hand with green glow on playable cards, click or drag to play, tap a card for its action bubble, right-click / "Look closer" to inspect; prompts float in `.tray`), `motion.ts` (cards fly between piles and zones, keyed by `data-uid` / `data-anchor`), `Screens.tsx` (home, new
  campaign, builder, campaign tracker, deck editor), `Card.tsx`, `styles.css`.
- `src/ui/coach.ts` — tutorial coach: `INTRO` pages, `coachFor()` (step text + a suggested move from a
  simple heuristic, shown as gold glow on act buttons / cards / hand), `eventNote()` one-off notes. The
  tutorial is a throwaway campaign (`tutorial: true`, fixed seed) started from Home.

## Hard rules

- **Engine determinism**: no `Math.random`, `Date.now` or `new Date` in `src/engine/**`; use `g.rng`.
- **The engine is DOM-free**: no imports from `src/ui`.
- **Rules source**: the Earthborne Rangers rulebook. Card text overrides rules.
- No campaign guide text in the repo: the game only says which entry to read.
- Every rules change gets a test in `src/engine/*.test.ts`; run `npm test` before committing.

## Next steps

1. Ranger cards still partly by hand: Reverb Locket, Perfect Recall, Functional Replica, Paratrepsis
   Whistle, Calming Presence's cancel, Root Snare, Harmonize, Sky Whip (moment tests), Local Fare,
   Nature's Abundance, Afforded by Nature, Moment of Desperation; path cards: Whispering Fields, Mount
   Nim, Elders' deck swaps, Dace, Evergreen Hall / Hearty Brew, Spire deck, Biscuit Basket.
   Stewards of the Valley by hand: The Best Teacher, Alloy Recycler, Essays' "it does not move", Zoological
   Recorder / Compendium, A Deeper Connection's harm prevention, A Circuitous Route, Show No Fear, All is
   Clay, Spirit of the Verdessa, Atrox / Irix / Lutrinal Spirits, Carbonforged Drum, The Better Part of
   Valor, Go Forth Fearless Ranger, The Tale of Two Rivers, Needle Moss, Transverse Ocarina (ready),
   Conductor, Influential, Gratitude of the Valley, Superior Trail, Brightfruit Tree's response.
2. Campaign tracker weather schedule per day (from the printed tracker) and day-30 handling.
3. Online play with a friend (PeerJS, like Afterlife).
4. Expansion order agreed with Kris: SoV (done, see above) → Spire in Bloom + Shadow of the Storm →
   Moments on the Path / Valley → Legacy of the Ancestors. Card text for all of them now comes from the
   earthborne.build data (below); what's left is the rules each box adds (locations on the map, path
   sets, missions, weather, Otherworld deck, effigies, Arcology…). Into the Maw: only its 5 Ranger cards exist.
