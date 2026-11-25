// The campaign guide window. No guide text is kept in this repo: the entry is fetched when you open it
// from earthborne.build's copy of the campaign guides (github.com/harababurel/earthborne.build), which
// mirrors The Living Valley (thelivingvalley.earthbornegames.com).
import { useEffect, useRef, useState } from 'react'
import { CARDS } from '../data/data'

const RAW = 'https://raw.githubusercontent.com/harababurel/earthborne.build/main/frontend/src/assets/'
const SITE = 'https://earthborne.build/rules?tab=campaign-guides'

type Index = Record<string, Record<string, string>>
let indexP: Promise<Index> | null = null
let docP: Promise<Document> | null = null
const loadIndex = () =>
	(indexP ??= fetch(RAW + 'campaign-guide-entry-index.json')
		.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`index ${r.status}`))))
		.then((j) => j.entries as Index)
		.catch((e) => {
			indexP = null
			throw e
		}))
const loadDoc = () =>
	(docP ??= fetch(RAW + 'campaign-guides.html')
		.then((r) => (r.ok ? r.text() : Promise.reject(new Error(`guide ${r.status}`))))
		.then((t) => new DOMParser().parseFromString(t, 'text/html'))
		.catch((e) => {
			docP = null
			throw e
		}))

/** Pack codes in the guide index: ebr = Lure of the Valley. */
export type GuidePack = 'ebr' | 'loa' | 'sib' | 'sos'
export const GUIDE_PACK: Record<string, GuidePack> = { Core: 'ebr', LoA: 'loa', SiB: 'sib', SoS: 'sos' }

async function anchorFor(entry: string, pack: GuidePack): Promise<string | null> {
	const idx = await loadIndex()
	const ids = idx[entry] ?? idx[entry.replace(/[A-Za-z]+$/, '')]
	if (!ids) return null
	return ids[pack] ?? ids.ebr ?? Object.values(ids)[0] ?? null
}
export const guideLink = (anchor: string | null) => (anchor ? `${SITE}#${anchor}` : SITE)

/** Only keep harmless markup from the fetched page. */
function sanitize(el: Element) {
	el.querySelectorAll('script, style, iframe, object, embed, form, input, button').forEach((x) => x.remove())
	el.querySelectorAll('*').forEach((x) => {
		for (const a of [...x.attributes]) {
			if (/^on/i.test(a.name)) x.removeAttribute(a.name)
			if ((a.name === 'href' || a.name === 'src') && /^\s*javascript:/i.test(a.value)) x.removeAttribute(a.name)
		}
	})
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, '')
/** Reward cards an entry tells you to gain: "Gain the Harvest Crown reward card." / "Gain the following reward cards: A, B and C." */
export function rewardsIn(text: string): string[] {
	const names: string[] = []
	for (const m of text.matchAll(/gain the ([^.]+?) reward cards?\b/gi)) names.push(m[1])
	for (const m of text.matchAll(/gain the following reward cards?:\s*([^.]+)\./gi)) names.push(...m[1].split(/,\s*(?:and\s+)?|\s+and\s+/))
	const rewards = Object.values(CARDS).filter((c) => c.back === 'player' && /^Rewards?$/.test(c.set))
	const ids = names
		.map((n) => n.trim())
		.filter(Boolean)
		.map((n) => rewards.find((c) => norm(c.name) === norm(n))?.id)
		.filter((x): x is string => !!x)
	return [...new Set(ids)]
}

export function GuideWindow({ entry, pack = 'ebr', onClose, rewards, onUnlock }: { entry: string; pack?: GuidePack; onClose: () => void; rewards?: string[]; onUnlock?: (id: string) => void }) {
	const [cur, setCur] = useState<{ anchor: string | null; title: string }>({ anchor: null, title: `Entry ${entry}` })
	const [html, setHtml] = useState<string | null>(null)
	const [err, setErr] = useState<string | null>(null)
	const [found, setFound] = useState<string[]>([])
	const body = useRef<HTMLDivElement>(null)

	const show = async (anchor: string | null) => {
		setErr(null)
		setHtml(null)
		try {
			if (!anchor) throw new Error('not found')
			const doc = await loadDoc()
			const target = doc.getElementById(anchor)
			const page = target?.closest('.rules-page') ?? target
			if (!page) throw new Error('not found')
			const copy = page.cloneNode(true) as Element
			sanitize(copy)
			setCur({ anchor, title: page.querySelector('h3')?.textContent ?? `Entry ${entry}` })
			setHtml(copy.innerHTML)
			setFound(rewardsIn(copy.textContent ?? ''))
		} catch {
			setCur((c) => ({ ...c, anchor }))
			setErr('The guide could not be loaded here.')
		}
	}
	useEffect(() => {
		anchorFor(entry, pack)
			.then(show)
			.catch(() => setErr('The guide could not be loaded here.'))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entry, pack])
	// scroll to the entry (sub-entries like 3.1 sit inside their location's page) and highlight it
	useEffect(() => {
		if (!html || !body.current || !cur.anchor) return
		const t = body.current.querySelector<HTMLElement>(`[id="${cur.anchor}"]`)
		if (t) {
			t.scrollIntoView({ block: 'start' })
			t.classList.add('guide-here')
		} else body.current.scrollTop = 0
	}, [html, cur.anchor])

	return (
		<div className="drawer guide-window" onClick={onClose}>
			<div className="guide-sheet" onClick={(e) => e.stopPropagation()}>
				<div className="guide-head">
					<b>📖 {cur.title}</b>
					<span>
						<a className="btn ghost" href={guideLink(cur.anchor)} target="_blank" rel="noreferrer">
							Open in a new tab
						</a>
						<button onClick={onClose}>Close</button>
					</span>
				</div>
				<div
					className="guide-body"
					ref={body}
					onClick={(e) => {
						// links to other entries open here
						const a = (e.target as HTMLElement).closest('a')
						const href = a?.getAttribute('href') ?? ''
						if (href.startsWith('#')) {
							e.preventDefault()
							show(href.slice(1))
						} else if (a) a.setAttribute('target', '_blank')
					}}
				>
					{!html && !err && <p className="sub">Opening entry {entry}…</p>}
					{err && (
						<p>
							{err} Read entry <b>{entry}</b> in your campaign guide, or{' '}
							<a href={guideLink(cur.anchor)} target="_blank" rel="noreferrer">
								open it on earthborne.build
							</a>
							.
						</p>
					)}
					{html && <div className="guide-text" dangerouslySetInnerHTML={{ __html: html }} />}
				</div>
				{onUnlock && found.length > 0 && (
					<div className="guide-rewards">
						<b>🎁 This entry gives reward cards:</b>
						{found.map((id) =>
							rewards?.includes(id) ? (
								<span key={id} className="got">
									✓ {CARDS[id].name}
								</span>
							) : (
								<button key={id} className="primary" onClick={() => onUnlock(id)}>
									Unlock {CARDS[id].name}
								</button>
							),
						)}
						<small>Only unlock them if you are following that part of the entry (some entries depend on a choice or an IF).</small>
					</div>
				)}
				<p className="guide-credit">Campaign guide text from The Living Valley by Earthborne Games, via earthborne.build. Spoilers ahead: read only the entry you were sent to.</p>
			</div>
		</div>
	)
}
