# Earthborne Rangers

A browser version of **Earthborne Rangers** (Earthborne Games) is on its way here, built like
[Argaia](https://github.com/kbiben29-hue/Argaia) and Afterlife. The first step is done: every
Ranger card is saved in this repo.

## Card data

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

**What RangersDB doesn't have:** path cards (terrain sets, beings and features you meet on the
trail, weather, locations, missions), the challenge deck, and card pictures.

## Updating

The **Update Earthborne cards** GitHub Action runs every Monday. To run it now:
**Actions → Update Earthborne cards → Run workflow**.

On your Mac (needs Node 18+):

```sh
git clone --depth 1 https://github.com/zzorba/rangers-card-data /tmp/rangers-card-data
node scripts/update-cards.mjs /tmp/rangers-card-data
```

## Credits

Card data comes from RangersDB, a fan-made site. Earthborne Rangers is a game by Earthborne Games.
This repo is for personal use and isn't affiliated with either.
