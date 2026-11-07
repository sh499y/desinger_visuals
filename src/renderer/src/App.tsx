import { useEffect, useRef, useState } from 'react'
import type { AppState } from '@shared/types'
import { Engine } from './engine/renderer'

const OVERLAY_MS = 8000

function App(): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(true)

  useEffect(() => {
    let engine: Engine | null = null
    let off = (): void => {}
    let disposed = false

    window.api
      .init()
      .then(({ state, mediaKey }) => {
        if (disposed) return
        engine = new Engine(stageRef.current!, mediaKey, (status) =>
          window.api.sendAudioStatus(status)
        )
        engine.setState(state)
        engine.start()
        setState(state)
        off = window.api.onMessage((msg) => {
          if (msg.type === 'state') {
            const { type: _type, ...next } = msg
            engine?.setState(next)
            setState(next)
          } else if (msg.type === 'param') {
            engine?.patchParam(msg.node, msg.param, msg.value)
          }
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))

    return () => {
      disposed = true
      off()
      engine?.dispose()
    }
  }, [])

  // Informacje znikają po chwili i wracają po ruchu myszą.
  useEffect(() => {
    let timer = setTimeout(() => setShowInfo(false), OVERLAY_MS)
    const onMove = (): void => {
      setShowInfo(true)
      clearTimeout(timer)
      timer = setTimeout(() => setShowInfo(false), OVERLAY_MS)
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  const audioError = state?.audio.error
  const noVideo = state !== null && state.activeId === null
  const visible = showInfo || noVideo || Boolean(audioError) || Boolean(error)

  return (
    <>
      <div className="stage" ref={stageRef} />
      <div className={`overlay${visible ? '' : ' hidden'}`}>
        {error && <div className="error">Błąd: {error}</div>}
        {state && (
          <>
            <div>
              Panel: <strong>{state.server.panelUrl}</strong>
            </div>
            {state.server.lanUrls.map((url) => (
              <div key={url} className="muted">
                LAN: {url}
              </div>
            ))}
            {noVideo && <div>Dodaj wideo w panelu, żeby zacząć.</div>}
            <div className={audioError ? 'error' : 'muted'}>
              Audio: {audioError ?? state.audio.activeLabel ?? 'łączenie…'}
            </div>
          </>
        )}
        <div className="muted">F11 pełny ekran · P otwórz panel · F12 DevTools (dev)</div>
      </div>
    </>
  )
}

export default App
