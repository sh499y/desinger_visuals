import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Section({
  title,
  actions,
  children,
  className = ''
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <section className={`rounded-lg border border-neutral-800 bg-neutral-900/60 ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
        {actions}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

type Variant = 'default' | 'primary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  default: 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100',
  primary: 'bg-violet-600 hover:bg-violet-500 text-white',
  danger: 'bg-neutral-800 hover:bg-red-700 text-neutral-100',
  ghost: 'hover:bg-neutral-800 text-neutral-300'
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): React.JSX.Element {
  return (
    <button
      type="button"
      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}): React.JSX.Element {
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-200">{value.toFixed(decimals)}</span>
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function NumberField({
  label,
  value,
  step,
  onChange
}: {
  label: string
  value: number
  step: number
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-1 text-xs text-neutral-400">
      {label}
      <input
        type="number"
        className="w-20 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-neutral-100"
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

export const selectClass =
  'w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100'
