import { useEffect, useRef, useState, type FormEvent } from 'react'
import { brainStatus, onBrainStatus, sendToBrain, type BrainReply } from './lib/brain'

type Entry =
  | { role: 'boss'; text: string }
  | { role: 'boogeyman'; text: string; meta: string }
  | { role: 'error'; text: string }

export default function App() {
  const [connected, setConnected] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<Entry[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    brainStatus().then(setConnected).catch(() => setConnected(false))
    const unlisten = onBrainStatus(setConnected)
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  async function send(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setLog((l) => [...l, { role: 'boss', text }])
    try {
      const reply = await sendToBrain<BrainReply>('user.message', { text })
      if (reply.type === 'error') {
        setLog((l) => [...l, { role: 'error', text: String((reply.payload as unknown as { message: string }).message) }])
      } else {
        const p = reply.payload
        setLog((l) => [
          ...l,
          { role: 'boogeyman', text: p.text, meta: `Python ${p.python} · ${p.chars} chars` },
        ])
      }
    } catch (err) {
      setLog((l) => [...l, { role: 'error', text: String(err) }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <h1>The Boogeyman</h1>
        <span className={`status ${connected ? 'on' : 'off'}`}>
          <span className="dot" />
          {connected ? 'Brain connected' : 'Brain offline'}
        </span>
      </header>

      <section className="log">
        {log.length === 0 && <p className="empty">Say something, boss.</p>}
        {log.map((entry, i) => (
          <div key={i} className={`bubble ${entry.role}`}>
            <p>{entry.text}</p>
            {entry.role === 'boogeyman' && <small>{entry.meta}</small>}
          </div>
        ))}
        <div ref={endRef} />
      </section>

      <form className="composer" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? 'Type a message…' : 'Waiting for the brain…'}
          disabled={!connected}
          autoFocus
        />
        <button type="submit" disabled={!connected || busy || !input.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </main>
  )
}
