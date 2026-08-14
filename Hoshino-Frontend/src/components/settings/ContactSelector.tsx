import React from "react"

export interface ContactItem {
	jid: string
	pushName: string | null
	phoneNumber: string
}

interface ContactSelectorProps {
	contacts: ContactItem[]
	onSelectJid: (jid: string) => void
	themeColor?: string
}

export const ContactSelector: React.FC<ContactSelectorProps> = ({
	contacts,
	onSelectJid,
	themeColor = "var(--primary-cyan)",
}) => {
	if (contacts.length === 0) return null

	return (
		<div>
			<label style={{ display: "block", fontSize: "0.75rem", color: themeColor, marginBottom: "4px" }}>
				📋 Select from Saved Contacts (Optional)
			</label>
			<select
				onChange={(e) => {
					if (e.target.value) onSelectJid(e.target.value)
				}}
				style={{
					width: "100%",
					background: "rgba(0, 242, 254, 0.05)",
					border: "1px solid rgba(0, 242, 254, 0.3)",
					borderRadius: "8px",
					padding: "8px 12px",
					fontSize: "0.85rem",
					color: themeColor,
				}}
			>
				<option value="">-- Select Saved Contact --</option>
				{contacts.map((c) => (
					<option key={c.jid} value={c.jid}>
						{c.pushName ? `${c.pushName} (${c.phoneNumber})` : c.jid}
					</option>
				))}
			</select>
		</div>
	)
}
