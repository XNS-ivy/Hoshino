import React, { useEffect, useRef } from "react"
import type { ChatMessage } from "../../types"
import { ChatMessageBubble } from "./ChatMessageBubble"

interface ChatMessageListProps {
	messages: ChatMessage[]
	isLoading: boolean
	onReplyTo: (msg: ChatMessage) => void
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
	messages,
	isLoading,
	onReplyTo,
}) => {
	const messagesEndRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [])

	if (isLoading) {
		return (
			<p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px" }}>
				Loading chat history...
			</p>
		)
	}

	if (messages.length === 0) {
		return (
			<p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px" }}>
				No message history in this chat.
			</p>
		)
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
			{messages.map((msg) => (
				<ChatMessageBubble key={msg.id} msg={msg} onReplyTo={onReplyTo} />
			))}
			<div ref={messagesEndRef} />
		</div>
	)
}
