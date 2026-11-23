import { useEffect, useState } from 'react'

export type Info = {
  key: number
  title: string
  query: string
  body: string
  meta: string[]
}

/** Types text out character by character, like data arriving. */
function useTypewriter(text: string, delay = 450, cps = 45) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    let id = 0
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        setN((c) => {
          if (c >= text.length) {
            window.clearInterval(id)
            return c
          }
          return c + 1
        })
      }, 1000 / cps)
    }, delay)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [text, delay, cps])
  return { shown: text.slice(0, n), done: n >= text.length }
}

function Card({ info, onClose }: { info: Info; onClose: () => void }) {
  const { shown, done } = useTypewriter(info.body)
  return (
    <div className="info-card">
      <header className="card-head">
        <span>
          <b>04</b> {info.title}
        </span>
        <button className="x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="info-query">&gt; {info.query}</div>
      <div className="info-body">
        <p className="typed">
          {shown}
          {!done && <span className="caret" />}
        </p>
      </div>
      <footer className="info-meta">
        {info.meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </footer>
      <div className="scan" />
    </div>
  )
}

/**
 * The result screen. It swipes in from the right; each new `info.key` remounts
 * the card, replaying the scan reveal and typing effect.
 */
export default function InfoPanel({ info, onClose }: { info: Info | null; onClose: () => void }) {
  return (
    <aside className={`card info ${info ? 'open' : ''}`}>
      {info && <Card key={info.key} info={info} onClose={onClose} />}
    </aside>
  )
}
