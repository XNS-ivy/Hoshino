---
tags: [memory, backend, commands, matrix]
aliases: [Commands Index, src/commands/, Command Matrix]
updated: 2026-10-29
---

# 📜 Bot Command Matrix (`src/commands/`)

> [!NOTE]
> All command modules implement the `ICommand` interface and are dispatched via `[[Hoshino-Backend/services/commandLoader|CommandLoader]]`.

---

## 1. Blue Archive (`src/commands/bluearchive/`)

| File Script | Trigger Name(s) | Access | Description & Execution Logic |
| :--- | :--- | :--- | :--- |
| `gacha.ts` | `gacha`, `pull`, `daily`, `spark`, `mystudent`, `students`, `pyroxene`, `eleph`, `claim`, `claimeleph` | `user` | Official 3% rate Blue Archive gacha simulation, daily claim (`+1,200 Pyroxenes`, `+250,000 Credits`, `Activity Reports`, & Raid/Bounty ticket refresh), 200 spark points pity redemption, student roster viewing, specific student status & MomoTalk bond inspection (`.mystudent [name/star]`), and duplicate Eleph-to-Pyroxene exchange |
| `upgrade.ts` | `upgrade`, `levelup`, `skillup`, `gearup`, `mystic`, `inventory`, `bag`, `materials`, `squad`, `party` | `user` | Full student RPG progression system using authentic SchaleDB materials (`items.json` & `equipment.json`): upgrade student Level (`1➔90`), EX Skill (`1➔5`), Basic/Passive/Sub Skills (`1➔10`), Equipment Slots 1-3 (`T1➔T9`), and Mystic Star Liberation (`1★➔5★ + UE 1★-3★`), plus material inventory viewer (`.inventory`), `4 Striker + 2 Special` squad formation manager (`.squad`), and `resolveCanonicalSensei(ctx, rawTargetJids?)` helper for multi-identity `@lid`/`@s.whatsapp.net` resolution |
| `raid.ts` | `raid`, `boss`, `totalassault`, `weeklyboss`, `bounty`, `grandassault` | `user` | Playable PvE Total Assault Raid Boss & Weekly Boss combat (`Normal` through `Insane` & `Torment`) using SchaleDB `raids.json`. Simulates squad combat using student stats, EX skills, Bullet vs Armor counters (`2.0x Weak`), and Terrain mood, dropping smart SchaleDB upgrade materials (Blu-rays, Tech Notes, Oopart Artifacts, Activity Reports, Blueprints), Credits, and Pyroxenes, with server leaderboards (`.raid rank`) |
| `momotalk.ts` | `momo`, `momotalk`, `bond` | `user` | Game-accurate interactive MomoTalk messenger that scrapes authentic student MomoTalk episodes & dialogue trees from `bluearchive.wiki/w/api.php` (cached in `data/schaledb/momotalk/`), renders visual **MomoTalk UI Chat Cards** via `sharp` SVG-to-PNG (pink header, circular student avatar, chat bubbles, blue Sensei reply box, pink `♥ Relationship Event` banner), grants Bond Stat bonuses (`+ATK/HP%`), and unlocks Live2D Memorial Lobby artwork |
| `duel.ts` | `duel`, `pvp`, `tactical`, `bet`, `taruhan` | `user` | Sensei-vs-Sensei Tactical Challenge PvP Duel with Pyroxene or Credit wagering (`.duel @sensei <bet> [pyroxene\|credit]`, `.duel accept`, `.duel decline`, `.duel rank`). Simulates 3-phase `4 Striker + 2 Special` squad combat with armor counters, terrain adaptation, EX skill clashes, MVP selection, and atomic pot payout |
| `hoshino.ts` | `hoshino`, `ojisan`, `takanashi` | `user` | Multi-turn conversational AI persona for Takanashi Hoshino |
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
| `help.ts` | `help`, `menu` | `user` | Renders a dynamic command menu filtered by caller permissions using 2 parallel bulk SQL queries and O(1) in-memory toggle checks |

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
