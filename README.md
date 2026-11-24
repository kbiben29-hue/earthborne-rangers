# Earthborne Rangers

A browser version of **Earthborne Rangers** (Earthborne Games) is on its way here, built like
[Argaia](https://github.com/kbiben29-hue/Argaia) and Afterlife. The first step is done: every
card in the game is saved in this repo, with its picture.

## Path, location, weather, mission and challenge cards (and pictures)

From the card database of the [DragnCards](https://dragncards.com) Earthborne Rangers plugin
([filippopence/dragncards-ebr-plugin](https://github.com/filippopence/dragncards-ebr-plugin)),
whose authors typed the cards in by hand.

| Path | Contents |
|---|---|
| `data/dragncards/card-db.json` | All 762 cards (Ranger and path), side `A` and, for two-sided cards, side `B` |
| `data/dragncards/game-def.json` | The plugin's game setup (prebuilt decks, layouts, tokens) |
| `data/challenge-deck.json` | The 24 challenge cards: aspect modifiers, symbol (sun / mountain / crest), reshuffle |
| `images/<file>.jpg` | A picture of every card (`imageUrl` in card-db), plus `back-*.jpg` card backs |

Most path cards have their text in the database. Challenge cards, missions and the Moments
expansions only have pictures; `challenge-deck.json` was read off the pictures.

The **Fetch path cards** GitHub Action refreshes this every Monday
(**Actions → Fetch path cards → Run workflow** to run it now).

## Ranger cards

Every Ranger card from [RangersDB](https://rangersdb.com), taken from its open data repo
[zzorba/rangers-card-data](https://github.com/zzorba/rangers-card-data).

| Path | Contents |
|---|---|
| `data/cards.json` | All cards in one file |
| `data/by-pack/<pack>.json` | Cards split by box (core, loa, sotv, sib, sos, itm) |
| `data/packs.json`, `sets.json`, `subsets.json` | Boxes and card sets (backgrounds, specialties, personality, rewards…) |
| `data/types.json`, `aspects.json`, `areas.json`, `tokens.json` | Lookup lists |
| `data/taboos/` | Taboo list |
| `data/meta.json` | When the data was last updated and how many cards |

Each card has fields like `id`, `name`, `type_id`, `set_id`, `aspect_id`, `cost`, `level`,
`traits`, `text` (RangersDB markup, with `[icon]` tags), `plain_text`, the approach icons
(`approach_conflict`, `approach_reason`, `approach_exploration`, `approach_connection`) and,
for beings, `presence`, `harm` and `progress`.

RangersDB doesn't have path cards or pictures; those come from DragnCards (above).

## Updating

The **Update Earthborne cards** GitHub Action runs every Monday. To run it now:
**Actions → Update Earthborne cards → Run workflow**.

On your Mac (needs Node 18+):

```sh
git clone --depth 1 https://github.com/zzorba/rangers-card-data /tmp/rangers-card-data
node scripts/update-cards.mjs /tmp/rangers-card-data
```

## Credits

Card data comes from RangersDB and the DragnCards Earthborne plugin, both fan-made. Earthborne Rangers is a game by Earthborne Games.
This repo is for personal use and isn't affiliated with either.
