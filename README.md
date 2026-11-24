# Earthborne Rangers

**Play:** https://kbiben29-hue.github.io/earthborne-rangers/ ·
**Mac app:** [Earthborne-Rangers-Mac.dmg](https://github.com/kbiben29-hue/earthborne-rangers/releases/latest/download/Earthborne-Rangers-Mac.dmg) ·
**Windows app:** [Earthborne-Rangers-Windows-Setup.exe](https://github.com/kbiben29-hue/earthborne-rangers/releases/latest/download/Earthborne-Rangers-Windows-Setup.exe)

Every push to `main` rebuilds all three (`.github/workflows/release.yml`); the links always point at the newest build.

Earthborne Rangers lets you play **Earthborne Rangers** (Earthborne Games) in a web browser: the whole
*Lure of the Valley* campaign, day by day, for 1 to 4 Rangers on one device. It's a fan project with no
official standing, and you need your own copy of the game: when a card or location sends you to the
campaign guide, the game tells you which entry to read.

## What it does

- **Campaigns**: start as many as you like. Each one keeps its campaign tracker: the day (1–30), where you
  are and the terrain you were travelling on, missions (with progress boxes and notes), unlocked rewards,
  notable events, guide entries you were sent to, and a history of every day.
- **Rangers**: pick one of the four starter Rangers from the core box, or **create your own** with the
  rulebook's steps: aspect card, four personality cards, a background, a specialty with its role, and an
  outside interest. The builder checks aspect requirements and the Expert rule. Stewards of the Valley
  cards can be switched on.
- **Rewards and camping**: end a day by camping and you can swap unlocked rewards into your decks before
  the next day. A third injury adds a Lingering Injury to that Ranger's deck.
- **A day of play** follows the rulebook round by round:
  - setup: starting hands with mulligan and Setup cards, the weather, missions, the path deck
    (terrain set + location set, or 3 Valley cards), arrival setup;
  - **path cards** each round, placed within reach or along the way, with ambush;
  - **Ranger turns**: perform tests (the four common tests and every test printed on cards), play cards
    (moments, gear with the 5-square limit, attachments, beings and features, manifestations with conduits),
    use exhaust abilities, rest; the "no two turns in a row unless you exhaust your role" rule;
  - **tests**: fatigue from every ready card in the way (friendly cards don't), obstacles, committing energy,
    approach icons and other Rangers' tokens, the challenge deck with its modifiers, symbols and reshuffles,
    then success, failure and every matching **challenge effect** on active cards, in the rulebook's order;
  - **clearing** cards by progress, harm or Ranger tokens, with their Clear effects;
  - **travel** on the Valley map (river paths need a card), camping, staying;
  - **refresh**: injuries, drawing, energy, readying, Refresh effects on weather and missions;
  - fatigue, soothing, injuries and every way a day can end.
- **Card effects**: the game reads the card text. Plain effects ("Add 1 harm to this feature", "Suffer 1
  injury", "Discard 1 rain from this card ⏩ Each Ranger suffers 1 fatigue") are done for you. When
  something needs a choice or a judgement, the effect is shown with buttons for the parts the game
  understood, and **card tools** (tap any card) for the rest: progress, harm, tokens, exhaust, move,
  attach, flip, discard, Ranger tokens, search a deck or set, scout, draw.
- **Undo** any number of moves, and every day saves itself.

## iPhone and iPad

The table adapts to the screen: on a phone the prompts slide up from the bottom. Open the play link in
Safari, then **Share → Add to Home Screen** for a full-screen app.

## Running it yourself

On a Mac, double-click **Start Earthborne Rangers.command** (needs [Node.js](https://nodejs.org) LTS). On
Windows, **Start Earthborne Rangers (Windows).bat**. Or:

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules tests + random-day test
npm run build      # static site in dist/
npm run data       # rebuild src/data/game.json from data/
```

## Card data

### Path, location, weather, mission and challenge cards (and pictures)

From the card database of the [DragnCards](https://dragncards.com) Earthborne Rangers plugin
([filippopence/dragncards-ebr-plugin](https://github.com/filippopence/dragncards-ebr-plugin)),
whose authors typed the cards in by hand.

| Path | Contents |
|---|---|
| `data/dragncards/card-db.json` | All 762 cards (Ranger and path), side `A` and, for two-sided cards, side `B` |
| `data/dragncards/game-def.json` | The plugin's game setup (prebuilt decks, layouts, tokens) |
| `data/challenge-deck.json` | The 24 challenge cards: aspect modifiers, symbol (sun / mountain / crest), reshuffle |
| `images/<file>.jpg` | A picture of every card (`imageUrl` in card-db), plus `back-*.jpg` card backs |
| `src/data/game.json` | The compact version the game uses (`npm run data`) |

The **Fetch path cards** GitHub Action refreshes this every Monday
(**Actions → Fetch path cards → Run workflow** to run it now).

### Ranger cards

Every Ranger card from [RangersDB](https://rangersdb.com), from its open data repo
[zzorba/rangers-card-data](https://github.com/zzorba/rangers-card-data), in `data/cards.json`,
`data/by-pack/` and friends. The **Update Earthborne cards** Action refreshes it every Monday.

## Legal

Earthborne Rangers is © Earthborne Games. Card data comes from RangersDB and the DragnCards Earthborne
plugin, both fan-made. Earthborne Games has no connection to this project and hasn't approved it.
