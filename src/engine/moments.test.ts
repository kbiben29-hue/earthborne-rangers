// Moments on the Path / Moments in the Valley: path moments and group tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { card, CARDS, PREBUILT } from '../data/data'
import { apply, isPathMoment, newDay, parsedOf, tryApply, type DaySetup } from './engine'
import type { Game } from './types'

const ranger = (k: string, name: string) => ({ name, role: PREBUILT[k].role, aspect: PREBUILT[k].aspect, deck: PREBUILT[k].deck })
const byName = (n: string, pack: string) => Object.values(CARDS).find((c) => c.name === n && c.pack === pack)!.id
const setup = (packs: string[], seed = 5): DaySetup => ({ seed, day: 1, rangers: [ranger('UndauntedSeeker', 'Ash'), ranger('VoiceoftheElders', 'Bryn')], location: '01378', terrain: 'woods', weather: '01373', missions: [], packs })
function settle(g: Game): Game {
	for (let k = 0; k < 40 && g.queue.length && !g.ended; k++) {
		const h = g.queue[0]
		if (h.kind === 'mulligan') g = apply(g, { t: 'keep', ranger: h.ranger })
		else if (h.kind === 'guide') g = apply(g, { t: 'guideRead' })
		else if (h.kind === 'choose') g = apply(g, { t: 'choose', uids: h.options.slice(0, h.min) })
		else if (h.kind === 'manual') g = apply(g, { t: 'manualDone' })
		else if (h.kind === 'ask') g = apply(g, { t: 'answer', yes: true, pick: 0 })
		else if (h.kind === 'test' && h.mt != null) g = apply(g, { t: 'commit', energy: g.rangers[h.ranger].energy[h.aspect] ? 1 : 0, discards: [], extra: 0, others: g.rangers.map((_, k) => ({ ranger: k, energy: 1, discards: [] })) })
		else if (h.kind === 'aspect') g = apply(g, { t: 'aspect', a: h.options[0] })
		else if (h.kind === 'scout') g = apply(g, { t: 'scouted', top: h.cards, bottom: [] })
		else if (h.kind === 'pickHand') g = apply(g, { t: 'pickHand', index: h.optional ? null : h.options[0] })
		else break
	}
	return g
}
const moments = (g: Game) => [...g.pathDeck, ...g.pathDiscard, ...Object.values(g.inst).map((i) => i.id)].filter(isPathMoment)
/** Put a moment on top of the path deck and have Ranger 0 draw it. */
function draw(g: Game, id: string): Game {
	g = structuredClone(g)
	g.pathDeck.unshift(id)
	return apply(g, { t: 'manual', op: { op: 'drawPath', ranger: 0, n: 1 } })
}

test('Moments on the Path: one moment per Ranger is shuffled into the path deck', () => {
	const g = settle(newDay(setup(['MoP'])))
	assert.equal(moments(g).length, 2)
	assert.ok(moments(g).every((id) => card(id).set === 'Valley Moments'))
	assert.equal(moments(settle(newDay(setup([])))).length, 0)
})

test('every path moment reads into an effect', () => {
	for (const id of Object.keys(CARDS).filter(isPathMoment)) {
		const p = parsedOf(id, 'A', 2)
		assert.ok(p.moment && p.moment.steps.length > 0, card(id).name)
	}
})

test('Watch Your Feet: declining the test resolves its fail effect, then the moment is discarded', () => {
	let g = settle(newDay(setup([])))
	g.phase = 'turns'
	const inj = g.rangers[0].injuries
	g = draw(g, byName('Watch Your Feet', 'MoP'))
	assert.equal(g.queue[0]?.kind, 'ask')
	g = apply(g, { t: 'answer', yes: false })
	g = settle(g)
	assert.equal(g.rangers[0].injuries, inj + 1)
	assert.ok(g.pathDiscard.includes(byName('Watch Your Feet', 'MoP')))
	assert.ok(!Object.values(g.inst).some((i) => isPathMoment(i.id)))
})

test('The Valley’s Splendor: option B adds 1 progress per Ranger to the location', () => {
	let g = settle(newDay(setup([])))
	g.phase = 'turns'
	const before = g.inst[g.location].progress
	g = draw(g, byName("The Valley's Splendor", 'MoP'))
	const h = g.queue[0]
	assert.equal(h?.kind, 'ask')
	assert.equal(h.kind === 'ask' && h.options?.length, 2)
	g = apply(g, { t: 'answer', yes: false, pick: 1 })
	g = settle(g)
	assert.equal(g.inst[g.location].progress, before + 2)
})

test('Ranger Report: a group test takes energy from both Rangers and doesn’t end a turn', () => {
	let g = settle(newDay(setup([])))
	g.phase = 'turns'
	for (const R of g.rangers) R.energy.FOC = 3
	g = draw(g, byName('Ranger Report', 'MoP'))
	const h = g.queue[0]
	assert.equal(h?.kind, 'test')
	if (h?.kind !== 'test') return
	assert.equal(h.group, true)
	assert.equal(h.diff, 4)
	assert.ok(tryApply(g, { t: 'cancelTest' }).err, 'a path moment test cannot be cancelled')
	g = apply(g, { t: 'commit', energy: 1, discards: [], extra: 0, others: [{ ranger: 1, energy: 2, discards: [] }] })
	assert.equal(g.rangers[0].energy.FOC, 2)
	assert.equal(g.rangers[1].energy.FOC, 1)
	assert.equal(g.lastTest?.base, 3)
	assert.equal(g.lastTurn, null, 'no Ranger turn was used')
})

test('Moments in the Valley: Spire in Bloom locations use their own moments', () => {
	const loc = byName('Spire Crossing', 'SiB')
	const g = settle(newDay({ ...setup(['SiB', 'MoV', 'MoP']), location: loc }))
	assert.equal(moments(g).length, 2)
	assert.ok(moments(g).every((id) => card(id).set === 'Spire in Bloom Moments'), moments(g).map((id) => card(id).set).join())
})
