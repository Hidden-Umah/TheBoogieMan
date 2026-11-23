import { useEffect, useState } from 'react'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export default function HudFrame({ connected, startedAt }: { connected: boolean; startedAt: number }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const up = Math.floor((now.getTime() - startedAt) / 1000)
  const uptime = `${pad(Math.floor(up / 3600))}:${pad(Math.floor((up % 3600) / 60))}:${pad(up % 60)}`

  return (
    <div className="frame">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="top-left">
        <div className="brand">THE BOOGEYMAN</div>
        <div className="brand-sub">PERSONAL INTELLIGENCE</div>
        <div className="sub">
          <i className={`pip ${connected ? 'acc' : 'off'}`} />
          {connected ? 'All systems operational' : 'Brain link down'}
        </div>
      </div>

      <div className="top-right">
        <div className="clock">
          {pad(now.getHours())}:{pad(now.getMinutes())}
          <span className="sec">:{pad(now.getSeconds())}</span>
        </div>
        <div className="sub">
          {now.toDateString().toUpperCase()} · UP {uptime}
        </div>
      </div>
    </div>
  )
}
