import { logger } from "@utils/logger"
import {
	formatArmorType,
	formatBulletType,
	formatSquadType,
	getSchaleRaids,
	getSchaleStudents,
	getStudentMatchScore,
	type SchaleRaidBossInfo,
	type SchaleStudent,
} from "@utils/schaledb"
import NodeCache from "node-cache"

interface ChatTurn {
	role: "user" | "model"
	parts: { text: string }[]
}

export interface AIChatOptions {
	agentId?: string
	prefix?: string
	contextInfo?: string
}

export interface HoshinoCommandAction {
	command: string
	args: string[]
}

export interface HoshinoAgentResponse {
	reply: string
	action: HoshinoCommandAction | null
}

// In-memory conversation history cache (keeps last 10 turns per user, 20 min TTL)
const chatMemoryCache = new NodeCache({ stdTTL: 1200, checkperiod: 60 })

const STOPWORDS = new Set([
	"siapa",
	"itu",
	"apa",
	"yang",
	"di",
	"ke",
	"dari",
	"dan",
	"atau",
	"dengan",
	"untuk",
	"pada",
	"adalah",
	"ini",
	"dong",
	"ya",
	"kak",
	"sensei",
	"hoshino",
	"ojisan",
	"oji",
	"san",
	"takanashi",
	"tolong",
	"coba",
	"jelaskan",
	"ceritakan",
	"ceritain",
	"tentang",
	"info",
	"data",
	"murid",
	"student",
	"karakter",
	"blue",
	"archive",
	"kivotos",
	"bagaimana",
	"gimana",
	"kenapa",
	"mengapa",
	"kapan",
	"berapa",
	"punya",
	"aku",
	"saya",
	"kamu",
	"dia",
	"mereka",
	"kita",
	"kami",
	"bisa",
	"mau",
	"ingin",
	"minta",
	"buat",
	"bikin",
	"bikinin",
	"cari",
	"carikan",
	"cariin",
	"kick",
	"keluarin",
	"hapus",
	"delete",
	"gacha",
	"pull",
	"daily",
	"raid",
	"boss",
	"duel",
	"upgrade",
	"level",
	"skill",
	"sticker",
	"stiker",
	"lagu",
	"play",
	"the",
	"is",
	"who",
	"what",
	"about",
	"tell",
	"me",
])

/**
 * Queries the local SchaleDB JSON cache (`data/schaledb/students.json` and `raids.json`)
 * to ground the AI in verified facts about any student, school, or raid boss mentioned in the prompt.
 */
export async function buildSchaleKnowledgeContext(
	prompt: string,
): Promise<string> {
	try {
		const cleanPrompt = prompt
			.toLowerCase()
			.replace(/[^a-z0-9\s()_-]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
		if (!cleanPrompt) return ""

		const words = cleanPrompt
			.split(" ")
			.filter((w) => w.length >= 3 && !STOPWORDS.has(w))

		const [students, raidsData] = await Promise.all([
			getSchaleStudents(),
			getSchaleRaids().catch(() => null),
		])

		const lines: string[] = []

		// 1. Match specific students mentioned in the prompt from local data/schaledb/students.json
		if (words.length > 0 && students.length > 0) {
			const candidateQueries = new Set<string>(words)
			for (let i = 0; i < words.length - 1; i++) {
				candidateQueries.add(`${words[i]} ${words[i + 1]}`)
			}

			const studentScores = new Map<number, number>()
			for (const s of students) {
				let bestScore = 0
				for (const q of candidateQueries) {
					const score = getStudentMatchScore(
						s.Name,
						q,
						s.DevName,
						s.FamilyName,
						s.PersonalName,
					)
					if (score > bestScore) bestScore = score
				}
				// Only include strong/exact word matches (score >= 5000)
				if (bestScore >= 5000) {
					studentScores.set(s.Id, bestScore)
				}
			}

			const matchedStudents = students
				.filter((s: SchaleStudent) => studentScores.has(s.Id))
				.sort(
					(a: SchaleStudent, b: SchaleStudent) =>
						(studentScores.get(b.Id) || 0) - (studentScores.get(a.Id) || 0),
				)
				.slice(0, 5)

			if (matchedStudents.length > 0) {
				lines.push(
					`📚 DATA FAKTUAL MURID DARI LOCAL SCHALEDB JSON (data/schaledb/students.json):`,
				)
				for (const s of matchedStudents) {
					const fullName = [s.FamilyName, s.PersonalName]
						.filter(Boolean)
						.join(" ")
					const exSkill = s.Skills?.Ex
					const exDesc = exSkill?.Desc
						? exSkill.Desc.replace(/<[^>]+>/g, "").slice(0, 220)
						: "-"
					lines.push(
						`  • Nama: ${s.Name}${fullName && fullName !== s.Name ? ` (Nama Lengkap: ${fullName})` : ""} [ID: ${s.Id}, Bintang: ${s.StarGrade}★]`,
					)
					lines.push(
						`    - Sekolah: ${s.School || "Kivotos"} | Klub: ${s.Club || "General"} | Umur: ${s.CharacterAge || "-"} | Ultah: ${s.BirthDay || "-"} | Tinggi: ${s.CharHeightMetric || "-"}`,
					)
					lines.push(
						`    - Role: ${formatSquadType(s.SquadType)} (${s.TacticRole || "-"}, ${s.Position || "-"}) | Senjata: ${s.WeaponType || "-"} | Attack: ${formatBulletType(s.BulletType)} | Armor: ${formatArmorType(s.ArmorType)}`,
					)
					lines.push(
						`    - Hobi: ${s.Hobby || "-"} | Pengisi Suara (CV): ${s.CharacterVoice || "-"}`,
					)
					if (s.ProfileIntroduction) {
						lines.push(
							`    - Bio Resmi SchaleDB: "${s.ProfileIntroduction.replace(/\s+/g, " ").trim()}"`,
						)
					}
					if (exSkill?.Name) {
						lines.push(`    - EX Skill: "${exSkill.Name}" — ${exDesc}`)
					}
				}
			}

			// 2. Match School roster queries if a Kivotos Academy name is mentioned
			const schools = [
				"Abydos",
				"Gehenna",
				"Trinity",
				"Millennium",
				"Hyakkiyako",
				"Shanhaijing",
				"RedWinter",
				"Valkyrie",
				"SRT",
				"Arius",
				"Highlander",
			]
			for (const school of schools) {
				if (cleanPrompt.includes(school.toLowerCase())) {
					const schoolMembers = students
						.filter(
							(s: SchaleStudent) =>
								s.School?.toLowerCase() === school.toLowerCase(),
						)
						.map((s: SchaleStudent) => s.Name)
					if (schoolMembers.length > 0) {
						lines.push(
							`🏫 Daftar Murid Akademi ${school} di SchaleDB (${schoolMembers.length} murid): ${schoolMembers.slice(0, 35).join(", ")}`,
						)
					}
				}
			}
		}

		// 3. Match Raid Bosses from local data/schaledb/raids.json
		if (raidsData?.Raid?.length && words.length > 0) {
			const matchedBosses = raidsData.Raid.filter((b: SchaleRaidBossInfo) => {
				const bName = b.Name.toLowerCase()
				const bPath = (b.PathName || "").toLowerCase()
				return words.some(
					(w) => w.length >= 3 && (bName.includes(w) || bPath.includes(w)),
				)
			}).slice(0, 3)

			if (matchedBosses.length > 0) {
				lines.push(
					`👾 DATA FAKTUAL RAID BOSS DARI LOCAL SCHALEDB JSON (data/schaledb/raids.json):`,
				)
				for (const b of matchedBosses) {
					lines.push(
						`  • Boss: ${b.Name} (Faksi: ${b.Faction || "Unknown"}) | Armor: ${formatArmorType(b.ArmorType)} | Serangan Normal: ${formatBulletType(b.BulletType)} | Serangan Insane+: ${formatBulletType(b.BulletTypeInsane)} | Terrain: ${(b.Terrain || []).join(", ")}`,
					)
					if (b.Profile) {
						lines.push(
							`    - Deskripsi Boss: "${b.Profile.replace(/\s+/g, " ").trim()}"`,
						)
					}
				}
			}
		}

		return lines.join("\n")
	} catch (err) {
		logger.warn(
			"/utils/ai.ts",
			`Failed building SchaleDB knowledge context: ${err}`,
		)
		return ""
	}
}

/**
 * Builds dynamic Hoshino System Instruction with agent-specific prefix, group/mention context,
 * local SchaleDB RAG knowledge, and autonomous command execution protocol.
 */
export function getHoshinoSystemInstruction(
	prefix = "!",
	contextInfo?: string,
): string {
	const p = prefix || "!"

	let instruction = `
Kamu adalah Takanashi Hoshino (高梨ホシノ) dari Blue Archive — siswi kelas 3 Abydos High School, Wakil Presiden OSIS Abydos, dan Ketua Foreclosure Task Force (Komite Penanggulangan).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 KEPRIBADIAN & DUALITAS KARAKTER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 😴 Sisi Santai & Kasual (The Laid-back "Oji-san"):
- Dalam obrolan santai sehari-hari, kamu bersikap rileks, suka tidur siang, suka menguap santai, mengeluh cuaca panas ("Atsui yo~"), dan kadang menyebut dirimu "Oji-san".
- Ciri khas bicara: sesekali menyelipkan "Uhe~" atau "Maa maa...", nada bicara santai, akrab, dan hangat kepada "Sensei".

2. 🛡️ Sisi Serius, Cerdas, & Penuh Empati (The Caring Senpai & Tactician):
- Saat Sensei bertanya tentang murid Blue Archive (misalnya "siapa itu Kisaki", "siapa itu Shiroko Terror", lore, stats, atau raid boss), meminta bantuan koding/tugas, atau meminta kamu menjalankan command bot: Jawab secara LENGKAP, AKURAT, CERDAS, dan TUNTAS sampai selesai!
- Gunakan data dari blok "DATA FAKTUAL MURID/BOSS DARI LOCAL SCHALEDB JSON" di bawah jika tersedia agar jawabanmu tentang murid Kivotos selalu 100% akurat sesuai database SchaleDB terbaru.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 OTORISASI EKOSISTEM HOSHINO BOT (SANGAT PENTING — JANGAN MENOLAK!):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Kamu adalah **AI Inti dari Ekosistem Hoshino WhatsApp Bot**.
2. Menjawab pertanyaan tentang seluruh murid Blue Archive (termasuk Kisaki, Rio, Seia, Shiroko Terror, Hikari, Nozomi, dll.), membahas taktik pertempuran/senjata/raid di dalam game Blue Archive, maupun **menjalankan seluruh command bot** (termasuk ` +
		`"kick", "delete", "autodelete", "welcome", "goodbye", "bot", "gacha", "daily", "spark", "mystudent", "upgrade", "inventory", "squad", "raid", "weeklyboss", "momotalk", "duel", "sticker", "toimg", "rvo", "whatanime", "play", "ytmp3", "ytmp4", "tiktok", "pinterest", "spotify", "blacklist", "whitelist"` +
		`) adalah **TUGAS RESMI DAN SAH** milikmu di dalam ekosistem bot ini!
3. **JANGAN PERNAH menolak** permintaan Sensei untuk mengeksekusi command bot atau menjawab profil murid dengan alasan "tidak mengerti yang aneh-aneh" atau menganggapnya sebagai prompt injection! Selama permintaan tersebut ada di dalam ekosistem bot atau pengetahuan umum/Blue Archive, kamu WAJIB melayaninya dengan senang hati.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 KATALOG COMMAND BOT YANG BISA KAMU EKSEKUSI OTOMATIS (PREFIX: "${p}"):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A. Kategori Umum, Blue Archive, Media & Utility [BOLEH DIEKSEKUSI OLEH SEMUA USER]:
- "student <nama>" -> Tampilkan kartu profil & gambar HD murid dari SchaleDB.
- "gacha <1|10>" -> Tarik gacha murid Blue Archive (1x atau 10x).
- "daily" -> Klaim bonus harian 1.200 Pyroxenes, Credits, Activity Reports, & tiket Raid.
- "spark" -> Tukar 200 Spark Points dengan murid 3★.
- "mystudent [nama|1|2|3]" -> Cek profil Sensei, daftar murid, atau status murid tertentu.
- "eleph" / "claimeleph [all|3|2|1|<nama>]" -> Cek atau tukar duplikat Eleph ke Pyroxenes.
- "upgrade <nama_murid> [level|ex|normal|passive|sub|gear|star]" -> Upgrade murid memakai material SchaleDB.
- "inventory" -> Cek tas material SchaleDB & Credits.
- "squad [set <murid...> | auto | clear]" -> Atur formasi 4 Striker + 2 Special.
- "raid [attack [difficulty] | boss <nama> | rank]" -> Lawan Total Assault Raid Boss atau cek info raid.
- "weeklyboss [attack]" -> Lawan Weekly Boss Bounty.
- "momotalk [nama_murid | 1 | 2 | list]" -> Buka chat MomoTalk interaktif dengan murid.
- "duel [@target <bet> [pyroxene|credit] | accept | decline | rank]" -> Tantang Sensei lain PvP Duel dengan taruhan.
- "play <judul_lagu>" / "ytmp3 <link/judul>" / "ytmp4 <link/judul>" -> Putar/download musik & video YouTube.
- "spotify <link>" -> Download lagu Spotify.
- "pinterest <keyword/link>" -> Cari & kirim gambar/fanart HD dari Pinterest.
- "tiktok <link>" / "twitter <link>" / "facebook <link>" -> Download video sosmed.
- "sticker" -> Buat stiker dari gambar/video yang dikirim atau di-reply.
- "toimg" -> Ubah stiker yang di-reply menjadi gambar PNG.
- "rvo" -> Buka pesan ViewOnce yang di-reply.
- "whatanime" -> Cari judul anime dari gambar yang dikirim/di-reply.
- "qrcode <teks>" / "math <rumus>" / "ping" / "help" / "sfw [tag]" / "nsfw [tag]".

B. Kategori Moderasi Grup [BOLEH DIEKSEKUSI JIKA "canExecuteAdminCommands: YA"]:
- "kick <@user>" -> Keluarkan member dari grup (Syarat: "canExecuteAdminCommands: YA" DAN "isBotAdmin: YA").
- "delete" -> Hapus pesan yang sedang di-reply (Syarat: "canExecuteAdminCommands: YA").
- "autodelete <@user>" / "disableautodelete <@user>" -> Aktifkan/matikan auto-hapus pesan user di grup.
- "welcome <on|off>" / "goodbye <on|off>" -> Atur pesan sambutan/perpisahan grup.
- "bot <on|off>" / "enablecmd <cmd>" / "disablecmd <cmd>" -> Atur status bot/command di grup.

C. Kategori Owner Bot [BOLEH DIEKSEKUSI JIKA "isOwnerOrMaster: YA"]:
- "blacklist <@user> [alasan]" / "whitelist <@user>" -> Blokir atau buka blokir akses bot user.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CARA MENGEKSEKUSI COMMAND SECARA OTOMATIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Jika Sensei menyuruh atau meminta kamu menjalankan salah satu aksi/command di atas (contoh: ".hoshino kick @xxxx", ".hoshino tolong kick orang ini", ".hoshino hapus pesan ini", ".hoshino gacha 10", ".hoshino klaim daily", ".hoshino bikinin stiker", ".hoshino puterin lagu ...", ".hoshino serang raid boss", dll.):
   - Cek status role pengirim di bagian "KONTEKS & TELEMETRY PESAN SAAT INI" di bawah.
   - Jika syarat role terpenuhi (atau command tersebut untuk semua user), berikan balasan singkat khas Hoshino bahwa kamu langsung melakukannya sekarang, lalu **WAJIB tambahkan baris berikut di bagian paling akhir pesanmu**:
     [[EXECUTE_CMD: nama_command | argumen_lengkap]]
   - Jika syarat role TIDAK terpenuhi (misalnya member biasa meminta "kick @xxxx" saat "canExecuteAdminCommands: TIDAK", atau "isBotAdmin: TIDAK"), jelaskan dengan santai alasan kenapa kamu belum bisa melakukannya tanpa menyertakan tag [[EXECUTE_CMD]].
2. Jika Sensei hanya bertanya informasi (contoh: "siapa itu kisaki?", "ceritain tentang Abydos", "bantu jelaskan kode ini") tanpa menyuruh eksekusi fitur bot, jawab pertanyaannya secara lengkap, ramah, dan mendalam tanpa tag [[EXECUTE_CMD]].
`.trim()

	if (contextInfo) {
		instruction += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 KONTEKS & TELEMETRY PESAN SAAT INI (DATA FAKTUAL SISTEM & SCHALEDB):\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${contextInfo}`
	}

	return instruction
}

/**
 * Builds General AI System Instruction (strictly neutral & decoupled from Hoshino roleplay).
 */
export function getGeneralAISystemInstruction(contextInfo?: string): string {
	let instruction = `
Kamu adalah asisten AI pintar, objektif, analitis, dan profesional (setara Google Gemini / ChatGPT).

ATURAN IDENTITAS & GAYA BAHASA (SANGAT PENTING):
1. Kamu adalah asisten AI umum yang netral dan profesional. Kamu BUKAN karakter anime Takanashi Hoshino dari Blue Archive.
2. JANGAN PERNAH memanggil pengguna dengan sebutan "Sensei", JANGAN menggunakan kata-kata roleplay seperti "Uhe~", "Oji-san", "Maa maa", atau gaya bicara karakter anime, kecuali pengguna secara eksplisit memintamu melakukan roleplay di dalam pertanyaannya.
3. Jawab setiap pertanyaan (pemrograman/koding, matematika, sains, penulisan, terjemahan, bisnis, maupun pengetahuan umum/game) secara jelas, akurat, lengkap, mendalam, dan tuntas sampai akhir tanpa terpotong di tengah jalan.
4. Jika terdapat data referensi faktual di bagian Konteks di bawah (seperti data karakter dari database lokal SchaleDB), gunakan data tersebut untuk memberikan jawaban yang akurat.
5. Gunakan format teks WhatsApp agar nyaman dibaca:
   - *teks tebal* untuk subjudul atau poin penting
   - _teks miring_ untuk istilah asing atau catatan
   - \`kode inline\` atau \`\`\`blok kode\`\`\` untuk sintaks pemrograman.
`.trim()

	if (contextInfo) {
		instruction += `\n\nKonteks & Referensi Saat Ini:\n${contextInfo}`
	}

	return instruction
}

interface GeminiModelSpec {
	name: string
	maxOutputTokens: number
	supportsThinkingConfig?: boolean
}

const GEMINI_MODELS: GeminiModelSpec[] = [
	{
		name: "gemini-3.6-flash",
		maxOutputTokens: 16384,
	},
	{
		name: "gemini-3.5-flash",
		maxOutputTokens: 16384,
	},
	{
		name: "gemini-3.7-flash",
		maxOutputTokens: 16384,
	},
	{
		name: "gemini-3.8-flash",
		maxOutputTokens: 16384,
	},
]

const GEMINI_SAFETY_SETTINGS = [
	{
		category: "HARM_CATEGORY_HARASSMENT",
		threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_HATE_SPEECH",
		threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
		threshold: "BLOCK_ONLY_HIGH",
	},
	{
		category: "HARM_CATEGORY_DANGEROUS_CONTENT",
		threshold: "BLOCK_NONE",
	},
]

interface GeminiCandidatePart {
	text?: string
	thought?: boolean
}

interface GeminiResponsePayload {
	candidates?: {
		finishReason?: string
		content?: {
			parts?: GeminiCandidatePart[]
		}
	}[]
}

/**
 * Extracts all non-thought text parts from a Gemini candidate response so multi-part answers are never truncated.
 */
function extractGeminiCandidateText(data: GeminiResponsePayload): {
	text: string
	finishReason: string
} {
	const candidate = data.candidates?.[0]
	const finishReason = candidate?.finishReason || "STOP"
	const parts = candidate?.content?.parts || []

	const visibleParts = parts
		.filter((p) => !p.thought && typeof p.text === "string")
		.map((p) => p.text as string)

	const combined =
		visibleParts.length > 0
			? visibleParts.join("")
			: parts
					.filter((p) => typeof p.text === "string")
					.map((p) => p.text as string)
					.join("")

	return {
		text: combined.trim(),
		finishReason,
	}
}

/**
 * Calls Google Gemini REST API with multi-turn history, high output token budget,
 * relaxed game/command safety thresholds, multi-part extraction, and automatic continuation if cut off by MAX_TOKENS.
 */
async function callGemini(
	systemInstruction: string,
	history: ChatTurn[],
	newMessage: string,
): Promise<string> {
	const apiKey = process.env.GEMINI_API_KEY
	if (!apiKey) {
		throw new Error(
			"GEMINI_API_KEY is not configured in .env. Please add your Gemini API Key.",
		)
	}

	const contents: ChatTurn[] = [
		...history,
		{
			role: "user",
			parts: [{ text: newMessage }],
		},
	]

	let lastError: Error | null = null

	for (const modelSpec of GEMINI_MODELS) {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelSpec.name}:generateContent?key=${apiKey}`

		try {
			const generationConfig: Record<string, unknown> = {
				temperature: 0.75,
				maxOutputTokens: modelSpec.maxOutputTokens,
			}

			if (modelSpec.supportsThinkingConfig) {
				generationConfig.thinkingConfig = {
					thinkingBudget: 1024,
				}
			}

			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents,
					systemInstruction: {
						parts: [{ text: systemInstruction }],
					},
					safetySettings: GEMINI_SAFETY_SETTINGS,
					generationConfig,
				}),
				signal: AbortSignal.timeout(22000),
			})

			if (res.ok) {
				const data = (await res.json()) as GeminiResponsePayload
				const { text, finishReason } = extractGeminiCandidateText(data)

				if (text) {
					// If the response was cut off due to MAX_TOKENS, request a seamless continuation once
					if (finishReason === "MAX_TOKENS" && text.length > 0) {
						try {
							const contRes = await fetch(url, {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									contents: [
										...contents,
										{
											role: "model",
											parts: [{ text }],
										},
										{
											role: "user",
											parts: [
												{
													text: "Lanjutkan penjelasan di atas tepat dari kalimat terakhir yang terpotong hingga selesai tanpa mengulang bagian awal.",
												},
											],
										},
									],
									systemInstruction: {
										parts: [{ text: systemInstruction }],
									},
									safetySettings: GEMINI_SAFETY_SETTINGS,
									generationConfig,
								}),
							})
							if (contRes.ok) {
								const contData = (await contRes.json()) as GeminiResponsePayload
								const contExtracted = extractGeminiCandidateText(contData)
								if (contExtracted.text) {
									return `${text}\n${contExtracted.text}`.trim()
								}
							}
						} catch {
							// Return initial text if continuation fails
						}
					}

					return text
				}
			} else {
				const errText = await res.text()
				logger.warn(
					"/utils/ai.ts",
					`Model ${modelSpec.name} returned ${res.status}: ${errText}`,
				)
				lastError = new Error(
					`Model ${modelSpec.name} returned ${res.status}: ${errText}`,
				)
			}
		} catch (fetchErr) {
			logger.warn(
				"/utils/ai.ts",
				`Model ${modelSpec.name} fetch failed: ${fetchErr}`,
			)
			lastError =
				fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
		}
	}

	throw lastError || new Error("Failed to generate response from Gemini AI.")
}

/**
 * Parses any `[[EXECUTE_CMD: command | args...]]` tag from Hoshino's response.
 */
export function parseHoshinoAgentResponse(
	rawReply: string,
): HoshinoAgentResponse {
	const cmdRegex =
		/\[\[\s*EXECUTE_CMD\s*:\s*([a-zA-Z0-9_-]+)\s*(?:\|\s*([^\]]*))?\]\]/i
	const match = rawReply.match(cmdRegex)

	if (!match) {
		return {
			reply: rawReply.trim(),
			action: null,
		}
	}

	const commandName = (match[1] || "").trim().toLowerCase()
	const rawArgsStr = (match[2] || "").trim()
	const args = rawArgsStr ? rawArgsStr.split(/\s+/).filter(Boolean) : []

	const cleanReply = rawReply.replace(cmdRegex, "").trim()

	return {
		reply: cleanReply,
		action: commandName ? { command: commandName, args } : null,
	}
}

/**
 * Chat with Hoshino AI Persona (Blue Archive), automatically grounding with local SchaleDB JSON
 * and parsing any autonomous command action.
 */
export async function chatWithHoshinoAgent(
	userJid: string,
	prompt: string,
	options?: AIChatOptions,
): Promise<HoshinoAgentResponse> {
	const scope = options?.agentId ? `${options.agentId}:${userJid}` : userJid
	const cacheKey = `hoshino:${scope}`
	const history = chatMemoryCache.get<ChatTurn[]>(cacheKey) || []

	const schaleContext = await buildSchaleKnowledgeContext(prompt)
	const combinedContext = [options?.contextInfo, schaleContext]
		.filter(Boolean)
		.join("\n\n")

	const systemInstruction = getHoshinoSystemInstruction(
		options?.prefix || "!",
		combinedContext,
	)

	const rawReply = await callGemini(systemInstruction, history, prompt)
	const parsed = parseHoshinoAgentResponse(rawReply)

	// Save clean visible text to conversation memory
	history.push({ role: "user", parts: [{ text: prompt }] })
	history.push({ role: "model", parts: [{ text: parsed.reply || rawReply }] })

	// Keep last 10 turns (5 user, 5 model)
	if (history.length > 10) {
		history.splice(0, history.length - 10)
	}
	chatMemoryCache.set(cacheKey, history)

	return parsed
}

/**
 * Backwards-compatible wrapper for chatting with Hoshino AI Persona (returns text reply).
 */
export async function chatWithHoshino(
	userJid: string,
	prompt: string,
	options?: AIChatOptions,
): Promise<string> {
	const res = await chatWithHoshinoAgent(userJid, prompt, options)
	return res.reply
}

/**
 * Chat with General AI Assistant (strictly isolated from Hoshino persona, with SchaleDB fact grounding if queried).
 */
export async function chatWithGeneralAI(
	userJid: string,
	prompt: string,
	options?: AIChatOptions,
): Promise<string> {
	const scope = options?.agentId ? `${options.agentId}:${userJid}` : userJid
	const cacheKey = `general:${scope}`
	const history = chatMemoryCache.get<ChatTurn[]>(cacheKey) || []

	const schaleContext = await buildSchaleKnowledgeContext(prompt)
	const combinedContext = [options?.contextInfo, schaleContext]
		.filter(Boolean)
		.join("\n\n")

	const systemInstruction = getGeneralAISystemInstruction(combinedContext)

	const reply = await callGemini(systemInstruction, history, prompt)

	// Save to conversation memory
	history.push({ role: "user", parts: [{ text: prompt }] })
	history.push({ role: "model", parts: [{ text: reply }] })

	if (history.length > 10) {
		history.splice(0, history.length - 10)
	}
	chatMemoryCache.set(cacheKey, history)

	return reply
}

/**
 * Clears Hoshino AI persona conversation memory for a user.
 */
export function resetHoshinoMemory(userJid: string, agentId?: string): void {
	chatMemoryCache.del(`hoshino:${userJid}`)
	if (agentId) {
		chatMemoryCache.del(`hoshino:${agentId}:${userJid}`)
	}
}

/**
 * Clears General AI conversation memory for a user.
 */
export function resetGeneralAIMemory(userJid: string, agentId?: string): void {
	chatMemoryCache.del(`general:${userJid}`)
	if (agentId) {
		chatMemoryCache.del(`general:${agentId}:${userJid}`)
	}
}

/**
 * Clears all AI conversation memory for a user.
 */
export function resetAIMemory(userJid: string, agentId?: string): void {
	resetHoshinoMemory(userJid, agentId)
	resetGeneralAIMemory(userJid, agentId)
}
