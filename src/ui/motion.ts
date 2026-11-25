// Cards move like on a real table: every render we measure the cards in play (data-uid), and
// animate the difference — a path card flies in from the path deck, a Ranger card from its
// owner's hand, a discarded card slides off to its discard pile, a moved card glides over.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { Game } from '../engine/types'
import { cardImg, imgUrl } from './Card'

/** Pile sizes, to see cards travel between deck, hand, fatigue and discard. */
interface Piles {
	r: { deck: number; hand: string[]; fatigue: number; discard: string[] }[]
	path: number
	challenge: number
}
const pilesOf = (g: Game): Piles => ({
	r: g.rangers.map((R) => ({ deck: R.deck.length, hand: R.hand.slice(), fatigue: R.fatigue.length, discard: R.discard.slice() })),
	path: g.pathDeck.length,
	challenge: g.challenge.length,
})
/** A card picture flying from one place on the table to another. */
function fly(from: DOMRect, to: DOMRect, src: string, delay: number, ms = 560) {
	const w = Math.min(from.width || 80, 140)
	const img = document.createElement('img')
	img.src = src
	img.className = 'flying-card'
	Object.assign(img.style, { position: 'fixed', left: `${from.left + from.width / 2 - w / 2}px`, top: `${from.top + from.height / 2 - (w * 1.4) / 2}px`, width: `${w}px`, zIndex: '90', pointerEvents: 'none', opacity: '0' })
	document.body.appendChild(img)
	const dx = to.left + to.width / 2 - (from.left + from.width / 2)
	const dy = to.top + to.height / 2 - (from.top + from.height / 2)
	const s = Math.max(0.5, Math.min(1.6, (to.width || w) / w))
	const anim = img.animate(
		[
			{ transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
			{ transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) rotate(${dx > 0 ? 8 : -8}deg) scale(${(1 + s) / 2})`, opacity: 1, offset: 0.55 },
			{ transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${s})`, opacity: 0.85 },
		],
		{ duration: ms, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' },
	)
	anim.onfinish = () => img.remove()
	anim.oncancel = () => img.remove()
}

interface Seen {
	rect: DOMRect
	html: string
	kind: string
	deckOf: number | undefined
}
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useMotion(root: RefObject<HTMLElement | null>, g: Game, me = 0, paused = false) {
	const prev = useRef<Map<number, Seen> | null>(null)
	const prevPiles = useRef<Piles | null>(null)
	useLayoutEffect(() => {
		const host = root.current
		if (!host) return
		const piles = pilesOf(g)
		const pp = prevPiles.current
		prevPiles.current = piles
		if (pp && !reduced() && pp.r.length === piles.r.length) flows(host, pp, piles, me)
		const now = new Map<number, Seen>()
		const els = new Map<number, HTMLElement>()
		host.querySelectorAll<HTMLElement>('[data-uid]').forEach((el) => {
			const uid = Number(el.dataset.uid)
			const i = g.inst[uid]
			els.set(uid, el)
			now.set(uid, { rect: el.getBoundingClientRect(), html: el.outerHTML, kind: i?.kind ?? '', deckOf: i?.deckOf })
		})
		const before = prev.current
		prev.current = now
		// while a card is being dragged nothing on the table moves by itself
		if (!before || reduced() || paused) return
		const anchor = (name: string) => host.querySelector<HTMLElement>(`[data-anchor="${name}"]`)?.getBoundingClientRect()
		const from = (el: HTMLElement, r: DOMRect, to: DOMRect, ms: number, extra: Keyframe = {}) => {
			const dx = r.left + r.width / 2 - (to.left + to.width / 2)
			const dy = r.top + r.height / 2 - (to.top + to.height / 2)
			const s = r.width / Math.max(1, to.width)
			el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, ...extra }, { transform: 'none', opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)' })
		}
		for (const [uid, cur] of now) {
			const el = els.get(uid)!
			const old = before.get(uid)
			if (old) {
				if (Math.abs(old.rect.left - cur.rect.left) > 2 || Math.abs(old.rect.top - cur.rect.top) > 2) from(el, old.rect, cur.rect, 380)
				continue
			}
			const a = cur.kind === 'path' ? anchor('path-deck') : cur.kind === 'ranger' && cur.deckOf != null ? anchor(`hand-${cur.deckOf}`) : undefined
			if (a) from(el, a, cur.rect, 520, { opacity: 0.4 })
			else el.animate([{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 320 })
		}
		for (const [uid, old] of before) {
			if (now.has(uid) || g.inst[uid]) continue
			const to = old.kind === 'path' ? anchor('path-discard') : old.deckOf != null ? anchor(`discard-${old.deckOf}`) : undefined
			const ghost = document.createElement('div')
			ghost.innerHTML = old.html
			const node = ghost.firstElementChild as HTMLElement | null
			if (!node) continue
			Object.assign(node.style, { position: 'fixed', left: `${old.rect.left}px`, top: `${old.rect.top}px`, width: `${old.rect.width}px`, margin: '0', zIndex: '80', pointerEvents: 'none' })
			document.body.appendChild(node)
			const dx = to ? to.left + to.width / 2 - (old.rect.left + old.rect.width / 2) : 0
			const dy = to ? to.top + to.height / 2 - (old.rect.top + old.rect.height / 2) : -30
			const s = to ? to.width / Math.max(1, old.rect.width) : 0.9
			const anim = node.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: to ? 0.6 : 0 }], { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)' })
			anim.onfinish = () => node.remove()
		}
	})
}

/** Cards moving between piles: deck → hand / fatigue, fatigue → hand / discard, hand → discard… */
function flows(host: HTMLElement, a: Piles, b: Piles, me: number) {
	const rect = (name: string) => host.querySelector<HTMLElement>(`[data-anchor="${name}"]`)?.getBoundingClientRect()
	const BACK = imgUrl('back-player.jpg')
	let delay = 0
	const go = (from: string, to: string, src: string, n: number) => {
		const f = rect(from)
		const t = rect(to)
		if (!f || !t || n <= 0) return
		for (let k = 0; k < Math.min(n, 6); k++) {
			fly(f, t, src, delay)
			delay += 110
		}
	}
	b.r.forEach((R, k) => {
		const A = a.r[k]
		const handTo = k === me ? `hand-${k}` : `mat-${k}`
		// cards that showed up in hand / discard (multiset difference)
		const added = (old: string[], now: string[]) => {
			const left = old.slice()
			return now.filter((id) => {
				const i = left.indexOf(id)
				if (i >= 0) {
					left.splice(i, 1)
					return false
				}
				return true
			})
		}
		const handIn = added(A.hand, R.hand)
		const handOut = added(R.hand, A.hand)
		const discIn = added(A.discard, R.discard)
		let deckOut = Math.max(0, A.deck - R.deck)
		let fatIn = Math.max(0, R.fatigue - A.fatigue)
		let fatOut = Math.max(0, A.fatigue - R.fatigue)
		// deck → fatigue (suffering fatigue)
		const df = Math.min(deckOut, fatIn)
		go(`deck-${k}`, `fatigue-${k}`, BACK, df)
		deckOut -= df
		fatIn -= df
		// hand → fatigue (placing a card on the fatigue stack)
		go(handTo, `fatigue-${k}`, BACK, Math.min(fatIn, handOut.length))
		// fatigue → hand (soothing)
		let newHand = handIn.slice()
		const fh = Math.min(fatOut, newHand.length)
		newHand.slice(0, fh).forEach((id) => go(`fatigue-${k}`, handTo, cardImg(id), 1))
		newHand = newHand.slice(fh)
		fatOut -= fh
		// deck → hand (drawing)
		const dh = Math.min(deckOut, newHand.length)
		go(`deck-${k}`, handTo, BACK, dh)
		deckOut -= dh
		// fatigue → discard (an injury)
		if (fatOut > 0) go(`fatigue-${k}`, `discard-${k}`, BACK, Math.min(fatOut, 6))
		// hand → discard (committed, played or discarded)
		const hd = discIn.filter((id) => handOut.includes(id))
		hd.forEach((id) => go(handTo, `discard-${k}`, cardImg(id), 1))
		// deck → discard (discarded from the top)
		if (deckOut > 0) go(`deck-${k}`, `discard-${k}`, BACK, deckOut)
	})
	// a challenge card is drawn
	if (b.challenge < a.challenge) go('challenge', 'tray', imgUrl('back-challenge.jpg'), 1)
}
