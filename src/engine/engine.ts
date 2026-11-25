// The Earthborne Rangers rules engine: one day of play. Pure: apply() clones the state.
// Rules source: the Earthborne Rangers rulebook (core set). Card text overrides rules.
// Card text is read by text.ts / dsl.ts into effects; runJobs() carries them out and only
// stops to ask when there is a real choice.
import { ASPECTS, card, CARDS, CHALLENGE, setCards, TERRAINS, type Aspect, type CardDef } from '../data/data'
import type { Amount, Cond, Effect, Filter, Ref, Step } from './dsl'
import { effect as effectOf } from './dsl'
import { shuffle } from './rng'
import { scriptFor } from './scripts'
import { COMMON_TESTS, parse, SPIRIT_TESTS, type Ability, type Parsed, type Sym } from './text'
import { readTiming, type Ev, type On } from './triggers'
import type { Game, Inst, Intent, Job, ManualOp, Ranger } from './types'

// ---------------------------------------------------------------- card helpers

function flat(id: string) {
	return (card(id).text || '').replace(/<f>[\s\S]*?<\/f>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
}
const parsedCache = new Map<string, Parsed>()
export function parsedOf(id: string, side: 'A' | 'B' = 'A'): Parsed {
	const k = id + side
	let p = parsedCache.get(k)
	if (!p) {
		const c = card(id)
		p = parse(side === 'B' && c.B ? c.B.text : c.text)
		scriptFor(id, side, p)
		parsedCache.set(k, p)
	}
	return p
}
export const P = (g: Game, uid: number) => parsedOf(g.inst[uid].id, g.inst[uid].side)
export const def = (g: Game, uid: number): CardDef => card(g.inst[uid].id)
export function nameOf(g: Game, uid: number): string {
	const i = g.inst[uid]
	if (!i) return 'a card'
	const c = card(i.id)
	return i.side === 'B' && c.B ? c.B.name : c.name
}
export function traitsOf(g: Game, uid: number): string[] {
	const i = g.inst[uid]
	const c = card(i.id)
	let tr = ((i.side === 'B' && c.B?.traits) || c.traits || '')
		.toLowerCase()
		.split('/')
		.map((t) => t.trim())
		.filter(Boolean)
	for (const a of attachments(g, uid)) {
		if (a.faceDown) continue
		const t = flat(a.id)
		const gain = t.match(/The attached card gains the (\w+) trait/i)
		if (gain) tr = [...tr, gain[1].toLowerCase()]
		const lose = t.match(/Attached card loses the (\w+) trait/i)
		if (lose) tr = tr.filter((x) => x !== lose[1].toLowerCase())
	}
	return tr
}
export function typeOf(g: Game, uid: number): string {
	const i = g.inst[uid]
	const c = card(i.id)
	return (i.side === 'B' && c.B?.type) || c.type
}
export function presence(g: Game, uid: number): number {
	const i = g.inst[uid]
	if (!i) return 0
	if (g.zeroPresence?.includes(uid)) return 0
	const c = card(i.id)
	const p = i.side === 'B' && c.B?.presence != null ? c.B.presence : c.presence
	let n = typeof p === 'number' ? p : p === 'X' && /number of \[harm\]/.test(c.text || '') ? i.harm : 0
	// Surveyed Land: "Reduce the attached feature's presence by 1 for each marker"
	for (const a of attachments(g, uid)) if (/Reduce the attached \w+'s presence by 1 for each/i.test(flat(a.id))) n -= a.tokens
	return Math.max(0, n)
}
export function keywords(g: Game, uid: number): string[] {
	const out = P(g, uid).keywords.map((k) => k.split(' ')[0])
	// "The attached being gains friendly." (That Which Connects Us)
	for (const a of attachments(g, uid)) {
		const m = flat(a.id).match(/The attached \w+ gains (friendly|persistent|obstacle)\./i)
		if (m) out.push(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase())
	}
	return out
}
export const has = (g: Game, uid: number, kw: string) => keywords(g, uid).includes(kw)
const nRangers = (g: Game) => g.rangers.length
export function threshold(g: Game, uid: number, what: 'prog' | 'harm'): number | 'ranger' | null {
	const i = g.inst[uid]
	const c = card(i.id)
	const t = (i.side === 'B' && c.B?.[what]) || c[what]
	if (!t) return null
	if (t.ranger) return 'ranger'
	if (t.n == null) return null
	return t.per ? t.n * nRangers(g) : t.n
}

// ---------------------------------------------------------------- state helpers

const clone = <T>(x: T): T => structuredClone(x)
export function log(g: Game, s: string) {
	g.log.push(s)
	if (g.log.length > 400) g.log.splice(0, g.log.length - 400)
}
const rangerName = (g: Game, r: number) => g.rangers[r]?.name ?? 'Ranger'
function addInst(g: Game, id: string, zone: Inst['zone'], owner: number | null, kind: Inst['kind'], side: 'A' | 'B' = 'A'): number {
	const uid = g.next++
	const c = card(id)
	g.inst[uid] = {
		uid,
		id,
		side,
		exhausted: false,
		progress: 0,
		harm: 0,
		tokens: c.tokens ? c.tokens.n * (c.tokens.per ? nRangers(g) : 1) : 0,
		zone,
		owner,
		attachedTo: null,
		kind,
	}
	return uid
}
export const inPlay = (g: Game) => Object.values(g.inst).filter((i) => !i.faceDown)
export const zoneCards = (g: Game, zone: Inst['zone'], owner: number | null = null) =>
	Object.values(g.inst).filter((i) => i.zone === zone && (owner == null || i.owner === owner) && i.attachedTo == null)
export const attachments = (g: Game, uid: number) => Object.values(g.inst).filter((i) => i.attachedTo === uid)

function removeInst(g: Game, uid: number, to: 'discard' | 'collection' | 'hand' | 'pathTop' | 'shuffle') {
	const i = g.inst[uid]
	if (!i) return
	for (const a of attachments(g, uid)) removeInst(g, a.uid, 'discard')
	for (const r of g.rangers) if (r.token === uid) r.token = null
	delete g.inst[uid]
	if (i.kind === 'path') {
		if (to === 'pathTop') g.pathDeck.unshift(i.id)
		else if (to === 'shuffle') g.pathDeck = shuffle([...g.pathDeck, i.id], g.rng)
		else if (to !== 'collection') g.pathDiscard.push(i.id)
	} else if (i.kind === 'ranger' && i.deckOf != null) {
		const r = g.rangers[i.deckOf]
		if (to === 'hand') r.hand.push(i.id)
		else if (to !== 'collection') r.discard.push(i.id)
	}
}

// ---------------------------------------------------------------- Ranger resources

export function sufferFatigue(g: Game, r: number, n: number, why = '', raw = false) {
	if (n <= 0 || g.ended) return
	if (!raw && offerPrevention(g, { e: 'wouldFatigue', ranger: r, n }, { k: 'hurt', what: 'fatigue', n, why })) return
	const R = g.rangers[r]
	if (R.deck.length < n) {
		R.fatigue.push(...R.deck.splice(0))
		endDay(g, `${R.name} is too fatigued to go on${why ? ` (${why})` : ''}.`)
		return
	}
	R.fatigue.push(...R.deck.splice(0, n))
	g.fatiguedThisTest = (g.fatiguedThisTest ?? 0) + n
	log(g, `${R.name} suffers ${n} fatigue${why ? ` from ${why}` : ''}.`)
	fire(g, { e: 'fatigue', ranger: r, n })
}
export function soothe(g: Game, r: number, n: number) {
	const R = g.rangers[r]
	const k = Math.min(n, R.fatigue.length)
	if (!k) return
	R.hand.push(...R.fatigue.splice(R.fatigue.length - k, k))
	log(g, `${R.name} soothes ${k} fatigue.`)
}
export function injure(g: Game, r: number, n = 1, raw = false) {
	const R = g.rangers[r]
	for (let k = 0; k < n; k++) {
		if (!raw && offerPrevention(g, { e: 'wouldInjury', ranger: r }, { k: 'hurt', what: 'injury', n: 1, why: '' })) continue
		R.injuries++
		log(g, `${R.name} suffers an injury (${R.injuries}).`)
		// The Stouthearted Guardian: "When you would discard your fatigue stack due to an injury, discard this tale instead."
		const tale = attachments(g, R.roleUid).find((i) => /When you would discard your fatigue stack due to an injury, discard this tale instead/i.test(flat(i.id)))
		if (tale && R.fatigue.length) addJob(g, { title: nameOf(g, tale.uid), eff: { text: '', pre: [], steps: [{ k: 'either', a: [{ k: 'discard', to: { r: 'self' } }], b: [{ k: 'dropFatigue' }], la: `Discard ${nameOf(g, tale.uid)} instead of your fatigue stack`, lb: 'Discard my fatigue stack' }], auto: true }, src: tale.uid, ranger: r }, 'front')
		else R.discard.push(...R.fatigue.splice(0))
		if (R.injuries >= 3 && !g.lingering.includes(r)) {
			g.lingering.push(r)
			g.endAfterTurn = `${R.name} suffered a third injury.`
		}
	}
}
export function heal(g: Game, r: number, n = 1) {
	const R = g.rangers[r]
	const k = Math.min(n, R.injuries)
	if (!k) return
	R.injuries -= k
	log(g, `${R.name} heals ${k} injur${k > 1 ? 'ies' : 'y'}.`)
}
export function drawRanger(g: Game, r: number, n = 1): boolean {
	const R = g.rangers[r]
	for (let k = 0; k < n; k++) {
		const c = R.deck.shift()
		if (!c) {
			endDay(g, `${R.name} can't draw a card and is too tired to continue.`)
			return false
		}
		R.hand.push(c)
		if (/When you draw this card, attach it to your role/i.test(card(c).text || '')) {
			R.hand.pop()
			const uid = addInst(g, c, 'attached', r, 'ranger')
			g.inst[uid].attachedTo = R.roleUid
			g.inst[uid].deckOf = r
			log(g, `${R.name} draws ${card(c).name} and attaches it to their role.`)
		}
	}
	return true
}
function endDay(g: Game, reason: string, camp = false) {
	if (g.ended) return
	g.ended = { reason, camp }
	g.phase = 'over'
	g.jobs = []
	g.queue = [{ kind: 'dayOver', reason }]
	log(g, `The day ends: ${reason}`)
}

// ---------------------------------------------------------------- path cards

/** A deck beside the path deck by name ("Spire", "Otherworld", "detritus"); null = use the path deck. */
function sideDeck(g: Game, name: string): string[] | null {
	const k = Object.keys(g.decks ?? {}).find((x) => x.toLowerCase() === name.toLowerCase())
	return k ? g.decks![k] : null
}
function drawPathCard(g: Game, r: number, why = 'draws') {
	// "When you would draw 1 path card, if your [ranger] is on this location/feature and there are cards remaining in the Spire deck, (you may) draw 1 card from the Spire deck instead."
	const tok = g.rangers[r].token
	for (const u of [g.location, ...(tok != null ? [tok] : [])]) {
		const m = g.inst[u] ? flat(g.inst[u].id).match(/When you would draw (?:1|a) path card, if your \[ranger\] is on this \w+ and there are cards remaining in the ([\w' -]+?) deck, (?:you may )?draw (?:1|a) card from the [\w' -]+? deck instead/i) : null
		const d = m && (tok === u) ? sideDeck(g, m[1]) : null
		if (d?.length) {
			putPathInPlay(g, d.shift()!, r, `draws from the ${m![1]} deck:`)
			return
		}
	}
	if (!g.pathDeck.length) {
		if (!g.pathDiscard.length) {
			log(g, 'The path deck and discard are empty.')
			return
		}
		g.pathDeck = shuffle(g.pathDiscard.splice(0), g.rng)
		log(g, 'The path discard is shuffled into a new path deck.')
	}
	const id = g.pathDeck.shift()!
	putPathInPlay(g, id, r, why)
}
export function putPathInPlay(g: Game, id: string, r: number, why = 'draws', area?: 'reach' | 'along'): number {
	const c = card(id)
	const zone = area ?? c.area ?? 'along'
	const uid = addInst(g, id, zone === 'reach' ? 'reach' : 'along', zone === 'reach' ? r : null, 'path')
	log(g, `${rangerName(g, r)} ${why} ${c.name} (${zone === 'reach' ? 'within reach' : 'along the way'}).`)
	const p = parsedOf(id)
	if (p.guide) g.queue.push({ kind: 'guide', entry: p.guide, why: `${c.name} entered play`, pack: c.pack })
	if (zone === 'reach' && p.keywords.includes('Ambush')) sufferFatigue(g, r, presence(g, uid), `${c.name} (ambush)`)
	if (p.enters) addJob(g, { title: `${c.name} enters play`, eff: p.enters, src: uid, ranger: r }, 'end')
	fire(g, { e: 'enters', ranger: r, uid, words: [] })
	return uid
}

// ---------------------------------------------------------------- interacting

/** Cards between Ranger r and the card they interact with (rulebook: Fatigue from Interacting). */
export function between(g: Game, r: number, target: number | null): number[] {
	if (target == null || !g.inst[target]) return []
	const t = g.inst[target]
	const tz = t.attachedTo != null ? (g.inst[t.attachedTo] ?? t) : t
	const mine = zoneCards(g, 'reach', r).map((i) => i.uid)
	const roleAttached = attachments(g, g.rangers[r].roleUid).map((i) => i.uid)
	let out: number[] = []
	if (tz.zone === 'reach' && tz.owner === r) out = []
	else if (tz.zone === 'reach') out = mine
	else if (tz.zone === 'along') out = mine
	else if (tz.zone === 'surroundings') out = [...mine, ...zoneCards(g, 'along').map((i) => i.uid)]
	if (tz.zone !== 'player') out = [...out, ...roleAttached.filter((u) => u !== target)]
	return out.filter((u) => u !== target && u !== tz.uid && !g.inst[u].exhausted && !g.inst[u].faceDown && !(g.dodge ?? []).includes(u))
}
export function blockedBy(g: Game, r: number, target: number | null): number | null {
	for (const u of between(g, r, target)) if (has(g, u, 'Obstacle')) return u
	return null
}
function interactFatigue(g: Game, r: number, target: number | null): number {
	let total = 0
	for (const u of between(g, r, target)) {
		if (has(g, u, 'Friendly')) continue
		const n = presence(g, u)
		if (n > 0) {
			sufferFatigue(g, r, n, nameOf(g, u))
			total += n
		}
	}
	return total
}

/** Active cards for challenge effects, in resolution order. */
export function activeCards(g: Game, r: number, target: number | null): number[] {
	const list: Inst[] = []
	list.push(...g.weather.map((u) => g.inst[u]).filter(Boolean))
	if (g.inst[g.location]) list.push(g.inst[g.location])
	list.push(...g.missions.map((u) => g.inst[u]).filter(Boolean))
	list.push(...zoneCards(g, 'along'))
	list.push(...zoneCards(g, 'reach', r))
	const t = target != null ? g.inst[target] : null
	if (t && t.zone === 'reach' && t.owner != null && t.owner !== r) list.push(...zoneCards(g, 'reach', t.owner))
	list.push(...attachments(g, g.rangers[r].roleUid))
	list.push(...zoneCards(g, 'player', r))
	const withAtt: Inst[] = []
	for (const i of list) {
		withAtt.push(i)
		for (const a of attachments(g, i.uid)) if (!a.faceDown && a.kind !== 'ranger' && !withAtt.includes(a)) withAtt.push(a)
	}
	return [...new Set(withAtt.filter((i) => !i.faceDown && (!i.exhausted || i.kind === 'weather' || i.kind === 'mission' || i.kind === 'location')).map((i) => i.uid))]
}

// ---------------------------------------------------------------- matching cards

function wordMatch(g: Game, uid: number, w: string): boolean {
	const i = g.inst[uid]
	const c = card(i.id)
	const tr = traitsOf(g, uid)
	const ty = typeOf(g, uid).toLowerCase()
	const nm = nameOf(g, uid).toLowerCase()
	if (w === 'card') return true
	if (w === 'path card') return c.back === 'path'
	if (nm.includes(w)) return true
	const parts = w
		.split(' ')
		.map((x) => x.replace(/s$/, ''))
		.filter((x) => x !== 'card')
	return parts.every((p) => tr.some((t) => t === p || t.replace(/s$/, '') === p) || ty === p || (p === 'path' && c.back === 'path'))
}
export function matches(g: Game, uid: number, f: Filter, job: Pick<Job, 'src' | 'ranger' | 'target' | 'that'> | null, scope?: number[]): boolean {
	const i = g.inst[uid]
	if (!i || i.faceDown) return false
	if (i.kind === 'role' || i.kind === 'weather' || i.kind === 'mission') return false
	if (i.kind === 'location' && !(f.words ?? []).some((w) => /location/.test(w))) return false
	if (f.notSelf && job && uid === job.src) return false
	if (f.notThat && job?.that?.includes(uid)) return false
	if (f.words?.length && !f.words.some((w) => wordMatch(g, uid, w))) return false
	if (f.exhausted && !i.exhausted) return false
	if ((f.ready || f.active) && i.exhausted) return false
	if (f.active && scope && !scope.includes(uid)) return false
	if (f.zone === 'reach' && i.zone !== 'reach') return false
	if (f.zone === 'along' && i.zone !== 'along') return false
	if (f.harm && i.harm < f.harm) return false
	if (f.path && i.kind !== 'path') return false
	if (f.attachedToSelf && (job?.src == null || i.attachedTo !== job.src)) return false
	return true
}
function candidates(g: Game, f: Filter, job: Job): number[] {
	const scope = f.active ? activeCards(g, job.ranger, job.target) : undefined
	return inPlay(g)
		.map((i) => i.uid)
		.filter((u) => matches(g, u, f, job, scope))
}

// ---------------------------------------------------------------- running effects

export type NewJob = Pick<Job, 'title' | 'eff' | 'src' | 'ranger'> & Partial<Pick<Job, 'effort' | 'target' | 'that' | 'sys' | 'challenge'>>
export function addJob(g: Game, j: NewJob, where: 'front' | 'end' = 'end') {
	const job: Job = { effort: 0, target: null, that: null, stage: 'cond', i: 0, picks: {}, ...j }
	if (where === 'front') g.jobs.unshift(job)
	else g.jobs.push(job)
}
const SYS = (sys: Job['sys'], ranger: number, extra: Partial<Job> = {}): NewJob => ({ title: sys!, eff: { text: '', pre: [], steps: [], auto: true }, src: null, ranger, sys, ...extra })

function amount(g: Game, a: Amount, job: Job, to?: number): number {
	if ('tale' in a) {
		const k = to ?? job.ranger
		return a.n + (attachments(g, g.rangers[k].roleUid).some((i) => /\bTale\b/.test(card(i.id).traits ?? '')) ? a.tale : 0)
	}
	if ('n' in a) return a.n
	if ('effort' in a) return Math.floor(Math.max(0, job.effort) / (a.per ?? 1)) * (a.mult ?? 1)
	if ('presence' in a) {
		const u = a.presence === 'self' ? job.src : job.that?.[0]
		return u != null ? presence(g, u) : 0
	}
	if ('aspect' in a) return g.rangers[job.ranger].aspects[a.aspect]
	if ('tokens' in a) return job.src != null ? (g.inst[job.src]?.tokens ?? 0) : 0
	if ('all' in a) return to != null && g.inst[to] ? 999 : 0
	if ('same' in a) return job.lastAmt ?? 0
	if ('count' in a) return candidates(g, a.count, job).length * a.mult
	if ('spirits' in a) return inPlay(g).filter((i) => isSpirit(g, i.uid) && (a.spirits === 'along' ? i.zone === 'along' : i.zone === 'reach' && i.owner === (to ?? job.ranger))).length + a.plus
	return 0
}

function choose(g: Game, job: Job, key: string, options: number[], n: number, text: string): number[] | null {
	if (job.picks[key]) return job.picks[key]
	g.queue.unshift({ kind: 'choose', title: job.title, text, options, min: Math.min(n, options.length), max: Math.min(n, options.length), key, ranger: job.ranger })
	return null
}
/** Cards a reference points at. Returns null when the player must choose (prompt queued). */
function refs(g: Game, ref: Ref, job: Job, key: string, title: string): number[] | null {
	switch (ref.r) {
		case 'self':
			return job.src != null && g.inst[job.src] ? [job.src] : []
		case 'that':
			return (job.that ?? (job.target != null ? [job.target] : [])).filter((u) => g.inst[u])
		case 'location':
			return [g.location]
		case 'weather':
			return g.weather.slice()
		case 'role':
			return [g.rangers[job.ranger].roleUid]
		case 'target':
			return job.target != null && g.inst[job.target] ? [job.target] : []
		case 'each':
			return candidates(g, ref.f, job)
		case 'named': {
			const nm = ref.name.toLowerCase()
			if (job.src != null && g.inst[job.src] && nameOf(g, job.src).toLowerCase().includes(nm)) return [job.src]
			return inPlay(g)
				.filter((i) => nameOf(g, i.uid).toLowerCase().includes(nm))
				.map((i) => i.uid)
				.slice(0, 1)
		}
		case 'lastProgress':
			return g.progressTo != null && g.inst[g.progressTo] ? [g.progressTo] : []
		case 'host': {
			const h = job.src != null ? g.inst[job.src]?.attachedTo : null
			return h != null && g.inst[h] ? [h] : []
		}
		case 'otherRanger': {
			const others = g.rangers.map((R, k) => (k !== job.ranger ? R.roleUid : -1)).filter((u) => u >= 0)
			if (others.length <= 1) return others
			return choose(g, job, key, others, 1, `${title}: which Ranger?`)
		}
		case 'highest':
		case 'lowest': {
			const c = candidates(g, ref.f, job)
			if (!c.length) return []
			const ps = c.map((u) => presence(g, u))
			const best = ref.r === 'highest' ? Math.max(...ps) : Math.min(...ps)
			const tied = c.filter((u) => presence(g, u) === best)
			if (tied.length === 1) return tied
			return choose(g, job, key, tied, 1, `${title} (tied for ${ref.r} presence)`)
		}
		case 'choose': {
			const c = candidates(g, ref.f, job)
			const got = c.length <= 1 ? c : choose(g, job, key, c, ref.n ?? 1, title)
			if (got) job.that = got
			return got
		}
	}
}

function evalCond(g: Game, c: Cond, job: Job): boolean | null {
	switch (c.c) {
		case 'exists': {
			const found = candidates(g, c.f, job)
			if (c.negate) return found.length === 0
			const ok = found.length >= (c.atLeast ?? 1)
			if (ok && c.bind) {
				if (found.length === 1 || c.atLeast) job.that = found
				else {
					const p = choose(g, job, 'cond', found, 1, `${job.title}: which ${c.f.words?.join(' or ') ?? 'card'}?`)
					if (!p) return null
					job.that = p
				}
			}
			return ok
		}
		case 'selfZone': {
			const i = job.src != null ? g.inst[job.src] : null
			const z = i ? (i.attachedTo != null ? g.inst[i.attachedTo]?.zone : i.zone) : null
			const ok = z === c.zone
			return c.negate ? !ok : ok
		}
		case 'selfTok': {
			const i = job.src != null ? g.inst[job.src] : null
			const v = i ? i[c.what] : 0
			if (c.odd) return v % 2 === 1
			return (c.min == null || v >= c.min) && (c.max == null || v <= c.max)
		}
		case 'youFatigue':
			return g.rangers[job.ranger].fatigue.length >= c.min
		case 'injured':
			return g.rangers.some((r) => r.injuries > 0)
		case 'tokenOnSelf': {
			const on = g.rangers.some((r) => r.token === job.src)
			return c.negate ? !on : on
		}
		case 'selfAttached': {
			const on = job.src != null && g.inst[job.src]?.attachedTo != null
			return c.negate ? !on : on
		}
		case 'and':
			for (const x of c.all) {
				const v = evalCond(g, x, job)
				if (v !== true) return v
			}
			return true
		case 'or':
			for (const x of c.any) {
				const v = evalCond(g, x, job)
				if (v === null) return null
				if (v) return true
			}
			return false
		case 'ask': {
			if (job.asked != null) return job.asked
			g.queue.unshift({ kind: 'ask', title: job.title, text: c.text, ranger: job.ranger })
			return null
		}
		case 'locTok': {
			const v = g.inst[g.location]?.tokens ?? 0
			return (c.min == null || v >= c.min) && (c.max == null || v <= c.max)
		}
		case 'addedProgress':
			return g.progressTo != null
		case 'fatiguedTest':
			return (g.fatiguedThisTest ?? 0) > 0
		case 'location':
			return nameOf(g, g.location).toLowerCase() === c.name.toLowerCase()
		case 'targetIs':
			return job.target != null && matches(g, job.target, c.f, job)
		case 'tokenOn': {
			const t = g.rangers[job.ranger].token
			return t != null && matches(g, t, c.f, job)
		}
		case 'thatZone': {
			const u = job.that?.[0] ?? job.target
			return u != null && g.inst[u]?.zone === c.zone
		}
		case 'turns':
			return (g.phase === 'turns') !== !!c.negate
		case 'spiritspeaking':
			return !!g.rangers[job.ranger].spiritspeak !== !!c.negate
		case 'failedTest':
			return g.lastTest?.success === false
		case 'not': {
			const v = evalCond(g, c.x, job)
			return v === null ? null : !v
		}
	}
}

function whoseReach(g: Game, job: Job): number[] {
	const i = job.src != null ? g.inst[job.src] : null
	if (i?.zone === 'reach' && i.owner != null) return [i.owner]
	return [job.ranger]
}
/** Match a card that isn't in play (for searches). */
function fakeMatch(id: string, f: Filter): boolean {
	const c = card(id)
	if (!f.words?.length) return true
	const tr = (c.traits ?? '').toLowerCase().split('/').map((t) => t.trim())
	const nm = c.name.toLowerCase()
	return f.words.some((w) => w === 'card' || nm.includes(w) || w.split(' ').every((p) => tr.some((t) => t.replace(/s$/, '') === p) || c.type.toLowerCase() === p))
}

/** Runs one step. 'wait' = a prompt was queued; 'stop' = the rest must not happen. */
function runStep(g: Game, s: Step & { when?: Cond }, job: Job, key: string): 'ok' | 'wait' | 'stop' | 'pause' {
	if (s.when) {
		const v = evalCond(g, s.when, job)
		if (v === null) return 'wait'
		if (!v) return 'ok'
	}
	const r = job.ranger
	const title = job.title
	const each = (ref: Ref, f: (u: number) => void, what: string): 'ok' | 'wait' | 'stop' => {
		const us = refs(g, ref, job, key, `${title}: choose ${what}`)
		if (us === null) return 'wait'
		if (!us.length) return ref.r === 'self' || ref.r === 'that' ? 'stop' : 'ok'
		for (const u of us) if (g.inst[u]) f(u)
		return 'ok'
	}
	switch (s.k) {
		case 'addTok':
			return each(
				s.to,
				(u) => {
					const n = amount(g, s.amt, job, u)
					job.lastAmt = n
					addTokens(g, u, s.what, n)
				},
				s.what === 'tokens' ? 'a card' : `a card to add ${s.what} to`,
			)
		case 'remTok':
			return each(
				s.to,
				(u) => {
					const i = g.inst[u]
					const want = amount(g, s.amt, job, u)
					if (i[s.what] < want && 'n' in s.amt) job.failed = true
					const n = Math.min(i[s.what], want)
					i[s.what] -= n
					if (n) log(g, `${n} ${s.what === 'tokens' ? (card(i.id).tokens?.name ?? 'token').toLowerCase() : s.what} removed from ${nameOf(g, u)}.`)
				},
				'a card',
			)
		case 'exhaust':
		case 'ready':
			return each(
				s.to,
				(u) => {
					if (s.k === 'exhaust' && g.inst[u].exhausted && job.stage === 'pre') job.failed = true
					g.inst[u].exhausted = s.k === 'exhaust'
					log(g, `${nameOf(g, u)} is ${s.k === 'exhaust' ? 'exhausted' : 'readied'}.`)
					if (s.k === 'ready') endSpiritspeak(g, u)
				},
				`a card to ${s.k}`,
			)
		case 'discard':
			return each(s.to, (u) => discardCard(g, u), 'a card to discard')
		case 'flip':
			return each(s.to, (u) => flip(g, u), 'a card to flip')
		case 'shuffleIn':
			return each(
				s.to,
				(u) => {
					if (g.inst[u].kind !== 'path') return
					log(g, `${nameOf(g, u)} is shuffled into the path deck.`)
					removeInst(g, u, 'shuffle')
				},
				'a card',
			)
		case 'topOfPath':
			return each(
				s.to,
				(u) => {
					log(g, `${nameOf(g, u)} goes on top of the path deck.`)
					removeInst(g, u, 'pathTop')
				},
				'a card',
			)
		case 'faceDown':
			return each(s.to, (u) => (g.inst[u].faceDown = true), 'a card')
		case 'move':
			return each(
				s.to,
				(u) => {
					const i = g.inst[u]
					let area = s.area
					if (area === 'sameAsThat') {
						const t = job.that?.[0] != null ? g.inst[job.that[0]] : null
						if (t) {
							i.zone = t.zone
							i.owner = t.owner
							i.attachedTo = null
							log(g, `${nameOf(g, u)} moves next to ${nameOf(g, t.uid)}.`)
						}
						return
					}
					if (s.ranger === 'other') {
						const others = g.rangers.map((_, k) => k).filter((k) => k !== (i.owner ?? r))
						if (!others.length) return
						const pick = job.picks[key + 'r']?.[0]
						const R = pick != null ? g.rangers.findIndex((x) => x.roleUid === pick) : others[0]
						moveCard(g, u, 'reach', R >= 0 ? R : others[0])
						return
					}
					if (!area || area === 'other') area = i.zone === 'reach' ? 'along' : 'reach'
					moveCard(g, u, area, i.zone === 'reach' && area === 'reach' ? (i.owner ?? r) : r, s.noAmbush)
				},
				'a card to move',
			)
		case 'fatigue':
		case 'injury':
		case 'soothe':
		case 'heal':
		case 'drawRanger': {
			let who: number[] = s.who === 'each' ? g.rangers.map((_, k) => k) : s.who === 'that' ? whoseReach(g, job) : [r]
			if (s.who === 'onSelf') who = g.rangers.map((R, k) => (R.token != null && R.token === job.src ? k : -1)).filter((k) => k >= 0)
			if (s.who === 'choose' && g.rangers.length > 1) {
				const p = choose(g, job, key, g.rangers.map((R) => R.roleUid), 1, `${title}: which Ranger?`)
				if (!p) return 'wait'
				who = [g.rangers.findIndex((R) => R.roleUid === p[0])]
			}
			for (const k of who) {
				const n = amount(g, s.amt, job, 'spirits' in s.amt || 'tale' in s.amt ? k : undefined)
				if (s.k === 'fatigue') sufferFatigue(g, k, n, job.title)
				else if (s.k === 'injury') injure(g, k, n)
				else if (s.k === 'soothe') soothe(g, k, n)
				else if (s.k === 'heal') heal(g, k, n)
				else drawRanger(g, k, n)
			}
			return 'ok'
		}
		case 'drawPath':
			for (let k = 0; k < amount(g, s.amt, job); k++) drawPathCard(g, r)
			return 'ok'
		case 'scoutPath': {
			const n = amount(g, s.amt, job)
			if (n > 0 && g.pathDeck.length) {
				g.queue.unshift({ kind: 'scout', ranger: r, deck: 'path', cards: g.pathDeck.slice(0, n) })
				return 'pause'
			}
			return 'ok'
		}
		case 'scoutRanger': {
			const n = amount(g, s.amt, job)
			if (n > 0 && g.rangers[r].deck.length) {
				g.queue.unshift({ kind: 'scout', ranger: r, deck: 'ranger', cards: g.rangers[r].deck.slice(0, n) })
				return 'pause'
			}
			return 'ok'
		}
		case 'scoutChallenge': {
			const n = amount(g, s.amt, job)
			if (!g.challenge.length) g.challenge = shuffle(g.challengeDiscard.splice(0), g.rng)
			const top = g.challenge.slice(0, n).map((c) => CHALLENGE[c].symbol)
			log(g, `${rangerName(g, r)} looks at the top challenge card${n > 1 ? 's' : ''}: ${top.join(', ')}.`)
			return 'ok'
		}
		case 'fatiguesYou':
			return each(
				s.from,
				(u) => {
					if (!g.inst[u].exhausted) sufferFatigue(g, r, presence(g, u), nameOf(g, u))
				},
				'a card',
			)
		case 'rangerToken': {
			if (s.to.r === 'roleToken') {
				g.rangers[r].token = null
				log(g, `${rangerName(g, r)}'s Ranger token returns to their role.`)
				return 'ok'
			}
			return each(
				s.to,
				(u) => {
					for (const k of s.each ? g.rangers.map((_, k) => k) : [r]) {
						g.rangers[k].token = u
						log(g, `${rangerName(g, k)} moves their Ranger token to ${nameOf(g, u)}.`)
					}
				},
				'a card for your Ranger token',
			)
		}
		case 'guide':
			g.queue.unshift({ kind: 'guide', entry: s.entry, why: job.src != null && g.inst[job.src] ? nameOf(g, job.src) : job.title, pack: job.src != null && g.inst[job.src] ? card(g.inst[job.src].id).pack : undefined })
			return 'pause'
		case 'searchPath': {
			const pools: string[][] = [g.pathDeck, ...(s.alsoDiscard ? [g.pathDiscard] : [])]
			for (const pool of pools) {
				const k = pool.findIndex((id) => fakeMatch(id, s.f))
				if (k < 0) continue
				const [id] = pool.splice(k, 1)
				g.pathDeck = shuffle(g.pathDeck, g.rng)
				if (s.then === 'discard') {
					g.pathDiscard.push(id)
					log(g, `${card(id).name} is found in the path deck and discarded.`)
				} else putPathInPlay(g, id, r, 'finds')
				return 'ok'
			}
			log(g, `No ${s.f.words?.join(' or ') ?? 'card'} to find.`)
			return 'ok'
		}
		case 'searchSet': {
			const set = s.set.replace(/^the /i, '')
			const pool = setAll(g, set)
			const inUse = new Set([...g.pathDeck, ...g.pathDiscard, ...Object.values(g.inst).map((i) => i.id)])
			for (let k = 0; k < (s.n ?? 1); k++) {
				const id = pool.find((x) => fakeMatch(x, s.f) && !inUse.has(x)) ?? pool.find((x) => fakeMatch(x, s.f))
				if (!id) {
					log(g, `No ${s.f.words?.join(' or ')} in the ${s.set} set.`)
					break
				}
				inUse.add(id)
				if (s.then === 'shuffle') {
					g.pathDeck = shuffle([...g.pathDeck, id], g.rng)
					log(g, `${card(id).name} is shuffled into the path deck.`)
				} else putPathInPlay(g, id, r, 'finds')
			}
			return 'ok'
		}
		case 'attach': {
			const what = refs(g, s.what, job, key + 'w', `${title}: choose a card to attach`)
			if (what === null) return 'wait'
			const to = refs(g, s.to, job, key + 't', `${title}: attach to which card?`)
			if (to === null) return 'wait'
			if (!what.length || !to.length) return 'ok'
			for (const u of what) {
				const i = g.inst[u]
				i.attachedTo = to[0]
				i.zone = 'attached'
				if (s.faceDown) {
					i.faceDown = true
					i.progress = 0
					i.harm = 0
				}
				log(g, `${nameOf(g, u)} is attached ${s.faceDown ? 'facedown ' : ''}to ${nameOf(g, to[0])}.`)
			}
			return 'ok'
		}
		case 'exhaustRole': {
			const who = s.who === 'each' ? g.rangers.map((_, k) => k) : [r]
			for (const k of who) {
				if (g.inst[g.rangers[k].roleUid].exhausted) continue
				g.inst[g.rangers[k].roleUid].exhausted = true
				log(g, `${rangerName(g, k)}'s role is exhausted.`)
				fire(g, { e: 'exhaustRole', ranger: k })
			}
			return 'ok'
		}
		case 'exhaustGear': {
			const gear = zoneCards(g, 'player', r).filter((i) => i.kind === 'ranger' && !i.exhausted)
			if (gear.length <= s.n) {
				for (const i of gear) i.exhausted = true
				if (gear.length) log(g, `${gear.map((i) => nameOf(g, i.uid)).join(', ')} exhausted.`)
				return 'ok'
			}
			const p = choose(g, job, key, gear.map((i) => i.uid), s.n, `${title}: exhaust ${s.n} of your gear`)
			if (!p) return 'wait'
			for (const u of p) g.inst[u].exhausted = true
			return 'ok'
		}
		case 'discardGear': {
			const gear = zoneCards(g, 'player', r).filter((i) => i.kind === 'ranger')
			if (!gear.length) return 'ok'
			const p = gear.length === 1 ? [gear[0].uid] : choose(g, job, key, gear.map((i) => i.uid), 1, `${title}: discard one of your gear`)
			if (!p) return 'wait'
			discardCard(g, p[0])
			return 'ok'
		}
		case 'discardEnergy': {
			const R = g.rangers[r]
			const a = s.aspect ?? (ASPECTS.slice().sort((x, y) => R.energy[y] - R.energy[x])[0] as Aspect)
			const n = Math.min(R.energy[a], s.n)
			R.energy[a] -= n
			if (n) log(g, `${R.name} discards ${n} ${a} energy.`)
			else if (s.aspect) job.failed = true
			return 'ok'
		}
		case 'flipIf': {
			const i = job.src != null ? g.inst[job.src] : null
			if (i && (s.min == null || i.tokens >= s.min) && (s.max == null || i.tokens <= s.max)) flip(g, i.uid)
			return 'ok'
		}
		case 'endDay':
			endDay(g, s.reason)
			return 'stop'
		case 'byChallenge': {
			if (!job.picks[key]) {
				const c = drawChallenge(g)
				const sym = CHALLENGE[c].symbol
				log(g, `Challenge card drawn: ${SYM_LABEL[sym]} ${sym}.`)
				job.picks[key] = [c]
				const steps = s[sym]
				// run the branch as its own effect right after this one
				g.jobs.splice(1, 0, { ...job, title: `${job.title} (${sym})`, eff: { text: '', pre: [], steps, auto: true }, stage: 'pre', i: 0, picks: {} })
			}
			return 'ok'
		}
		case 'either': {
			const ans = job.picks[key]
			if (!ans) {
				job.asked = undefined
				g.queue.unshift({ kind: 'ask', title: job.title, text: 'Choose one:', ranger: r, yes: s.la, no: s.lb })
				job.picks[key] = [-1]
				return 'wait'
			}
			const steps = job.asked === false ? s.b : s.a
			job.asked = undefined
			g.jobs.splice(1, 0, { ...job, title: job.title, eff: { text: '', pre: [], steps, auto: true }, stage: 'pre', i: 0, picks: {} })
			return 'ok'
		}
		case 'energy': {
			const R = g.rangers[r]
			let a = s.aspect
			if (!a) {
				const opts = ASPECTS.filter((x) => s.gain || R.energy[x] > 0)
				if (!opts.length) {
					job.failed = true
					return 'stop'
				}
				const pick = job.picks[key]
				if (!pick) {
					g.queue.unshift({ kind: 'aspect', title: job.title, text: s.gain ? `Gain ${s.n} energy of which type?` : `Spend ${s.n} energy of which type?`, ranger: r, options: opts, key })
					return 'wait'
				}
				a = ASPECTS[pick[0]]
			}
			if (s.gain) {
				R.energy[a] += s.n
				log(g, `${R.name} gains ${s.n} ${a}.`)
			} else {
				if (R.energy[a] < s.n) {
					job.failed = true
					return 'stop'
				}
				R.energy[a] -= s.n
				log(g, `${R.name} spends ${s.n} ${a}.`)
			}
			return 'ok'
		}
		case 'fromDiscard': {
			const R = g.rangers[r]
			const k = R.discard.lastIndexOf(s.id)
			if (k >= 0) {
				R.discard.splice(k, 1)
				R.hand.push(s.id)
				log(g, `${card(s.id).name} returns to ${R.name}'s hand.`)
			}
			return 'ok'
		}
		case 'moveTok': {
			const from = refs(g, s.from, job, key + 'f', `${title}: move ${s.what} from which card?`)
			if (from === null) return 'wait'
			const to = refs(g, s.to, job, key + 't', `${title}: move it to which card?`)
			if (to === null) return 'wait'
			if (!from.length || !to.length) return 'ok'
			const n = Math.min(g.inst[from[0]][s.what], s.n ?? 999)
			g.inst[from[0]][s.what] -= n
			g.inst[to[0]][s.what] += n
			log(g, `${n} ${s.what} moved from ${nameOf(g, from[0])} to ${nameOf(g, to[0])}.`)
			return 'ok'
		}
		case 'extraPath':
			g.extraPath = (g.extraPath ?? 0) + s.n
			return 'ok'
		case 'endRound':
			for (const R of g.rangers) R.rested = true
			return 'ok'
		case 'spiritspeak': {
			const R = g.rangers[r]
			const role = g.inst[R.roleUid]
			if (!role.exhausted) {
				role.exhausted = true
				fire(g, { e: 'exhaustRole', ranger: r })
			}
			if (!R.spiritspeak) log(g, `${R.name} is spiritspeaking: the Spirit Speaker tests replace the common tests until their role readies.`)
			R.spiritspeak = true
			return 'ok'
		}
		case 'spiritTest':
			g.rangers[r].spiritOnce = true
			log(g, `${rangerName(g, r)} may perform one Spirit Speaker test.`)
			return 'ok'
		case 'searchDeck': {
			const R = g.rangers[r]
			const k = R.deck.findIndex((id) => fakeMatch(id, s.f))
			if (k < 0) {
				log(g, `${R.name} finds no ${s.f.words?.join(' or ') ?? 'card'} in their deck.`)
				job.failed = true
				return 'ok'
			}
			const [id] = R.deck.splice(k, 1)
			R.hand.push(id)
			R.deck = shuffle(R.deck, g.rng)
			log(g, `${R.name} searches their deck for ${card(id).name} and adds it to their hand.`)
			return 'ok'
		}
		case 'payCard': {
			const i = g.inst[s.uid]
			if (!i || (s.exhaust && i.exhausted) || i.tokens < s.use) return 'stop'
			if (s.exhaust) i.exhausted = true
			if (s.use) {
				i.tokens -= s.use
				usedToken(g, s.uid, r)
			}
			log(g, `${rangerName(g, r)} uses ${nameOf(g, s.uid)}.`)
			return 'ok'
		}
		case 'payMoment': {
			const R = g.rangers[s.ranger ?? r]
			const k = R.hand.indexOf(s.id)
			const c = card(s.id)
			const cost = typeof c.cost === 'number' ? c.cost : 0
			const a = c.aspect ?? 'AWA'
			if (k < 0 || R.energy[a] < cost) return 'stop'
			R.energy[a] -= cost
			R.hand.splice(k, 1)
			R.discard.push(s.id)
			log(g, `${R.name} plays ${c.name}${cost ? ` (${cost} ${a})` : ''}.`)
			return 'ok'
		}
		case 'hurt':
			if (s.what === 'fatigue') sufferFatigue(g, r, s.n, s.why, true)
			else injure(g, r, s.n, true)
			return 'ok'
		case 'note':
			log(g, s.text)
			return 'ok'
		case 'record': {
			g.records = g.records ?? []
			const rec = g.records.find((x) => x.ranger === r && x.what === s.what)
			if (rec) rec.n += s.n
			else g.records.push({ ranger: r, what: s.what, n: s.n })
			log(g, `${rangerName(g, r)} records ${s.n} ${s.what}${s.n > 1 ? 's' : ''}.`)
			return 'ok'
		}
		case 'discardTo': {
			const R = g.rangers[r]
			const opts = R.discard.map((id, k) => (fakeMatch(id, s.f) ? k : -1)).filter((k) => k >= 0)
			if (!opts.length) {
				log(g, `${R.name} has no ${s.f.words?.join(' or ') ?? 'card'} in their discard.`)
				return 'ok'
			}
			let k = opts[opts.length - 1]
			if (s.pick && opts.length > 1) {
				const p = job.picks[key]
				if (!p) {
					g.queue.unshift({ kind: 'pickHand', title: job.title, text: `Choose a ${s.f.words?.join(' or ') ?? 'card'} in your discard.`, ranger: r, key, from: 'discard', options: opts, optional: false })
					return 'wait'
				}
				k = p[0]
			}
			const [id] = R.discard.splice(k, 1)
			const toHand = s.to === 'hand' || (/total effort was 3 or more, add it to your hand/i.test(job.eff.text) && job.effort >= 3)
			if (toHand) R.hand.push(id)
			else R.fatigue.push(id)
			log(g, `${card(id).name} goes from ${R.name}'s discard ${toHand ? 'to their hand' : 'on top of their fatigue stack'}.`)
			return 'ok'
		}
		case 'handToFatigue': {
			const R = g.rangers[r]
			const opts = R.hand.map((_, k) => k)
			if (!opts.length) return 'ok'
			const p = job.picks[key]
			if (!p) {
				const what = s.to === 'discard' ? 'Discard a card from your hand.' : 'Place a card from your hand on top of your fatigue stack.'
				g.queue.unshift({ kind: 'pickHand', title: job.title, text: s.back ? `Place a card from your hand on top of your fatigue stack to get ${card(s.back).name} back?` : what, ranger: r, key, from: 'hand', options: opts, optional: !!s.back })
				return 'wait'
			}
			if (p[0] < 0) {
				job.failed = true
				return 'stop'
			}
			const [id] = R.hand.splice(p[0], 1)
			if (s.to === 'discard') {
				R.discard.push(id)
				log(g, `${R.name} discards ${card(id).name}.`)
			} else {
				R.fatigue.push(id)
				log(g, `${R.name} places ${card(id).name} on top of their fatigue stack.`)
			}
			if (s.back) {
				const k = R.discard.lastIndexOf(s.back)
				if (k >= 0) {
					R.discard.splice(k, 1)
					R.hand.push(s.back)
					log(g, `${card(s.back).name} returns to ${R.name}'s hand.`)
				}
			}
			return 'ok'
		}
		case 'drawSide': {
			const n = amount(g, s.amt, job)
			for (let k = 0; k < n; k++) {
				const d = sideDeck(g, s.deck)
				if (d === null) drawPathCard(g, r)
				else if (d.length) putPathInPlay(g, d.shift()!, r, `draws from the ${s.deck} deck:`)
				else log(g, `The ${s.deck} deck is empty.`)
			}
			return 'ok'
		}
		case 'scoutSide': {
			const n = amount(g, s.amt, job)
			const d = sideDeck(g, s.deck) ?? g.pathDeck
			if (n > 0 && d.length) {
				g.queue.unshift({ kind: 'scout', ranger: r, deck: sideDeck(g, s.deck) ? `side:${s.deck}` : 'path', cards: d.slice(0, n) })
				return 'pause'
			}
			return 'ok'
		}
		case 'sideToPath': {
			const d = sideDeck(g, s.deck)
			if (d?.length) {
				const id = d.shift()!
				g.pathDeck.unshift(id)
				log(g, `The top card of the ${s.deck} deck goes on top of the path deck.`)
			}
			return 'ok'
		}
		case 'shuffleSide':
			return each(
				s.to,
				(u) => {
					const d = sideDeck(g, s.deck)
					const id = g.inst[u].id
					if (d === null || g.inst[u].kind !== 'path') return
					delete g.inst[u]
					g.decks![Object.keys(g.decks!).find((x) => x.toLowerCase() === s.deck.toLowerCase())!] = shuffle([...d, id], g.rng)
					log(g, `${card(id).name} is shuffled into the ${s.deck} deck.`)
				},
				'a card',
			)
		case 'effect':
			g.jobs.splice(1, 0, { ...job, eff: s.eff, stage: 'cond', i: 0, picks: {} })
			return 'ok'
		case 'dropFatigue': {
			const R = g.rangers[r]
			R.discard.push(...R.fatigue.splice(0))
			log(g, `${R.name} discards their fatigue stack.`)
			return 'ok'
		}
		case 'fatigueToDeck': {
			const R = g.rangers[r]
			const n = Math.min(s.n, R.fatigue.length)
			if (!n) return 'ok'
			R.deck = shuffle([...R.deck, ...R.fatigue.splice(R.fatigue.length - n, n)], g.rng)
			log(g, `${R.name} shuffles ${n} card${n > 1 ? 's' : ''} from their fatigue stack into their deck.`)
			return 'ok'
		}
		case 'playFound': {
			// play the card a search just added to your hand (Call Upon the Spirits)
			const R = g.rangers[r]
			// the found card is the last one added to the hand (handToFatigue may have taken another since)
			const at = R.hand.length - 1
			const id = R.hand[at]
			if (!id) return 'ok'
			const c = card(id)
			const cost = Math.max(0, (typeof c.cost === 'number' ? c.cost : 0) - s.discount)
			const a = c.aspect ?? 'AWA'
			if (R.energy[a] < cost) {
				log(g, `${R.name} can't afford to play ${c.name} now.`)
				return 'ok'
			}
			R.energy[a] -= cost
			R.hand.pop()
			const uid = addInst(g, id, c.type === 'Gear' ? 'player' : 'reach', r, 'ranger')
			g.inst[uid].deckOf = r
			log(g, `${R.name} plays ${c.name}${cost ? ` (${cost} ${a})` : ''}.`)
			return 'ok'
		}
		case 'manual':
			if (!s.text.trim()) return 'ok'
			g.queue.unshift({ kind: 'manual', title: job.title, text: s.text, ranger: r })
			return 'pause'
	}
}

/** Carries out queued effects until one needs the player. */
function runJobs(g: Game) {
	let guard = 0
	while (g.jobs.length && !g.queue.length && !g.ended && guard++ < 500) {
		const job = g.jobs[0]
		if (job.sys) {
			g.jobs.shift()
			sysJob(g, job)
			checkClears(g)
			continue
		}
		if (job.stage === 'cond') {
			if (job.eff.cond) {
				const v = evalCond(g, job.eff.cond, job)
				if (v === null) return
				if (!v) {
					g.jobs.shift()
					continue
				}
			}
			job.stage = 'pre'
			job.i = 0
		}
		const list = job.stage === 'pre' ? job.eff.pre : job.eff.steps
		if (job.i >= list.length) {
			if (job.stage === 'pre') {
				if (job.failed) {
					log(g, `${job.title}: that couldn't be done, so nothing more happens.`)
					g.jobs.shift()
					continue
				}
				job.stage = 'steps'
				job.i = 0
				continue
			}
			g.jobs.shift()
			checkClears(g)
			continue
		}
		const key = `${job.stage}:${job.i}`
		const res = runStep(g, list[job.i], job, key)
		if (res === 'wait') return
		if (res === 'pause') {
			job.i++
			return
		}
		if (res === 'stop' && job.stage === 'pre') job.failed = true
		if (res === 'stop' && (list[job.i].k === 'payCard' || list[job.i].k === 'payMoment')) {
			log(g, `${job.title}: can't be used any more.`)
			g.jobs.shift()
			continue
		}
		job.i++
	}
}

function sysJob(g: Game, job: Job) {
	switch (job.sys) {
		case 'finishTest':
			if (job.challenge != null && CHALLENGE[job.challenge].reshuffle) {
				g.challenge = shuffle([...g.challenge, ...g.challengeDiscard.splice(0)], g.rng)
				log(g, 'The challenge deck is reshuffled.')
			}
			g.dodge = []
			g.zeroPresence = []
			g.fatiguedThisTest = 0
			endTurn(g, job.ranger)
			return
		case 'endTurn':
			endTurn(g, job.ranger)
			return
		case 'newRound':
			newRound(g)
			return
	}
}

// ---------------------------------------------------------------- abilities that happen at a moment (triggers.ts)

const timingCache = new Map<string, On[] | null>()
export function timingOf(t: string): On[] | null {
	if (!timingCache.has(t)) timingCache.set(t, readTiming(t))
	return timingCache.get(t)!
}
/** The Ranger who controls a Ranger card in play ("you" on its text). */
function controller(g: Game, i: Inst): number | null {
	if (i.kind === 'role') return g.rangers.findIndex((R) => R.roleUid === i.uid)
	return i.deckOf ?? i.owner ?? null
}
function onMatches(g: Game, on: On, ev: Ev, src: number | null, ctl: number): boolean {
	if (on.ev !== ev.e) return false
	if (on.you && ev.ranger !== ctl) return false
	const host = src != null ? g.inst[src]?.attachedTo : null
	switch (ev.e) {
		case 'success':
			if (on.tests && !on.tests.includes(ev.test)) return false
			if (on.spirit && !ev.spirit) return false
			if (on.minEffort && ev.effort < on.minEffort) return false
			if (on.attached && (host == null || ev.target !== host)) return false
			if (on.fromHost && (host == null || ev.src !== host)) return false
			if (on.words && (ev.target == null || !g.inst[ev.target] || !matches(g, ev.target, { words: on.words }, null))) return false
			return true
		case 'fatigue':
		case 'wouldFatigue':
			return !on.minN || ev.n >= on.minN
		case 'clear':
			if (on.by && on.by !== ev.how) return false
			if (on.attached && host !== ev.uid) return false
			if (on.minPresence && ev.presence < on.minPresence) return false
			if (on.words && (!g.inst[ev.uid] || !matches(g, ev.uid, { words: on.words }, null))) return false
			return true
		case 'play':
			if (on.types && !on.types.includes(ev.type)) return false
			if (on.onPath && (ev.target == null || g.inst[ev.target]?.kind !== 'path')) return false
			return true
		case 'enters':
			return !on.words || (!!g.inst[ev.uid] && matches(g, ev.uid, { words: on.words }, null))
		default:
			return true
	}
}
/** Moments in hand whose "Response: After …" is offered by the test screen instead. */
const SUCCESS_RESPONSE = /Response: After you succeed at an? (\w+) test, /i
type Offer = { src: number | null; id: string; ctl: number; a: Ability; moment: boolean }
function offers(g: Game, ev: Ev): Offer[] {
	const out: Offer[] = []
	for (const i of Object.values(g.inst)) {
		if (i.faceDown || (i.kind !== 'ranger' && i.kind !== 'role')) continue
		const ctl = controller(g, i)
		if (ctl == null || ctl < 0) continue
		// Deployed gear works only while ready
		if (i.exhausted && isDeployed(i.id)) continue
		for (const a of P(g, i.uid).abilities) {
			if (!a.timing) continue
			const ons = timingOf(a.timing)
			if (!ons?.some((on) => onMatches(g, on, ev, i.uid, ctl))) continue
			if (a.kind === 'exhaust' && i.exhausted) continue
			if ((a.kind === 'exhaust' || a.kind === 'use') && a.use && i.tokens < a.use) continue
			out.push({ src: i.uid, id: i.id, ctl, a, moment: false })
		}
	}
	g.rangers.forEach((R, k) => {
		for (const id of new Set(R.hand)) {
			const c = card(id)
			if (c.type !== 'Moment' || !isResponse(id)) continue
			if (ev.e === 'success' && SUCCESS_RESPONSE.test(flat(id))) continue
			const cost = typeof c.cost === 'number' ? c.cost : 0
			if (R.energy[c.aspect ?? 'AWA'] < cost) continue
			for (const a of parsedOf(id).abilities) {
				if (a.kind !== 'response' || !a.timing) continue
				if (timingOf(a.timing)?.some((on) => onMatches(g, on, ev, null, k))) out.push({ src: null, id, ctl: k, a, moment: true })
			}
		}
	})
	return out
}
function offerJob(g: Game, o: Offer, ev: Ev, prefix: Step[] = [], declineTo: Step[] = []): NewJob {
	const pay: Step[] = o.moment ? [{ k: 'payMoment', id: o.id, ranger: o.ctl }] : o.a.kind === 'exhaust' || o.a.kind === 'use' ? [{ k: 'payCard', uid: o.src!, exhaust: o.a.kind === 'exhaust', use: o.a.use ?? 0 }] : []
	const body = [...pay, ...prefix, ...o.a.effect.pre, ...o.a.effect.steps]
	const optional = o.moment || o.a.kind !== 'other' || /\byou may\b/i.test(o.a.text) || declineTo.length > 0
	const name = card(o.id).name
	const short = o.a.effect.text.length > 90 ? o.a.effect.text.slice(0, 88) + '…' : o.a.effect.text
	const steps: Step[] = optional ? [{ k: 'either', a: body, b: declineTo, la: `${o.moment ? 'Play' : 'Use'} ${name}: ${short}`, lb: declineTo.length ? 'Take it' : 'Not now' }] : body
	const target = 'target' in ev ? ev.target : 'uid' in ev ? ev.uid : null
	const theirs = /^(they|that ranger)\b/i.test(o.a.effect.text) ? ev.ranger : o.ctl
	const effort = 'effort' in ev ? ev.effort : 'n' in ev ? ev.n : 0
	return { title: name, eff: { text: o.a.text, cond: o.a.effect.cond, pre: [], steps, auto: true }, src: o.src, ranger: theirs, effort, target, that: target != null && g.inst[target] ? [target] : null }
}
/** Something happened: offer each Ranger card that responds to it. */
export function fire(g: Game, ev: Ev) {
	if (g.ended) return
	for (const o of offers(g, ev)) addJob(g, offerJob(g, o, ev))
}
/** "When you would suffer …, … to prevent it": offer the prevention before it happens. */
function offerPrevention(g: Game, ev: Ev, hurt: Step): boolean {
	if (ev.e === 'wouldFatigue') {
		const R = g.rangers[ev.ranger]
		for (const o of offers(g, ev)) {
			const t = o.a.text
			const pay: Step[] = o.a.kind === 'exhaust' || o.a.kind === 'use' ? [{ k: 'payCard', uid: o.src!, exhaust: o.a.kind === 'exhaust', use: o.a.use ?? 0 }] : []
			const nm = card(o.id).name
			const why = hurt.k === 'hurt' ? hurt.why : ''
			// Songweave Mantle
			if (/discard a card from your hand\. If you do, either prevent 1 of that fatigue or, if you have 5 or more fatigue, prevent all of it/i.test(t) && R.hand.length) {
				const left = R.fatigue.length >= 5 ? 0 : ev.n - 1
				const a: Step[] = [...pay, { k: 'handToFatigue', to: 'discard' }, { k: 'note', text: `${nm} prevents ${left ? 1 : 'all of the'} fatigue.` }, ...(left ? [{ k: 'hurt', what: 'fatigue', n: left, why } as Step] : [])]
				addJob(g, { title: nm, eff: { text: t, pre: [], steps: [{ k: 'either', a, b: [hurt], la: `Use ${nm}: discard a card to prevent ${left ? '1' : 'all'} of ${ev.n} fatigue`, lb: 'Take it' }], auto: true }, src: o.src, ranger: o.ctl }, 'front')
				return true
			}
			// The Bravest Ranger
			if (/you may instead place that many cards from your hand on top of your fatigue stack/i.test(t) && R.hand.length >= ev.n) {
				const a: Step[] = [...pay, ...Array.from({ length: ev.n }, () => ({ k: 'handToFatigue' }) as Step)]
				addJob(g, { title: nm, eff: { text: t, pre: [], steps: [{ k: 'either', a, b: [hurt], la: `Use ${nm}: place ${ev.n} card${ev.n > 1 ? 's' : ''} from your hand on your fatigue stack instead`, lb: 'Take the fatigue' }], auto: true }, src: o.src, ranger: o.ctl }, 'front')
				return true
			}
		}
	}
	const os = offers(g, ev).filter((o) => /\bto prevent (it|that)/i.test(o.a.effect.text) || /\bprevent (it|that)/i.test(o.a.text))
	if (!os.length) return false
	const o = os[0]
	// the cost is whatever comes before "to prevent"; the effect is the prevention itself
	const cost = o.a.effect.text.replace(/,?\s*(?:to )?prevent (?:it|that [^.]*|all of it)\.?.*$/i, '').trim()
	const steps = cost ? effectOf(cost).steps : []
	if (steps.some((x) => x.k === 'manual')) return false
	for (const x of steps)
		if (x.k === 'remTok' && 'n' in x.amt) {
			const need = x.amt.n
			const pool = x.to.r === 'self' ? [o.src!] : x.to.r === 'choose' ? inPlay(g).filter((i) => matches(g, i.uid, (x.to as { f: Filter }).f, null)).map((i) => i.uid) : []
			if (!pool.some((u) => (g.inst[u]?.[x.what] ?? 0) >= need)) return false
		}
	const j = offerJob(g, { ...o, a: { ...o.a, effect: { text: o.a.effect.text, pre: [], steps: [...steps, { k: 'note', text: `${card(o.id).name} prevents it.` }], auto: true } } }, ev, [], [hurt])
	addJob(g, j, 'front')
	return true
}
function endSpiritspeak(g: Game, uid: number) {
	for (const R of g.rangers)
		if (R.roleUid === uid && R.spiritspeak) {
			R.spiritspeak = false
			log(g, `${R.name}'s role readies: they stop spiritspeaking.`)
		}
}

// ---------------------------------------------------------------- turn order

export function canTakeTurn(g: Game, r: number): string | null {
	if (g.phase !== 'turns') return 'It is not the Ranger turns phase.'
	if (g.queue.length || g.jobs.length) return 'Finish the current step first.'
	if (g.rangers[r].rested) return `${rangerName(g, r)} has rested this round.`
	const others = g.rangers.filter((x, k) => k !== r && !x.rested).length
	if (g.lastTurn === r && others > 0 && !g.inst[g.rangers[r].roleUid].exhausted) return 'role'
	if (g.lastTurn === r && others > 0) return `Another Ranger must take a turn first (${rangerName(g, r)}'s role is already exhausted).`
	return null
}
function beginTurn(g: Game, r: number, useRole?: boolean): string | null {
	const why = canTakeTurn(g, r)
	if (why === 'role') {
		if (!useRole) return 'Exhaust your role to take a second turn in a row.'
		g.inst[g.rangers[r].roleUid].exhausted = true
		log(g, `${rangerName(g, r)} exhausts their role to take another turn.`)
		fire(g, { e: 'exhaustRole', ranger: r })
	} else if (why) return why
	g.acting = r
	return null
}
function endTurn(g: Game, r: number) {
	g.lastTurn = r
	g.acting = null
	if (g.endAfterTurn && !g.ended) endDay(g, g.endAfterTurn)
}

// ---------------------------------------------------------------- tests

export interface TestChoice {
	src: number | null
	test: number | string
	name: string
	aspect: Aspect
	approach: string
	diff: number | 'X'
	needsTarget: string | null
}
/** The tests on the Ranger's reference card: common tests, or the Spirit Speaker tests while spiritspeaking. */
export function baseTests(g: Game, r: number) {
	const R = g.rangers[r]
	if (R.spiritspeak) return SPIRIT_TESTS
	if (R.spiritOnce) return [...COMMON_TESTS, ...SPIRIT_TESTS]
	return COMMON_TESTS
}
export const isSpirit = (g: Game, uid: number) => !!g.inst[uid] && P(g, uid).keywords.includes('Spirit')
export function availableTests(g: Game, r: number): TestChoice[] {
	const out: TestChoice[] = baseTests(g, r).map((t) => ({ src: null, test: t.key, name: t.name, aspect: t.aspect, approach: t.approach, diff: t.diff, needsTarget: t.targets || null }))
	for (const i of inPlay(g)) {
		if (g.rangers[r].spiritspeak && !isSpirit(g, i.uid)) continue
		if (i.zone === 'player' && i.owner !== r) continue
		if (i.zone === 'attached' && i.attachedTo != null && g.inst[i.attachedTo]?.zone === 'player' && g.inst[i.attachedTo]?.owner !== r) continue
		P(g, i.uid).tests.forEach((t, k) => out.push({ src: i.uid, test: k, name: t.name, aspect: t.aspect, approach: t.approach, diff: t.diff, needsTarget: null }))
	}
	return out
}
export function commonTargetOk(g: Game, key: string, uid: number): boolean {
	if (!g.inst[uid]) return false
	const ty = typeOf(g, uid)
	if (key === 'influence') return ty === 'Feature' || ty === 'Being'
	if (key === 'commune') return isSpirit(g, uid)
	// Stewards of the Valley: common tests can't interact with spirits
	if (isSpirit(g, uid)) return false
	if (key === 'traverse') return ty === 'Feature' || ty === 'Location'
	if (key === 'connect') return ty === 'Being' && !has(g, uid, 'Disconnected')
	if (key === 'avoid') return ty === 'Being'
	return false
}

function startTest(g: Game, it: Extract<Intent, { t: 'test' }>): string | null {
	const r = it.ranger
	let aspect: Aspect, approach: string, name: string, diff: number | 'X'
	let target = it.target ?? null
	if (typeof it.test === 'string') {
		const t = baseTests(g, r).find((x) => x.key === it.test)
		if (!t) return g.rangers[r].spiritspeak ? 'While spiritspeaking you can only perform Spirit Speaker tests.' : 'Unknown test.'
		;({ aspect, approach, name, diff } = t)
		if (t.targets && target == null) return `Choose a ${t.targets} first.`
		if (t.targets && !commonTargetOk(g, t.key, target!)) return `${name} needs a ${t.targets}.`
	} else {
		if (it.src == null || !g.inst[it.src]) return 'That card is no longer in play.'
		const t = P(g, it.src).tests[it.test]
		if (!t) return 'Unknown test.'
		;({ aspect, approach, name, diff } = t)
		if (target == null && g.inst[it.src].zone !== 'player') target = it.src
		if (t.use && g.inst[it.src].tokens < t.use) return `${nameOf(g, it.src)} has no tokens left to use.`
	}
	if (g.rangers[r].energy[aspect] < 1) return `${rangerName(g, r)} needs at least 1 ${aspect} energy.`
	const ob = blockedBy(g, r, target)
	if (ob != null) return `${nameOf(g, ob)} (obstacle) is in the way.`
	const err = beginTurn(g, r, it.useRole)
	if (err) return err
	if (typeof it.test === 'string' && SPIRIT_TESTS.some((x) => x.key === it.test) && !g.rangers[r].spiritspeak) g.rangers[r].spiritOnce = false
	if (typeof it.test === 'number' && it.src != null) {
		const t = P(g, it.src).tests[it.test]
		if (t.use) {
			g.inst[it.src].tokens -= t.use
			usedToken(g, it.src, r)
		}
	}
	const x = target != null ? Math.max(1, presence(g, target)) : 1
	// "Reduce the difficulty of this test by 1 for each flora in play." (The Brilliant Gardener)
	let less = 0
	if (typeof it.test === 'number' && it.src != null) {
		const rd = P(g, it.src).tests[it.test].raw.match(/Reduce the difficulty of this test by 1 for each (\w+) in play/i)
		if (rd) less = inPlay(g).filter((i) => matches(g, i.uid, { words: [rd[1].toLowerCase()] }, null)).length
	}
	log(g, `${rangerName(g, r)} performs ${name}${target != null ? ` on ${nameOf(g, target)}` : ''}.`)
	g.fatiguedThisTest = 0
	g.lastTest = null
	g.progressTo = null
	g.queue.unshift({ kind: 'test', ranger: r, src: it.src, test: it.test, target, aspect, approach, name, diff: Math.max(0, (diff === 'X' ? x : diff) - less), fatigued: 0 })
	return null
}

// ---------------------------------------------------------------- things you can add to a test

export interface TestOptions {
	inWay: number[]
	fatigue: number
	dodgeRole: number | null
	greaves: { uid: number; max: number } | null
	boosts: { uid: number; label: string }[]
	swap: { uid: number; to: Aspect } | null
	responses: { hand: number; id: string; label: string; cost: number; aspect: Aspect; kind: 'dodge' | 'success'; n?: number; text?: string }[]
	versatile: number[]
	/** Optional things that add effort or dodges (Stewards of the Valley cards and the like). */
	extras: { key: string; label: string; effort: number; dodge: number; pay: (g: Game) => void }[]
	/** Automatic changes to effort (Deployed gear). */
	mods: { label: string; effort: number }[]
}
/** Stewards of the Valley: "Deployed:" gear works only while ready. */
export const isDeployed = (id: string) => /\bDeployed\b/.test(flat(id))
/** Which area a card is in (attachments share their host's area). */
export function areaOf(g: Game, uid: number): string {
	let i = g.inst[uid]
	if (i?.attachedTo != null && g.inst[i.attachedTo]) i = g.inst[i.attachedTo]
	if (!i) return '?'
	return i.zone === 'reach' ? `reach:${i.owner}` : i.zone === 'player' ? `player:${i.owner}` : i.zone
}
function takeProgress(g: Game, uids: number[], n: number) {
	for (const u of uids) {
		const k = Math.min(n, g.inst[u]?.progress ?? 0)
		if (!k) continue
		g.inst[u].progress -= k
		n -= k
		log(g, `${k} progress discarded from ${nameOf(g, u)}.`)
		if (!n) return
	}
}
function testExtras(g: Game, pr: Extract<import('./types').Prompt, { kind: 'test' }>): Pick<TestOptions, 'extras' | 'mods'> {
	const r = pr.ranger
	const extras: TestOptions['extras'] = []
	const mods: TestOptions['mods'] = []
	const tArea = pr.target != null && g.inst[pr.target] ? areaOf(g, pr.target) : null
	for (const i of Object.values(g.inst)) {
		if (i.faceDown || i.kind !== 'ranger') continue
		const t = flat(i.id)
		const nm = nameOf(g, i.uid)
		// Deployed gear: "When you perform an Avoid test, reduce your effort by 1. When you perform a Traverse test, commit 1 effort."
		if (i.zone === 'player' && i.owner === r && !i.exhausted && isDeployed(i.id)) {
			for (const m of t.matchAll(/When you perform an? (\w+) test, (reduce your effort by|commit) (\d+)(?: effort)?/gi))
				if (m[1].toLowerCase() === pr.name.toLowerCase()) mods.push({ label: nm, effort: /reduce/i.test(m[2]) ? -Number(m[3]) : Number(m[3]) })
			const em = t.match(/Use (\d+) \w+: When a Ranger performs a test that is on a being, commit (\d+) effort/i)
			if (em && i.tokens >= Number(em[1]) && pr.src != null && g.inst[pr.src] && typeOf(g, pr.src) === 'Being')
				extras.push({ key: `u${i.uid}`, label: `${nm}: +${em[2]} effort (use ${em[1]})`, effort: Number(em[2]), dodge: 0, pay: (g) => (g.inst[i.uid].tokens -= Number(em[1])) })
		}
		// Friendly Repair Service on the human you Connect with
		if (/When a Ranger Connects with the attached human, the Ranger who played this card may discard 1 token/i.test(t) && pr.name === 'Connect' && i.attachedTo === pr.target && i.deckOf != null) {
			const gear = zoneCards(g, 'player', i.deckOf).filter((x) => x.kind === 'ranger' && x.tokens > 0)
			if (gear.length) extras.push({ key: `u${i.uid}`, label: `${nm}: discard 1 token from ${nameOf(g, gear[0].uid)} for +1 effort`, effort: 1, dodge: 0, pay: (g) => g.inst[gear[0].uid].tokens-- })
		}
		// Spirits and spiritual attachments
		if (/When a Ranger interacts with a card in the same area as this spirit, discard 2 or more \[progress\] from this spirit to commit 1 effort for every 2/i.test(t) && !i.exhausted && tArea && areaOf(g, i.uid) === tArea && i.progress >= 2) {
			const k = Math.floor(i.progress / 2)
			extras.push({ key: `u${i.uid}`, label: `Exhaust ${nm}: discard ${2 * k} progress for +${k} effort`, effort: k, dodge: 0, pay: (g) => { g.inst[i.uid].exhausted = true; g.inst[i.uid].progress -= 2 * k } })
		}
		if (/When a Ranger performs a test, they may discard 2 or more \[progress\] from the attached spirit\. Dodge a card/i.test(t) && i.attachedTo != null && (g.inst[i.attachedTo]?.progress ?? 0) >= 2) {
			const h = i.attachedTo
			const k = Math.floor(g.inst[h].progress / 2)
			extras.push({ key: `u${i.uid}`, label: `${nm}: discard ${2 * k} progress from ${nameOf(g, h)} to dodge ${k}`, effort: 0, dodge: k, pay: (g) => (g.inst[h].progress -= 2 * k) })
		}
		if (/When a Ranger interacts with a card in the same area as the attached spirit, you may exhaust that spirit to commit its approach icons/i.test(t) && i.attachedTo != null && g.inst[i.attachedTo] && !g.inst[i.attachedTo].exhausted && tArea && areaOf(g, i.attachedTo) === tArea) {
			const h = i.attachedTo
			const n = card(g.inst[h].id).icons?.[pr.approach as 'conflict'] ?? 0
			if (n) extras.push({ key: `u${i.uid}`, label: `${nm}: exhaust ${nameOf(g, h)} for +${n} effort`, effort: n, dodge: 0, pay: (g) => (g.inst[h].exhausted = true) })
		}
	}
	// Response moments in any Ranger's hand
	g.rangers.forEach((R, k) => {
		R.hand.forEach((id, h) => {
			const t = flat(id)
			const c = card(id)
			const cost = typeof c.cost === 'number' ? c.cost : 0
			const a = c.aspect ?? 'AWA'
			if (R.energy[a] < cost) return
			const pay = (g: Game) => {
				const RR = g.rangers[k]
				const at = RR.hand.indexOf(id)
				if (at < 0) return
				RR.energy[a] -= cost
				RR.hand.splice(at, 1)
				const back = /add this moment back to your hand instead/i.test(t) && g.rangers[r].fatigue.length >= 5
				;(back ? RR.hand : RR.discard).push(id)
				log(g, `${RR.name} plays ${c.name}${back ? ' (it comes back to their hand)' : ''}.`)
			}
			if (/^Response: When a Ranger performs a test, they dodge (\d+) card/i.test(t)) {
				const n = Number(t.match(/dodge (\d+)/)![1])
				extras.push({ key: `h${k}:${h}`, label: `Play ${c.name}${k !== r ? ` (${R.name})` : ''}: dodge ${n} (${cost} ${a})`, effort: 0, dodge: n, pay })
			}
			if (k === r && /^When you perform a test, discard 2 or more \[progress\] from beings within reach to commit 1 effort for every 2/i.test(t)) {
				const beings = zoneCards(g, 'reach', r).filter((x) => typeOf(g, x.uid) === 'Being' && x.progress > 0).map((x) => x.uid)
				const tot = beings.reduce((s, u) => s + g.inst[u].progress, 0)
				const n = Math.floor(tot / 2)
				if (n) extras.push({ key: `h${k}:${h}`, label: `Play ${c.name}: discard ${2 * n} progress from beings within reach for +${n} (${cost} ${a})`, effort: n, dodge: 0, pay: (g) => { pay(g); takeProgress(g, beings, 2 * n) } })
			}
		})
	})
	return { extras, mods }
}
/** Approach icons a hand card gives this test (attributes like Vigilant count your energy). */
export function iconsFor(g: Game, r: number, id: string, approach: string, pool?: Record<Aspect, number>): number {
	const c = card(id)
	const m = flat(id).match(/The number of \[(conflict|reason|exploration|connection)\] on this attribute is equal to the number of \[(AWA|FIT|FOC|SPI)\] in your energy pool/i)
	if (m && m[1] === approach) return (pool ?? g.rangers[r].energy)[m[2] as Aspect]
	const base = c.icons?.[approach as 'conflict'] ?? 0
	// Deliberate: "While you have 6 or more other cards in your hand, this attribute gains [reason] [exploration]."
	const wh = flat(id).match(/While you have (\d+) or more other cards in your hand, this attribute gains ((?:\[\w+\] ?)+)/i)
	if (wh && g.rangers[r].hand.length - 1 >= Number(wh[1]) && wh[2].includes(approach)) return base + 1
	return base
}
export function testOptions(g: Game, pr: Extract<import('./types').Prompt, { kind: 'test' }>): TestOptions {
	const r = pr.ranger
	const R = g.rangers[r]
	const inWay = between(g, r, pr.target)
	const fatigue = inWay.filter((u) => !has(g, u, 'Friendly')).reduce((n, u) => n + presence(g, u), 0)
	const role = g.inst[R.roleUid]
	const dodgeRole = !role.exhausted && /When you perform a test, dodge 1 card/i.test(flat(role.id)) ? role.uid : null
	let greaves: TestOptions['greaves'] = null
	const boosts: TestOptions['boosts'] = []
	let swap: TestOptions['swap'] = null
	for (const i of zoneCards(g, 'player')) {
		const t = flat(i.id)
		if (i.owner === r && /Use X \w+: When you perform a test, suffer X fewer fatigue/i.test(t) && i.tokens > 0) greaves = { uid: i.uid, max: i.tokens }
		const b = t.match(/Exhaust \(use 1 (\w+)\): When a Ranger performs an? (\w+) test, commit 1 effort/i)
		if (b && !i.exhausted && i.tokens > 0 && b[2].toLowerCase() === pr.name.toLowerCase()) boosts.push({ uid: i.uid, label: `${nameOf(g, i.uid)} (+1, use 1 ${b[1]})` })
		const sw = t.match(/When you perform a (\w+) test, use \[?(AWA|FIT|FOC|SPI)\]? instead of \[?(AWA|FIT|FOC|SPI)\]?/i)
		if (sw && i.owner === r && !i.exhausted && (!/use 1/.test(t) || i.tokens > 0) && sw[1].toLowerCase() === pr.name.toLowerCase() && sw[3] === pr.aspect) swap = { uid: i.uid, to: sw[2] as Aspect }
	}
	const responses: TestOptions['responses'] = []
	R.hand.forEach((id, h) => {
		const c = card(id)
		if (c.type !== 'Moment') return
		const t = flat(id)
		const cost = typeof c.cost === 'number' ? c.cost : 0
		const aspect = c.aspect ?? 'AWA'
		const d = t.match(/Response: When you (\w+), dodge up to (\d+) cards/i)
		if (d && d[1].toLowerCase() === pr.name.toLowerCase()) responses.push({ hand: h, id, label: `${c.name}: dodge up to ${d[2]} cards`, cost, aspect, kind: 'dodge', n: Number(d[2]) })
		const sc = t.match(/Response: After you succeed at an? (\w+) test, (.+?)( This is in addition.*)?$/i)
		if (sc && sc[1].toLowerCase() === pr.name.toLowerCase()) responses.push({ hand: h, id, label: `${c.name} if you succeed: ${sc[2]}`, cost, aspect, kind: 'success', text: sc[2] })
	})
	const versatile: number[] = []
	R.hand.forEach((id, h) => {
		const m = flat(id).match(/Before you commit this attribute, you may suffer 1 fatigue\. If you do, this attribute gains ((?:\[\w+\] ?)+)/i)
		if (m && m[1].includes(pr.approach)) versatile.push(h)
	})
	return { inWay, fatigue, dodgeRole, greaves, boosts, swap, responses, versatile, ...testExtras(g, pr) }
}

export function tokenEffort(g: Game, r: number, target: number | null): number {
	if (target == null) return 0
	return g.rangers.filter((x, k) => k !== r && x.token === target).length
}
export function drawChallenge(g: Game): number {
	if (!g.challenge.length) g.challenge = shuffle(g.challengeDiscard.splice(0), g.rng)
	const c = g.challenge.shift()!
	g.challengeDiscard.push(c)
	return c
}

function commit(g: Game, it: Extract<Intent, { t: 'commit' }>): string | null {
	const pr = g.queue[0]
	if (pr?.kind !== 'test') return 'No test to commit to.'
	const r = pr.ranger
	const R = g.rangers[r]
	const opt = testOptions(g, pr)
	const aspect: Aspect = it.swap && opt.swap ? opt.swap.to : pr.aspect
	if (it.energy < 1 || it.energy > R.energy[aspect]) return `Commit between 1 and ${R.energy[aspect]} ${aspect} energy.`
	if (it.swap && opt.swap) {
		const sw = g.inst[opt.swap.uid]
		sw.exhausted = true
		if (/use 1/.test(flat(sw.id))) sw.tokens--
		log(g, `${R.name} uses ${nameOf(g, sw.uid)}: ${aspect} instead of ${pr.aspect}.`)
	}
	// 1. Dodging and fatigue from cards in the way
	const dodge: number[] = []
	const byPresence = opt.inWay.filter((u) => !has(g, u, 'Friendly')).sort((a, b) => presence(g, b) - presence(g, a))
	const responses = [...new Set(it.responses ?? [])].map((h) => opt.responses.find((x) => x.hand === h)).filter((x): x is TestOptions['responses'][number] => !!x)
	const used: number[] = []
	for (const rs of responses.filter((x) => x.kind === 'dodge')) {
		if (R.energy[rs.aspect] < rs.cost) continue
		R.energy[rs.aspect] -= rs.cost
		used.push(rs.hand)
		dodge.push(...byPresence.filter((u) => !dodge.includes(u)).slice(0, rs.n ?? 1))
		log(g, `${R.name} plays ${card(rs.id).name} and dodges.`)
	}
	if (it.dodgeRole && opt.dodgeRole != null) {
		g.inst[opt.dodgeRole].exhausted = true
		fire(g, { e: 'exhaustRole', ranger: r })
		dodge.push(...byPresence.filter((u) => !dodge.includes(u)).slice(0, 1))
		log(g, `${R.name} exhausts ${nameOf(g, opt.dodgeRole)} to dodge.`)
	}
	const xs = [...new Set(it.extras ?? [])].map((k) => opt.extras.find((x) => x.key === k)).filter((x): x is TestOptions['extras'][number] => !!x)
	let xEffort = 0
	for (const x of xs) {
		xEffort += x.effort
		if (x.dodge) dodge.push(...byPresence.filter((u) => !dodge.includes(u)).slice(0, x.dodge))
		log(g, `${R.name}: ${x.label}.`)
	}
	for (const m of opt.mods) {
		xEffort += m.effort
		log(g, `${m.label}: ${m.effort > 0 ? '+' : ''}${m.effort} effort.`)
	}
	if (pr.test === 'influence') {
		// "When you perform this test, dodge all cards that share an area with a spirit."
		const area = (u: number) => `${g.inst[u].zone}:${g.inst[u].owner}`
		const spiritAreas = new Set(inPlay(g).filter((i) => isSpirit(g, i.uid)).map((i) => area(i.uid)))
		for (const u of opt.inWay) if (spiritAreas.has(area(u)) && !dodge.includes(u)) dodge.push(u)
	}
	g.dodge = dodge
	const buffers = Math.min(it.buffers ?? 0, opt.greaves?.max ?? 0)
	if (buffers && opt.greaves) g.inst[opt.greaves.uid].tokens -= buffers
	for (const u of between(g, r, pr.target)) {
		if (has(g, u, 'Friendly')) continue
		const n = Math.max(0, presence(g, u) - buffers)
		if (n) sufferFatigue(g, r, n, nameOf(g, u))
		if (g.ended) return null
	}
	// 2. Effort
	R.energy[aspect] -= it.energy
	let icons = 0
	const idx = [...new Set([...it.discards, ...used])].sort((a, b) => b - a)
	const committed: string[] = []
	const attrs: string[] = []
	for (const h of idx) {
		const id = R.hand[h]
		if (!id) continue
		const isResp = used.includes(h)
		if (!isResp) {
			let n = iconsFor(g, r, id, pr.approach)
			if ((it.versatile ?? []).includes(h) && opt.versatile.includes(h)) {
				n += 1
				sufferFatigue(g, r, 1, card(id).name)
			}
			icons += n
			committed.push(card(id).name)
			if (card(id).type === 'Attribute') attrs.push(id)
		}
		R.hand.splice(h, 1)
		R.discard.push(id)
	}
	for (const x of xs) x.pay(g)
	let boost = 0
	for (const u of it.boosts ?? []) {
		const b = opt.boosts.find((x) => x.uid === u)
		if (!b) continue
		g.inst[u].exhausted = true
		g.inst[u].tokens--
		usedToken(g, u, r)
		boost++
		log(g, `${nameOf(g, u)} commits 1 effort.`)
	}
	// Resourceful Traveler: "search your Ranger deck for the next attribute that you can commit to this test and commit it"
	const fetched: string[] = []
	for (const id of attrs)
		if (/After you commit this attribute, search your Ranger deck for the next attribute that you can commit to this test and commit it/i.test(flat(id))) {
			const k = R.deck.findIndex((x) => card(x).type === 'Attribute' && iconsFor(g, r, x, pr.approach) > 0)
			if (k >= 0) {
				const [x] = R.deck.splice(k, 1)
				fetched.push(x)
				icons += iconsFor(g, r, x, pr.approach)
				log(g, `${card(id).name} finds ${card(x).name} in ${R.name}'s deck and commits it (+${iconsFor(g, r, x, pr.approach)}).`)
			}
		}
	const tok = tokenEffort(g, r, pr.target)
	const base = Math.max(0, it.energy + icons + tok + boost + (it.extra || 0) + xEffort)
	const ci = drawChallenge(g)
	const ch = CHALLENGE[ci]
	const mod = ch[aspect]
	const effort = Math.max(0, base + mod)
	const diff = it.diff ?? pr.diff
	const success = effort >= diff
	g.queue.shift()
	g.lastTest = { name: pr.name, ranger: r, effort, base, mod, diff, success, challenge: ci, symbol: ch.symbol }
	log(
		g,
		`${R.name} commits ${it.energy} energy${icons ? ` + ${icons} icon${icons > 1 ? 's' : ''} (${committed.join(', ')})` : ''}${tok ? ` + ${tok} from Ranger tokens` : ''}${it.extra ? ` + ${it.extra}` : ''}; challenge ${mod >= 0 ? '+' : ''}${mod} ${ch.symbol} → effort ${effort} vs ${diff}: ${success ? 'success' : 'failure'}.`,
	)
	const base0 = { ranger: r, effort, target: pr.target }
	// Responses played "after you succeed"
	if (success)
		for (const rs of responses.filter((x) => x.kind === 'success')) {
			const k = R.hand.indexOf(rs.id)
			if (k < 0 || R.energy[rs.aspect] < rs.cost) continue
			R.energy[rs.aspect] -= rs.cost
			R.hand.splice(k, 1)
			R.discard.push(rs.id)
			log(g, `${R.name} plays ${card(rs.id).name}.`)
			addJob(g, { title: card(rs.id).name, eff: effectOf(rs.text!), src: null, ...base0 })
		}
	// Attributes that do something after the test
	const base1 = { ranger: r, effort: 0, target: pr.target }
	for (const id of attrs) {
		const t = flat(id)
		const nm = card(id).name
		const ask = (la: string, a: Step[]) => addJob(g, { title: nm, eff: { text: t, pre: [], steps: [{ k: 'either', a, b: [], la, lb: 'No thanks' }], auto: true }, src: null, ...base1 })
		if (/After a test in which you committed this attribute, if your effort was 1 or less, you may place this attribute on top of your fatigue stack/i.test(t) && (g.lastTest?.effort ?? 9) <= 1)
			ask(`Put ${nm} on top of your fatigue stack (to soothe it back later)`, [{ k: 'discardTo', f: { words: [nm.toLowerCase()] }, to: 'fatigue' }])
		if (!success) continue
		if (/After you succeed at a test in which you committed this attribute, if your effort was 3 or more, move 1 being/i.test(t) && (g.lastTest?.effort ?? 0) >= 3) ask('Move 1 being', [...effectOf('Move a being.').steps])
		if (/After you succeed at a test in which you committed this attribute, choose a gear in your Ranger discard and place it on top of your fatigue stack/i.test(t))
			addJob(g, { title: nm, eff: { text: t, pre: [], steps: [{ k: 'discardTo', f: { words: ['gear'] }, to: (g.lastTest?.effort ?? 0) >= 3 ? 'hand' : 'fatigue', pick: true }], auto: true }, src: null, ...base1 })
		if (/you may place a card from your hand on top of your fatigue stack to add this attribute back to your hand/i.test(t))
			addJob(g, { title: nm, eff: { text: t, pre: [], steps: [{ k: 'handToFatigue', back: id }], auto: true }, src: null, ...base1 })
	}
	for (const x of fetched) (success ? R.fatigue : R.discard).push(x)
	// Attributes that do something after a success
	if (success)
		for (const id of attrs) {
			const t = flat(id)
			if (/you may suffer 1 fatigue to add it back into your hand/i.test(t))
				addJob(g, { title: card(id).name, eff: { text: '', pre: [], steps: [{ k: 'either', a: [{ k: 'fatigue', amt: { n: 1 } }, { k: 'fromDiscard', id }], b: [], la: `Suffer 1 fatigue: ${card(id).name} back to your hand`, lb: 'Leave it' }], auto: true }, src: null, ...base0 })
			const gn = t.match(/gain 1 \[?(AWA|FIT|FOC|SPI)\]?\.?$/i)
			if (gn) addJob(g, { title: card(id).name, eff: { text: '', pre: [], steps: [{ k: 'energy', n: 1, aspect: gn[1] as Aspect, gain: true }], auto: true }, src: null, ...base0 })
			if (/you may suffer 1 fatigue to gain 1 energy of any type/i.test(t))
				addJob(g, { title: card(id).name, eff: { text: '', pre: [], steps: [{ k: 'either', a: [{ k: 'fatigue', amt: { n: 1 } }, { k: 'energy', n: 1, gain: true }], b: [], la: 'Suffer 1 fatigue: gain 1 energy', lb: 'No thanks' }], auto: true }, src: null, ...base0 })
		}
	if (success) fire(g, { e: 'success', ranger: r, test: pr.name.toLowerCase(), target: pr.target, effort, src: pr.src, spirit: (pr.target != null && isSpirit(g, pr.target)) || (pr.src != null && isSpirit(g, pr.src)) })
	if (typeof pr.test === 'string') common(g, pr.test, r, pr.target, effort, success)
	else if (pr.src != null && g.inst[pr.src]) {
		const t = P(g, pr.src).tests[pr.test]
		const name = `${nameOf(g, pr.src)}: ${t.name}`
		if (success) addJob(g, { title: name, eff: t.success, src: pr.src, ...base0 })
		else if (t.fail) addJob(g, { title: `${name} (failed)`, eff: t.fail, src: pr.src, ...base0 })
		if (t.always) addJob(g, { title: name, eff: t.always, src: pr.src, ...base0 })
	}
	for (const u of activeCards(g, r, pr.target)) {
		const e = P(g, u).challenge[ch.symbol]
		if (!e) continue
		// Response: "Before a <name> would resolve a challenge effect, discard N[progress] from this spirit to exhaust the <name>."
		const guard = Object.values(g.inst).find((i) => {
			const m = i.kind === 'ranger' && !i.faceDown ? flat(i.id).match(/Before an? ([\w' ]+?) would resolve a challenge effect, discard (\d+)\[progress\] from this spirit to exhaust/i) : null
			return !!m && nameOf(g, u).toLowerCase().includes(m[1].toLowerCase()) && i.progress >= Number(m[2])
		})
		if (guard) {
			const n = Number(flat(guard.id).match(/discard (\d+)\[progress\] from this spirit/i)![1])
			const sp = guard.uid
			addJob(g, {
				title: `${nameOf(g, u)} ${SYM_LABEL[ch.symbol]}`,
				eff: { text: '', pre: [], steps: [{ k: 'either', a: [{ k: 'remTok', what: 'progress', amt: { n }, to: { r: 'named', name: nameOf(g, sp) } }, { k: 'exhaust', to: { r: 'self' } }], b: [{ k: 'effect', eff: e }], la: `${nameOf(g, sp)}: discard ${n} progress to exhaust ${nameOf(g, u)} (its effect doesn't resolve)`, lb: 'Let it resolve' }], auto: true },
				src: u,
				...base0,
			})
			continue
		}
		addJob(g, { title: `${nameOf(g, u)} ${SYM_LABEL[ch.symbol]}`, eff: e, src: u, ...base0 })
	}
	addJob(g, SYS('finishTest', r, { challenge: ci }))
	return null
}
export const SYM_LABEL: Record<Sym, string> = { sun: '☀', mountain: '⛰', crest: '⚜' }

function common(g: Game, key: string, r: number, target: number | null, effort: number, success: boolean) {
	if (key === 'traverse') {
		if (success && target != null) addTokens(g, target, 'progress', effort)
		if (!success) injure(g, r, 1)
	} else if (key === 'connect') {
		if (success && target != null) addTokens(g, target, 'progress', effort)
	} else if (key === 'avoid') {
		if (success && target != null) {
			g.inst[target].exhausted = true
			log(g, `${nameOf(g, target)} is exhausted.`)
		}
	} else if (key === 'influence') {
		if (success && target != null) addJob(g, { title: 'Influence', eff: effectOf('Move it.'), src: null, ranger: r, target, that: [target], effort })
	} else if (key === 'awaken') {
		if (success) addJob(g, { title: 'Awaken', eff: { text: '', pre: [], steps: [{ k: 'soothe', amt: { spirits: 'reach', plus: 1 }, who: 'choose' }], auto: true }, src: null, ranger: r, effort })
	} else if (key === 'commune') {
		if (success && target != null) addTokens(g, target, 'progress', 2 * effort)
	} else if (key === 'measure') {
		if (success) addJob(g, { title: 'Measure', eff: { text: '', pre: [], steps: [{ k: 'scoutPath', amt: { spirits: 'along', plus: 1 } }], auto: true }, src: null, ranger: r, effort })
	} else if (key === 'remember') {
		if (success) {
			const R = g.rangers[r]
			if (effort > 0 && R.deck.length) g.queue.push({ kind: 'scout', ranger: r, deck: 'ranger', cards: R.deck.slice(0, effort), drawAfter: 1 })
			else drawRanger(g, r, 1)
		}
	}
}

function addTokens(g: Game, uid: number, what: 'progress' | 'harm' | 'tokens', n: number) {
	const i = g.inst[uid]
	if (!i || n <= 0) return
	if (what === 'progress' && /maximum of 1\[progress\] per test/i.test(card(i.id).text || '')) n = Math.min(n, 1)
	i[what] += n
	if (what === 'progress') g.progressTo = uid
	const label = what === 'tokens' ? (card(i.id).tokens?.name ?? 'token').toLowerCase() : what
	log(g, `${n} ${label} added to ${nameOf(g, uid)}.`)
}

// ---------------------------------------------------------------- moving cards

function discardCard(g: Game, uid: number) {
	const i = g.inst[uid]
	if (!i) return
	if (i.kind === 'mission' || i.kind === 'weather' || i.kind === 'location' || i.kind === 'role') return
	log(g, `${nameOf(g, uid)} is discarded.`)
	removeInst(g, uid, 'discard')
}
function flip(g: Game, uid: number) {
	const i = g.inst[uid]
	const c = card(i.id)
	if (!c.B) return
	i.side = i.side === 'A' ? 'B' : 'A'
	log(g, `${c.name} flips to ${i.side === 'B' ? c.B.name : c.name}.`)
}
function moveCard(g: Game, uid: number, zone: 'along' | 'reach' | 'surroundings' | 'player', owner: number, noAmbush = false) {
	const i = g.inst[uid]
	i.zone = zone
	i.owner = zone === 'reach' || zone === 'player' ? owner : null
	i.attachedTo = null
	log(g, `${nameOf(g, uid)} moves ${zone === 'reach' ? `within reach of ${rangerName(g, owner)}` : zone === 'along' ? 'along the way' : zone}.`)
	if (zone === 'reach' && !noAmbush && has(g, uid, 'Ambush') && !i.exhausted) sufferFatigue(g, owner, presence(g, uid), `${nameOf(g, uid)} (ambush)`)
}

// ---------------------------------------------------------------- clearing

function checkClears(g: Game) {
	if (g.ended) return
	for (const i of Object.values(g.inst)) {
		if (!g.inst[i.uid] || i.faceDown || i.kind === 'location' || i.kind === 'mission' || i.kind === 'weather' || i.kind === 'role') continue
		const pt = threshold(g, i.uid, 'prog')
		const ht = threshold(g, i.uid, 'harm')
		let how: 'progress' | 'harm' | 'ranger' | null = null
		if (pt === 'ranger' && g.rangers.every((r) => r.token === i.uid)) how = 'ranger'
		else if (typeof pt === 'number' && pt > 0 && i.progress >= pt) how = 'progress'
		if (!how && typeof ht === 'number' && ht > 0 && i.harm >= ht) how = 'harm'
		if (!how) continue
		const p = P(g, i.uid)
		const eff = p.clear.find((c) => c.on.includes(how!)) ?? p.clear[0]
		const name = nameOf(g, i.uid)
		log(g, `${name} clears (${how}).`)
		const r = g.acting ?? g.lead
		if (eff) addJob(g, { title: `${name} clears`, eff: eff.effect, src: null, ranger: r }, 'front')
		fire(g, { e: 'clear', ranger: r, uid: i.uid, how, host: i.attachedTo, words: [], presence: presence(g, i.uid) })
		removeInst(g, i.uid, 'discard')
	}
}

// ---------------------------------------------------------------- playing cards

export function costOf(id: string): number | 'X' {
	const c = card(id)
	return c.cost === 'X' ? 'X' : typeof c.cost === 'number' ? c.cost : 0
}
export function equipUsed(g: Game, r: number) {
	return zoneCards(g, 'player', r).reduce((s, i) => {
		const less = attachments(g, i.uid).reduce((n, a) => n + Number(flat(a.id).match(/Reduce the equip value of the attached gear by (\d+)/i)?.[1] ?? 0), 0)
		return s + Math.max(0, (card(i.id).equip ?? 0) - less)
	}, 0)
}
export const isResponse = (id: string) => /^\s*(<b>)?Response:/i.test(card(id).text || '')

function play(g: Game, it: Extract<Intent, { t: 'play' }>): string | null {
	const r = it.ranger
	const R = g.rangers[r]
	const id = R.hand[it.hand]
	if (!id) return 'No such card.'
	const c = card(id)
	if (c.type === 'Attribute') return 'Attributes can only be committed to tests.'
	const first = (c.text?.split('\n')[0] ?? '').replace(/<[^>]+>/g, '')
	const isManifest = /\bManifestation\b/.test(first)
	let conduit: Inst | undefined
	if (isManifest) {
		conduit = zoneCards(g, 'player', r).find((i) => /\bConduit\b/.test(card(i.id).text?.split('\n')[0] ?? '') && i.tokens > 0)
		if (!conduit) return 'A manifestation needs a token on one of your equipped conduits.'
	}
	let cost = costOf(id) === 'X' ? (it.x ?? 0) : (costOf(id) as number)
	const aspect = c.aspect ?? 'AWA'
	// Ironwool Cap: "Exhaust (use 1 insight): Before you play a moment, reduce its cost by 1 (to a minimum of 1)." Used when you need it.
	const cap = c.type === 'Moment' && cost > 1 && R.energy[aspect] < cost ? zoneCards(g, 'player', r).find((i) => !i.exhausted && i.tokens > 0 && /Before you play a moment, reduce its cost by 1/i.test(flat(i.id))) : undefined
	if (cap && R.energy[aspect] >= cost - 1) {
		cap.exhausted = true
		cap.tokens--
		cost -= 1
		log(g, `${R.name} uses ${nameOf(g, cap.uid)}: ${c.name} costs 1 less.`)
	}
	if (R.energy[aspect] < cost) return `${c.name} costs ${cost} ${aspect} energy.`
	const seek = flat(id).match(/^Search the path deck and discard for an? (\w+) and put (?:it|them) into play with this \w+ attached/i)
	if (c.type === 'Attachment' && it.target == null && !seek) return 'Choose the card to attach it to.'
	if (c.type === 'Attachment' && it.target != null && isSpirit(g, it.target) && !/\bSpiritual\b/.test(c.traits ?? '')) return 'Only Spiritual attachments can attach to a spirit.'
	const response = isResponse(id)
	if (!response) {
		const err = beginTurn(g, r, it.useRole)
		if (err) return err
	}
	R.energy[aspect] -= cost
	if (conduit) {
		conduit.tokens--
		fire(g, { e: 'conduit', ranger: r, n: 1 })
	}
	R.hand.splice(it.hand, 1)
	log(g, `${R.name} plays ${c.name}${cost ? ` (${cost} ${aspect})` : ''}.`)
	if (c.type === 'Moment') {
		R.discard.push(id)
		for (const i of zoneCards(g, 'player', r))
			if (/After you play a moment, soothe 1 fatigue/i.test(flat(i.id))) addJob(g, { title: nameOf(g, i.uid), eff: effectOf('Soothe 1 fatigue.'), src: i.uid, ranger: r })
		const p = parsedOf(id)
		const effs: Effect[] = p.choice
			? [p.choice]
			: [...p.abilities.filter((a) => a.kind !== 'other').map((a) => a.effect), ...p.other.filter((l) => !/^(Manifestation|Choose one)\b/i.test(l)).map((l) => effectOf(l.replace(/^Response:\s*When [^,]+,\s*/i, '')))]
		for (const e of effs) addJob(g, { title: c.name, eff: e, src: null, ranger: r })
		for (const t of p.tests) addJob(g, { title: c.name, eff: { text: t.raw, pre: [], steps: [{ k: 'manual', text: `Perform ${t.name} (${t.aspect} + ${t.approach}): ${t.success.text}` }], auto: false }, src: null, ranger: r })
	} else if (c.type === 'Gear') {
		if (/\bUnique\b/.test(first)) for (const o of zoneCards(g, 'player', r)) if (o.id === id) removeInst(g, o.uid, 'discard')
		const uid = addInst(g, id, 'player', r, 'ranger')
		g.inst[uid].deckOf = r
		if (equipUsed(g, r) > 5) g.queue.unshift({ kind: 'equip', ranger: r })
	} else if (c.type === 'Attachment') {
		let host = it.target ?? null
		if (seek) {
			const want = seek[1].toLowerCase()
			for (const pool of [g.pathDeck, g.pathDiscard]) {
				const k = pool.findIndex((x) => fakeMatch(x, { words: [want] }))
				if (k < 0) continue
				const [pid] = pool.splice(k, 1)
				g.pathDeck = shuffle(g.pathDeck, g.rng)
				host = putPathInPlay(g, pid, r, 'finds')
				break
			}
		}
		if (host == null) {
			R.discard.push(id)
			log(g, `${c.name} finds nothing to attach to.`)
		} else {
			const uid = addInst(g, id, 'attached', null, 'ranger')
			g.inst[uid].deckOf = r
			g.inst[uid].attachedTo = host
			g.inst[uid].owner = g.inst[host]?.owner ?? null
			log(g, `${c.name} is attached to ${nameOf(g, host)}.`)
			const wp = flat(id).match(/When you play this attachment, (.+?\.)/i)
			if (wp) addJob(g, { title: c.name, eff: effectOf(wp[1]), src: uid, ranger: r })
		}
	} else if (c.type === 'Being' || c.type === 'Feature') {
		if (/\bUnique\b/.test(first)) for (const o of Object.values(g.inst)) if (o.id === id && o.deckOf === r) removeInst(g, o.uid, 'discard')
		const uid = addInst(g, id, 'reach', r, 'ranger')
		g.inst[uid].deckOf = r
	} else R.discard.push(id)
	if (c.type === 'Moment' || c.type === 'Attachment') fire(g, { e: 'play', ranger: r, type: c.type.toLowerCase(), target: it.target ?? null })
	if (!response) addJob(g, SYS('endTurn', r))
	return null
}

function ability(g: Game, it: Extract<Intent, { t: 'ability' }>): string | null {
	const i = g.inst[it.uid]
	if (!i) return 'That card is gone.'
	const ab = P(g, it.uid).abilities[it.line]
	if (!ab) return 'No such ability.'
	if (g.queue.length && g.queue[0].kind !== 'test') return 'Finish the current step first.'
	if (ab.kind === 'exhaust') {
		if (i.exhausted) return `${nameOf(g, it.uid)} is already exhausted.`
		if (ab.use && i.tokens < ab.use) return `${nameOf(g, it.uid)} has no tokens left.`
		i.exhausted = true
		if (ab.use) {
			i.tokens -= ab.use
			usedToken(g, it.uid, it.ranger)
		}
		log(g, `${rangerName(g, it.ranger)} exhausts ${nameOf(g, it.uid)}.`)
		if (i.kind === 'role') fire(g, { e: 'exhaustRole', ranger: it.ranger })
	}
	addJob(g, { title: nameOf(g, it.uid), eff: ab.effect, src: it.uid, ranger: it.ranger })
	return null
}

/** "After you use a token from the attached gear, soothe 1 fatigue." */
function usedToken(g: Game, uid: number, r: number) {
	for (const a of attachments(g, uid)) if (/After you use a token from the attached gear, soothe 1 fatigue/i.test(flat(a.id))) soothe(g, r, 1)
}

function rest(g: Game, r: number): string | null {
	if (g.phase !== 'turns') return 'You can only rest during Ranger turns.'
	if (g.queue.length || g.jobs.length) return 'Finish the current step first.'
	const R = g.rangers[r]
	if (R.rested) return `${R.name} has already rested.`
	R.rested = true
	log(g, `${R.name} rests.`)
	fire(g, { e: 'rest', ranger: r })
	for (const i of [...zoneCards(g, 'player', r), ...zoneCards(g, 'reach', r), ...zoneCards(g, 'along'), ...attachments(g, R.roleUid)]) {
		if (i.exhausted) continue
		const kw = P(g, i.uid).keywords.find((k) => k.startsWith('Fatiguing')) ?? /^Fatiguing( \d+)?/.exec((card(i.id).text || '').replace(/<[^>]+>/g, ''))?.[0]
		if (!kw) continue
		const n = Number(kw.split(' ')[1] ?? presence(g, i.uid))
		sufferFatigue(g, r, n, `${nameOf(g, i.uid)} (fatiguing)`)
	}
	g.lastTurn = r
	if (g.endAfterTurn && !g.ended) endDay(g, g.endAfterTurn)
	if (!g.ended && g.rangers.every((x) => x.rested)) startTravelPhase(g)
	return null
}

// ---------------------------------------------------------------- travel

export function canTravel(g: Game): string | null {
	const loc = g.inst[g.location]
	const t = threshold(g, g.location, 'prog')
	if (t === null) return `${nameOf(g, g.location)} has no progress threshold; a card or the campaign guide tells you when you can leave.`
	if (typeof t === 'number' && loc.progress < t) return `${nameOf(g, g.location)} needs ${t} progress to travel (has ${loc.progress}).`
	const ob = inPlay(g).find((i) => !i.exhausted && has(g, i.uid, 'Obstacle'))
	if (ob) return `${nameOf(g, ob.uid)} (obstacle) prevents travel.`
	return null
}
function startTravelPhase(g: Game) {
	g.phase = 'travel'
	g.acting = null
	if (canTravel(g)) {
		log(g, `All Rangers have rested. ${canTravel(g)}`)
		refresh(g)
		return
	}
	g.queue.push({ kind: 'travel' })
	log(g, 'All Rangers have rested. Travel phase.')
}
/** Every copy of a set in every pack in play (expansions add cards to The Valley, General, Lone Tree Station…). */
export function setAll(g: Game, name: string): string[] {
	const packs = g.packs ?? ['Core']
	const all = (n: string) => packs.flatMap((p) => setCards(p, n))
	const out = all(name)
	return out.length ? out : all(name.replace(/^The /, '')).length ? all(name.replace(/^The /, '')) : all(`The ${name}`)
}
const PDA_SETS: Record<string, string> = { Othrwoods: 'The Othrwoods', Otherwoods: 'The Othrwoods' }
export function buildPathDeck(g: Game, locId: string, terrain: string) {
	const loc = card(locId)
	const pda = loc.pda ?? ''
	let m: RegExpMatchArray | null
	const t2 = (m = pda.match(/Use the (\w[\w-]*) terrain/i)) ? m[1].toLowerCase().replace(/-/g, '_') : terrain
	const terrainSet = TERRAINS[t2]
	const cards: string[] = terrainSet ? setAll(g, terrainSet) : []
	const notes: string[] = []
	g.decks = {}
	if (loc.pivotal) {
		const own = setAll(g, PDA_SETS[loc.name] ?? loc.name)
		// "Do not add the Spire set to the path deck. Shuffle it separately … This is the Spire deck."
		if ((m = pda.match(/Do not add the ([\w' -]+?) set to the path deck\. Shuffle it separately.*?This is the ([\w' -]+?) deck/i))) {
			g.decks[m[2]] = shuffle(own, g.rng)
			notes.push(`${m[2]} deck`)
		} else cards.push(...own)
	} else if (!/Do not add cards from the Valley set/i.test(pda)) {
		const valley = shuffle(setAll(g, 'The Valley'), g.rng)
		const must = pda.match(/1 of the 3 cards added from the Valley set must be ([\w' -]+?)\./i)?.[1]
		const forced = must ? valley.find((id) => card(id).name.toLowerCase() === must.toLowerCase()) : undefined
		const pick = forced ? [forced, ...valley.filter((id) => id !== forced).slice(0, 2)] : valley.slice(0, 3)
		cards.push(...pick)
	}
	// "Search the General set for a Backalley Shortcut and shuffle it into the path deck."
	for (const mm of pda.matchAll(/Search the ([\w' -]+?) set for an? ([\w' -]+?)(?: and (\d+) ([\w' -]+?))?,? and (?:shuffle it into|add them to) the path deck/gi)) {
		const set = setAll(g, mm[1])
		const want: [string, number][] = [[mm[2], 1], ...(mm[3] ? ([[mm[4], Number(mm[3])]] as [string, number][]) : [])]
		for (const [nm, n] of want) {
			const k = nm.toLowerCase().replace(/s$/, '')
			const found = set.filter((id) => card(id).name.toLowerCase().replace(/s$/, '') === k).slice(0, n)
			cards.push(...found)
		}
	}
	// "Add 3 random cards from the Woods set to the path deck."
	for (const mm of pda.matchAll(/Add (\d+) random cards from the ([\w' -]+?) set to the path deck/gi)) cards.push(...shuffle(setAll(g, mm[2]), g.rng).slice(0, Number(mm[1])))
	// "Do not add X and Y to the path deck. Shuffle them together with 6 random cards from the Ravine set and 6 … This is the Otherworld deck."
	if ((m = pda.match(/Do not add (.+?) to the path deck\. Shuffle them together with (.+?), then set them next to the path deck\. This is the ([\w' -]+?) deck/i))) {
		const names = m[1].split(/,\s*| and /).map((x) => x.trim().toLowerCase())
		const side: string[] = []
		for (const nm of names) {
			const k = cards.findIndex((id) => card(id).name.toLowerCase() === nm)
			if (k >= 0) side.push(...cards.splice(k, 1))
		}
		for (const mm of m[2].matchAll(/(\d+) random cards from the ([\w' -]+?) set(?: \(other than ([^)]+)\))?/gi)) {
			const not = (mm[3] ?? '').toLowerCase()
			side.push(...shuffle(setAll(g, mm[2]).filter((id) => !not.includes(card(id).name.toLowerCase())), g.rng).slice(0, Number(mm[1])))
		}
		g.decks[m[3]] = shuffle(side, g.rng)
		notes.push(`${m[3]} deck`)
	}
	// "Shuffle the Grassland, Lakeshore, and Old-Growth sets together and set them next to the path deck. This is the detritus deck."
	if ((m = pda.match(/Shuffle the (.+?) sets together and set them next to the path deck\. This is the ([\w' -]+?) deck/i))) {
		const sets = m[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean)
		g.decks[m[2]] = shuffle(sets.flatMap((x) => setAll(g, x)), g.rng)
		notes.push(`${m[2]} deck`)
	}
	if (pda && /effigies/i.test(pda)) g.queue.push({ kind: 'manual', title: loc.name, text: `Path deck assembly: ${pda} Attach any effigies you have recorded with the card tools.`, ranger: g.lead })
	g.pathDeck = shuffle(cards, g.rng)
	g.pathDiscard = []
	log(g, `Path deck: ${terrainSet ?? t2} set${loc.pivotal ? ` + ${loc.name} set` : /Do not add cards from the Valley set/i.test(pda) ? '' : ' + 3 Valley cards'} (${g.pathDeck.length} cards)${notes.length ? `; ${notes.join(', ')} beside it` : ''}.`)
}
function arrive(g: Game, locId: string) {
	const c = card(locId)
	const pB = parsedOf(locId, 'B')
	const pb = pB.arrival.length || pB.guide ? pB : parsedOf(locId, 'A')
	if (pb.guide) g.queue.push({ kind: 'guide', entry: pb.guide, why: `Arriving at ${c.name}`, pack: c.pack })
	let who = g.lead
	let first = true
	for (const a of pb.arrival) {
		if (a.who === 'next') {
			who = (who + 1) % nRangers(g)
			if (who === g.lead && !first) continue
		}
		if (a.who) first = false
		const rangers = a.who === 'each' ? g.rangers.map((_, k) => k) : [a.who ? who : g.lead]
		for (const r of rangers) addJob(g, { title: `Arrival at ${c.name}`, eff: a.effect, src: g.location, ranger: r })
	}
}
function travel(g: Game, to: string, camp: boolean): string | null {
	if (g.phase !== 'travel') return 'You can only travel in the travel phase.'
	const why = canTravel(g)
	if (why) return why
	const from = card(g.inst[g.location].id)
	const link = from.links?.find((l) => l.to === to)
	if (!link) return `${card(to).name} isn't connected to ${from.name}.`
	if (link.path === 'river' && !inPlay(g).some((i) => /travel on river paths/i.test(card(i.id).text || ''))) return 'You cannot travel along river paths yet.'
	for (const i of Object.values(g.inst)) {
		if (!g.inst[i.uid]) continue
		if (i.kind === 'role' || i.kind === 'weather' || i.kind === 'mission' || i.kind === 'location') continue
		if (i.zone === 'player') continue
		if (i.attachedTo != null) {
			const host = g.inst[i.attachedTo]
			if (host && (host.kind === 'role' || host.zone === 'player' || host.kind === 'mission' || host.kind === 'weather')) continue
			if (host && has(g, host.uid, 'Persistent')) continue
		}
		if (has(g, i.uid, 'Persistent')) continue
		removeInst(g, i.uid, i.kind === 'path' ? 'collection' : 'discard')
	}
	g.queue.shift()
	delete g.inst[g.location]
	g.location = addInst(g, to, 'surroundings', null, 'location')
	g.terrain = link.path
	log(g, `The Rangers travel along the ${TERRAINS[link.path] ?? link.path} path to ${card(to).name}.`)
	if (camp) {
		endDay(g, `You make camp at ${card(to).name}.`, true)
		return null
	}
	fire(g, { e: 'travel', ranger: g.lead })
	buildPathDeck(g, to, link.path)
	arrive(g, to)
	fire(g, { e: 'arrive', ranger: g.lead })
	refresh(g)
	return null
}

// ---------------------------------------------------------------- refresh and rounds

function refresh(g: Game) {
	if (g.ended) return
	g.phase = 'refresh'
	log(g, `— Refresh (end of round ${g.round}) —`)
	for (let r = 0; r < nRangers(g) && !g.ended; r++) {
		const R = g.rangers[r]
		if (R.injuries) sufferFatigue(g, r, R.injuries, 'injuries')
		if (g.ended) break
		if (!drawRanger(g, r, 1)) break
		for (const a of ASPECTS) R.energy[a] = R.aspects[a]
	}
	if (g.ended) return
	for (const i of Object.values(g.inst)) {
		if (i.attachedTo != null && /attached to this \w+ do not ready/i.test(card(g.inst[i.attachedTo]?.id ?? i.id).text || '')) continue
		if (i.exhausted && /This gear does not ready during the refresh phase/i.test(flat(i.id))) continue
		if (i.exhausted) {
			// "Use 1 hum: When the attached being would ready, it remains exhausted." (Hush Little Critter, Slow Time)
			const hold = attachments(g, i.uid).find((a) => /Use 1 \w+: When the attached (?:card|being|predator) would ready, it remains exhausted/i.test(flat(a.id)) && a.tokens > 0)
			if (hold) {
				hold.tokens--
				log(g, `${nameOf(g, hold.uid)} keeps ${nameOf(g, i.uid)} exhausted.`)
				if (/If its presence is 2 or more, the Ranger who played this attachment suffers 1 fatigue/i.test(flat(hold.id)) && presence(g, i.uid) >= 2 && hold.deckOf != null) sufferFatigue(g, hold.deckOf, 1, nameOf(g, hold.uid))
				continue
			}
			const drop = attachments(g, i.uid).find((a) => /When the attached being readies, discard this attachment/i.test(flat(a.id)))
			if (drop) removeInst(g, drop.uid, 'discard')
		}
		i.exhausted = false
	}
	for (const R of g.rangers) {
		if (R.spiritspeak) log(g, `${R.name} stops spiritspeaking.`)
		R.spiritspeak = false
		R.spiritOnce = false
	}
	for (const u of [...g.weather, g.location, ...g.missions, ...inPlay(g).filter((i) => i.zone !== 'surroundings').map((i) => i.uid)]) {
		if (!g.inst[u]) continue
		const rf = P(g, u).refresh
		if (rf) addJob(g, { title: `${nameOf(g, u)} (refresh)`, eff: rf, src: u, ranger: g.lead })
	}
	addJob(g, SYS('newRound', g.lead))
}
function newRound(g: Game) {
	if (g.ended) return
	g.round++
	g.phase = 'path'
	g.lastTurn = null
	for (const R of g.rangers) R.rested = false
	log(g, `— Round ${g.round}: path cards —`)
	const extra = g.extraPath ?? 0
	g.extraPath = 0
	for (let k = 0; k < nRangers(g) && !g.ended; k++) drawPathCard(g, (g.lead + k) % nRangers(g))
	for (let k = 0; k < extra && !g.ended; k++) drawPathCard(g, g.lead)
	if (!g.ended) g.phase = 'turns'
}

function settle(g: Game) {
	for (let k = 0; k < 50; k++) {
		checkClears(g)
		runJobs(g)
		if (g.ended) {
			g.queue = [{ kind: 'dayOver', reason: g.ended.reason }]
			return
		}
		if (g.queue.length || g.jobs.length) return
		if (g.phase === 'setup') {
			g.round = 0
			newRound(g)
			continue
		}
		return
	}
}

// ---------------------------------------------------------------- new day

export interface DaySetup {
	seed: number
	day: number
	rangers: { name: string; role: string; aspect: string; deck: string[] }[]
	location: string
	terrain: string
	weather: string
	weatherSide?: 'A' | 'B'
	missions: { id: string; side?: 'A' | 'B' }[]
	rewards?: string[]
	lead?: number
	/** Expansions in play (pack codes): their path cards join the Valley, General and terrain sets. */
	packs?: string[]
}
export function newDay(s: DaySetup): Game {
	const g: Game = {
		v: 1,
		rng: { seed: s.seed },
		day: s.day,
		rangers: [],
		inst: {},
		next: 1,
		pathDeck: [],
		pathDiscard: [],
		challenge: [],
		challengeDiscard: [],
		round: 0,
		phase: 'setup',
		lead: s.lead ?? 0,
		lastTurn: null,
		acting: null,
		location: 0,
		terrain: s.terrain,
		weather: [],
		missions: [],
		queue: [],
		log: [],
		rewards: s.rewards ?? [],
		lingering: [],
		jobs: [],
		lastTest: null,
		packs: ['Core', ...(s.packs ?? []).filter((p) => p !== 'Core')],
	}
	s.rangers.forEach((rs, r) => {
		const aspects = card(rs.aspect).aspects!
		const R: Ranger = {
			name: rs.name,
			role: rs.role,
			roleUid: 0,
			aspectCard: rs.aspect,
			aspects: { ...aspects },
			deck: shuffle(rs.deck, g.rng),
			hand: [],
			discard: [],
			fatigue: [],
			energy: { ...aspects },
			injuries: 0,
			rested: false,
			token: null,
			deckList: rs.deck.slice(),
		}
		g.rangers.push(R)
		R.roleUid = addInst(g, rs.role, 'player', r, 'role')
		R.hand = R.deck.splice(0, 6)
		for (const id of R.hand.slice())
			if (/When you draw this card, attach it to your role/i.test(card(id).text || '')) {
				R.hand.splice(R.hand.indexOf(id), 1)
				const uid = addInst(g, id, 'attached', r, 'ranger')
				g.inst[uid].attachedTo = R.roleUid
				g.inst[uid].deckOf = r
				if (R.deck.length) R.hand.push(R.deck.shift()!)
			}
	})
	g.challenge = shuffle(CHALLENGE.map((_, k) => k), g.rng)
	g.location = addInst(g, s.location, 'surroundings', null, 'location')
	g.weather = [addInst(g, s.weather, 'surroundings', null, 'weather', s.weatherSide ?? 'A')]
	for (const m of s.missions) g.missions.push(addInst(g, m.id, 'surroundings', null, 'mission', m.side ?? 'A'))
	log(g, `Day ${s.day} begins at ${card(s.location).name}. Weather: ${card(s.weather).name}.`)
	buildPathDeck(g, s.location, s.terrain)
	g.rangers.forEach((_, r) => g.queue.push({ kind: 'mulligan', ranger: r }))
	return g
}
function afterMulligans(g: Game) {
	arrive(g, g.inst[g.location].id)
	for (const u of g.weather) for (const a of P(g, u).arrival) addJob(g, { title: `${nameOf(g, u)}: setup`, eff: a.effect, src: u, ranger: g.lead })
	for (const u of [...g.weather, ...g.missions]) {
		const sd = P(g, u).startOfDay
		if (sd) addJob(g, { title: `${nameOf(g, u)}: start of day`, eff: sd, src: u, ranger: g.lead })
	}
}

// ---------------------------------------------------------------- manual fixes

function manual(g: Game, m: ManualOp): string | null {
	switch (m.op) {
		case 'tokens': {
			const i = g.inst[m.uid]
			if (!i) return 'Gone.'
			i[m.what] = Math.max(0, i[m.what] + m.delta)
			log(g, `(by hand) ${nameOf(g, m.uid)}: ${m.what} ${m.delta > 0 ? '+' : ''}${m.delta}.`)
			return null
		}
		case 'exhaust':
			g.inst[m.uid].exhausted = !g.inst[m.uid].exhausted
			log(g, `(by hand) ${nameOf(g, m.uid)} ${g.inst[m.uid].exhausted ? 'exhausted' : 'readied'}.`)
			return null
		case 'ready':
			g.inst[m.uid].exhausted = false
			return null
		case 'move':
			moveCard(g, m.uid, m.zone, m.owner ?? g.acting ?? g.lead)
			return null
		case 'discard':
			discardCard(g, m.uid)
			return null
		case 'flip':
			flip(g, m.uid)
			return null
		case 'attach': {
			const i = g.inst[m.uid]
			i.attachedTo = m.to
			i.zone = 'attached'
			i.faceDown = !!m.faceDown
			log(g, `${nameOf(g, m.uid)} is attached to ${nameOf(g, m.to)}.`)
			return null
		}
		case 'toHand': {
			const i = g.inst[m.uid]
			if (i.kind !== 'ranger') return 'Only Ranger cards go back to a hand.'
			log(g, `${nameOf(g, m.uid)} returns to hand.`)
			removeInst(g, m.uid, 'hand')
			return null
		}
		case 'shuffleIn': {
			const i = g.inst[m.uid]
			if (i.kind !== 'path') return 'Only path cards go into the path deck.'
			log(g, `${nameOf(g, m.uid)} is shuffled into the path deck.`)
			removeInst(g, m.uid, 'shuffle')
			return null
		}
		case 'rangerToken':
			g.rangers[m.ranger].token = m.to
			log(g, `${rangerName(g, m.ranger)}'s Ranger token moves to ${m.to == null ? 'their role' : nameOf(g, m.to)}.`)
			return null
		case 'fatigue':
			sufferFatigue(g, m.ranger, m.n)
			return null
		case 'soothe':
			soothe(g, m.ranger, m.n)
			return null
		case 'injure':
			injure(g, m.ranger, m.n)
			return null
		case 'heal':
			heal(g, m.ranger, m.n)
			return null
		case 'drawRanger':
			drawRanger(g, m.ranger, m.n)
			return null
		case 'drawPath':
			for (let k = 0; k < m.n; k++) drawPathCard(g, m.ranger)
			return null
		case 'scoutPath':
			g.queue.unshift({ kind: 'scout', ranger: m.ranger, deck: 'path', cards: g.pathDeck.slice(0, m.n) })
			return null
		case 'scoutRanger':
			g.queue.unshift({ kind: 'scout', ranger: m.ranger, deck: 'ranger', cards: g.rangers[m.ranger].deck.slice(0, m.n) })
			return null
		case 'energy': {
			const R = g.rangers[m.ranger]
			R.energy[m.aspect] = Math.max(0, R.energy[m.aspect] + m.delta)
			return null
		}
		case 'discardHand': {
			const R = g.rangers[m.ranger]
			const [id] = R.hand.splice(m.index, 1)
			if (id) {
				R.discard.push(id)
				log(g, `${R.name} discards ${card(id).name}.`)
			}
			return null
		}
		case 'search': {
			const R = g.rangers[m.ranger]
			const take = (arr: string[]) => {
				const k = arr.indexOf(m.id)
				if (k < 0) return false
				arr.splice(k, 1)
				return true
			}
			const c = card(m.id)
			let ok = true
			if (m.from === 'pathDeck') ok = take(g.pathDeck)
			else if (m.from === 'pathDiscard') ok = take(g.pathDiscard)
			else if (m.from === 'rangerDeck') ok = take(R.deck)
			else if (m.from === 'rangerDiscard') ok = take(R.discard)
			if (!ok) return `${c.name} isn't there.`
			if (m.from === 'pathDeck') g.pathDeck = shuffle(g.pathDeck, g.rng)
			if (m.from === 'rangerDeck') R.deck = shuffle(R.deck, g.rng)
			const isPath = c.back === 'path'
			if (m.place === 'hand') R.hand.push(m.id)
			else if (m.place === 'discard') (isPath ? g.pathDiscard : R.discard).push(m.id)
			else if (m.place === 'shuffle') g.pathDeck = shuffle([...g.pathDeck, m.id], g.rng)
			else if (m.place === 'top') g.pathDeck.unshift(m.id)
			else if (isPath) putPathInPlay(g, m.id, m.ranger, 'finds', m.place === 'along' ? 'along' : m.place === 'reach' ? 'reach' : undefined)
			else {
				const uid = addInst(g, m.id, c.type === 'Gear' ? 'player' : 'reach', m.ranger, 'ranger')
				g.inst[uid].deckOf = m.ranger
			}
			log(g, `${R.name} finds ${c.name}.`)
			return null
		}
		case 'mission': {
			const uid = addInst(g, m.id, 'surroundings', null, 'mission', m.side ?? 'A')
			g.missions.push(uid)
			log(g, `New mission: ${card(m.id).name}.`)
			return null
		}
		case 'removeMission':
			g.missions = g.missions.filter((u) => u !== m.uid)
			log(g, `Mission complete: ${nameOf(g, m.uid)}.`)
			delete g.inst[m.uid]
			return null
		case 'weather': {
			for (const u of g.weather) delete g.inst[u]
			g.weather = [addInst(g, m.id, 'surroundings', null, 'weather')]
			log(g, `Weather: ${card(m.id).name}.`)
			return null
		}
		case 'note':
			log(g, m.text)
			return null
	}
}

// ---------------------------------------------------------------- apply

export class RuleError extends Error {}
const KINDS = ['pickHand', 'mulligan', 'test', 'choose', 'ask', 'manual', 'aspect', 'guide', 'scout', 'equip', 'travel', 'dayOver']
/** Older saves: drop prompts this version doesn't know. */
export function migrate(g: Game) {
	g.jobs ??= []
	g.lastTest ??= null
	g.queue = g.queue.filter((p) => KINDS.includes(p.kind))
}
export function apply(state: Game, it: Intent): Game {
	const g = clone(state)
	migrate(g)
	const err = step(g, it)
	if (err) throw new RuleError(err)
	settle(g)
	return g
}
export function tryApply(state: Game, it: Intent): { g: Game; err: string | null } {
	try {
		return { g: apply(state, it), err: null }
	} catch (e) {
		if (e instanceof RuleError) return { g: state, err: e.message }
		throw e
	}
}

function step(g: Game, it: Intent): string | null {
	if (g.ended && it.t !== 'manual') return 'The day is over.'
	const head = g.queue[0]
	switch (it.t) {
		case 'keep': {
			if (head?.kind !== 'mulligan' || head.ranger !== it.ranger) return 'Not now.'
			const R = g.rangers[it.ranger]
			if (it.mulligan?.length) {
				const idx = [...new Set(it.mulligan)].sort((a, b) => b - a)
				const aside = idx.map((k) => R.hand.splice(k, 1)[0]).filter(Boolean)
				R.hand.push(...R.deck.splice(0, aside.length))
				R.deck = shuffle([...R.deck, ...aside], g.rng)
				log(g, `${R.name} mulligans ${aside.length} card${aside.length === 1 ? '' : 's'}.`)
			}
			if (it.setup) {
				const k = R.deck.indexOf(it.setup)
				if (k >= 0) {
					R.deck.splice(k, 1)
					R.deck = shuffle(R.deck, g.rng)
					const c = card(it.setup)
					const uid = addInst(g, it.setup, c.type === 'Gear' ? 'player' : 'reach', it.ranger, 'ranger')
					g.inst[uid].deckOf = it.ranger
					log(g, `${R.name} puts ${c.name} into play (setup).`)
				}
			}
			g.queue.shift()
			if (!g.queue.some((p) => p.kind === 'mulligan')) afterMulligans(g)
			return null
		}
		case 'test':
			return startTest(g, it)
		case 'commit':
			return commit(g, it)
		case 'cancelTest': {
			if (head?.kind !== 'test') return 'No test.'
			if (head.fatigued) return 'You already suffered fatigue for this test; commit at least 1 energy.'
			g.queue.shift()
			g.acting = null
			return null
		}
		case 'choose': {
			if (head?.kind !== 'choose') return 'Nothing to choose.'
			if (it.uids.length < head.min || it.uids.length > head.max || it.uids.some((u) => !head.options.includes(u))) return `Choose ${head.min === head.max ? head.min : `${head.min}–${head.max}`}.`
			const job = g.jobs[0]
			if (job) job.picks[head.key] = it.uids
			g.queue.shift()
			return null
		}
		case 'pickHand': {
			if (head?.kind !== 'pickHand') return 'Nothing to pick.'
			if (it.index == null ? !head.optional : !head.options.includes(it.index)) return 'Pick one of those cards.'
			if (g.jobs[0]) g.jobs[0].picks[head.key] = [it.index ?? -1]
			g.queue.shift()
			return null
		}
		case 'answer': {
			if (head?.kind !== 'ask') return 'No question.'
			if (g.jobs[0]) g.jobs[0].asked = it.yes
			g.queue.shift()
			return null
		}
		case 'aspect': {
			if (head?.kind !== 'aspect') return 'Nothing to choose.'
			const k = ASPECTS.indexOf(it.a)
			if (!head.options.includes(it.a)) return 'Not that one.'
			if (g.jobs[0]) g.jobs[0].picks[head.key] = [k]
			g.queue.shift()
			return null
		}
		case 'manualDone':
			if (head?.kind !== 'manual') return 'Nothing to do.'
			g.queue.shift()
			return null
		case 'guideRead':
			if (head?.kind !== 'guide') return 'No entry to read.'
			g.queue.shift()
			return null
		case 'scouted': {
			if (head?.kind !== 'scout') return 'Nothing to scout.'
			const deck = head.deck === 'path' ? g.pathDeck : head.deck.startsWith('side:') ? (sideDeck(g, head.deck.slice(5)) ?? g.pathDeck) : g.rangers[head.ranger].deck
			deck.splice(0, head.cards.length)
			deck.unshift(...it.top)
			deck.push(...it.bottom)
			log(g, `${rangerName(g, head.ranger)} scouts ${head.cards.length} ${head.deck} card${head.cards.length === 1 ? '' : 's'}.`)
			g.queue.shift()
			if (head.drawAfter) drawRanger(g, head.ranger, head.drawAfter)
			return null
		}
		case 'play':
			return play(g, it)
		case 'ability':
			return ability(g, it)
		case 'rest':
			return rest(g, it.ranger)
		case 'travel':
			return travel(g, it.to, it.camp)
		case 'stay':
			if (head?.kind !== 'travel') return 'Not the travel phase.'
			g.queue.shift()
			log(g, 'The Rangers stay where they are.')
			refresh(g)
			return null
		case 'endDay':
			endDay(g, it.reason, false)
			return null
		case 'manual':
			if (head?.kind === 'equip' && it.op.op === 'discard') {
				const r = head.ranger
				const e = manual(g, it.op)
				if (equipUsed(g, r) <= 5) g.queue.shift()
				return e
			}
			return manual(g, it.op)
	}
}

export { CARDS }
