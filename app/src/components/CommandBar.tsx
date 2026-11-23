import { useEffect, useRef, useState, type FormEvent } from 'react'

export default function CommandBar({
  disabled,
  busy,
  devil = false,
  onSubmit,
}: {
  disabled: boolean
  busy: boolean
  devil?: boolean
  onSubmit: (text: string) => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!disabled && !busy) inputRef.current?.focus()
  }, [disabled, busy])

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = value.trim()
    if (!text || disabled || busy) return
    onSubmit(text)
    setValue('')
  }

  return (
    <form className="command" onSubmit={submit}>
      <span className="prompt">&gt;_</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={disabled ? 'BRAIN OFFLINE' : busy ? 'PROCESSING…' : devil ? 'Name the target, boss' : 'Awaiting your command, boss'}
        disabled={disabled}
        spellCheck={false}
        autoFocus
      />
      <span className="hint">ENTER ↵</span>
    </form>
  )
}
