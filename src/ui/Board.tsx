import { useEffect, useMemo, useState } from 'react'
import { ASPECTS, card, CARDS, CHALLENGE, MISSIONS_CORE, SETS, TERRAINS, type Aspect } from '../data/data'
import {
	attachments,
	availableTests,
	between,
	canTakeTurn,
	canTravel,
	commonTargetOk,
	costOf,
	equipUsed,
	has,
	nameOf,
	P,
	presence,
	SYM_LABEL,
	tokenEffort,
	typeOf,
	zoneCards,
} from '../engine/engine'
import { amountValue, COMMON_TESTS, type Action } from '../engine/text'
import type { Game, Intent, ManualOp, Prompt, ResolveItem } from '../engine/types'
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
}: {
	g: Game
	dispatch: Dispatch
	undo: () => void
	canUndo: boolean
	onExit: () => void
	onDayOver: () => void
	hooks: CampaignHooks
}) {
	const [sel, setSel] = useState<Sel>(null)
	const [pick, setPick] = useState<Pick>(null)
	const [me, setMe] = useState(0)
	const [manual, setManual] = useState(() => localStorage.getItem('earthborne.manual') === '1')
	const [panel, setPanel] = useState<'none' | 'log' | 'menu' | 'search' | 'map'>('none')
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
				setPanel('none')
			}
		}
		window.addEventListener('keydown', k)
		return () => window.removeEventListener('keydown', k)
	}, [])

	const tap = (uid: number) => {
		if (pick) {
			if (pick.ok(uid)) {
				pick.done(uid)
				setPick(null)
			}
			return
		}
		setSel({ kind: 'inst', uid })
	}
	const tile = (uid: number, small = false) => {
		const inst = g.inst[uid]
		if (!inst) return null
		const att = attachments(g, uid)
		return (
			<div className="stack" key={uid}>
				<CardTile g={g} inst={inst} small={small} onClick={() => tap(uid)} selected={sel?.kind === 'inst' && sel.uid === uid} pickable={!!pick && pick.ok(uid)} />
				{att.map((a) => (
					<div className="attached" key={a.uid}>
						<CardTile g={g} inst={a} small onClick={() => tap(a.uid)} pickable={!!pick && pick.ok(a.uid)} />
					</div>
				))}
			</div>
		)
	}

	const R = g.rangers[me]
	const turnWhy = canTakeTurn(g, me)
	const myTurnOk = turnWhy == null || turnWhy === 'role'
	const useRole = turnWhy === 'role'

	const startCommon = (key: string) => {
		const t = COMMON_TESTS.find((x) => x.key === key)!
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

	const surroundings = [...g.weather, g.location, ...g.missions].filter((u) => g.inst[u])
	const along = zoneCards(g, 'along').map((i) => i.uid)

	return (
		<div className={`board ${pick ? 'picking' : ''}`}>
			<header className="topbar">
				<button className="ghost" onClick={() => setPanel(panel === 'menu' ? 'none' : 'menu')}>☰</button>
				<div className="title">
					<b>Day {g.day}</b> · Round {g.round} · <span className="phase">{PHASE[g.phase]}</span>
				</div>
				<div className="decks">
					<span title="Path deck / discard">Path {g.pathDeck.length}/{g.pathDiscard.length}</span>
					<span title="Challenge deck">Challenge {g.challenge.length}</span>
					<span title="Terrain">{TERRAINS[g.terrain] ?? g.terrain}</span>
				</div>
				<button className="ghost" onClick={undo} disabled={!canUndo} title="Undo">↶</button>
				<button className="ghost" onClick={() => setPanel(panel === 'log' ? 'none' : 'log')}>Log</button>
			</header>

			{pick && (
				<div className="pickbar">
					{pick.why} <button onClick={() => setPick(null)}>Cancel</button>
				</div>
			)}

			<main className="table">
				<section className="zone surroundings">
					<h3>The surroundings</h3>
					<div className="row">{surroundings.map((u) => tile(u))}</div>
				</section>
				<section className="zone along">
					<h3>Along the way</h3>
					<div className="row">{along.length ? along.map((u) => tile(u)) : <p className="empty">Nothing along the way.</p>}</div>
				</section>
				<section className="rangers">
					{g.rangers.map((r, k) => (
						<div key={k} className={`ranger-area r${k} ${k === me ? 'me' : ''} ${r.rested ? 'rested' : ''}`} onClick={() => setMe(k)}>
							<div className="ranger-head">
								<span className={`chip r${k}`}>{r.name}</span>
								{k === g.lead && <span className="lead" title="Lead Ranger">lead</span>}
								{r.rested && <span className="lead">rested</span>}
								<span className="energy">
									{ASPECTS.map((a) => (
										<span key={a} className={`en en-${a}`} title={`${ASPECT_NAME[a]} energy (aspect ${r.aspects[a]})`}>
											{r.energy[a]}
											<small>{a}</small>
										</span>
									))}
								</span>
								<span className="counts">
									<span title="Ranger deck">🂠 {r.deck.length}</span>
									<span title="Fatigue stack">😮‍💨 {r.fatigue.length}</span>
									<span title="Discard">♻ {r.discard.length}</span>
									<span title="Injuries" className={r.injuries ? 'hurt' : ''}>✚ {r.injuries}</span>
								</span>
							</div>
							<div className="ranger-body">
								<div className="sub">
									<h4>Within reach</h4>
									<div className="row">{zoneCards(g, 'reach', k).map((i) => tile(i.uid))}</div>
								</div>
								<div className="sub player">
									<h4>
										Player area <small>({equipUsed(g, k)}/5 equip)</small>
									</h4>
									<div className="row">{[r.roleUid, ...zoneCards(g, 'player', k).filter((i) => i.uid !== r.roleUid).map((i) => i.uid)].map((u) => tile(u, true))}</div>
								</div>
							</div>
						</div>
					))}
				</section>
			</main>

			<section className="handbar">
				<div className="hand-head">
					<span className={`chip r${me}`}>{R.name}'s hand</span>
					{g.rangers.length > 1 && (
						<span className="switch">
							{g.rangers.map((r, k) => (
								<button key={k} className={k === me ? 'on' : ''} onClick={() => setMe(k)}>
									{r.name}
								</button>
							))}
						</span>
					)}
					{g.phase === 'turns' && !head && (
						<span className="acts">
							{COMMON_TESTS.map((t) => (
								<button key={t.key} disabled={!myTurnOk || R.energy[t.aspect] < 1} onClick={() => startCommon(t.key)} title={t.effect.text}>
									<b className={`asp-${t.aspect}`}>{t.aspect}</b> {t.name}
								</button>
							))}
							<button disabled={R.rested} onClick={() => dispatch({ t: 'rest', ranger: me })} className="rest">
								Rest
							</button>
						</span>
					)}
					{useRole && !head && <span className="hint">Next turn exhausts {R.name}'s role.</span>}
					{turnWhy && turnWhy !== 'role' && g.phase === 'turns' && !head && <span className="hint">{turnWhy}</span>}
				</div>
				<div className="hand">
					{R.hand.map((id, i) => (
						<HandCard key={i + id} id={id} onClick={() => setSel({ kind: 'hand', ranger: me, index: i })} selected={sel?.kind === 'hand' && sel.ranger === me && sel.index === i} />
					))}
					{!R.hand.length && <p className="empty">No cards in hand.</p>}
				</div>
			</section>

			<aside className="side">
				{head && <PromptPanel g={g} head={head} dispatch={dispatch} setPick={setPick} onDayOver={onDayOver} hooks={hooks} />}
				{sel && (
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
				)}
				{!head && !sel && <Help g={g} me={me} />}
			</aside>

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
				<Menu
					g={g}
					me={me}
					manual={manual}
					setManual={setManual}
					dispatch={dispatch}
					close={() => setPanel('none')}
					openSearch={() => setPanel('search')}
					openMap={() => setPanel('map')}
					onExit={onExit}
					hooks={hooks}
				/>
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

const PHASE: Record<Game['phase'], string> = { setup: 'Setup', path: 'Path cards', turns: 'Ranger turns', travel: 'Travel', refresh: 'Refresh', over: 'Day over' }

// ------------------------------------------------------------------ help

function Help({ g, me }: { g: Game; me: number }) {
	const R = g.rangers[me]
	return (
		<div className="panel help">
			<h3>{g.phase === 'turns' ? `${R.name}'s options` : PHASE[g.phase]}</h3>
			{g.phase === 'turns' && (
				<ul>
					<li>
						<b>Perform a test</b>: use the common test buttons above your hand, or tap a card in play to see its tests.
					</li>
					<li>
						<b>Play a card</b>: tap a card in your hand.
					</li>
					<li>
						<b>Rest</b> when you're done for the round. When every Ranger has rested, you may travel.
					</li>
				</ul>
			)}
			<p className="sub">Tap any card to see it large. Cards between you and what you interact with fatigue you; obstacles block the way.</p>
		</div>
	)
}

// ------------------------------------------------------------------ prompts

function describe(a: Action, effort: number, pres: number, g: Game, it: ResolveItem): string {
	const n = 'amount' in a ? amountValue(a.amount, effort, pres) : 0
	const src = it.src != null && g.inst[it.src] ? nameOf(g, it.src) : 'it'
	switch (a.kind) {
		case 'progress':
		case 'harm':
			return `Add ${n} ${a.kind} to ${a.to === 'location' ? 'the location' : a.to === 'self' ? src : 'a card…'}`
		case 'removeProgress':
		case 'removeHarm':
			return `Remove ${n} ${a.kind === 'removeProgress' ? 'progress' : 'harm'} from ${a.to === 'location' ? 'the location' : src}`
		case 'exhaust':
		case 'ready':
			return `${a.kind === 'exhaust' ? 'Exhaust' : 'Ready'} ${a.to === 'self' ? src : a.to === 'role' ? 'your role' : 'a card…'}`
		case 'discard':
			return `Discard ${a.to === 'self' ? src : 'a card…'}`
		case 'flip':
			return `Flip ${src}`
		case 'move':
			return `Move ${a.to === 'self' ? src : 'a card…'}${a.area ? (a.area === 'reach' ? ' within reach' : ' along the way') : ''}`
		case 'fatigue':
			return `${a.who === 'each' ? 'Each Ranger suffers' : 'Suffer'} ${n} fatigue`
		case 'injury':
			return `${a.who === 'each' ? 'Each Ranger suffers' : 'Suffer'} ${n} injur${n === 1 ? 'y' : 'ies'}`
		case 'soothe':
			return `Soothe ${n} fatigue`
		case 'heal':
			return `Heal ${n} injury`
		case 'drawRanger':
			return `Draw ${n} Ranger card${n === 1 ? '' : 's'}`
		case 'drawPath':
			return `Draw ${n} path card${n === 1 ? '' : 's'}`
		case 'scoutPath':
			return `Scout ${n} path card${n === 1 ? '' : 's'}`
		case 'scoutRanger':
			return `Scout ${n} Ranger card${n === 1 ? '' : 's'}`
		case 'selfFatigues':
			return `${src} fatigues you (${pres})`
		case 'tokens':
			return `${a.add ? 'Add' : 'Remove'} ${n} token${n === 1 ? '' : 's'} ${a.add ? 'to' : 'from'} ${src}`
		case 'rangerToken':
			return a.to === 'self' ? `Move your Ranger token to ${src}` : 'Return your Ranger token to your role'
		case 'guide':
			return `Read campaign guide entry ${a.entry}`
		case 'searchPath':
			return `Search the path deck for the next ${a.what} and ${a.then === 'discard' ? 'discard it' : 'put it into play'}`
		case 'searchSet':
			return `Search the ${a.set} set for ${a.name} and ${a.then === 'shuffle' ? 'shuffle it into the path deck' : 'put it into play'}`
		case 'flipIf':
			return a.max === 0 ? `Flip ${src} if it has no tokens left` : `Flip ${src} if it has ${a.min}+ tokens`
	}
}
const needsPick = (a: Action) => 'to' in a && (a.to === 'choose' || a.to === 'target')

function PromptPanel({ g, head, dispatch, setPick, onDayOver, hooks }: { g: Game; head: Prompt; dispatch: Dispatch; setPick: (p: Pick) => void; onDayOver: () => void; hooks: CampaignHooks }) {
	switch (head.kind) {
		case 'mulligan':
			return <Mulligan g={g} r={head.ranger} dispatch={dispatch} />
		case 'test':
			return <Commit g={g} head={head} dispatch={dispatch} />
		case 'resolve':
			return <Resolve g={g} head={head} dispatch={dispatch} setPick={setPick} />
		case 'guide':
			return <Guide entry={head.entry} why={head.why} dispatch={dispatch} hooks={hooks} />
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
						Record the day in the campaign
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

function Commit({ g, head, dispatch }: { g: Game; head: Extract<Prompt, { kind: 'test' }>; dispatch: Dispatch }) {
	const R = g.rangers[head.ranger]
	const max = R.energy[head.aspect]
	const [energy, setEnergy] = useState(Math.min(max, Math.max(1, head.diff)))
	const [disc, setDisc] = useState<number[]>([])
	const [extra, setExtra] = useState(0)
	const [diff, setDiff] = useState(head.diff)
	const ap = head.approach as 'conflict'
	const icons = disc.reduce((s, i) => s + (card(R.hand[i]).icons?.[ap] ?? 0), 0)
	const tok = tokenEffort(g, head.ranger, head.target)
	const total = energy + icons + tok + extra
	return (
		<div className="panel prompt">
			<h3>
				{head.name} <small className={`asp-${head.aspect}`}>{head.aspect}</small> + <small>{APPROACH_ICON[head.approach]}</small>
			</h3>
			{head.target != null && g.inst[head.target] && <p className="sub">Interacting with {nameOf(g, head.target)}.</p>}
			{head.fatigued > 0 && <p className="warn">You suffered {head.fatigued} fatigue from cards in the way.</p>}
			<div className="stepper">
				<span>
					{head.aspect} energy <small>(have {max})</small>
				</span>
				<button onClick={() => setEnergy(Math.max(1, energy - 1))}>−</button>
				<b>{energy}</b>
				<button onClick={() => setEnergy(Math.min(max, energy + 1))}>+</button>
			</div>
			<p className="sub">Discard cards with {APPROACH_ICON[head.approach]} icons for more effort:</p>
			<div className="hand mini">
				{R.hand.map((id, i) => {
					const n = card(id).icons?.[ap] ?? 0
					return <HandCard key={i} id={id} dim={!n} selected={disc.includes(i)} note={n ? `+${n}` : undefined} onClick={() => n && setDisc((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))} />
				})}
			</div>
			<div className="stepper">
				<span>Other effort (gear, abilities)</span>
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
			<p className="total">
				Effort before the challenge card: <b>{total}</b>
				{tok ? ` (incl. ${tok} from Ranger tokens)` : ''} vs difficulty <b>{diff}</b>
			</p>
			<div className="btns">
				<button className="primary" onClick={() => dispatch({ t: 'commit', energy, discards: disc, extra, diff })}>
					Draw a challenge card
				</button>
				{head.fatigued === 0 && <button onClick={() => dispatch({ t: 'cancelTest' })}>Cancel</button>}
			</div>
		</div>
	)
}

function Resolve({ g, head, dispatch, setPick }: { g: Game; head: Extract<Prompt, { kind: 'resolve' }>; dispatch: Dispatch; setPick: (p: Pick) => void }) {
	const res = head.result
	const ch = res ? CHALLENGE[res.challenge] : null
	return (
		<div className="panel prompt">
			<h3>{head.title}</h3>
			{res && ch && (
				<div className={`result ${res.success ? 'ok' : 'bad'}`}>
					<img className="challenge" src={imgUrl(`${ch.id}.jpg`)} alt="Challenge card" />
					<div>
						<b>{res.success ? 'Success!' : 'Failed.'}</b>
						<p>
							Effort {res.base} {res.mod >= 0 ? '+' : '−'} {Math.abs(res.mod)} = <b>{res.effort}</b> vs {res.diff}
						</p>
						<p>Challenge symbol: {SYM_LABEL[res.symbol]}</p>
					</div>
				</div>
			)}
			{head.items.length === 0 && res && <p className="sub">No card effects to resolve.</p>}
			<ol className="items">
				{head.items.map((it, k) => {
					const pres = it.src != null && g.inst[it.src] ? presence(g, it.src) : 0
					return (
						<li key={k} className={it.auto ? 'auto' : ''}>
							<div className="item-title">
								{it.title}
								{it.auto && <span className="done-tag">done for you</span>}
							</div>
							<RulesText text={it.clause.text} />
							{!it.auto && it.clause.actions.length > 0 && (
								<div className="btns">
									{it.clause.actions.map((a, j) => (
										<button
											key={j}
											className={it.done[j] ? 'done' : ''}
											onClick={() => {
												if (needsPick(a)) {
													setPick({
														why: describe(a, head.effort, pres, g, it).replace('…', ': tap it'),
														ok: (uid) => !!g.inst[uid],
														done: (uid) => dispatch({ t: 'act', item: k, action: j, target: uid }),
													})
												} else dispatch({ t: 'act', item: k, action: j })
											}}
										>
											{it.done[j] ? '✓ ' : ''}
											{describe(a, head.effort, pres, g, it)}
										</button>
									))}
								</div>
							)}
							{!it.auto && !it.clause.complete && <p className="sub">Do what applies — the buttons cover what the game understood; use the card tools for the rest.</p>}
						</li>
					)
				})}
			</ol>
			<button className="primary" onClick={() => dispatch({ t: 'resolved' })}>
				Continue
			</button>
		</div>
	)
}

function Guide({ entry, why, dispatch, hooks }: { entry: string; why: string; dispatch: Dispatch; hooks: CampaignHooks }) {
	const [note, setNote] = useState('')
	return (
		<div className="panel prompt guide">
			<h3>📖 Campaign guide entry {entry}</h3>
			<p>
				{why}: read entry <b>{entry}</b> in the campaign guide (or The Living Valley on earthbornegames.com) and follow it. Use the menu (☰) to add missions, rewards or notable
				events, and the card tools for anything else it tells you to do.
			</p>
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
			<button className="primary" onClick={() => dispatch({ t: 'guideRead' })}>
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
								<button disabled={l.path === 'river'} title={l.path === 'river' ? 'You cannot travel along river paths until a card lets you.' : ''} onClick={() => dispatch({ t: 'travel', to: l.to, camp: false })}>
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
			<button className="primary" onClick={() => dispatch({ t: 'stay' })}>
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
			if (c.type === 'Attachment') {
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
	const commons = COMMON_TESTS.filter((t) => t.targets && commonTargetOk(g, t.key, inst.uid))
	const R = g.rangers[me]
	const op = (o: ManualOp) => dispatch({ t: 'manual', op: o })
	const keep = (o: ManualOp) => {
		dispatch({ t: 'manual', op: o })
	}
	const fat = between(g, me, inst.uid).filter((u) => !has(g, u, 'Friendly')).reduce((s, u) => s + presence(g, u), 0)
	const abilities = p.other.map((l, i) => ({ l, i })).filter(({ l }) => /^(<b>)?\s*(Exhaust|Response)/i.test(l.replace(/<[^>]+>/g, '')))
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
							Use: {l.replace(/<[^>]+>/g, '').slice(0, 40)}…
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
						{MISSIONS_CORE().map((m) => (
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
