# Message protocol

Every message between React, Rust and Python has the same JSON shape:

```json
{ "id": "uuid", "type": "kind", "payload": {} }
```

- `id`: correlates a reply with its request. A reply reuses the request's `id`. Rust generates one if it's missing.
- `type`: what the message is. Use dotted names: `user.message`, `brain.reply`, `agent.delta`.
- `payload`: anything, as long as it's a JSON object.

## Flow

```
React --invoke('send_to_brain')--> Rust --WebSocket--> Python
React <--------- reply ----------- Rust <--WebSocket-- Python
```

Messages from Python that don't answer a pending request (e.g. streamed tokens later) are
forwarded to React as the Tauri event `brain-message`. Connection changes arrive as the
`brain-status` event: `{ "connected": true | false }`.

## Types (Phase 0)

| type           | direction       | payload                                     |
|----------------|-----------------|---------------------------------------------|
| `ping`         | → brain         | `{}`                                        |
| `pong`         | ← brain         | `{}`                                        |
| `user.message` | → brain         | `{ "text": string }`                        |
| `brain.reply`  | ← brain         | `{ "text", "chars", "python", "at" }`       |
| `error`        | ← brain         | `{ "message": string }`                     |

Phase 1 adds `agent.delta`, `agent.tool_call`, `agent.done`, `agent.error`.
