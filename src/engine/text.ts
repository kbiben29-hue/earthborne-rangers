// Reads a card's text into its parts: keywords, tests, challenge effects, clear effects,
// abilities, refresh / start of day / arrival setup. Each effect is run by the engine (dsl.ts).
import type { Aspect, Approach } from '../data/data'
import { effect, normalize, type Effect, type StepWhen } from './dsl'

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
	/** Path moments: "If the weather is inclement, this test's difficulty is [n] instead." */
	inclement?: number
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
	/** Path moments (Moments on the Path / in the Valley): what happens when the card is drawn. */
	moment?: Effect
	/** Tests a path moment asks for while it resolves (not tests a Ranger can choose to perform). */
	momentTests?: TestDef[]
	/** "If you see this card while scouting: …" */
	scouting?: string
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

// ---------------------------------------------------------------- path moments

const CHOOSER = /^(YOU CHOOSE|RANGERS CHOOSE|EACH RANGER CHOOSES):?$/i
const OPTION = /^<(c|b)>\s*([A-C])\)\s*([\s\S]*?)<\/\1>\s*(.*)$/

/**
 * A path moment's text → the effect run when it's drawn. [per_ranger] values are worked out for
 * `n` Rangers. Rulebook, Path Moments: resolve the text, then discard the moment unless it says
 * otherwise. Group tests: any Ranger can commit energy and icons.
 */
export function parseMoment(text: string, n: number): Parsed {
	let inclement: number | undefined
	const t = text
		.replace(/\s*If the weather is inclement, this test's difficulty is <b>\[(\d+)\[per_ranger\]\]<\/b> instead\./i, (_, d) => {
			inclement = Number(d) * n
			return ''
		})
		.replace(/(\d+)\s*\[per_ranger\]/g, (_, d) => String(Number(d) * n)).replace(/\[per_ranger\]/g, String(n))
	const out: Parsed = { keywords: [], tests: [], challenge: {}, clear: [], arrival: [], abilities: [], other: [], momentTests: [] }
	const raw = t.split('\n').map((l) => l.trim()).filter((l) => normalize(l))
	let group = false
	let optional = false
	let both = false
	const failOption: [number, string][] = []
	const testLine = (f: string): StepWhen[] => {
		const found = findTests(f)
		const res: StepWhen[] = []
		const before = found.before.replace(/^\s*Then,?\s*/i, '')
		if (before) res.push(...lines([before]))
		for (const td of found.tests) {
			if (inclement != null) td.inclement = inclement
			const i = out.momentTests!.push(td) - 1
			const fo = (td.raw.match(/If you fail,?\s*resolve option ([A-C])/i) ?? [])[1]
			if (fo) failOption.push([i, fo])
			const st: StepWhen = { k: 'momentTest', i, group }
			if (optional || both) res.push({ k: 'either', a: [st], b: optional && td.fail ? [{ k: 'effect', eff: td.fail }] : [], la: `Perform the ${td.name} test`, lb: optional && td.fail ? 'Don’t (resolve its fail effect)' : 'Don’t' })
			else res.push(st)
		}
		optional = false
		if (!both) group = false
		return res
	}
	const challengeBlock = (f: string, rest: string[]): { steps: StepWhen[]; used: number } => {
		const k = f.search(/draw a challenge card and resolve the corresponding effect/i)
		const pre = f.slice(0, k).replace(/,?\s*(?:then,?|or)\s*$/i, '').trim()
		const syms: Record<Sym, StepWhen[]> = { sun: [], mountain: [], crest: [] }
		let used = 0
		while (used < rest.length) {
			const m = normalize(rest[used]).match(/^\[(sun|mountain|crest)\]\s*(.*)$/)
			if (!m) break
			syms[m[1] as Sym] = [{ k: 'effect', eff: effect(m[2]) }]
			used++
		}
		const again = /until you choose to stop/i.test(f)
		const draw: StepWhen = again ? { k: 'challengeAgain', ...syms } : { k: 'byChallenge', ...syms }
		const steps: StepWhen[] = []
		const either = pre.match(/^Either (.+)$/i)
		if (either) steps.push({ k: 'either', a: [{ k: 'effect', eff: effect(either[1]) }], b: [draw], la: either[1].replace(/^./, (c) => c.toUpperCase()), lb: 'Draw a challenge card' })
		else {
			if (pre) steps.push(...plain(pre))
			steps.push(draw)
		}
		return { steps, used }
	}
	// a plain sentence runs inside the moment's own job, so "them" / "it" stay bound to what it found
	const plain = (f: string): StepWhen[] => {
		const e = effect(f)
		return e.cond || e.pre.length ? [{ k: 'effect', eff: e }] : e.steps
	}
	const lines = (ls: string[]): StepWhen[] => {
		const steps: StepWhen[] = []
		for (let k = 0; k < ls.length; k++) {
			const line = ls[k]
			const f = normalize(line)
			if (!f) continue
			if (/^If you see this card while scouting:/i.test(f)) {
				out.scouting = f.replace(/^If you see this card while scouting:\s*/i, '')
				continue
			}
			if (CHOOSER.test(f)) {
				const each = /^EACH/i.test(f)
				const opts: { label: string; steps: StepWhen[] }[] = []
				let j = k + 1
				while (j < ls.length) {
					const m = ls[j].match(OPTION)
					if (!m) break
					const body = [m[4]]
					j++
					while (j < ls.length && !OPTION.test(ls[j])) body.push(ls[j++])
					opts.push({ label: `${m[2]}) ${normalize(m[3])}`, steps: lines(body.filter((b) => normalize(b) && !/^If you cannot, choose another option\.?$/i.test(normalize(b)))) })
				}
				steps.push({ k: 'options', opts, each })
				for (const [i, letter] of failOption.splice(0)) {
					const o = opts['ABC'.indexOf(letter)]
					if (o) out.momentTests![i].fail = { text: `Resolve option ${letter}.`, pre: [], steps: o.steps, auto: true }
				}
				k = j - 1
				continue
			}
			if (/draw a challenge card and resolve the corresponding effect/i.test(f)) {
				const cb = challengeBlock(f, ls.slice(k + 1))
				steps.push(...cb.steps)
				k += cb.used
				continue
			}
			const res = f.match(/^If (.+?), (?:(.+?),? )?then resolve the following:?$/i) ?? f.match(/^If (.+?), ()continue reading:?$/i)
			if (res) {
				const c = effect(`If ${res[1]}, ${res[2] || 'do nothing'}`).cond ?? { c: 'ask' as const, text: res[1] }
				const inner = lines(ls.slice(k + 1))
				steps.push({ k: 'effect', eff: { text: f, cond: c, pre: [], steps: [...(res[2] ? plain(res[2]) : []), ...inner], auto: true } })
				break
			}
			if (/^(Place this card in the surroundings|Attach this moment to your role)\.?/i.test(f)) {
				const keep = f.match(/^(Place this card in the surroundings|Attach this moment to your role)\.?\s*(.*)$/i)!
				steps.push(/surroundings/i.test(keep[1]) ? { k: 'keepMoment', to: 'surroundings' } : { k: 'attach', what: { r: 'self' }, to: { r: 'role' } })
				// The rest is the card's own text while it stays in play.
				const restText = [keep[2], ...ls.slice(k + 1)].filter((x) => normalize(x) && !/^\(This card will be discarded/i.test(normalize(x))).join('\n').replace(/While this card is in play, it gains the following text:/i, '')
				const p = parse(restText)
				out.tests.push(...p.tests)
				out.abilities.push(...p.abilities)
				out.other.push(...p.other)
				Object.assign(out.challenge, p.challenge)
				break
			}
			const opt = f.match(/^(.*?),?\s*(?:then,?\s*)?you may perform the following test\. If you choose not to, resolve its fail effect:?$/i)
			if (opt) {
				if (opt[1]) steps.push(...plain(opt[1]))
				optional = true
				continue
			}
			if (/^Perform one or both of the following group tests/i.test(f)) {
				both = true
				group = true
				continue
			}
			if (/perform an? group test:?$/i.test(f)) {
				group = true
				const pre = f.replace(/,?\s*(?:Then,?\s*)?perform an? group test:?$/i, '').trim()
				if (pre) steps.push(...lines([pre]))
				continue
			}
			const sym = f.match(/^\[(sun|mountain|crest)\]\s*(.*)$/)
			if (sym) {
				out.challenge[sym[1] as Sym] = effect(sym[2])
				continue
			}
			if (findTests(f).tests.length) {
				steps.push(...testLine(f))
				continue
			}
			if (both && /^If you fail either test/i.test(f)) {
				both = false
				group = false
				steps.push({ k: 'effect', eff: { ...effect(f.replace(/^If you fail either test,\s*/i, '').replace(/\s*\(Choosing not to.*$/i, '')), cond: { c: 'failedTest' } } })
				continue
			}
			steps.push(...plain(f))
		}
		return steps
	}
	const steps = lines(raw)
	out.moment = { text: normalize(t), pre: [], steps, auto: true }
	return out
}
