export interface WSEvent {
	type: "message_new" | "status_change" | "qr_code" | "pairing_code"
	agentId: string
	payload: unknown
}

export class WebSocketManager {
	private static instance: WebSocketManager
	// Map of agentId -> Set of client WebSockets
	private subscribers: Map<string, Set<{ send: (msg: string) => void }>> =
		new Map()

	private constructor() {}

	public static getInstance(): WebSocketManager {
		if (!WebSocketManager.instance) {
			WebSocketManager.instance = new WebSocketManager()
		}
		return WebSocketManager.instance
	}

	/**
	 * Subscribes a client WS connection to a specific agent's events.
	 */
	public subscribe(agentId: string, ws: { send: (msg: string) => void }): void {
		if (!this.subscribers.has(agentId)) {
			this.subscribers.set(agentId, new Set())
		}
		this.subscribers.get(agentId)!.add(ws)
		logger.system(
			"/services/wsManager.ts",
			`Client subscribed to real-time events for agent [${agentId}]`,
		)
	}

	/**
	 * Unsubscribes a client WS connection.
	 */
	public unsubscribe(
		agentId: string,
		ws: { send: (msg: string) => void },
	): void {
		const agentSubscribers = this.subscribers.get(agentId)
		if (agentSubscribers) {
			agentSubscribers.delete(ws)
			if (agentSubscribers.size === 0) {
				this.subscribers.delete(agentId)
			}
		}
	}

	/**
	 * Broadcasts an event to all subscribers of a specific agent.
	 */
	public broadcast(event: WSEvent): void {
		const agentSubscribers = this.subscribers.get(event.agentId)
		if (!agentSubscribers || agentSubscribers.size === 0) return

		const message = JSON.stringify(event)
		for (const client of agentSubscribers) {
			try {
				client.send(message)
			} catch {
				/* ignore client send errors */
			}
		}
	}
}

export const wsManager = WebSocketManager.getInstance()
