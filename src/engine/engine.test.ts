import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PREBUILT, card, setCards } from '../data/data'
import { apply, availableTests, between, canTravel, newDay, tryApply, zoneCards, type DaySetup } from './engine'
import type { Game } from './types'
import { parse } from './text'

const ranger = (k: string, name: string) => ({ name, role: PREBUILT[k].role, aspect: PREBUILT[k].aspect, deck: PREBUILT[k].deck })
const setup = (n = 2, seed = 7): DaySetup => ({
	seed,
	day: 1,
	rangers: [ranger('UndauntedSeeker', 'Ash'), ranger('VoiceoftheElders', 'Bryn')].slice(0, n),
	location: '01378',
	terrain: 'woods',
	weather: '01373',
	missions: [],
})
export function through(g: Game): Game {
	// keep both hands, read guide entries, finish arrival
	for (let k = 0; k < 20 && g.queue.length && !g.ended; k++) {
		const h = g.queue[0]
		if (h.kind === 'mulligan') g = apply(g, { t: 'keep', ranger: h.ranger })
		else if (h.kind === 'guide') g = apply(g, { t: 'guideRead' })
		else if (h.kind === 'choose') g = apply(g, { t: 'choose', uids: h.options.slice(0, h.min) })
		else if (h.kind === 'ask') g = apply(g, { t: 'answer', yes: true })
		else if (h.kind === 'manual') g = apply(g, { t: 'manualDone' })
		else if (h.kind === 'aspect') g = apply(g, { t: 'aspect', a: h.options[0] })
		else if (h.kind === 'scout') g = apply(g, { t: 'scouted', top: h.cards, bottom: [] })
		else if (h.kind === 'pickHand') g = apply(g, { t: 'pickHand', index: h.optional ? null : h.options[0] })
		else break
	}
	return g
}

test('core sets have the rulebook sizes', () => {
	assert.equal(setCards('Core', 'Woods').length, 12)
	assert.equal(setCards('Core', 'The Valley').length, 14)
	assert.equal(setCards('Core', 'General').length, 15)
	assert.equal(setCards('Core', 'Lone Tree Station').length, 5)
})

test('a day starts: hands of 6, energy from aspects, path deck = terrain + location set', () => {
	const g = newDay(setup())
	assert.equal(g.rangers[0].hand.length, 6)
	assert.deepEqual(g.rangers[0].energy, card(PREBUILT.UndauntedSeeker.aspect).aspects)
	assert.equal(g.pathDeck.length, 12 + 5)
	assert.equal(g.queue[0].kind, 'mulligan')
})

test('after setup, round 1 draws one path card per Ranger and turns begin', () => {
	let g = through(newDay(setup()))
	assert.equal(g.round, 1)
	assert.equal(g.phase, 'turns')
	const drawn = Object.values(g.inst).filter((i) => i.kind === 'path').length
	assert.ok(drawn >= 2, `drew ${drawn}`)
})

test('Traverse on the location adds progress equal to effort; a test takes a turn', () => {
	let g = through(newDay(setup()))
	// clear anything within reach so nothing fatigues us
	for (const i of Object.values(g.inst)) if (i.kind === 'path') delete g.inst[i.uid]
	const before = g.rangers[0].energy.FIT
	g = apply(g, { t: 'test', ranger: 0, src: null, test: 'traverse', target: g.location })
	assert.equal(g.queue[0].kind, 'test')
	g = apply(g, { t: 'commit', energy: before, discards: [], extra: 0 })
	const r = g.lastTest!
	assert.ok(r)
	if (r.success) assert.ok(g.inst[g.location].progress >= r.effort)
	else assert.ok(g.rangers[0].injuries >= 1)
	g = through(g)
	assert.equal(g.lastTurn, 0)
	// Same Ranger again needs the role
	const t = tryApply(g, { t: 'test', ranger: 0, src: null, test: 'remember' })
	assert.match(t.err ?? '', /role/i)
})

test('cards within reach are between you and cards along the way', () => {
	let g = through(newDay(setup(1)))
	for (const i of Object.values(g.inst)) if (i.kind === 'path') delete g.inst[i.uid]
	g = structuredClone(g)
	const uidReach = g.next++
	g.inst[uidReach] = { uid: uidReach, id: '01269', side: 'A', exhausted: false, progress: 0, harm: 0, tokens: 0, zone: 'reach', owner: 0, attachedTo: null, kind: 'path' }
	const uidAlong = g.next++
	g.inst[uidAlong] = { uid: uidAlong, id: '01273', side: 'A', exhausted: false, progress: 0, harm: 0, tokens: 0, zone: 'along', owner: null, attachedTo: null, kind: 'path' }
	assert.deepEqual(between(g, 0, uidAlong), [uidReach])
	assert.deepEqual(between(g, 0, g.location).sort(), [uidReach, uidAlong].sort())
	// Shale Scree is an obstacle: can't traverse the location past it
	const t = tryApply(g, { t: 'test', ranger: 0, src: null, test: 'traverse', target: g.location })
	assert.match(t.err ?? '', /obstacle/)
	assert.match(canTravel(g) ?? '', /progress|obstacle/)
})

test('when every Ranger rests and you can\'t travel, a new round starts', () => {
	let g = through(newDay(setup()))
	g = apply(g, { t: 'rest', ranger: 0 })
	g = through(g)
	if (!g.ended) {
		g = apply(g, { t: 'rest', ranger: 1 })
		g = through(g)
	}
	if (g.ended) return
	// Not enough progress to travel: the round ends and a new one starts by itself.
	assert.equal(g.round, 2)
	assert.equal(g.phase, 'turns')
})

test('travel builds the new path deck from the terrain of the path taken', () => {
	let g = through(newDay(setup(1)))
	g = structuredClone(g)
	for (const i of Object.values(g.inst)) if (i.kind === 'path') delete g.inst[i.uid]
	g.inst[g.location].progress = 10
	g = apply(g, { t: 'rest', ranger: 0 })
	g = through(g)
	assert.equal(canTravel(g), null)
	g = apply(g, { t: 'travel', to: '01383', camp: false }) // Boulder Field, woods path
	assert.equal(card(g.inst[g.location].id).name, 'Boulder Field')
	assert.equal(g.terrain, 'woods')
})

test('the parser reads tests and challenge effects', () => {
	const p = parse(card('01269').text)
	assert.deepEqual(p.keywords, ['Ambush'])
	assert.ok(p.challenge.sun && p.challenge.crest)
	const q = parse(card('01273').text)
	assert.equal(q.tests[0].name, 'Scramble')
	assert.equal(q.tests[0].diff, 2)
	assert.ok(q.tests[0].fail)
})

test('a random day plays out without crashing', () => {
	for (let seed = 1; seed <= 60; seed++) {
		let g = through(newDay(setup(2, seed)))
		for (let k = 0; k < 300 && !g.ended; k++) {
			const h = g.queue[0]
			if (h) {
				if (h.kind === 'test') g = apply(g, { t: 'commit', energy: 1, discards: [0, 1], extra: 0, dodgeRole: true, boosts: [], responses: [0] })
				else if (h.kind === 'travel') {
					const links = card(g.inst[g.location].id).links!.filter((l) => l.path !== 'river')
					g = canTravel(g) == null ? apply(g, { t: 'travel', to: links[k % links.length].to, camp: k > 200 }) : apply(g, { t: 'stay' })
				} else if (h.kind === 'equip') g = apply(g, { t: 'manual', op: { op: 'discard', uid: zoneCards(g, 'player', h.ranger).filter((i) => i.kind === 'ranger')[0].uid } })
				else if (h.kind === 'dayOver') break
				else g = through(g)
				continue
			}
			const r = g.rangers.findIndex((x, i) => !x.rested && (g.lastTurn !== i || g.rangers.filter((y) => !y.rested).length === 1))
			if (r < 0) break
			const R = g.rangers[r]
			const tests = availableTests(g, r).filter((t) => R.energy[t.aspect] > 0)
			const choice = (seed + k) % 3
			if (choice === 0 && tests.length) {
				const t = tests[(seed * k) % tests.length]
				let target: number | null = null
				if (t.needsTarget) {
					const cand = Object.values(g.inst).filter((i) => i.kind === 'path' || i.kind === 'location')
					target = t.test === 'traverse' ? g.location : (cand.find((i) => card(i.id).type === 'Being')?.uid ?? null)
					if (target == null) {
						g = apply(g, { t: 'rest', ranger: r })
						continue
					}
				}
				const res = tryApply(g, { t: 'test', ranger: r, src: t.src, test: t.test, target })
				g = res.err ? apply(g, { t: 'rest', ranger: r }) : res.g
			} else if (choice === 1 && R.hand.length) {
				const h = R.hand.findIndex((id) => ['Gear', 'Being', 'Feature', 'Moment'].includes(card(id).type))
				const res = h >= 0 ? tryApply(g, { t: 'play', ranger: r, hand: h }) : { g, err: 'x' }
				g = res.err ? apply(g, { t: 'rest', ranger: r }) : res.g
			} else g = apply(g, { t: 'rest', ranger: r })
		}
		assert.ok(g.round >= 1)
		if (process.env.SHOW) console.log(seed, g.round, g.ended?.reason ?? g.phase, g.queue[0]?.kind)
	}
})

test('challenge effects run by themselves: Pouncing Atrox crest exhausts it and injures you', async () => {
	const { effect } = await import('./dsl')
	const e = effect('If you have 2 or more fatigue, exhaust this being. [conditional] Suffer 1 injury.')
	assert.deepEqual(e.cond, { c: 'youFatigue', min: 2 })
	assert.equal(e.pre[0].k, 'exhaust')
	assert.equal(e.steps[0].k, 'injury')
	const f = effect("If there is an active predator, exhaust it. [conditional] Add [harm] to this being equal to that predator's presence.")
	assert.equal(f.cond?.c, 'exists')
	assert.ok(f.auto)
})

test('Eagle Eye scouts 3 path cards then draws 1', () => {
	let g = through(newDay(setup(1)))
	g = structuredClone(g)
	g.rangers[0].hand.push('01001')
	g.rangers[0].energy.AWA = 3
	const deck = g.pathDeck.length
	g = apply(g, { t: 'play', ranger: 0, hand: g.rangers[0].hand.length - 1 })
	assert.equal(g.queue[0]?.kind, 'scout')
	const h = g.queue[0] as Extract<typeof g.queue[0], { kind: 'scout' }>
	assert.equal(h.cards.length, 3)
	g = apply(g, { t: 'scouted', top: h.cards, bottom: [] })
	assert.equal(g.pathDeck.length, deck - 1)
})

test('Vigilant counts AWA left in your pool as conflict icons', async () => {
	const { iconsFor } = await import('./engine')
	const g = newDay(setup(1))
	assert.equal(iconsFor(g, 0, '01094', 'conflict', { AWA: 2, FIT: 0, FOC: 0, SPI: 0 }), 2)
	assert.equal(iconsFor(g, 0, '01094', 'reason'), 0)
})
