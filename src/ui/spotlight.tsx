// A guided walkthrough on any screen: dims everything except one thing (a CSS selector), puts a
// gold ring around it and an explanation card beside it (never on top of it), and scrolls it into view.
import { useEffect, useRef, useState } from 'react'

export interface SpotStep {
	title: string
	body: string
	/** What to do, in a few words (shown when the step waits for the player). */
	todo?: string
	/** Selector of what to point at (null: nothing, card in the middle). */
	target: string | null
	/** Show a Next button. */
	next?: boolean
}

export function Spotlight({ step, index, total, label, onNext, onBack, onSkip }: { step: SpotStep; index: number; total: number; label: string; onNext: () => void; onBack?: () => void; onSkip: () => void }) {
	const [rect, setRect] = useState<DOMRect | null>(null)
	const card = useRef<HTMLDivElement>(null)
	const [cardH, setCardH] = useState(160)
	// bring the target into view
	useEffect(() => {
		const t = window.setTimeout(() => {
			const el = step.target ? document.querySelector<HTMLElement>(step.target) : null
			if (!el) return
			const r = el.getBoundingClientRect()
			const hb = document.querySelector('.handbar')?.getBoundingClientRect().top ?? window.innerHeight
			if (r.top < 50 || r.bottom > hb - 8) el.scrollIntoView({ block: el.closest('.tray') ? 'nearest' : 'center', behavior: 'smooth' })
		}, 120)
		return () => window.clearTimeout(t)
	}, [index, step.target])
	// follow the target on screen
	useEffect(() => {
		let raf = 0
		const tick = () => {
			const el = step.target ? document.querySelector<HTMLElement>(step.target) : null
			const r = el?.getBoundingClientRect() ?? null
			setRect((old) => (r && old && Math.abs(old.left - r.left) < 1 && Math.abs(old.top - r.top) < 1 && Math.abs(old.width - r.width) < 1 && Math.abs(old.height - r.height) < 1 ? old : r))
			if (card.current) setCardH(card.current.offsetHeight)
			raf = requestAnimationFrame(tick)
		}
		tick()
		return () => cancelAnimationFrame(raf)
	}, [step.target])
	const vh = window.innerHeight
	const vw = window.innerWidth
	const pad = 6
	let style: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
	if (rect) {
		// below, above, left or right of the target: the first place where the card fits
		const w = Math.min(380, vw - 16)
		const h = cardH
		const cx = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), vw - w - 8)
		const cy = Math.min(Math.max(8, rect.top + rect.height / 2 - h / 2), vh - h - 8)
		const spots = [
			{ left: cx, top: rect.bottom + 14 },
			{ left: cx, top: rect.top - 14 - h },
			{ left: rect.left - 14 - w, top: cy },
			{ left: rect.right + 14, top: cy },
		]
		const fits = (p: { left: number; top: number }) => p.left >= 8 && p.top >= 8 && p.left + w <= vw - 8 && p.top + h <= vh - 8
		const best = spots.find(fits) ?? { left: cx, top: rect.top + rect.height / 2 < vh / 2 ? vh - h - 8 : 8 }
		style = { left: best.left, top: best.top, width: w }
	}
	return (
		<>
			{rect ? <div className="lesson-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="lesson-dim" />}
			<div className="lesson-card" ref={card} style={style}>
				<small>
					{label} · {index + 1} / {total}
				</small>
				<h3>{step.title}</h3>
				<p>{step.body}</p>
				{step.todo && !step.next && <p className="lesson-todo">👉 {step.todo}</p>}
				<div className="btns">
					{onBack && index > 0 && step.next && <button onClick={onBack}>Back</button>}
					{step.next && (
						<button className="primary" onClick={onNext}>
							{index + 1 < total ? 'Next' : 'Got it'}
						</button>
					)}
					<button className="ghost" onClick={onSkip}>
						{label === 'Lesson' ? 'Skip lesson' : 'Stop the guide'}
					</button>
				</div>
			</div>
		</>
	)
}
