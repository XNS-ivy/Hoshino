const WS_BASE = 'ws://localhost:3010'

type WSEvent = 'qr' | 'pairing-code' | 'connected' | 'disconnected' | 'error'
type Handler = (data: any) => void

export function createAgentWS(userId: string, handlers: Partial<Record<WSEvent, Handler>>) {
    const ws = new WebSocket(`${WS_BASE}/ws/agent/${userId}`)

    ws.onmessage = (e) => {
        const { event, data } = JSON.parse(e.data)
        handlers[event as WSEvent]?.(data)
    }

    ws.onerror = () => handlers.error?.({ message: 'WS error' })

    return ws
}