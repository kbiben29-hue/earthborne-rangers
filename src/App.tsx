import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteCampaign, finishDay, loadAll, newCampaign, saveCampaign, type Campaign } from './campaign/campaign'
import { migrate, newDay, tryApply } from './engine/engine'
import type { Game, Intent } from './engine/types'
import { Board } from './ui/Board'
import { CampaignView, Home, NewCampaign } from './ui/Screens'

type Screen = { s: 'home' } | { s: 'new' } | { s: 'campaign'; id: string } | { s: 'day'; id: string }

export default function App() {
	const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadAll())
	const [screen, setScreen] = useState<Screen>(() => {
		const id = localStorage.getItem('earthborne.open')
		return id && loadAll().some((c) => c.id === id) ? { s: 'campaign', id } : { s: 'home' }
	})
	const [history, setHistory] = useState<Game[]>([])
	const [toast, setToast] = useState<string | null>(null)
	const toastTimer = useRef<number>(0)

	const current = 'id' in screen ? campaigns.find((c) => c.id === screen.id) : undefined
	if (current?.game) migrate(current.game)
	const update = useCallback((c: Campaign) => {
		saveCampaign(c)
		setCampaigns(loadAll())
	}, [])
	useEffect(() => {
		try {
			localStorage.setItem('earthborne.open', 'id' in screen ? screen.id : '')
		} catch {}
	}, [screen])

	const say = (m: string) => {
		setToast(m)
		clearTimeout(toastTimer.current)
		toastTimer.current = window.setTimeout(() => setToast(null), 3500)
	}

	const dispatch = (it: Intent): string | null => {
		if (!current?.game) return 'No day in progress.'
		const { g, err } = tryApply(current.game, it)
		if (err) {
			say(err)
			return err
		}
		setHistory((h) => [...h.slice(-60), current.game!])
		update({ ...current, game: g })
		return null
	}
	const undo = () => {
		if (!current || !history.length) return
		const prev = history[history.length - 1]
		setHistory(history.slice(0, -1))
		update({ ...current, game: prev })
	}

	const startDay = (c: Campaign) => {
		const g = newDay({
			seed: Math.floor(Math.random() * 2 ** 31),
			day: c.day,
			rangers: c.rangers.map((r) => ({ name: r.name, role: r.role, aspect: r.aspect, deck: r.deck })),
			location: c.location,
			terrain: c.terrain,
			weather: c.weather,
			weatherSide: c.weatherSide,
			missions: c.missions.map((m) => ({ id: m.id, side: m.side })),
			rewards: c.rewards,
			lead: c.lead,
		})
		setHistory([])
		update({ ...c, game: g })
		setScreen({ s: 'day', id: c.id })
	}

	let body: React.ReactNode
	if (screen.s === 'new')
		body = (
			<NewCampaign
				cancel={() => setScreen({ s: 'home' })}
				done={(name, rangers) => {
					const c = newCampaign(name, rangers)
					update(c)
					setScreen({ s: 'campaign', id: c.id })
				}}
			/>
		)
	else if (screen.s === 'campaign' && current)
		body = <CampaignView c={current} update={update} startDay={startDay} resume={() => setScreen({ s: 'day', id: current.id })} back={() => setScreen({ s: 'home' })} />
	else if (screen.s === 'day' && current?.game)
		body = (
			<Board
				g={current.game}
				dispatch={dispatch}
				undo={undo}
				canUndo={history.length > 0}
				onExit={() => setScreen({ s: 'campaign', id: current.id })}
				onDayOver={() => {
					update(finishDay(current, current.game!))
					setHistory([])
					setScreen({ s: 'campaign', id: current.id })
				}}
				hooks={{
					rewards: current.rewards,
					addEvent: (t) => update({ ...current, events: [...current.events, t] }),
					unlockReward: (id) => update({ ...current, rewards: [...new Set([...current.rewards, id])] }),
					addMission: (id) => {
						const { g } = tryApply(current.game!, { t: 'manual', op: { op: 'mission', id } })
						setHistory((h) => [...h.slice(-60), current.game!])
						update({ ...current, game: g, missions: [...current.missions, { id, side: 'A', day: current.day, note: '', boxes: 0 }] })
					},
				}}
			/>
		)
	else
		body = (
			<Home
				campaigns={campaigns}
				open={(c) => setScreen({ s: 'campaign', id: c.id })}
				create={() => setScreen({ s: 'new' })}
				remove={(c) => {
					deleteCampaign(c.id)
					setCampaigns(loadAll())
				}}
			/>
		)
	return (
		<>
			{body}
			{toast && <div className="toast">{toast}</div>}
		</>
	)
}
