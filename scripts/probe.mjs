// Quick look at what DragnCards and the S3 storage answer (writes data/dragncards/probe.json).
import fs from 'node:fs'
const out = {}
async function look(url, keep) {
	try {
		const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
		const buf = Buffer.from(await r.arrayBuffer())
		const head = buf.slice(0, 300).toString('utf8')
		out[url] = { status: r.status, type: r.headers.get('content-type'), bytes: buf.length, head }
		if (keep && r.ok) fs.writeFileSync(`data/dragncards/${keep}`, buf)
		return r.ok ? buf : null
	} catch (e) {
		out[url] = String(e)
	}
}
await look('https://earthborne-rangers.s3.eu-west-3.amazonaws.com/cards/00_Challenge_Deck/00000.jpg')
await look('https://earthborne-rangers-bucket.s3.eu-west-3.amazonaws.com/cards/00_Challenge_Deck/00000.jpg')
await look('https://earthborne-rangers.s3.eu-west-3.amazonaws.com/background-and-tokens/harm.png')
await look('https://earthborne-rangers-bucket.s3.eu-west-3.amazonaws.com/cards/02001.jpg')
const list = await look('https://dragncards.com/be/api/plugins', 'be-plugins.json')
let id = null
if (list) {
	try {
		const j = JSON.parse(list.toString())
		const arr = Array.isArray(j) ? j : j.plugins || j.data || []
		const p = arr.find((p) => /earthborne/i.test(JSON.stringify(p)))
		id = p?.id ?? null
		out.found = p ? { id: p.id, name: p.name || p.plugin_name } : 'not found'
	} catch (e) {
		out.parse = String(e)
	}
}
if (id != null) {
	for (const u of [
		`https://dragncards.com/be/api/plugins/${id}`,
		`https://dragncards.com/be/api/plugins/visible/${id}`,
		`https://dragncards.com/be/api/plugins/info/${id}`,
		`https://dragncards.com/be/api/plugins/${id}/card_db`,
	])
		await look(u, `be-${u.split('/be/api/')[1].replaceAll('/', '-')}.json`)
}
fs.writeFileSync('data/dragncards/probe.json', JSON.stringify(out, null, 1) + '\n')
console.log(JSON.stringify(out, null, 1).slice(0, 4000))
