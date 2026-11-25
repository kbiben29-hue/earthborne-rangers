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
const rdbList = read('data/cards.json')
const rdb = Object.fromEntries(rdbList.map((c) => [c.id, c]))
// The earthborne.build data (harababurel/rangers-card-data) also has every path, location, weather and
// mission card. DragnCards has the pictures but no text for most expansion cards: fill it in by name.
const PACK = { Core: 'core', LoA: 'loa', SoV: 'sotv', SiB: 'sib', SoS: 'sos', MoP: 'mop', MoV: 'miv' }
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const rcBy = {}
for (const c of rdbList) (rcBy[`${c.pack_id}:${norm(c.name)}`] ??= []).push(c)
const rcFind = (pack, name, type) => {
	const l = rcBy[`${PACK[pack] ?? pack}:${norm(name)}`] ?? rcBy[`${PACK[pack] ?? pack}:${norm(name).replace(/s$/, '')}`]
	if (!l) return null
	return l.find((c) => norm(c.type_id) === norm(type)) ?? l[0]
}
/** RangersDB-style card → text in the DragnCards layout the parser reads. */
function rcText(c) {
	const fix = (t) => String(t).replace(/<hr>/g, '\n').replace(/(\d) \[(harm|progress)\]/g, '$1[$2]')
	const lines = []
	if (c.text) lines.push(fix(c.text))
	if (c.arrival_setup) lines.push('Arrival Setup:', fix(c.arrival_setup))
	for (const sym of ['sun', 'mountain', 'crest']) if (c[`${sym}_challenge`]) lines.push(`[${sym}] ${fix(c[`${sym}_challenge`])}`)
	if (c.type_id === 'location' && c.guide_entry != null && !/\[guide\]/.test(lines.join(' '))) lines.push(`[guide] ${c.guide_entry}`)
	return lines.join('\n').trim()
}
const rcThreshold = (v) => (v == null ? null : String(v).replace(/\[per_ranger\]/g, '[perranger]'))
let filled = 0
let filledSym = 0

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
		.replace(/<hr\s*\/?>/g, '\n')
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
	// two-sided cards named "Front / Back" on DragnCards
	const [nm1, nm2] = a.name.split(' / ')
	if (nm2 && b) b.name = nm2
	const o = {
		id,
		name: nm1,
		type,
		set: a.set,
		pack: a.pack_code,
		back: a.cardBack,
		img: a.imageUrl,
	}
	if (a.traits) o.traits = a.traits
	const nameA = a.name.split(' / ')[0]
	const rcA = !clean(a.text) ? rcFind(a.pack_code, nameA === 'Trail of Ooze' ? 'Trial of Ooze' : nameA, type) : null
	if (rcA) {
		filled++
		a.text = rcText(rcA)
		if (a.presence == null && rcA.presence != null) a.presence = rcA.presence
		if (!a.progress_threshold && rcA.progress) a.progress_threshold = rcThreshold(rcA.progress)
		if (!a.harm_threshold && rcA.harm) a.harm_threshold = rcA.harm === '/' ? '-' : rcThreshold(rcA.harm)
		if (!a.reveal && rcA.area_id) a.reveal = rcA.area_id === 'within_reach' ? 'within_reach' : 'along_the_way'
		if (!a.traits && rcA.traits) o.traits = rcA.traits
		if (rcA.category_id === 'ranger') {
			if (a.cost == null || a.cost === '') a.cost = rcA.cost
			if (!a.sphere_name && rcA.aspect_id) {
				a.sphere_name = rcA.aspect_id
				a.sphere_cost = rcA.level
			}
			if (!a.equip_value && rcA.equip) a.equip_value = rcA.equip
			if (!a.generic_token && rcA.token_id) a.generic_token = `${rcA.token_count ?? 0} ${rcA.token_id}`
			for (const k of ['conflict', 'reason', 'exploration', 'connection']) if (!a[`${k}_number`] && rcA[`approach_${k}`]) a[`${k}_number`] = rcA[`approach_${k}`]
		}
	}
	let text = a.cardBack === 'player' && rdb[id]?.name === a.name && rdb[id].text ? clean(rdb[id].text) : clean(a.text)
	// DragnCards sometimes leaves out a card's challenge effects (Sitka Doe, Prowling Wolhund…): add them from the earthborne.build data
	const rcAny = rcFind(a.pack_code, nameA, type)
	if (rcAny && text) {
		const fix = (t) => String(t).replace(/<hr>/g, '\n').replace(/(\d) \[(harm|progress)\]/g, '$1[$2]')
		for (const sym of ['sun', 'mountain', 'crest'])
			if (rcAny[`${sym}_challenge`] && !text.includes(`[${sym}]`)) {
				text += `\n[${sym}] ${fix(rcAny[`${sym}_challenge`])}`
				filledSym++
			}
	}
	// "[spi]" → "[SPI]"
	text = text.replace(/\[(awa|fit|foc|spi)\]/g, (m, k) => `[${k.toUpperCase()}]`)
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
		const rcB = !clean(b.text) ? rcFind(a.pack_code, b.name, b.type ?? type) : null
		if (rcB) {
			filled++
			b.text = rcText(rcB)
			if (b.presence == null && rcB.presence != null) b.presence = rcB.presence
			if (!b.progress_threshold && rcB.progress) b.progress_threshold = rcThreshold(rcB.progress)
			if (!b.harm_threshold && rcB.harm) b.harm_threshold = rcB.harm === '/' ? '-' : rcThreshold(rcB.harm)
		}
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
	// path deck assembly instructions on locations (earthborne.build data)
	if (type === 'Location') {
		const r = rcFind(a.pack_code, nameA, 'location')
		if (r?.path_deck_assembly) o.pda = r.path_deck_assembly.replace(/<f>[\s\S]*?<\/f>/g, '').replace(/<[^>]+>/g, '').trim()
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
// Links go both ways (expansion locations list their core neighbours, not the other way round).
for (const c of Object.values(cards)) {
	for (const l of c.links ?? []) {
		const o = cards[l.to]
		if (!o) continue
		o.links ??= []
		if (!o.links.some((x) => x.to === c.id)) o.links.push({ to: c.id, path: l.path })
	}
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
console.log(`text from earthborne.build data for ${filled} card sides; ${filledSym} missing challenge effects added`)
console.log(`game.json: ${Object.keys(cards).length} cards, ${Object.keys(sets).length} sets, ${Object.keys(prebuilt).length} prebuilt Rangers`)
