// Ranger card abilities that happen at a moment ("After you succeed at a Traverse test, …",
// "When you would suffer an injury, …"). The timing text is read into an `On` here; the engine
// fires events (engine.ts `fire`) and offers each matching ability to its Ranger.

/** Something that happened (or is about to). */
export type Ev =
	| { e: 'success'; ranger: number; test: string; target: number | null; effort: number; src: number | null; spirit: boolean }
	| { e: 'fatigue'; ranger: number; n: number }
	| { e: 'clear'; ranger: number; uid: number; how: string; host: number | null; words: string[]; presence: number }
	| { e: 'exhaustRole'; ranger: number }
	| { e: 'arrive'; ranger: number }
	| { e: 'travel'; ranger: number }
	| { e: 'rest'; ranger: number }
	| { e: 'play'; ranger: number; type: string; target: number | null }
	| { e: 'enters'; ranger: number; uid: number; words: string[] }
	| { e: 'wouldInjury'; ranger: number }
	| { e: 'wouldFatigue'; ranger: number; n: number }
	| { e: 'conduit'; ranger: number; n: number }

/** When an ability goes off. */
export interface On {
	ev: Ev['e']
	/** Only for the Ranger who controls the card ("you"). */
	you?: boolean
	/** Test names (lower case) for 'success'. */
	tests?: string[]
	spirit?: boolean
	/** The test / cleared card / entering card must be one of these (traits, types, names). */
	words?: string[]
	/** It must be the card this one is attached to. */
	attached?: boolean
	/** The test came from the card this one is attached to. */
	fromHost?: boolean
	minEffort?: number
	minN?: number
	by?: string
	minPresence?: number
	/** 'play': moment / attachment. */
	types?: string[]
	onPath?: boolean
}

const low = (s: string) => s.toLowerCase().trim()
const words = (s: string) =>
	low(s)
		.replace(/\b(a|an|the)\b/g, ' ')
		.split(/\s+or\s+/)
		.map((w) => w.trim().replace(/s$/, ''))
		.filter(Boolean)

/** "After you succeed at a Traverse test" → On (null when the game can't watch for it). */
export function readTiming(timing: string): On[] | null {
	const t = timing.replace(/^(After|When|Before)\s+/i, '').replace(/\bpertorm\b/g, 'perform').trim()
	let m: RegExpMatchArray | null
	// "a Ranger succeeds at a test with 4 or more effort or suffers 2 or more fatigue"
	if ((m = t.match(/^a Ranger succeeds at a test with (\d+) or more effort or suffers (\d+) or more fatigue$/i)))
		return [
			{ ev: 'success', minEffort: Number(m[1]) },
			{ ev: 'fatigue', minN: Number(m[2]) },
		]
	if ((m = t.match(/^(you|a Ranger) succeeds? at an? (?:(\w+)(?: or (\w+))? )?test(?: (that interacts with a spirit|from the attached gear|with (\d+) or more effort))?$/i))) {
		const on: On = { ev: 'success', you: low(m[1]) === 'you' }
		if (m[2] && low(m[2]) !== 'test') on.tests = [low(m[2]), ...(m[3] ? [low(m[3])] : [])]
		if (m[4] && /spirit/i.test(m[4])) on.spirit = true
		if (m[4] && /attached gear/i.test(m[4])) on.fromHost = true
		if (m[5]) on.minEffort = Number(m[5])
		return [on]
	}
	if ((m = t.match(/^you successfully (\w+) with (the attached being|an? [\w ]+)$/i))) {
		const on: On = { ev: 'success', you: true, tests: [low(m[1])] }
		if (/attached/i.test(m[2])) on.attached = true
		else on.words = words(m[2])
		return [on]
	}
	if ((m = t.match(/^(you|a Ranger) suffers? (\d+) or more fatigue$/i))) return [{ ev: 'fatigue', you: low(m[1]) === 'you', minN: Number(m[2]) }]
	if ((m = t.match(/^an? (path card|feature|being|[\w ]+?)(?: with (\d+) or more presence)? is cleared(?: (?:by|with) \[(progress|harm)\])?$/i)))
		return [{ ev: 'clear', words: /path card/i.test(m[1]) ? undefined : words(m[1]), minPresence: m[2] ? Number(m[2]) : undefined, by: m[3] }]
	if ((m = t.match(/^the attached (\w+) (?:is cleared|clears)(?: (?:by|with) \[(progress|harm)\])?$/i))) return [{ ev: 'clear', attached: true, words: words(m[1]), by: m[2] }]
	if (/^you exhaust your role$/i.test(t)) return [{ ev: 'exhaustRole', you: true }]
	if (/^you arrive at a location$/i.test(t)) return [{ ev: 'arrive' }]
	if (/^you travel$/i.test(t)) return [{ ev: 'travel' }]
	if ((m = t.match(/^(you|a Ranger) rests?$/i))) return [{ ev: 'rest', you: low(m[1]) === 'you' }]
	if ((m = t.match(/^you play an? (moment|attachment)(?: or (moment|attachment))?( on a path card)?$/i)))
		return [{ ev: 'play', you: true, types: [low(m[1]), ...(m[2] ? [low(m[2])] : [])], onPath: !!m[3] }]
	if ((m = t.match(/^(an? being|[A-Z][\w' ]+) enters play$/i))) return [{ ev: 'enters', words: /^an? being$/i.test(m[1]) ? ['being'] : [low(m[1])] }]
	if (/^you discard 1 or more tokens from a conduit$/i.test(t)) return [{ ev: 'conduit', you: true }]
	if ((m = t.match(/^(a Ranger|you) rests?$/i))) return [{ ev: 'rest', you: low(m[1]) === 'you' }]
	if (/^you would suffer an injury$/i.test(t)) return [{ ev: 'wouldInjury', you: true }]
	if (/^you would suffer 1 or more fatigue$/i.test(t)) return [{ ev: 'wouldFatigue', you: true }]
	if (/^you would suffer 1 or more fatigue or an injury while this spirit is within reach$/i.test(t))
		return [
			{ ev: 'wouldFatigue', you: true },
			{ ev: 'wouldInjury', you: true },
		]
	return null
}
