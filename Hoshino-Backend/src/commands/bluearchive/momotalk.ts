import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import {
	type MomoDialogue,
	momoRepository,
} from "@repositories/momo.repository"
import { logger } from "@utils/logger"
import {
	getSchaleStudents,
	getStudentImageUrl,
	getStudentMatchScore,
	searchSchaleStudent,
} from "@utils/schaledb"

const MOMO_DIALOGUES: Record<string, MomoDialogue[]> = {
	hoshino: [
		{
			id: "hoshino_1",
			speaker: "Takanashi Hoshino",
			studentId: 10005,
			message:
				"Uhe~ Sensei, kamu lagi sibuk ya?\nCuaca di luar panas banget nih... Oji-san lagi rebahan di bawah pohon dekat ruang OSIS Abydos.\nKalau Sensei senggang, mau nemenin Oji-san tidur siang sebentar nggak?",
			choices: [
				{
					text: "Tentu, geser sedikit Hoshino, aku mau ikut rebahan.",
					reply:
						"Uhe~ gitu dong Sensei! Tempatnya masih muat kok. Sini bantalnya kita bagi dua ya... Selamat tidur siang, Sensei~ zzz...",
					exp: 80,
				},
				{
					text: "Hoshino, jangan malas! Ayo selesaikan dokumen Abydos dulu!",
					reply:
						"Eeeh?! Sensei kejam banget sama orang tua... Tapi ya udah deh, kalau Sensei yang minta, Oji-san bakal bantuin sedikit~",
					exp: 40,
				},
				{
					text: "Aku bawakan es krim dingin rasa soda kesukaanmu!",
					reply:
						"Wah! Es krim soda dingin! Sensei peka banget deh, Oji-san jadi makin sayang sama Sensei~ Terima kasih ya!",
					exp: 100,
				},
			],
		},
		{
			id: "hoshino_2",
			speaker: "Takanashi Hoshino",
			studentId: 10005,
			message:
				"Sensei... terima kasih ya sudah selalu menjaga anak-anak Abydos.\nKadang Oji-san merasa belum jadi senpai yang baik buat mereka, tapi melihat mereka tersenyum karena Sensei, rasanya lega banget.",
			choices: [
				{
					text: "Kamu sudah jadi senpai dan pelindung terhebat buat Abydos, Hoshino.",
					reply:
						"Uhe~ Sensei selalu tahu cara bikin Oji-san tersentuh. Makasih banyak ya, Sensei... aku bakal terus berjuang bersamamu.",
					exp: 100,
				},
				{
					text: "Kita hadapi semua masalah Abydos bersama-sama, oke?",
					reply:
						"Iya, Sensei. Selama ada Sensei di samping kita, Oji-san rasa Abydos pasti akan kembali makmur seperti dulu.",
					exp: 80,
				},
				{
					text: "Sini, aku usap kepalamu biar kamu tenang.",
					reply:
						"Uwah... hangatnya tangan Sensei... rasanya bikin ngantuk lagi... zzz...",
					exp: 90,
				},
			],
		},
	],
	shiroko: [
		{
			id: "shiroko_1",
			speaker: "Sunaookami Shiroko",
			studentId: 10000,
			message:
				"Nn, Sensei. Selamat pagi.\nAku baru saja selesai lari pagi 20 kilometer keliling distrik Abydos.\nSensei mau ikut bersepeda bersamaku sore nanti?",
			choices: [
				{
					text: "Ayo Shiroko! Aku siapkan sepedanya sekarang.",
					reply:
						"Nn! Bagus. Aku sudah siapkan rute terbaik melintasi gurun. Ayo kita kayuh bersama sampai matahari terbenam, Sensei.",
					exp: 90,
				},
				{
					text: "20 KM?! Maaf Shiroko, kakiku bakal patah...",
					reply:
						"Nn, tidak apa-apa. Kalau Sensei lelah, Sensei bisa duduk di boncengan belakang sepedaku. Aku yang kayuh.",
					exp: 100,
				},
				{
					text: "Asal kita tidak mampir merampok bank ya...",
					reply:
						"Nn... sayang sekali. Padahal topeng ski-nya sudah kusiapkan di dalam tas.",
					exp: 60,
				},
			],
		},
	],
	serika: [
		{
			id: "serika_1",
			speaker: "Kuromi Serika",
			studentId: 10003,
			message:
				"Sensei! Kebetulan kamu ada waktu luang nggak?\nRestoran Ramen Master Shiba lagi ramai banget hari ini, dan aku butuh bantuan cuci piring!\nTenang aja, bakal kutraktir semangkuk Chashu Ramen spesial!",
			choices: [
				{
					text: "Siap meluncur, Serika! Demi semangkuk ramen buatanmu.",
					reply:
						"B-bukan buatanku sih, Master Shiba yang masak! Tapi makasih ya Sensei... kamu memang bisa diandalkan... /blush",
					exp: 100,
				},
				{
					text: "Serika rajin banget kerja keras demi bayar utang Abydos.",
					reply:
						"Tentu saja! Siapa lagi yang mau mikirin utang Abydos kalau bukan aku?! Pokoknya Sensei cepat ke sini!",
					exp: 80,
				},
				{
					text: "Boleh elus telinga kucingmu dulu sebelum kerja?",
					reply:
						"H-HAAH?! Jangan sembarangan sentuh telingaku, baka Sensei! Nanti ku-charge ekstra lho!",
					exp: 70,
				},
			],
		},
	],
	nonomi: [
		{
			id: "nonomi_1",
			speaker: "Izayoi Nonomi",
			studentId: 10002,
			message:
				"Yes☆ Sensei~! Selamat siang!\nNonomi baru saja membeli kartu kredit emas edisi terbatas dan ingin mengajak Sensei belanja camilan untuk semua anak Abydos!\nSensei mau temani Nonomi ke mall?",
			choices: [
				{
					text: "Wah senang sekali! Ayo belanja yang banyak, Nonomi.",
					reply:
						"Yeay☆! Nonomi bakal borong semua kue dan minuman kesukaan Sensei! Ayo berangkat pegangan tangan ya~",
					exp: 100,
				},
				{
					text: "Nonomi, hemat uangmu sedikit ya...",
					reply:
						"Ufufu~ jangan khawatir Sensei! Uang jajan Nonomi masih cukup buat beli satu gedung kok☆",
					exp: 70,
				},
				{
					text: "Terima kasih sudah selalu merawat anak-anak Abydos, Nonomi.",
					reply:
						"Ehehe, Nonomi sayang banget sama keluarga Abydos dan Sensei. Nonomi senang bisa berguna untuk kalian☆",
					exp: 95,
				},
			],
		},
	],
	ayane: [
		{
			id: "ayane_1",
			speaker: "Okusora Ayane",
			studentId: 10004,
			message:
				"Sensei... tolong aku...\nLaporan keuangan dan rencana anggaran Abydos menumpuk setinggi gunung di mejaku.\nBisakah Sensei membantuku memeriksa pembukuan ini sebelum senpai-tachi bikin ulah lagi?",
			choices: [
				{
					text: "Tentu Ayane, mari kita selesaikan bersama sambil minum teh hangat.",
					reply:
						"Huu... terima kasih banyak, Sensei! Rasanya tenang sekali kalau ada Sensei yang mendampingi...",
					exp: 100,
				},
				{
					text: "Semangat Ayane! Kamu pilar stabilitas terpenting di Abydos.",
					reply:
						"Ehehe... dipuji seperti itu membuat rasa lelahku langsung hilang. Baiklah, mari kita selesaikan dokumen ini!",
					exp: 90,
				},
				{
					text: "Istirahat dulu sejenak Ayane, jangan memaksakan diri.",
					reply:
						"Sensei benar... mungkin aku butuh rehat 10 menit. Boleh aku bersandar sebentar di bahu Sensei?",
					exp: 95,
				},
			],
		},
	],
	mika: [
		{
			id: "mika_1",
			speaker: "Misono Mika",
			studentId: 10061,
			message:
				"Sensei~☆ Sedang apa? Mika kangen banget nih!\nRuanganku di Trinity sepi banget kalau nggak ada Sensei. Mau main ke sini atau kita jalan-jalan keliling katedral?",
			choices: [
				{
					text: "Tunggu aku, Mika. Aku segera datang ke Trinity sekarang juga.",
					reply:
						"Waaah☆! Beneran kan?! Mika bakal dandan yang cantik dan tunggu Sensei di gerbang katedral ya~ Love you, Sensei!",
					exp: 100,
				},
				{
					text: "Aku bawakan gulali manis rasa strawberry kesukaanmu ya.",
					reply:
						"Sensei selalu tahu apa yang bikin Mika bahagia☆! Cepat ke sini ya Sensei, Mika sudah nggak sabar~",
					exp: 95,
				},
				{
					text: "Mika jangan nakal ya selama di Trinity.",
					reply:
						"Mika selalu jadi anak baik kok kalau ada Sensei☆! Ayo temani Mika seharian penuh hari ini!",
					exp: 80,
				},
			],
		},
	],
	mari: [
		{
			id: "mari_1",
			speaker: "Iochi Mari",
			studentId: 20008,
			message:
				"Sensei, semoga berkat dan kedamaian selalu menyertai Anda hari ini.\n" +
				"Saya melihat lampu di kantor SCHALE masih menyala larut malam kemarin... Apakah Anda tidak memaksakan diri?\n" +
				"Jika ada beban di hati Sensei, pintu katedral Sisterhood selalu terbuka untuk doa dan pengakuan dosa.",
			choices: [
				{
					text: "Terima kasih atas perhatianmu yang tulus, Mari. Aku ingin mendengar doamu.",
					reply:
						"Terima kasih kembali, Sensei... Senyuman Sensei adalah anugerah terbesar bagi saya. Mari kita berdoa bersama untuk kedamaian SCHALE dan Kivotos.",
					exp: 100,
				},
				{
					text: "Mari, telinga kucingmu lucu sekali saat sedang berdoa...",
					reply:
						"U-Uwah... Sensei! Tolong jangan perhatikan telinga saya saat kita sedang membicarakan hal kudus... /blush",
					exp: 85,
				},
				{
					text: "Beban pekerjaanku hilang begitu melihat wajah manismu, Mari.",
					reply:
						"Sensei... kata-kata seperti itu terasa terlalu manis bagi seorang biarawati... tapi hati saya terasa sangat hangat. Terima kasih, Sensei.",
					exp: 95,
				},
			],
		},
		{
			id: "mari_2",
			speaker: "Iochi Mari",
			studentId: 20008,
			message:
				"Sensei, hari ini saya memanggang kue teh chamomile sederhana di biara.\n" +
				"Rasanya menenangkan dan bisa membantu Sensei beristirahat sejenak dari tumpukan berkas dokumen.\n" +
				"Bolehkah saya mengantarkannya ke kantor SCHALE sekarang?",
			choices: [
				{
					text: "Tentu saja Mari! Aku akan siapkan cangkir teh terbaik untukmu.",
					reply:
						"Wah, saya sangat senang mendengarnya! Saya akan segera ke sana dengan langkah hati-hati. Sampai jumpa sebentar lagi, Sensei~",
					exp: 100,
				},
				{
					text: "Kue buatan Mari pasti sangat suci dan lezat.",
					reply:
						"Fufufu, Sensei terlalu memuji. Saya hanya mencampurkan rasa syukur dan doa di setiap potongannya untuk Sensei tercinta.",
					exp: 90,
				},
				{
					text: "Jangan lupa istirahat juga ya, Mari jangan terlalu lelah.",
					reply:
						"Melihat Sensei tersenyum dan bahagia adalah istirahat terbaik bagi jiwa saya. Terima kasih banyak atas perhatian Sensei.",
					exp: 95,
				},
			],
		},
	],
	himari: [
		{
			id: "himari_1",
			speaker: "Akeboshi Himari",
			studentId: 10052,
			message:
				"Sensei, perhatikan baik-baik layar monitormu sekarang.\n" +
				"Bagaimana? Apakah Anda merasakan kehadiran aura memikat dari Gadis Jenius, Cantik, Lemah Lembut, sekaligus Rentan ini di SCHALE?\n" +
				"Saya baru saja mengoptimalkan firewall sistem SCHALE dalam waktu 0,3 detik. Boleh dong Sensei memberikan pujian setinggi langit untuk saya?",
			choices: [
				{
					text: "Luar biasa, Himari! Memang tidak ada yang bisa menandingi kejeniusan dan kecantikanmu.",
					reply:
						"Fufun~ Tentu saja! Memuji bakat alami seorang Super Genius Bishoujo seperti saya adalah kewajiban paling mulia bagi seorang Sensei!",
					exp: 100,
				},
				{
					text: "Gadis rapuh? Tapi Himari selalu paling bersemangat kalau membajak server Millennium...",
					reply:
						"Hmph! Itu bukan membajak, itu adalah 'inspeksi keamanan berkelas tinggi'! Sensei jangan mencemarkan reputasi gadis rapuh ini ya!",
					exp: 80,
				},
				{
					text: "Sini, aku bawakan teh hangat dan selimut lembut untuk kursimu, Himari.",
					reply:
						"E-Eh? Sensei... Anda tahu saja kelemahan fisik saya yang rentan ini... Baik, kali ini saya izinkan Anda menyeduhkannya untuk saya.",
					exp: 95,
				},
			],
		},
		{
			id: "himari_2",
			speaker: "Akeboshi Himari",
			studentId: 10052,
			message:
				"Sensei, cuaca Kivotos hari ini sangat mendukung untuk bersantai.\n" +
				"Saya sedang berada di taman Millennium. Apakah Sensei bersedia mendorong kursi roda saya sambil berkeliling menikmati semilir angin musim semi?",
			choices: [
				{
					text: "Dengan senang hati, Yang Mulia Gadis Jenius Tercantik.",
					reply:
						"Pilihan kata yang sangat anggun dan pantas! Cepat kemari, Sensei. Pemandangan bunga mekar ini harus kita nikmati berdua.",
					exp: 100,
				},
				{
					text: "Aku bawakan kue kering manis untuk teman minum teh kita.",
					reply:
						"Ufufu, koordinasi yang sempurna. Kejeniusan saya dan kehangatan Sensei memang kombinasi terhebat di seluruh Kivotos.",
					exp: 95,
				},
				{
					text: "Awas jangan sampai masuk angin lagi ya, Himari.",
					reply:
						"Tenang saja, selama Sensei ada di dekat saya untuk menghangatkan suasana, gadis lemah ini tidak akan jatuh sakit kok.",
					exp: 90,
				},
			],
		},
	],
}

function renderProgressBar(current: number, max: number): string {
	const totalBars = 10
	const filled = Math.min(
		totalBars,
		Math.max(0, Math.round((current / max) * totalBars)),
	)
	return "█".repeat(filled) + "░".repeat(totalBars - filled)
}

const command: ICommand = {
	name: ["momotalk", "momo", "talk", "bond", "affection"],
	category: "bluearchive",
	description:
		"Interactive MomoTalk messaging with your recruited Blue Archive students to increase Bond Level",
	usage: [
		"momo",
		"momo 1",
		"momo 2",
		"momo 3",
		"momo hoshino",
		"momo shiroko",
		"bond",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = ctx.commandName.toLowerCase()
		const subArg = (args[0] || "").toLowerCase()

		// ──────────────────────────────────────────
		// 1. VIEW SENSEI BOND RECORD (.bond / .momo list)
		// ──────────────────────────────────────────
		if (cmd === "bond" || subArg === "list" || subArg === "profile") {
			const bonds = await momoRepository.getAllBonds(ctx.agentId, ctx.senderJid)

			let text = `╔══════════════════════════╗\n`
			text += `  🌸 *SENSEI AFFECTION RECORD*\n`
			text += `╚══════════════════════════╝\n\n`
			text += `👤 *Sensei:* @${ctx.senderJid.split("@")[0]}\n`
			text += `👥 *Students Bonded:* ${bonds.length} student(s)\n\n`

			if (bonds.length === 0) {
				text += `_No MomoTalk conversations yet._\n`
				text += `💡 *Start chatting:* Type *${ctx.prefix}momo* to chat with your recruited students!`
			} else {
				for (const b of bonds) {
					const hearts = "❤️".repeat(Math.min(b.bondLevel, 5))
					const maxExp = momoRepository.getRequiredExp(b.bondLevel)
					const bar = renderProgressBar(b.bondExp, maxExp)
					const l2dBadge = b.bondLevel >= 5 ? " 🖼️ *[Memorial Lobby]*" : ""
					text += `• *${b.studentName}* — Rank ${b.bondLevel} ${hearts}${l2dBadge}\n`
					text += `  [${bar}] ${b.bondExp}/${maxExp} EXP\n\n`
				}
				text += `💡 *Tip:* Reach *Rank 5* to unlock student's Memorial Lobby L2D artwork!`
			}

			await ctx.reply(text)
			return
		}

		// ──────────────────────────────────────────
		// 2. CHECK IF SENSEI IS ANSWERING ACTIVE SESSION (1, 2, 3)
		// ──────────────────────────────────────────
		const choiceNum = Number.parseInt(subArg, 10)
		const activeSession = momoRepository.getSession(ctx.agentId, ctx.senderJid)

		if (
			activeSession &&
			!Number.isNaN(choiceNum) &&
			choiceNum >= 1 &&
			choiceNum <= 3
		) {
			const selectedChoice = activeSession.dialogue.choices[choiceNum - 1]!
			momoRepository.clearSession(ctx.agentId, ctx.senderJid)

			// Add EXP & calculate Level Up
			const result = await momoRepository.addBondExp(
				ctx.agentId,
				ctx.senderJid,
				activeSession.studentId,
				activeSession.studentName,
				selectedChoice.exp,
			)

			const hearts = "❤️".repeat(Math.min(result.newLevel, 5))
			const progress = renderProgressBar(result.currentExp, result.requiredExp)

			let replyText = `📱 *MOMOTALK — ${activeSession.studentName}*\n`
			replyText += `───────────────────────────\n\n`
			replyText += `💬 *${activeSession.dialogue.speaker}:*\n`
			replyText += `"${selectedChoice.reply}"\n\n`
			replyText += `───────────────────────────\n`
			replyText += `💖 *Bond EXP:* +${selectedChoice.exp} EXP\n`
			replyText += `📊 *Progress:* [${progress}] ${result.currentExp}/${result.requiredExp} EXP\n`

			if (result.leveledUp) {
				replyText += `\n🎉 *BOND LEVEL UP! (Rank ${result.oldLevel} ➔ Rank ${result.newLevel})* ${hearts}\n`
				replyText += `🎁 *Reward:* +${result.pyroxeneReward} Pyroxenes 💎 added to your balance!\n`
			}

			// If Memorial Lobby unlocked (or Rank >= 5), send Memorial Lobby image!
			if (result.unlockedMemorialLobby || result.newLevel >= 5) {
				const lobbyUrl = getStudentImageUrl(activeSession.studentId, "lobby")
				const collectionUrl = getStudentImageUrl(
					activeSession.studentId,
					"collection",
				)

				try {
					let imgRes = await fetch(lobbyUrl)
					if (!imgRes.ok) {
						imgRes = await fetch(collectionUrl)
					}

					if (imgRes.ok) {
						const imgBuf = Buffer.from(await imgRes.arrayBuffer())
						if (result.unlockedMemorialLobby) {
							replyText += `\n🖼️ *NEW MEMORIAL LOBBY ARTWORK UNLOCKED!*`
						}

						await ctx.sock.sendMessage(
							ctx.jid,
							{ image: imgBuf, caption: replyText },
							{ quoted: ctx.rawMsg },
						)
						return
					}
				} catch {}
			}

			await ctx.reply(replyText)
			return
		}

		// ──────────────────────────────────────────
		// 3. START A NEW MOMOTALK CONVERSATION
		// ──────────────────────────────────────────
		// Fetch Sensei's recruited students
		const collection = await gachaRepository.getCollection(
			ctx.agentId,
			ctx.senderJid,
		)

		let targetStudentName = "Hoshino"
		let targetStudentId = 10005

		const requestedName = args.join(" ").trim().toLowerCase()

		if (requestedName) {
			// 1. Fetch reference SchaleDB data for accurate matching & metadata
			const [allSchale, schaleMatches] = await Promise.all([
				getSchaleStudents(),
				searchSchaleStudent(requestedName),
			])
			const schaleMap = new Map(allSchale.map((s) => [s.Id, s]))
			const canonicalStudent = schaleMatches[0]

			// 2. Score each student owned by Sensei using multi-tier relevance scoring
			const scoredCollection = collection
				.map((s) => {
					const schaleInfo = schaleMap.get(s.studentId)
					const score = getStudentMatchScore(
						s.studentName,
						requestedName,
						schaleInfo?.DevName,
						schaleInfo?.FamilyName,
						schaleInfo?.PersonalName,
					)
					return { item: s, score }
				})
				.filter((s) => s.score > 0)
				.sort((a, b) => {
					if (b.score !== a.score) return b.score - a.score
					return a.item.studentName.localeCompare(b.item.studentName)
				})

			const bestOwned = scoredCollection[0]

			// 3. Guard against substring hijacking (e.g. searching "Mari" incorrectly selecting "Himari"):
			// If SchaleDB has a strong canonical match for what Sensei typed (score >= 5000),
			// but Sensei's best owned match is only a weak partial substring (score < 3000),
			// Sensei asked for a student they haven't recruited yet.
			const schaleScore = canonicalStudent
				? getStudentMatchScore(
						canonicalStudent.Name,
						requestedName,
						canonicalStudent.DevName,
						canonicalStudent.FamilyName,
						canonicalStudent.PersonalName,
					)
				: 0

			const isHijacked =
				canonicalStudent &&
				schaleScore >= 5000 &&
				(!bestOwned || bestOwned.score < 3000)

			if (!bestOwned || isHijacked) {
				const foundName = canonicalStudent?.Name || requestedName
				await ctx.reply(
					`❌ Sensei, you haven't recruited *${foundName}* yet!\n\n` +
						`💡 *Tip:* Use *${ctx.prefix}gacha 10* to recruit students or check *${ctx.prefix}mystudent* to see who you own.`,
				)
				return
			}

			targetStudentName = bestOwned.item.studentName
			targetStudentId = bestOwned.item.studentId
		} else if (collection.length > 0) {
			// Pick random student from Sensei's collection
			const picked = collection[Math.floor(Math.random() * collection.length)]!
			targetStudentName = picked.studentName
			targetStudentId = picked.studentId
		}

		// Find dialogue template
		const baseKey = targetStudentName
			.toLowerCase()
			.replace(/\s*[(*[].*?[)*\]]/g, "")
			.trim()
		const nameTokens = baseKey.split(/\s+/).filter(Boolean)
		const matchedKey =
			nameTokens.find((t) => MOMO_DIALOGUES[t]) ||
			(MOMO_DIALOGUES[baseKey] ? baseKey : null) ||
			nameTokens[nameTokens.length - 1] ||
			nameTokens[0] ||
			"hoshino"
		const dialogues = MOMO_DIALOGUES[matchedKey]

		let dialogue: MomoDialogue
		if (dialogues && dialogues.length > 0) {
			dialogue = dialogues[Math.floor(Math.random() * dialogues.length)]!
		} else {
			// Procedural dialogue for any other recruited student!
			dialogue = {
				id: `gen_${targetStudentId}`,
				speaker: targetStudentName,
				studentId: targetStudentId,
				message: `Sensei, halo! Terima kasih sudah selalu menjaga kami di Schale.\nKira-kira Sensei punya waktu sebentar untuk ngobrol denganku?`,
				choices: [
					{
						text: "Tentu saja, aku selalu ada waktu untukmu.",
						reply:
							"Ehehe, terima kasih Sensei! Aku senang sekali bisa berbincang denganmu hari ini.",
						exp: 90,
					},
					{
						text: "Ayo kita istirahat sambil minum teh hangat.",
						reply:
							"Wah ide bagus, Sensei! Teh hangat bersama Sensei rasanya menenangkan sekali.",
						exp: 80,
					},
					{
						text: "Aku bawakan camilan manis untukmu!",
						reply:
							"Kyaa! Sensei baik banget deh! Terima kasih banyak ya Sensei~",
						exp: 100,
					},
				],
			}
		}

		// Save active session (5 min TTL)
		momoRepository.setSession(ctx.agentId, ctx.senderJid, {
			studentId: targetStudentId,
			studentName: targetStudentName,
			dialogue,
			startedAt: Date.now(),
		})

		const currentBond = await momoRepository.getBond(
			ctx.agentId,
			ctx.senderJid,
			targetStudentId,
			targetStudentName,
		)
		const hearts = "❤️".repeat(Math.min(currentBond.bondLevel, 5))

		let promptText = `📱 ══════════════════════════\n`
		promptText += `💬 *MOMOTALK — ${targetStudentName}* [Rank ${currentBond.bondLevel} ${hearts}]\n`
		promptText += `══════════════════════════════\n\n`
		promptText += `${dialogue.speaker}:\n`
		promptText += `"${dialogue.message}"\n\n`
		promptText += `──────────────────────────────\n`
		promptText += `👉 *PILIHAN BALASAN SENSEI:*\n`
		promptText += `[1] "${dialogue.choices[0].text}"\n`
		promptText += `[2] "${dialogue.choices[1].text}"\n`
		promptText += `[3] "${dialogue.choices[2].text}"\n\n`
		promptText += `💡 *Ketik angka balasan:* *1*, *2*, atau *3* (atau ketik *${ctx.prefix}momo 1*)`

		// Attach portrait / collection image if available
		const portraitUrl = getStudentImageUrl(targetStudentId, "collection")
		try {
			const imgRes = await fetch(portraitUrl)
			if (imgRes.ok) {
				const imgBuf = Buffer.from(await imgRes.arrayBuffer())
				await ctx.sock.sendMessage(
					ctx.jid,
					{ image: imgBuf, caption: promptText },
					{ quoted: ctx.rawMsg },
				)
				return
			}
		} catch (err) {
			logger.warn(
				"/commands/bluearchive/momotalk.ts",
				`Failed fetching portrait: ${err}`,
			)
		}

		await ctx.reply(promptText)
	},
}

export default command
