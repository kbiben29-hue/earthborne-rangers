#!/usr/bin/env node
// Builds data/ from a checkout of the Earthborne card data: harababurel/rangers-card-data, the fork of
// RangersDB's data (zzorba/rangers-card-data) behind earthborne.build that adds every path, location,
// weather, mission and challenge card (CC0).
//
//   git clone --depth 1 https://github.com/harababurel/rangers-card-data /tmp/rangers-card-data
//   node scripts/update-cards.mjs /tmp/rangers-card-data
//
// The GitHub Action "Update Earthborne cards" does both steps every Monday.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const src = process.argv[2]
if (!src || !fs.existsSync(path.join(src, 'packs.json'))) {
	console.error('Usage: node scripts/update-cards.mjs <path to rangers-card-data checkout>')
	process.exit(1)
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(root, 'data')
const read = (p) => JSON.parse(fs.readFileSync(path.join(src, p), 'utf8'))
const write = (p, v) => {
	const file = path.join(out, p)
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, JSON.stringify(v, null, '\t') + '\n')
}

const packs = read('packs.json').sort((a, b) => a.position - b.position)
const sets = read('sets.json')
const setName = Object.fromEntries(sets.map((s) => [s.id, s.name]))
const setType = Object.fromEntries(sets.map((s) => [s.id, s.type_id ?? null]))

// Plain-text copy of the rules text: RangersDB uses [icon] tags and a little HTML.
const plain = (t) =>
	t == null
		? undefined
		: t
				.replace(/<\/?(b|i|u|f)>/g, '')
				.replace(/<[^>]+>/g, '')
				.replace(/\[([a-z_]+)\]/gi, (_, k) => `[${k}]`)

const all = []
const byPack = {}
for (const pack of packs) {
	// the core set is "ebr" in some forks but its folder is packs/core
	if (pack.id === 'ebr') pack.id = 'core'
	const dir = path.join(src, 'packs', pack.id)
	if (!fs.existsSync(dir)) continue
	const cards = []
	for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
		for (const c of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
			cards.push({
				...c,
				pack_id: pack.id,
				pack_name: pack.name,
				set_name: setName[c.set_id],
				set_type: setType[c.set_id],
				plain_text: plain(c.text),
			})
		}
	}
	cards.sort((a, b) => (a.id < b.id ? -1 : 1))
	byPack[pack.id] = cards
	all.push(...cards)
	write(`by-pack/${pack.id}.json`, cards)
}

write('cards.json', all)
write('packs.json', packs)
for (const f of ['sets', 'subsets', 'types', 'aspects', 'areas', 'tokens', 'set_types', 'deck_errors', 'faq_entries']) {
	if (fs.existsSync(path.join(src, `${f}.json`))) write(`${f}.json`, read(`${f}.json`))
}
const tabooDir = path.join(src, 'taboos')
if (fs.existsSync(tabooDir)) {
	for (const f of fs.readdirSync(tabooDir).filter((f) => f.endsWith('.json'))) {
		write(`taboos/${f}`, JSON.parse(fs.readFileSync(path.join(tabooDir, f), 'utf8')))
	}
}

let commit = null
try {
	commit = execSync('git rev-parse HEAD', { cwd: src }).toString().trim()
} catch {}

const counts = {}
for (const c of all) counts[c.type_id] = (counts[c.type_id] ?? 0) + 1
write('meta.json', {
	source: 'https://github.com/harababurel/rangers-card-data (earthborne.build; fork of RangersDB zzorba/rangers-card-data)',
	source_commit: commit,
	updated: new Date().toISOString(),
	cards: all.length,
	by_pack: Object.fromEntries(Object.entries(byPack).map(([k, v]) => [k, v.length])),
	by_type: counts,
})

console.log(`Wrote ${all.length} cards from ${Object.keys(byPack).length} packs to data/`)
