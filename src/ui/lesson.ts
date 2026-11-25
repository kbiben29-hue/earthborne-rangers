// The tutorial lesson: a guided first day for someone who has never played. The table is set up so
// the same things happen every time (tutorialSetup), and each step points at one part of the table,
// explains it in plain words and waits for the player to do it. When the lesson ends, the coach
// (coach.ts) keeps suggesting moves until the day is over.
import { card, CARDS } from '../data/data'
import type { Game } from '../engine/types'

// Undaunted Seeker's cards used for the starting hand
const HAND = ['01042', '01101', '01039', '01001', '01105', '01008'] // Boundary Sensor, Meticulous, A Leaf in the Breeze, Eagle Eye, Persuasive, Ironwool Boots
const byName = (n: string) => Object.values(CARDS).find((c) => c.name === n && c.pack === 'Core')?.id
/** Challenge cards in the order they come up: Traverse gets +1 FIT (mountain), Connect gets +1 SPI (sun). */
const CHALLENGE_ORDER = [3, 20]

/** Stack the decks so the lesson always plays out the same way. UI-side: the engine itself stays untouched. */
export function tutorialSetup(g: Game): Game {
	const R = g.rangers[0]
	const all = [...R.hand, ...R.deck]
	const hand: string[] = []
	for (const id of HAND) {
		const k = all.indexOf(id)
		if (k >= 0) hand.push(...all.splice(k, 1))
	}
	R.hand = hand
	R.deck = all
	// path deck: Sitka Doe (arrival), Hy Pimpot (round 1), Overgrown Thicket (round 2), Sunberry Bramble (round 3)
	const order = ['Sitka Doe', 'Hy Pimpot, Chef', 'Overgrown Thicket', 'Sunberry Bramble'].map(byName)
	const rest = g.pathDeck.slice()
	const top: string[] = []
	for (const id of order) {
		const k = id ? rest.indexOf(id) : -1
		if (k >= 0) top.push(...rest.splice(k, 1))
	}
	// Lone Tree Station's arrival discards the next predator (and shuffles the deck): do it now, and leave
	// the other predators out of this first day, so the deck keeps this order
	const preds = rest.filter((id) => /predator/i.test(card(id).traits ?? ''))
	if (preds.length) g.pathDiscard.push(preds[0])
	g.pathDeck = [...top, ...rest.filter((id) => !/predator/i.test(card(id).traits ?? ''))]
	g.challenge = [...CHALLENGE_ORDER, ...g.challenge.filter((c) => !CHALLENGE_ORDER.includes(c))]
	return g
}

export interface LessonUI {
	/** A test is waiting for its target to be tapped. */
	picking: boolean
}
export interface LessonStep {
	key: string
	title: string
	body: string
	/** CSS selector of what to point at. */
	target?: (g: Game) => string | null
	/** Show a "Next" button (otherwise the step waits for `done`). */
	next?: boolean
	done?: (g: Game, ui: LessonUI) => boolean
	/** What to do, in a few words, shown as the call to action. */
	todo?: string
	/** This step's moment has passed (or never came): go on without it. */
	skip?: (g: Game) => boolean
}

const uidOf = (g: Game, name: string) => Object.values(g.inst).find((i) => card(i.id).name === name)?.uid
const tileOf = (g: Game, name: string) => {
	const u = uidOf(g, name)
	return u != null ? `[data-uid="${u}"]` : null
}
const head = (g: Game) => g.queue[0]?.kind

export const LESSON: LessonStep[] = [
	{
		key: 'hello',
		title: 'Welcome, Ranger!',
		body: 'Earthborne Rangers is a game about exploring a wild valley. You play one day at a time. There is no opponent: the cards of the valley come to you, and you decide how to deal with them. This lesson walks you through your first day, one step at a time.',
		next: true,
	},
	{
		key: 'location',
		title: 'Where you are',
		body: 'This big card is your location: Lone Tree Station, the Rangers’ home. The green number in its corner (0/3) is its progress. Get it to 3 and you can travel somewhere new — that is your goal today.',
		target: (g) => `[data-uid="${g.location}"]`,
		next: true,
	},
	{
		key: 'weather',
		title: 'The weather',
		body: 'Today the weather is A Perfect Day. Weather cards change a little rule for the whole day. You don’t need to do anything with it.',
		target: (g) => (g.weather[0] != null ? `[data-uid="${g.weather[0]}"]` : null),
		next: true,
	},
	{
		key: 'path',
		title: 'The path deck',
		body: 'This face-down deck is the path deck: the plants, animals, people and places of the wild. Every round, cards come off it and appear around you.',
		target: () => '[data-anchor="path-deck"]',
		next: true,
	},
	{
		key: 'challenge',
		title: 'The challenge deck',
		body: 'Every time you try something (a “test”), you flip one challenge card. It nudges your result up or down a little — that is the luck in the game.',
		target: () => '[data-anchor="challenge"]',
		next: true,
	},
	{
		key: 'refs',
		title: 'Reference cards',
		body: 'These two cards are cheat sheets: the four basic tests and the order of a round. Tap them any time you want a reminder.',
		target: () => '.refs',
		next: true,
	},
	{
		key: 'energy',
		title: 'Your energy',
		body: 'These four coloured numbers are your energy: Awareness (green), Fitness (red), Focus (blue) and Spirit (yellow). You spend them to try things. They all come back at the end of each round.',
		target: () => '.mat.me .energy',
		next: true,
	},
	{
		key: 'deck',
		title: 'Your deck is your stamina',
		body: 'Your Ranger deck is how much you can take. When something tires you out (“fatigue”), cards move from your deck to the fatigue pile next to it. If your deck runs out, your day is over.',
		target: () => '[data-anchor="deck-0"]',
		next: true,
	},
	{
		key: 'hand',
		title: 'Your hand',
		body: 'Down at the bottom are the cards in your hand: equipment, tricks and personal strengths. You can swap some for new ones at the start of the day, but this hand is a good one. Tap “Keep hand”.',
		target: () => '.tray .prompt button.primary',
		done: (g) => head(g) !== 'mulligan',
		todo: 'Tap “Keep hand”',
	},
	{
		key: 'guide',
		title: 'The campaign guide',
		body: 'Some cards send you to a numbered entry of the campaign guide: a short piece of story. Tap “Open entry 2” to read it, close it, then tap “Done reading”.',
		target: () => '.tray .prompt',
		done: (g) => head(g) !== 'guide',
		todo: 'Open the entry, then “Done reading”',
	},
	{
		key: 'doe',
		title: 'A path card!',
		body: 'A Sitka Doe came out of the path deck. It is “within reach”: close to you, on your mat. The number in its top-right corner (1) is its presence: how much it gets in your way.',
		target: (g) => tileOf(g, 'Sitka Doe'),
		next: true,
	},
	{
		key: 'pimpot',
		title: 'A friend',
		body: 'Hy Pimpot the chef arrived too. He is Friendly (it says so on the card), so he never gets in your way. Friendly people often have a story for you when you help them.',
		target: (g) => tileOf(g, 'Hy Pimpot, Chef'),
		next: true,
	},
	{
		key: 'turn',
		title: 'Your turn',
		body: 'On your turn you do ONE thing: try a test (these buttons), play a card from your hand, or rest when you are done for the round. Let’s add progress to the station with Traverse.',
		target: () => '.acts',
		next: true,
	},
	{
		key: 'traverse',
		title: 'Traverse',
		body: 'Traverse uses Fitness (FIT) to add progress to the location or a feature. Tap the Traverse button.',
		target: () => '[data-act="traverse"]',
		done: (g, ui) => ui.picking || head(g) === 'test',
		todo: 'Tap Traverse',
	},
	{
		key: 'pick',
		title: 'Choose where',
		body: 'Now tap Lone Tree Station: that is the card you are traversing.',
		target: (g) => `[data-uid="${g.location}"]`,
		done: (g) => head(g) === 'test',
		todo: 'Tap Lone Tree Station',
	},
	{
		key: 'inway',
		title: 'Things in your way',
		body: 'To reach the station you have to get past the Sitka Doe. Cards between you and your target tire you out by their presence: you will suffer 1 fatigue. (Friendly Hy doesn’t count.) Your role card could dodge the doe — leave that box empty this time so you see how fatigue works.',
		target: () => '[data-tut="in-way"]',
		next: true,
	},
	{
		key: 'commit',
		title: 'Put in effort',
		body: 'Each energy you commit is 1 effort. The difficulty is the station’s presence: 1. Tap + once to commit 2 FIT, so even a bad challenge card can’t stop you.',
		target: () => '[data-tut="energy"]',
		next: true,
	},
	{
		key: 'icons',
		title: 'Cards add effort too',
		body: 'Cards with the matching symbol (here the Traverse symbol, shown as +1 on the card) can be discarded from your hand for extra effort. Tap Meticulous to add it — or keep your cards, 2 energy is plenty.',
		target: () => '[data-tut="commit-hand"]',
		next: true,
	},
	{
		key: 'draw',
		title: 'Flip the challenge card',
		body: 'Tap “Draw a challenge card”. Its number for FIT is added to your effort. If your effort is at least the difficulty, you succeed.',
		target: () => '.commit-btn',
		done: (g) => !!g.lastTest,
		todo: 'Tap “Draw a challenge card”',
	},
	{
		key: 'result',
		title: 'Success!',
		body: 'The challenge card gave +1, so your effort beat the difficulty and the station got progress equal to your effort. The card also showed a mountain symbol: every card in play with a mountain effect did it — the weather added 1 more progress!',
		target: () => '.last-test',
		next: true,
	},
	{
		key: 'fatigue',
		title: 'Fatigue',
		body: 'See the card that moved to your fatigue pile? That is the 1 fatigue from reaching past the Sitka Doe. Fatigue cards come back to your hand if you “soothe” them.',
		target: (g) => (g.rangers[0].fatigue.length ? '[data-anchor="fatigue-0"]' : null),
		next: true,
	},
	{
		key: 'gear',
		title: 'Play a card',
		body: 'Boundary Sensor is equipment that helps every Traverse. Tap it in your hand to read it, then drag it up onto the table to play it. It costs 1 FIT energy (the number in its top-left corner).',
		target: (g) => (g.rangers[0].hand.includes('01042') ? '.hand.fan [data-card="01042"]' : '.hand.fan'),
		done: (g) => Object.values(g.inst).some((i) => i.id === '01042'),
		todo: 'Drag Boundary Sensor onto the table',
	},
	{
		key: 'gear2',
		title: 'Gear stays',
		body: 'Gear stays on your mat all day. Boundary Sensor can add 1 effort to a Traverse test: when you commit, tick it in the list.',
		target: () => '.mat.me .gear',
		next: true,
	},
	{
		key: 'connect',
		title: 'Help a friend',
		body: 'Connect uses Spirit (SPI) to add progress to a being. Hy Pimpot needs 2 progress to be helped. Tap the Connect button.',
		target: () => '[data-act="connect"]',
		done: (g, ui) => ui.picking || head(g) === 'test',
		todo: 'Tap Connect',
	},
	{
		key: 'connect2',
		title: 'Choose Hy Pimpot',
		body: 'Now tap Hy Pimpot: he is the being you are connecting with.',
		target: (g) => tileOf(g, 'Hy Pimpot, Chef'),
		done: (g) => head(g) === 'test',
		todo: 'Tap Hy Pimpot',
	},
	{
		key: 'connect3',
		title: 'Two Spirit',
		body: 'Hy is Friendly, so nothing gets in your way here. He needs 2 progress, so commit 2 SPI: tap + until it shows 2.',
		target: () => '[data-tut="energy"]',
		next: true,
		skip: (g) => head(g) !== 'test',
	},
	{
		key: 'connect4',
		title: 'Flip the challenge card',
		body: 'Now tap “Draw a challenge card”.',
		target: () => '.commit-btn',
		done: (g) => g.lastTest?.name === 'Connect' && head(g) !== 'test',
		todo: 'Tap “Draw a challenge card”',
	},
	{
		key: 'clear',
		title: 'Cleared!',
		body: 'When a card gets as much progress as its threshold, it “clears” and leaves play. Hy sends you to the campaign guide: open the entry, read, and tap “Done reading”.',
		target: () => '.tray .prompt',
		done: (g) => head(g) !== 'guide',
		todo: 'Read the entry, then “Done reading”',
	},
	{
		key: 'rest',
		title: 'Rest',
		body: 'You have spent most of your energy. When you can’t do anything useful, tap Rest. When everyone has rested, the round ends.',
		target: () => '[data-act="rest"]',
		done: (g) => g.round >= 2 || head(g) === 'travel',
		todo: 'Tap Rest',
	},
	{
		key: 'travel',
		title: 'You could travel now',
		body: 'The station has 3 progress, so at the end of the round you may travel to a nearby place. Each path has its own terrain, which decides the cards you’ll meet there. Not yet: tap “Stay here” to see how a new round works — you’ll travel at the end.',
		target: () => '.stay-btn',
		done: (g) => head(g) !== 'travel',
		skip: (g) => head(g) !== 'travel',
		todo: 'Tap “Stay here”',
	},
	{
		key: 'refresh',
		title: 'A new round',
		body: 'At the end of the round you drew a card, got all your energy back, and everything that was used is ready again. Then a new path card came out.',
		target: () => '.mat.me .energy',
		next: true,
	},
	{
		key: 'obstacle',
		title: 'An obstacle',
		body: 'Overgrown Thicket is “along the way” (the middle of the table) and it is an Obstacle: nothing behind it can be reached, and while it is there you can’t travel. Traverse the thicket itself to put progress on it until it clears.',
		target: (g) => tileOf(g, 'Overgrown Thicket'),
		next: true,
	},
	{
		key: 'free',
		title: 'Your turn now',
		body: 'From here you play on your own: get Lone Tree Station to 3 progress and clear the obstacle, then rest and you can travel. The coach keeps suggesting a good move (it glows gold). Tap a card to see what you can do with it; hold it to read it.',
		next: true,
	},
]

/** The step the lesson should be on: skip steps whose moment has passed (their target is gone). */
export function lessonAt(g: Game, k: number): number {
	let i = k
	while (i < LESSON.length) {
		const s = LESSON[i]
		if ((s.target && s.target(g) === null && s.next) || s.skip?.(g)) i++
		else break
	}
	return i
}
