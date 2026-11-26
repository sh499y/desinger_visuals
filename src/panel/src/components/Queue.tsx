// Kolejka klipów (timeline) nad listą biblioteki: kolejność, czas elementu,
// czekanie na beat i fragment od–do każdego klipu. Zmiany idą do serwera po
// zatwierdzeniu pola (blur/Enter) albo po puszczeniu uchwytu.

import { useEffect, useRef, useState } from 'react'
import { TIMELINE_LIMITS, itemDuration, nextIndex } from '@shared/timeline'
import type { TimelineItem, VideoItem } from '@shared/types'
import {
  timelineGoto,
  timelineMove,
  timelinePlay,
  timelineRemove,
  timelineUpdate,
  usePanel
} from '../store'
import { Button } from './ui'

const fmt = (v: number): string => String(Math.round(v * 10) / 10)

/** Pole liczbowe zatwierdzane na blur/Enter; z `allowEmpty` puste = null. */
function CommitField({
  label,
  value,
  step,
  allowEmpty = false,
  title,
  onCommit
}: {
  label: string
  value: number | null
  step: number
  allowEmpty?: boolean
  title?: string
  onCommit: (v: number | null) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : fmt(value))
  const commit = (): void => {
    if (draft === null) return
    setDraft(null)
    const t = draft.trim().replace(',', '.')
    if (t === '') {
      if (allowEmpty && value !== null) onCommit(null)
      return
    }
    const v = Number(t)
    if (Number.isFinite(v) && v !== value) onCommit(v)
  }
  return (
    <label className="flex items-center gap-1 text-muted" title={title}>
      {label}
      <input
        type="text"
        inputMode="decimal"
        className="field field-sm w-12 tabular-nums"
        value={shown}
        placeholder={allowEmpty ? 'koniec' : undefined}
        data-step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(null)
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  )
}

/** Pasek długości klipu z uchwytami „od” i „do”. Zmiana idzie po puszczeniu. */
function RangeBar({
  item,
  clipDuration
}: {
  item: TimelineItem
  clipDuration: number
}): React.JSX.Element {
  const bar = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ which: 'in' | 'out'; value: number } | null>(null)
  const inP = drag?.which === 'in' ? drag.value : Math.min(item.inPoint, clipDuration)
  const outP =
    drag?.which === 'out' ? drag.value : Math.min(item.outPoint ?? clipDuration, clipDuration)
  const pct = (v: number): string => `${(v / clipDuration) * 100}%`

  const at = (clientX: number): number => {
    const r = bar.current!.getBoundingClientRect()
    const v = ((clientX - r.left) / Math.max(1, r.width)) * clipDuration
    return Math.round(Math.min(clipDuration, Math.max(0, v)) * 10) / 10
  }
  const clampFor = (which: 'in' | 'out', v: number): number =>
    which === 'in'
      ? Math.min(v, outP - TIMELINE_LIMITS.minSpan)
      : Math.max(v, inP + TIMELINE_LIMITS.minSpan)

  const handle = (which: 'in' | 'out', value: number): React.JSX.Element => (
    <div
      role="slider"
      aria-label={which === 'in' ? 'Początek fragmentu' : 'Koniec fragmentu'}
      aria-valuemin={0}
      aria-valuemax={clipDuration}
      aria-valuenow={value}
      className="absolute top-[-3px] bottom-[-3px] w-2 -translate-x-1/2 cursor-ew-resize bg-fg"
      style={{ left: pct(value) }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ which, value })
      }}
      onPointerMove={(e) => {
        if (drag?.which === which) setDrag({ which, value: clampFor(which, at(e.clientX)) })
      }}
      onPointerUp={() => {
        if (!drag) return
        const patch =
          which === 'in'
            ? { inPoint: drag.value }
            : { outPoint: drag.value >= clipDuration - 0.05 ? null : drag.value }
        setDrag(null)
        timelineUpdate(item.id, patch)
      }}
      onPointerCancel={() => setDrag(null)}
    />
  )

  return (
    <div ref={bar} className="relative mx-1 h-2 flex-1 border" onClick={(e) => e.stopPropagation()}>
      <div
        className="absolute top-0 bottom-0 bg-term-green opacity-60"
        style={{ left: pct(inP), width: pct(Math.max(0, outP - inP)) }}
      />
      {handle('in', inP)}
      {handle('out', outP)}
    </div>
  )
}

/**
 * Postęp bieżącego elementu liczony lokalnie od chwili, gdy panel zobaczył zmianę.
 * Nowy element = nowy `key`, więc licznik startuje od zera przy montażu.
 */
function Progress({ item, duration }: { item: TimelineItem; duration: number }): React.JSX.Element {
  const [p, setP] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const t = setInterval(
      () => setP(Math.min(1, (performance.now() - start) / 1000 / duration)),
      100
    )
    return () => clearInterval(t)
  }, [item.id, duration])
  return (
    <div className="mt-1 h-[2px] w-full bg-black" aria-hidden>
      <div className="h-full bg-current" style={{ width: `${p * 100}%` }} />
    </div>
  )
}

function Row({
  item,
  index,
  count,
  clip,
  current,
  playing,
  linked
}: {
  item: TimelineItem
  index: number
  count: number
  clip: VideoItem | undefined
  current: boolean
  playing: boolean
  linked: boolean
}): React.JSX.Element {
  const live = current && playing
  return (
    <div
      className={`p-2 ${live ? 'inv' : current ? 'outline-1 outline-dotted' : ''}`}
      aria-current={live || undefined}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 flex-none font-mono text-meta tabular-nums">{index + 1}</span>
        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left text-ui ${clip ? '' : 'text-danger line-through'}`}
          title={clip ? `Przejdź do: ${clip.name}` : 'Klipu nie ma już w bibliotece'}
          onClick={() => timelineGoto(index)}
        >
          {clip?.name ?? 'brak pliku'}
        </button>
        {current && linked && !playing && (
          <span
            className="tag bg-black text-term-green"
            title="Zmiany efektów w grafie zapisują się do tego ujęcia"
          >
            edytujesz
          </span>
        )}
        <button
          type="button"
          className="tag tag-btn"
          aria-pressed={item.loop}
          title={
            item.loop
              ? 'Pętla: fragment powtarza się przez ustawiony czas (kliknij: jedno przejście)'
              : 'Jedno przejście fragmentu, potem następne ujęcie (kliknij: pętla)'
          }
          onClick={() => timelineUpdate(item.id, { loop: !item.loop })}
        >
          ↻
        </button>
        {item.loop ? (
          <>
            <CommitField
              label=""
              value={item.duration}
              step={1}
              title="Czas pętli [s]"
              onCommit={(v) => v !== null && timelineUpdate(item.id, { duration: v })}
            />
            <span className="text-meta text-muted">s</span>
          </>
        ) : (
          <span
            className="w-16 text-right text-meta text-muted tabular-nums"
            title="Długość fragmentu"
          >
            {fmt(itemDuration(item, clip?.duration ?? null))} s
          </span>
        )}
        <button
          type="button"
          className="tag tag-btn"
          aria-pressed={item.waitBeat}
          title={
            item.waitBeat
              ? 'Cięcie na beat (kliknij: dokładnie po czasie)'
              : 'Cięcie dokładnie po czasie (kliknij: na beat)'
          }
          onClick={() => timelineUpdate(item.id, { waitBeat: !item.waitBeat })}
        >
          ♪
        </button>
        <Button
          variant="link"
          title="W górę"
          disabled={index === 0}
          onClick={() => timelineMove(item.id, index - 1)}
        >
          ↑
        </Button>
        <Button
          variant="link"
          title="W dół"
          disabled={index === count - 1}
          onClick={() => timelineMove(item.id, index + 1)}
        >
          ↓
        </Button>
        <Button
          variant="link"
          className="btn-danger"
          title="Usuń z kolejki"
          onClick={() => timelineRemove(item.id)}
        >
          ×
        </Button>
      </div>
      <div className="mt-1 flex items-center gap-2 pl-7 text-meta">
        <CommitField
          label="od"
          value={item.inPoint}
          step={0.1}
          title="Początek fragmentu [s]"
          onCommit={(v) => v !== null && timelineUpdate(item.id, { inPoint: v })}
        />
        <CommitField
          label="do"
          value={item.outPoint}
          step={0.1}
          allowEmpty
          title="Koniec fragmentu [s]; puste = do końca klipu"
          onCommit={(v) => timelineUpdate(item.id, { outPoint: v })}
        />
        {clip?.duration ? <RangeBar item={item} clipDuration={clip.duration} /> : null}
      </div>
      {live && (
        <Progress key={item.id} item={item} duration={itemDuration(item, clip?.duration ?? null)} />
      )}
    </div>
  )
}

export function Queue(): React.JSX.Element | null {
  const timeline = usePanel((s) => s.app?.timeline)
  const library = usePanel((s) => s.app?.library ?? [])
  if (!timeline) return null
  const { items, playing, linked, index } = timeline
  const skip = (): void => {
    const next = nextIndex(timeline, new Set(library.map((v) => v.id)))
    if (next !== null) timelineGoto(next)
  }
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex-1 font-mono text-meta tracking-wider">
          KOLEJKA <span className="text-muted">({items.length})</span>
        </span>
        <Button
          variant={playing ? 'default' : 'primary'}
          disabled={items.length === 0}
          onClick={() => timelinePlay(!playing)}
        >
          {playing ? '■ Stop' : '▶ Graj'}
        </Button>
        <Button title="Następny klip" disabled={items.length < 2} onClick={skip}>
          ⏭
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-meta text-muted">
          Dodaj klipy przyciskiem „+ kolejka” przy pliku. Każdy dostaje kopię obecnych efektów.
        </div>
      ) : (
        <>
          {!playing && !linked && (
            <div className="mb-1 text-meta text-muted">
              Kliknij ujęcie, żeby ustawić mu własne efekty.
            </div>
          )}
          <div className="rows">
            {items.map((item, i) => (
              <Row
                key={item.id}
                item={item}
                index={i}
                count={items.length}
                clip={library.find((v) => v.id === item.videoId)}
                current={i === index}
                playing={playing}
                linked={linked}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
