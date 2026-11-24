// The Earthborne Rangers rules engine: one day of play. Pure: apply() clones the state.
// Rules source: the Earthborne Rangers rulebook (core set). Card text overrides rules.
import { ASPECTS, card, CARDS, CHALLENGE, setCards, TERRAINS, type Aspect, type CardDef } from '../data/data'
import { shuffle } from './rng'
import { amountValue, clause as clauseOf, COMMON_TESTS, parse, type Action, type Clause, type Parsed, type Sym } from './text'
import type { Game, Inst, Intent, ManualOp, Prompt, Ranger, ResolveItem } from './types'

// ---------------------------------------------------------------- card helpers

const parsedCache = new Map<string, Parsed>()
export function parsedOf(id: string, side: 'A' | 'B' = 'A'): Parsed {
	const k = id + side
	let p = parsedCache.get(k)
	if (!p) {
		const c = card(id)
		p = parse(side === 'B' && c.B ? c.B.text : c.text)
		parsedCache.set(k, p)
	}
	return p
}
export const P = (g: Game, uid: number) => parsedOf(g.inst[uid].id, g.inst[uid].side)
export const def = (g: Game, uid: number): CardDef => card(g.inst[uid].id)
export function nameOf(g: Game, uid: number): string {
	const i = g.inst[uid]
	const c = card(i.id)
	return i.side === 'B' && c.B ? c.B.name : c.name
}
export function traitsOf(g: Game, uid: number): string {
	const i = g.inst[uid]
	const c = card(i.id)
	return ((i.side === 'B' && c.B?.traits) || c.traits || '').toLowerCase()
}
export function typeOf(g: Game, uid: number): string {
	const i = g.inst[uid]
	const c = card(i.id)
	return (i.side === 'B' && c.B?.type) || c.type
}
export function presence(g: Game, uid: number): number {
	const i = g.inst[uid]
	const c = card(i.id)
	const p = i.side === 'B' && c.B?.presence != null ? c.B.presence : c.presence
	if (typeof p === 'number') return p
	if (p === 'X' && /number of \[harm\]/.test(c.text || '')) return i.harm
	return 0
}
export function keywords(g: Game, uid: number): string[] {
	return P(g, uid).keywords.map((k) => k.split(' ')[0])
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
const rangerName = (g: Game, r: number) => g.rangers[r].name
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

export function sufferFatigue(g: Game, r: number, n: number, why = '') {
	if (n <= 0 || g.ended) return
	const R = g.rangers[r]
	if (R.deck.length < n) {
		R.fatigue.push(...R.deck.splice(0))
		endDay(g, `${R.name} is too fatigued to go on${why ? ` (${why})` : ''}.`)
		return
	}
	R.fatigue.push(...R.deck.splice(0, n))
	log(g, `${R.name} suffers ${n} fatigue${why ? ` from ${why}` : ''}.`)
}
export function soothe(g: Game, r: number, n: number) {
	const R = g.rangers[r]
	const k = Math.min(n, R.fatigue.length)
	if (!k) return
	// the fatigue stack's top is the last card added
	R.hand.push(...R.fatigue.splice(R.fatigue.length - k, k))
	log(g, `${R.name} soothes ${k} fatigue.`)
}
export function injure(g: Game, r: number, n = 1) {
	const R = g.rangers[r]
	for (let k = 0; k < n; k++) {
		R.injuries++
		R.discard.push(...R.fatigue.splice(0))
		log(g, `${R.name} suffers an injury (${R.injuries}).`)
		if (R.injuries >= 3 && !g.lingering.includes(r)) {
			g.lingering.push(r)
			g.endAfterTurn = `${R.name} suffered a third injury.`
		}
	}
}
export function heal(g: Game, r: number, n = 1) {
	const R = g.rangers[r]
	R.injuries = Math.max(0, R.injuries - n)
	log(g, `${R.name} heals ${n} injur${n > 1 ? 'ies' : 'y'}.`)
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
		// Lingering Injury: "When you draw this card, attach it to your role."
		if (/attach it to your role/i.test(card(c).text || '') && /When you draw this card/i.test(card(c).text || '')) {
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
	g.queue = [{ kind: 'dayOver', reason }]
	log(g, `The day ends: ${reason}`)
}

// ---------------------------------------------------------------- path cards

function drawPathCard(g: Game, r: number, why = 'draws') {
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
export function putPathInPlay(g: Game, id: string, r: number, why = 'draws', area?: 'reach' | 'along') {
	const c = card(id)
	const zone = area ?? c.area ?? 'along'
	const uid = addInst(g, id, zone === 'reach' ? 'reach' : 'along', zone === 'reach' ? r : null, 'path')
	log(g, `${rangerName(g, r)} ${why} ${c.name} (${zone === 'reach' ? 'within reach' : 'along the way'}).`)
	const p = parsedOf(id)
	if (p.guide) g.queue.push({ kind: 'guide', entry: p.guide, why: `${c.name} entered play` })
	// Ambush: entering play within reach fatigues that Ranger.
	if (zone === 'reach' && p.keywords.includes('Ambush')) sufferFatigue(g, r, presence(g, uid), `${c.name} (ambush)`)
	// "When this … enters play, …"
	const enters = p.other.find((l) => /when this [a-z]+ enters play/i.test(l))
	if (enters) {
		const text = enters.replace(/^.*?when this [a-z]+ enters play,?\s*/i, '')
		pushResolve(g, `${c.name} enters play`, r, 0, [item(g, uid, c.name, text)], 'none')
	}
}

function item(_g: Game, src: number | null, title: string, textOrClause: string | Clause): ResolveItem {
	const clause: Clause = typeof textOrClause === 'string' ? clauseOf(textOrClause) : textOrClause
	return { src, title, clause, auto: false, done: clause.actions.map(() => false) }
}

function pushResolve(g: Game, title: string, ranger: number, effort: number, items: ResolveItem[], after: 'test' | 'play' | 'refresh' | 'none', front = false) {
	const pr: Prompt = { kind: 'resolve', title, ranger, effort, items, after }
	if (front) g.queue.unshift(pr)
	else g.queue.push(pr)
}

// ---------------------------------------------------------------- interacting

/** Cards between Ranger r and the card they interact with (rulebook: Fatigue from Interacting). */
export function between(g: Game, r: number, target: number | null): number[] {
	if (target == null) return []
	const t = g.inst[target]
	const tz = t.attachedTo != null ? g.inst[t.attachedTo] ?? t : t
	const mine = zoneCards(g, 'reach', r).map((i) => i.uid)
	const roleAttached = attachments(g, g.rangers[r].roleUid).map((i) => i.uid)
	let out: number[] = []
	if (tz.zone === 'reach' && tz.owner === r) out = []
	else if (tz.zone === 'reach') out = mine
	else if (tz.zone === 'along') out = mine
	else if (tz.zone === 'surroundings') out = [...mine, ...zoneCards(g, 'along').map((i) => i.uid)]
	else out = []
	if (tz.zone !== 'player') out = [...out, ...roleAttached.filter((u) => u !== target)]
	return out.filter((u) => u !== target && u !== tz.uid && !g.inst[u].exhausted && !g.inst[u].faceDown)
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
	const ready = (i: Inst) => !i.exhausted && !i.faceDown
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
	// faceup attachments on those cards count too
	const withAtt: Inst[] = []
	for (const i of list) {
		withAtt.push(i)
		for (const a of attachments(g, i.uid)) if (!a.faceDown && a.kind !== 'ranger') withAtt.push(a)
	}
	return [...new Set(withAtt.filter((i) => ready(i) || i.kind === 'weather' || i.kind === 'mission' || i.kind === 'location').map((i) => i.uid))]
}

// ---------------------------------------------------------------- turn order

export function canTakeTurn(g: Game, r: number): string | null {
	if (g.phase !== 'turns') return 'It is not the Ranger turns phase.'
	if (g.queue.length) return 'Finish the current step first.'
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
/** Every test Ranger r can perform right now (common tests + tests on cards in play). */
export function availableTests(g: Game, r: number): TestChoice[] {
	const out: TestChoice[] = COMMON_TESTS.map((t) => ({ src: null, test: t.key, name: t.name, aspect: t.aspect, approach: t.approach, diff: t.diff, needsTarget: t.targets || null }))
	for (const i of inPlay(g)) {
		if (i.zone === 'player' && i.owner !== r) continue
		if (i.zone === 'attached' && i.attachedTo != null && g.inst[i.attachedTo]?.zone === 'player' && g.inst[i.attachedTo]?.owner !== r) continue
		P(g, i.uid).tests.forEach((t, k) => out.push({ src: i.uid, test: k, name: t.name, aspect: t.aspect, approach: t.approach, diff: t.diff, needsTarget: null }))
	}
	return out
}
export function commonTargetOk(g: Game, key: string, uid: number): boolean {
	const ty = typeOf(g, uid)
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
		const t = COMMON_TESTS.find((x) => x.key === it.test)
		if (!t) return 'Unknown test.'
		;({ aspect, approach, name, diff } = t)
		if (t.targets && target == null) return `Choose a ${t.targets} first.`
		if (t.targets && !commonTargetOk(g, t.key, target!)) return `${name} needs a ${t.targets}.`
	} else {
		if (it.src == null || !g.inst[it.src]) return 'That card is no longer in play.'
		const t = P(g, it.src).tests[it.test]
		if (!t) return 'Unknown test.'
		;({ aspect, approach, name, diff } = t)
		const srcInst = g.inst[it.src]
		// Tests on your own gear interact with what they affect; on path cards, with that card.
		if (target == null && srcInst.zone !== 'player') target = it.src
		if (t.use && g.inst[it.src].tokens < t.use) return `${nameOf(g, it.src)} has no tokens left to use.`
	}
	if (g.rangers[r].energy[aspect] < 1) return `${rangerName(g, r)} needs at least 1 ${aspect} energy.`
	const ob = blockedBy(g, r, target)
	if (ob != null) return `${nameOf(g, ob)} (obstacle) is in the way.`
	const err = beginTurn(g, r, it.useRole)
	if (err) return err
	if (typeof it.test === 'number' && it.src != null) {
		const t = P(g, it.src).tests[it.test]
		if (t.use) g.inst[it.src].tokens -= t.use
	}
	const x = target != null ? Math.max(1, presence(g, target)) : 1
	log(g, `${rangerName(g, r)} performs ${name}${target != null ? ` on ${nameOf(g, target)}` : ''}.`)
	const fatigued = interactFatigue(g, r, target)
	if (g.ended) return null
	g.queue.unshift({ kind: 'test', ranger: r, src: it.src, test: it.test, target, aspect, approach, name, diff: diff === 'X' ? x : diff, fatigued })
	return null
}

/** Effort from other Rangers' tokens on the card you interact with. */
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
	if (it.energy < 1 || it.energy > R.energy[pr.aspect]) return `Commit between 1 and ${R.energy[pr.aspect]} ${pr.aspect} energy.`
	R.energy[pr.aspect] -= it.energy
	let icons = 0
	const idx = [...new Set(it.discards)].sort((a, b) => b - a)
	const committed: string[] = []
	for (const h of idx) {
		const id = R.hand[h]
		if (!id) continue
		icons += card(id).icons?.[pr.approach as keyof CardDef['icons'] & string] ?? 0
		R.hand.splice(h, 1)
		R.discard.push(id)
		committed.push(card(id).name)
	}
	const tok = tokenEffort(g, r, pr.target)
	const base = it.energy + icons + tok + (it.extra || 0)
	const ci = drawChallenge(g)
	const ch = CHALLENGE[ci]
	const mod = ch[pr.aspect]
	const effort = Math.max(0, base + mod)
	const diff = it.diff ?? pr.diff
	const success = effort >= diff
	g.queue.shift()
	log(
		g,
		`${R.name} commits ${it.energy} energy${icons ? ` + ${icons} icon${icons > 1 ? 's' : ''} (${committed.join(', ')})` : ''}${tok ? ` + ${tok} from Ranger tokens` : ''}${it.extra ? ` + ${it.extra}` : ''}; challenge ${mod >= 0 ? '+' : ''}${mod} ${ch.symbol} → effort ${effort} vs ${diff}: ${success ? 'success' : 'failure'}.`,
	)

	const items: ResolveItem[] = []
	const presenceOfTarget = pr.target != null && g.inst[pr.target] ? presence(g, pr.target) : 0
	// Success / failure effects
	if (typeof pr.test === 'string') {
		common(g, pr.test, r, pr.target, effort, success)
		const ct = COMMON_TESTS.find((x) => x.key === pr.test)!
		const what =
			pr.test === 'traverse'
				? success
					? `${effort} progress added to ${pr.target != null && g.inst[pr.target] ? nameOf(g, pr.target) : 'the card'}.`
					: `${rangerName(g, r)} suffers 1 injury.`
				: pr.test === 'connect'
					? success
						? `${effort} progress added to ${pr.target != null && g.inst[pr.target] ? nameOf(g, pr.target) : 'the being'}.`
						: 'Nothing happens.'
					: pr.test === 'avoid'
						? success
							? `${pr.target != null && g.inst[pr.target] ? nameOf(g, pr.target) : 'The being'} is exhausted.`
							: 'Nothing happens.'
						: success
							? `Scout ${effort} Ranger cards, then draw 1.`
							: 'Nothing happens.'
		items.push({ src: null, title: `${ct.name} — ${success ? 'success' : 'failure'}`, clause: { text: what, actions: [], complete: true }, auto: true, done: [] })
	} else if (pr.src != null && g.inst[pr.src]) {
		const t = P(g, pr.src).tests[pr.test]
		const name = `${nameOf(g, pr.src)}: ${t.name}`
		if (success) items.push(autoOrItem(g, pr.src, `${name} — success`, t.effect, r, effort, presenceOfTarget))
		else if (t.fail) items.push(autoOrItem(g, pr.src, `${name} — failure`, t.fail, r, effort, presenceOfTarget))
		if (t.always) items.push(autoOrItem(g, pr.src, name, t.always, r, effort, presenceOfTarget))
	}
	// Challenge effects on active cards
	if (!g.ended) {
		for (const u of activeCards(g, r, pr.target)) {
			const cl = P(g, u).challenge[ch.symbol]
			if (!cl) continue
			items.push(autoOrItem(g, u, `${nameOf(g, u)} ${SYM_LABEL[ch.symbol]}`, cl, r, effort, presence(g, u)))
		}
	}
	const result = { effort, diff, success, challenge: ci, mod, base, symbol: ch.symbol }
	// Fully automatic items stay in the list (marked done) so the player sees what happened.
	g.queue.unshift({ kind: 'resolve', title: pr.name, ranger: r, effort, items, result, after: 'test' })
	return null
}
export const SYM_LABEL: Record<Sym, string> = { sun: '☀ sun', mountain: '⛰ mountain', crest: '⚜ crest' }

/** Applies a clause automatically when the game understood all of it and it needs no choice. */
function autoOrItem(g: Game, src: number, title: string, cl: Clause, r: number, effort: number, pres: number): ResolveItem {
	const it: ResolveItem = { src, title, clause: cl, auto: false, done: cl.actions.map(() => false) }
	const deterministic = cl.actions.every((a) => !('to' in a) || a.to === 'self' || a.to === 'location' || a.to === 'role')
	if (cl.complete && cl.actions.length && deterministic) {
		for (let k = 0; k < cl.actions.length; k++) {
			const a = cl.actions[k]
			// "Discard 1 rain from this card. ⏩ …": only go on if there was rain to discard.
			if (cl.pre && k < cl.pre && a.kind === 'tokens' && !a.add && src != null && g.inst[src] && g.inst[src].tokens < amountValue(a.amount, effort, pres)) {
				log(g, `${nameOf(g, src)}: nothing to discard, so the rest doesn't happen.`)
				break
			}
			doAction(g, a, src, r, effort, pres, null)
			it.done[k] = true
		}
		it.auto = true
	} else if (cl.lead) {
		// Do the plain sentences at the start; leave the rest to the player.
		for (let k = 0; k < cl.lead; k++) {
			const a = cl.actions[k]
			if ('to' in a && a.to !== 'self' && a.to !== 'location' && a.to !== 'role') break
			doAction(g, a, src, r, effort, pres, null)
			it.done[k] = true
		}
	}
	return it
}

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
	} else if (key === 'remember') {
		if (success) {
			const R = g.rangers[r]
			if (effort > 0 && R.deck.length) g.queue.push({ kind: 'scout', ranger: r, deck: 'ranger', cards: R.deck.slice(0, effort), drawAfter: 1 })
			else drawRanger(g, r, 1)
		}
	}
}

function addTokens(g: Game, uid: number, what: 'progress' | 'harm', n: number) {
	const i = g.inst[uid]
	if (!i || n <= 0) return
	// "You can add a maximum of 1[progress] per test to this feature."
	if (what === 'progress' && /maximum of 1\[progress\] per test/i.test(card(i.id).text || '')) n = Math.min(n, 1)
	i[what] += n
	log(g, `${n} ${what} added to ${nameOf(g, uid)}.`)
}

/** Does one understood action. `target` is the card the player picked for "choose" actions. */
export function doAction(g: Game, a: Action, src: number | null, r: number, effort: number, pres: number, target: number | null, who?: number) {
	const amt = (x: { amount: Parameters<typeof amountValue>[0] }) => amountValue(x.amount, effort, pres)
	const self = src
	const rr = who ?? r
	switch (a.kind) {
		case 'progress':
		case 'harm': {
			const to = a.to === 'location' ? g.location : a.to === 'self' ? self : target
			if (to != null) addTokens(g, to, a.kind, amt(a))
			break
		}
		case 'removeProgress':
		case 'removeHarm': {
			const to = a.to === 'location' ? g.location : self
			if (to != null && g.inst[to]) {
				const k = a.kind === 'removeProgress' ? 'progress' : 'harm'
				g.inst[to][k] = Math.max(0, g.inst[to][k] - amt(a))
			}
			break
		}
		case 'exhaust':
		case 'ready': {
			const to = a.to === 'role' ? g.rangers[rr].roleUid : a.to === 'self' ? self : target
			if (to != null && g.inst[to]) {
				g.inst[to].exhausted = a.kind === 'exhaust'
				log(g, `${nameOf(g, to)} is ${a.kind === 'exhaust' ? 'exhausted' : 'readied'}.`)
			}
			break
		}
		case 'discard': {
			const to = a.to === 'self' ? self : target
			if (to != null && g.inst[to]) discardCard(g, to)
			break
		}
		case 'flip': {
			const to = a.to === 'self' ? self : target
			if (to != null && g.inst[to]) flip(g, to)
			break
		}
		case 'move': {
			const to = a.to === 'self' ? self : target
			if (to != null && g.inst[to]) moveCard(g, to, a.area ?? (g.inst[to].zone === 'reach' ? 'along' : 'reach'), rr)
			break
		}
		case 'fatigue':
			if (a.who === 'each') g.rangers.forEach((_, k) => sufferFatigue(g, k, amt(a)))
			else sufferFatigue(g, rr, amt(a))
			break
		case 'injury':
			if (a.who === 'each') g.rangers.forEach((_, k) => injure(g, k, amt(a)))
			else injure(g, rr, amt(a))
			break
		case 'soothe':
			soothe(g, rr, amt(a))
			break
		case 'heal':
			heal(g, rr, amt(a))
			break
		case 'drawRanger':
			drawRanger(g, rr, amt(a))
			break
		case 'drawPath':
			for (let k = 0; k < amt(a); k++) drawPathCard(g, rr)
			break
		case 'scoutPath': {
			const n = amt(a)
			if (n > 0) g.queue.splice(1, 0, { kind: 'scout', ranger: rr, deck: 'path', cards: g.pathDeck.slice(0, n) })
			break
		}
		case 'scoutRanger': {
			const n = amt(a)
			if (n > 0) g.queue.splice(1, 0, { kind: 'scout', ranger: rr, deck: 'ranger', cards: g.rangers[rr].deck.slice(0, n) })
			break
		}
		case 'selfFatigues':
			if (self != null && g.inst[self] && !g.inst[self].exhausted) sufferFatigue(g, rr, presence(g, self), nameOf(g, self))
			break
		case 'tokens':
			if (self != null && g.inst[self]) g.inst[self].tokens = Math.max(0, g.inst[self].tokens + (a.add ? 1 : -1) * amt(a))
			break
		case 'rangerToken':
			g.rangers[rr].token = a.to === 'self' ? self : null
			log(g, `${rangerName(g, rr)} moves their Ranger token${a.to === 'self' && self != null ? ` to ${nameOf(g, self)}` : ' to their role'}.`)
			break
		case 'guide':
			g.queue.splice(1, 0, { kind: 'guide', entry: a.entry, why: src != null && g.inst[src] ? nameOf(g, src) : 'card effect' })
			break
		case 'searchSet': {
			const pool = setCards('Core', a.set.replace(/^the /i, 'The ')).concat(setCards('Core', a.set))
			const want = a.name.toLowerCase().replace(/s$/, '')
			const id = pool.find((x) => card(x).name.toLowerCase().includes(want)) ?? pool.find((x) => (card(x).traits ?? '').toLowerCase().includes(want))
			if (!id) {
				log(g, `No ${a.name} found in the ${a.set} set.`)
				break
			}
			if (a.then === 'shuffle') {
				g.pathDeck = shuffle([...g.pathDeck, id], g.rng)
				log(g, `${card(id).name} is shuffled into the path deck.`)
			} else putPathInPlay(g, id, rr, 'finds')
			break
		}
		case 'flipIf': {
			const i = self != null ? g.inst[self] : null
			if (i && (a.min == null || i.tokens >= a.min) && (a.max == null || i.tokens <= a.max)) flip(g, i.uid)
			break
		}
		case 'searchPath': {
			const want = a.what.toLowerCase().replace(/s$/, '')
			const k = g.pathDeck.findIndex((id) => {
				const c = card(id)
				return (c.traits ?? '').toLowerCase().includes(want) || c.type.toLowerCase() === want || c.name.toLowerCase().includes(want)
			})
			if (k < 0) {
				log(g, `No ${a.what} in the path deck.`)
				break
			}
			const [id] = g.pathDeck.splice(k, 1)
			g.pathDeck = shuffle(g.pathDeck, g.rng)
			if (a.then === 'discard') {
				g.pathDiscard.push(id)
				log(g, `${card(id).name} is found in the path deck and discarded.`)
			} else putPathInPlay(g, id, rr, 'finds')
			break
		}
	}
}

// ---------------------------------------------------------------- moving cards

function discardCard(g: Game, uid: number) {
	const i = g.inst[uid]
	if (!i) return
	if (i.kind === 'mission' || i.kind === 'weather' || i.kind === 'location' || i.kind === 'role') {
		log(g, `${nameOf(g, uid)} stays in the surroundings.`)
		return
	}
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
function moveCard(g: Game, uid: number, zone: 'along' | 'reach' | 'surroundings' | 'player', owner: number) {
	const i = g.inst[uid]
	i.zone = zone
	i.owner = zone === 'reach' || zone === 'player' ? owner : null
	i.attachedTo = null
	log(g, `${nameOf(g, uid)} moves ${zone === 'reach' ? `within reach of ${rangerName(g, owner)}` : zone === 'along' ? 'along the way' : zone}.`)
	if (zone === 'reach' && has(g, uid, 'Ambush') && !i.exhausted) sufferFatigue(g, owner, presence(g, uid), `${nameOf(g, uid)} (ambush)`)
}

// ---------------------------------------------------------------- clearing

/** Cards whose progress / harm / Ranger tokens reached their threshold. */
function checkClears(g: Game) {
	if (g.ended) return
	for (const i of Object.values(g.inst)) {
		if (i.faceDown || i.kind === 'location' || i.kind === 'mission' || i.kind === 'weather' || i.kind === 'role') continue
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
		if (eff) {
			const it = item(g, null, `${name} clears`, eff.effect)
			g.queue.push({ kind: 'resolve', title: `${name} clears`, ranger: r, effort: 0, items: [it], after: 'none' })
			for (const a of eff.effect.actions) if (a.kind === 'guide') it.done[eff.effect.actions.indexOf(a)] = false
		}
		removeInst(g, i.uid, 'discard')
	}
}

// ---------------------------------------------------------------- playing cards

export function costOf(id: string): number | 'X' {
	const c = card(id)
	return c.cost === 'X' ? 'X' : typeof c.cost === 'number' ? c.cost : 0
}
export function equipUsed(g: Game, r: number) {
	return zoneCards(g, 'player', r).reduce((s, i) => s + (card(i.id).equip ?? 0), 0)
}

function play(g: Game, it: Extract<Intent, { t: 'play' }>): string | null {
	const r = it.ranger
	const R = g.rangers[r]
	const id = R.hand[it.hand]
	if (!id) return 'No such card.'
	const c = card(id)
	if (c.type === 'Attribute') return 'Attributes can only be committed to tests.'
	const isManifest = (c.kw ?? []).includes('Manifestation') || /\bManifestation\b/.test(c.text?.split('\n')[0] ?? '')
	let conduit: Inst | undefined
	if (isManifest) {
		conduit = zoneCards(g, 'player', r).find((i) => /\bConduit\b/.test(card(i.id).text?.split('\n')[0] ?? '') && i.tokens > 0)
		if (!conduit) return 'A manifestation needs a token on one of your equipped conduits.'
	}
	const cost = costOf(id) === 'X' ? (it.x ?? 0) : (costOf(id) as number)
	const aspect = c.aspect ?? 'AWA'
	if (R.energy[aspect] < cost) return `${c.name} costs ${cost} ${aspect} energy.`
	if (c.type === 'Attachment' && it.target == null) return 'Choose the card to attach it to.'
	// Response moments can be played on other Rangers' turns; everything else takes a turn.
	const isResponse = /^\s*(<b>)?Response:/i.test(c.text || '')
	if (!isResponse || g.phase === 'turns') {
		if (!(isResponse && g.acting != null)) {
			const err = beginTurn(g, r, it.useRole)
			if (err && !isResponse) return err
		}
	}
	R.energy[aspect] -= cost
	if (conduit) conduit.tokens--
	R.hand.splice(it.hand, 1)
	log(g, `${R.name} plays ${c.name}${cost ? ` (${cost} ${aspect})` : ''}.`)
	if (c.type === 'Moment') {
		R.discard.push(id)
		const p = parsedOf(id)
		const lines = [...p.other, ...p.tests.map((t) => t.raw)]
		const items = lines.map((l) => item(g, null, c.name, l.replace(/^Response:\s*[^,]*,\s*/i, '')))
		pushResolve(g, c.name, r, 0, items, 'play', true)
	} else if (c.type === 'Gear') {
		// Unique: a second copy replaces the first.
		if (/\bUnique\b/.test(c.text?.split('\n')[0] ?? '')) for (const o of zoneCards(g, 'player', r)) if (o.id === id) removeInst(g, o.uid, 'discard')
		const uid = addInst(g, id, 'player', r, 'ranger')
		g.inst[uid].deckOf = r
		if (equipUsed(g, r) > 5) g.queue.unshift({ kind: 'equip', ranger: r })
	} else if (c.type === 'Attachment') {
		const uid = addInst(g, id, 'attached', null, 'ranger')
		g.inst[uid].deckOf = r
		g.inst[uid].attachedTo = it.target!
		g.inst[uid].owner = g.inst[it.target!]?.owner ?? null
		log(g, `${c.name} is attached to ${nameOf(g, it.target!)}.`)
	} else if (c.type === 'Being' || c.type === 'Feature') {
		if (/\bUnique\b/.test(c.text?.split('\n')[0] ?? '')) for (const o of Object.values(g.inst)) if (o.id === id && o.deckOf === r) removeInst(g, o.uid, 'discard')
		const uid = addInst(g, id, 'reach', r, 'ranger')
		g.inst[uid].deckOf = r
	} else {
		R.discard.push(id)
	}
	if (c.type !== 'Moment') endTurnIfIdle(g, r)
	return null
}
function endTurnIfIdle(g: Game, r: number) {
	if (g.acting === r && !g.queue.some((p) => p.kind === 'resolve' || p.kind === 'test')) endTurn(g, r)
}

function ability(g: Game, it: Extract<Intent, { t: 'ability' }>): string | null {
	const i = g.inst[it.uid]
	if (!i) return 'That card is gone.'
	const line = P(g, it.uid).other[it.line]
	if (!line) return 'No such ability.'
	const flat = line.replace(/<[^>]+>/g, '')
	const ex = flat.match(/^Exhaust(?: \(use (\d+) [^)]*\))?:\s*(.*)$/i)
	if (ex) {
		if (i.exhausted) return `${nameOf(g, it.uid)} is already exhausted.`
		if (ex[1] && i.tokens < Number(ex[1])) return `${nameOf(g, it.uid)} has no tokens left.`
		i.exhausted = true
		if (ex[1]) i.tokens -= Number(ex[1])
		log(g, `${rangerName(g, it.ranger)} exhausts ${nameOf(g, it.uid)}.`)
		pushResolve(g, nameOf(g, it.uid), it.ranger, 0, [item(g, it.uid, nameOf(g, it.uid), ex[2])], 'none', true)
		return null
	}
	pushResolve(g, nameOf(g, it.uid), it.ranger, 0, [item(g, it.uid, nameOf(g, it.uid), line)], 'none', true)
	return null
}

function rest(g: Game, r: number): string | null {
	if (g.phase !== 'turns') return 'You can only rest during Ranger turns.'
	if (g.queue.length) return 'Finish the current step first.'
	const R = g.rangers[r]
	if (R.rested) return `${R.name} has already rested.`
	R.rested = true
	log(g, `${R.name} rests.`)
	// Fatiguing: ready cards in your player area, within reach or along the way fatigue you.
	for (const i of [...zoneCards(g, 'player', r), ...zoneCards(g, 'reach', r), ...zoneCards(g, 'along'), ...attachments(g, R.roleUid)]) {
		if (i.exhausted) continue
		const kw = P(g, i.uid).keywords.find((k) => k.startsWith('Fatiguing')) ?? (/^Fatiguing( \d+)?/.exec((card(i.id).text || '').replace(/<[^>]+>/g, ''))?.[0])
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
	g.queue.push({ kind: 'travel' })
	log(g, 'All Rangers have rested. Travel phase.')
}
export function buildPathDeck(g: Game, locId: string, terrain: string) {
	const loc = card(locId)
	const pack = 'Core'
	const terrainSet = TERRAINS[terrain]
	const cards: string[] = terrainSet ? setCards(pack, terrainSet) : []
	if (loc.pivotal) {
		const set = loc.name.replace(/^The /, '')
		const own = setCards(pack, loc.name).length ? setCards(pack, loc.name) : setCards(pack, set)
		cards.push(...own)
	} else {
		cards.push(...shuffle(setCards(pack, 'The Valley'), g.rng).slice(0, 3))
	}
	g.pathDeck = shuffle(cards, g.rng)
	g.pathDiscard = []
	log(g, `Path deck: ${terrainSet ?? terrain} set${loc.pivotal ? ` + ${loc.name} set` : ' + 3 Valley cards'} (${g.pathDeck.length} cards).`)
}
function arrive(g: Game, locId: string) {
	const c = card(locId)
	const pb = parsedOf(locId, 'B')
	if (pb.guide) g.queue.push({ kind: 'guide', entry: pb.guide, why: `Arriving at ${c.name}` })
	const lines = pb.arrival
	if (lines.length) {
		const items: ResolveItem[] = []
		let who = g.lead
		for (const l of lines) {
			const m = l.replace(/<[^>]+>/g, '').match(/^(Lead Ranger|Next Ranger|Each Ranger):\s*(.*)$/i)
			if (m) {
				if (/^Next/i.test(m[1])) who = (who + 1) % nRangers(g)
				if (/^Next/i.test(m[1]) && who === g.lead) continue // each Ranger already resolved one
				const title = /^Each/i.test(m[1]) ? 'Each Ranger' : rangerName(g, who)
				const it = item(g, g.location, `Arrival: ${title}`, m[2])
				;(it as ResolveItem & { who?: number }).who = /^Each/i.test(m[1]) ? undefined : who
				items.push(it)
			} else items.push(item(g, g.location, 'Arrival setup', l))
		}
		g.queue.push({ kind: 'resolve', title: `Arrival setup: ${c.name}`, ranger: g.lead, effort: 0, items, after: 'none' })
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
	// Clear play area (persistent cards stay).
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
	const old = g.location
	delete g.inst[old]
	g.location = addInst(g, to, 'surroundings', null, 'location')
	g.terrain = link.path
	log(g, `The Rangers travel along the ${TERRAINS[link.path] ?? link.path} path to ${card(to).name}.`)
	if (camp) {
		endDay(g, `You make camp at ${card(to).name}.`, true)
		return null
	}
	buildPathDeck(g, to, link.path)
	arrive(g, to)
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
		// Biomelds etc: "Beings attached to this being do not ready."
		if (i.attachedTo != null && /attached to this \w+ do not ready/i.test(card(g.inst[i.attachedTo]?.id ?? i.id).text || '')) continue
		i.exhausted = false
	}
	// "Refresh:" effects on weather, location and missions
	const items: ResolveItem[] = []
	for (const u of [...g.weather, g.location, ...g.missions, ...inPlay(g).filter((i) => i.zone !== 'surroundings').map((i) => i.uid)]) {
		if (!g.inst[u]) continue
		const rf = P(g, u).refresh
		if (rf) items.push(autoOrItem(g, u, `${nameOf(g, u)} (refresh)`, rf, g.lead, 0, presence(g, u)))
	}
	const manual = items.filter((x) => !x.auto)
	if (manual.length || items.length) g.queue.push({ kind: 'resolve', title: 'Refresh', ranger: g.lead, effort: 0, items, after: 'refresh' })
	else newRound(g)
}
function newRound(g: Game) {
	if (g.ended) return
	g.round++
	g.phase = 'path'
	g.lastTurn = null
	for (const R of g.rangers) R.rested = false
	log(g, `— Round ${g.round}: path cards —`)
	for (let k = 0; k < nRangers(g) && !g.ended; k++) drawPathCard(g, (g.lead + k) % nRangers(g))
	if (!g.ended) g.phase = 'turns'
}

/** Called whenever the queue empties: moves the day forward. */
function settle(g: Game) {
	checkClears(g)
	if (g.ended) {
		g.queue = [{ kind: 'dayOver', reason: g.ended.reason }]
		return
	}
	if (g.queue.length) return
	if (g.phase === 'setup') {
		// setup finished (mulligans, arrival): first round starts with path cards
		g.round = 0
		newRound(g)
		checkClears(g)
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
		// Lingering Injury cards start attached? No: they're shuffled in and attach when drawn.
		R.hand = R.deck.splice(0, 6)
		for (const id of R.hand.slice()) if (/When you draw this card, attach it to your role/i.test(card(id).text || '')) {
			R.hand.splice(R.hand.indexOf(id), 1)
			const uid = addInst(g, id, 'attached', r, 'ranger')
			g.inst[uid].attachedTo = R.roleUid
			g.inst[uid].deckOf = r
			if (R.deck.length) R.hand.push(R.deck.shift()!)
		}
	})
	g.challenge = shuffle(CHALLENGE.map((_, k) => k), g.rng)
	g.location = addInst(g, s.location, 'surroundings', null, 'location')
	const w = addInst(g, s.weather, 'surroundings', null, 'weather', s.weatherSide ?? 'A')
	g.weather = [w]
	for (const m of s.missions) g.missions.push(addInst(g, m.id, 'surroundings', null, 'mission', m.side ?? 'A'))
	log(g, `Day ${s.day} begins at ${card(s.location).name}. Weather: ${card(s.weather).name}.`)
	buildPathDeck(g, s.location, s.terrain)
	// Rangers look at their hands first (mulligan / setup cards), then arrival setup.
	g.rangers.forEach((_, r) => g.queue.push({ kind: 'mulligan', ranger: r }))
	return g
}
function afterMulligans(g: Game) {
	arrive(g, g.inst[g.location].id)
	// Weather "Arrival Setup:" (e.g. Howling Winds adds a Cerberusian Cyclone)
	for (const u of g.weather) {
		const lines = P(g, u).arrival
		if (lines.length) g.queue.push({ kind: 'resolve', title: `${nameOf(g, u)}: setup`, ranger: g.lead, effort: 0, items: lines.map((l) => autoOrItem(g, u, nameOf(g, u), clauseOf(l), g.lead, 0, 0)), after: 'none' })
	}
	// "Start of Day" on weather and missions
	for (const u of [...g.weather, ...g.missions]) {
		const sd = P(g, u).startOfDay
		if (sd) g.queue.push({ kind: 'resolve', title: `${nameOf(g, u)}: start of day`, ranger: g.lead, effort: 0, items: [item(g, u, nameOf(g, u), sd)], after: 'none' })
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
			if (m.faceDown) {
				i.progress = 0
				i.harm = 0
			}
			log(g, `${nameOf(g, m.uid)} is attached ${m.faceDown ? 'facedown ' : ''}to ${nameOf(g, m.to)}.`)
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

export function apply(state: Game, it: Intent): Game {
	const g = clone(state)
	const err = step(g, it)
	if (err) throw new RuleError(err)
	settle(g)
	return g
}
export class RuleError extends Error {}
/** Like apply(), but returns the error message instead of throwing. */
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
			// undo the turn start
			return null
		}
		case 'act': {
			if (head?.kind !== 'resolve') return 'Nothing to resolve.'
			const itm = head.items[it.item]
			const a = itm?.clause.actions[it.action]
			if (!a) return 'No such action.'
			const pres = itm.src != null && g.inst[itm.src] ? presence(g, itm.src) : 0
			const who = it.ranger ?? (itm as ResolveItem & { who?: number }).who ?? head.ranger
			doAction(g, a, itm.src, head.ranger, head.effort, pres, it.target ?? null, who)
			itm.done[it.action] = true
			return null
		}
		case 'resolved': {
			if (head?.kind !== 'resolve') return 'Nothing to resolve.'
			g.queue.shift()
			if (head.result) {
				const ch = CHALLENGE[head.result.challenge]
				if (ch.reshuffle) {
					g.challenge = shuffle([...g.challenge, ...g.challengeDiscard.splice(0)], g.rng)
					log(g, 'The challenge deck is reshuffled.')
				}
			}
			if (head.after === 'test' || head.after === 'play') {
				checkClears(g)
				if (!g.queue.some((p) => p.kind === 'resolve' || p.kind === 'test' || p.kind === 'scout')) endTurn(g, head.ranger)
				else g.acting = head.ranger
			}
			if (head.after === 'refresh') newRound(g)
			if (!g.queue.length && g.acting != null && g.phase === 'turns') endTurn(g, g.acting)
			return null
		}
		case 'guideRead':
			if (head?.kind !== 'guide') return 'No entry to read.'
			g.queue.shift()
			if (!g.queue.length && g.acting != null && g.phase === 'turns') endTurn(g, g.acting)
			return null
		case 'scouted': {
			if (head?.kind !== 'scout') return 'Nothing to scout.'
			const deck = head.deck === 'path' ? g.pathDeck : g.rangers[head.ranger].deck
			deck.splice(0, head.cards.length)
			deck.unshift(...it.top)
			deck.push(...it.bottom)
			log(g, `${rangerName(g, head.ranger)} scouts ${head.cards.length} ${head.deck} card${head.cards.length === 1 ? '' : 's'}.`)
			g.queue.shift()
			if (head.drawAfter) drawRanger(g, head.ranger, head.drawAfter)
			if (!g.queue.length && g.acting != null && g.phase === 'turns') endTurn(g, g.acting)
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
