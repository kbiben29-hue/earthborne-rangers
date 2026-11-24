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
- `src/engine/text.ts` — card text parser: tests (`[AWA] + [reason]: Name [2]`, `(use N token)`,
  success / "If you fail" / "whether you succeed or fail"), challenge lines, Clear, Refresh, Start of Day,
  Arrival Setup, keywords. `clause()` turns a sentence list into `Action`s; `complete` = all understood,
  `lead` = understood leading sentences, `pre` = instructions before ⏩ that gate the rest.
- `src/engine/engine.ts` — the rules (one day): `newDay()`, pure `apply(state, intent)` / `tryApply()`.
  Prompts live in `g.queue` (mulligan, test, resolve, guide, scout, equip, travel, dayOver); the head is
  what the UI shows. `autoOrItem()` does understood, choice-free effects at once and leaves the rest as
  buttons (`act` intent) plus manual tools (`manual` intent).
- `src/campaign/campaign.ts` — campaign tracker, Ranger builder rules, `finishDay()`, localStorage.
- `src/ui/` — `Board.tsx` (table, prompts, card viewer, menu, search), `Screens.tsx` (home, new
  campaign, builder, campaign tracker, deck editor), `Card.tsx`, `styles.css`.

## Hard rules

- **Engine determinism**: no `Math.random`, `Date.now` or `new Date` in `src/engine/**`; use `g.rng`.
- **The engine is DOM-free**: no imports from `src/ui`.
- **Rules source**: the Earthborne Rangers rulebook. Card text overrides rules.
- No campaign guide text in the repo: the game only says which entry to read.
- Every rules change gets a test in `src/engine/*.test.ts`; run `npm test` before committing.

## Next steps

1. Script more card effects (conditions like "If there is an active predator"), most-used first.
2. Campaign tracker weather schedule per day (from the printed tracker) and day-30 handling.
3. Tutorial (like Argaia/Holodeck), online play with a friend (PeerJS, like Afterlife).
4. Legacy of the Ancestors / Spire in Bloom / Shadow of the Storm content (data is already there).
