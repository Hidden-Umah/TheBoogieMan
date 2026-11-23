import { useEffect } from 'react'
import { bend } from '../lib/curve'

/** Everything you can say right now. Opens on "what can you do" or Ctrl+H. */
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'TALK',
    items: [
      ['"Hello" / anything', 'Just talk. He answers in voice, with a bit of Pidgin.'],
      ['"Remember that …"', 'Saves a fact about you for every future chat.'],
      ['"Forget …"', 'Removes a saved fact.'],
      ['"Clear our conversation"', 'Wipes chat history (facts stay).'],
      ['Talk over him', 'He stops and listens. "Pause" keeps him quiet, "continue" picks up.'],
    ],
  },
  {
    title: 'WORK',
    items: [
      ["\"Let's get to work\"", 'Opens the workspace.'],
      ['"Research …" / "Look up …"', 'Plans, searches the web, reads, then reports.'],
      ['"Back to the normal screen"', 'Closes the workspace. Also "exit work mode", "go home".'],
    ],
  },
  {
    title: 'SCREEN',
    items: [
      ['"Change the background"', 'Next background video.'],
      ['"Sea background" / "Nebula"', 'Pick one by name.'],
      ['"Background off" / "on"', 'Plain dark or video.'],
      ['"Devil mode" / "stand down"', 'Visor, red, the eye.'],
      ['"What can you do?"', 'Shows this card.'],
    ],
  },
  {
    title: 'POWER',
    items: [
      ['"Shut down"', 'He asks first. Say "yes" to confirm.'],
      ['"Shut down now"', 'Closes immediately, no question.'],
    ],
  },
  {
    title: 'KEYS',
    items: [
      ['Ctrl + M', 'Mute / unmute the mic.'],
      ['Ctrl + B', 'Next background.'],
      ['Ctrl + D', 'Devil mode.'],
      ['Ctrl + H / Esc', 'Show / hide this card.'],
    ],
  },
]

export default function CommandsCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onClose, 30000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="cmds" onClick={onClose}>
      <section className="cmds-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <span>
            <b>●</b> WHAT YOU CAN SAY
          </span>
          <button onClick={onClose}>ESC ✕</button>
        </header>
        <div className="cmds-grid">
          {GROUPS.map((g, gi) => (
            <div
              className="cmds-group"
              key={g.title}
              style={{ animationDelay: `${gi * 0.07}s`, transform: bend((gi * 100) / GROUPS.length, 100 / GROUPS.length) }}
            >
              <h4>{g.title}</h4>
              {g.items.map(([say, what]) => (
                <div className="cmd" key={say}>
                  <code>{say}</code>
                  <span>{what}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
