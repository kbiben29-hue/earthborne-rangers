// Reads a card's text into its parts: keywords, tests, challenge effects, clear effects,
// abilities, refresh / start of day / arrival setup. Each effect is run by the engine (dsl.ts).
import type { Aspect, Approach } from '../data/data'
import { effect, normalize, type Effect } from './dsl'

export type Sym = 'sun' | 'mountain' | 'crest'

export interface TestDef {
	aspect: Aspect
	approach: Approach
	name: string
	diff: number | 'X'
	use?: number
	success: Effect
	fail?: Effect
	always?: Effect
	raw: string
}
export interface Ability {
	kind: 'exhaust' | 'response' | 'use' | 'other'
	use?: number
	/** "After/When/Before …" timing: the game offers it when that happens (triggers.ts). */
	timing?: string
	text: string
	effect: Effect
}
export interface Parsed {
	keywords: string[]
	tests: TestDef[]
	challenge: Partial<Record<Sym, Effect>>
	clear: { on: string; effect: Effect }[]
	refresh?: Effect
	startOfDay?: Effect
	arrival: { who: 'lead' | 'next' | 'each' | null; effect: Effect }[]
	enters?: Effect
	abilities: Ability[]
	guide?: string
	other: string[]
	/** "Choose one:" moments. */
	choice?: Effect
}

const APPROACH_SHORT: Record<string, Approach> = { EXL: 'exploration', CON: 'connection', REA: 'reason', CNF: 'conflict' }
const TEST_RE = /\[(AWA|FIT|FOC|SPI)\]\s*\+\s*\[(conflict|reason|exploration|connection|EXL|CON|REA|CNF)\]\s*(?:\(use (\d+|X) [^)]*\))?\s*:?\s*([A-Z][\w’'-]*(?: [A-Z][\w’'-]*)*)\s*(?:\[(\d+|X)\])?\s*:?\s*/g

function testEffects(t: string): Pick<TestDef, 'success' | 'fail' | 'always'> {
	const fi = t.search(/\bIf you fail\b,?/i)
	const wi = t.search(/\bwhether you succeed or fail\b,?/i)
	let succ = t
	let fail: string | undefined
	let always: string | undefined
	if (wi >= 0) {
		always = t.slice(wi).replace(/^whether you succeed or fail,?\s*/i, '')
		succ = t.slice(0, wi)
	}
	if (fi >= 0 && (wi < 0 || fi < wi)) {
		fail = (wi > fi ? t.slice(fi, wi) : t.slice(fi)).replace(/^If you fail,?\s*/i, '')
		succ = t.slice(0, fi)
	}
	return { success: effect(succ), fail: fail ? effect(fail) : undefined, always: always ? effect(always) : undefined }
}

function findTests(flat: string): { tests: TestDef[]; before: string } {
	const hits = [...flat.matchAll(TEST_RE)]
	const tests: TestDef[] = []
	if (!hits.length) return { tests, before: flat }
	hits.forEach((m, i) => {
		const start = m.index! + m[0].length
		const end = i + 1 < hits.length ? hits[i + 1].index! : flat.length
		let eff = flat.slice(start, end).trim()
		const stop = eff.search(/\s(Clear \[|Response:|Exhaust:|Exhaust \(use)/)
		if (stop > 0) eff = eff.slice(0, stop)
		tests.push({
			aspect: m[1] as Aspect,
			approach: (APPROACH_SHORT[m[2]] ?? m[2]) as Approach,
			name: m[4],
			diff: m[5] ? (m[5] === 'X' ? 'X' : Number(m[5])) : 1,
			use: m[3] ? (m[3] === 'X' ? 1 : Number(m[3])) : undefined,
			...testEffects(eff),
			raw: m[0] + eff,
		})
	})
	return { tests, before: flat.slice(0, hits[0].index!).trim() }
}

const KW = /^(Ambush|Obstacle|Friendly|Persistent|Unique|Fatiguing|Disconnected|Setup|Conduit|Manifestation|Deployed|Dormant|Spirit)( \d+)?$/

export function parse(text: string | undefined): Parsed {
	const out: Parsed = { keywords: [], tests: [], challenge: {}, clear: [], arrival: [], abilities: [], other: [] }
	if (!text) return out
	let lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
	// "Choose one:" followed by options, one per line
	const co = lines.findIndex((l) => /^(<b>)?choose one:?(<\/b>)?$/i.test(l.trim()))
	if (co >= 0 && lines.length >= co + 3) {
		const a = normalize(lines[co + 1])
		const b = normalize(lines[co + 2])
		const ea = effect(a)
		const eb = effect(b)
		out.other.push(`Choose one: ${a} / ${b}`)
		out.choice = { text: `Choose one: ${a} / ${b}`, pre: [], steps: [{ k: 'either', a: ea.steps, b: eb.steps, la: a, lb: b }], auto: ea.auto && eb.auto }
		lines = lines.filter((_, k) => k < co || k > co + 2)
	}
	let inArrival = false
	lines.forEach((line, i) => {
		const flat = normalize(line)
		if (!flat) return
		if (i === 0) {
			const kws = flat.split(/\.\s*/).map((p) => p.trim()).filter(Boolean)
			if (kws.length && kws.every((k) => KW.test(k))) {
				out.keywords = kws
				return
			}
		}
		const g = flat.match(/^\[guide\]\s*([\d.]+)$/)
		if (g) {
			out.guide = g[1]
			return
		}
		if (/^Arrival Setup:?$/i.test(flat)) {
			inArrival = true
			return
		}
		const asi = flat.match(/^Arrival Setup:\s*(.+)$/i)
		if (asi || inArrival) {
			const body = asi ? asi[1] : flat
			const who = body.match(/^(Lead Ranger|Next Ranger|Each Ranger):\s*(.*)$/i)
			out.arrival.push({ who: who ? (who[1].split(' ')[0].toLowerCase() as 'lead') : null, effect: effect(who ? who[2] : body) })
			return
		}
		const sym = flat.match(/^\[(sun|mountain|crest)\]\s*(.*)$/)
		if (sym) {
			out.challenge[sym[1] as Sym] = effect(sym[2])
			return
		}
		const found = findTests(flat)
		if (found.tests.length) {
			out.tests.push(...found.tests)
			if (found.before) out.other.push(found.before)
			const ab = found.before.match(/^(Exhaust|Response)(?: \(use (\d+|X) [^)]*\))?:\s*(.*)$/i)
			if (ab) out.abilities.push({ kind: ab[1].toLowerCase() as 'exhaust', use: ab[2] ? Number(ab[2]) || 1 : undefined, text: found.before, effect: effect(ab[3]) })
			const cl = flat.match(/Clear (\[(?:progress|harm|ranger)\](?: or \[(?:progress|harm|ranger)\])?)\s*:\s*(.*)$/i)
			if (cl) out.clear.push({ on: cl[1], effect: effect(cl[2]) })
			return
		}
		const cl = flat.match(/^Clear (\[(?:progress|harm|ranger)\](?: or \[(?:progress|harm|ranger)\])?)\s*:\s*(.*)$/i)
		if (cl) {
			out.clear.push({ on: cl[1], effect: effect(cl[2]) })
			return
		}
		const rf = flat.match(/^Refresh\s*:\s*(.*)$/i)
		if (rf) {
			out.refresh = effect(rf[1])
			return
		}
		const sd = flat.match(/^Start of Day\s*:\s*(.*)$/i)
		if (sd) {
			out.startOfDay = effect(sd[1])
			return
		}
		const en = flat.match(/^When this [a-z]+ enters play,?\s*(.*)$/i)
		if (en) {
			out.enters = effect(en[1])
			return
		}
		const ab = flat.match(/^(Exhaust|Response|Use (\d+) \w+)(?: \(use (\d+|X) [^)]*\))?:\s*(.*)$/i)
		if (ab) {
			const kind = /^use/i.test(ab[1]) ? 'use' : (ab[1].toLowerCase() as 'exhaust')
			const use = ab[2] ? Number(ab[2]) : ab[3] ? Number(ab[3]) || 1 : undefined
			const tm = ab[4].match(/^((?:After|When|Before) [^,]+),\s*(.*)$/i)
			out.abilities.push({ kind, use, text: flat, timing: tm?.[1], effect: effect(tm ? tm[2] : ab[4]) })
			return
		}
		const tm = flat.match(/^((?:After|When|Before) [^,]+),\s*(.*)$/)
		if (tm && !/^When (you play this|you draw this|this card)/i.test(flat)) out.abilities.push({ kind: 'other', text: flat, timing: tm[1], effect: effect(tm[2]) })
		out.other.push(flat)
	})
	return out
}

/** The four common tests from the reference card. Difficulty X = presence of the card (min 1). */
export const COMMON_TESTS: { key: string; aspect: Aspect; approach: Approach; name: string; diff: number | 'X'; targets: string; text: string }[] = [
	{ key: 'traverse', aspect: 'FIT', approach: 'exploration', name: 'Traverse', diff: 'X', targets: 'feature or location', text: 'Add progress to a location or feature equal to your effort. If you fail, suffer 1 injury.' },
	{ key: 'connect', aspect: 'SPI', approach: 'connection', name: 'Connect', diff: 'X', targets: 'being', text: 'Add progress to a being equal to your effort.' },
	{ key: 'remember', aspect: 'FOC', approach: 'reason', name: 'Remember', diff: 1, targets: '', text: 'Scout Ranger cards equal to your effort, then draw 1 Ranger card.' },
	{ key: 'avoid', aspect: 'AWA', approach: 'conflict', name: 'Avoid', diff: 'X', targets: 'being', text: 'Exhaust one being.' },
]

/** Stewards of the Valley: the Spirit Speaker Tests card, used instead of the common tests while spiritspeaking. */
export const SPIRIT_TESTS: typeof COMMON_TESTS = [
	{ key: 'influence', aspect: 'FIT', approach: 'reason', name: 'Influence', diff: 'X', targets: 'feature or being', text: 'Move a feature or being. When you perform this test, dodge all cards that share an area with a spirit.' },
	{ key: 'awaken', aspect: 'SPI', approach: 'conflict', name: 'Awaken', diff: 1, targets: '', text: 'Choose a Ranger. That Ranger soothes fatigue equal to the number of spirits within reach of them plus 1.' },
	{ key: 'commune', aspect: 'FOC', approach: 'connection', name: 'Commune', diff: 'X', targets: 'spirit', text: 'Add 2 progress to a spirit for every effort.' },
	{ key: 'measure', aspect: 'AWA', approach: 'exploration', name: 'Measure', diff: 1, targets: '', text: 'Scout path cards equal to the number of spirits along the way plus 1.' },
]
