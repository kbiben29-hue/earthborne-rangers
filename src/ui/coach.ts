// Tutorial coach: explains what's happening in plain words and makes a good move glow.
// All wording is our own summary of the rules, not text from the rulebook.
import { card } from '../data/data'
import { availableTests, between, canTakeTurn, canTravel, commonTargetOk, costOf, has, inPlay, nameOf, presence, threshold, traitsOf, typeOf, zoneCards } from '../engine/engine'
import type { Game } from '../engine/types'

export interface Hint {
	/** Cards in play to glow. */
	uids?: number[]
	/** Hand card indexes to glow. */
	hand?: number[]
	/** Buttons to glow: 'traverse' | 'connect' | 'remember' | 'avoid' | 'rest' | 'commit' | 'stay' … */
	buttons?: string[]
	/** Suggested amount of energy to commit. */
	energy?: number
}
export interface CoachStep {
	key: string
	title: string
	body: string
	hint?: Hint
}

export const INTRO: { title: string; body: string }[] = [
	{
		title: 'Welcome, Ranger',
		body: 'Earthborne Rangers is played one day at a time. You walk the Valley, meet its creatures and people, and try to get where you need to go before you run out of energy and stamina. There’s no opponent: the path deck is the wild, and each round it puts new cards in front of you.',
	},
	{
		title: 'Your Ranger',
		body: 'Your four aspects — Awareness, Fitness, Focus and Spirit — give you that many energy tokens each round (the coloured numbers on your mat). Your deck is your stamina: when something fatigues you, cards move from the top of your deck to your fatigue pile. If your deck runs out, the day is over.',
	},
	{
		title: 'A round',
		body: '1. Path cards: each Ranger draws one path card. It lands within reach of you or along the way.\n2. Ranger turns: take turns doing one thing — a test, playing a card, or resting.\n3. Travel: once everyone has rested, if the location has enough progress you may move on.\n4. Refresh: draw a card, get your energy back, ready everything.',
	},
	{
		title: 'Tests',
		body: 'A test is aspect + approach, like FIT + exploration for Traverse. Commit energy of that aspect, add cards from your hand that show the approach icon, then a challenge card nudges your effort up or down. Reach the difficulty and you succeed. The challenge card also shows a sun, mountain or crest — every active card with that symbol then does its thing.',
	},
	{
		title: 'Watch out for what’s in the way',
		body: 'Cards within reach are close, cards along the way are further, the location is furthest. Reaching past ready cards fatigues you by their presence (the number top right). Obstacles block you completely. Friendly cards don’t bother you. Exhausted cards are harmless — Avoid exhausts a being.',
	},
	{
		title: 'Your goal today',
		body: 'Add progress to Lone Tree Station with Traverse until it reaches its threshold (the green number on it), then rest and travel. Tap a card on the table to see what you can do with it. Tap a card in your hand to lift it, and drag it onto the table to play it. The reference cards in the top-left corner list the tests and the round; tap them to read them. Whatever glows gold is the coach’s suggestion.',
	},
]

/** Cards the game still leaves partly to the player: not good tutorial suggestions. */
const BY_HAND = new Set(['Reverb Locket', 'Perfect Recall', 'Functional Replica', 'Paratrepsis Whistle', 'Root Snare', 'Harmonize', 'Sky Whip', 'Local Fare'])

/** A sensible move for Ranger r right now. */
function suggest(g: Game, r: number): { what: string; hint: Hint; why: string } {
	const R = g.rangers[r]
	const loc = g.inst[g.location]
	const t = threshold(g, g.location, 'prog')
	const ready = (u: number) => !g.inst[u].exhausted
	// 1. A ready predator within reach: Avoid it before it hurts you.
	const pred = zoneCards(g, 'reach', r).find((i) => ready(i.uid) && typeOf(g, i.uid) === 'Being' && traitsOf(g, i.uid).includes('predator'))
	if (pred && R.energy.AWA > 0) return { what: `Avoid ${nameOf(g, pred.uid)}`, hint: { buttons: ['avoid'], uids: [pred.uid] }, why: 'A ready predator within reach fatigues you whenever you reach past it, and its challenge effects can injure you. Avoid exhausts it.' }
	// 2. Play a cheap gear or being from hand.
	const h = R.hand.findIndex((id) => !BY_HAND.has(card(id).name) && ['Gear', 'Being'].includes(card(id).type) && typeof costOf(id) === 'number' && R.energy[card(id).aspect ?? 'AWA'] >= (costOf(id) as number) && (costOf(id) as number) <= 2)
	if (h >= 0) return { what: `play ${card(R.hand[h]).name}`, hint: { hand: [h] }, why: 'Gear and companions stay in play and help you all day. Drag the glowing card from your hand up onto the table to play it (tap it first to read what it does).' }
	// 3. Traverse the location if nothing blocks the way.
	if (typeof t === 'number' && loc.progress < t && R.energy.FIT > 0) {
		const block = between(g, r, g.location).find((u) => has(g, u, 'Obstacle'))
		if (!block) {
			const inWay = between(g, r, g.location).filter((u) => !has(g, u, 'Friendly') && ready(u))
			const fat = inWay.reduce((n, u) => n + presence(g, u), 0)
			const big = [...inWay].sort((a, b) => presence(g, b) - presence(g, a)).find((u) => commonTargetOk(g, 'avoid', u))
			if (fat >= 2 && big != null && R.energy.AWA > 0)
				return {
					what: `Avoid ${nameOf(g, big)}`,
					hint: { buttons: ['avoid'], uids: [big] },
					why: `Traversing now would fatigue you by ${fat}, because you’d reach past the ready cards in the way. Avoid exhausts ${nameOf(g, big)}, and exhausted cards don’t get in your way.`,
				}
			return {
				what: `Traverse ${nameOf(g, g.location)}`,
				hint: { buttons: ['traverse'], uids: [g.location] },
				why: `Progress on the location lets you travel on. ${fat ? `Reaching past the cards in the way will fatigue you by ${fat}.` : 'Nothing is in the way, so it costs no fatigue.'}`,
			}
		}
		// Traverse the obstacle instead
		if (commonTargetOk(g, 'traverse', block)) return { what: `Traverse ${nameOf(g, block)} (it's an obstacle)`, hint: { buttons: ['traverse'], uids: [block] }, why: 'An obstacle blocks everything behind it. Add progress until it clears.' }
	}
	// 3b. The location has enough progress: clear any obstacle, then rest and travel.
	if (typeof t === 'number' && loc.progress >= t) {
		const ob = inPlay(g).find((i) => !i.exhausted && has(g, i.uid, 'Obstacle'))
		if (ob && R.energy.FIT > 0 && commonTargetOk(g, 'traverse', ob.uid)) return { what: `Traverse ${nameOf(g, ob.uid)}`, hint: { buttons: ['traverse'], uids: [ob.uid] }, why: 'The location has enough progress, but a ready obstacle stops you from travelling. Clear it (or exhaust it) first.' }
		if (!ob) return { what: 'Rest', hint: { buttons: ['rest'] }, why: `${nameOf(g, g.location)} has enough progress. Rest, and when the round ends you can travel to a new place.` }
	}
	// 4. Connect with a friendly-looking being for progress.
	const being = inPlay(g).find((i) => typeOf(g, i.uid) === 'Being' && i.kind === 'path' && commonTargetOk(g, 'connect', i.uid) && !traitsOf(g, i.uid).includes('predator'))
	if (being && R.energy.SPI > 0) return { what: `Connect with ${nameOf(g, being.uid)}`, hint: { buttons: ['connect'], uids: [being.uid] }, why: 'Connecting adds progress to a being; when it has enough, it clears and leaves (people often have a story for you in the guide).' }
	// 5. A test printed on a card.
	const ct = availableTests(g, r).find((x) => x.src != null && R.energy[x.aspect] > 0 && g.inst[x.src].kind === 'path')
	if (ct?.src != null) return { what: `${ct.name} on ${nameOf(g, ct.src)}`, hint: { uids: [ct.src] }, why: 'Many path cards have their own test. Tap the card to see it.' }
	return { what: 'Rest', hint: { buttons: ['rest'] }, why: 'Nothing useful left this round — rest. When every Ranger has rested, the round ends.' }
}

export function coachFor(g: Game, me: number, seen: Set<string>): CoachStep | null {
	const h = g.queue[0]
	const once = (key: string, text: string) => (seen.has(key) ? '' : text)
	if (h) {
		switch (h.kind) {
			case 'mulligan':
				return { key: 'mulligan', title: 'Your starting hand', body: 'These are your first six cards. You can set some aside and draw new ones (a mulligan). Cards in hand are your options today and your effort in tests. Keeping your hand is fine.' }
			case 'test': {
				const goal = h.diff + 1
				const risk = h.name === 'Traverse' ? ' Careful: if Traverse fails, you suffer an injury, so don’t skimp here.' : ''
				return {
					key: 'test',
					title: `${h.name}: commit effort`,
					body: `${once('test', `Difficulty ${h.diff}. Commit ${h.aspect} energy (1 effort each) and discard cards showing the ${h.approach} icon from your hand (1 effort per icon). The challenge card adds +1, 0, −1 or −2 — `)}aim for about ${goal} so a −1 still succeeds. Energy you spend is gone until the next round. The coach has set the energy for you.${risk}`,
					hint: { buttons: ['commit'], energy: Math.min(goal, g.rangers[h.ranger].energy[h.aspect]) },
				}
			}
			case 'choose':
				return { key: 'choose', title: 'Choose a card', body: `${h.text} The cards you can pick glow gold.` }
			case 'ask':
				return { key: 'ask', title: 'Your call', body: h.options ? 'Pick one of the options. A path moment’s choices are printed on the card too (tap it to read).' : h.yes ? 'Pick one of the two options.' : 'The game can’t tell this one by itself. Look at the table and answer.' }
			case 'aspect':
				return { key: 'aspect', title: 'Pick an energy type', body: h.text }
			case 'guide':
				return { key: 'guide', title: 'Campaign guide', body: 'A card sent you to the campaign guide. Tap “Open entry” to read it right here (only read that entry: the rest are spoilers), then tap “Done reading”.' }
			case 'scout':
				return { key: 'scout', title: 'Scouting', body: 'You look at the top cards of a deck and decide which stay on top (you’ll meet them soon) and which go to the bottom. Put anything dangerous on the bottom.' }
			case 'travel':
				return { key: 'travel', title: 'Travel!', body: canTravel(g) ? 'You can’t travel yet — stay and try again next round.' : 'You’ve made enough progress. Pick a nearby location to walk to: the path you take decides which terrain cards you’ll meet there. “Travel & camp” ends the day safely.', hint: { buttons: canTravel(g) ? ['stay'] : ['go'] } }
			case 'dayOver':
				return { key: 'over', title: 'The day is over', body: 'Days end when you camp, run out of stamina or take a third injury. In a campaign the game records where you ended and what you achieved, and the next day starts from there. That’s the tutorial — start a campaign from the home screen when you’re ready.' }
			case 'manual':
				return { key: 'manual', title: 'One step by hand', body: 'This card does something the game doesn’t do for you yet. Do it with the card tools (tap a card, “Look closer”), then press Done.' }
			case 'equip':
				return { key: 'equip', title: 'Too much gear', body: 'You can only have 5 squares of gear equipped. Discard something.' }
		}
	}
	if (g.phase !== 'turns') return null
	const why = canTakeTurn(g, me)
	if (why && why !== 'role') {
		const other = g.rangers.findIndex((r, k) => k !== me && !r.rested)
		return other >= 0 ? { key: 'other', title: 'Another Ranger’s turn', body: `${g.rangers[other].name} goes next.` } : null
	}
	const s = suggest(g, me)
	return {
		key: 'turn',
		title: 'Your turn',
		body: `${once('turn', 'Each turn you do one thing: a test, play a card, or rest. ')}Suggested: ${s.what}. ${s.why}`,
		hint: s.hint,
	}
}

/** One-off explanations when something new happens. */
export function eventNote(prev: Game, next: Game, seen: Set<string>): CoachStep | null {
	const n = next.log.length - prev.log.length
	const fresh = n > 0 ? next.log.slice(-n).join('\n') : ''
	const note = (key: string, title: string, body: string) => (seen.has(key) ? null : { key, title, body })
	if (/suffers \d+ fatigue/.test(fresh)) return note('n:fatigue', 'Fatigue', 'Fatigue moves cards from the top of your deck to your fatigue pile. Your deck is your stamina: if it runs out, the day ends. Soothing fatigue brings those cards back into your hand.')
	if (/suffers an injury/.test(fresh)) return note('n:injury', 'An injury', 'An injury discards your fatigue pile, and each injury fatigues you once more every round. A third injury ends the day and leaves you a Lingering Injury card.')
	if (/clears/.test(fresh)) return note('n:clear', 'A card cleared', 'When a card gets as much progress (or harm) as its threshold, it clears and leaves play — sometimes with an effect or a guide entry.')
	if (/Refresh/.test(fresh)) return note('n:refresh', 'End of the round', 'Everyone rested, so the round ended: you drew a card, got all your energy back and every card was readied. Then each Ranger drew a new path card.')
	if (/Challenge card drawn/.test(fresh)) return note('n:challenge', 'The challenge card', 'Look at the card top right: its number changed your effort, and its symbol triggered matching effects on active cards around you. The game did them for you.')
	if (/travel along/.test(fresh)) return note('n:travel', 'A new place', 'The path deck was rebuilt from the terrain you walked and the new location. Its arrival setup has been done.')
	return null
}
