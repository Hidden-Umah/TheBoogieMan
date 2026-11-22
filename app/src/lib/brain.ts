// Typed bridge from React to the Rust core. See shared/messages.md for the message shape.
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type Message<P = Record<string, unknown>> = {
  id: string
  type: string
  payload: P
}

export type BrainReply = {
  text: string
  chars: number
  python: string
  at: string
}

export function sendToBrain<P>(type: string, payload: Record<string, unknown> = {}) {
  const message: Message = { id: crypto.randomUUID(), type, payload }
  return invoke<Message<P>>('send_to_brain', { message })
}

export function brainStatus() {
  return invoke<boolean>('brain_status')
}

export function onBrainStatus(cb: (connected: boolean) => void): Promise<UnlistenFn> {
  return listen<{ connected: boolean }>('brain-status', (e) => cb(e.payload.connected))
}

export function onBrainMessage(cb: (msg: Message) => void): Promise<UnlistenFn> {
  return listen<Message>('brain-message', (e) => cb(e.payload))
}
