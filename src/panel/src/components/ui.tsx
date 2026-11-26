import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

// Długie ciągi znaków przycinane przez CSS (`.ascii-fill`, `.ascii-v`), bez liczenia w JS.
const H_LINE = '─'.repeat(240)
const H_DASH = '-'.repeat(240)
const V_LINE = '│\n'.repeat(80)

interface SectionProps {
  title: string
  /** Numer sekcji w nagłówku: `01 / BIBLIOTEKA`. */
  index: number
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /**
   * Sekcja zwijana: domyślnie zwinięta na szerokim ekranie, rozwija się po najechaniu
   * (mysz), fokusie z klawiatury, kliknięciu nagłówka (dotyk) i przeciągnięciu pliku.
   */
  collapsible?: boolean
  /** Wiersz pokazywany pod nagłówkiem, gdy sekcja jest zwinięta. */
  summary?: ReactNode
}

/** Treść nagłówka: `┌─ 01 / TYTUŁ (meta) ─────`. */
function Heading({
  title,
  index,
  meta
}: Pick<SectionProps, 'title' | 'index' | 'meta'>): React.JSX.Element {
  return (
    <>
      <span aria-hidden className="font-mono text-meta text-muted">
        ┌─
      </span>
      <span className="truncate font-pixel uppercase">
        {String(index).padStart(2, '0')} / {title}
      </span>
      {meta !== undefined && <span className="font-mono text-meta text-muted">{meta}</span>}
      <span aria-hidden className="ascii-fill font-mono text-meta text-muted">
        {H_LINE}
      </span>
    </>
  )
}

export function Section(props: SectionProps): React.JSX.Element {
  if (props.collapsible) return <CollapsibleSection {...props} />
  const { title, index, meta, actions, children, className = '' } = props
  return (
    <section className={`surface ${className}`}>
      <header className="flex items-center gap-2 px-3 pt-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
          <Heading title={title} index={index} meta={meta} />
        </h2>
        {actions && <div className="flex flex-none items-center gap-1">{actions}</div>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

const wideQuery = '(min-width: 64rem)'

function CollapsibleSection({
  title,
  index,
  meta,
  actions,
  children,
  summary,
  className = ''
}: SectionProps): React.JSX.Element {
  const bodyId = useId()
  // Szeroki ekran: zwinięte (pływa nad grafem). Wąski: rozwinięte, w zwykłej kolumnie.
  const [open, setOpen] = useState(() => !window.matchMedia(wideQuery).matches)
  // Przeciąganie pliku nad sekcją rozwija ją, żeby upload drag&drop trafił w listę.
  const [dragging, setDragging] = useState(false)
  const expanded = open || dragging

  return (
    <section
      className={`surface collapsible ${expanded ? 'is-open' : ''} ${className}`}
      onDragEnter={() => setDragging(true)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDropCapture={() => setDragging(false)}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            className="tap flex w-full items-center gap-2 text-left whitespace-nowrap"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
          >
            <Heading title={title} index={index} meta={meta} />
            <span aria-hidden className="flex-none font-mono text-meta text-muted">
              {expanded ? '[-]' : '[+]'}
            </span>
          </button>
        </h2>
        {actions && <div className="flex flex-none items-center gap-1">{actions}</div>}
      </header>
      {summary && <div className="collapsible-summary">{summary}</div>}
      <div id={bodyId} className="collapsible-body">
        <div className="px-3 pt-1 pb-3">{children}</div>
      </div>
    </section>
  )
}

type Variant = 'default' | 'primary' | 'danger' | 'link'

const variants: Record<Variant, string> = {
  default: '',
  primary: 'btn-primary',
  danger: 'btn-danger',
  link: 'btn-link'
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): React.JSX.Element {
  return <button type="button" className={`btn ${variants[variant]} ${className}`} {...props} />
}

/**
 * Przycisk z potwierdzeniem w miejscu (bez systemowego okna confirm, które
 * blokuje stronę): pierwsze kliknięcie zmienia go w „Usuń?”, drugie wykonuje
 * akcję. Po 3 s albo po zabraniu fokusu wraca do zwykłego stanu.
 */
export function ConfirmButton({
  children,
  confirmLabel = 'Usuń?',
  title,
  className = '',
  onConfirm
}: {
  children: ReactNode
  confirmLabel?: string
  title?: string
  className?: string
  onConfirm: () => void
}): React.JSX.Element {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button
      variant={armed ? 'default' : 'link'}
      // Uzbrojony zostaje widoczny także poza hoverem (bez klas typu `reveal`).
      className={`btn-danger ${armed ? 'inv' : className}`}
      title={armed ? 'Kliknij jeszcze raz, żeby potwierdzić' : title}
      aria-pressed={armed}
      onBlur={() => setArmed(false)}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  )
}

/** Etykieta w ramce 1px, np. `[FX]`, `[F11]`, `[LIVE]`. */
export function Tag({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return <span className={`tag ${className}`}>{children}</span>
}

/** Przełącznik ON/OFF jako tag, włączony w inwersji. */
export function ToggleTag({
  on,
  onToggle,
  title
}: {
  on: boolean
  onToggle: () => void
  title?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="tag tag-btn"
      aria-pressed={on}
      title={title}
      onClick={onToggle}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  )
}

/** Pusty stan w ramce ASCII: `+----+` / `│ … │`. */
export function AsciiBox({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="font-mono text-meta text-muted">
      <div aria-hidden className="flex">
        <span>+</span>
        <span className="ascii-fill">{H_DASH}</span>
        <span>+</span>
      </div>
      <div className="relative px-4 py-1">
        <span aria-hidden className="ascii-v left-0">
          {V_LINE}
        </span>
        <div className="text-ui text-fg">{children}</div>
        <span aria-hidden className="ascii-v right-0">
          {V_LINE}
        </span>
      </div>
      <div aria-hidden className="flex">
        <span>+</span>
        <span className="ascii-fill">{H_DASH}</span>
        <span>+</span>
      </div>
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  extra
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  /** Element obok wartości (np. select „podepnij sygnał”). */
  extra?: ReactNode
}): React.JSX.Element {
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
  const fraction = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-muted">{label}</span>
        <span className="flex flex-none items-center gap-2">
          <span className="tabular-nums text-fg">{value.toFixed(decimals)}</span>
          {extra}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        className="mt-1"
        style={{ '--p': fraction } as React.CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function NumberField({
  label,
  value,
  step,
  title,
  onChange
}: {
  label: string
  value: number
  step: number
  title?: string
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-1 text-muted" title={title}>
      {label}
      <input
        type="number"
        className="field field-sm w-16 tabular-nums"
        value={value}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </label>
  )
}

export const selectClass = 'mt-1 block w-full'
