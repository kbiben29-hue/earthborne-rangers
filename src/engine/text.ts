// Reads card text (DragnCards markup) into tests, challenge effects, clear effects and
// simple actions the game can do for you. Anything it can't read is shown to the player
// with buttons to do it by hand.
import type { Aspect, Approach } from '../data/data'

export type Sym = 'sun' | 'mountain' | 'crest'

/** How many: a fixed number, or worked out from the test's effort. */
export type Amount = { n: number } | { effort: true; per?: number; mult?: number } | { presence: true }

export type Action =
	| { kind: 'progress' | 'harm'; amount: Amount; to: 'self' | 'location' | 'target' | 'choose' }
	| { kind: 'removeProgress' | 'removeHarm'; amount: Amount; to: 'self' | 'location' }
	| { kind: 'exhaust' | 'ready' | 'discard' | 'flip'; to: 'self' | 'target' | 'role' | 'choose' }
	| { kind: 'move'; to: 'self' | 'choose'; area?: 'reach' | 'along' }
	| { kind: 'fatigue' | 'injury' | 'soothe' | 'heal' | 'drawRanger' | 'drawPath' | 'scoutPath' | 'scoutRanger'; amount: Amount; who?: 'each' }
	| { kind: 'selfFatigues' }
	| { kind: 'tokens'; amount: Amount; add: boolean }
	| { kind: 'rangerToken'; to: 'self' | 'role' }
	| { kind: 'guide'; entry: string }
	| { kind: 'searchPath'; what: string; then: 'discard' | 'play' }
	| { kind: 'flipIf'; min?: number; max?: number }
	| { kind: 'searchSet'; set: string; name: string; then: 'shuffle' | 'play' }

export interface Clause {
	/** Text shown to the player (flavor removed). */
	text: string
	/** Condition before the ⏩ icon, if any. */
	cond?: string
	actions: Action[]
	/** True when every sentence was understood, so the game can just do it. */
	complete: boolean
	/** How many leading actions come from understood, unconditional sentences (safe to do at once). */
	lead?: number
	/** Actions before the ⏩ that must succeed for the rest to happen (e.g. "Discard 1 rain"). */
	pre?: number
}

export interface TestDef {
	aspect: Aspect
	approach: Approach
	name: string
	diff: number | 'X'
	/** What happens when you succeed. */
	effect: Clause
	/** What happens when you fail ("If you fail, ..."). */
	fail?: Clause
	/** Effects that happen either way. */
	always?: Clause
	/** "(use 1 graph)": tokens spent to perform the test. */
	use?: number
	raw: string
}

export interface Parsed {
	keywords: string[]
	tests: TestDef[]
	challenge: Partial<Record<Sym, Clause>>
	clear: { on: string; effect: Clause }[]
	refresh?: Clause
	startOfDay?: Clause
	arrival: string[]
	guide?: string
	other: string[]
}

export const stripTags = (s: string) =>
	s
		.replace(/<f>[\s\S]*?<\/f>/g, ' ')
		.replace(/<\/?[a-z]+>/gi, '')
		.replace(/\s+/g, ' ')
		.trim()

/** Same as stripTags but keeps the flavor words (for display). */
export const plainText = (s: string) =>
	s
		.replace(/<\/?[a-z]+>/gi, '')
		.replace(/[ \t]+/g, ' ')
		.trim()

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 }
const toN = (s: string) => (/^\d+$/.test(s) ? Number(s) : (NUM[s.toLowerCase()] ?? 1))

function amountFrom(s: string): Amount | null {
	let m = s.match(/(\d+)\s*\[?(?:progress|harm)\]?\s*(?:to [^.]*?)?\s*for every (\d+) effort/i)
	if (m) return { effort: true, mult: Number(m[1]), per: Number(m[2]) }
	m = s.match(/for every (\d+) effort/i)
	if (m) return { effort: true, per: Number(m[1]), mult: 1 }
	if (/equal to your effort/i.test(s)) return { effort: true }
	if (/equal to (?:its|this \w+'s|their) presence/i.test(s)) return { presence: true }
	m = s.match(/\b(\d+|a|an|one|two|three)\b/i)
	if (m) return { n: toN(m[1]) }
	return null
}

/** Understands one sentence. Returns null if it can't. */
function sentence(sRaw: string): Action[] | null {
	const s = sRaw.trim().replace(/\.$/, '')
	if (!s) return []
	if (/^(X is|Do not resolve|\(This)/i.test(s)) return []
	const out: Action[] = []
	const guide = s.match(/\[guide\]\s*([\d.]+)/)
	if (guide && stripTags(s).replace(/\[guide\]\s*[\d.]+/, '').trim().length < 3) return [{ kind: 'guide', entry: guide[1] }]

	let m: RegExpMatchArray | null
	// add N [progress]/[harm] to this / the location / it
	if ((m = s.match(/^add (.+?)\s*\[(progress|harm)\]\s*(?:to )?(.*)$/i)) || (m = s.match(/^add \[(progress|harm)\] (?:to )?(.*?) equal to (.*)$/i))) {
		const kind = (m[2] === 'progress' || m[2] === 'harm' ? m[2] : m[1]) as 'progress' | 'harm'
		const amount = amountFrom(s)
		const rest = s.toLowerCase()
		const to = !/ to /.test(rest.replace(/equal to [^,.]*/, ''))
			? 'choose'
			: /to the location/.test(rest)
			? 'location'
			: /to (this|it\b)/.test(rest) || /^add \[(progress|harm)\] to this/.test(rest)
				? 'self'
				: /to a |to an |to each |to that /.test(rest)
					? 'choose'
					: 'self'
		if (amount && !/ and /.test(rest.replace(/equal to [^,.]*/, ''))) return [{ kind, amount, to }]
		return null
	}
	if ((m = s.match(/^search the ([A-Z][\w -]*?) set for (?:a |an |the )?(.+?) and (shuffle (?:it|them) into (?:the )?path deck|put (?:it|them|her|him) into play)$/i)))
		return [{ kind: 'searchSet', set: m[1], name: m[2].replace(/^\d+ /, ''), then: /shuffle/i.test(m[3]) ? 'shuffle' : 'play' }]
	if ((m = s.match(/^search the path deck (?:and discard )?for the next ([a-z ]+?)(?: and (discard it|put (?:it|them) into play))?$/i)))
		return [{ kind: 'searchPath', what: m[1].trim(), then: m[2] && /discard/i.test(m[2]) ? 'discard' : 'play' }]
	if ((m = s.match(/^discard (\d+|a|an|one|two)\s*\[(progress|harm)\] from (this|the location)/i)))
		return [{ kind: m[2] === 'progress' ? 'removeProgress' : 'removeHarm', amount: { n: toN(m[1]) }, to: /location/.test(m[3]) ? 'location' : 'self' }]
	if (/^(exhaust|ready) (this|it|them)\b[^,]*$/i.test(s)) return [{ kind: /^exhaust/i.test(s) ? 'exhaust' : 'ready', to: 'self' }]
	if (/^exhaust your role$/i.test(s)) return [{ kind: 'exhaust', to: 'role' }]
	if (/^(exhaust|ready) (a|an|one|that|another) /i.test(s)) return [{ kind: /^exhaust/i.test(s) ? 'exhaust' : 'ready', to: 'choose' }]
	if (/^discard (this|it)\b/i.test(s)) return [{ kind: 'discard', to: 'self' }]
	if (/^flip this card$/i.test(s)) return [{ kind: 'flip', to: 'self' }]
	if ((m = s.match(/^if there (?:are|is) no \w+(?: tokens?)?(?: remaining)?(?: on this card)?,? flip this card$/i))) return [{ kind: 'flipIf', max: 0 }]
	if ((m = s.match(/^if there are (\d+) or more \w+(?: tokens?)?(?: on this card)?,?.*?flip this card$/i))) return [{ kind: 'flipIf', min: Number(m[1]) }]
	if ((m = s.match(/^move (this|it)\b[^,]*?(within reach|along the way)?$/i)))
		return [{ kind: 'move', to: 'self', area: m[2] ? (/reach/.test(m[2]) ? 'reach' : 'along') : undefined }]
	if ((m = s.match(/^(each ranger )?suffers? (\d+|a|an|one|two) fatigue$/i))) return [{ kind: 'fatigue', amount: { n: toN(m[2]) }, who: m[1] ? 'each' : undefined }]
	if ((m = s.match(/^(each ranger )?suffers? (\d+|a|an|one|two) injur(y|ies)$/i))) return [{ kind: 'injury', amount: { n: toN(m[2]) }, who: m[1] ? 'each' : undefined }]
	if ((m = s.match(/^soothe (\d+|a|an|one|two|three) fatigue$/i))) return [{ kind: 'soothe', amount: { n: toN(m[1]) } }]
	if ((m = s.match(/^soothe fatigue equal to your effort$/i))) return [{ kind: 'soothe', amount: { effort: true } }]
	if ((m = s.match(/^soothe 1 fatigue for every (\d) effort$/i))) return [{ kind: 'soothe', amount: { effort: true, per: Number(m[1]), mult: 1 } }]
	if ((m = s.match(/^heal (\d+|a|an|one) injur/i))) return [{ kind: 'heal', amount: { n: toN(m[1]) } }]
	if ((m = s.match(/^draw (\d+|a|an|one|two) ranger cards?$/i))) return [{ kind: 'drawRanger', amount: { n: toN(m[1]) } }]
	if ((m = s.match(/^draw (\d+|a|an|one|two) path cards?$/i))) return [{ kind: 'drawPath', amount: { n: toN(m[1]) } }]
	if ((m = s.match(/^scout (\d+) path cards?$/i))) return [{ kind: 'scoutPath', amount: { n: Number(m[1]) } }]
	if (/^scout path cards equal to your effort$/i.test(s)) return [{ kind: 'scoutPath', amount: { effort: true } }]
	if (/^scout ranger cards equal to your effort$/i.test(s)) return [{ kind: 'scoutRanger', amount: { effort: true } }]
	if (/^(it|they|this \w+) fatigues? you$/i.test(s)) return [{ kind: 'selfFatigues' }]
	if (/^(?:move|mvoe) your \[ranger\] to (this|it)\b/i.test(s)) return [{ kind: 'rangerToken', to: 'self' }]
	if (/^(?:remove|return) your \[ranger\] (from this|to your role)/i.test(s)) return [{ kind: 'rangerToken', to: 'role' }]
	if ((m = s.match(/^add (\d+) (\w+) to this card$/i))) return [{ kind: 'tokens', amount: { n: Number(m[1]) }, add: true }]
	if ((m = s.match(/^discard (\d+) (\w+) from this card$/i))) return [{ kind: 'tokens', amount: { n: Number(m[1]) }, add: false }]
	return out.length ? out : null
}

/** Splits "a, b, and c" / "a. Then b" into sentences and reads each. */
export function clause(textIn: string): Clause {
	const t = stripTags(textIn)
	let cond: string | undefined
	let body = t
	const ci = t.indexOf('[conditional]')
	if (ci >= 0) {
		cond = t.slice(0, ci).trim()
		body = t.slice(ci + '[conditional]'.length).trim()
	} else if (/^if /i.test(t)) {
		// "If ..., do X" without the icon
		const k = t.indexOf(',')
		if (k > 0) {
			cond = t.slice(0, k)
			body = t.slice(k + 1).trim()
		}
	}
	const parts = body
		.replace(/\[guide\]\s*([\d.]+)/g, ' [guide] $1.')
		.split(/\.\s+|\.$|,\s*then\s+|\s*\bthen\b\s*|,\s*and\s+|\s+and\s+(?=(?:add|exhaust|ready|draw|soothe|suffer|heal|move|discard|scout)\b)|,\s+(?=(?:add|exhaust|ready|draw|soothe|suffer|heal|move|discard|scout)\b)/i)
		.map((p) => p.trim())
		.filter(Boolean)
	const actions: Action[] = []
	let complete = true
	let lead = 0
	let pre: number | undefined
	// A "condition" that is really an instruction ("Discard 1 rain from this card. ⏩ ...")
	if (cond) {
		const ca = cond.split(/\.\s+|\.$/).map((x) => x.trim()).filter(Boolean).map(sentence)
		if (ca.length && ca.every((x) => x !== null && x.length)) {
			for (const x of ca) actions.push(...x!)
			pre = actions.length
			cond = undefined
		}
	}
	let leading = !cond
	for (const p of parts) {
		const a = sentence(p)
		if (a === null) {
			complete = false
			leading = false
		} else {
			actions.push(...a)
			if (leading) lead += a.length
		}
	}
	if (pre) lead = 0
	return { text: plainText(textIn).replace(/\[conditional\]/g, '⏩'), cond, actions, complete: complete && !cond, lead, pre }
}

const TEST_RE = /\[(AWA|FIT|FOC|SPI)\]\s*\+\s*\[(conflict|reason|exploration|connection|EXL|CON|REA|CNF)\]\s*(?:\(use (\d+|X) [^)]*\))?\s*:?\s*([A-Z][\w’'-]*(?: [A-Z][\w’'-]*)*)\s*(?:\[(\d+|X)\])?\s*:?\s*/
const APPROACH_SHORT: Record<string, Approach> = { EXL: 'exploration', CON: 'connection', REA: 'reason', CNF: 'conflict' }

/** A test's effect text: success part, "If you fail" part, "whether you succeed or fail" part. */
function testEffects(t: string): Pick<TestDef, 'effect' | 'fail' | 'always'> {
	const flat = t
	const fi = flat.search(/\bIf you fail\b,?/i)
	const wi = flat.search(/\bwhether you succeed or fail\b,?/i)
	let succ = flat
	let fail: string | undefined
	let always: string | undefined
	if (wi >= 0) {
		always = flat.slice(wi).replace(/^whether you succeed or fail,?\s*/i, '')
		succ = flat.slice(0, wi)
	}
	if (fi >= 0 && (wi < 0 || fi < wi)) {
		fail = (wi > fi ? flat.slice(fi, wi) : flat.slice(fi)).replace(/^If you fail,?\s*/i, '')
		succ = flat.slice(0, fi)
	}
	return { effect: clause(succ), fail: fail ? clause(fail) : undefined, always: always ? clause(always) : undefined }
}

/** Finds every test written in a line, even after other abilities. */
function findTests(line: string): { tests: TestDef[]; before: string } {
	const flat = stripTags(line)
	const tests: TestDef[] = []
	const re = new RegExp(TEST_RE.source, 'g')
	const hits = [...flat.matchAll(re)]
	if (!hits.length) return { tests, before: line }
	hits.forEach((m, i) => {
		const start = m.index! + m[0].length
		const end = i + 1 < hits.length ? hits[i + 1].index! : flat.length
		let effect = flat.slice(start, end).trim()
		// Stop at a following "Clear ...:" / "Response:" ability on the same line.
		const stop = effect.search(/\s(Clear \[|Response:|Exhaust:|Exhaust \(use)/)
		if (stop > 0) effect = effect.slice(0, stop)
		const approach = (APPROACH_SHORT[m[2]] ?? m[2]) as Approach
		tests.push({
			aspect: m[1] as Aspect,
			approach,
			name: m[4],
			diff: m[5] ? (m[5] === 'X' ? 'X' : Number(m[5])) : 1,
			use: m[3] ? (m[3] === 'X' ? 1 : Number(m[3])) : undefined,
			...testEffects(effect),
			raw: m[0] + effect,
		})
	})
	return { tests, before: flat.slice(0, hits[0].index!).trim() }
}

export function parse(text: string | undefined): Parsed {
	const out: Parsed = { keywords: [], tests: [], challenge: {}, clear: [], arrival: [], other: [] }
	if (!text) return out
	const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
	let inArrival = false
	lines.forEach((line, i) => {
		const flat = stripTags(line)
		if (i === 0) {
			const kws = flat.split(/\.\s*/).map((p) => p.trim()).filter(Boolean)
			if (kws.length && kws.every((k) => /^(Ambush|Obstacle|Friendly|Persistent|Unique|Fatiguing|Disconnected|Setup|Conduit|Manifestation|Deployed|Dormant)( \d+)?$/.test(k))) {
				out.keywords = kws
				return
			}
		}
		const g = flat.match(/^\[guide\]\s*([\d.]+)$/)
		if (g) {
			out.guide = g[1]
			return
		}
		if (/^Arrival Setup$/i.test(flat)) {
			inArrival = true
			return
		}
		const asi = flat.match(/^Arrival Setup:\s*(.+)$/i)
		if (asi) {
			out.arrival.push(asi[1])
			return
		}
		if (inArrival) {
			out.arrival.push(line)
			return
		}
		const sym = flat.match(/^\[(sun|mountain|crest)\]\s*(.*)$/)
		if (sym) {
			const lineNoSym = line.replace(/^\s*\[(sun|mountain|crest)\]\s*/, '')
			out.challenge[sym[1] as Sym] = clause(lineNoSym)
			return
		}
		const found = findTests(line)
		if (found.tests.length) {
			out.tests.push(...found.tests)
			if (found.before) out.other.push(found.before)
			return
		}
		const cl = flat.match(/^Clear (\[(?:progress|harm|ranger)\](?: or \[(?:progress|harm|ranger)\])?)\s*:\s*(.*)$/i)
		if (cl) {
			out.clear.push({ on: cl[1], effect: clause(cl[2]) })
			return
		}
		const rf = flat.match(/^Refresh\s*:\s*(.*)$/i)
		if (rf) {
			out.refresh = clause(rf[1])
			return
		}
		const sd = flat.match(/^Start of Day\s*:\s*(.*)$/i)
		if (sd) {
			out.startOfDay = clause(sd[1])
			return
		}
		out.other.push(line)
	})
	return out
}

/** The four common tests from the reference card. Difficulty X = presence of the card (min 1). */
export const COMMON_TESTS: (TestDef & { key: string; targets: string })[] = [
	{ key: 'traverse', aspect: 'FIT', approach: 'exploration', name: 'Traverse', diff: 'X', targets: 'feature or location', raw: '', effect: { text: 'Add progress to a location or feature equal to your effort. If you fail, suffer 1 injury.', actions: [], complete: true } },
	{ key: 'connect', aspect: 'SPI', approach: 'connection', name: 'Connect', diff: 'X', targets: 'being', raw: '', effect: { text: 'Add progress to a being equal to your effort.', actions: [], complete: true } },
	{ key: 'remember', aspect: 'FOC', approach: 'reason', name: 'Remember', diff: 1, targets: '', raw: '', effect: { text: 'Scout Ranger cards equal to your effort, then draw 1 Ranger card.', actions: [], complete: true } },
	{ key: 'avoid', aspect: 'AWA', approach: 'conflict', name: 'Avoid', diff: 'X', targets: 'being', raw: '', effect: { text: 'Exhaust one being.', actions: [], complete: true } },
]

export function amountValue(a: Amount, effort: number, presence: number): number {
	if ('n' in a) return a.n
	if ('presence' in a) return presence
	const per = a.per ?? 1
	return Math.floor(Math.max(0, effort) / per) * (a.mult ?? 1)
}
