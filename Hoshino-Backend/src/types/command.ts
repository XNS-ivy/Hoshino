import type {
	AnyMessageContent,
	GroupMetadata,
	WAMessage,
	WASocket,
} from "baileys"

export type MessageKind =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "document"
	| "sticker"
	| "other"

export interface ParsedQuotedMessage {
	key: WAMessage["key"]
	message: WAMessage["message"]
	rawQuoted?: WAMessage["message"] | WAMessage
	senderJid: string
	text?: string | null
	caption?: string | null
	getMediaBuffer?: () => Promise<Buffer | null>
}

export interface CommandContext {
	// 1. Instant / Zero-Cost In-Memory Fields (0ms)
	agentId: string
	sock: WASocket
	rawMsg: WAMessage
	jid: string
	senderJid: string
	pushName?: string
	isGroup: boolean
	body: string
	prefix: string
	commandName: string
	args: string[]
	messageType: MessageKind

	// 2. Fast Shortcut Helpers
	reply: (content: string | AnyMessageContent) => Promise<WAMessage>

	// 3. High-Performance Lazy Resolvers (Executes ONLY when accessed)
	getOwnerRole: () => Promise<"master" | "owner" | null>
	getGroupMetadata: () => Promise<GroupMetadata | null>
	getSenderAdminStatus: () => Promise<{ isAdmin: boolean; isBotAdmin: boolean }>
	getQuotedMessage: () => Promise<ParsedQuotedMessage | null>
	getMediaBuffer: () => Promise<Buffer | null>
	getGroupInviteCode: () => Promise<string | null>
	getProfilePicUrl: (targetJid?: string) => Promise<string | null>
	getMentions: () => Promise<string[]>
	getBusinessProfile: (targetJid?: string) => Promise<unknown | null>
	getNewsletterMetadata: (channelJid: string) => Promise<unknown | null>
	getPollVotes: () => Promise<unknown | null>
}

export interface ICommand {
	name: string | string[]
	category?: string
	description?: string
	access?: "user" | "owner" | "master"
	inGroup?: boolean
	inGroupAccess?: "admin" | "member"
	botAdminRequired?: boolean
	needAdminRegisterThisCommand?: boolean
	textOnly?: boolean
	allowedMediaTypes?: MessageKind[]
	usage?: string[]
	cooldown?: number
	execute: (args: string[], ctx: CommandContext) => Promise<void> | void
}
