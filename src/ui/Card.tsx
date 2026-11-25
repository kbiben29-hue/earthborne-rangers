import { card, IMG_BASE, type CardDef } from '../data/data'
import type { Game, Inst } from '../engine/types'
import { nameOf, threshold } from '../engine/engine'

export const imgUrl = (file: string) => IMG_BASE + file
export const cardImg = (id: string, side: 'A' | 'B' = 'A') => {
	const c = card(id)
	return imgUrl(side === 'B' && c.B ? c.B.img : c.img)
}

/** A card picture with its tokens. */
export function CardTile({
	g,
	inst,
	onClick,
	selected,
	pickable,
	small,
}: {
	g: Game
	inst: Inst
	onClick?: (e: React.MouseEvent) => void
	selected?: boolean
	pickable?: boolean
	small?: boolean
}) {
	const pt = threshold(g, inst.uid, 'prog')
	const ht = threshold(g, inst.uid, 'harm')
	const tokens = g.rangers.map((r, k) => (r.token === inst.uid ? k : -1)).filter((k) => k >= 0)
	const c = card(inst.id)
	const landscape = c.type === 'Location'
	return (
		<button
			className={`tile ${small ? 'small' : ''} ${inst.exhausted ? 'exhausted' : ''} ${selected ? 'selected' : ''} ${pickable ? 'pickable' : ''} ${landscape ? 'land' : ''}`}
			onClick={onClick}
			title={nameOf(g, inst.uid)}
			data-uid={inst.uid}
		>
			<img src={inst.faceDown ? imgUrl(c.back === 'path' ? 'back-path.jpg' : 'back-player.jpg') : cardImg(inst.id, inst.side)} alt={nameOf(g, inst.uid)} loading="lazy" draggable={false} />
			<span className="tile-name">{nameOf(g, inst.uid)}</span>
			<span className="badges">
				{(inst.progress > 0 || (typeof pt === 'number' && inst.kind === 'location')) && (
					<span className="badge prog" title="Progress">
						<Icon k="progress" />
						{inst.progress}
						{typeof pt === 'number' ? `/${pt}` : ''}
					</span>
				)}
				{inst.harm > 0 && (
					<span className="badge harm" title="Harm">
						<Icon k="harm" />
						{inst.harm}
						{typeof ht === 'number' ? `/${ht}` : ''}
					</span>
				)}
				{inst.tokens > 0 && (
					<span className="badge tok" title={c.tokens?.name ?? 'Tokens'}>
						{inst.tokens} {c.tokens?.name?.toLowerCase().slice(0, 6) ?? ''}
					</span>
				)}
				{tokens.map((k) => (
					<span key={k} className={`badge ranger r${k}`} title={`${g.rangers[k].name}'s Ranger token`}>
						{g.rangers[k].name.slice(0, 1)}
					</span>
				))}
			</span>
		</button>
	)
}

/** Card in hand (not in play). */
export function HandCard({ id, onClick, selected, dim, note }: { id: string; onClick?: () => void; selected?: boolean; dim?: boolean; note?: string }) {
	const c: CardDef = card(id)
	return (
		<button className={`hand-card ${selected ? 'selected' : ''} ${dim ? 'dim' : ''}`} onClick={onClick} title={c.name}>
			<img src={cardImg(id)} alt={c.name} loading="lazy" draggable={false} />
			{note && <span className="hand-note">{note}</span>}
		</button>
	)
}

const ICON: Record<string, string> = {
	conflict: '⚔',
	reason: '△',
	exploration: '🧭',
	connection: '♥',
	progress: '▲',
	harm: '✖',
	sun: '☀',
	mountain: '⛰',
	crest: '⚜',
	conditional: '⏩',
	ranger: '◉',
	perranger: '/Ranger',
	guide: '📖',
	AWA: 'AWA',
	FIT: 'FIT',
	FOC: 'FOC',
	SPI: 'SPI',
}
/** Card text with icons, as React nodes. */
/** Symbols cut out of the card pictures (scripts/cut-icons.py → public/icons). */
export const ICON_IMG = new Set(['conflict', 'reason', 'exploration', 'connection', 'progress', 'harm', 'sun', 'mountain', 'crest', 'conditional', 'ranger', 'guide'])
const ALIAS: Record<string, string> = { right_arrow: 'conditional', cnf: 'conflict', rea: 'reason', exl: 'exploration', con: 'connection', per_ranger: 'perranger', prorgess: 'progress', awa: 'AWA', fit: 'FIT', foc: 'FOC', spi: 'SPI' }
export const iconSrc = (k: string) => `./icons/${k}.png`
const iconHtml = (k0: string) => {
	const k = ALIAS[k0.toLowerCase()] ?? k0
	if (ICON_IMG.has(k)) return `<img class="ic-img icimg-${k}" src="${iconSrc(k)}" alt="${k}" draggable="false"/>`
	return ICON[k] ? `<span class="ic ic-${k}">${ICON[k]}</span>` : null
}
/** A card symbol as a picture, for use in JSX. */
export function Icon({ k, title }: { k: string; title?: string }) {
	const key = ALIAS[k.toLowerCase()] ?? k
	if (!ICON_IMG.has(key)) return <span className={`ic ic-${key}`}>{ICON[key] ?? k}</span>
	return <img className={`ic-img icimg-${key}`} src={iconSrc(key)} alt={key} title={title ?? key} draggable={false} />
}
/** Plain text (log lines) with the challenge symbols shown as their pictures. */
export function IconText({ text }: { text: string }) {
	const html = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/☀/g, iconHtml('sun')!)
		.replace(/⛰/g, iconHtml('mountain')!)
		.replace(/⚜/g, iconHtml('crest')!)
		.replace(/\[(\w+)\]/g, (m, k) => iconHtml(k) ?? m)
	return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export function RulesText({ text }: { text?: string }) {
	if (!text) return null
	const html = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/&lt;(\/?)(b|i|f)&gt;/g, (_, s, t) => `<${s}${t === 'f' ? 'i' : t}>`)
		.replace(/&lt;\/?hr\s*\/?&gt;/g, '<br/>')
		.replace(/&lt;[^&]*&gt;/g, '')
		.replace(/\[(\w+)\]/g, (m, k) => iconHtml(k) ?? m)
		.replace(/\n/g, '<br/>')
	return <div className="rules" dangerouslySetInnerHTML={{ __html: html }} />
}
