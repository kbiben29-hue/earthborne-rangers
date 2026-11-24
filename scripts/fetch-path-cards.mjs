#!/usr/bin/env node
// Downloads every Earthborne Rangers card the way DragnCards has them:
//   - the card database of DragnCards' Earthborne plugin (id 5), typed up by the plugin's authors
//     (repo: github.com/filippopence/dragncards-ebr-plugin), including path, location, weather,
//     mission and challenge cards that RangersDB doesn't have
//   - the card pictures from the plugin's public image storage
// Writes data/dragncards/card-db.json, data/dragncards/game-def.json and images/<file>.
// Runs in the "Fetch path cards" GitHub Action (needs internet; Node 20+).

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const outDir = path.join(root, 'data', 'dragncards')
const imgDir = path.join(root, 'images')
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(imgDir, { recursive: true })
const PLUGIN = 5
const skipImages = process.argv.includes('--no-images')

const get = (url) => fetch(url, { signal: AbortSignal.timeout(60000) })

// 1) The plugin: a JSON string holding gzipped, base64-encoded JSON.
const res = await get(`https://dragncards.com/be/api/plugins/${PLUGIN}`)
if (!res.ok) throw new Error(`DragnCards answered ${res.status}`)
let body = await res.json()
if (typeof body === 'string') body = JSON.parse(zlib.gunzipSync(Buffer.from(body, 'base64')).toString('utf8'))
if (!/earthborne/i.test(body.name)) throw new Error(`Plugin ${PLUGIN} is "${body.name}", not Earthborne Rangers`)

// Tidy each card: drop empty fields, keep both sides.
const tidy = (side) => {
	if (!side || !side.name) return null
	const o = {}
	for (const [k, v] of Object.entries(side)) if (v !== '' && v != null) o[k] = v
	return o
}
const cards = {}
for (const id of Object.keys(body.card_db).sort()) {
	const c = body.card_db[id]
	cards[id] = { A: tidy(c.A), B: tidy(c.B) }
	if (!cards[id].B) delete cards[id].B
}
fs.writeFileSync(path.join(outDir, 'card-db.json'), JSON.stringify(cards, null, '\t') + '\n')
fs.writeFileSync(path.join(outDir, 'game-def.json'), JSON.stringify(body.game_def, null, '\t') + '\n')
fs.writeFileSync(
	path.join(outDir, 'plugin.json'),
	JSON.stringify({ id: body.id, name: body.name, version: body.version, repo_url: body.repo_url, fetched: new Date().toISOString(), cards: Object.keys(cards).length }, null, '\t') + '\n',
)
console.log(`Card database: ${Object.keys(cards).length} cards (plugin version ${body.version})`)

// 2) Pictures.
if (!skipImages) {
	const prefix = body.game_def.imageUrlPrefix?.English || body.game_def.imageUrlPrefix?.Default
	const files = new Set()
	for (const c of Object.values(cards)) for (const s of [c.A, c.B]) if (s?.imageUrl) files.add(s.imageUrl)
	const backs = Object.entries(body.game_def.cardBacks || {}).map(([k, v]) => [v.imageUrl, `back-${k}.jpg`])

	const missing = []
	let got = 0
	const jobs = [...[...files].map((f) => [prefix + f, f]), ...backs]
	const save = async ([url, file]) => {
		const dest = path.join(imgDir, file)
		if (fs.existsSync(dest)) return got++
		for (let i = 0; i < 3; i++) {
			try {
				const r = await get(url)
				if (!r.ok) {
					if (r.status === 403 || r.status === 404) break
					continue
				}
				fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
				return got++
			} catch {}
		}
		missing.push(file)
	}
	for (let i = 0; i < jobs.length; i += 12) await Promise.all(jobs.slice(i, i + 12).map(save))
	fs.writeFileSync(path.join(outDir, 'images-missing.json'), JSON.stringify(missing.sort(), null, 1) + '\n')
	console.log(`Pictures: ${got} saved, ${missing.length} missing (from ${prefix})`)
}
