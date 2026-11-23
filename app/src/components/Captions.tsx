import { useEffect, useState } from 'react'

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'hearing'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error'
  | 'unavailable'

const LABEL: Record<VoiceState, string> = {
  idle: 'STANDBY',
  listening: 'LISTENING',
  hearing: 'HEARING YOU',
  transcribing: 'DECODING',
  thinking: 'THINKING',
  speaking: 'SPEAKING',
  muted: 'MIC MUTED',
  error: 'VOICE ERROR',
  unavailable: 'VOICE OFFLINE',
}

/** Types text out like it's being spoken. */
function useTyped(text: string, cps = 22) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    if (!text) return
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
  return text.slice(0, n)
}

/**
 * Subtitles under the core: what you said, then what he says back.
 * Fades out a few seconds after he finishes. Replaces the old text box.
 */
export default function Captions({
  you,
  him,
  state,
  detail,
}: {
  you: string
  him: string
  state: VoiceState
  detail?: string
}) {
  const typed = useTyped(him)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!you && !him) return
    setVisible(true)
    if (state === 'speaking' || state === 'thinking' || state === 'transcribing') return
    const id = window.setTimeout(() => setVisible(false), 7000)
    return () => window.clearTimeout(id)
  }, [you, him, state])

  const live = state === 'hearing' || state === 'speaking'
  return (
    <div className="captions">
      <div className={`cap-lines ${visible ? 'show' : ''}`}>
        {you && <div className="cap-you">{you}</div>}
        {him && <div className="cap-him">{typed}</div>}
      </div>
      <div className={`voice-chip vs-${state}`} title={detail}>
        <i className={`pip ${live ? 'acc' : state === 'muted' || state === 'error' || state === 'unavailable' ? 'off' : 'on'}`} />
        {LABEL[state]}
        {detail && (state === 'unavailable' || state === 'error') && <span className="chip-detail"> · {detail}</span>}
      </div>
    </div>
  )
}
