---
tags: [memory, backend, commands, matrix]
aliases: [Commands Index, src/commands/, Command Matrix]
updated: 2026-10-15
---

# 📜 Bot Command Matrix (`src/commands/`)

> [!NOTE]
> All command modules implement the `ICommand` interface and are dispatched via `[[Hoshino-Backend/services/commandLoader|CommandLoader]]`.

---

## 1. Blue Archive (`src/commands/bluearchive/`)

| File Script | Trigger Name(s) | Access | Description & Execution Logic |
| :--- | :--- | :--- | :--- |
| `gacha.ts` | `gacha`, `pull`, `daily`, `spark`, `mystudent`, `students`, `pyroxene` | `user` | Official 3% rate Blue Archive gacha simulation, 1,200 daily Pyroxenes claim, 200 spark points pity redemption, and student roster viewing |
| `hoshino.ts` | `hoshino`, `ojisan`, `takanashi` | `user` | Multi-turn conversational AI persona for Takanashi Hoshino |
| `momotalk.ts` | `momo`, `momotalk`, `bond` | `user` | Interactive MomoTalk conversations with bond EXP progression and Live2D Memorial Lobby unlock at Level 5. Features multi-tier deterministic student name resolution with anti-hijack guard (e.g., prevents "Himari" from intercepting "Mari" searches), and authentic dialogue sets for Hoshino, Shiroko, Serika, Nonomi, Ayane, Mika, Mari, and Himari |
| `raid.ts` | `raid`, `boss`, `totalassault` | `user` | Total Assault raid boss guide from SchaleDB (armor weaknesses, insane attacks, best striker counters) |
| `student.ts` | `student`, `ba`, `murid`, `schale` | `user` | Full student wiki profiles from SchaleDB with relevance scoring (combat roles, armor types, VAs, HD art) |

---

## 2. Media Downloaders (`src/commands/downloaders/`)

| File Script | Trigger Name(s) | Access | Description & Execution Logic |
| :--- | :--- | :--- | :--- |
| `youtube.ts` | `youtube`, `yt`, `ytmp4`, `ytmp3`, `play` | `user` | Downloads YouTube video (MP4) or audio (MP3), with instant song title search |
| `tiktok.ts` | `tiktok`, `tt`, `ttdl`, `ttmp3`, `ttaudio` | `user` | Downloads TikTok watermark-free HD video, audio MP3, or photo slides |
| `spotify.ts` | `spotify`, `sp`, `spdl` | `user` | Downloads audio tracks from Spotify links as clear MP3 files |
| `pinterest.ts` | `pinterest`, `pin`, `pindl` | `user` | Downloads Pinterest image pins or performs keyword wallpaper/fanart searches |
| `twitter.ts` | `twitter`, `tw`, `x`, `twdl` | `user` | Downloads videos from Twitter/X post URLs |
| `facebook.ts` | `facebook`, `fb`, `fbdl`, `fbdown` | `user` | Downloads public Facebook videos and Reels |

---

## 3. Group Administration (`src/commands/group/`)

| File Script | Trigger Name(s) | InGroup | InGroupAccess | Description & Execution Logic |
| :--- | :--- | :--- | :--- | :--- |
| `bot.ts` | `bot`, `listen` | `true` | `admin` | Toggles bot listening/responding state in the group (on/off) |
| `enablebot.ts` | `enablebot` | `true` | `admin` | Enables bot listening in the group |
| `disablebot.ts` | `disablebot` | `true` | `admin` | Disables bot listening in the group |
| `enablecmd.ts` | `enablecmd` | `true` | `admin` | Registers sensitive commands inside this group (`public.agent_group_commands`) |
| `disablecmd.ts` | `disablecmd` | `true` | `admin` | Unregisters sensitive commands in this group |
| `welcome.ts` | `welcome` | `true` | `admin` | Toggles welcome announcements for new group members (`welcome_enabled`) |
| `goodbye.ts` | `goodbye` | `true` | `admin` | Toggles farewell messages for departing members (`goodbye_enabled`) |
| `kick.ts` | `kick` | `true` | `admin` | Kicks a participant from the group (requires bot admin rights) |
| `delete.ts` | `delete`, `del` | `true` | `admin` | Deletes a replied message in the group (requires bot admin rights) |
| `autodelete.ts` | `autodelete` | `true` | `admin` | Adds a user to the auto-delete target list strictly for this group (`public.agent_autodeletes`) |
| `disableautodelete.ts` | `disableautodelete` | `true` | `admin` | Removes a user from the auto-delete target list in this group |


---

## 4. Utility & Media Tools (`src/commands/utility/`)

| File Script | Trigger Name(s) | Access | Description & Execution Logic |
| :--- | :--- | :--- | :--- |
| `sticker.ts` | `sticker`, `s` | `user` | Converts images/videos/GIFs to WhatsApp WebP stickers with custom flags |
| `toimg.ts` | `toimg`, `tovideo`, `tomp4` | `user` | Converts WhatsApp stickers back into PNG images or MP4 videos |
| `viewonce.ts` | `rvo`, `viewonce`, `readviewonce`, `vo` | `user` | Unwraps ViewOnce media (photos, videos, audio) into permanent files |
| `whatanime.ts` | `whatanime`, `sauce`, `traceanime` | `user` | Reverse search anime scenes via Trace.moe |
| `qrcode.ts` | `qrcode`, `qr` | `user` | Generates QR code images from text or URLs |
| `math.ts` | `math`, `calc` | `user` | Evaluates scientific mathematical expressions |
| `ai.ts` | `ai`, `ask`, `gemini` | `user` | General AI assistant powered by Google Gemini |
| `ping.ts` | `ping` | `user` | Tests bot response latency and uptime |
| `help.ts` | `help`, `menu` | `user` | Renders a dynamic command menu filtered by caller permissions |

---

## 5. Anime Waifu (`src/commands/waifuImages/`)

| File Script | Trigger Name(s) | Access | Description & Execution Logic |
| :--- | :--- | :--- | :--- |
| `sfw.ts` | `sfw`, `waifu` | `user` | Fetches random or tagged SFW anime art from NekosAPI |
| `nsfw.ts` | `nsfw` | `user` | Fetches random or tagged NSFW anime images |

---

## 6. Bot Owner (`src/commands/owner/`)

| File Script | Trigger Name(s) | Access | Description & Execution Logic |
| :--- | :--- | :--- | :--- |
| `blacklist.ts` | `blacklist` | `owner` | Blocks a user from using any bot commands (`public.agent_blacklists`) |
| `whitelist.ts` | `whitelist` | `owner` | Unblocks a previously blacklisted user |
