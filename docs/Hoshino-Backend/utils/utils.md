---
tags: [memory, backend, utils, helpers, database, logger, ffmpeg, ai, schaledb, momotalk]
aliases: [Utilities Index, src/utils/]
updated: 2026-10-29
---

# 🧰 Backend Utilities (`src/utils/`)

> [!NOTE]
> Collection of independent utility modules: native Bun PostgreSQL client, ANSI color logger with automatic caller tracking, 6-tier compression WebP sticker engine, ffmpeg transcoder, Gemini AI persona, SchaleDB progression/combat calculator, MomoTalk MediaWiki scraper & SVG UI card renderer, and cookie-free media scrapers.

---

## 1. Database Client (`db.ts`)
- **Primary Export**: `sql` (Native Bun PostgreSQL instance `new SQL(...)`)
- **Function `initAuthDatabase(): Promise<void>`**:
  - Creates `auth` schema (`auth.credentials` & `auth.keys`).
  - Creates `public.agents`, `public.chats`, `public.messages`.
  - Creates `public.agent_owners`, `public.agent_blacklists`, `public.agent_autodeletes`.
  - Creates `public.agent_group_settings`, `public.agent_command_toggles`, `public.agent_group_commands`.
  - Creates & migrates `public.sensei_profiles` (with `pyroxenes`, `credits`, `spark_points`, `total_pulls`, `raid_tickets`, `bounty_tickets`, `pvp_wins`, `pvp_losses`, `squad_strikers`, `squad_specials`).
  - Creates & migrates `public.sensei_students` (with `level`, `exp`, `ex_skill_level`, `normal_skill_level`, `passive_skill_level`, `sub_skill_level`, `equip_slot1_tier`, `equip_slot2_tier`, `equip_slot3_tier`, `weapon_star`).
  - Creates `public.sensei_inventory` (stores authentic SchaleDB `item_id`, `item_name`, `category`, `rarity`, `count`).
  - Creates `public.sensei_raid_records` (stores Total Assault & Weekly Boss clear records, scores, and total damage).
  - Creates `public.sensei_bonds` (MomoTalk bond ranks & EXP).
  - Creates `public.database_settings` (automated retention, message pruning, and media bloat rules).
  - Creates query performance indexes: `idx_auth_keys_agent_id`, `idx_messages_agent_jid`.

---

## 2. Global Logger (`logger.ts`)
- **Primary Export**: `logger` (`Logger` singleton) also attached to `globalThis.logger`.
- **Key Features**:
  - `getCallerLocation()`: Inspects V8 stack frames to automatically derive caller relative file path and line number (e.g., `[src/modules/baileys/socket.ts:125]`).
  - `console.log` Override: Appends cyan caller tag prefix.
  - File Streaming: Writes daily logs to `./logs/YYYY-MM-DD.log` with automatic file stream rotation.
  - Level Shorthands: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.system()`, `logger.debug()`.
  - `getLogStats()`: Aggregates total files, file paths, individual sizes, dates, and active flags across `./logs` and `../logs`.
  - `flushLogs(options)`: Safe retention pruning or full flush of log files. For current active stream, performs file truncation to 0 bytes and stream rotation without crashing open write streams or unlinking locked handles on Windows.


---

## 3. Sticker Engine (`sticker.ts`)
- **Function `parseStickerOptions(args: string[]): StickerOptions`**:
  Extracts flags (`crop`, `hq`, `lq`, `cover`, `fps15`, `3s`) and custom EXIF packname/publisher (`Pack Name | Publisher Name`).
- **Function `writeExif(media: Buffer, packname, publisher): Promise<Buffer>`**:
  Injects WhatsApp sticker EXIF metadata using `node-webpmux`.
- **Function `makeSticker(buffer: Buffer, opt: StickerOptions): Promise<Buffer>`**:
  Converts static images to 512x512 WebP WhatsApp stickers via `sharp`.
- **Function `makeAnimatedSticker(buffer: Buffer, opt: StickerOptions): Promise<Buffer>`**:
  **6-Tier Compression Engine** using `ffmpeg` (`Bun.spawn`):
  - Tier 1: Initial 512x512 render @ 15fps.
  - Tier 2: Quality 50 & 12fps if size > 850KB.
  - Tier 3: Downscales resolution to 400x400.
  - Tier 4: Downscales resolution to 320x320 & 10fps.
  - Tier 5: Downscales resolution to 256x256 & 8fps.
  - Tier 6 (Last Resort): Trims duration gradually to ensure file size stays strictly within WhatsApp's 850KB threshold.

---

## 4. Media Transcoder (`media.ts`)
- **Function `transcodeForWhatsapp(inputBuffer: Buffer, isGif = false): Promise<Buffer>`**:
  Converts video/GIF buffers into WhatsApp-compliant MP4:
  - Format detection from magic bytes (GIF, PNG, JPG, WebP, MP4).
  - Codec `libx264` Baseline Profile Level 3.0, pixel format `yuv420p`.
  - Even dimensions (`scale=trunc(iw/2)*2:trunc(ih/2)*2`).
  - `+faststart` flag for instant playback and looping on mobile devices.

---

## 5. AI Engine (`ai.ts`)
- **Model Fallback Chain**: `gemini-3.6-flash` (`maxOutputTokens: 16384`), `gemini-3.5-flash` (`maxOutputTokens: 16384`), `gemini-3.7-flash` (`maxOutputTokens: 16384`), `gemini-3.8-flash` (`maxOutputTokens: 16384`), with a 22s per-model `AbortSignal.timeout`.
- **Local SchaleDB RAG Grounding (`buildSchaleKnowledgeContext(prompt)`)**:
  Automatically scans incoming `.hoshino` and `.ai` prompts against local `data/schaledb/students.json` and `data/schaledb/raids.json` to inject verified student bios, stats, schools, clubs, skills (e.g. *Kisaki*, *Shiroko Terror*, *Rio*), and Raid Boss profiles directly into the model context.
- **Multi-Part Extraction & Auto-Continuation**: Concatenates all non-thought text parts (`extractGeminiCandidateText`) and automatically issues a 1-step continuation request when `finishReason === "MAX_TOKENS"` so long responses are never truncated.
- **Function `chatWithHoshinoAgent(userJid, prompt, options): Promise<HoshinoAgentResponse>`**:
  Agentic persona AI for Takanashi Hoshino from Blue Archive, maintaining isolated conversation history (`hoshino:${agentId}:${userJid}`, 10 turns, 20-minute TTL), grounding with local SchaleDB data, and parsing autonomous bot command invocations (`[[EXECUTE_CMD: command | args]]` ➔ `{ reply, action }`).
- **Function `chatWithHoshino(userJid, prompt, options): Promise<string>`**:
  Backwards-compatible wrapper around `chatWithHoshinoAgent` returning the clean conversational reply.
- **Function `chatWithGeneralAI(userJid, prompt, options): Promise<string>`**:
  Strictly neutral, professional General AI assistant (`general:${agentId}:${userJid}`), completely decoupled from the Takanashi Hoshino roleplay persona.
- **Functions `resetHoshinoMemory(userJid, agentId?)`, `resetGeneralAIMemory(userJid, agentId?)`, `resetAIMemory(userJid, agentId?)`**:
  Clears conversational memory cache per mode or globally for a given user.

---

## 6. SchaleDB Blue Archive Engine (`schaledb.ts`)
- Fetches and caches character stats, skill material arrays (`SkillExMaterial`, `SkillMaterial`), equipment recipes, armor/bullet types, voice actors, and HD artwork directly from SchaleDB (`students.json`, `items.json`, `equipment.json`).
- **Function `getStudentMatchScore(candidateName: string, query: string, devName?: string, familyName?: string, personalName?: string): number`**:
  Calculates a deterministic relevance score (`0` to `10000`) preventing substring hijacking bugs.
- **Function `searchSchaleStudent(query: string): Promise<SchaleStudent[]>`**:
  Searches students by ID or multi-tier relevance scoring with automatic quotation stripping.
- **Function `getSchaleItems(): Promise<Record<number, SchaleItem>>` & `getSchaleItemById(itemId: number)`**:
  Fetches and caches all 1,096+ SchaleDB items (`https://schaledb.com/data/en/items.json` ➔ `data/schaledb/items.json`), mapping item IDs to Activity Reports, Tactical Blu-rays (`CDItem`), Tech Notes (`BookItem`), and Oopart Artifacts (`Artifact`).
- **Function `getSchaleEquipment(): Promise<SchaleEquipment[]>` & `getEquipmentByCategoryAndTier(category: string, tier: number)`**:
  Fetches and caches all SchaleDB equipment pieces (`https://schaledb.com/data/en/equipment.json` ➔ `data/schaledb/equipment.json`) across `T1` through `T9`.
- **Function `getSkillUpgradeRecipe(student: SchaleStudent, skillType: "ex" | "normal" | "passive" | "sub", currentLevel: number)`**:
  Resolves the exact per-student SchaleDB material IDs, item names, quantities, and Credit costs required for the next EX Skill (`Lv.1 ➔ 5`) or Basic/Passive/Sub Skill (`Lv.1 ➔ 10`) upgrade.
- **Function `calculateStudentCombatStats(student: SchaleStudent, prog: Partial<StudentProgressionState>): ComputedCombatStats`**:
  Computes interpolated `ATK`, `MaxHP`, `DEF`, `HEAL`, `CRIT`, `ACC`, `EVA`, `exMultiplier`, `skillMultiplier`, and `combatPower` based on student Level (`1..90`), Star Grade (`1★..5★`), Unique Weapon (`UE 1★..3★`), Equipment Tiers (`T1..T9`), Skill Levels, and MomoTalk Bond Rank.
- **Function `calculateArmorMultiplier(bulletType: string, armorType: string)`**:
  Official Blue Archive type affinity matrix (`2.0x` Weak, `1.0x` Normal, `0.5x` Resisted).
- **Function `calculateTerrainMultiplier(student: SchaleStudent, terrain: string)`**:
  Calculates terrain mood adaptation (`D=0.8x` to `SS=1.3x`).
- **Function `getRaidBossImageUrls(boss: Pick<SchaleRaidBoss, "DevName" | "PathName" | "Name">): string[]`**:
  Builds the verified SchaleDB Raid Boss image URL priority list (`Boss_Portrait_${DevName}_Lobby.png` and fallback `icon/Icon_${DevName}.png`).
- **Function `fetchSchaleImageBuffer(urlOrCandidates: string | string[]): Promise<Buffer | null>`**:
  Safely fetches any SchaleDB image, strictly validates that `Content-Type` starts with `image/` (rejecting SchaleDB's `200 OK` `text/html` SPA fallback), and normalizes WebP/PNG bytes into a standard PNG buffer via `sharp` so WhatsApp never renders a blank image.

---

## 7. MomoTalk Wiki Scraper & Visual Card Renderer (`momotalkScraper.ts`)
- **Function `parseWikiMomoTalkWikitext(wikitext: string, student: SchaleStudent): ScrapedMomoEpisode[]`**:
  Parses raw MediaWiki `{{MomoTalk ... }}` templates from `bluearchive.wiki` into structured MomoTalk episodes (`openingBubbles`, `choices`, `replyBubbles`, `triggersRelationshipEvent`, `favorRequired`).
- **Function `getOrScrapeStudentMomoTalks(student: SchaleStudent): Promise<MomoDialogue[]>`**:
  Scrapes authentic in-game MomoTalk scripts from `https://bluearchive.wiki/w/api.php` (`<Student>/MomoTalk`) and caches them locally in `data/schaledb/momotalk/{studentId}.json`.
- **Function `renderMomoTalkCard(options): Promise<Buffer | null>`**:
  Renders an authentic Blue Archive MomoTalk Messenger UI image card (`PNG` via `sharp` SVG rendering) complete with the pink MomoTalk header bar, Bond Rank badge, circular student icon from SchaleDB, student message bubbles, Sensei blue reply box, and the pink `♥ Relationship Event` story banner.

---

## 8. Media Scrapers (100% Cookie-Free)
- `youtube.ts`: YouTube MP4 video and MP3 audio download.
- `tiktok.ts`: TikTok HD video without watermark, audio MP3, and photo slide download.
- `facebook.ts`: Public Facebook video and Reels scraper.
- `twitter.ts`: Twitter / X video scraper.
- `waifu.ts`: NekosAPI v3 client for SFW and NSFW anime images.
