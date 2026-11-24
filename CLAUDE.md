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
- `src/engine/engine.ts` — the rules (one day): `newDay()`, pure `apply(state, intent)` / `tryApply()`.
  Prompts live in `g.queue` (mulligan, test, choose, ask, aspect, manual, guide, scout, equip, travel,
  dayOver); effects run as jobs in `g.jobs` (`runJobs`), stopping only for a prompt. `testOptions()` lists
  what can be added to a test (role/response dodges, greaves, gear boosts, Memlev poles, responses,
  Versatile); `iconsFor()` handles Vigilant-style attributes.
- `src/campaign/campaign.ts` — campaign tracker, Ranger builder rules, `finishDay()`, localStorage.
- `src/ui/` — `Board.tsx` (Holodeck-style table: felt, Ranger mats with piles, fanned hand with green glow on playable cards, click or drag to play, tap a card for its action bubble, right-click / "Look closer" to inspect; prompts float in `.tray`), `motion.ts` (cards fly between piles and zones, keyed by `data-uid` / `data-anchor`), `Screens.tsx` (home, new
  campaign, builder, campaign tracker, deck editor), `Card.tsx`, `styles.css`.

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
2. Campaign tracker weather schedule per day (from the printed tracker) and day-30 handling.
3. Tutorial (like Argaia/Holodeck), online play with a friend (PeerJS, like Afterlife).
4. Legacy of the Ancestors / Spire in Bloom / Shadow of the Storm content (data is already there).
