// Card text → effects the engine can run by itself.
// A clause is "[condition ⏩] steps". The condition may bind "that X" / "it" / "them";
// steps act on this card, that card, the location, your role, a chosen card or each card.
import type { Aspect } from '../data/data'

export interface Filter {
	words?: string[] // traits / types / names, any of them ("predator", "prey", "water feature", "sitka doe")
	active?: boolean
	exhausted?: boolean
	ready?: boolean
	zone?: 'reach' | 'along' | 'play' | 'reachAny'
	notSelf?: boolean
	notThat?: boolean
	harm?: number // has at least n harm
	path?: boolean // path cards only
	attachedToSelf?: boolean
}
export type Ref =
	| { r: 'self' }
	| { r: 'that' }
	| { r: 'location' }
	| { r: 'role' }
	| { r: 'target' }
	| { r: 'weather' }
	| { r: 'choose'; f: Filter; n?: number }
	| { r: 'each'; f: Filter }
	| { r: 'highest' | 'lowest'; f: Filter }
	| { r: 'named'; name: string }
	| { r: 'otherRanger' }
	| { r: 'host' }
	| { r: 'lastProgress' }
export type Amount =
	| { n: number }
	| { effort: true; per?: number; mult?: number }
	| { presence: 'self' | 'that' }
	| { aspect: Aspect }
	| { tokens: 'self' }
	| { all: true }
	| { same: true }
	/** Spirits within reach of the Ranger / along the way, plus n. */
	| { spirits: 'reach' | 'along'; plus: number }
	| { count: Filter; mult: number }
	/** n, plus `bonus` if a tale is attached to that Ranger's role. */
	| { n: number; tale: number }
export type Who = 'you' | 'each' | 'that' | 'onSelf' | 'choose'

export type Step =
	| { k: 'addTok' | 'remTok'; what: 'progress' | 'harm' | 'tokens'; amt: Amount; to: Ref }
	| { k: 'exhaust' | 'ready' | 'discard' | 'flip' | 'shuffleIn' | 'topOfPath' | 'faceDown'; to: Ref }
	| { k: 'move'; to: Ref; area?: 'reach' | 'along' | 'other' | 'sameAsThat'; ranger?: 'other'; noAmbush?: boolean }
	| { k: 'fatigue' | 'injury' | 'soothe' | 'heal' | 'drawRanger' | 'drawPath' | 'scoutPath' | 'scoutRanger' | 'scoutChallenge'; amt: Amount; who?: Who }
	| { k: 'fatiguesYou'; from: Ref }
	| { k: 'rangerToken'; to: Ref | { r: 'roleToken' }; each?: boolean }
	| { k: 'guide'; entry: string }
	| { k: 'searchPath'; f: Filter; then: 'discard' | 'play'; alsoDiscard?: boolean }
	| { k: 'searchSet'; set: string; f: Filter; then: 'shuffle' | 'play' | 'attachLocation'; n?: number }
	| { k: 'attach'; what: Ref; to: Ref; faceDown?: boolean }
	| { k: 'exhaustRole'; who?: Who }
	| { k: 'exhaustGear'; n: number }
	| { k: 'discardGear' }
	| { k: 'discardEnergy'; aspect?: Aspect; n: number; who?: Who }
	| { k: 'flipIf'; min?: number; max?: number }
	| { k: 'endDay'; reason: string }
	| { k: 'manual'; text: string }
	| { k: 'byChallenge'; sun: StepWhen[]; mountain: StepWhen[]; crest: StepWhen[] }
	| { k: 'either'; a: StepWhen[]; b: StepWhen[]; la: string; lb: string }
	| { k: 'energy'; n: number; aspect?: Aspect; gain: boolean }
	| { k: 'moveTok'; what: 'progress' | 'harm'; from: Ref; to: Ref; n?: number }
	| { k: 'fromDiscard'; id: string }
	| { k: 'extraPath'; n: number }
	| { k: 'endRound' }
	| { k: 'spiritspeak' }
	| { k: 'spiritTest' }
	| { k: 'searchDeck'; f: Filter }
	/** Pay for an ability: exhaust the card and/or use its tokens (the rest stops if it can't). */
	| { k: 'payCard'; uid: number; exhaust: boolean; use: number }
	/** Pay for a Response moment from hand and discard it. */
	| { k: 'payMoment'; id: string; ranger?: number }
	/** Fatigue / injury that can no longer be prevented. */
	| { k: 'hurt'; what: 'fatigue' | 'injury'; n: number; why: string }
	| { k: 'note'; text: string }
	| { k: 'record'; what: string; n: number }
	/** Move a card from your discard (matching words) to the top of your fatigue stack / your hand. */
	| { k: 'discardTo'; f: Filter; to: 'fatigue' | 'hand'; pick?: boolean }
	| { k: 'fatigueToDeck'; n: number }
	/** Place a card from your hand on top of your fatigue stack (optional), then `back` returns from discard to hand. */
	| { k: 'handToFatigue'; back?: string; to?: 'discard' }
	| { k: 'dropFatigue' }
	/** Run a whole effect (with its condition) right after this one. */
	| { k: 'effect'; eff: Effect }
	| { k: 'playFound'; discount: number; skipLast?: number }

/** A step with an optional condition ("If X, Y" in the middle of an effect). */
export type StepWhen = Step & { when?: Cond }

export type Cond =
	| { c: 'exists'; f: Filter; negate?: boolean; atLeast?: number; bind: boolean }
	| { c: 'selfZone'; zone: 'reach' | 'along'; negate?: boolean }
	| { c: 'selfTok'; what: 'harm' | 'progress' | 'tokens'; min?: number; max?: number; odd?: boolean }
	| { c: 'youFatigue'; min: number }
	| { c: 'injured' }
	| { c: 'tokenOnSelf'; negate?: boolean }
	| { c: 'selfAttached'; negate?: boolean }
	| { c: 'and'; all: Cond[] }
	| { c: 'or'; any: Cond[] }
	| { c: 'ask'; text: string }
	| { c: 'fatiguedTest' }
	| { c: 'addedProgress' }
	| { c: 'locTok'; min?: number; max?: number }
	| { c: 'location'; name: string }
	| { c: 'targetIs'; f: Filter }
	| { c: 'tokenOn'; f: Filter }
	| { c: 'thatZone'; zone: 'reach' | 'along' }
	| { c: 'turns'; negate?: boolean }
	| { c: 'spiritspeaking'; negate?: boolean }
	| { c: 'not'; x: Cond }

export interface Effect {
	/** Text as printed (flavor removed), for the log and the card viewer. */
	text: string
	cond?: Cond
	/** Steps before ⏩: if they can't be done, the rest doesn't happen. */
	pre: StepWhen[]
	steps: StepWhen[]
	/** True when nothing in it needs the player to do it by hand. */
	auto: boolean
}

// ------------------------------------------------------------------ helpers

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : (NUM[s.toLowerCase()] ?? 1))
const N = '(\\d+|a|an|one|two|three|four|five)'

const TYPO: [RegExp, string][] = [
	[/\bther\b/g, 'there'],
	[/\bthi\b/g, 'this'],
	[/\bmvoe\b/g, 'move'],
	[/\bpredato\b/g, 'predator'],
	[/\bbeinng\b/g, 'being'],
	[/\bprorgess\b/g, 'progress'],
	[/\bfaigues\b/g, 'fatigues'],
	[/\bif fatigues\b/g, 'it fatigues'],
	[/\bintop\b/g, 'into'],
	[/\bparth\b/g, 'path'],
	[/\bplat\b/g, 'play'],
	[/\bist\b/g, 'its'],
	[/\bfro\b/g, 'for'],
	[/\bsearche\b/g, 'search'],
	[/\byout\b/g, 'your'],
	[/\bcaards\b/g, 'cards'],
	[/\]to\b/g, '] to'],
]
export function normalize(s: string): string {
	let t = s
		.replace(/<f>[\s\S]*?<\/f>/g, ' ')
		.replace(/<\/?[a-z]+>/gi, '')
		.replace(/\[conditional\]/g, ' ⏩ ')
		.replace(/\s+/g, ' ')
		.trim()
	for (const [re, to] of TYPO) t = t.replace(re, to)
	return t
}

/** "predator", "an active predator", "prey or predator", "water feature" → filter words. */
function words(phrase: string): string[] {
	return phrase
		.toLowerCase()
		.replace(/\b(an?|the|other|another|active|ready|exhausted|in play|card|than this)\b/g, ' ')
		.split(/\s+or\s+|\s+and\s+|,\s*/)
		.map((w) => w.trim().replace(/s$/, ''))
		.filter(Boolean)
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const singular = (w: string) => w.replace(/(ies)$/, 'y').replace(/s$/, '')

function amountOf(s: string): Amount | null {
	let m: RegExpMatchArray | null
	if ((m = s.match(new RegExp(`${N}\\s*\\[?(?:progress|harm)\\]?[^.]*?for every (\\d+|)\\s*effort`, 'i')))) return { effort: true, mult: num(m[1]), per: m[2] ? Number(m[2]) : 1 }
	if ((m = s.match(/for every (\d+) effort/i))) return { effort: true, per: Number(m[1]), mult: 1 }
	if (/equal to your effort|equal to the effort/i.test(s)) return { effort: true }
	if (/equal to (?:that|the) [\w' ]+?'s presence|equal to their presence|equal to its presence|equal to that card's presence/i.test(s)) return { presence: 'that' }
	if (/equal to this \w+'s presence/i.test(s)) return { presence: 'self' }
	if ((m = s.match(/equal to your \[(AWA|FIT|FOC|SPI)\] aspect/i))) return { aspect: m[1].toUpperCase() as Aspect }
	if (/\ball\b/i.test(s)) return { all: true }
	if ((m = s.match(new RegExp(`\\b${N}\\b`, 'i')))) return { n: num(m[1]) }
	return null
}

/** Who/what a phrase points at. */
function refOf(p: string): Ref | null {
	const s = p.toLowerCase().trim().replace(/[.,]$/, '')
	if (/^(this|this \w+|this card|itself)$/.test(s)) return { r: 'self' }
	if (/^(it|them|they|him|her|that \w+( \w+)?|the \w+)$/.test(s) && !/^the location$|^the weather$/.test(s)) return { r: 'that' }
	if (/^(the location|this location)$/.test(s)) return { r: 'location' }
	if (/^the weather$/.test(s)) return { r: 'weather' }
	if (/^your role$/.test(s)) return { r: 'role' }
	let m: RegExpMatchArray | null
	if ((m = s.match(/^each (\w+) attached to this \w+$/))) return { r: 'each', f: { words: [singular(m[1])], attachedToSelf: true } }
	if ((m = s.match(/^each (other )?(.+?)( in play| in this area| within reach| along the way)?$/))) {
		const f: Filter = { words: words(m[2]) }
		if (m[1]) f.notSelf = true
		if (m[3] === ' within reach') f.zone = 'reach'
		if (m[3] === ' along the way') f.zone = 'along'
		if (/^(card|cards|path card)$/.test(m[2])) delete f.words
		return { r: 'each', f }
	}
	if ((m = s.match(/^(?:a|an|one|another) (active |exhausted |ready )?(.+?)( of your choice| in play| along the way| within reach)?$/))) {
		const f: Filter = { words: words(m[2]) }
		if (m[3] === ' along the way') f.zone = 'along'
		if (m[3] === ' within reach') f.zone = 'reach'
		if (m[1]?.trim() === 'active') f.active = true
		if (m[1]?.trim() === 'exhausted') f.exhausted = true
		if (m[1]?.trim() === 'ready') f.ready = true
		if (/another/.test(s)) f.notSelf = true
		if (/^(card|path card)$/.test(m[2])) {
			delete f.words
			if (/path/.test(m[2])) f.path = true
		}
		return { r: 'choose', f }
	}
	if (/^another ranger$/.test(s)) return { r: 'otherRanger' }
	if (/^the card that received it$/.test(s)) return { r: 'lastProgress' }
	if (/^the (being|card|feature) (it|this \w+) is attached to$/.test(s) || /^the attached (\w+)$/.test(s)) return { r: 'host' }
	if ((m = s.match(/^the (active |exhausted )?(\w+)( along the way| within reach)? with the (highest|lowest|lower|higher) presence$/))) {
		const f: Filter = { words: words(m[2]) }
		if (m[1]?.trim() === 'active') f.active = true
		if (m[1]?.trim() === 'exhausted') f.exhausted = true
		if (m[3]) f.zone = /reach/.test(m[3]) ? 'reach' : 'along'
		if (m[2] === 'card') delete f.words
		return { r: /high/.test(m[4]) ? 'highest' : 'lowest', f }
	}
	if ((m = s.match(/^the (active |exhausted )?(\w+) with the (highest|lowest|lower|higher) presence$/))) {
		const f: Filter = { words: words(m[2]) }
		if (m[1]?.trim() === 'active') f.active = true
		if (m[1]?.trim() === 'exhausted') f.exhausted = true
		return { r: /high/.test(m[3]) ? 'highest' : 'lowest', f }
	}
	if ((m = p.trim().match(/^([A-Z][\w'’]+(?: [A-Z][\w'’]+)*)$/))) return { r: 'named', name: m[1] }
	return null
}

// ------------------------------------------------------------------ sentences

/** One instruction → steps (null when not understood). */
export function sentence(raw: string): Step[] | null {
	let s = raw.trim().replace(/^then,?\s*/i, '').replace(/^you may\s+/i, '').replace(/\.$/, '').trim()
	if (!s) return []
	if (/^(x is|do not resolve|\(this alteration)/i.test(s)) return []
	let m: RegExpMatchArray | null
	// either: "Discard 2[progress] from this feature or suffer 1 injury"
	if ((m = s.match(/^(?:either )?(.+?) or (.+)$/i))) {
		const a = sentence(m[1])
		const b = sentence(m[2])
		if (a?.length && b?.length) return [{ k: 'either', a, b, la: cap(m[1]), lb: cap(m[2]) }]
	}
	if (/^this is in addition to the test's standard effect$/i.test(s)) return []
	if ((m = s.match(new RegExp(`^record ${N} (\\w+?)s?$`, 'i')))) return [{ k: 'record', what: m[2].toLowerCase(), n: num(m[1]) }]
	if ((m = s.match(/^(?:choose|place) an? (.+?) (?:card )?(?:in|from) your ranger discard and (?:place it on top of your fatigue stack|add it to your hand)$/i)))
		return [{ k: 'discardTo', f: { words: words(m[1]) }, to: /hand/i.test(s) ? 'hand' : 'fatigue', pick: true }]
	if ((m = s.match(new RegExp(`^shuffle (?:the top card|up to ${N} cards?|${N} cards?) (?:of|from) your fatigue stack into your (?:ranger )?deck$`, 'i')))) return [{ k: 'fatigueToDeck', n: m[1] ? num(m[1]) : m[2] ? num(m[2]) : 1 }]
	if ((m = s.match(/^move (.+?),? (?:treating it as if it does not have ambush|without ambush)$/i))) {
		const to = refOf(m[1])
		if (to) return [{ k: 'move', to, noAmbush: true }]
	}
	if ((m = s.match(new RegExp(`^move (?:up to )?${N}\\s*\\[(progress|harm)\\] from (.+?) to (.+?)(?: in the same area)?$`, 'i')))) {
		const from = refOf(m[3])
		const to = refOf(m[4])
		if (from && to) return [{ k: 'moveTok', what: m[2].toLowerCase() as 'progress', from, to, n: num(m[1]) }]
	}
	if ((m = s.match(/^add 1\[(progress|harm)\] for every (\d+) effort to (.+)$/i))) {
		const to = refOf(m[3])
		if (to) return [{ k: 'addTok', what: m[1].toLowerCase() as 'progress', amt: { effort: true, per: Number(m[2]), mult: 1 }, to }]
	}
	if ((m = s.match(/^add (\w+?)s? equal to your effort to (this card|this \w+)$/i))) return [{ k: 'addTok', what: 'tokens', amt: { effort: true }, to: { r: 'self' } }]
	if ((m = s.match(/^(?:discard|remove) all (?!\[)(\w+) from (this card|this \w+)$/i))) return [{ k: 'remTok', what: 'tokens', amt: { all: true }, to: { r: 'self' } }]
	// guide
	if ((m = s.match(/^\[guide\]\s*([\d.]+)$/i))) return [{ k: 'guide', entry: m[1].replace(/\.$/, '') }]

	// "Add [progress] to it and [harm] to this feature, (both) equal to that prey's presence"
	const both = s.match(/^add \[(progress|harm)\] ?to (it|them|that \w+) and \[(progress|harm)\] to (this \w+|it|them),? (?:both )?equal to (.+)$/i)
	if (both) {
		const amt = amountOf('equal to ' + both[5])
		const r1 = refOf(both[2])
		const r2 = refOf(both[4])
		if (amt && r1 && r2)
			return [
				{ k: 'addTok', what: both[1].toLowerCase() as 'progress', amt, to: r1 },
				{ k: 'addTok', what: both[3].toLowerCase() as 'harm', amt, to: r2 },
			]
	}
	if ((m = s.match(/^add (?:an equal amount of|the same amount of) \[(progress|harm)\] to (.+)$/i))) {
		const to = refOf(m[2])
		if (to) return [{ k: 'addTok', what: m[1].toLowerCase() as 'harm', amt: { same: true }, to }]
	}
	if ((m = s.match(new RegExp(`^add ${N}\\s*\\[harm\\] to both this and the other (.+)$`, 'i'))))
		return [
			{ k: 'addTok', what: 'harm', amt: { n: num(m[1]) }, to: { r: 'self' } },
			{ k: 'addTok', what: 'harm', amt: { n: num(m[1]) }, to: { r: 'that' } },
		]
	s = s.replace(/\[(harm|progress)\] on this /i, '[$1] to this ')
	// add / remove progress & harm
	if ((m = s.match(/^add (.+?) to (both )?(this|it|them|that \w+|the location|this location|a [\w ]+|an [\w ]+|each [\w ]+|the active \w+ with the \w+ presence|[A-Z][\w ]+)(?: (?:equal to|for every).*)?$/i)) && /\[(progress|harm)\]/.test(m[1] + s)) {
		const what = /\[harm\]/.test(m[1]) ? 'harm' : 'progress'
		// "add [progress] to it and [harm] to this feature, both equal to X's presence"
		const both = s.match(/^add \[(progress|harm)\] ?to (\w+(?: \w+)?) and \[(progress|harm)\] to (this \w+|it|them),? both equal to (.+)$/i)
		if (both) {
			const amt = amountOf('equal to ' + both[5])!
			const r1 = refOf(both[2])
			const r2 = refOf(both[4])
			if (amt && r1 && r2)
				return [
					{ k: 'addTok', what: both[1] as 'progress', amt, to: r1 },
					{ k: 'addTok', what: both[3] as 'harm', amt, to: r2 },
				]
		}
		const two = s.match(new RegExp(`^add ${N}\\s*\\[(progress|harm)\\] to (that \\w+|it|this \\w+) and ${N}\\s*\\[(progress|harm)\\] to (this \\w+|that \\w+|[A-Z]?\\w+)$`, 'i'))
		if (two) {
			const r1 = refOf(two[3])
			const r2 = refOf(two[6]) ?? { r: 'self' as const }
			if (r1)
				return [
					{ k: 'addTok', what: two[2].toLowerCase() as 'progress', amt: { n: num(two[1]) }, to: r1 },
					{ k: 'addTok', what: two[5].toLowerCase() as 'harm', amt: { n: num(two[4]) }, to: r2 },
				]
		}
		const amt = amountOf(s)
		const target = s
			.replace(/^add .*?\] ?(?:on |to )?/i, '')
			.replace(/^to /i, '')
			.replace(/ (equal to|for every).*$/i, '')
			.trim()
		const to = target ? refOf(target) : null
		if (amt && to) return [{ k: 'addTok', what, amt, to }]
		if (amt && /^add \[(progress|harm)\] equal to your effort$/i.test(s)) return [{ k: 'addTok', what, amt, to: { r: 'target' } }]
		return null
	}
	if ((m = s.match(/^add \[(progress|harm)\] equal to (.+?) to (.+)$/i))) {
		const amt = amountOf('equal to ' + m[2])
		const to = refOf(m[3])
		if (amt && to) return [{ k: 'addTok', what: m[1] as 'harm', amt, to }]
	}
	if ((m = s.match(new RegExp(`^(?:discard|remove|spend) (${N}|all)\\s*\\[(progress|harm)\\] from (.+)$`, 'i')))) {
		const to = refOf(m[4])
		if (to) return [{ k: 'remTok', what: m[3].toLowerCase() as 'harm', amt: m[1] === 'all' ? { all: true } : { n: num(m[1]) }, to }]
	}
	if ((m = s.match(/^(?:discard|remove) all \[(progress|harm)\] from (.+)$/i))) {
		const to = refOf(m[2])
		if (to) return [{ k: 'remTok', what: m[1] as 'harm', amt: { all: true }, to }]
	}
	// named tokens on this card
	if ((m = s.match(new RegExp(`^add ${N} (?!\\[)([a-z]+) (?:token )?to (this card|this \\w+|it|the location|this location|the weather)$`, 'i')))) {
		const to = refOf(m[3]) ?? { r: 'self' as const }
		return [{ k: 'addTok', what: 'tokens', amt: { n: num(m[1]) }, to }]
	}
	if ((m = s.match(new RegExp(`^(?:discard|remove) ${N} (?!\\[)([a-z]+) (?:token )?from (this card|this \\w+|the location|this location)( for every (\\d+) effort)?$`, 'i')))) {
		const to = refOf(m[3]) ?? { r: 'self' as const }
		return [{ k: 'remTok', what: 'tokens', amt: m[4] ? { effort: true, per: Number(m[5]), mult: num(m[1]) } : { n: num(m[1]) }, to }]
	}
	if ((m = s.match(new RegExp(`^(?:discard|remove) ${N} tokens? from (?:one of your equipped |an? )(\\w+)$`, 'i')))) return [{ k: 'remTok', what: 'tokens', amt: { n: num(m[1]) }, to: { r: 'choose', f: { words: [singular(m[2])] } } }]
	if ((m = s.match(/^add (\d+) (\w+) to this card$/i))) return [{ k: 'addTok', what: 'tokens', amt: { n: Number(m[1]) }, to: { r: 'self' } }]
	if ((m = s.match(new RegExp(`^add ${N} tokens? to (the attached \\w+|an? [\\w ]+?)$`, 'i')))) {
		const to = /attached/.test(m[2]) ? ({ r: 'host' } as Ref) : ({ r: 'choose', f: { words: words(m[2].replace(/ card$/, '')) } } as Ref)
		return [{ k: 'addTok', what: 'tokens', amt: { n: num(m[1]) }, to }]
	}
	// flip when tokens run out / pile up
	if (/^if there (?:are|is) no \w+(?: tokens?)?(?: remaining)?(?: on this card)?,? flip (?:this card|it)$/i.test(s)) return [{ k: 'flipIf', max: 0 }]
	if ((m = s.match(/^if there (?:are|is) (\d+) or more \w+(?: tokens?)?(?: on this card)?,? flip (?:this card|it)$/i))) return [{ k: 'flipIf', min: Number(m[1]) }]

	// exhaust / ready / discard / flip
	if ((m = s.match(/^(exhaust|ready|discard|flip) (.+)$/i))) {
		const verb = m[1].toLowerCase() as 'exhaust' | 'ready' | 'discard' | 'flip'
		if (/^your role$/i.test(m[2])) return verb === 'exhaust' ? [{ k: 'exhaustRole' }] : null
		if (verb === 'exhaust' && (m = m[2].match(new RegExp(`^${N} of your equipped gear$`, 'i')))) return [{ k: 'exhaustGear', n: num(m[1]) }]
		const rest = s.replace(/^\w+ /, '')
		if (verb === 'discard' && /^an equipped gear$/i.test(rest)) return [{ k: 'discardGear' }]
		if (verb === 'discard' && (m = rest.match(new RegExp(`^${N} (?:\\[(AWA|FIT|FOC|SPI)\\] )?energy$`, 'i')))) return [{ k: 'discardEnergy', n: num(m[1]), aspect: m[2]?.toUpperCase() as Aspect }]
		if (verb === 'flip' && /^this card( faceup)?$/i.test(rest)) return [{ k: 'flip', to: { r: 'self' } }]
		const nm = rest.match(new RegExp(`^${N} (.+)$`, 'i'))
		const to = refOf(rest) ?? (nm ? refOf('a ' + nm[2]) : null)
		if (to) return [{ k: verb, to }]
		return null
	}
	// moving cards
	if ((m = s.match(/^move (this|it|this \w+) within reach of another ranger$/i))) return [{ k: 'move', to: refOf(m[1])!, area: 'other' as const, ranger: 'other' } as Step]
	if ((m = s.match(/^move (.+?)(?: (within reach|along the way|to another area|to the same area as (?:that|the) \w+))?$/i)) && !/\[ranger\]/.test(m[1])) {
		const to = m[1].toLowerCase() === 'each being that is within reach' ? ({ r: 'each', f: { words: ['being'], zone: 'reach' } } as Ref) : refOf(m[1])
		const a = m[2]?.toLowerCase()
		const area = !a ? undefined : a === 'within reach' ? 'reach' : a === 'along the way' ? 'along' : a === 'to another area' ? 'other' : 'sameAsThat'
		if (to) return [{ k: 'move', to, area }]
	}
	if ((m = s.match(/^move all (\w+) along the way$/i))) return [{ k: 'move', to: { r: 'each', f: { words: [singular(m[1])] } }, area: 'along' }]
	if ((m = s.match(/^(shuffle) (this|it|this \w+|them) into the path deck$/i))) return [{ k: 'shuffleIn', to: refOf(m[2])! }]
	if ((m = s.match(/^shuffle each (\w+) in play into the path deck$/i))) return [{ k: 'shuffleIn', to: { r: 'each', f: { words: [singular(m[1])] } } }]
	if ((m = s.match(/^place (this|it|this \w+) on top of the path deck$/i))) return [{ k: 'topOfPath', to: refOf(m[1])! }]
	if ((m = s.match(/^attach (this|it|this being|this \w+) (facedown )?to (it|your role|that \w+|the location|this \w+|an? \w+)$/i)))
		return [{ k: 'attach', what: refOf(m[1])!, to: refOf(m[3])!, faceDown: !!m[2] }]

	// Ranger resources
	if ((m = s.match(new RegExp(`^(each ranger )?suffers? ${N} (fatigue|injur(?:y|ies))(?: as .*)?$`, 'i'))))
		return [{ k: /fatigue/i.test(m[3]) ? 'fatigue' : 'injury', amt: { n: num(m[2]) }, who: m[1] ? 'each' : 'you' }]
	if ((m = s.match(new RegExp(`^each ranger (?:with their|whose) \\[ranger\\] (?:is |was )?on (?:this|that) \\w+ suffers ${N} (fatigue|injur(?:y|ies))$`, 'i'))))
		return [{ k: /fatigue/i.test(m[2]) ? 'fatigue' : 'injury', amt: { n: num(m[1]) }, who: 'onSelf' }]
	if ((m = s.match(new RegExp(`^choose a ranger\\. that ranger soothes ${N} fatigue$`, 'i')))) return [{ k: 'soothe', amt: { n: num(m[1]) }, who: 'choose' }]
	if ((m = s.match(new RegExp(`^(?:if this \\w+ is within reach of a ranger, )?that ranger suffers ${N} (fatigue|injur(?:y|ies))$`, 'i'))))
		return [{ k: /fatigue/i.test(m[2]) ? 'fatigue' : 'injury', amt: { n: num(m[1]) }, who: 'that' }]
	if ((m = s.match(new RegExp(`^soothe (${N}|all of your) fatigue(?: for every (\\d+) effort)?$`, 'i'))))
		return [{ k: 'soothe', amt: m[3] ? { effort: true, per: Number(m[3]), mult: num(m[2]) } : /all/.test(m[1]) ? { n: 99 } : { n: num(m[2]) } }]
	if (/^soothe fatigue equal to your effort$/i.test(s)) return [{ k: 'soothe', amt: { effort: true } }]
	if ((m = s.match(new RegExp(`^heal ${N} injur(?:y|ies)$`, 'i')))) return [{ k: 'heal', amt: { n: num(m[1]) } }]
	if (/^heal all of your injuries$/i.test(s)) return [{ k: 'heal', amt: { n: 9 } }]
	if ((m = s.match(new RegExp(`^draw ${N} (?:additional )?(ranger|path) cards?$`, 'i')))) return [{ k: /ranger/i.test(m[2]) ? 'drawRanger' : 'drawPath', amt: { n: num(m[1]) } }]
	if ((m = s.match(new RegExp(`^scout ${N} (path|ranger|challenge) cards?( for every effort)?$`, 'i'))))
		return [{ k: m[2].toLowerCase() === 'path' ? 'scoutPath' : m[2].toLowerCase() === 'ranger' ? 'scoutRanger' : 'scoutChallenge', amt: m[3] ? { effort: true, mult: num(m[1]) } : { n: num(m[1]) } }]
	if ((m = s.match(/^scout (path|ranger) cards equal to your effort$/i))) return [{ k: m[1].toLowerCase() === 'path' ? 'scoutPath' : 'scoutRanger', amt: { effort: true } }]
	if ((m = s.match(/^(it|they|this \w+|that \w+|this card) fatigues? you$/i))) return [{ k: 'fatiguesYou', from: refOf(m[1])! }]

	// Ranger token
	if ((m = s.match(/^move your \[ranger\] to (this|it|this \w+|that \w+)$/i))) return [{ k: 'rangerToken', to: refOf(m[1])! }]
	if (/^(?:remove|return) your \[ranger\] (from this \w+|to your role)$/i.test(s)) return [{ k: 'rangerToken', to: { r: 'roleToken' } }]

	// searching
	if ((m = s.match(/^search the path deck( and discard)? for (?:the next |a |an )?(.+?)(?: and (discard it|put (?:it|them|her|him) into play))?$/i)))
		return [{ k: 'searchPath', f: { words: words(m[2]) }, then: m[3] && /discard/i.test(m[3]) ? 'discard' : 'play', alsoDiscard: !!m[1] }]
	if ((m = s.match(/^search the path discard and deck for (?:the next |a |an )?(.+?)(?: and put (?:it|them) into play)?$/i))) return [{ k: 'searchPath', f: { words: words(m[1]) }, then: 'play', alsoDiscard: true }]
	if ((m = s.match(new RegExp(`^search the ([A-Z][\\w -]*?) set for (?:${N} )?(.+?)(?: and (shuffle (?:it|them) into (?:the )?path deck|put (?:it|them|her|him) into play))?$`, 'i'))))
		return [{ k: 'searchSet', set: m[1], f: { words: words(m[3]) }, then: m[4] && /shuffle/i.test(m[4]) ? 'shuffle' : 'play', n: m[2] ? num(m[2]) : 1 }]

	if ((m = s.match(/^each ranger exhausts their role$/i))) return [{ k: 'exhaustRole', who: 'each' }]
	if (/^each ranger moves their \[ranger\] to (it|this \w+)$/i.test(s)) return [{ k: 'rangerToken', to: { r: 'self' }, each: true } as Step]
	if (/^choose a ranger$/i.test(s)) return []
	if (/^spiritspeak$/i.test(s)) return [{ k: 'spiritspeak' }]
	if (/^perform a spirit speaker test$/i.test(s)) return [{ k: 'spiritTest' }]
	if ((m = s.match(/^search your (?:ranger )?deck for an? (.+?) and add it to your hand$/i))) return [{ k: 'searchDeck', f: { words: words(m[1]) } }]
	if ((m = s.match(new RegExp(`^(spend|gain) ${N} (?:\\[(AWA|FIT|FOC|SPI)\\] )?energy(?: of any type)?$`, 'i'))))
		return [{ k: 'energy', n: num(m[2]), aspect: m[3]?.toUpperCase() as Aspect | undefined, gain: m[1].toLowerCase() === 'gain' }]
	if ((m = s.match(new RegExp(`^gain ${N} \\[?(AWA|FIT|FOC|SPI)\\]?$`, 'i')))) return [{ k: 'energy', n: num(m[1]), aspect: m[2].toUpperCase() as Aspect, gain: true }]
	if ((m = s.match(/^move all \[(progress|harm)\] from (.+?) to (.+)$/i))) {
		const from = refOf(m[2])
		const to = refOf(m[3])
		if (from && to) return [{ k: 'moveTok', what: m[1].toLowerCase() as 'progress', from, to }]
	}
	// "Add 1[harm] to a flora to add 3[progress] to a trail": pay, then the effect
	if ((m = s.match(/^(.+?) to (add|soothe|exhaust|move|draw|scout|heal|gain|ready|discard|search|suffer|return|attach|commit|dodge|spiritspeak) ?(.*)$/i)) && /^(add|discard|spend|suffer|exhaust|remove|use|return)\b/i.test(m[1])) {
		const a = sentence(m[1])
		const b = sentence(`${m[2]} ${m[3]}`.trim())
		if (a?.length && b?.length) return [...a, ...b]
	}
	if ((m = s.match(new RegExp(`^that ranger (soothes|suffers|draws) ${N} (fatigue|injur(?:y|ies)|ranger cards?)$`, 'i'))))
		return [{ k: m[1].toLowerCase() === 'soothes' ? 'soothe' : m[1].toLowerCase() === 'draws' ? 'drawRanger' : /fatigue/i.test(m[3]) ? 'fatigue' : 'injury', amt: { n: num(m[2]) }, who: 'choose' }]
	if ((m = s.match(/^draw (\d+) challenge card and do the following based on the challenge icon on that card:?$/i))) return [{ k: 'manual', text: '' }]
	return null
}

// ------------------------------------------------------------------ conditions

export function condition(raw: string): Cond | null {
	const s = raw.trim().replace(/^if\s+/i, '').replace(/[.,]$/, '').trim()
	let m: RegExpMatchArray | null
	// "a and b"
	if (/, and | and you have /i.test(s)) {
		const parts = s.split(/,? and (?=you have|there is|this|a ranger|your)/i)
		if (parts.length > 1) {
			const all = parts.map((p) => condition(p))
			if (all.every(Boolean)) return { c: 'and', all: all as Cond[] }
		}
	}
	if ((m = s.match(/^this \w+ is within reach of (?:a|any) ranger$/i))) return { c: 'selfZone', zone: 'reach' }
	if (/^you suffered fatigue during this test$/i.test(s)) return { c: 'fatiguedTest' }
	if ((m = s.match(/^(?:it|that \w+) is (within reach|along the way)$/i))) return { c: 'thatZone', zone: /reach/i.test(m[1]) ? 'reach' : 'along' }
	if ((m = s.match(/^it is (not )?a Ranger's turn$/i))) return { c: 'turns', negate: !!m[1] }
	if ((m = s.match(/^you are (not )?spiritspeaking$/i))) return { c: 'spiritspeaking', negate: !!m[1] }
	if ((m = s.match(/^(.+?) is the current location$/i))) return { c: 'location', name: m[1] }
	if ((m = s.match(/^you are interacting with an? (.+)$/i))) return { c: 'targetIs', f: { words: words(m[1]) } }
	if ((m = s.match(/^your \[ranger\] is on an? (.+)$/i))) return { c: 'tokenOn', f: { words: words(m[1]) } }
	if (/^this test added \[progress\]$/i.test(s)) return { c: 'addedProgress' }
	if ((m = s.match(/^there (?:is|are) (no|an?|another|other|)\s*(active |exhausted |ready )?(.+?)(?: (in play|along the way|within reach))?$/i)) && !/^\d/.test(m[3])) {
		const f: Filter = { words: words(m[3]) }
		const st = m[2]?.trim().toLowerCase()
		if (st === 'active') f.active = true
		if (st === 'exhausted') f.exhausted = true
		if (st === 'ready') f.ready = true
		if (/another|other/i.test(m[1]) || /\bother\b/i.test(m[3])) f.notSelf = true
		if (/\bactive\b/i.test(m[3])) f.active = true
		if (m[4] === 'along the way') f.zone = 'along'
		if (m[4] === 'within reach') f.zone = 'reach'
		if (/ with any \[harm\]$/i.test(m[3])) {
			f.words = words(m[3].replace(/ with any \[harm\]$/i, ''))
			f.harm = 1
		}
		if (/^(card|cards|being|feature)$/i.test(m[3].trim())) f.words = [singular(m[3].trim().toLowerCase())]
		return { c: 'exists', f, negate: m[1].toLowerCase() === 'no', bind: m[1].toLowerCase() !== 'no' }
	}
	if ((m = s.match(/^(.+?) is not in play$/i))) return { c: 'exists', f: { words: words(m[1]) }, negate: true, bind: false }
	if ((m = s.match(/^there are no (.+?) in play$/i))) {
		return { c: 'exists', f: { words: words(m[1]) }, negate: true, bind: false }
	}
	if ((m = s.match(/^there are (\d+) or more (active )?(.+?)( in play)?$/i))) {
		const f: Filter = { words: words(m[3]) }
		if (m[2]) f.active = true
		return { c: 'exists', f, atLeast: Number(m[1]), bind: true }
	}
	if ((m = s.match(/^(?:this|it|this \w+) is (not )?(within reach|along the way)$/i))) return { c: 'selfZone', zone: /reach/.test(m[2]) ? 'reach' : 'along', negate: !!m[1] }
	if ((m = s.match(/^(?:this \w+|it) has (\d+) or more \[(harm|progress)\]$/i)) || (m = s.match(/^there (?:is|are) (\d+) or more \[(harm|progress)\] on this \w+$/i)))
		return { c: 'selfTok', what: m[2] as 'harm', min: Number(m[1]) }
	if ((m = s.match(/^there is an odd number of \[(progress|harm)\] on this \w+$/i))) return { c: 'selfTok', what: m[1] as 'harm', odd: true }
	if ((m = s.match(/^there (?:is|are) (\d+) or more (?!\[)(\w+)(?: tokens?)? on this \w+$/i))) return { c: 'selfTok', what: 'tokens', min: Number(m[1]) }
	if ((m = s.match(/^there (?:is|are) no (?!\[)(\w+)(?: tokens?)?(?: remaining)? on this \w+$/i))) return { c: 'selfTok', what: 'tokens', max: 0 }
	if ((m = s.match(/^there (?:is|are) (\d+) or more (?!\[)(\w+)(?: tokens?)? on the location$/i))) return { c: 'locTok', min: Number(m[1]) }
	if ((m = s.match(/^there (?:is|are) no (?!\[)(\w+)(?: tokens?)? on the location$/i))) return { c: 'locTok', max: 0 }
	if ((m = s.match(/^you have (\d+) or more fatigue$/i))) return { c: 'youFatigue', min: Number(m[1]) }
	if (/^a ranger is injured$/i.test(s)) return { c: 'injured' }
	if ((m = s.match(/^(?:your|a|s) \[ranger\] is (not )?on this \w+$/i))) return { c: 'tokenOnSelf', negate: !!m[1] }
	if ((m = s.match(/^this \w+ is (not )?attached(?: to a being)?$/i))) return { c: 'selfAttached', negate: !!m[1] }
	if ((m = s.match(/^(.+?) is in play$/i))) return { c: 'exists', f: { words: words(m[1]) }, bind: true }
	return null
}

/** A whole effect line (challenge effect, test result, clear, refresh…). */
export function effect(rawIn: string): Effect {
	const t = normalize(rawIn)
	const text = t
	let condText: string | undefined
	let body = t
	const ci = t.indexOf('⏩')
	if (ci >= 0) {
		condText = t.slice(0, ci).trim()
		body = t.slice(ci + 1).trim()
	}
	let cond: Cond | undefined
	let pre: StepWhen[] = []
	let auto = true
	const VERB = '(?:add|exhaust|ready|draw|soothe|suffer|heal|move|discard|scout|search|attach|remove|return|shuffle|place|flip|record|each ranger)'
	const clauses = (b: string) =>
		b
			.split(new RegExp(`,? and (?=${VERB}\\b)|,\\s+(?=${VERB}\\b)`, 'i'))
			.map((p) => p.trim())
			.filter(Boolean)
	const parseSteps = (b: string): StepWhen[] => {
		const out: StepWhen[] = []
		const sentences = b
			.replace(/path deck and discard/gi, 'path deck+discard')
			.replace(/path discard and deck/gi, 'path deck+discard')
			.replace(/\[guide\]\s*([\d.]+)/g, ' [guide] $1.')
			.split(/\.\s+|\.$|,\s*then,?\s+|;\s*|\s+then,?\s+(?=[a-z])/i)
			.map((p) => p.trim().replace(/path deck\+discard/gi, 'path deck and discard'))
			.filter(Boolean)
		for (const sen of sentences) {
			let when: Cond | undefined
			let body = sen
			const ic = sen.match(/^if (.+?),\s*(.+)$/i)
			if (ic && !/^if there (?:are|is) (no|\d+ or more) \w+(?: tokens?)?(?: remaining)?(?: on this card)?,? flip/i.test(sen)) {
				const c = condition(ic[1])
				if (c) {
					when = c
					body = ic[2]
				} else {
					auto = false
					out.push({ k: 'manual', text: sen })
					continue
				}
			}
			const whole = sentence(body)
			const parts = whole ? [whole] : clauses(body).map((x) => sentence(x) ?? ([{ k: 'manual', text: x }] as StepWhen[]))
			for (const st of parts)
				for (const x of st) {
					if (x.k === 'manual') auto = false
					out.push(when ? ({ ...x, when } as StepWhen) : x)
				}
		}
		return out
	}
	if (condText) {
		// "If there is an active predator, exhaust it" → condition + pre-steps
		const m = condText.match(/^if (.+?)(?:,\s*(.+))?$/i)
		if (m) {
			const c = condition(m[1])
			if (c) cond = c
			else {
				cond = { c: 'ask', text: m[1] }
			}
			if (m[2]) pre = parseSteps(m[2])
		} else pre = parseSteps(condText)
	} else {
		const m = body.match(/^if (.+?),\s*(.+)$/i)
		if (m && !/flip (this card|it)$/i.test(body)) {
			const c = condition(m[1])
			if (c) {
				cond = c
				body = m[2]
			}
		}
	}
	const steps = parseSteps(body)
	return { text, cond, pre, steps, auto }
}


