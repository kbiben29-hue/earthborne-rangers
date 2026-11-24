#!/usr/bin/env node
// Turns data/dragncards/card-db.json (+ game-def.json, challenge-deck.json) into the compact
// src/data/game.json the game uses. Run after "Fetch path cards" updates the data:
//   node scripts/build-game-data.mjs

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const db = read('data/dragncards/card-db.json')
const def = read('data/dragncards/game-def.json')
const challenge = read('data/challenge-deck.json')
// RangersDB has cleaner Ranger card text (line breaks, [AWA] icons): use it where the ids match.
const rdb = Object.fromEntries(read('data/cards.json').map((c) => [c.id, c]))

// How many copies of each card (from DragnCards' prebuilt decks).
const qty = {}
for (const d of Object.values(def.preBuiltDecks))
	for (const c of d.cards) qty[c.databaseId] = Math.max(qty[c.databaseId] ?? 0, c.quantity ?? 1)

const num = (v) => (v == null || v === '' || v === '-' ? null : /^\d+$/.test(String(v).trim()) ? Number(v) : String(v).trim())
function threshold(v) {
	if (v == null || v === '' || v === '-') return null
	const s = String(v).replace(/\s+/g, '')
	if (s === '[ranger]') return { ranger: true }
	if (s === 'X') return { x: true }
	const m = s.match(/^(\d+)(\[perranger\])?$/)
	if (m) return { n: Number(m[1]), per: !!m[2] }
	return { text: s }
}
// Clean DragnCards markup: fix the many "<\b>" style closers, normalise line breaks.
function clean(t) {
	if (!t) return ''
	return String(t)
		.replace(/\\n/g, '\n')
		.replace(/<\\(b|f|i)>/g, '</$1>')
		.replace(/\\(b|f|i)>/g, '</$1>')
		.replace(/<f>(.*?)<f>/g, '<f>$1</f>')
		.replace(/\r/g, '')
		.trim()
}
const KEYWORDS = ['Ambush', 'Obstacle', 'Friendly', 'Persistent', 'Unique', 'Fatiguing', 'Disconnected', 'Setup', 'Conduit', 'Manifestation', 'Deployed', 'Dormant', 'Expert']
function keywords(text) {
	const first = (text.split('\n')[0] || '').replace(/<[^>]+>/g, '')
	const out = []
	for (const part of first.split(/\.\s*/)) {
		const p = part.trim()
		const m = p.match(/^([A-Z][a-z]+)(?:\s+(\d+))?$/)
		if (m && KEYWORDS.includes(m[1])) out.push(m[2] ? `${m[1]} ${m[2]}` : m[1])
	}
	return out
}
const slug = (s) =>
	s
		.toLowerCase()
		.replace(/[’']/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')

const cards = {}
for (const [id, c] of Object.entries(db)) {
	const a = c.A
	const b = c.B
	if (!a?.name) continue
	const type = a.type
	const o = {
		id,
		name: a.name,
		type,
		set: a.set,
		pack: a.pack_code,
		back: a.cardBack,
		img: a.imageUrl,
	}
	if (a.traits) o.traits = a.traits
	const text = a.cardBack === 'player' && rdb[id]?.name === a.name && rdb[id].text ? clean(rdb[id].text) : clean(a.text)
	if (text) o.text = text
	const kw = keywords(text)
	if (kw.length) o.kw = kw
	if (a.presence != null) o.presence = num(a.presence)
	const ht = threshold(a.harm_threshold)
	if (ht) o.harm = ht
	if (a.harm_threshold === '-') o.noHarm = true
	const pt = threshold(a.progress_threshold)
	if (pt) o.prog = pt
	if (a.progress_threshold === '-') o.noProg = true
	if (a.reveal) o.area = a.reveal === 'within_reach' ? 'reach' : 'along'
	if (a.cost != null && a.cost !== '') o.cost = num(a.cost)
	if (a.sphere_name && a.sphere_name !== 'Role') {
		o.aspect = a.sphere_name
		if (a.sphere_cost != null && a.sphere_cost !== '') o.level = Number(a.sphere_cost)
	}
	if (a.equip_value != null && a.equip_value !== '') o.equip = Number(a.equip_value)
	if (a.generic_token) {
		const m = a.generic_token.match(/^(\d+)\s+(.+)$/)
		if (m) o.tokens = { n: Number(m[1]), name: m[2], per: a.scaleGenericTokenPerPlayer === 'TRUE' }
	}
	const ap = {}
	const fromRdb = a.cardBack === 'player' && rdb[id]?.name === a.name
	for (const k of ['conflict', 'reason', 'exploration', 'connection']) {
		const n = fromRdb ? Number(rdb[id][`approach_${k}`] || 0) : Number(a[`${k}_number`] || 0)
		if (n) ap[k] = n
	}
	if (Object.keys(ap).length) o.icons = ap
	if (type === 'Aspect') o.aspects = { AWA: Number(a.AWA), FIT: Number(a.FIT), FOC: Number(a.FOC), SPI: Number(a.SPI) }
	if (a.deck_limit) o.limit = Number(a.deck_limit)
	if (a.connectedLocations) {
		try {
			o.links = JSON.parse(a.connectedLocations)
			o.paths = JSON.parse(a.connectedPaths || '[]')
		} catch {}
	}
	if (a.pivotal != null) o.pivotal = a.pivotal === '1'
	if (b?.name && a.cardBack === 'multi_sided') {
		o.B = { name: b.name, img: b.imageUrl }
		const tb = clean(b.text)
		if (tb) o.B.text = tb
		if (b.type && b.type !== type) o.B.type = b.type
		if (b.traits && b.traits !== a.traits) o.B.traits = b.traits
		const p2 = threshold(b.progress_threshold)
		if (p2 && JSON.stringify(p2) !== JSON.stringify(pt)) o.B.prog = p2
		const h2 = threshold(b.harm_threshold)
		if (h2 && JSON.stringify(h2) !== JSON.stringify(ht)) o.B.harm = h2
		if (b.presence != null && b.presence !== a.presence) o.B.presence = num(b.presence)
		if (b.reveal) o.B.area = b.reveal === 'within_reach' ? 'reach' : 'along'
	}
	o.qty = qty[id] ?? 1
	if (type === 'Location') o.key = slug(a.name)
	cards[id] = o
}

// Locations: resolve map links to card ids.
const locByKey = {}
for (const c of Object.values(cards)) {
	if (c.type !== 'Location') continue
	for (const k of [c.key, c.key.replace(/^the_/, ''), `the_${c.key}`]) if (!locByKey[k] || c.pack === 'Core') locByKey[k] = c.id
}
locByKey['spire2'] = locByKey['spire']
for (const c of Object.values(cards)) {
	if (!c.links) continue
	const links = []
	c.links.forEach((k, i) => {
		const to = locByKey[k] ?? locByKey[k.replace(/LoA$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()]
		if (to && to !== c.id) links.push({ to, path: (c.paths[i] || '').replace(/-/g, '_') })
	})
	c.links = links
	delete c.paths
}

// Card sets (path sets, ranger sets) with copies.
const sets = {}
for (const c of Object.values(cards)) {
	if (!['path', 'player'].includes(c.back)) continue
	const key = `${c.pack}:${c.set}`
	;(sets[key] ??= []).push(c.id)
}

const prebuilt = {}
for (const [k, d] of Object.entries(def.preBuiltDecks)) {
	const role = d.cards.find((c) => c.loadGroupId === 'playerNRole')
	if (!role) continue
	prebuilt[k] = {
		role: role.databaseId,
		aspect: d.cards.find((c) => c.loadGroupId === 'playerNAspect')?.databaseId,
		deck: d.cards.filter((c) => c.loadGroupId === 'playerNDeck').flatMap((c) => Array(c.quantity ?? 1).fill(c.databaseId)),
	}
}

const out = { built: new Date().toISOString().slice(0, 10), cards, sets, challenge, prebuilt }
fs.mkdirSync(path.join(root, 'src/data'), { recursive: true })
fs.writeFileSync(path.join(root, 'src/data/game.json'), JSON.stringify(out))
console.log(`game.json: ${Object.keys(cards).length} cards, ${Object.keys(sets).length} sets, ${Object.keys(prebuilt).length} prebuilt Rangers`)
