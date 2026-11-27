import type { Aspect } from '../data/data'
import type { Effect, Step } from './dsl'
import type { Sym } from './text'

/** Where a card in play sits. */
export type Zone = 'surroundings' | 'along' | 'reach' | 'player' | 'attached'

/** A card in play. */
export interface Inst {
	uid: number
	id: string
	side: 'A' | 'B'
	exhausted: boolean
	progress: number
	harm: number
	/** Named card tokens (charges, clouds, rain…), all counted as one number. */
	tokens: number
	zone: Zone
	/** For 'reach' and 'player': which Ranger. */
	owner: number | null
	attachedTo: number | null
	faceDown?: boolean
	/** Ranger card: whose deck it goes back to. */
	deckOf?: number
	kind: 'path' | 'ranger' | 'location' | 'weather' | 'mission' | 'role'
	/** A path moment that stays (placed in the surroundings) instead of being discarded. */
	kept?: boolean
	/** Clearing: its Clear effects are resolving; it's discarded after them if it still has enough tokens. */
	clearing?: 'progress' | 'harm' | 'ranger'
}

export interface Ranger {
	name: string
	role: string
	roleUid: number
	aspectCard: string
	aspects: Record<Aspect, number>
	deck: string[]
	hand: string[]
	discard: string[]
	fatigue: string[]
	energy: Record<Aspect, number>
	injuries: number
	rested: boolean
	/** uid of the card the Ranger token is on; null = on the role card. */
	token: number | null
	/** Card list the deck was built from (for the campaign). */
	deckList: string[]
	/** Stewards of the Valley: spiritspeaking (Spirit Speaker tests replace the common tests until the role readies). */
	spiritspeak?: boolean
	/** Descendant of the Guide: one Spirit Speaker test may be performed. */
	spiritOnce?: boolean
}

/** An effect being carried out (card text the engine runs step by step). */
export interface Job {
	title: string
	eff: Effect
	src: number | null
	ranger: number
	effort: number
	/** The card the test interacted with. */
	target: number | null
	/** Cards bound by the condition ("that predator", "it"). */
	that: number[] | null
	stage: 'cond' | 'pre' | 'steps'
	i: number
	/** Answers to choices, by "stage:index". */
	picks: Record<string, number[]>
	/** Answer to an "ask" condition. */
	asked?: boolean
	/** Fully internal job (end of test, new round…). */
	sys?: 'finishTest' | 'newRound' | 'endTurn' | 'momentDone' | 'drawPath' | 'moments' | 'readyAll' | 'clearDone'
	/** A challenge effect: skipped if its card was cleared or exhausted earlier in the test. */
	chal?: boolean
	/** finishTest of a path moment's test: no turn ends. */
	noTurn?: boolean
	/** Answer to a choice with more than two options. */
	option?: number
	challenge?: number
	/** An instruction before ⏩ couldn't be done. */
	failed?: boolean
	/** Amount used by the last "add" step ("an equal amount"). */
	lastAmt?: number
}
export interface LastTest {
	name: string
	ranger: number
	effort: number
	base: number
	mod: number
	diff: number
	success: boolean
	challenge: number
	symbol: Sym
}

export type Prompt =
	| { kind: 'mulligan'; ranger: number }
	| {
			kind: 'test'
			ranger: number
			src: number | null
			test: number | string
			target: number | null
			aspect: Aspect
			approach: string
			name: string
			diff: number
			fatigued: number
			/** A path moment's test (index into its momentTests): not a turn, can't be cancelled. */
			mt?: number
			/** Group test: every Ranger may commit energy and icons. */
			group?: boolean
	  }
	| { kind: 'choose'; title: string; text: string; options: number[]; min: number; max: number; key: string; ranger: number }
	/** Pick a card in a Ranger's hand (or discard pile). */
	| { kind: 'pickHand'; title: string; text: string; ranger: number; key: string; from: 'hand' | 'discard'; options: number[]; optional: boolean }
	| { kind: 'ask'; title: string; text: string; ranger: number; yes?: string; no?: string; /** More than two choices (A / B / C). */ options?: string[] }
	| { kind: 'manual'; title: string; text: string; ranger: number }
	| { kind: 'aspect'; title: string; text: string; ranger: number; options: Aspect[]; key: string }
	| { kind: 'guide'; entry: string; why: string; /** Pack of the card that sent you (which guide). */ pack?: string }
	| { kind: 'scout'; ranger: number; deck: 'path' | 'ranger' | `side:${string}`; cards: string[]; drawAfter?: number }
	| { kind: 'equip'; ranger: number }
	| { kind: 'travel' }
	| { kind: 'dayOver'; reason: string }

export interface Game {
	v: 1
	rng: { seed: number }
	day: number
	rangers: Ranger[]
	/** Packs whose path cards are in use (Core + Spire in Bloom / Shadow of the Storm). */
	packs?: string[]
	/** Extra decks beside the path deck: the Spire deck, the Otherworld deck, the detritus deck… */
	decks?: Record<string, string[]>
	/** Aspiration records made today, by name ("seed", "improvement"…) and Ranger. */
	records?: { ranger: number; what: string; n: number }[]
	inst: Record<number, Inst>
	next: number
	pathDeck: string[]
	pathDiscard: string[]
	challenge: number[]
	challengeDiscard: number[]
	round: number
	phase: 'setup' | 'path' | 'turns' | 'travel' | 'refresh' | 'over'
	lead: number
	/** Ranger who took the last turn this round. */
	lastTurn: number | null
	/** Ranger whose test/play is being resolved. */
	acting: number | null
	location: number
	terrain: string
	weather: number[]
	missions: number[]
	queue: Prompt[]
	log: string[]
	/** Set when a third injury happens: the day ends after this turn. */
	endAfterTurn?: string
	ended?: { reason: string; camp: boolean }
	/** Cards the Rangers can add to their decks at camp (campaign rewards). */
	rewards: string[]
	/** Rangers that suffered a third injury today (each adds a Lingering Injury). */
	lingering: number[]
	/** Effects being carried out, first one runs. */
	jobs: Job[]
	lastTest: LastTest | null
	/** Cards dodged / at presence 0 during the current test. */
	dodge?: number[]
	zeroPresence?: number[]
	fatiguedThisTest?: number
	/** Card that last got progress during the current test. */
	progressTo?: number | null
	/** Extra path cards the lead Ranger draws next round. */
	extraPath?: number
	/** The path moment being resolved (Moments on the Path). */
	moment?: number | null
}

export type Intent =
	| { t: 'keep'; ranger: number; mulligan?: number[]; setup?: string }
	| { t: 'test'; ranger: number; src: number | null; test: number | string; target?: number | null; useRole?: boolean }
	| {
			t: 'commit'
			energy: number
			discards: number[]
			extra: number
			diff?: number
			dodgeRole?: boolean
			buffers?: number
			boosts?: number[]
			swap?: boolean
			responses?: number[]
			/** Keys of TestOptions.extras to use. */
			extras?: string[]
			versatile?: number[]
			/** Group tests: what the other Rangers commit. */
			others?: { ranger: number; energy: number; discards: number[] }[]
	  }
	| { t: 'cancelTest' }
	| { t: 'choose'; uids: number[] }
	| { t: 'pickHand'; index: number | null }
	| { t: 'answer'; yes: boolean; pick?: number }
	| { t: 'manualDone' }
	| { t: 'aspect'; a: Aspect }
	| { t: 'guideRead' }
	| { t: 'scouted'; top: string[]; bottom: string[] }
	| { t: 'play'; ranger: number; hand: number; target?: number | null; x?: number; useRole?: boolean }
	| { t: 'ability'; ranger: number; uid: number; line: number; useRole?: boolean }
	| { t: 'rest'; ranger: number }
	| { t: 'travel'; to: string; camp: boolean }
	| { t: 'stay' }
	| { t: 'endDay'; reason: string }
	| { t: 'manual'; op: ManualOp }

export type ManualOp =
	| { op: 'tokens'; uid: number; what: 'progress' | 'harm' | 'tokens'; delta: number }
	| { op: 'exhaust'; uid: number }
	| { op: 'move'; uid: number; zone: 'along' | 'reach' | 'surroundings' | 'player'; owner?: number }
	| { op: 'discard'; uid: number }
	| { op: 'flip'; uid: number }
	| { op: 'attach'; uid: number; to: number; faceDown?: boolean }
	| { op: 'toHand'; uid: number }
	| { op: 'shuffleIn'; uid: number }
	| { op: 'rangerToken'; ranger: number; to: number | null }
	| { op: 'fatigue' | 'soothe' | 'injure' | 'heal' | 'drawRanger' | 'drawPath'; ranger: number; n: number }
	| { op: 'scoutPath'; ranger: number; n: number }
	| { op: 'scoutRanger'; ranger: number; n: number }
	| { op: 'energy'; ranger: number; aspect: Aspect; delta: number }
	| { op: 'discardHand'; ranger: number; index: number }
	| { op: 'search'; from: 'pathDeck' | 'pathDiscard' | 'collection' | 'rangerDeck' | 'rangerDiscard'; id: string; ranger: number; place: 'play' | 'hand' | 'shuffle' | 'discard' | 'top' | 'along' | 'reach' }
	| { op: 'mission'; id: string; side?: 'A' | 'B' }
	| { op: 'removeMission'; uid: number }
	| { op: 'weather'; id: string }
	| { op: 'ready'; uid: number }
	| { op: 'note'; text: string }

export type { Step }
