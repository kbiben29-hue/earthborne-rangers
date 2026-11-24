// Small seeded random number generator (mulberry32). The engine never uses Math.random.
export function next(seed: number): [number, number] {
	let t = (seed + 0x6d2b79f5) | 0
	t = Math.imul(t ^ (t >>> 15), t | 1)
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
	const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
	return [r, (seed + 0x6d2b79f5) | 0]
}

export function shuffle<T>(arr: T[], state: { seed: number }): T[] {
	const a = arr.slice()
	for (let i = a.length - 1; i > 0; i--) {
		const [r, s] = next(state.seed)
		state.seed = s
		const j = Math.floor(r * (i + 1))
		;[a[i], a[j]] = [a[j], a[i]]
	}
	return a
}

export function pick(n: number, state: { seed: number }): number {
	const [r, s] = next(state.seed)
	state.seed = s
	return Math.floor(r * n)
}
