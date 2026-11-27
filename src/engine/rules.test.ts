// Rules checked against the Earthborne Rangers rulebook (rules reference).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, PREBUILT } from '../data/data'
import { entriesForDay, finishDay, newCampaign, prebuiltRanger } from '../campaign/campaign'
import { apply, newDay, type DaySetup } from './engine'
import { effect } from './dsl'
import type { Game, Job } from './types'

const ranger = (k: string, name: string) => ({ name, role: PREBUILT[k].role, aspect: PREBUILT[k].aspect, deck: PREBUILT[k].deck })
const byName = (n: string) => Object.values(CARDS).find((c) => c.name === n)!.id
const setup = (extra: Partial<DaySetup> = {}): DaySetup => ({ seed: 11, day: 2, rangers: [ranger('UndauntedSeeker', 'Ash')], location: '01378', terrain: 'woods', weather: '01373', missions: [], ...extra })
function through(g: Game): Game {
	for (let k = 0; k < 30 && g.queue.length && !g.ended; k++) {
		const h = g.queue[0]
		if (h.kind === 'mulligan') g = apply(g, { t: 'keep', ranger: h.ranger })
		else if (h.kind === 'guide') g = apply(g, { t: 'guideRead' })
		else if (h.kind === 'choose') g = apply(g, { t: 'choose', uids: h.options.slice(0, h.min) })
		else if (h.kind === 'ask') g = apply(g, { t: 'answer', yes: true, pick: 0 })
		else if (h.kind === 'manual') g = apply(g, { t: 'manualDone' })
		else if (h.kind === 'aspect') g = apply(g, { t: 'aspect', a: h.options[0] })
		else if (h.kind === 'scout') g = apply(g, { t: 'scouted', top: h.cards, bottom: [] })
		else if (h.kind === 'pickHand') g = apply(g, { t: 'pickHand', index: h.optional ? null : h.options[0] })
		else break
	}
	return g
}
/** Run one job by itself (pauses on a manual prompt so apply() can resume it). */
function runJob(g: Game, j: Partial<Job> & Pick<Job, 'eff'>): Game {
	g = structuredClone(g)
	g.queue = [{ kind: 'manual', title: 'test', text: '', ranger: 0 }]
	g.jobs = [{ title: 'test', src: null, ranger: 0, effort: 0, target: null, that: null, stage: 'cond', i: 0, picks: {}, ...j }]
	return through(apply(g, { t: 'manualDone' }))
}

test('Path Deck Assembly on missions and weather is applied (Rising Waters, Pristine Snow)', () => {
	const rw = byName('Rising Waters')
	const g = newDay(setup({ missions: [{ id: rw, side: 'B' }] }))
	assert.ok(g.pathDeck.includes(byName('Mysterious Verdessian')), 'Mysterious Verdessian added')
	const sos = newDay(setup({ weather: byName('Pristine Snow'), packs: ['SoS'] }))
	assert.ok(sos.pathDeck.includes(byName('Snowdrift')), 'Snowdrift added')
})

test('Refresh: Refresh effects resolve before cards ready', () => {
	let g = through(newDay(setup()))
	g = apply(g, { t: 'rest', ranger: 0 })
	g = through(g)
	if (g.queue[0]?.kind === 'travel') g = through(apply(g, { t: 'stay' }))
	const refresh = g.log.findIndex((l) => /removed from A Perfect Day/.test(l))
	const ready = g.log.findIndex((l) => /Every card in play readies/.test(l))
	assert.ok(refresh >= 0 && ready > refresh, `refresh effect at ${refresh}, ready at ${ready}`)
})

test('Clear: the Clear effect resolves while the card is still in play, then it is discarded', () => {
	let g = through(newDay(setup()))
	const toxin = byName('Toxin Eater')
	g = apply(g, { t: 'manual', op: { op: 'search', from: 'collection', id: toxin, ranger: 0, place: 'along' } })
	g = through(g)
	const te = Object.values(g.inst).find((i) => i.id === toxin)!
	const other = Object.values(g.inst).find((i) => i.zone === 'along' && i.uid !== te.uid)
	const h0 = other ? other.harm : 0
	g = through(apply(g, { t: 'manual', op: { op: 'tokens', uid: te.uid, what: 'harm', delta: 5 } }))
	assert.ok(!g.inst[te.uid], 'Toxin Eater is discarded')
	assert.ok(g.pathDiscard.includes(toxin))
	if (other && g.inst[other.uid]) assert.equal(g.inst[other.uid].harm, h0 + 2, '"each other card in this area" got 2 harm')
})

test('Challenge effects: a card exhausted earlier in the test does not resolve its effect', () => {
	let g = through(newDay(setup()))
	const u = Object.values(g.inst).find((i) => i.kind === 'path')!.uid
	g.inst[u].exhausted = true
	const before = g.rangers[0].fatigue.length
	g = runJob(g, { src: u, chal: true, eff: effect('Suffer 2 fatigue.') })
	assert.equal(g.rangers[0].fatigue.length, before)
	g.inst[u].exhausted = false
	g = runJob(g, { src: u, chal: true, eff: effect('Suffer 2 fatigue.') })
	assert.equal(g.rangers[0].fatigue.length, before + 2)
})

test('Search: a set in use is searched through the path deck', () => {
	let g = through(newDay(setup({ missions: [{ id: byName('Rising Waters'), side: 'B' }] })))
	const mv = byName('Mysterious Verdessian')
	const inDeck = g.pathDeck.includes(mv)
	if (!inDeck) return // already drawn this round
	g = runJob(g, { eff: effect('Search the General set for a Mysterious Verdessian and put it into play.') })
	assert.ok(!g.pathDeck.includes(mv), 'taken out of the path deck')
	assert.equal(Object.values(g.inst).filter((i) => i.id === mv).length, 1, 'one copy in play')
})

test('Campaign tracker: entries above days and the difficulty weather', () => {
	const c = newCampaign('T', [prebuiltRanger('UndauntedSeeker', 'Ash')], ['SiB'])
	assert.deepEqual(entriesForDay(c, 3), ['94.1'])
	assert.deepEqual(entriesForDay(c, 8), ['216.1'])
	assert.deepEqual(entriesForDay({ ...c, dayEntries: { 5: ['12'] } }, 5), ['12'])
	const g = newDay({ ...setup(), day: 1, entries: ['94.1'] })
	assert.equal(g.queue[0]?.kind, 'guide')
	const hard = finishDay({ ...c, weatherMode: '01375' }, through(newDay(setup())))
	assert.equal(hard.weather, '01375')
	const tracker = finishDay({ ...c, day: 3 }, through(newDay(setup())))
	assert.equal(tracker.weather, '01374', 'day 4 is Downpour on the tracker')
})
