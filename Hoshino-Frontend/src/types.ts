export type AgentStatus =
	| "connecting"
	| "connected"
	| "disconnected"
	| "qr_code"
	| "pairing_code"

export interface Agent {
	agentId: string
	name: string
	phoneNumber?: string
	status: AgentStatus
	pairingCode?: string
	qrCode?: string
	createdAt?: string
	updatedAt?: string
}

export interface ApiResponse<T> {
	success: boolean
	data?: T
	message?: string
}

export type MessageType =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "sticker"
	| "document"
	| "location"
	| "contact"
	| "reaction"
	| "other"

export interface ChatMessage {
	id: string
	agentId: string
	jid: string
	fromMe: boolean
	sender?: string | null
	pushName?: string | null
	messageType: MessageType
	content: Record<string, unknown>
	status: "sending" | "sent" | "delivered" | "read" | "received" | "failed"
	timestamp: string
}

export interface ChatSummary {
	agentId: string
	jid: string
	name?: string | null
	unreadCount: number
	lastMessageAt: string
	createdAt?: string
	updatedAt?: string
}

export interface WSEvent {
	type: "message_new" | "status_change" | "qr_update"
	agentId: string
	payload: unknown
}

export interface SenseiProfileItem {
	agentId: string
	userJid: string
	pushName?: string
	pyroxenes: number
	sparkPoints: number
	totalPulls: number
	totalStudents?: number
	totalBonds?: number
	highestBondLevel?: number
	lastDaily?: string | null
	createdAt?: string
	updatedAt?: string
}

export interface SenseiStudentItem {
	agentId: string
	userJid: string
	studentId: number
	studentName: string
	starGrade: number
	count: number
	firstObtainedAt: string
}

export interface SenseiBondItem {
	agentId: string
	userJid: string
	studentId: number
	studentName: string
	bondLevel: number
	bondExp: number
	totalTalks: number
	lastTalk: string
}

export interface ElephSummaryItem {
	studentId: number
	studentName: string
	starGrade: number
	count: number
	duplicateCount: number
	elephCount: number
	pyroxeneValue: number
}

export interface ElephSummary {
	totalDuplicates: number
	totalEleph: number
	totalPyroxenes: number
	studentsWithEleph: ElephSummaryItem[]
	breakdown: {
		threeStar: { duplicates: number; eleph: number; pyroxenes: number }
		twoStar: { duplicates: number; eleph: number; pyroxenes: number }
		oneStar: { duplicates: number; eleph: number; pyroxenes: number }
	}
}

export interface ClaimElephResult {
	success: boolean
	claimedStudents: number
	claimedDuplicates: number
	claimedEleph: number
	pyroxenesGained: number
}


export interface AgentGeneralSettings {
	prefix: string
	welcomeMessage?: string | null
	goodbyeMessage?: string | null
	autoRead: boolean
	typingIndicator: boolean
}

export interface GroupCommandItem {
	name: string
	aliases: string[]
	category: string
	description?: string
	access: string
	needAdminRegisterThisCommand: boolean
	globalStatus: "enabled" | "disabled"
	status: "enabled" | "disabled"
	isCustomized: boolean
}

export interface DatabaseSettings {
	id: string
	autoPruneEnabled: boolean
	retentionDays: number
	maxMessagesPerChat: number
	cleanMediaBloat: boolean
	autoCleanLogsEnabled?: boolean
	logRetentionDays?: number
	lastPrunedAt: string | null
	updatedAt: string
}

export interface TableStat {
	tableSchema: string
	tableName: string
	totalSize: string
	tableSize: string
	indexSize: string
	rowCount: number
	rawSize: number
}

export interface LogFileInfo {
	filename: string
	filePath: string
	date: string
	sizeBytes: number
	size: string
	modifiedAt: string
	isCurrent: boolean
}

export interface LogStats {
	totalFiles: number
	totalSizeBytes: number
	totalSize: string
	logDirs: string[]
	files: LogFileInfo[]
}

export interface FlushLogsResult {
	deletedFiles: number
	freedBytes: number
	freedSize: string
	remainingFiles: number
}

export interface DatabaseStats {
	databaseName: string
	totalSize: string
	totalSizeBytes: number
	messagesCount: number
	chatsCount: number
	authKeysCount: number
	mediaBloatCount: number
	tables: TableStat[]
	settings: DatabaseSettings
	logsStats?: LogStats
}

export interface DatabaseCleanResult {
	deletedMessages: number
	strippedMedia: number
	remainingMessages: number
	durationMs: number
}

export interface DatabaseVacuumResult {
	success: boolean
	durationMs: number
	message: string
}


