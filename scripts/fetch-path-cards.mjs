#!/usr/bin/env node
// Downloads the non-Ranger cards (challenge deck, path sets, weather, locations, missions)
// the way the DragnCards Earthborne plugin (github.com/seastan/dragncards-ebr-plugin) shows them:
//   - card IDs come from data/dragncards/prebuilt-decks.json (copied from the plugin)
//   - pictures come from the plugin author's public S3 storage
//   - if DragnCards' API hands out the plugin's card database, it is saved too
// Runs in the "Fetch path cards" GitHub Action (needs internet; Node 20+).

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const outDir = path.join(root, 'data', 'dragncards')
const imgDir = path.join(root, 'images')
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(imgDir, { recursive: true })
const report = { started: new Date().toISOString(), listings: {}, api: {}, images: {}, missing: [] }

const BUCKETS = [
	'https://earthborne-rangers-bucket.s3.eu-west-3.amazonaws.com',
	'https://earthborne-rangers.s3.eu-west-3.amazonaws.com',
]

async function get(url, opts = {}) {
	try {
		const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) })
		return res
	} catch (e) {
		return { ok: false, status: String(e.message || e) }
	}
}

// 1) Try listing each bucket (works if listing is public).
const keys = new Map() // key -> bucket
for (const b of BUCKETS) {
	let token = null
	let pages = 0
	do {
		const url = `${b}/?list-type=2&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
		const res = await get(url)
		if (!res.ok) {
			report.listings[b] = `no listing (${res.status})`
			break
		}
		const xml = await res.text()
		for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.set(m[1], b)
		token = xml.match(/<NextContinuationToken>([^<]+)</)?.[1] ?? null
		pages++
		report.listings[b] = `listed (${pages} page${pages > 1 ? 's' : ''})`
	} while (token && pages < 20)
}
fs.writeFileSync(path.join(outDir, 's3-keys.json'), JSON.stringify([...keys].map(([k, b]) => `${b}/${k}`), null, 1) + '\n')

// 2) Try DragnCards' API for the plugin and its card database.
for (const base of ['https://dragncards.com', 'https://www.dragncards.com']) {
	const res = await get(`${base}/api/plugins`, { headers: { accept: 'application/json' } })
	report.api[`${base}/api/plugins`] = res.status
	if (!res.ok) continue
	let list
	try {
		list = await res.json()
	} catch {
		continue
	}
	fs.writeFileSync(path.join(outDir, 'api-plugins.json'), JSON.stringify(list, null, 1) + '\n')
	const arr = Array.isArray(list) ? list : list.plugins || list.data || []
	const mine = arr.filter((p) => /earthborne|rangers/i.test(JSON.stringify(p).slice(0, 2000)))
	for (const p of mine) {
		const id = p.id ?? p.plugin_id
		for (const u of [`${base}/api/plugins/${id}`, `${base}/api/plugins/${id}/card_db`, `${base}/api/plugins/info/${id}`]) {
			const r = await get(u, { headers: { accept: 'application/json' } })
			report.api[u] = r.status
			if (r.ok) fs.writeFileSync(path.join(outDir, `api-plugin-${id}-${u.split('/').pop()}.json`), await r.text())
		}
	}
	break
}

// 3) Download a picture for every card ID (front and, where there is one, back).
const decks = JSON.parse(fs.readFileSync(path.join(outDir, 'prebuilt-decks.json'), 'utf8'))
const ids = new Set()
for (const d of Object.values(decks)) for (const [id] of d.cards) ids.add(id)
for (const id of ['00000', '01000', '02000']) ids.add(id)
// Ranger cards too (IDs from RangersDB), so the game can show every card's picture.
try {
	for (const c of JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'))) ids.add(c.id)
} catch {}

const FOLDERS = {
	'00': ['00_Challenge_Deck'],
	'01': ['01_Rangers_Cards'],
	'02': ['02_Path_Cards'],
	'03': ['03_Missions', '03_Mission_Cards', '03_Mission'],
	'04': ['04_Weather', '04_Weather_Cards'],
	'05': ['05_Locations', '05_Location_Cards', '05_Location'],
	'06': ['06_Map_and_Reference', '06_Map', '06_Reference', '06_Map&Reference'],
}

// Index the listing by file name so any folder layout works.
const byFile = new Map()
for (const [k, b] of keys) {
	const f = k.split('/').pop()
	if (!byFile.has(f)) byFile.set(f, [])
	byFile.get(f).push(`${b}/${k}`)
}

async function save(url, file) {
	const res = await get(url)
	if (!res.ok) return false
	const buf = Buffer.from(await res.arrayBuffer())
	if (buf.length < 1000) return false
	fs.writeFileSync(path.join(imgDir, file), buf)
	return true
}

for (const id of [...ids].sort()) {
	for (const side of ['', 'B', 'b', '_back', '-back']) {
		const name = id + side
		const want = `${name}.jpg`
		if (fs.existsSync(path.join(imgDir, want))) {
			report.images[name] = 'already'
			continue
		}
		const candidates = []
		for (const ext of ['jpg', 'png', 'webp', 'JPG']) for (const u of byFile.get(`${name}.${ext}`) || []) candidates.push(u)
		for (const b of BUCKETS)
			for (const f of FOLDERS[id.slice(0, 2)] || [])
				for (const ext of ['jpg', 'png']) {
					candidates.push(`${b}/cards/${f}/${name}.${ext}`)
				}
		for (const b of BUCKETS) candidates.push(`${b}/cards/${name}.jpg`)
		let got = null
		for (const u of candidates) {
			if (await save(u, want)) {
				got = u
				break
			}
			if (side && !byFile.size) break // without a listing, only one guess for backs
		}
		if (got) report.images[name] = got
		else if (!side) report.missing.push(id)
	}
}

report.finished = new Date().toISOString()
report.downloaded = Object.keys(report.images).length
fs.writeFileSync(path.join(outDir, 'fetch-report.json'), JSON.stringify(report, null, 1) + '\n')
console.log(`Listed keys: ${keys.size}. Pictures: ${report.downloaded}. Missing fronts: ${report.missing.length}`)
console.log(JSON.stringify(report.listings), JSON.stringify(report.api))
