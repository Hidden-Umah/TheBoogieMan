import { useEffect, useRef, useState } from 'react'
import { channels } from '../lib/audio'
import CurvedCard from './CurvedCard'
import VoicePattern from './VoicePattern'

export type Exchange = { id: number; you: string; him: string }
export type Fact = { id: string; text: string; at: string }

/** Live readout for a voice card header: level in dB-ish and whether it's active. */
function LiveTag({ source }: { source: 'mic' | 'voice' }) {
  const [txt, setTxt] = useState('--')
  const [live, setLive] = useState(false)
  useEffect(() => {
    const id = setInterval(() => {
      const c = channels[source]
      const on = performance.now() - c.at < 400 && c.level > 0.05
      setLive(on)
      setTxt(on ? `${Math.round(c.level * 100)}%` : 'IDLE')
    }, 150)
    return () => clearInterval(id)
  }, [source])
  return (
    <span className={`live-tag ${live ? 'on' : ''}`}>
      <i className={`pip ${live ? 'acc' : 'on'}`} /> {txt}
    </span>
  )
}

export function VoiceCards({ heard, spoken }: { heard: number; spoken: number }) {
  return (
    <div className="wing wing-left">
      <div className="wing-inner">
        <CurvedCard side="left" n="01" title="YOUR VOICE" right={<LiveTag source="mic" />}>
          <VoicePattern source="mic" />
          <div className="wing-foot">
            <span>MIC · 16 kHz</span>
            <span>{heard} HEARD</span>
          </div>
        </CurvedCard>
        <CurvedCard side="left" n="02" title="BOOGEYMAN" right={<LiveTag source="voice" />}>
          <VoicePattern source="voice" />
          <div className="wing-foot">
            <span>VOICE · 24 kHz</span>
            <span>{spoken} SPOKEN</span>
          </div>
        </CurvedCard>
      </div>
    </div>
  )
}

/** Types text out roughly at speaking pace. */
function Typed({ text, cps = 24 }: { text: string; cps?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    const id = window.setInterval(() => {
      setN((c) => {
        if (c >= text.length) {
          window.clearInterval(id)
          return c
        }
        return c + 1
      })
    }, 1000 / cps)
    return () => window.clearInterval(id)
  }, [text, cps])
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="caret" />}
    </>
  )
}

export function ResponseCard({ exchanges, thinking }: { exchanges: Exchange[]; thinking: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [exchanges])
  const last = exchanges[exchanges.length - 1]
  return (
    <CurvedCard side="right" n="03" title="RESPONSE" className="resp-card" right={thinking ? <span className="live-tag on">THINKING</span> : undefined}>
      <div className="resp-body">
        {exchanges.length === 0 && <p className="hint">Say something, boss. His words appear here.</p>}
        {exchanges.map((e) => (
          <div key={e.id} className={`ex ${e === last ? 'current' : ''}`}>
            <div className="ex-you">{e.you}</div>
            {e.him && <div className="ex-him">{e === last ? <Typed text={e.him} /> : e.him}</div>}
          </div>
        ))}
        {thinking && <div className="ex-dots"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
    </CurvedCard>
  )
}

export function MemoryCard({ facts, fresh }: { facts: Fact[]; fresh: string | null }) {
  const list = [...facts].reverse()
  return (
    <CurvedCard side="right" n="04" title="MEMORY" right={<span className="muted">{facts.length} FACTS</span>}>
      <div className="mem-body">
        {list.length === 0 && <p className="hint">Nothing yet. Try: "remember that I love jollof".</p>}
        {list.map((f) => (
          <div key={f.id} className={`fact ${f.id === fresh ? 'fresh' : ''}`}>
            <i className={`pip ${f.id === fresh ? 'acc' : 'on'}`} />
            <span>{f.text}</span>
          </div>
        ))}
      </div>
    </CurvedCard>
  )
}
