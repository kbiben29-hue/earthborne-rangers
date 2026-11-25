import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMotion } from './motion'
import { coachFor, eventNote, INTRO, type CoachStep } from './coach'
import { GUIDE_PACK, GuideWindow } from './guide'
import { LESSON, lessonAt } from './lesson'
import { Spotlight } from './spotlight'
import { ASPECTS, card, CARDS, CHALLENGE, MISSIONS_CORE, SETS, TERRAINS, type Aspect } from '../data/data'
import {
	baseTests,
	timingOf,
	attachments,
	availableTests,
	between,
	canTakeTurn,
	canTravel,
	commonTargetOk,
	costOf,
	equipUsed,
	isResponse,
	has,
	iconsFor,
	nameOf,
	P,
	presence,
	SYM_LABEL,
	testOptions,
	tokenEffort,
	typeOf,
	zoneCards,
} from '../engine/engine'

import type { Game, Intent, ManualOp, Prompt } from '../engine/types'
import { CardTile, cardImg, HandCard, imgUrl, RulesText } from './Card'

type Dispatch = (it: Intent) => string | null
type Sel = { kind: 'inst'; uid: number } | { kind: 'hand'; ranger: number; index: number } | null
type Pick = { why: string; ok: (uid: number) => boolean; done: (uid: number) => void } | null

export interface CampaignHooks {
	addEvent: (text: string) => void
	unlockReward: (id: string) => void
	addMission: (id: string) => void
	rewards: string[]
}

const ASPECT_NAME: Record<Aspect, string> = { AWA: 'Awareness', FIT: 'Fitness', FOC: 'Focus', SPI: 'Spirit' }
const APPROACH_ICON: Record<string, string> = { conflict: '⚔ conflict', reason: '△ reason', exploration: '🧭 exploration', connection: '♥ connection' }

export function Board({
	g,
	dispatch,
	undo,
	canUndo,
	onExit,
	onDayOver,
	hooks,
	coach = false,
	lesson = false,
}: {
	g: Game
	dispatch: Dispatch
	undo: () => void
	canUndo: boolean
	onExit: () => void
	onDayOver: () => void
	hooks: CampaignHooks
	coach?: boolean
	/** The beginner lesson (tutorial only). */
	lesson?: boolean
}) {
	const [sel, setSel] = useState<Sel>(null)
	// the guided lesson (tutorial): step index, kept across reloads
	const [lk, setLkRaw] = useState(() => {
		if (!lesson) return LESSON.length
		try {
			return Number(localStorage.getItem('earthborne.lesson') ?? LESSON.length)
		} catch {
			return 0
		}
	})
	const setLk = (n: number) => {
		setLkRaw(n)
		try {
			localStorage.setItem('earthborne.lesson', String(n))
		} catch {}
	}
	const [tutOff, setTutOff] = useState(false)
	const lessonOn = lesson && !tutOff && lk < LESSON.length
	const [intro, setIntro] = useState(-1)
	const [coachOn, setCoachOn] = useState(coach)
	const [coachMin, setCoachMin] = useState(false)
	const [seen, setSeen] = useState<Set<string>>(() => new Set())
	const [note, setNote] = useState<CoachStep | null>(null)
	const prevG = useRef(g)
	const [pick, setPick] = useState<Pick>(null)
	const [bubble, setBubble] = useState<{ uid: number; x: number; y: number; below: number } | null>(null)
	const [me, setMe] = useState(0)
	const [manual, setManual] = useState(() => localStorage.getItem('earthborne.manual') === '1')
	const [panel, setPanel] = useState<'none' | 'log' | 'menu' | 'search' | 'map'>('none')
	const [drag, setDrag] = useState<{ index: number; x: number; y: number } | null>(null)
	const [refZoom, setRefZoom] = useState<string | null>(null)
	const [lifted, setLifted] = useState<{ index: number; x: number; y: number } | null>(null)
	const boardRef = useRef<HTMLDivElement>(null)
	useMotion(boardRef, g, me)
	// how tall the hand + test buttons are, so pop-ups (tray, aim bar) sit just above them
	useLayoutEffect(() => {
		const root = boardRef.current
		const hb = root?.querySelector<HTMLElement>('.handbar')
		if (!root || !hb) return
		const set = () => root.style.setProperty('--handbar', `${hb.offsetHeight}px`)
		set()
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null
		ro?.observe(hb)
		return () => ro?.disconnect()
	}, [])
	const head = g.queue[0]

	useEffect(() => {
		const r = head && 'ranger' in head ? head.ranger : g.acting
		if (r != null && r >= 0 && r < g.rangers.length) setMe(r)
	}, [head, g.acting, g.rangers.length])
	useEffect(() => {
		try {
			localStorage.setItem('earthborne.manual', manual ? '1' : '0')
		} catch {}
	}, [manual])
	useEffect(() => {
		const k = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setSel(null)
				setPick(null)
				setBubble(null)
				setPanel('none')
			}
		}
		window.addEventListener('keydown', k)
		return () => window.removeEventListener('keydown', k)
	}, [])

	// coach: one-off notes when something new happens, and the step for right now
	useEffect(() => {
		if (!coachOn) return
		const n = eventNote(prevG.current, g, seen)
		prevG.current = g
		if (n) {
			setNote(n)
			setSeen((s) => new Set(s).add(n.key))
		}
	}, [g, coachOn, seen])
	const step = coachOn && !lessonOn ? coachFor(g, me, seen) : null
	const hint = step?.hint ?? {}
	const coachBtn = (k: string) => (hint.buttons?.includes(k) ? 'coach' : '')

	const R = g.rangers[me]
	const turnWhy = canTakeTurn(g, me)
	const myTurnOk = turnWhy == null || turnWhy === 'role'
	const useRole = turnWhy === 'role'
	const choosing = head?.kind === 'choose' ? head : null
	const idle = !head && g.phase === 'turns'

	// What a tap on a card in play can do right now
	const cardActions = (uid: number) => {
		const out: { label: string; aspect?: Aspect; run: () => void }[] = []
		if (!idle || !g.inst[uid]) return out
		for (const t of availableTests(g, me).filter((t) => t.src === uid))
			out.push({ label: t.name, aspect: t.aspect, run: () => dispatch({ t: 'test', ranger: me, src: uid, test: t.test, useRole }) })
		for (const t of baseTests(g, me).filter((t) => t.targets && commonTargetOk(g, t.key, uid)))
			out.push({ label: t.name, aspect: t.aspect, run: () => dispatch({ t: 'test', ranger: me, src: null, test: t.key, target: uid, useRole }) })
		P(g, uid).abilities.forEach((a, i) => {
			if (a.kind !== 'exhaust' || (a.timing && !/^Before your first turn/i.test(a.timing)) || /^Exhaust[^:]*: When (?:a Ranger|you) performs?/i.test(a.text)) return
			const inst = g.inst[uid]
			if (inst.exhausted || (inst.zone === 'player' && inst.owner !== me && inst.kind !== 'path')) return
			out.push({ label: a.text.replace(/^Exhaust(?: \(use [^)]*\))?:\s*/i, '').slice(0, 42), run: () => dispatch({ t: 'ability', ranger: me, uid, line: i }) })
		})
		return out
	}
	const usable = (uid: number) => idle && myTurnOk && cardActions(uid).some((a) => !a.aspect || R.energy[a.aspect] > 0)

	const tap = (uid: number, e: React.MouseEvent) => {
		if (choosing && choosing.max === 1 && choosing.options.includes(uid)) {
			dispatch({ t: 'choose', uids: [uid] })
			return
		}
		if (pick) {
			if (pick.ok(uid)) {
				pick.done(uid)
				setPick(null)
			}
			return
		}
		const acts = cardActions(uid)
		if (acts.length) {
			const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
			setBubble({ uid, x: r.left + r.width / 2, y: r.top, below: r.bottom })
			setSel(null)
		} else {
			setBubble(null)
			setSel({ kind: 'inst', uid })
		}
	}
	// touch screens have no right-click: holding a card for a moment opens it big
	const holdTimer = useRef(0)
	const heldRef = useRef(false)
	const holdToInspect = (uid: number) => ({
		onPointerDown: (e: React.PointerEvent) => {
			if (e.pointerType === 'mouse') return
			heldRef.current = false
			window.clearTimeout(holdTimer.current)
			holdTimer.current = window.setTimeout(() => {
				heldRef.current = true
				inspect(uid)
			}, 550)
		},
		onPointerUp: () => window.clearTimeout(holdTimer.current),
		onPointerLeave: () => window.clearTimeout(holdTimer.current),
		onPointerCancel: () => window.clearTimeout(holdTimer.current),
		onClickCapture: (e: React.MouseEvent) => {
			if (heldRef.current) {
				heldRef.current = false
				e.stopPropagation()
				e.preventDefault()
			}
		},
	})
	const inspect = (uid: number, e?: React.MouseEvent) => {
		e?.preventDefault()
		setBubble(null)
		setSel({ kind: 'inst', uid })
	}

	const tile = (uid: number, small = false) => {
		const inst = g.inst[uid]
		if (!inst) return null
		const att = attachments(g, uid)
		const glow = hint.uids?.includes(uid) && (!choosing || choosing.options.includes(uid)) && (!pick || pick.ok(uid)) ? 'coach' : choosing?.options.includes(uid) ? 'pick' : pick?.ok(uid) ? 'pick' : usable(uid) ? 'use' : ''
		return (
			<div className={`stack ${small ? 'small' : ''}`} key={uid}>
				<div onContextMenu={(e) => inspect(uid, e)} className={`glow-${glow}`} {...holdToInspect(uid)}>
					<CardTile g={g} inst={inst} small={small} onClick={(e) => tap(uid, e)} selected={(sel?.kind === 'inst' && sel.uid === uid) || bubble?.uid === uid} pickable={glow === 'pick'} />
				</div>
				{att.map((a) => (
					<div className="attached" key={a.uid} onContextMenu={(e) => inspect(a.uid, e)}>
						<CardTile g={g} inst={a} small onClick={(e) => tap(a.uid, e)} pickable={!!choosing?.options.includes(a.uid) || (!!pick && pick.ok(a.uid))} />
					</div>
				))}
			</div>
		)
	}

	// ----- playing from hand
	const playable = (r: number, i: number): boolean => {
		const Rr = g.rangers[r]
		const id = Rr.hand[i]
		if (!id || !idle) return false
		const c = card(id)
		if (c.type === 'Attribute') return false
		const resp = isResponse(id)
		const why = canTakeTurn(g, r)
		if (!resp && why != null && why !== 'role') return false
		const cost = costOf(id)
		return Rr.energy[c.aspect ?? 'AWA'] >= (cost === 'X' ? 0 : cost)
	}
	const playHand = (r: number, i: number, dropOn?: number) => {
		const id = g.rangers[r].hand[i]
		const c = card(id)
		const cost = costOf(id)
		const x = cost === 'X' ? Number(prompt(`Pay how much for ${c.name}? (X)`, '1') || '0') : undefined
		setLifted(null)
		if (c.type === 'Attachment' && dropOn != null && g.inst[dropOn]) {
			dispatch({ t: 'play', ranger: r, hand: i, target: dropOn, x, useRole })
			return
		}
		if (c.type === 'Attachment' && !/^Search the path deck and discard for/i.test((c.text ?? '').replace(/<[^>]+>/g, ''))) {
			setPick({ why: `Attach ${c.name}: tap the card to attach it to`, ok: (u) => !!g.inst[u], done: (u) => dispatch({ t: 'play', ranger: r, hand: i, target: u, x, useRole }) })
			return
		}
		dispatch({ t: 'play', ranger: r, hand: i, x, useRole })
	}
	const onHandDown = (i: number, e: React.PointerEvent) => {
		if (e.button !== 0) return
		const sx = e.clientX
		const sy = e.clientY
		let moved = false
		let held = false
		// hold a card (touch) to look at it closely
		const timer = window.setTimeout(() => {
			if (moved) return
			held = true
			setLifted(null)
			setSel({ kind: 'hand', ranger: me, index: i })
		}, 550)
		const move = (ev: PointerEvent) => {
			if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 14) return
			window.clearTimeout(timer)
			moved = true
			setDrag({ index: i, x: ev.clientX, y: ev.clientY })
		}
		const up = (ev: PointerEvent) => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', up)
			window.clearTimeout(timer)
			setDrag(null)
			if (held) return
			const handTop = document.querySelector('.handbar')?.getBoundingClientRect().top ?? 9999
			if (moved && ev.clientY < handTop - 20) {
				// dropped on a card? (attachments go onto the card you drop them on)
				const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-uid]')
				const dropOn = under ? Number(under.dataset.uid) : undefined
				if (playable(me, i)) playHand(me, i, dropOn)
				else dispatch({ t: 'play', ranger: me, hand: i, useRole })
			} else if (!moved) {
				// a tap lifts the card: you lay it on the table yourself by dragging it there
				const r = (ev.target as HTMLElement).closest('.hcard')?.getBoundingClientRect()
				setBubble(null)
				setLifted(lifted?.index === i ? null : { index: i, x: r ? r.left + r.width / 2 : ev.clientX, y: r ? r.top : ev.clientY })
			}
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
	}

	const startCommon = (key: string) => {
		const t = baseTests(g, me).find((x) => x.key === key)!
		setBubble(null)
		if (!t.targets) {
			dispatch({ t: 'test', ranger: me, src: null, test: key, useRole })
			return
		}
		setSel(null)
		setPick({
			why: `${t.name}: tap a ${t.targets}`,
			ok: (uid) => commonTargetOk(g, key, uid),
			done: (uid) => dispatch({ t: 'test', ranger: me, src: null, test: key, target: uid, useRole }),
		})
	}

	const weather = g.weather.filter((u) => g.inst[u])
	const missions = g.missions.filter((u) => g.inst[u])
	const along = zoneCards(g, 'along').map((i) => i.uid)
	const banner =
		g.phase === 'turns' && !head
			? g.rangers.every((r) => r.rested)
				? ''
				: `${R.name}'s turn${useRole ? ' (exhausts role)' : ''}`
			: PHASE[g.phase]
	const lastPath = g.pathDiscard[g.pathDiscard.length - 1]

	return (
		<div className={`board tabletop ${pick || choosing ? 'picking' : ''} ${drag ? 'dropping' : ''}`} ref={boardRef} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.target === e.currentTarget && setBubble(null)}>
			<header className="topbar">
				<button className="ghost" onClick={() => setPanel(panel === 'menu' ? 'none' : 'menu')} title="Menu">
					☰
				</button>
				<div className="title">
					<b>Day {g.day}</b> · Round {g.round}
				</div>
				<div className="phase-pill">{banner}</div>
				<button
					className={`ghost tut-toggle ${(coach ? !tutOff : coachOn) ? 'on' : ''}`}
					onClick={() => {
						const on = coach ? tutOff : !coachOn
						setTutOff(!on)
						setCoachOn(on)
					}}
					title={(coach ? !tutOff : coachOn) ? 'Turn the tutorial off' : 'Turn the tutorial on'}
				>
					🎓<span className="tut-label">{(coach ? !tutOff : coachOn) ? ' Tutorial on' : ' Tutorial off'}</span>
				</button>
				<button className="ghost" onClick={undo} disabled={!canUndo} title="Undo">
					↶
				</button>
				<button className="ghost" onClick={() => setPanel(panel === 'log' ? 'none' : 'log')} title="Log">
					☷
				</button>
			</header>

			<main
				className="felt"
				onClick={(e) => {
					if (e.target === e.currentTarget) setBubble(null)
					setLifted(null)
				}}
			>
				<section className="sky">
					<div className="refs" title="Reference cards">
						{(R.spiritspeak ? ['03206.jpg'] : R.spiritOnce ? ['01431A.jpg', '03206.jpg'] : ['01431A.jpg']).concat('01431B.jpg').map((f) => (
							<button key={f} className="ref-card" onClick={() => setRefZoom(f)}>
								<img src={imgUrl(f)} alt={f === '01431B.jpg' ? 'Round structure' : f === '03206.jpg' ? 'Spirit Speaker tests' : 'Common tests'} />
							</button>
						))}
					</div>
					<div className="row">{weather.map((u) => tile(u))}</div>
					<div className="loc">{tile(g.location)}</div>
					<div className="row">{missions.map((u) => tile(u, true))}</div>
					<div className="piles">
						<Pile label="Path" n={g.pathDeck.length} back="back-path.jpg" anchor="path-deck" onClick={() => setPanel('search')} />
						<Pile label="Discard" n={g.pathDiscard.length} face={lastPath} anchor="path-discard" />
						<Pile label="Challenge" n={g.challenge.length} back="back-challenge.jpg" anchor="challenge" />
						{Object.entries(g.decks ?? {}).map(([name, d]) => (
							<Pile key={name} label={name} n={d.length} back="back-path.jpg" anchor={`side-${name}`} />
						))}
					</div>
				</section>
				<section className="along" data-drop="play">
					<span className="zone-label">Along the way</span>
					<div className="row center">{along.map((u) => tile(u))}</div>
				</section>
				<section className="mats">
					{g.rangers.map((r, k) => (
						<div key={k} className={`mat r${k} ${k === me ? 'me' : ''} ${r.rested ? 'rested' : ''}`} onClick={() => k !== me && setMe(k)}>
							<div className="mat-head" data-anchor={`mat-${k}`}>
								<span className={`chip r${k}`}>{r.name}</span>
								{k === g.lead && <span className="lead">lead</span>}
								{r.rested && <span className="lead">rested</span>}
								<span className="energy">
									{ASPECTS.map((a) => (
										<span key={a} className={`en en-${a}`} title={`${ASPECT_NAME[a]}: ${r.energy[a]} of ${r.aspects[a]}`}>
											{r.energy[a]}
											<small>{a}</small>
										</span>
									))}
								</span>
								{r.injuries > 0 && <span className="hurt">✚ {r.injuries}</span>}
							</div>
							<div className="mat-body">
								<div className="gear">{[r.roleUid, ...zoneCards(g, 'player', k).filter((i) => i.uid !== r.roleUid).map((i) => i.uid)].map((u) => tile(u, true))}</div>
								<div className="reach" data-drop="play">
									{zoneCards(g, 'reach', k).map((i) => tile(i.uid))}
									{!zoneCards(g, 'reach', k).length && <span className="zone-label">within reach</span>}
								</div>
								<div className="piles small">
									<Pile label="Deck" n={r.deck.length} back="back-player.jpg" anchor={`deck-${k}`} />
									<Pile label="Fatigue" n={r.fatigue.length} back="back-player.jpg" anchor={`fatigue-${k}`} tilt />
									<Pile label="Discard" n={r.discard.length} face={r.discard[r.discard.length - 1]} anchor={`discard-${k}`} />
								</div>
							</div>
						</div>
					))}
				</section>
			</main>

			<section className="handbar">
				<div className="dock">
					{g.rangers.length > 1 && (
						<span className="switch">
							{g.rangers.map((r, k) => (
								<button key={k} className={`chip-btn r${k} ${k === me ? 'on' : ''}`} onClick={() => setMe(k)}>
									{r.name}
								</button>
							))}
						</span>
					)}
					{idle && (
						<span className="acts">
							{R.spiritspeak && <span className="spirit-tag" title="Spiritspeaking: Spirit Speaker tests replace the common tests until your role readies">✧ Spiritspeaking</span>}
							{baseTests(g, me).map((t) => (
								<button key={t.key} data-act={t.key} className={`act act-${t.aspect} ${coachBtn(t.key)}`} disabled={!myTurnOk || R.energy[t.aspect] < 1} onClick={() => startCommon(t.key)} title={t.text}>
									<b>{t.aspect}</b>
									{t.name}
								</button>
							))}
							<button disabled={R.rested} data-act="rest" onClick={() => dispatch({ t: 'rest', ranger: me })} className={`act rest ${coachBtn('rest')}`} title="Done for this round">
								<b>✓</b>Rest
							</button>
						</span>
					)}
					{turnWhy && turnWhy !== 'role' && idle && <span className="hint">{turnWhy}</span>}
				</div>
				<div className="hand fan" data-anchor={`hand-${me}`}>
					{R.hand.map((id, i) => {
						const n = R.hand.length
						const mid = (n - 1) / 2
						const can = playable(me, i)
						const nth = R.hand.slice(0, i).filter((x) => x === id).length
						return (
							<div
								key={`${id}#${nth}`}
								data-card={id}
								className={`hcard ${can ? 'glow-play' : ''} ${hint.hand?.includes(i) ? 'coach' : ''} ${drag?.index === i ? 'dragging' : ''} ${lifted?.index === i ? 'lifted' : ''}`}
								style={{ ['--r' as string]: `${(i - mid) * Math.min(4, 24 / n)}deg`, ['--y' as string]: `${Math.abs(i - mid) ** 1.6 * 2}px` }}
								onPointerDown={(e) => onHandDown(i, e)}
								onContextMenu={(e) => {
									e.preventDefault()
									setSel({ kind: 'hand', ranger: me, index: i })
								}}
							>
								<img src={cardImg(id)} alt={card(id).name} draggable={false} />
							</div>
						)
					})}
					{!R.hand.length && <p className="empty">No cards in hand.</p>}
				</div>
				{drag && R.hand[drag.index] && <img className="drag-ghost" src={cardImg(R.hand[drag.index])} style={{ left: drag.x, top: drag.y }} alt="" />}
				{lifted && R.hand[lifted.index] && !drag && (
					<Floating className="bubble hand-tip" x={lifted.x} y={lifted.y - 70}>
						<b>{card(R.hand[lifted.index]).name}</b>
						<p className="sub">
							{card(R.hand[lifted.index]).type === 'Attribute'
								? 'Attributes are committed to tests for their icons.'
								: playable(me, lifted.index)
									? card(R.hand[lifted.index]).type === 'Attachment'
										? 'Drag it onto the card you want to attach it to.'
										: 'Drag it up onto the table to play it.'
									: 'You can’t play this right now.'}
						</p>
						<button
							className="ghost"
							onClick={() => {
								setSel({ kind: 'hand', ranger: me, index: lifted.index })
								setLifted(null)
							}}
						>
							Look closer…
						</button>
					</Floating>
				)}
			</section>

			{(pick || (choosing && choosing.max === 1)) && (
				<div className="aimbar">
					{pick ? pick.why : `${choosing!.title}: ${choosing!.text}`}
					{pick && <button onClick={() => setPick(null)}>Cancel</button>}
				</div>
			)}

			{coachOn && intro >= 0 && (
				<div className="drawer intro" onClick={() => {}}>
					<div className="intro-card">
						<small>
							Tutorial · {intro + 1} / {INTRO.length}
						</small>
						<h2>{INTRO[intro].title}</h2>
						{INTRO[intro].body.split('\n').map((l, k) => (
							<p key={k}>{l}</p>
						))}
						<div className="btns">
							{intro > 0 && <button onClick={() => setIntro(intro - 1)}>Back</button>}
							<button className="primary" onClick={() => setIntro(intro + 1 < INTRO.length ? intro + 1 : -1)}>
								{intro + 1 < INTRO.length ? 'Next' : 'Let’s go'}
							</button>
							<button className="ghost" onClick={() => setIntro(-1)}>
								Skip
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="tray" data-anchor="tray">
				{coachOn && !lessonOn && intro < 0 && (step || note) && (
					<div className={`coach-panel ${coachMin ? 'min' : ''}`}>
						{coachMin ? (
							<button className="coach-pill" onClick={() => setCoachMin(false)}>
								🧭 Coach
							</button>
						) : (
							<>
								<div className="coach-head">
									<b>🧭 {note ? note.title : step!.title}</b>
									<span>
										<button className="ghost" title="Make smaller" onClick={() => setCoachMin(true)}>
											–
										</button>
										<button className="ghost" title="Turn the coach off" onClick={() => setCoachOn(false)}>
											×
										</button>
									</span>
								</div>
								<p>{note ? note.body : step!.body}</p>
								{note && (
									<button
										className="primary"
										onClick={() => {
											setNote(null)
										}}
									>
										Got it
									</button>
								)}
							</>
						)}
					</div>
				)}
				<LastTest g={g} keep={lessonOn} />
				{head && !(choosing && choosing.max === 1) && (
					<div className={coachOn && hint.buttons?.length ? `coached ${hint.buttons.map((b) => `c-${b}`).join(' ')}` : ''}>
						<PromptPanel g={g} head={head} dispatch={dispatch} setPick={setPick} onDayOver={onDayOver} hooks={hooks} coachEnergy={coachOn ? hint.energy : undefined} tutorial={lesson} />
					</div>
				)}
			</div>

			{bubble && g.inst[bubble.uid] && (
				<Floating className="bubble" x={bubble.x} y={bubble.y} below={bubble.below}>
					<b>{nameOf(g, bubble.uid)}</b>
					{cardActions(bubble.uid).map((a, k) => (
						<button
							key={k}
							disabled={(!!a.aspect && R.energy[a.aspect] < 1) || !myTurnOk}
							onClick={() => {
								setBubble(null)
								a.run()
							}}
						>
							{a.aspect && <span className={`asp-${a.aspect}`}>{a.aspect} </span>}
							{a.label}
						</button>
					))}
					<button className="ghost" onClick={() => inspect(bubble.uid)}>
						Look closer…
					</button>
				</Floating>
			)}

			{lessonOn && <Lesson g={g} k={lk} setK={setLk} picking={!!pick} />}

			{refZoom && (
				<div className="drawer ref-zoom" onClick={() => setRefZoom(null)}>
					<img src={imgUrl(refZoom)} alt="" />
				</div>
			)}

			{sel && (
				<div className="drawer" onClick={() => setSel(null)}>
					<div className="drawer-body" onClick={(e) => e.stopPropagation()}>
						<Viewer
							g={g}
							sel={sel}
							me={me}
							manual={manual}
							dispatch={(it) => {
								const e = dispatch(it)
								if (!e) setSel(null)
								return e
							}}
							setPick={setPick}
							close={() => setSel(null)}
							useRole={useRole}
							turnOk={myTurnOk}
						/>
					</div>
				</div>
			)}

			{panel === 'log' && (
				<div className="drawer" onClick={() => setPanel('none')}>
					<div className="drawer-body" onClick={(e) => e.stopPropagation()}>
						<h3>Log</h3>
						<ol className="log">
							{g.log
								.slice(-150)
								.reverse()
								.map((l, i) => (
									<li key={i}>{l}</li>
								))}
						</ol>
					</div>
				</div>
			)}
			{panel === 'menu' && (
				<Menu coachOn={coachOn} setCoachOn={setCoachOn} g={g} me={me} manual={manual} setManual={setManual} dispatch={dispatch} close={() => setPanel('none')} openSearch={() => setPanel('search')} openMap={() => setPanel('map')} onExit={onExit} hooks={hooks} />
			)}
			{panel === 'search' && <Search g={g} me={me} dispatch={dispatch} close={() => setPanel('none')} />}
			{panel === 'map' && (
				<div className="drawer" onClick={() => setPanel('none')}>
					<div className="drawer-body wide" onClick={(e) => e.stopPropagation()}>
						<MapView g={g} />
					</div>
				</div>
			)}
		</div>
	)
}

/** The guided lesson: dims the table except the part being explained, and says what to do. */
function Lesson({ g, k, setK, picking }: { g: Game; k: number; setK: (n: number) => void; picking: boolean }) {
	const at = lessonAt(g, k)
	const s = LESSON[Math.min(at, LESSON.length - 1)]
	useEffect(() => {
		if (at !== k) setK(at)
	}, [at, k])
	// done by the player? go on to the next step
	useEffect(() => {
		if (s.done && s.done(g, { picking })) setK(at + 1)
	})
	return (
		<Spotlight
			step={{ title: s.title, body: s.body, todo: s.todo, next: s.next, target: s.target?.(g) ?? null }}
			index={Math.min(at, LESSON.length - 1)}
			total={LESSON.length}
			label="Lesson"
			onNext={() => setK(at + 1)}
			onBack={() => setK(Math.max(0, at - 1))}
			onSkip={() => setK(LESSON.length)}
		/>
	)
}

/** A pop-up above a card that stays on screen: it flips below the card near the top, and slides in from the edges. */
function Floating({ x, y, below, className, children }: { x: number; y: number; below?: number; className: string; children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null)
	const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		const w = el.offsetWidth
		const h = el.offsetHeight
		const vw = window.innerWidth
		const vh = window.innerHeight
		let top = y - h - 10
		if (top < 8) top = below != null ? below + 10 : 8
		if (top + h > vh - 8) top = Math.max(8, vh - h - 8)
		const left = Math.min(Math.max(8, x - w / 2), vw - w - 8)
		setPos({ left, top })
	}, [x, y, below])
	return (
		<div ref={ref} className={`${className} floating`} style={pos ? { left: pos.left, top: pos.top } : { left: x, top: y, visibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
			{children}
		</div>
	)
}

function Pile({ label, n, back, face, anchor, onClick, tilt }: { label: string; n: number; back?: string; face?: string; anchor: string; onClick?: () => void; tilt?: boolean }) {
	return (
		<div className={`pile ${tilt ? 'tilt' : ''}`} onClick={onClick} title={`${label}: ${n}`}>
			<div className="pile-card" data-anchor={anchor}>
				{n > 0 ? face ? <img src={cardImg(face)} alt="" /> : <img src={imgUrl(back!)} alt="" /> : <div className="pile-empty" />}
				{n > 1 && <div className="pile-shadow" />}
				<span className="pile-n">{n}</span>
			</div>
			<span className="pile-label">{label}</span>
		</div>
	)
}

const PHASE: Record<Game['phase'], string> = { setup: 'Setting up', path: 'Path cards', turns: 'Ranger turns', travel: 'Travel', refresh: 'Refresh', over: 'Day over' }

function PromptPanel({ g, head, dispatch, setPick, onDayOver, hooks, coachEnergy, tutorial }: { g: Game; head: Prompt; dispatch: Dispatch; setPick: (p: Pick) => void; onDayOver: () => void; hooks: CampaignHooks; coachEnergy?: number; tutorial?: boolean }) {
	switch (head.kind) {
		case 'mulligan':
			return <Mulligan g={g} r={head.ranger} dispatch={dispatch} />
		case 'test':
			return <Commit key={g.log.length} g={g} head={head} dispatch={dispatch} coachEnergy={coachEnergy} />
		case 'choose':
			return <Choose g={g} head={head} dispatch={dispatch} />
		case 'ask':
			return <Ask head={head} dispatch={dispatch} />
		case 'pickHand':
			return <PickHand key={head.key + g.log.length} g={g} head={head} dispatch={dispatch} />
		case 'manual':
			return <Manual head={head} dispatch={dispatch} />
		case 'aspect':
			return (
				<div className="panel prompt">
					<h3>{head.title}</h3>
					<p>{head.text}</p>
					<div className="btns">
						{head.options.map((a) => (
							<button key={a} className={`en en-${a}`} onClick={() => dispatch({ t: 'aspect', a })}>
								{a}
							</button>
						))}
					</div>
				</div>
			)
		case 'guide':
			return <Guide entry={head.entry} why={head.why} pack={head.pack} dispatch={dispatch} hooks={hooks} />
		case 'scout':
			return <Scout key={head.cards.join()} g={g} head={head} dispatch={dispatch} />
		case 'equip':
			return (
				<div className="panel prompt">
					<h3>Too much gear</h3>
					<p>
						{g.rangers[head.ranger].name} has more than 5 equip squares in their player area ({equipUsed(g, head.ranger)}). Tap gear and choose <b>Discard</b> until 5 or fewer remain.
					</p>
				</div>
			)
		case 'travel':
			return <Travel g={g} dispatch={dispatch} />
		case 'dayOver':
			return (
				<div className="panel prompt over">
					<h3>The day is over</h3>
					<p>{head.reason}</p>
					{g.lingering.length > 0 && <p>{g.lingering.map((r) => g.rangers[r].name).join(' and ')} add{g.lingering.length === 1 ? 's' : ''} a Lingering Injury to their deck.</p>}
					<button className="primary" onClick={onDayOver}>
						{tutorial ? 'Finish the tutorial' : 'Record the day in the campaign'}
					</button>
				</div>
			)
	}
}

function Mulligan({ g, r, dispatch }: { g: Game; r: number; dispatch: Dispatch }) {
	const R = g.rangers[r]
	const [aside, setAside] = useState<number[]>([])
	const [setup, setSetup] = useState<string>('')
	const setupCards = [...new Set(R.deck.filter((id) => /\bSetup\b/.test((card(id).text || '').split('\n')[0])))]
	return (
		<div className="panel prompt">
			<h3>{R.name}: starting hand</h3>
			<p>Tap cards to set them aside and draw new ones (mulligan), or keep your hand.</p>
			<div className="hand mini">
				{R.hand.map((id, i) => (
					<HandCard key={i} id={id} selected={aside.includes(i)} note={aside.includes(i) ? 'set aside' : undefined} onClick={() => setAside((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]))} />
				))}
			</div>
			{setupCards.length > 0 && (
				<label className="field">
					Setup card to put into play
					<select value={setup} onChange={(e) => setSetup(e.target.value)}>
						<option value="">None</option>
						{setupCards.map((id) => (
							<option key={id} value={id}>
								{card(id).name}
							</option>
						))}
					</select>
				</label>
			)}
			<button className="primary" onClick={() => dispatch({ t: 'keep', ranger: r, mulligan: aside, setup: setup || undefined })}>
				{aside.length ? `Mulligan ${aside.length}` : 'Keep hand'}
			</button>
		</div>
	)
}

function Commit({ g, head, dispatch, coachEnergy }: { g: Game; head: Extract<Prompt, { kind: 'test' }>; dispatch: Dispatch; coachEnergy?: number }) {
	const R = g.rangers[head.ranger]
	const opt = testOptions(g, head)
	const [swap, setSwap] = useState(false)
	const aspect = swap && opt.swap ? opt.swap.to : head.aspect
	const max = R.energy[aspect]
	const [energy, setEnergy] = useState(Math.min(max, coachEnergy ?? Math.max(1, head.diff)))
	const [disc, setDisc] = useState<number[]>([])
	const [vers, setVers] = useState<number[]>([])
	const [extra, setExtra] = useState(0)
	const [diff, setDiff] = useState(head.diff)
	const [dodgeRole, setDodgeRole] = useState(false)
	const [buffers, setBuffers] = useState(0)
	const [boosts, setBoosts] = useState<number[]>([])
	const [resp, setResp] = useState<number[]>([])
	const [xs, setXs] = useState<string[]>([])
	const xsOn = opt.extras.filter((x) => xs.includes(x.key))
	const pool = { ...R.energy, [aspect]: R.energy[aspect] - energy }
	const iconsOf = (i: number) => iconsFor(g, head.ranger, R.hand[i], head.approach, pool) + (vers.includes(i) ? 1 : 0)
	const icons = disc.reduce((s, i) => s + iconsOf(i), 0)
	const tok = tokenEffort(g, head.ranger, head.target)
	const total = Math.max(0, Math.min(energy, max) + icons + tok + extra + boosts.length + xsOn.reduce((n, x) => n + x.effort, 0) + opt.mods.reduce((n, m) => n + m.effort, 0))
	const dodges = (dodgeRole ? 1 : 0) + xsOn.reduce((n, x) => n + x.dodge, 0) + resp.reduce((n, h) => n + (opt.responses.find((x) => x.hand === h && x.kind === 'dodge')?.n ?? 0), 0)
	const hurting = opt.inWay.filter((u) => !has(g, u, 'Friendly')).sort((a, b) => presence(g, b) - presence(g, a))
	const fat = hurting.slice(dodges).reduce((n, u) => n + Math.max(0, presence(g, u) - buffers), 0)
	const toggle = (list: number[], set: (x: number[]) => void, v: number) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
	const respIdx = new Set(resp)
	return (
		<div className="panel prompt">
			<h3>
				{head.name} <small className={`asp-${aspect}`}>{aspect}</small> + <small>{APPROACH_ICON[head.approach]}</small>
			</h3>
			{head.target != null && g.inst[head.target] && <p className="sub">Interacting with {nameOf(g, head.target)}.</p>}
			{hurting.length > 0 && (
				<p className={fat ? 'warn' : 'sub'} data-tut="in-way">
					In the way: {hurting.map((u) => `${nameOf(g, u)} (${presence(g, u)})`).join(', ')} → you suffer {fat} fatigue.
				</p>
			)}
			{(opt.dodgeRole != null || opt.greaves || opt.swap) && (
				<div className="checks">
					{opt.dodgeRole != null && hurting.length > 0 && (
						<label className="check">
							<input type="checkbox" checked={dodgeRole} onChange={(e) => setDodgeRole(e.target.checked)} /> Exhaust {nameOf(g, opt.dodgeRole)}: dodge 1 card
						</label>
					)}
					{opt.swap && (
						<label className="check">
							<input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} /> Use {nameOf(g, opt.swap.uid)}: {opt.swap.to} instead of {head.aspect}
						</label>
					)}
					{opt.greaves && hurting.length > 0 && (
						<div className="stepper">
							<span>{nameOf(g, opt.greaves.uid)}: buffers to use</span>
							<button onClick={() => setBuffers(Math.max(0, buffers - 1))}>−</button>
							<b>{buffers}</b>
							<button onClick={() => setBuffers(Math.min(opt.greaves!.max, buffers + 1))}>+</button>
						</div>
					)}
				</div>
			)}
			<div className="stepper" data-tut="energy">
				<span>
					{aspect} energy <small>(have {max})</small>
				</span>
				<button onClick={() => setEnergy(Math.max(1, energy - 1))}>−</button>
				<b>{Math.min(energy, max)}</b>
				<button onClick={() => setEnergy(Math.min(max, energy + 1))}>+</button>
			</div>
			<p className="sub">Discard cards with {APPROACH_ICON[head.approach]} icons for more effort:</p>
			<div className="hand mini" data-tut="commit-hand">
				{R.hand.map((id, i) => {
					if (respIdx.has(i)) return null
					const n = iconsOf(i)
					const canV = opt.versatile.includes(i)
					return (
						<HandCard
							key={i}
							id={id}
							dim={!n && !canV}
							selected={disc.includes(i)}
							note={n ? `+${n}` : canV ? '+1?' : undefined}
							onClick={() => {
								if (canV && !n && !vers.includes(i)) {
									setVers([...vers, i])
									setDisc([...disc, i])
								} else if (n || canV) {
									toggle(disc, setDisc, i)
									if (disc.includes(i)) setVers(vers.filter((x) => x !== i))
								}
							}}
						/>
					)
				})}
			</div>
			{vers.length > 0 && <p className="sub">Versatile: you suffer 1 fatigue for each one you commit this way.</p>}
			{opt.boosts.length > 0 && (
				<div className="checks">
					{opt.boosts.map((b) => (
						<label className="check" key={b.uid}>
							<input type="checkbox" checked={boosts.includes(b.uid)} onChange={() => toggle(boosts, setBoosts, b.uid)} /> {b.label}
						</label>
					))}
				</div>
			)}
			{(opt.extras.length > 0 || opt.mods.length > 0) && (
				<div className="checks">
					{opt.mods.map((m, k) => (
						<p className="sub" key={k}>
							{m.label}: {m.effort > 0 ? '+' : ''}
							{m.effort} effort
						</p>
					))}
					{opt.extras.map((x) => (
						<label className="check" key={x.key}>
							<input type="checkbox" checked={xs.includes(x.key)} onChange={() => setXs(xs.includes(x.key) ? xs.filter((k) => k !== x.key) : [...xs, x.key])} /> {x.label}
						</label>
					))}
				</div>
			)}
			{opt.responses.length > 0 && (
				<div className="checks">
					{opt.responses.map((rs) => (
						<label className="check" key={rs.hand}>
							<input type="checkbox" checked={resp.includes(rs.hand)} onChange={() => toggle(resp, setResp, rs.hand)} disabled={R.energy[rs.aspect] < rs.cost} /> Play {rs.label}{' '}
							<small>
								({rs.cost} {rs.aspect})
							</small>
						</label>
					))}
				</div>
			)}
			<details>
				<summary>More (other effort, difficulty)</summary>
				<div className="stepper">
					<span>Other effort</span>
					<button onClick={() => setExtra(extra - 1)}>−</button>
					<b>{extra}</b>
					<button onClick={() => setExtra(extra + 1)}>+</button>
				</div>
				<div className="stepper">
					<span>Difficulty</span>
					<button onClick={() => setDiff(Math.max(0, diff - 1))}>−</button>
					<b>{diff}</b>
					<button onClick={() => setDiff(diff + 1)}>+</button>
				</div>
			</details>
			<p className="total">
				Effort before the challenge card: <b>{total}</b>
				{tok ? ` (incl. ${tok} from Ranger tokens)` : ''} vs difficulty <b>{diff}</b>
			</p>
			<div className="btns">
				<button
					className="primary commit-btn"
					disabled={max < 1}
					onClick={() =>
						dispatch({ t: 'commit', energy: Math.min(energy, max), discards: disc, extra, diff, dodgeRole, buffers, boosts, swap, responses: resp, versatile: vers, extras: xs })
					}
				>
					Draw a challenge card
				</button>
				<button onClick={() => dispatch({ t: 'cancelTest' })}>Cancel</button>
			</div>
		</div>
	)
}

function PickHand({ g, head, dispatch }: { g: Game; head: Extract<Prompt, { kind: 'pickHand' }>; dispatch: Dispatch }) {
	const R = g.rangers[head.ranger]
	const pile = head.from === 'hand' ? R.hand : R.discard
	const [sel, setSel] = useState<number | null>(head.options.length === 1 ? head.options[0] : null)
	return (
		<div className="panel prompt">
			<h3>{head.title}</h3>
			<p>{head.text}</p>
			<div className="hand mini">
				{head.options.map((k) => (
					<HandCard key={k} id={pile[k]} selected={sel === k} onClick={() => setSel(k)} />
				))}
			</div>
			<div className="btns">
				<button className="primary" disabled={sel == null} onClick={() => dispatch({ t: 'pickHand', index: sel })}>
					{sel != null ? `Choose ${card(pile[sel]).name}` : 'Choose a card'}
				</button>
				{head.optional && <button onClick={() => dispatch({ t: 'pickHand', index: null })}>Skip</button>}
			</div>
		</div>
	)
}

function Choose({ g, head, dispatch }: { g: Game; head: Extract<Prompt, { kind: 'choose' }>; dispatch: Dispatch }) {
	const [sel, setSel] = useState<number[]>([])
	return (
		<div className="panel prompt">
			<h3>{head.title}</h3>
			<p>{head.text}</p>
			<p className="sub">{head.max === 1 ? 'Tap a glowing card on the table, or pick it here.' : `Pick ${head.max}.`}</p>
			<ul className="options">
				{head.options.map((u) => (
					<li key={u}>
						<button
							className={sel.includes(u) ? 'on' : ''}
							onClick={() => {
								if (head.max === 1) dispatch({ t: 'choose', uids: [u] })
								else setSel((x) => (x.includes(u) ? x.filter((y) => y !== u) : x.length < head.max ? [...x, u] : x))
							}}
						>
							<img src={cardImg(g.inst[u].id, g.inst[u].side)} alt="" />
							{nameOf(g, u)}
						</button>
					</li>
				))}
			</ul>
			{head.max > 1 && (
				<button className="primary" disabled={sel.length < head.min} onClick={() => dispatch({ t: 'choose', uids: sel })}>
					Done
				</button>
			)}
		</div>
	)
}

function Ask({ head, dispatch }: { head: Extract<Prompt, { kind: 'ask' }>; dispatch: Dispatch }) {
	return (
		<div className="panel prompt">
			<h3>{head.title}</h3>
			{head.yes ? (
				<p>{head.text}</p>
			) : (
				<p>
					Is this true right now? <b>“{head.text}”</b>
				</p>
			)}
			<div className="btns">
				<button className="primary" onClick={() => dispatch({ t: 'answer', yes: true })}>
					{head.yes ?? 'Yes'}
				</button>
				<button onClick={() => dispatch({ t: 'answer', yes: false })}>{head.no ?? 'No'}</button>
			</div>
		</div>
	)
}

function Manual({ head, dispatch }: { head: Extract<Prompt, { kind: 'manual' }>; dispatch: Dispatch }) {
	return (
		<div className="panel prompt">
			<h3>{head.title}</h3>
			<p>
				Do this by hand (tap cards for their tools): <b>{head.text}</b>
			</p>
			<button className="primary" onClick={() => dispatch({ t: 'manualDone' })}>
				Done
			</button>
		</div>
	)
}

export function LastTest({ g, keep = false }: { g: Game; keep?: boolean }) {
	const t = g.lastTest
	// the result shows for a few seconds after each test, then gets out of the way (tap it to hide it sooner)
	const stamp = t ? `${t.name}|${t.ranger}|${t.challenge}|${t.effort}|${g.round}|${g.challengeDiscard.length}|${g.challenge.length}` : ''
	const [hidden, setHidden] = useState<string | null>(null)
	const [seenAt, setSeenAt] = useState<string>('')
	useEffect(() => {
		if (!stamp || stamp === seenAt) return
		setSeenAt(stamp)
		setHidden(null)
	}, [stamp, seenAt])
	useEffect(() => {
		if (!stamp || keep) return
		const tm = window.setTimeout(() => setHidden(stamp), 4500)
		return () => window.clearTimeout(tm)
	}, [stamp, keep])
	if (!t || (hidden === stamp && !keep)) return null
	const ch = CHALLENGE[t.challenge]
	return (
		<div className={`last-test ${t.success ? 'ok' : 'bad'} ${keep ? '' : 'fading'}`} onClick={() => setHidden(stamp)} title="Tap to hide">
			<img src={imgUrl(`${ch.id}.jpg`)} alt="Challenge card" />
			<div>
				<b>
					{t.name}: {t.success ? 'success' : 'failed'}
				</b>
				<span>
					Effort {t.base} {t.mod >= 0 ? '+' : '−'} {Math.abs(t.mod)} = {t.effort} vs {t.diff} · {SYM_LABEL[t.symbol]}
				</span>
			</div>
		</div>
	)
}

function Guide({ entry, why, pack, dispatch, hooks }: { entry: string; why: string; pack?: string; dispatch: Dispatch; hooks: CampaignHooks }) {
	const [note, setNote] = useState('')
	const [open, setOpen] = useState(false)
	return (
		<div className="panel prompt guide">
			<h3>📖 Campaign guide entry {entry}</h3>
			<p>
				{why}: read entry <b>{entry}</b> of the campaign guide and follow it. Use the menu (☰) to add missions, rewards or notable events, and the card tools for anything else it
				tells you to do.
			</p>
			<button className="primary" onClick={() => setOpen(true)}>
				📖 Open entry {entry}
			</button>
			{open && <GuideWindow entry={entry} pack={GUIDE_PACK[pack ?? 'Core'] ?? 'ebr'} onClose={() => setOpen(false)} rewards={hooks.rewards} onUnlock={hooks.unlockReward} />}
			<div className="row-input">
				<input placeholder="Notable event to record (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
				<button
					disabled={!note.trim()}
					onClick={() => {
						hooks.addEvent(note.trim())
						setNote('')
					}}
				>
					Record
				</button>
			</div>
			<button onClick={() => dispatch({ t: 'guideRead' })}>
				Done reading
			</button>
		</div>
	)
}

function Scout({ g, head, dispatch }: { g: Game; head: Extract<Prompt, { kind: 'scout' }>; dispatch: Dispatch }) {
	const [order, setOrder] = useState(head.cards.map((id, i) => ({ id, i, bottom: false })))
	const move = (k: number, d: number) => {
		const o = order.slice()
		const j = k + d
		if (j < 0 || j >= o.length) return
		;[o[k], o[j]] = [o[j], o[k]]
		setOrder(o)
	}
	return (
		<div className="panel prompt">
			<h3>
				Scout {head.cards.length} {head.deck === 'path' ? 'path' : 'Ranger'} card{head.cards.length === 1 ? '' : 's'}
			</h3>
			<p className="sub">Put each card on the top or bottom of the {head.deck === 'path' ? 'path deck' : `${g.rangers[head.ranger].name}'s deck`}, in any order. The first card listed ends up on top.</p>
			<ul className="scout">
				{order.map((c, k) => (
					<li key={c.i}>
						<HandCard id={c.id} />
						<div>
							<b>{card(c.id).name}</b>
							<div className="btns">
								<button onClick={() => move(k, -1)}>↑</button>
								<button onClick={() => move(k, 1)}>↓</button>
								<button className={c.bottom ? 'on' : ''} onClick={() => setOrder(order.map((x, j) => (j === k ? { ...x, bottom: !x.bottom } : x)))}>
									{c.bottom ? 'Bottom' : 'Top'}
								</button>
							</div>
						</div>
					</li>
				))}
			</ul>
			<button className="primary" onClick={() => dispatch({ t: 'scouted', top: order.filter((x) => !x.bottom).map((x) => x.id), bottom: order.filter((x) => x.bottom).map((x) => x.id) })}>
				Done{head.drawAfter ? ' and draw' : ''}
			</button>
		</div>
	)
}

function Travel({ g, dispatch }: { g: Game; dispatch: Dispatch }) {
	const why = canTravel(g)
	const here = card(g.inst[g.location].id)
	return (
		<div className="panel prompt">
			<h3>Travel?</h3>
			{why ? <p className="warn">{why}</p> : <p>You've made enough progress at {here.name} to travel. Choose a nearby location, or stay.</p>}
			{!why && (
				<ul className="links">
					{(here.links ?? []).map((l) => (
						<li key={l.to}>
							<span>
								<b>{card(l.to).name}</b> <small>by {TERRAINS[l.path] ?? l.path}</small>
								{card(l.to).pivotal && <small className="pivotal"> ✦ pivotal</small>}
							</span>
							<span className="btns">
								<button className="go-btn" disabled={l.path === 'river'} title={l.path === 'river' ? 'You cannot travel along river paths until a card lets you.' : ''} onClick={() => dispatch({ t: 'travel', to: l.to, camp: false })}>
									Travel
								</button>
								<button disabled={l.path === 'river'} onClick={() => dispatch({ t: 'travel', to: l.to, camp: true })}>
									Travel &amp; camp
								</button>
							</span>
						</li>
					))}
				</ul>
			)}
			<button className="primary stay-btn" onClick={() => dispatch({ t: 'stay' })}>
				Stay here
			</button>
			<details>
				<summary>Map of the Valley</summary>
				<MapView g={g} />
			</details>
		</div>
	)
}

export function MapView({ g }: { g?: Game }) {
	return (
		<div className="map">
			{g && <p>You are at {nameOf(g, g.location)}.</p>}
			<img src={imgUrl('01432A.jpg')} alt="Valley map, north" loading="lazy" />
			<img src={imgUrl('01433A.jpg')} alt="Valley map, south" loading="lazy" />
		</div>
	)
}

// ------------------------------------------------------------------ card viewer

function Viewer({
	g,
	sel,
	me,
	manual,
	dispatch,
	setPick,
	close,
	useRole,
	turnOk,
}: {
	g: Game
	sel: NonNullable<Sel>
	me: number
	manual: boolean
	dispatch: Dispatch
	setPick: (p: Pick) => void
	close: () => void
	useRole: boolean
	turnOk: boolean
}) {
	if (sel.kind === 'hand') {
		const R = g.rangers[sel.ranger]
		const id = R.hand[sel.index]
		if (!id) return null
		const c = card(id)
		const cost = costOf(id)
		const canPlay = c.type !== 'Attribute'
		const play = (x?: number) => {
			if (c.type === 'Attachment' && !/^Search the path deck and discard for/i.test((c.text ?? '').replace(/<[^>]+>/g, ''))) {
				setPick({ why: `Attach ${c.name}: tap the card to attach it to`, ok: (uid) => !!g.inst[uid], done: (uid) => dispatch({ t: 'play', ranger: sel.ranger, hand: sel.index, target: uid, x, useRole }) })
				close()
				return
			}
			dispatch({ t: 'play', ranger: sel.ranger, hand: sel.index, x, useRole })
		}
		return (
			<div className="panel viewer">
				<button className="close" onClick={close}>×</button>
				<img className="big" src={cardImg(id)} alt={c.name} />
				<h3>{c.name}</h3>
				<p className="sub">
					{c.type}
					{c.traits ? ` · ${c.traits}` : ''} · {c.set}
				</p>
				<RulesText text={c.text} />
				<div className="btns">
					{canPlay && (
						<button className="primary" disabled={!turnOk && !/Response:/.test(c.text || '')} onClick={() => (cost === 'X' ? play(Number(prompt('Pay how much (X)?', '1') || '0')) : play())}>
							Play ({cost} {c.aspect})
						</button>
					)}
					{manual && <button onClick={() => dispatch({ t: 'manual', op: { op: 'discardHand', ranger: sel.ranger, index: sel.index } })}>Discard</button>}
				</div>
				{!canPlay && <p className="sub">Attributes are only committed to tests for their approach icons.</p>}
			</div>
		)
	}
	const inst = g.inst[sel.uid]
	if (!inst) return null
	const c = card(inst.id)
	const side = inst.side === 'B' && c.B ? c.B : null
	const text = side ? side.text : c.text
	const p = P(g, inst.uid)
	const tests = availableTests(g, me).filter((t) => t.src === inst.uid)
	const commons = baseTests(g, me).filter((t) => t.targets && commonTargetOk(g, t.key, inst.uid))
	const R = g.rangers[me]
	const op = (o: ManualOp) => dispatch({ t: 'manual', op: o })
	const keep = (o: ManualOp) => {
		dispatch({ t: 'manual', op: o })
	}
	const fat = between(g, me, inst.uid).filter((u) => !has(g, u, 'Friendly')).reduce((s, u) => s + presence(g, u), 0)
	const abilities = p.abilities.map((a, i) => ({ l: a.text, i, kind: a.kind })).filter((a) => a.kind === 'exhaust' && !(p.abilities[a.i].timing && !/^Before your first turn/i.test(p.abilities[a.i].timing!)) && !/^Exhaust[^:]*: When (?:a Ranger|you) performs?/i.test(a.l))
	return (
		<div className="panel viewer">
			<button className="close" onClick={close}>×</button>
			<img className={`big ${c.type === 'Location' ? 'land' : ''}`} src={cardImg(inst.id, inst.side)} alt={nameOf(g, inst.uid)} />
			<h3>{nameOf(g, inst.uid)}</h3>
			<p className="sub">
				{typeOf(g, inst.uid)}
				{c.traits ? ` · ${side?.traits ?? c.traits}` : ''} · presence {presence(g, inst.uid)}
				{inst.exhausted ? ' · exhausted' : ''}
			</p>
			<RulesText text={text} />
			{fat > 0 && g.phase === 'turns' && <p className="warn">Interacting with this fatigues {R.name} by {fat} (cards in the way).</p>}
			{(tests.length > 0 || commons.length > 0) && g.phase === 'turns' && (
				<div className="btns">
					{tests.map((t) => (
						<button key={String(t.test)} className="primary" disabled={!turnOk || R.energy[t.aspect] < 1} onClick={() => dispatch({ t: 'test', ranger: me, src: inst.uid, test: t.test, useRole })}>
							{t.name} <small className={`asp-${t.aspect}`}>{t.aspect}</small> [{t.diff === 'X' ? `X=${Math.max(1, presence(g, inst.uid))}` : t.diff}]
						</button>
					))}
					{commons.map((t) => (
						<button key={t.key} disabled={!turnOk || R.energy[t.aspect] < 1} onClick={() => dispatch({ t: 'test', ranger: me, src: null, test: t.key, target: inst.uid, useRole })}>
							{t.name} <small className={`asp-${t.aspect}`}>{t.aspect}</small>
						</button>
					))}
				</div>
			)}
			{abilities.length > 0 && (
				<div className="btns">
					{abilities.map(({ l, i }) => (
						<button key={i} onClick={() => dispatch({ t: 'ability', ranger: me, uid: inst.uid, line: i })}>
							Use: {l.slice(0, 48)}{l.length > 48 ? '…' : ''}
						</button>
					))}
				</div>
			)}
			<details open={manual}>
				<summary>Card tools</summary>
				<div className="tools">
					<span>
						Progress <button onClick={() => keep({ op: 'tokens', uid: inst.uid, what: 'progress', delta: -1 })}>−</button>
						<b>{inst.progress}</b>
						<button onClick={() => keep({ op: 'tokens', uid: inst.uid, what: 'progress', delta: 1 })}>+</button>
					</span>
					<span>
						Harm <button onClick={() => keep({ op: 'tokens', uid: inst.uid, what: 'harm', delta: -1 })}>−</button>
						<b>{inst.harm}</b>
						<button onClick={() => keep({ op: 'tokens', uid: inst.uid, what: 'harm', delta: 1 })}>+</button>
					</span>
					<span>
						{c.tokens?.name ?? 'Tokens'} <button onClick={() => keep({ op: 'tokens', uid: inst.uid, what: 'tokens', delta: -1 })}>−</button>
						<b>{inst.tokens}</b>
						<button onClick={() => keep({ op: 'tokens', uid: inst.uid, what: 'tokens', delta: 1 })}>+</button>
					</span>
				</div>
				<div className="btns">
					<button onClick={() => keep({ op: 'exhaust', uid: inst.uid })}>{inst.exhausted ? 'Ready' : 'Exhaust'}</button>
					{c.B && <button onClick={() => keep({ op: 'flip', uid: inst.uid })}>Flip</button>}
					{(inst.kind === 'path' || inst.kind === 'ranger') && (
						<>
							<button onClick={() => op({ op: 'move', uid: inst.uid, zone: 'along' })}>Move along the way</button>
							{g.rangers.map((r, k) => (
								<button key={k} onClick={() => op({ op: 'move', uid: inst.uid, zone: 'reach', owner: k })}>
									Within reach of {r.name}
								</button>
							))}
							<button
								onClick={() => {
									setPick({ why: `Attach ${nameOf(g, inst.uid)}: tap the card`, ok: (u) => u !== inst.uid, done: (u) => dispatch({ t: 'manual', op: { op: 'attach', uid: inst.uid, to: u } }) })
									close()
								}}
							>
								Attach to…
							</button>
							<button onClick={() => op({ op: 'discard', uid: inst.uid })}>Discard</button>
						</>
					)}
					{inst.kind === 'path' && <button onClick={() => op({ op: 'shuffleIn', uid: inst.uid })}>Shuffle into path deck</button>}
					{inst.kind === 'ranger' && <button onClick={() => op({ op: 'toHand', uid: inst.uid })}>Return to hand</button>}
					{inst.kind === 'mission' && <button onClick={() => op({ op: 'removeMission', uid: inst.uid })}>Mission complete</button>}
					<button onClick={() => keep({ op: 'rangerToken', ranger: me, to: R.token === inst.uid ? null : inst.uid })}>
						{R.token === inst.uid ? `Remove ${R.name}'s Ranger token` : `Put ${R.name}'s Ranger token here`}
					</button>
				</div>
			</details>
		</div>
	)
}

// ------------------------------------------------------------------ menu, search

function Menu({
	coachOn,
	setCoachOn,
	g,
	me,
	manual,
	setManual,
	dispatch,
	close,
	openSearch,
	openMap,
	onExit,
	hooks,
}: {
	coachOn: boolean
	setCoachOn: (b: boolean) => void
	g: Game
	me: number
	manual: boolean
	setManual: (b: boolean) => void
	dispatch: Dispatch
	close: () => void
	openSearch: () => void
	openMap: () => void
	onExit: () => void
	hooks: CampaignHooks
}) {
	const R = g.rangers[me]
	const [n, setN] = useState(1)
	const [ev, setEv] = useState('')
	const [mission, setMission] = useState('')
	const [reward, setReward] = useState('')
	const op = (o: ManualOp) => dispatch({ t: 'manual', op: o })
	const rewards = useMemo(() => Object.values(CARDS).filter((c) => c.back === 'player' && /^Rewards?$/.test(c.set) && c.pack === 'Core'), [])
	return (
		<div className="drawer" onClick={close}>
			<div className="drawer-body" onClick={(e) => e.stopPropagation()}>
				<h3>Menu</h3>
				<div className="btns">
					<button onClick={openMap}>Map</button>
					<button onClick={openSearch}>Search for a card…</button>
					<button onClick={onExit}>Save &amp; back to campaign</button>
				</div>
				<label className="check">
					<input type="checkbox" checked={coachOn} onChange={(e) => setCoachOn(e.target.checked)} /> Coach (explains each step, makes a good move glow)
				</label>
				<label className="check">
					<input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Show card tools open (manual fixes)
				</label>
				<h4>
					{R.name} <small>(tap a Ranger's area to switch)</small>
				</h4>
				<div className="stepper">
					<span>Amount</span>
					<button onClick={() => setN(Math.max(1, n - 1))}>−</button>
					<b>{n}</b>
					<button onClick={() => setN(n + 1)}>+</button>
				</div>
				<div className="btns">
					<button onClick={() => op({ op: 'fatigue', ranger: me, n })}>Suffer {n} fatigue</button>
					<button onClick={() => op({ op: 'soothe', ranger: me, n })}>Soothe {n}</button>
					<button onClick={() => op({ op: 'injure', ranger: me, n: 1 })}>Suffer injury</button>
					<button onClick={() => op({ op: 'heal', ranger: me, n: 1 })}>Heal injury</button>
					<button onClick={() => op({ op: 'drawRanger', ranger: me, n })}>Draw {n} Ranger</button>
					<button onClick={() => op({ op: 'drawPath', ranger: me, n })}>Draw {n} path</button>
					<button onClick={() => op({ op: 'scoutPath', ranger: me, n })}>Scout {n} path</button>
					<button onClick={() => op({ op: 'scoutRanger', ranger: me, n })}>Scout {n} Ranger</button>
				</div>
				<div className="btns">
					{ASPECTS.map((a) => (
						<span key={a} className="tools">
							{a} <button onClick={() => op({ op: 'energy', ranger: me, aspect: a, delta: -1 })}>−</button>
							<b>{R.energy[a]}</b>
							<button onClick={() => op({ op: 'energy', ranger: me, aspect: a, delta: 1 })}>+</button>
						</span>
					))}
				</div>
				<h4>Campaign</h4>
				<div className="row-input">
					<select value={mission} onChange={(e) => setMission(e.target.value)}>
						<option value="">Add a mission…</option>
						{MISSIONS_CORE(g.packs ?? ['Core']).map((m) => (
							<option key={m.id} value={m.id}>
								{m.name}
							</option>
						))}
					</select>
					<button
						disabled={!mission}
						onClick={() => {
							hooks.addMission(mission)
							setMission('')
						}}
					>
						Add
					</button>
				</div>
				<div className="row-input">
					<select value={reward} onChange={(e) => setReward(e.target.value)}>
						<option value="">Unlock a reward…</option>
						{rewards
							.filter((c) => !hooks.rewards.includes(c.id))
							.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
					</select>
					<button
						disabled={!reward}
						onClick={() => {
							hooks.unlockReward(reward)
							setReward('')
						}}
					>
						Unlock
					</button>
				</div>
				<div className="row-input">
					<input placeholder="Notable event" value={ev} onChange={(e) => setEv(e.target.value)} />
					<button
						disabled={!ev.trim()}
						onClick={() => {
							hooks.addEvent(ev.trim())
							setEv('')
						}}
					>
						Record
					</button>
				</div>
				<h4>End the day</h4>
				<div className="btns">
					<button
						onClick={() => {
							if (confirm('End the day now? (A campaign guide entry, an ally in peril, or a completed mission can end the day.)')) dispatch({ t: 'endDay', reason: 'The campaign guide ended the day.' })
						}}
					>
						End the day now
					</button>
				</div>
			</div>
		</div>
	)
}

function Search({ g, me, dispatch, close }: { g: Game; me: number; dispatch: Dispatch; close: () => void }) {
	const [from, setFrom] = useState<'pathDeck' | 'pathDiscard' | 'collection' | 'rangerDeck' | 'rangerDiscard'>('pathDeck')
	const [set, setSet] = useState('Core:The Valley')
	const [place, setPlace] = useState<'play' | 'hand' | 'shuffle' | 'discard' | 'top' | 'along' | 'reach'>('play')
	const [q, setQ] = useState('')
	const R = g.rangers[me]
	const pool: string[] =
		from === 'pathDeck' ? g.pathDeck : from === 'pathDiscard' ? g.pathDiscard : from === 'rangerDeck' ? R.deck : from === 'rangerDiscard' ? R.discard : (SETS[set] ?? [])
	const ids = [...new Set(pool)].filter((id) => !q || (card(id).name + ' ' + (card(id).traits ?? '')).toLowerCase().includes(q.toLowerCase()))
	const sets = Object.keys(SETS).filter((k) => k.startsWith('Core:'))
	return (
		<div className="drawer" onClick={close}>
			<div className="drawer-body" onClick={(e) => e.stopPropagation()}>
				<h3>Search for a card</h3>
				<label className="field">
					Look in
					<select value={from} onChange={(e) => setFrom(e.target.value as typeof from)}>
						<option value="pathDeck">Path deck ({g.pathDeck.length})</option>
						<option value="pathDiscard">Path discard ({g.pathDiscard.length})</option>
						<option value="collection">A set in the collection</option>
						<option value="rangerDeck">{R.name}'s deck</option>
						<option value="rangerDiscard">{R.name}'s discard</option>
					</select>
				</label>
				{from === 'collection' && (
					<label className="field">
						Set
						<select value={set} onChange={(e) => setSet(e.target.value)}>
							{sets.map((s) => (
								<option key={s} value={s}>
									{s.slice(5)}
								</option>
							))}
						</select>
					</label>
				)}
				<label className="field">
					Then
					<select value={place} onChange={(e) => setPlace(e.target.value as typeof place)}>
						<option value="play">Put it into play (its usual area)</option>
						<option value="along">Put it along the way</option>
						<option value="reach">Put it within reach</option>
						<option value="hand">Add it to {R.name}'s hand</option>
						<option value="shuffle">Shuffle it into the path deck</option>
						<option value="top">Put it on top of the path deck</option>
						<option value="discard">Discard it</option>
					</select>
				</label>
				<input placeholder="Filter by name or trait (e.g. predator, human)" value={q} onChange={(e) => setQ(e.target.value)} />
				<ul className="search">
					{ids.map((id) => (
						<li key={id}>
							<img src={cardImg(id)} alt="" loading="lazy" />
							<span>
								<b>{card(id).name}</b>
								<small>{card(id).traits}</small>
							</span>
							<button
								onClick={() => {
									const e = dispatch({ t: 'manual', op: { op: 'search', from, id, ranger: me, place } })
									if (!e) close()
								}}
							>
								Choose
							</button>
						</li>
					))}
					{!ids.length && <li className="empty">No matching cards.</li>}
				</ul>
			</div>
		</div>
	)
}
