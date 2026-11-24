import type { Aspect } from '../data/data'
import type { Action, Clause, Sym } from './text'

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
}

export interface ResolveItem {
	/** Card the text comes from (null = game rule). */
	src: number | null
	title: string
	clause: Clause
	/** Actions already applied for the player. */
	auto: boolean
	done: boolean[]
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
	  }
	| {
			kind: 'resolve'
			title: string
			ranger: number
			effort: number
			items: ResolveItem[]
			/** For tests: what happened (shown at the top). */
			result?: { effort: number; diff: number; success: boolean; challenge: number; mod: number; base: number; symbol: Sym }
			after?: 'test' | 'play' | 'refresh' | 'none'
	  }
	| { kind: 'guide'; entry: string; why: string }
	| { kind: 'scout'; ranger: number; deck: 'path' | 'ranger'; cards: string[]; drawAfter?: number }
	| { kind: 'equip'; ranger: number }
	| { kind: 'travel' }
	| { kind: 'dayOver'; reason: string }

export interface Game {
	v: 1
	rng: { seed: number }
	day: number
	rangers: Ranger[]
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
}

export type Intent =
	| { t: 'keep'; ranger: number; mulligan?: number[]; setup?: string }
	| { t: 'test'; ranger: number; src: number | null; test: number | string; target?: number | null; useRole?: boolean }
	| { t: 'commit'; energy: number; discards: number[]; extra: number; diff?: number }
	| { t: 'cancelTest' }
	| { t: 'act'; item: number; action: number; target?: number | null; ranger?: number }
	| { t: 'resolved' }
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

export type { Action }
