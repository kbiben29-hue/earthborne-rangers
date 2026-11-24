// Cards move like on a real table: every render we measure the cards in play (data-uid), and
// animate the difference — a path card flies in from the path deck, a Ranger card from its
// owner's hand, a discarded card slides off to its discard pile, a moved card glides over.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { Game } from '../engine/types'

interface Seen {
	rect: DOMRect
	html: string
	kind: string
	deckOf: number | undefined
}
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useMotion(root: RefObject<HTMLElement | null>, g: Game) {
	const prev = useRef<Map<number, Seen> | null>(null)
	useLayoutEffect(() => {
		const host = root.current
		if (!host) return
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
		if (!before || reduced()) return
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
