// Card scripts: where the printed text is too unusual for the reader in dsl.ts, a card's
// effect is rewritten here in plain sentences the reader understands, with the same meaning.
// Keys: card id + side + part. Parts: sun, mountain, crest, test0, test0fail, clear, refresh,
// enters, arrival0…  A few effects that need special steps are built in code below.
import { effect, sentence, type Effect, type StepWhen } from './dsl'
import type { Parsed, Sym } from './text'

export const REWRITE: Record<string, string> = {
	// Caustic Mulcher
	'01265A:sun': 'If there is another active being, exhaust it. If there is another active being, attach it to this being. If there is no other active being, move your [ranger] to this being.',
	'01265A:crest': 'Add 1[harm] to each being attached to this being. Each Ranger with their [ranger] on this being suffers 1 injury.',
	'01265A:test0': 'Exhaust this being. Return your [ranger] to your role.',
	// Circling Irix
	'01268A:crest': 'If this being is within reach and you have 3 or more fatigue, exhaust it. [conditional] Suffer 1 injury.',
	// Shale Scree: failing Scramble resolves its mountain effect
	'01273A:test0fail': 'Move this card within reach. [conditional] It fatigues you. Move each being that is within reach to another area.',
	// Lutrinal Holt
	'01275A:test0': 'Add 1 lure to this card.',
	'01275A:mountain': 'Exhaust this feature. [conditional] Search the path deck and discard for a Romping Lutrinal and put it into play.',
	// Romping Lutrinal
	'01276A:mountain': "If there is an active predator other than a Romping Lutrinal, exhaust it. [conditional] Add [harm] to this being equal to that predator's presence.",
	// Carnivorous Naiad
	'01277A:sun': 'Discard 1 [AWA] energy or move your [ranger] to this feature.',
	// Fresh Blue Kelpweed
	'01278A:test0': 'Add 1[harm] to this feature. Heal 1 injury or remove 2[harm] from a being.',
	// Kleptic Raccoon
	'01282A:sun': 'Discard an equipped gear. [conditional] Add 1 loot to this being. If there are 2 or more loot on this being, shuffle it into the path deck.',
	// Puffercrawler
	'01285A:sun': 'If this being is attached, add 1[harm] to the being it is attached to. If this being is not attached, attach it to a being.',
	'01285A:crest': 'If this being is attached, suffer 1 injury. If this being is not attached, attach it to your role.',
	'01285A:test0fail': 'Attach it to your role.',
	// Rotting Dolewood
	'01287A:mountain': 'Add 1[harm] to this feature.',
	'01287A:clear': 'Discard each flora in play. Each Ranger suffers 2 fatigue.',
	// Dolewood Canopy
	'01288A:test0': 'Move your [ranger] to this feature or return your [ranger] to your role.',
	'01288A:sun': 'Return your [ranger] to your role or move your [ranger] to this feature.',
	// Strong Current / Rapids
	'01292A:sun': 'Move the card along the way with the highest presence within reach.',
	'01294A:mountain': 'Move the card along the way with the highest presence within reach.',
	'01294A:crest': 'If this feature is within reach, discard 2[progress] from this feature or suffer 1 injury.',
	// Overgrown Portage
	'01293A:test0': 'Move your [ranger] to this feature. Move a card within reach along the way.',
	// Fraying Rope Bridge
	'01300A:clear': 'Remove all [progress] from the location.',
	// Talus Cave
	'01301A:sun': 'If there is a Nycta Bats in play, add 1 bat to it.',
	// Intrepid Marmot
	'01303A:test0': 'Exhaust this being. Add 1[progress] to this being for every 2 effort. Add 2[progress] to a feature for every 2 effort.',
	// Fetid Bog
	'01304A:mountain': 'Exhaust your role or it fatigues you.',
	'01304A:refresh': 'Discard each facedown card attached to this feature.',
	// Overgrown Ruins / Reactor
	'01306A:clear': 'Draw 1 path card.',
	'01307A:clear': 'Draw 1 path card.',
	'01307A:crest': 'If your [ranger] is on a water feature, suffer 1 injury.',
	// Hungry Scrof
	'01311A:crest': 'If there is an active food, exhaust this being. [conditional] Suffer 1 injury.',
	// Mourning Root
	'01312A:test0': 'Add 1[harm] to this feature. Suffer 1 fatigue. Choose a Ranger. That Ranger soothes 3 fatigue.',
	// Quisi Vos, Rascal
	'01316A:sun': 'Remove 1[progress] from a path card.',
	// Ranger Cache
	'01319A:test0': 'Move your [ranger] to this feature.',
	'01319A:test0fail': 'Move your [ranger] to this feature.',
	// Arcology Sinkhole
	'01320A:mountain': 'Remove 1[progress] from a feature or it fatigues you.',
	'01320A:clear': '[guide] 78',
	// Ol' Bloody Clicker
	'01328A:sun': 'Add 3[harm] to the active feature with the lowest presence.',
	// Cerberusian Cyclone
	'01329A:test0': 'Remove 1 strength from this card for every 2 effort. If there are no strength on this card, discard this.',
	'01329A:mountain': 'Move this feature.',
	'01329A:crest': 'Move a card.',
	// Dancer's Round
	'01331A:clear': 'Remove all [progress] from each human.',
	// Reclaimer Seeker / Polyp / Grub
	'01332A:mountain': 'Add 1 mucus to the location. If there are 3 or more mucus on the location, search the General set for a Reclaimer Polyp and put it into play.',
	'01333A:clear': 'Search the General set for 2 Reclaimer Grub and put them into play.',
	'01334A:sun': 'Add 1 growth to this card. If there are 3 or more growth on this card, discard this. If there are 3 or more growth on this card, search the General set for a Reclaimer Seeker and put it into play.',
	// Ball Lightning
	'01337A:clear': 'If this feature is within reach of a Ranger, that Ranger suffers 2 injuries.',
	// Ar Tel / Seilo Griss / Jaris
	'01347A:test0': 'Exhaust this being. If there is a water card in play, soothe 2 fatigue.',
	'01355A:test0': 'Add 1[progress] to this being for every 2 effort.',
	'01365A:sun': 'If there is an exhausted predator, ready it.',
	// Weather
	'01373A:mountain': 'If this test added [progress], add 1[progress] to the card that received it.',
	'01374B:refresh': 'Add 2 rain to this card. If there are 4 or more rain on this card, move all prey along the way. If there are 4 or more rain on this card, each ranger exhausts their role. If there are 4 or more rain on this card, flip this card.',
	'01375A:sun': 'Add 2 wind to this card.',
	'01375A:arrival0': 'Search the General set for a Cerberusian Cyclone and shuffle it into the path deck.',
	// Ancestor's Grove
	'01384A:sun': '',
	// Locations
	'01388A:test0': 'Move your [ranger] to this location.',
	'01398A:test0': 'Move your [ranger] to this location.',
	'01392B:arrival0': 'Draw 1 path card.',
	'01392B:arrival1': 'Draw 1 path card.',
	'01395A:crest': 'Scout 1 challenge card.',
	'01404A:crest': 'Remove 1 strut from the location. If there are no strut on the location, each ranger suffers 1 injury.',
	'01405A:mountain': 'Add 1 toxin to the location.',
	'01407A:mountain': 'Remove 1[progress] from a path card.',
	'01409A:test0': 'Remove 1 water from the location for every 1 effort.',
	'01410A:mountain': '',
	'01410B:arrival0': 'Draw 1 path card.',
	'01410B:arrival1': 'Draw 1 path card.',

	// ---------------- Stewards of the Valley (Ranger cards)
	// Grell's Secret Map
	'03002A:ab0': 'Add 1 hunch to this card. Add 1[progress] to the location.',
	// Personal Travelogue ("an equal number": the fatigue suffered)
	'03020A:ab0': 'Add stories equal to your effort to this card.',
	'03020A:test0': 'If there are 4 or more stories on this card, shuffle up to 2 cards from your fatigue stack into your deck. Discard all stories from this card.',
	// Nut rolled Honey Loaf
	'03021A:ab0': "If it is a Ranger's turn, add 2[progress] to that being. If it is not a Ranger's turn, add 1[progress] to that being.",
	// Power Cell Recycler
	'03025A:ab0': 'Remove 2 tokens from one of your equipped tech to add 1 token to a tech.',
	// Remote Sentinels
	'03026A:ab0': 'Move a being, treating it as if it does not have ambush. If it is within reach, add 1[progress] to it.',
	// Anchorite of Stone
	'03032A:ab0': 'Add 1 token to a conduit or ready a conduit.',
	// Visions of the Floating Tower ("an equal number": tokens discarded)
	'03036A:ab0': 'Soothe fatigue equal to your effort.',
	// Spirit of the Silverfin
	'03055A:ab0': 'Discard 3[progress] from this spirit to prevent that fatigue or injury.',
	// Heart Harmonizer
	'03053A:ab1': 'Spend 2[progress] from a spirit within reach to prevent it.',
	// Wonders of the Valley ("equal to the number of fatigue suffered plus 1")
	'03059A:ab0': 'Add [progress] to the attached card equal to your effort. Add 1[progress] to the attached card.',
	// The Buck and the Wolhund
	'03060A:play': 'Add 1[harm] to a prey. Exhaust a predator. Add 3[harm] to it.',
	// Book of Great Deeds: Recount
	'03063A:test0': 'Shuffle the top card of your fatigue stack into your deck. Add 2[progress] to each human within reach.',
}

/** Effects built from steps, where even a rewrite can't say it. */
const BUILT: Record<string, () => Effect> = {
	// The Full Understory: "Scout X path cards. X is equal to twice the number of flora in play. If there are no flora in play, search the path deck for the next flora and put it into play."
	'03013A:play': () => ({
		text: 'Scout twice the number of flora in play; if there are none, find the next flora in the path deck.',
		pre: [],
		steps: [
			{ k: 'searchPath', f: { words: ['flora'] }, then: 'play', when: { c: 'exists', f: { words: ['flora'] }, negate: true, bind: false } },
			{ k: 'scoutPath', amt: { count: { words: ['flora'] }, mult: 2 } },
		],
		auto: true,
	}),
	// Piercing Whistle
	'03009A:play': () => ({
		text: 'Search your deck for a being and add it to your hand. You may discard another being from your hand to play it for free.',
		pre: [],
		steps: [
			{ k: 'searchDeck', f: { words: ['being'] } },
			{ k: 'either', a: [{ k: 'handToFatigue', to: 'discard' }, { k: 'playFound', discount: 99, skipLast: 1 }], b: [], la: 'Discard another being from your hand to play it for free', lb: 'Keep it in hand' },
		],
		auto: true,
	}),
	// Gregarious Inventor (the Ranger who exhausts it searches)
	'03022A:ab0': () => ({ text: 'Search your deck for a gear and play it (paying its cost).', pre: [], steps: [{ k: 'searchDeck', f: { words: ['gear'] } }, { k: 'playFound', discount: 0 }], auto: true }),
	// Call Upon the Spirits
	'03041A:play': () => ({
		text: 'Search your deck for a spirit and add it to your hand. If spiritspeaking, you may play it for 1 less; otherwise you may exhaust your role to spiritspeak.',
		pre: [],
		steps: [
			{ k: 'searchDeck', f: { words: ['spirit'] } },
			{ k: 'either', a: [{ k: 'playFound', discount: 1 }], b: [], la: 'Play that spirit now (1 less)', lb: 'Keep it in hand', when: { c: 'spiritspeaking' } },
			{ k: 'either', a: [{ k: 'spiritspeak' }], b: [], la: 'Exhaust your role to spiritspeak', lb: 'Not now', when: { c: 'spiritspeaking', negate: true } },
		],
		auto: true,
	}),
	// The Tireless Artisan: "they soothe 2 fatigue. If that Ranger has 5 or more fatigue, they soothe 4 fatigue instead."
	'03065A:ab0': () => ({
		text: 'They soothe 2 fatigue (4 if they have 5 or more fatigue).',
		pre: [],
		steps: [
			{ k: 'soothe', amt: { n: 2 }, when: { c: 'not', x: { c: 'youFatigue', min: 5 } } },
			{ k: 'soothe', amt: { n: 4 }, when: { c: 'youFatigue', min: 5 } },
		],
		auto: true,
	}),
	// Dolewood Lute
	'03068A:ab0': () => ({ text: 'Choose a Ranger. That Ranger soothes 1 fatigue (2 if a tale is attached to their role).', pre: [], steps: [{ k: 'soothe', amt: { n: 1, tale: 1 }, who: 'choose' }], auto: true }),
}

/** "Draw 1 challenge card and do the following based on its icon" arrivals. */
const BY_CHALLENGE: Record<string, Record<Sym, string>> = {
	'01383B': { sun: 'Scout 2 path cards, then draw 1 path card.', mountain: 'Draw 1 path card.', crest: 'Scout 3 path cards, then draw 2 path cards.' },
	'01395B': { sun: 'Scout 2 path cards, then draw 1 path card.', mountain: 'Draw 1 path card.', crest: 'Scout 3 path cards, then draw 2 path cards.' },
}

export function scriptFor(id: string, side: 'A' | 'B', p: Parsed) {
	const key = id + side
	const get = (part: string) => REWRITE[`${key}:${part}`]
	for (const sym of ['sun', 'mountain', 'crest'] as Sym[]) {
		const t = get(sym)
		if (t !== undefined) {
			if (t) p.challenge[sym] = effect(t)
			else delete p.challenge[sym]
		}
	}
	p.tests.forEach((t, k) => {
		const s = get(`test${k}`)
		if (s !== undefined) t.success = effect(s)
		const f = get(`test${k}fail`)
		if (f !== undefined) t.fail = effect(f)
	})
	const c = get('clear')
	if (c !== undefined && p.clear[0]) p.clear[0].effect = effect(c)
	const r = get('refresh')
	if (r !== undefined) p.refresh = effect(r)
	const e = get('enters')
	if (e !== undefined) p.enters = effect(e)
	p.arrival.forEach((a, k) => {
		const s = get(`arrival${k}`)
		if (s !== undefined) a.effect = effect(s)
	})
	p.abilities.forEach((a, k) => {
		const t = get(`ab${k}`)
		if (t !== undefined) a.effect = effect(t)
		const b = BUILT[`${key}:ab${k}`]
		if (b) a.effect = b()
	})
	const pl = get('play')
	if (pl !== undefined) p.choice = effect(pl)
	if (BUILT[`${key}:play`]) p.choice = BUILT[`${key}:play`]()
	const bc = BY_CHALLENGE[key]
	if (bc) {
		const steps = (t: string): StepWhen[] => t.split(/,\s*then\s+|\.\s*/).filter(Boolean).flatMap((x) => sentence(x) ?? [])
		const eff: Effect = { text: 'Draw 1 challenge card and act on its icon.', pre: [], steps: [{ k: 'byChallenge', sun: steps(bc.sun), mountain: steps(bc.mountain), crest: steps(bc.crest) }], auto: true }
		// the lead Ranger's arrival line is the first one; the per-icon lines that follow are folded into it
		p.arrival = [{ who: 'lead', effect: eff }]
	}
}
