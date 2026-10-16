---
tags: [memory, backend, utils, helpers, database, logger, ffmpeg, ai]
aliases: [Utilities Index, src/utils/]
updated: 2026-10-15
---

# 🧰 Backend Utilities (`src/utils/`)

> [!NOTE]
> Collection of independent utility modules: native Bun PostgreSQL client, ANSI color logger with automatic caller tracking, 6-tier compression WebP sticker engine, ffmpeg transcoder, Gemini AI persona, and cookie-free media scrapers.

---

## 1. Database Client (`db.ts`)
- **Primary Export**: `sql` (Native Bun PostgreSQL instance `new SQL(...)`)
- **Function `initAuthDatabase(): Promise<void>`**:
  - Creates `auth` schema
  - Creates `auth.credentials` & `auth.keys`
  - Creates `public.agents`, `public.chats`, `public.messages`
  - Creates `public.agent_owners`, `public.agent_blacklists`, `public.agent_autodeletes`
  - Creates `public.agent_group_settings`, `public.agent_command_toggles`, `public.agent_group_commands`
  - Creates `public.sensei_profiles`, `public.sensei_students`, `public.sensei_bonds`
  - Creates query performance indexes: `idx_auth_keys_agent_id`, `idx_messages_agent_jid`.

---

## 2. Global Logger (`logger.ts`)
- **Primary Export**: `logger` (`Logger` singleton) also attached to `globalThis.logger`.
- **Key Features**:
  - `getCallerLocation()`: Inspects V8 stack frames to automatically derive caller relative file path and line number (e.g., `[src/modules/baileys/socket.ts:125]`).
  - `console.log` Override: Appends cyan caller tag prefix.
  - File Streaming: Writes daily logs to `./logs/YYYY-MM-DD.log` with automatic file stream rotation.
  - Level Shorthands: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.system()`, `logger.debug()`.

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
- **Model Fallback Chain**: `gemini-3.6-flash`, `gemini-2.5-flash`, `gemini-1.5-flash`.
- **Function `chatWithHoshino(userJid, prompt, options): Promise<string>`**:
  Persona AI for Takanashi Hoshino from Blue Archive, maintaining conversation history (last 8 turns, 15-minute TTL).
- **Function `chatWithGeneralAI(userJid, prompt, options): Promise<string>`**:
  General assistant for code, queries, and questions.
- **Function `resetAIMemory(userJid): void`**:
  Clears conversational memory cache for a given user.

---

## 6. SchaleDB Blue Archive Wiki (`schaledb.ts`)
- Fetches character stats, EX skill details, armor types, voice actors, and HD artwork directly from the SchaleDB public dataset with in-memory caching.
- **Function `getStudentMatchScore(candidateName: string, query: string, devName?: string, familyName?: string, personalName?: string): number`**:
  Calculates a deterministic relevance score to guarantee high search precision:
  - `10000`: Exact raw match on student full name.
  - `9800`: Cleaned name match (ignoring punctuation, brackets, parentheses).
  - `8500`: Base name match (e.g. query `"mari"` correctly matching `"Mari (Track)"`).
  - `7000-7800`: Multi-token match across all words in any order (e.g. `"track mari"` matching `"Mari (Track)"`).
  - `5000-6500`: Whole-word boundary token match (prevents `"Mari"` from matching inside `"Himari"`).
  - `3000-4500`: Prefix match on full name or base name.
  - `2000-4000`: Exact or partial matches on `PersonalName`, `FamilyName` (e.g. `"Iochi"`, `"Akeboshi"`), or `DevName`.
  - `50-800`: Weak internal substring match (restricted strictly to queries of length >= 3).
- **Function `searchSchaleStudent(query: string): Promise<SchaleStudent[]>`**:
  Searches students by ID or multi-tier relevance scoring, sorting the results descending by score so exact/base-name matches always precede substring candidates.

---

## 7. Media Scrapers (100% Cookie-Free)
- `youtube.ts`: YouTube MP4 video and MP3 audio download.
- `tiktok.ts`: TikTok HD video without watermark, audio MP3, and photo slide download.
- `facebook.ts`: Public Facebook video and Reels scraper.
- `twitter.ts`: Twitter / X video scraper.
- `waifu.ts`: NekosAPI v3 client for SFW and NSFW anime images.
