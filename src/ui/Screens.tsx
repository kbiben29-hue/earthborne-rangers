import { useMemo, useState } from 'react'
import { ASPECTS, card, coreLocations, MISSIONS_CORE, TERRAINS, type Aspect } from '../data/data'
import {
	aspectCards,
	BACKGROUNDS,
	buildProblems,
	buildToRanger,
	emptyBuild,
	EXPANSION_BACKGROUNDS,
	EXPANSION_SPECIALTIES,
	isExpert,
	meetsAspect,
	PREBUILT_NAMES,
	prebuiltRanger,
	rangerSet,
	rewardCards,
	roles,
	SPECIALTIES,
	WEATHER,
	type Build,
	type Campaign,
	type CampaignRanger,
} from '../campaign/campaign'
import { cardImg, HandCard, RulesText } from './Card'
import { MapView } from './Board'

// ------------------------------------------------------------------ home

export function Home({ campaigns, open, create, remove, tutorial }: { campaigns: Campaign[]; open: (c: Campaign) => void; create: () => void; remove: (c: Campaign) => void; tutorial: (name: string) => void }) {
	const [tname, setTname] = useState('')
	return (
		<div className="screen home">
			<header className="hero">
				<h1>
					Earthborne <span>Rangers</span>
				</h1>
				<p>Walk the Valley: the Lure of the Valley campaign, on your phone, tablet or computer.</p>
			</header>
			<div className="panel learn">
				<h3>New to Earthborne Rangers?</h3>
				<p>Play a coached practice day: one Ranger, starting at Lone Tree Station. The coach explains each step — path cards, tests, fatigue, the challenge deck, travel — and makes a good move glow.</p>
				{campaigns.some((c) => c.tutorial && c.game && !c.game.ended) && (
					<button className="big" onClick={() => open(campaigns.find((c) => c.tutorial)!)}>
						Continue the tutorial
					</button>
				)}
				<div className="row-input">
					<input placeholder="Your Ranger’s name" value={tname} onChange={(e) => setTname(e.target.value)} />
					<button className="primary" onClick={() => tutorial(tname.trim())}>
						Start the tutorial
					</button>
				</div>
			</div>
			<div className="cards-list">
				{campaigns.filter((c) => !c.tutorial).map((c) => (
					<div key={c.id} className="campaign-card">
						<div>
							<b>{c.name}</b>
							<small>
								Day {c.day} · {card(c.location).name} · {c.rangers.map((r) => r.name).join(', ')}
								{c.game && !c.game.ended ? ' · day in progress' : ''}
							</small>
						</div>
						<span className="btns">
							<button className="primary" onClick={() => open(c)}>
								Continue
							</button>
							<button
								onClick={() => {
									if (confirm(`Delete the campaign "${c.name}"? This can't be undone.`)) remove(c)
								}}
							>
								Delete
							</button>
						</span>
					</div>
				))}
			</div>
			<button className="primary big" onClick={create}>
				New campaign
			</button>
			<p className="fine">
				A fan project with no official standing. You need the Earthborne Rangers core box: the game shows you when to read campaign guide entries. Card data and pictures from the
				DragnCards Earthborne plugin and RangersDB. Earthborne Rangers is © Earthborne Games.
			</p>
		</div>
	)
}

// ------------------------------------------------------------------ new campaign

export function NewCampaign({ done, cancel }: { done: (name: string, rangers: CampaignRanger[]) => void; cancel: () => void }) {
	const [name, setName] = useState('Lure of the Valley')
	const [rangers, setRangers] = useState<CampaignRanger[]>([])
	const [building, setBuilding] = useState(false)
	const [pre, setPre] = useState('UndauntedSeeker')
	const [pname, setPname] = useState('')
	if (building)
		return (
			<Builder
				done={(r) => {
					setRangers([...rangers, r])
					setBuilding(false)
				}}
				cancel={() => setBuilding(false)}
			/>
		)
	return (
		<div className="screen">
			<h2>New campaign</h2>
			<label className="field">
				Campaign name
				<input value={name} onChange={(e) => setName(e.target.value)} />
			</label>
			<h3>Rangers ({rangers.length}/4)</h3>
			<ul className="rangers-list">
				{rangers.map((r, k) => (
					<li key={k}>
						<b>{r.name}</b> <small>{card(r.role).name}</small>
						<button onClick={() => setRangers(rangers.filter((_, j) => j !== k))}>Remove</button>
					</li>
				))}
			</ul>
			{rangers.length < 4 && (
				<div className="panel">
					<h4>Add a ready-made Ranger</h4>
					<div className="row-input">
						<select value={pre} onChange={(e) => setPre(e.target.value)}>
							{Object.entries(PREBUILT_NAMES).map(([k, v]) => (
								<option key={k} value={k}>
									{k.replace(/([a-z])([A-Z])/g, '$1 $2')} ({v})
								</option>
							))}
						</select>
						<input placeholder="Name" value={pname} onChange={(e) => setPname(e.target.value)} />
						<button
							onClick={() => {
								setRangers([...rangers, prebuiltRanger(pre, pname.trim() || `Ranger ${rangers.length + 1}`)])
								setPname('')
							}}
						>
							Add
						</button>
					</div>
					<p className="sub">The four starter Rangers suggested in the core box, one per specialty.</p>
					<button onClick={() => setBuilding(true)}>…or build your own Ranger</button>
				</div>
			)}
			<div className="btns">
				<button className="primary" disabled={!rangers.length} onClick={() => done(name.trim() || 'Campaign', rangers)}>
					Start the campaign
				</button>
				<button onClick={cancel}>Back</button>
			</div>
		</div>
	)
}

// ------------------------------------------------------------------ builder

export function Builder({ done, cancel }: { done: (r: CampaignRanger) => void; cancel: () => void }) {
	const [b, setB] = useState<Build>(emptyBuild())
	const [sov, setSov] = useState(false)
	const [look, setLook] = useState<string | null>(null)
	const up = (p: Partial<Build>) => setB({ ...b, ...p })
	const asp = b.aspect ? card(b.aspect).aspects! : null
	const problems = buildProblems(b)
	const bgs = [...BACKGROUNDS, ...(sov ? EXPANSION_BACKGROUNDS : [])]
	const specs = [...SPECIALTIES, ...(sov ? EXPANSION_SPECIALTIES : [])]
	const personality = useMemo(() => rangerSet('Personality', sov), [sov])
	const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < 5 ? [...list, id] : list)
	const pickList = (set: string, chosen: string[], key: 'backgroundCards' | 'specialtyCards') => (
		<div className="pick-grid">
			{rangerSet(set, sov).map((c) => {
				const ok = !asp || meetsAspect(c, asp)
				return (
					<div key={c.id} className="pick">
						<HandCard id={c.id} selected={chosen.includes(c.id)} dim={!ok} note={chosen.includes(c.id) ? '×2' : !ok ? `needs ${c.aspect} ${c.level}` : undefined} onClick={() => ok && up({ [key]: toggle(chosen, c.id) } as Partial<Build>)} />
						<button className="link" onClick={() => setLook(c.id)}>
							read
						</button>
					</div>
				)
			})}
		</div>
	)
	const outsideOptions = [...bgs.filter((s) => s !== b.background), ...specs.filter((s) => s !== b.specialty)].flatMap((s) => rangerSet(s, sov)).filter((c) => !isExpert(c) && (!asp || meetsAspect(c, asp)))
	return (
		<div className="screen builder">
			<h2>Create your Ranger</h2>
			<label className="check">
				<input type="checkbox" checked={sov} onChange={(e) => setSov(e.target.checked)} /> Include Stewards of the Valley cards
			</label>
			<label className="field">
				Name
				<input value={b.name} onChange={(e) => up({ name: e.target.value })} />
			</label>

			<h3>1. Aspects</h3>
			<div className="pick-grid aspects">
				{aspectCards(sov).map((c) => (
					<button key={c.id} className={`aspect-pick ${b.aspect === c.id ? 'selected' : ''}`} onClick={() => up({ aspect: c.id })}>
						{ASPECTS.map((a) => (
							<span key={a} className={`asp-${a}`}>
								{a} {c.aspects![a]}
							</span>
						))}
					</button>
				))}
			</div>

			<h3>2. Personality (one of each aspect, 2 copies each)</h3>
			{(ASPECTS as Aspect[]).map((a) => (
				<div key={a}>
					<h4 className={`asp-${a}`}>{a}</h4>
					<div className="pick-grid">
						{personality
							.filter((c) => c.aspect === a)
							.map((c) => (
								<div key={c.id} className="pick">
									<HandCard id={c.id} selected={b.personality[a] === c.id} onClick={() => up({ personality: { ...b.personality, [a]: c.id } })} />
									<button className="link" onClick={() => setLook(c.id)}>
										read
									</button>
								</div>
							))}
					</div>
				</div>
			))}

			<h3>3. Background (5 cards)</h3>
			<div className="btns">
				{bgs.map((s) => (
					<button key={s} className={b.background === s ? 'on' : ''} onClick={() => up({ background: s, backgroundCards: [], outside: null })}>
						{s}
					</button>
				))}
			</div>
			{b.background && pickList(b.background, b.backgroundCards, 'backgroundCards')}

			<h3>4. Specialty (5 cards) and role</h3>
			<div className="btns">
				{specs.map((s) => (
					<button key={s} className={b.specialty === s ? 'on' : ''} onClick={() => up({ specialty: s, specialtyCards: [], role: null, outside: null })}>
						{s}
					</button>
				))}
			</div>
			{b.specialty && (
				<>
					<div className="pick-grid">
						{roles(b.specialty, sov).map((c) => (
							<div key={c.id} className="pick">
								<HandCard id={c.id} selected={b.role === c.id} note={b.role === c.id ? 'role' : undefined} onClick={() => up({ role: c.id })} />
								<button className="link" onClick={() => setLook(c.id)}>
									read
								</button>
							</div>
						))}
					</div>
					{pickList(b.specialty, b.specialtyCards, 'specialtyCards')}
				</>
			)}

			<h3>5. Outside interest (1 card from another background or specialty, not Expert)</h3>
			<select value={b.outside ?? ''} onChange={(e) => up({ outside: e.target.value || null })}>
				<option value="">Choose…</option>
				{outsideOptions.map((c) => (
					<option key={c.id} value={c.id}>
						{c.name} ({c.set}
						{c.aspect ? `, ${c.aspect} ${c.level}` : ''})
					</option>
				))}
			</select>

			{problems.length > 0 && (
				<ul className="problems">
					{problems.slice(0, 6).map((p) => (
						<li key={p}>{p}</li>
					))}
				</ul>
			)}
			<div className="btns sticky">
				<button className="primary" disabled={problems.length > 0} onClick={() => done(buildToRanger(b))}>
					Add this Ranger
				</button>
				<button onClick={cancel}>Back</button>
			</div>
			{look && (
				<div className="drawer" onClick={() => setLook(null)}>
					<div className="drawer-body" onClick={(e) => e.stopPropagation()}>
						<img className="big" src={cardImg(look)} alt="" />
						<h3>{card(look).name}</h3>
						<RulesText text={card(look).text} />
					</div>
				</div>
			)}
		</div>
	)
}

// ------------------------------------------------------------------ campaign tracker

export function CampaignView({ c, update, startDay, resume, back }: { c: Campaign; update: (c: Campaign) => void; startDay: (c: Campaign) => void; resume: () => void; back: () => void }) {
	const [ev, setEv] = useState('')
	const [mission, setMission] = useState('')
	const [reward, setReward] = useState('')
	const [entry, setEntry] = useState('')
	const [swap, setSwap] = useState<number | null>(null)
	const set = (p: Partial<Campaign>) => update({ ...c, ...p })
	const locs = coreLocations()
	const inProgress = c.game && !c.game.ended
	return (
		<div className="screen campaign">
			<div className="row-between">
				<button onClick={back}>← Campaigns</button>
				<h2>{c.name}</h2>
			</div>
			<div className="tracker">
				<div className="days">
					{Array.from({ length: 30 }, (_, k) => (
						<span key={k} className={`day ${k + 1 < c.day ? 'past' : k + 1 === c.day ? 'now' : ''}`}>
							{k + 1}
						</span>
					))}
				</div>
				{c.day > 30 && <p className="warn">Day 30 has passed: the campaign guide tells you what happens now.</p>}
			</div>

			{inProgress ? (
				<div className="panel">
					<h3>Day {c.day} is in progress</h3>
					<button className="primary big" onClick={resume}>
						Back to the day
					</button>
				</div>
			) : (
				<div className="panel">
					<h3>Set up day {c.day}</h3>
					{c.entries.length > 0 && c.day === 1 && c.history.length === 0 && (
						<p className="guide-note">
							📖 New campaign: read <b>entry 1</b> of the campaign guide first. It tells you where you start and your first mission. Add missions below.
						</p>
					)}
					<p className="sub">Read any campaign guide entries listed above day {c.day} on your campaign tracker.</p>
					<label className="field">
						Current location
						<select value={c.location} onChange={(e) => set({ location: e.target.value })}>
							{locs.map((l) => (
								<option key={l.id} value={l.id}>
									{l.name}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						Terrain you were travelling on
						<select value={c.terrain} onChange={(e) => set({ terrain: e.target.value })}>
							{Object.entries(TERRAINS).map(([k, v]) => (
								<option key={k} value={k}>
									{v}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						Weather (as listed under day {c.day} on your tracker)
						<select value={c.weather} onChange={(e) => set({ weather: e.target.value })}>
							{WEATHER.map((w) => (
								<option key={w.id} value={w.id}>
									{w.label}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						Lead Ranger
						<select value={c.lead} onChange={(e) => set({ lead: Number(e.target.value) })}>
							{c.rangers.map((r, k) => (
								<option key={k} value={k}>
									{r.name}
								</option>
							))}
						</select>
					</label>
					{c.camped && c.rewards.length > 0 && <p className="sub">You camped last night: you can swap reward cards into your decks below.</p>}
					<button className="primary big" onClick={() => startDay(c)}>
						Start day {c.day}
					</button>
				</div>
			)}

			<details className="panel fold">
				<summary>
					<h3>Missions</h3>
				</summary>
				<ul className="missions">
					{c.missions.map((m, k) => (
						<li key={m.id + k}>
							<img src={cardImg(m.id, m.side)} alt="" />
							<div>
								<b>{card(m.id).name}</b> <small>since day {m.day}</small>
								<div className="tools">
									Progress <button onClick={() => set({ missions: c.missions.map((x, j) => (j === k ? { ...x, boxes: Math.max(0, x.boxes - 1) } : x)) })}>−</button>
									<b>{m.boxes}</b>
									<button onClick={() => set({ missions: c.missions.map((x, j) => (j === k ? { ...x, boxes: x.boxes + 1 } : x)) })}>+</button>
								</div>
								<input placeholder="Subject / notes" value={m.note} onChange={(e) => set({ missions: c.missions.map((x, j) => (j === k ? { ...x, note: e.target.value } : x)) })} />
								<div className="btns">
									<button onClick={() => set({ missions: c.missions.map((x, j) => (j === k ? { ...x, side: x.side === 'A' ? 'B' : 'A' } : x)) })}>Flip</button>
									<button onClick={() => set({ missions: c.missions.filter((_, j) => j !== k), events: [...c.events, `Completed: ${card(m.id).name} (day ${c.day})`] })}>Complete</button>
								</div>
							</div>
						</li>
					))}
				</ul>
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
							set({ missions: [...c.missions, { id: mission, side: 'A', day: c.day, note: '', boxes: 0 }] })
							setMission('')
						}}
					>
						Add
					</button>
				</div>
			</details>

			<details className="panel fold">
				<summary>
					<h3>Rewards unlocked</h3>
				</summary>
				<div className="hand mini">
					{c.rewards.map((id) => (
						<HandCard key={id} id={id} />
					))}
				</div>
				<div className="row-input">
					<select value={reward} onChange={(e) => setReward(e.target.value)}>
						<option value="">Unlock a reward…</option>
						{rewardCards()
							.filter((r) => r.pack === 'Core' && !c.rewards.includes(r.id))
							.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
								</option>
							))}
					</select>
					<button
						disabled={!reward}
						onClick={() => {
							set({ rewards: [...c.rewards, reward] })
							setReward('')
						}}
					>
						Unlock
					</button>
				</div>
			</details>

			<details className="panel fold">
				<summary>
					<h3>Rangers</h3>
				</summary>
				{c.rangers.map((r, k) => (
					<div key={k} className="ranger-row">
						<div>
							<b>{r.name}</b> <small>{card(r.role).name}</small> <small>· {r.deck.length} cards</small>
							{r.deck.includes('01240') && <small className="warn"> · Lingering Injury</small>}
						</div>
						<button disabled={!!inProgress} onClick={() => setSwap(swap === k ? null : k)}>
							{swap === k ? 'Close' : c.camped ? 'Deck & rewards' : 'Deck'}
						</button>
						{swap === k && <DeckEditor c={c} r={k} update={update} />}
					</div>
				))}
			</details>

			<details className="panel fold">
				<summary>
					<h3>Notable events</h3>
				</summary>
				<ul className="events">
					{c.events.map((e, k) => (
						<li key={k}>
							{e} <button className="link" onClick={() => set({ events: c.events.filter((_, j) => j !== k) })}>remove</button>
						</li>
					))}
				</ul>
				<div className="row-input">
					<input placeholder="Write the phrase from the guide" value={ev} onChange={(e) => setEv(e.target.value)} />
					<button
						disabled={!ev.trim()}
						onClick={() => {
							set({ events: [...c.events, ev.trim()] })
							setEv('')
						}}
					>
						Record
					</button>
				</div>
			</details>

			<details className="panel fold">
				<summary>
					<h3>Guide entries &amp; history</h3>
				</summary>
				<div className="row-input">
					<input placeholder="Entry you were sent to (to remember where you are)" value={entry} onChange={(e) => setEntry(e.target.value)} />
					<button
						disabled={!entry.trim()}
						onClick={() => {
							set({ entries: [...c.entries, entry.trim()] })
							setEntry('')
						}}
					>
						Note
					</button>
				</div>
				<p className="sub">Entries noted: {c.entries.join(', ') || 'none'}</p>
				<ol className="history">
					{c.history.map((h) => (
						<li key={h.day}>
							Day {h.day}: {h.summary}
						</li>
					))}
				</ol>
				<details>
					<summary>Map of the Valley</summary>
					<MapView />
				</details>
			</details>
		</div>
	)
}

/** Swap rewards in (after camping) or make permanent changes the guide asks for. */
function DeckEditor({ c, r, update }: { c: Campaign; r: number; update: (c: Campaign) => void }) {
	const R = c.rangers[r]
	const asp = card(R.aspect).aspects!
	const [out, setOut] = useState<number | null>(null)
	const counts = new Map<string, number>()
	for (const id of R.deck) counts.set(id, (counts.get(id) ?? 0) + 1)
	const replace = (inId: string) => {
		if (out == null) return
		const deck = R.deck.slice()
		const [removed] = deck.splice(out, 1)
		deck.push(inId)
		const setAside = /^Rewards?$/.test(card(removed).set) ? R.setAside : [...R.setAside, removed]
		const rangers = c.rangers.map((x, k) => (k === r ? { ...x, deck, setAside: setAside.filter((id, i) => !(id === inId && i === setAside.indexOf(inId))) } : x))
		update({ ...c, rangers })
		setOut(null)
	}
	const options = [...new Set([...(c.camped ? c.rewards : []), ...R.setAside])].filter((id) => meetsAspect(card(id), asp) && (counts.get(id) ?? 0) < 2)
	return (
		<div className="deck-editor">
			<p className="sub">
				{c.camped ? 'Tap a card to take out, then a reward (or a card you set aside earlier) to put in. Maladies stay.' : 'You can only swap rewards in after ending the day by camping.'}
			</p>
			<div className="hand mini">
				{R.deck.map((id, i) => (
					<HandCard key={i} id={id} selected={out === i} dim={id === '01240'} onClick={() => id !== '01240' && setOut(out === i ? null : i)} />
				))}
			</div>
			{out != null && (
				<>
					<p>Put in instead of {card(R.deck[out]).name}:</p>
					<div className="hand mini">
						{options.map((id) => (
							<HandCard key={id} id={id} onClick={() => replace(id)} />
						))}
						{!options.length && <p className="empty">No rewards or set-aside cards available{c.camped ? '' : ' (camp first)'}.</p>}
					</div>
				</>
			)}
		</div>
	)
}
