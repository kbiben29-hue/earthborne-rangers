// Hold any card to read it. One listener for a whole screen: every card picture carries
// data-uid (a card in play), data-look (a card id) or data-look-img (a reference card image).
import { useEffect, useRef } from 'react'

export const LOOKABLE = '[data-uid],[data-look],[data-look-img]'

/**
 * Long press (touch, pen or mouse) on an element matching LOOKABLE inside `root` (or the whole page)
 * calls `onLook`; return true if it opened something, and the click that follows is swallowed.
 * Elements inside [data-look-skip] (the hand, which has its own hold) are ignored.
 */
export function useLongPress(root: { current: HTMLElement | null } | null, onLook: (el: HTMLElement) => boolean, ms = 480) {
	const cb = useRef(onLook)
	cb.current = onLook
	useEffect(() => {
		const host: HTMLElement | Document | null = root ? root.current : document
		if (!host) return
		let timer = 0
		let sx = 0
		let sy = 0
		let target: HTMLElement | null = null
		let fired = false
		const down = (e: Event) => {
			const p = e as PointerEvent
			// a new touch: whatever the last long press swallowed is over
			fired = false
			if (p.pointerType === 'mouse' && p.button !== 0) return
			const t = (p.target as HTMLElement | null)?.closest<HTMLElement>(LOOKABLE)
			if (!t || t.closest('[data-look-skip]')) return
			target = t
			sx = p.clientX
			sy = p.clientY
			window.clearTimeout(timer)
			timer = window.setTimeout(() => {
				if (target && cb.current(target)) {
					fired = true
					navigator.vibrate?.(12)
				}
				target = null
			}, ms)
		}
		const move = (e: Event) => {
			const p = e as PointerEvent
			if (target && Math.hypot(p.clientX - sx, p.clientY - sy) > 10) {
				window.clearTimeout(timer)
				target = null
			}
		}
		const up = () => {
			window.clearTimeout(timer)
			target = null
		}
		const click = (e: Event) => {
			if (!fired) return
			fired = false
			e.stopPropagation()
			e.preventDefault()
		}
		host.addEventListener('pointerdown', down, true)
		host.addEventListener('pointermove', move, true)
		host.addEventListener('pointerup', up, true)
		host.addEventListener('pointercancel', up, true)
		host.addEventListener('click', click, true)
		return () => {
			window.clearTimeout(timer)
			host.removeEventListener('pointerdown', down, true)
			host.removeEventListener('pointermove', move, true)
			host.removeEventListener('pointerup', up, true)
			host.removeEventListener('pointercancel', up, true)
			host.removeEventListener('click', click, true)
		}
	}, [root, ms])
}
