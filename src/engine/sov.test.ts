// Stewards of the Valley: spirits, spiritspeaking, abilities that happen at a moment, aspirations.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { card, CARDS, PREBUILT } from '../data/data'
import { apply, availableTests, canTravel, commonTargetOk, equipUsed, newDay, testOptions, tryApply, zoneCards, type DaySetup } from './engine'
import type { Game, Inst } from './types'
import { finishDay, newCampaign } from '../campaign/campaign'

const ranger = (k: string, name: string) => ({ name, role: PREBUILT[k].role, aspect: PREBUILT[k].aspect, deck: PREBUILT[k].deck })
const setup = (seed = 7): DaySetup => ({ seed, day: 1, rangers: [ranger('UndauntedSeeker', 'Ash')], location: '01378', terrain: 'woods', weather: '01373', missions: [] })
function settle(g: Game): Game {
	for (let k = 0; k < 30 && g.queue.length && !g.ended; k++) {
		const h = g.queue[0]
		if (h.kind === 'mulligan') g = apply(g, { t: 'keep', ranger: h.ranger })
		else if (h.kind === 'guide') g = apply(g, { t: 'guideRead' })
		else if (h.kind === 'choose') g = apply(g, { t: 'choose', uids: h.options.slice(0, h.min) })
		else if (h.kind === 'ask') g = apply(g, { t: 'answer', yes: true })
		else if (h.kind === 'manual') g = apply(g, { t: 'manualDone' })
		else if (h.kind === 'aspect') g = apply(g, { t: 'aspect', a: h.options[0] })
		else if (h.kind === 'scout') g = apply(g, { t: 'scouted', top: h.cards, bottom: [] })
		else if (h.kind === 'pickHand') g = apply(g, { t: 'pickHand', index: h.options[0] })
		else break
	}
	return g
}
/** A clean table: no path cards, plenty of energy. */
function table(): Game {
	const g = structuredClone(settle(newDay(setup())))
	for (const i of Object.values(g.inst)) if (i.kind === 'path') delete g.inst[i.uid]
	g.rangers[0].energy = { AWA: 5, FIT: 5, FOC: 5, SPI: 5 }
	return g
}
function put(g: Game, id: string, zone: Inst['zone'], extra: Partial<Inst> = {}): number {
	const uid = g.next++
	g.inst[uid] = { uid, id, side: 'A', exhausted: false, progress: 0, harm: 0, tokens: card(id).tokens?.n ?? 0, zone, owner: 0, attachedTo: null, kind: 'ranger', deckOf: 0, ...extra }
	return uid
}
/** Commit to the test in progress, with a challenge card of known value on top. */
function commit(g: Game, energy: number, extras: string[] = []): Game {
	g = structuredClone(g)
	g.challenge.unshift(g.challenge.find((c) => !CHALLENGE_NEG(c)) ?? g.challenge[0])
	return apply(g, { t: 'commit', energy, discards: [], extra: 0, extras })
}
import { CHALLENGE } from '../data/data'
const CHALLENGE_NEG = (c: number) => CHALLENGE[c].AWA < 0 || CHALLENGE[c].FIT < 0 || CHALLENGE[c].FOC < 0 || CHALLENGE[c].SPI < 0

test('spiritspeaking swaps the common tests for the Spirit Speaker tests until the role readies', () => {
	let g = table()
	g.inst[g.rangers[0].roleUid].id = '03038' // Cartographer of Many Worlds: "Exhaust: Spend 1 energy to spiritspeak."
	g = apply(g, { t: 'ability', ranger: 0, uid: g.rangers[0].roleUid, line: 0 })
	g = settle(g)
	assert.ok(g.rangers[0].spiritspeak)
	const names = availableTests(g, 0).map((t) => t.name)
	assert.deepEqual(names.slice(0, 4), ['Influence', 'Awaken', 'Commune', 'Measure'])
	assert.match(tryApply(g, { t: 'test', ranger: 0, src: null, test: 'traverse', target: g.location }).err ?? '', /spiritspeaking/i)
	// the role readies at refresh: spiritspeaking ends
	for (const R of g.rangers) R.rested = false
	g = apply(g, { t: 'rest', ranger: 0 })
	g = settle(g)
	if (g.queue[0]?.kind === 'travel') g = settle(apply(g, { t: 'stay' }))
	assert.ok(!g.rangers[0].spiritspeak)
})

test('common tests cannot interact with spirits; Commune adds 2 progress per effort', () => {
	let g = table()
	const sp = put(g, '03051', 'reach') // Spirit of the Valley
	assert.equal(commonTargetOk(g, 'connect', sp), false)
	assert.equal(commonTargetOk(g, 'commune', sp), true)
	g.rangers[0].spiritspeak = true
	g = apply(g, { t: 'test', ranger: 0, src: null, test: 'commune', target: sp })
	g = commit(g, 2)
	if (g.lastTest!.success) assert.ok(g.inst[sp].progress >= 2 * g.lastTest!.effort)
})

test('an "After you succeed" gear ability is offered: Kinetic Power Generator adds a token to the attached tech', () => {
	let g = table()
	const tech = put(g, '01049', 'player') // a tech gear
	const kpg = put(g, '03006', 'attached', { attachedTo: tech })
	const before = g.inst[tech].tokens
	g = apply(g, { t: 'test', ranger: 0, src: null, test: 'traverse', target: g.location })
	g = commit(g, 4)
	assert.ok(g.lastTest!.success)
	assert.equal(g.queue[0]?.kind, 'ask')
	g = settle(apply(g, { t: 'answer', yes: true }))
	assert.equal(g.inst[tech].tokens, before + 1)
	assert.ok(g.inst[kpg].exhausted)
})

test('Spirit of the Silverfin can prevent an injury by discarding 3 progress', () => {
	let g = table()
	const sp = put(g, '03055', 'reach', { progress: 3 })
	g = apply(g, { t: 'test', ranger: 0, src: null, test: 'traverse', target: g.location })
	// fail on purpose: difficulty way up
	g = structuredClone(g)
	g = apply(g, { t: 'commit', energy: 1, discards: [], extra: 0, diff: 99 })
	assert.equal(g.lastTest!.success, false)
	assert.equal(g.queue[0]?.kind, 'ask')
	g = settle(apply(g, { t: 'answer', yes: true }))
	assert.equal(g.rangers[0].injuries, 0)
	assert.equal(g.inst[sp].progress, 0)
	assert.ok(g.inst[sp].exhausted)
})

test('without enough progress the spirit does not offer to prevent', () => {
	let g = table()
	put(g, '03055', 'reach', { progress: 1 })
	g = apply(g, { t: 'test', ranger: 0, src: null, test: 'traverse', target: g.location })
	g = apply(g, { t: 'commit', energy: 1, discards: [], extra: 0, diff: 99 })
	g = settle(g)
	assert.equal(g.rangers[0].injuries, 1)
})

test('Featherweight Gauzeweave reduces the equip value of the attached gear by 2', () => {
	const g = table()
	const gear = Object.values(CARDS).find((c) => c.type === 'Gear' && (c.equip ?? 0) >= 2)!
	const uid = put(g, gear.id, 'player')
	const before = equipUsed(g, 0)
	put(g, '03008', 'attached', { attachedTo: uid })
	assert.equal(equipUsed(g, 0), before - 2)
})

test('Deployed gear changes effort: Empathy Amplifier commits 1 effort to Connect', () => {
	let g = table()
	put(g, '03031', 'player')
	const b = put(g, '01269', 'reach', { kind: 'path', deckOf: undefined })
	g = apply(g, { t: 'test', ranger: 0, src: null, test: 'connect', target: b })
	const pr = g.queue[0] as Extract<Game['queue'][0], { kind: 'test' }>
	assert.deepEqual(testOptions(g, pr).mods.map((m) => m.effort), [1])
})

test('aspirations: records made in play count at the end of the day and unlock the personal reward', () => {
	let g = table()
	g.records = [{ ranger: 0, what: 'seed', n: 6 }]
	const c = newCampaign('T', [{ name: 'Ash', role: PREBUILT.UndauntedSeeker.role, aspect: PREBUILT.UndauntedSeeker.aspect, deck: [...PREBUILT.UndauntedSeeker.deck, '03016', '03016'], setAside: [] }])
	const n = finishDay(c, g)
	const a = n.aspirations!.find((x) => x.card === '03016')!
	assert.equal(a.marks, 6)
	assert.ok(a.done)
	assert.deepEqual(n.rangers[0].personal, ['03204']) // Brightfruit Tree
})

test('a random day with Stewards of the Valley decks plays out without crashing', () => {
	const sov = Object.values(CARDS).filter((c) => c.pack === 'SoV' && c.back === 'player' && !['Role', 'Aspect', 'Reference'].includes(c.type))
	for (let seed = 1; seed <= 40; seed++) {
		const deck = Array.from({ length: 15 }, (_, k) => sov[(seed * 7 + k * 13) % sov.length].id).flatMap((id) => [id, id])
		const roles = Object.values(CARDS).filter((c) => c.pack === 'SoV' && c.type === 'Role')
		let g = settle(newDay({ ...setup(seed), rangers: [{ name: 'Sil', role: roles[seed % roles.length].id, aspect: PREBUILT.UndauntedSeeker.aspect, deck }, ranger('VoiceoftheElders', 'Bryn')] }))
		for (let k = 0; k < 300 && !g.ended; k++) {
			const h = g.queue[0]
			if (h) {
				if (h.kind === 'test') {
					const opt = testOptions(g, h)
					g = apply(g, { t: 'commit', energy: 1, discards: [0], extra: 0, extras: opt.extras.slice(0, 1).map((x) => x.key) })
				} else if (h.kind === 'travel') g = apply(g, { t: 'stay' })
				else if (h.kind === 'equip') g = apply(g, { t: 'manual', op: { op: 'discard', uid: zoneCards(g, 'player', h.ranger).filter((i) => i.kind === 'ranger')[0].uid } })
				else if (h.kind === 'dayOver') break
				else g = settle(g)
				continue
			}
			const r = g.rangers.findIndex((x, i) => !x.rested && (g.lastTurn !== i || g.rangers.filter((y) => !y.rested).length === 1))
			if (r < 0) break
			const R = g.rangers[r]
			const choice = (seed + k) % 4
			if (choice === 0) {
				const tests = availableTests(g, r).filter((t) => R.energy[t.aspect] > 0)
				const t = tests[(seed * k) % Math.max(1, tests.length)]
				const target = t?.needsTarget ? (Object.values(g.inst).find((i) => commonTargetOk(g, String(t.test), i.uid))?.uid ?? null) : null
				const res = t ? tryApply(g, { t: 'test', ranger: r, src: t.src, test: t.test, target }) : { g, err: 'x' }
				g = res.err ? apply(g, { t: 'rest', ranger: r }) : res.g
			} else if (choice === 1 && R.hand.length) {
				const h = (seed + k) % R.hand.length
				const c = card(R.hand[h])
				const target = c.type === 'Attachment' ? (Object.values(g.inst).find((i) => i.kind === 'path' || i.kind === 'ranger')?.uid ?? null) : null
				const res = tryApply(g, { t: 'play', ranger: r, hand: h, target: target ?? undefined })
				g = res.err ? apply(g, { t: 'rest', ranger: r }) : res.g
			} else if (choice === 2) {
				const role = g.inst[R.roleUid]
				const res = role.exhausted ? { g, err: 'x' } : tryApply(g, { t: 'ability', ranger: r, uid: R.roleUid, line: 0 })
				g = res.err ? apply(g, { t: 'rest', ranger: r }) : res.g
			} else g = apply(g, { t: 'rest', ranger: r })
		}
		assert.ok(g.round >= 1)
	}
})
