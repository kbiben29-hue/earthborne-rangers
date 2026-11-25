// Spire in Bloom and Shadow of the Storm in the Valley: locations, path decks, decks beside the path deck.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { card, CARDS, PREBUILT } from '../data/data'
import { apply, availableTests, canTravel, commonTargetOk, newDay, testOptions, tryApply, zoneCards, type DaySetup } from './engine'
import type { Game } from './types'
import { effect } from './dsl'

const ranger = (k: string, name: string) => ({ name, role: PREBUILT[k].role, aspect: PREBUILT[k].aspect, deck: PREBUILT[k].deck })
const byName = (n: string, pack: string) => Object.values(CARDS).find((c) => c.name === n && c.pack === pack)!.id
const setup = (location: string, terrain = 'woods', seed = 3): DaySetup => ({ seed, day: 1, rangers: [ranger('UndauntedSeeker', 'Ash'), ranger('VoiceoftheElders', 'Bryn')], location, terrain, weather: '01373', missions: [], packs: ['SiB', 'SoS'] })
function settle(g: Game): Game {
	for (let k = 0; k < 40 && g.queue.length && !g.ended; k++) {
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

test('expansion locations are on the map both ways', () => {
	const spireCrossing = byName('Spire Crossing', 'SiB')
	const whiteSky = card(spireCrossing).links!.find((l) => card(l.to).pack === 'Core')!.to
	assert.ok(card(whiteSky).links!.some((l) => l.to === spireCrossing), `${card(whiteSky).name} links back to Spire Crossing`)
	const terra = byName('Terra Lodge', 'SoS')
	assert.ok(card(terra).links!.some((l) => card(l.to).pack === 'Core'))
})

test('Sentinel Peak: Nimbus terrain-free assembly adds an Icy Path and 3 Deep Fogs', () => {
	const g = newDay(setup(byName('Sentinel Peak', 'SoS'), 'mountain_pass'))
	const names = g.pathDeck.map((id) => card(id).name)
	assert.equal(names.filter((n) => n === 'Icy Path').length, 1)
	assert.equal(names.filter((n) => /^Deep Fog/.test(n)).length, 3)
})

test('The Otherwoods sets the Otherworld deck beside the path deck', () => {
	let g = newDay(setup(byName('The Otherwoods', 'SoS'), 'woods'))
	const ow = g.decks?.Otherworld ?? []
	assert.ok(ow.length >= 12, `Otherworld deck has ${ow.length}`)
	assert.ok(!g.pathDeck.some((id) => /Transdimensional Rift|Entity from Afar/.test(card(id).name)))
	g = settle(g)
	const before = g.decks!.Otherworld.length
	const e = effect('Draw the top card of the Otherworld deck.')
	assert.equal(e.steps[0].k, 'drawSide')
	assert.ok(before > 0)
})

test('core Spire keeps its own set as the Spire deck', () => {
	const g = newDay(setup('01385', 'woods'))
	assert.ok((g.decks?.Spire ?? []).length > 0)
})

test('Spire in Bloom locations shuffle a Backalley Shortcut into the path deck', () => {
	const g = newDay(setup(byName('Brookside', 'SiB'), 'thoroughfare'))
	assert.ok(g.pathDeck.some((id) => card(id).name === 'Backalley Shortcut'))
	assert.ok(g.pathDeck.length > 5)
})

test('days at every expansion location play out without crashing', () => {
	const locs = Object.values(CARDS).filter((c) => c.type === 'Location' && (c.pack === 'SiB' || c.pack === 'SoS'))
	let seed = 1
	for (const loc of locs)
		for (let rep = 0; rep < 4; rep++, seed++) {
			const terrain = loc.links?.[0]?.path ?? 'woods'
			let g = settle(newDay({ ...setup(loc.id, terrain, seed) }))
			for (let k = 0; k < 250 && !g.ended; k++) {
				const h = g.queue[0]
				if (h) {
					if (h.kind === 'test') g = apply(g, { t: 'commit', energy: 1, discards: [0], extra: 0, extras: testOptions(g, h).extras.slice(0, 1).map((x) => x.key) })
					else if (h.kind === 'travel') {
						const links = card(g.inst[g.location].id).links!.filter((l) => l.path !== 'river')
						g = canTravel(g) == null && links.length ? apply(g, { t: 'travel', to: links[k % links.length].to, camp: false }) : apply(g, { t: 'stay' })
					} else if (h.kind === 'equip') g = apply(g, { t: 'manual', op: { op: 'discard', uid: zoneCards(g, 'player', h.ranger).filter((i) => i.kind === 'ranger')[0].uid } })
					else if (h.kind === 'dayOver') break
					else g = settle(g)
					continue
				}
				const r = g.rangers.findIndex((x, i) => !x.rested && (g.lastTurn !== i || g.rangers.filter((y) => !y.rested).length === 1))
				if (r < 0) break
				const R = g.rangers[r]
				const tests = availableTests(g, r).filter((t) => R.energy[t.aspect] > 0)
				const t = tests[(seed * k) % Math.max(1, tests.length)]
				if (t && k % 3 !== 2) {
					const target = t.needsTarget ? (t.test === 'traverse' ? g.location : (Object.values(g.inst).find((i) => commonTargetOk(g, String(t.test), i.uid))?.uid ?? null)) : null
					const res = tryApply(g, { t: 'test', ranger: r, src: t.src, test: t.test, target })
					g = res.err ? apply(g, { t: 'rest', ranger: r }) : res.g
				} else g = apply(g, { t: 'rest', ranger: r })
			}
			assert.ok(g.round >= 1, card(loc.id).name)
		}
})
