// The campaign (Lure of the Valley): the tracker sheet, Ranger decks and building a Ranger.
import { card, CARDS, LOCATION_START, PREBUILT, weathersOf, type Aspect, type CardDef } from '../data/data'
import type { Game } from '../engine/types'

export interface CampaignRanger {
	name: string
	role: string
	aspect: string
	/** The 30-card deck (plus maladies). */
	deck: string[]
	/** Starting cards swapped out for rewards (can be swapped back at camp). */
	setAside: string[]
	/** Personal rewards this Ranger has unlocked through aspirations (only they may use them). */
	personal?: string[]
}
/** Stewards of the Valley: a personal goal on an Expert card ("Objective (6 seeds: [aspiration])"). */
export interface Aspiration {
	ranger: number
	/** The aspiration card in the deck. */
	card: string
	goal: number
	/** What is counted ("seed", "hunch"…). */
	what: string
	marks: number
	done: boolean
}
export interface CampaignMission {
	id: string
	side: 'A' | 'B'
	day: number
	note: string
	boxes: number
}
export interface Campaign {
	v: 1
	id: string
	name: string
	created: string
	day: number
	location: string
	terrain: string
	weather: string
	weatherSide: 'A' | 'B'
	missions: CampaignMission[]
	rewards: string[]
	events: string[]
	rangers: CampaignRanger[]
	/** Ended last day by camping: rewards can be swapped in before the next day. */
	camped: boolean
	history: { day: number; summary: string }[]
	/** Guide entries the group has been sent to (most recent last). */
	entries: string[]
	/** The day in progress, if any. */
	game: Game | null
	lead: number
	/** The learn-to-play day (coach on, not a real campaign). */
	tutorial?: boolean
	aspirations?: Aspiration[]
	/** Guide this campaign's setup and first day step by step. */
	guided?: boolean
	/** Expansions mixed into the Valley (pack codes: SiB, SoS, MoP, MoV). */
	expansions?: string[]
	/** The weather for the next day was picked by hand instead of from the tracker. */
	weatherManual?: boolean
	/** Rulebook, Customizing Difficulty with Weather: 'tracker' (recommended) or one weather card every day. */
	weatherMode?: string
	/** Campaign guide entries written above days on the tracker (by the guide's instructions). */
	dayEntries?: Record<number, string[]>
}

export const LINGERING_INJURY = '01240'
export const WEATHER: { id: string; label: string }[] = [
	{ id: '01373', label: 'A Perfect Day' },
	{ id: '01374', label: 'Downpour' },
	{ id: '01375', label: 'Howling Winds' },
	{ id: '01376', label: 'Electric Fog' },
]
/** The weather printed on the Lure of the Valley campaign tracker, by day (days 31–45: the extended tracker). */
export const WEATHER_SCHEDULE: [from: number, to: number, weather: string][] = [
	[1, 3, '01373'],
	[4, 7, '01374'],
	[8, 9, '01373'],
	[10, 12, '01374'],
	[13, 14, '01375'],
	[15, 17, '01374'],
	[18, 20, '01375'],
	[21, 22, '01373'],
	[23, 25, '01374'],
	[26, 28, '01375'],
	[29, 30, '01373'],
	[31, 33, '01374'],
	[34, 35, '01373'],
	[36, 39, '01375'],
	[40, 42, '01374'],
	[43, 45, '01373'],
]
export function weatherForDay(day: number): string {
	return WEATHER_SCHEDULE.find(([a, b]) => day >= a && day <= b)?.[2] ?? '01373'
}
/** Difficulty choices for the weather (rulebook): the tracker, or always one card. */
export const WEATHER_MODES: { id: string; label: string }[] = [
	{ id: 'tracker', label: 'Follow the campaign tracker (recommended)' },
	{ id: '01373', label: 'Easy: always A Perfect Day' },
	{ id: '01374', label: 'Normal: always Downpour' },
	{ id: '01375', label: 'Hard: always Howling Winds' },
	{ id: '01376', label: 'Expert: always Electric Fog' },
]
export const dailyWeather = (c: Pick<Campaign, 'weatherMode'>, day: number) => (c.weatherMode && c.weatherMode !== 'tracker' ? c.weatherMode : weatherForDay(day))
/** Campaign guide entries printed above days on the tracker (core box, and the expansions' starting entries). */
const TRACKER_ENTRIES: Record<string, Record<number, string[]>> = { Core: { 3: ['94.1'], 4: ['1.04'] }, SiB: { 8: ['216.1'] }, SoS: { 24: ['246.1'] } }
/** Entries to read above this day (step 6 of setup): printed ones plus any the guide had you write in. */
export function entriesForDay(c: Pick<Campaign, 'expansions' | 'dayEntries'>, day: number): string[] {
	const printed = ['Core', ...(c.expansions ?? [])].flatMap((p) => TRACKER_ENTRIES[p]?.[day] ?? [])
	return [...new Set([...printed, ...(c.dayEntries?.[day] ?? [])])]
}

/** Weather cards to choose from: the core four plus any expansion weather. */
export function weatherOptions(c: Pick<Campaign, 'expansions'>): { id: string; label: string }[] {
	const extra = weathersOf(c.expansions ?? []).map((w) => ({ id: w.id, label: `${w.name}${w.B ? ` / ${w.B.name}` : ''} (${w.pack})` }))
	return [...WEATHER, ...extra]
}

export function newCampaign(name: string, rangers: CampaignRanger[], expansions: string[] = []): Campaign {
	return {
		v: 1,
		id: Math.random().toString(36).slice(2, 10),
		name,
		created: new Date().toISOString(),
		day: 1,
		location: LOCATION_START,
		terrain: 'woods',
		weather: weatherForDay(1),
		weatherSide: 'A',
		missions: [],
		rewards: [],
		events: [],
		rangers,
		camped: true,
		history: [],
		entries: ['1'],
		game: null,
		lead: 0,
		expansions,
	}
}

export function tutorialCampaign(name: string): Campaign {
	const c = newCampaign('Tutorial', [prebuiltRanger('UndauntedSeeker', name || 'Ranger')])
	c.tutorial = true
	c.entries = []
	return c
}

export const prebuiltRanger = (key: string, name: string): CampaignRanger => ({
	name,
	role: PREBUILT[key].role,
	aspect: PREBUILT[key].aspect,
	deck: PREBUILT[key].deck.slice(),
	setAside: [],
})
export const PREBUILT_NAMES: Record<string, string> = {
	UndauntedSeeker: 'Explorer · Traveler',
	VoiceoftheElders: 'Conciliator · Shepherd',
	MasterfulEngineer: 'Artificer · Artisan',
	AdherentoftheFirstIdeal: 'Shaper · Forager',
}

/** Records the end of a day in the campaign. */
export function finishDay(c: Campaign, g: Game): Campaign {
	const n = structuredClone(c)
	const loc = g.inst[g.location]
	n.location = loc?.id ?? n.location
	n.terrain = g.terrain
	n.camped = !!g.ended?.camp
	for (const r of g.lingering) {
		const cr = n.rangers[r]
		if (cr && !cr.deck.includes(LINGERING_INJURY)) cr.deck.push(LINGERING_INJURY)
	}
	// Lingering Injury removed during the day ("return this card to your collection")
	n.history.push({ day: n.day, summary: `${g.ended?.reason ?? 'Day ended.'} (${card(n.location).name})` })
	n.day += 1
	// the next day's weather comes from the campaign tracker
	n.weather = dailyWeather(n, n.day)
	n.weatherSide = 'A'
	n.weatherManual = false
	// Mission cards flipped during play keep their side.
	for (const u of g.missions) {
		const i = g.inst[u]
		const m = n.missions.find((x) => x.id === i?.id)
		if (m && i) m.side = i.side
	}
	// Aspirations: records made during the day, and tokens left on objective gear at the end of it
	n.aspirations = aspirationsOf(n)
	for (const a of n.aspirations) {
		if (a.done) continue
		const rec = (g.records ?? []).filter((x) => x.ranger === a.ranger && singular(x.what) === singular(a.what)).reduce((s, x) => s + x.n, 0)
		const tok = Object.values(g.inst)
			.filter((i) => i.id === a.card && i.deckOf === a.ranger && card(i.id).type === 'Gear')
			.reduce((s, i) => s + i.tokens, 0)
		a.marks += rec + tok
		if (a.marks >= a.goal) {
			a.done = true
			const reward = personalReward(a.card)
			if (reward) {
				const R = n.rangers[a.ranger]
				R.personal = [...new Set([...(R.personal ?? []), reward])]
				n.history.push({ day: n.day - 1, summary: `${R.name} completed the aspiration ${card(a.card).name} and unlocked ${card(reward).name}.` })
			}
		}
	}
	n.game = null
	return n
}

const singular = (w: string) => w.toLowerCase().replace(/(ches|shes)$/, (m) => m.slice(0, -2)).replace(/ies$/, 'y').replace(/s$/, '')
/** "Objective (6 hunches: [aspiration])" on a card. */
export function objectiveOf(id: string): { goal: number; what: string } | null {
	const m = (card(id).text ?? '').replace(/<[^>]+>/g, '').match(/Objective \((\d+) ([\w ]+?):/i)
	return m ? { goal: Number(m[1]), what: singular(m[2]) } : null
}
/** The Personal Reward card unlocked by an aspiration card. */
export function personalReward(aspirationCard: string): string | null {
	const nm = card(aspirationCard).name
	return Object.values(CARDS).find((c) => new RegExp(`Personal Reward \\(${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i').test((c.text ?? '').replace(/<[^>]+>/g, '')))?.id ?? null
}
/** Aspirations of every Ranger (one per aspiration card in their deck), keeping progress made so far. */
export function aspirationsOf(c: Campaign): Aspiration[] {
	const out: Aspiration[] = []
	c.rangers.forEach((R, k) => {
		for (const id of new Set(R.deck)) {
			const o = objectiveOf(id)
			if (!o) continue
			const old = c.aspirations?.find((a) => a.ranger === k && a.card === id)
			out.push(old ?? { ranger: k, card: id, goal: o.goal, what: o.what, marks: 0, done: false })
		}
	})
	return out
}

// ------------------------------------------------------------ building a Ranger

export const BACKGROUNDS = ['Artisan', 'Forager', 'Shepherd', 'Traveler']
export const SPECIALTIES = ['Artificer', 'Conciliator', 'Explorer', 'Shaper']
export const EXPANSION_BACKGROUNDS = ['Tale Spinner']
export const EXPANSION_SPECIALTIES = ['Spirit Speaker']

export const isExpert = (c: CardDef) => /\bExpert\b/.test(c.traits ?? '')
export const meetsAspect = (c: CardDef, aspects: Record<Aspect, number>) => !c.aspect || !c.level || aspects[c.aspect] >= c.level

/** Ranger cards of a set (core + Stewards of the Valley when allowed). */
export function rangerSet(set: string, withSov: boolean): CardDef[] {
	return Object.values(CARDS).filter((c) => c.back === 'player' && c.set === set && (c.pack === 'Core' || (withSov && c.pack === 'SoV')) && c.type !== 'Role' && c.type !== 'Aspect')
}
export function roles(set: string, withSov: boolean): CardDef[] {
	return Object.values(CARDS).filter((c) => c.type === 'Role' && c.set === set && (c.pack === 'Core' || (withSov && c.pack === 'SoV')))
}
export function aspectCards(withSov: boolean): CardDef[] {
	return Object.values(CARDS).filter((c) => c.type === 'Aspect' && (c.pack === 'Core' || (withSov && c.pack === 'SoV')))
}
export const rewardCards = () => Object.values(CARDS).filter((c) => c.back === 'player' && /^Rewards?$/.test(c.set))

export interface Build {
	name: string
	aspect: string | null
	personality: Partial<Record<Aspect, string>>
	background: string | null
	backgroundCards: string[]
	specialty: string | null
	specialtyCards: string[]
	role: string | null
	outside: string | null
}
export const emptyBuild = (): Build => ({ name: '', aspect: null, personality: {}, background: null, backgroundCards: [], specialty: null, specialtyCards: [], role: null, outside: null })

export function buildProblems(b: Build): string[] {
	const out: string[] = []
	if (!b.name.trim()) out.push('Give your Ranger a name.')
	if (!b.aspect) out.push('Choose an aspect card.')
	const asp = b.aspect ? card(b.aspect).aspects! : null
	for (const a of ['AWA', 'FIT', 'FOC', 'SPI'] as Aspect[]) if (!b.personality[a]) out.push(`Choose a ${a} personality card.`)
	if (!b.background) out.push('Choose a background.')
	else if (b.backgroundCards.length !== 5) out.push(`Pick 5 background cards (${b.backgroundCards.length} so far).`)
	if (!b.specialty) out.push('Choose a specialty.')
	else if (b.specialtyCards.length !== 5) out.push(`Pick 5 specialty cards (${b.specialtyCards.length} so far).`)
	if (!b.role) out.push('Choose a role.')
	if (!b.outside) out.push('Choose an outside interest.')
	if (asp) {
		for (const id of [...b.backgroundCards, ...b.specialtyCards, ...(b.outside ? [b.outside] : [])]) {
			const c = card(id)
			if (!meetsAspect(c, asp)) out.push(`${c.name} needs ${c.aspect} ${c.level}.`)
		}
	}
	if (b.outside) {
		const c = card(b.outside)
		if (isExpert(c)) out.push(`${c.name} is an Expert card and can't be an outside interest.`)
		if (c.set === b.background || c.set === b.specialty) out.push('The outside interest must come from a different background or specialty.')
		if ([...b.backgroundCards, ...b.specialtyCards].includes(b.outside)) out.push('The outside interest is already in your deck.')
	}
	return out
}
export function buildToRanger(b: Build): CampaignRanger {
	const ids = [...Object.values(b.personality), ...b.backgroundCards, ...b.specialtyCards, b.outside].filter(Boolean) as string[]
	return { name: b.name.trim(), role: b.role!, aspect: b.aspect!, deck: ids.flatMap((id) => [id, id]), setAside: [] }
}

// ------------------------------------------------------------ saving

const KEY = 'earthborne.campaigns'
export function loadAll(): Campaign[] {
	try {
		const raw = localStorage.getItem(KEY)
		return raw ? (JSON.parse(raw) as Campaign[]) : []
	} catch {
		return []
	}
}
/** Saves a campaign; returns false when the browser's storage is full even after trimming. */
export function saveCampaign(c: Campaign): boolean {
	const all = loadAll().filter((x) => x.id !== c.id && !(c.tutorial && x.tutorial))
	all.unshift(c)
	const tries: (() => void)[] = [
		() => {},
		// storage full: drop finished tutorials and the in-progress games of other campaigns
		() => {
			for (let i = all.length - 1; i > 0; i--) if (all[i].tutorial) all.splice(i, 1)
			for (const x of all.slice(1)) x.game = null
		},
		// still full: shorten the logs
		() => {
			for (const x of all) if (x.game) x.game.log = x.game.log.slice(-150)
		},
	]
	for (const t of tries) {
		t()
		try {
			localStorage.setItem(KEY, JSON.stringify(all))
			return true
		} catch {}
	}
	return false
}
export function deleteCampaign(id: string) {
	try {
		localStorage.setItem(KEY, JSON.stringify(loadAll().filter((x) => x.id !== id)))
	} catch {}
}
