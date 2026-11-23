import { useEffect, useRef } from 'react'
import { Card } from './dots'

export type LogLevel = 'sys' | 'ok' | 'warn' | 'err' | 'boss' | 'ai'
export type LogLine = { id: number; t: string; level: LogLevel; text: string }

const TAG: Record<LogLevel, string> = {
  sys: 'SYS',
  ok: ' OK',
  warn: 'WRN',
  err: 'ERR',
  boss: 'CMD',
  ai: 'BGM',
}

export default function LogPanel({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  return (
    <Card n="03" title="SYSTEM LOG" className="log-card" right={<span className="rec">● REC</span>}>
      <div className="log-body">
        {lines.map((l) => (
          <div key={l.id} className={`log-line lv-${l.level}`}>
            <span className="log-t">{l.t}</span>
            <span className="log-tag">{TAG[l.level]}</span>
            <span className="log-text">{l.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </Card>
  )
}
