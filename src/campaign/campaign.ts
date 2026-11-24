// The campaign (Lure of the Valley): the tracker sheet, Ranger decks and building a Ranger.
import { card, CARDS, LOCATION_START, PREBUILT, type Aspect, type CardDef } from '../data/data'
import type { Game } from '../engine/types'

export interface CampaignRanger {
	name: string
	role: string
	aspect: string
	/** The 30-card deck (plus maladies). */
	deck: string[]
	/** Starting cards swapped out for rewards (can be swapped back at camp). */
	setAside: string[]
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
}

export const LINGERING_INJURY = '01240'
export const WEATHER: { id: string; label: string }[] = [
	{ id: '01373', label: 'A Perfect Day (easy)' },
	{ id: '01374', label: 'Downpour (normal)' },
	{ id: '01375', label: 'Howling Winds (hard)' },
	{ id: '01376', label: 'Electric Fog (expert)' },
]

export function newCampaign(name: string, rangers: CampaignRanger[]): Campaign {
	return {
		v: 1,
		id: Math.random().toString(36).slice(2, 10),
		name,
		created: new Date().toISOString(),
		day: 1,
		location: LOCATION_START,
		terrain: 'woods',
		weather: '01373',
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
	}
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
	// Mission cards flipped during play keep their side.
	for (const u of g.missions) {
		const i = g.inst[u]
		const m = n.missions.find((x) => x.id === i?.id)
		if (m && i) m.side = i.side
	}
	n.game = null
	return n
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
export function saveCampaign(c: Campaign) {
	const all = loadAll().filter((x) => x.id !== c.id)
	all.unshift(c)
	try {
		localStorage.setItem(KEY, JSON.stringify(all))
	} catch {
		// storage full: drop the in-progress game history of older campaigns
		for (const x of all.slice(1)) x.game = null
		try {
			localStorage.setItem(KEY, JSON.stringify(all))
		} catch {}
	}
}
export function deleteCampaign(id: string) {
	try {
		localStorage.setItem(KEY, JSON.stringify(loadAll().filter((x) => x.id !== id)))
	} catch {}
}
