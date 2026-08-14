import React, { useState } from "react"
import { Search } from "lucide-react"

export interface CommandToggleItem {
	name: string
	aliases: string[]
	category: string
	description?: string
	access: string
	needAdminRegisterThisCommand: boolean
	status: "enabled" | "disabled"
}

interface CommandTogglesTabProps {
	commands: CommandToggleItem[]
	onToggleCommand: (name: string, status: "enabled" | "disabled") => Promise<void>
}

export const CommandTogglesTab: React.FC<CommandTogglesTabProps> = ({
	commands,
	onToggleCommand,
}) => {
	const [cmdSearch, setCmdSearch] = useState("")

	const filteredCommands = commands.filter(
		(c) =>
			c.name.toLowerCase().includes(cmdSearch.toLowerCase()) ||
			c.category.toLowerCase().includes(cmdSearch.toLowerCase()) ||
			c.description?.toLowerCase().includes(cmdSearch.toLowerCase()),
	)

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
			<div style={{ position: "relative" }}>
				<Search size={16} color="var(--text-muted)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
				<input
					type="text"
					value={cmdSearch}
					onChange={(e) => setCmdSearch(e.target.value)}
					placeholder="Search commands by name or category..."
					style={{
						width: "100%",
						background: "rgba(0, 0, 0, 0.3)",
						border: "1px solid var(--border-color)",
						borderRadius: "10px",
						padding: "8px 12px 8px 36px",
						fontSize: "0.85rem",
						color: "var(--text-main)",
					}}
				/>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
				{filteredCommands.length === 0 ? (
					<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
						No commands match your search query.
					</p>
				) : (
					filteredCommands.map((cmd) => (
						<div
							key={cmd.name}
							style={{
								padding: "12px 16px",
								background: "rgba(255, 255, 255, 0.02)",
								border: "1px solid var(--border-color)",
								borderRadius: "10px",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: "12px",
							}}
						>
							<div>
								<div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
									<span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#22d3ee" }}>
										.{cmd.name}
									</span>
									{cmd.aliases.length > 0 && (
										<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
											({cmd.aliases.map((a) => `.${a}`).join(", ")})
										</span>
									)}
									<span
										style={{
											fontSize: "0.65rem",
											fontWeight: 700,
											textTransform: "uppercase",
											padding: "2px 6px",
											borderRadius: "4px",
											background: "rgba(6, 182, 212, 0.15)",
											color: "#22d3ee",
											border: "1px solid rgba(6, 182, 212, 0.3)",
										}}
									>
										{cmd.category}
									</span>
									{cmd.needAdminRegisterThisCommand && (
										<span
											style={{
												fontSize: "0.65rem",
												fontWeight: 600,
												padding: "2px 6px",
												borderRadius: "4px",
												background: "rgba(245, 158, 11, 0.15)",
												color: "#fbbf24",
												border: "1px solid rgba(245, 158, 11, 0.3)",
											}}
										>
											Group Reg Required
										</span>
									)}
								</div>
								{cmd.description && (
									<p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
										{cmd.description}
									</p>
								)}
							</div>

							<button
								type="button"
								onClick={() => onToggleCommand(cmd.name, cmd.status)}
								style={{
									padding: "6px 14px",
									fontSize: "0.75rem",
									fontWeight: 600,
									borderRadius: "20px",
									border: "none",
									cursor: "pointer",
									background: cmd.status === "enabled" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
									color: cmd.status === "enabled" ? "#34d399" : "#f87171",
									borderWidth: "1px",
									borderStyle: "solid",
									borderColor: cmd.status === "enabled" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
									transition: "all 0.2s ease",
								}}
							>
								{cmd.status === "enabled" ? "ACTIVE" : "DISABLED"}
							</button>
						</div>
					))
				)}
			</div>
		</div>
	)
}
