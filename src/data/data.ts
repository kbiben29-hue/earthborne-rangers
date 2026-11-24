// Typed access to src/data/game.json (built by scripts/build-game-data.mjs from the DragnCards card database).
import raw from './game.json'

export type Aspect = 'AWA' | 'FIT' | 'FOC' | 'SPI'
export type Approach = 'conflict' | 'reason' | 'exploration' | 'connection'
export const ASPECTS: Aspect[] = ['AWA', 'FIT', 'FOC', 'SPI']
export const APPROACHES: Approach[] = ['conflict', 'reason', 'exploration', 'connection']

export interface Threshold {
	n?: number
	per?: boolean
	ranger?: boolean
	x?: boolean
	text?: string
}
export interface Side {
	name: string
	img: string
	text?: string
	type?: string
	traits?: string
	prog?: Threshold
	harm?: Threshold
	presence?: number | string | null
	area?: 'reach' | 'along'
}
export interface CardDef {
	id: string
	name: string
	type: string
	set: string
	pack: string
	back: 'path' | 'player' | 'multi_sided' | 'challenge'
	img: string
	traits?: string
	text?: string
	kw?: string[]
	presence?: number | string | null
	harm?: Threshold
	prog?: Threshold
	noHarm?: boolean
	noProg?: boolean
	area?: 'reach' | 'along'
	cost?: number | string | null
	aspect?: Aspect
	level?: number
	equip?: number
	tokens?: { n: number; name: string; per: boolean }
	icons?: Partial<Record<Approach, number>>
	aspects?: Record<Aspect, number>
	limit?: number
	links?: { to: string; path: string }[]
	pivotal?: boolean
	key?: string
	qty: number
	B?: Side
}
export interface ChallengeCard {
	id: string
	AWA: number
	SPI: number
	FIT: number
	FOC: number
	symbol: 'sun' | 'mountain' | 'crest'
	reshuffle: boolean
}

const data = raw as unknown as {
	built: string
	cards: Record<string, CardDef>
	sets: Record<string, string[]>
	challenge: ChallengeCard[]
	prebuilt: Record<string, { role: string; aspect: string; deck: string[] }>
}

export const CARDS = data.cards
export const SETS = data.sets
export const CHALLENGE = data.challenge
export const PREBUILT = data.prebuilt
export const card = (id: string): CardDef => {
	const c = CARDS[id]
	if (!c) throw new Error(`Unknown card ${id}`)
	return c
}

export const IMG_BASE = 'https://raw.githubusercontent.com/kbiben29-hue/earthborne-rangers/main/images/'

// The 8 core terrain sets and their names on the map.
export const TERRAINS: Record<string, string> = {
	woods: 'Woods',
	lakeshore: 'Lakeshore',
	mountain_pass: 'Mountain Pass',
	old_growth: 'Old-Growth',
	grassland: 'Grassland',
	swamp: 'Swamp',
	ravine: 'Ravine',
	river: 'River',
}

/** Every copy of every card in a set, e.g. setCards('Core', 'Woods'). */
export function setCards(pack: string, set: string): string[] {
	const ids = SETS[`${pack}:${set}`] ?? []
	return ids.flatMap((id) => Array(CARDS[id].qty || 1).fill(id))
}

export const coreLocations = () => Object.values(CARDS).filter((c) => c.type === 'Location' && c.pack === 'Core')
export const WEATHER_CORE = ['01373', '01374', '01375', '01376']
export const MISSIONS_CORE = () => Object.values(CARDS).filter((c) => c.type === 'Mission' && c.pack === 'Core')
export const LOCATION_START = '01378' // Lone Tree Station
