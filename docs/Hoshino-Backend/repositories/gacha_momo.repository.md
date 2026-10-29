---
tags: [memory, backend, repositories, gacha, bluearchive, momotalk, raid, pvp]
aliases: [GachaRepository, MomoRepository, bluearchive-db]
updated: 2026-10-29
---

# 🎲 Gacha, Progression, Raid, PvP & MomoTalk Repositories (`src/repositories/gacha.repository.ts & momo.repository.ts`)

> [!NOTE]
> These files power the full **Blue Archive** game loop: student gacha simulation, pyroxene & credit economy, spark pity system, student progression (Level, Skills, Equipment T1-T9, Mystic Star/UE), SchaleDB material inventory, Total Assault Raid & Weekly Boss records, Sensei PvP Duel betting settlement, and interactive MomoTalk conversations.

---

## 1. Gacha & Progression Repository (`gacha.repository.ts`)

### Related Tables:
- `public.sensei_profiles`: Stores `pyroxenes`, `credits`, `spark_points`, `total_pulls`, `last_daily`, `raid_tickets`, `bounty_tickets`, `last_ticket_reset`, `pvp_wins`, `pvp_losses`, `squad_strikers`, and `squad_specials`.
- `public.sensei_students`: Stores student roster collection and RPG build (`student_id`, `student_name`, `star_grade`, `count`, `level`, `exp`, `ex_skill_level`, `normal_skill_level`, `passive_skill_level`, `sub_skill_level`, `equip_slot1_tier`, `equip_slot2_tier`, `equip_slot3_tier`, `weapon_star`, `first_obtained_at`).
- `public.sensei_inventory`: Stores owned SchaleDB materials (`item_id`, `item_name`, `category`, `rarity`, `count`).
- `public.sensei_raid_records`: Stores Total Assault & Weekly Boss clear records (`boss_id`, `boss_name`, `difficulty`, `best_score`, `total_damage`, `clears`).

### Complete Method Reference:
- `normalizeJid(jid: string): string`: Normalizes phone digits and WhatsApp JIDs.
- `resolveUserJid(agentId: string, inputJid: string): Promise<string>`: Resolves canonical Sensei user JID from input numbers or JIDs.
- `getOrCreateProfile(agentId, userJid): Promise<SenseiProfile>`: Retrieves or initializes Sensei profile with 1,200 Pyroxenes, 500,000 Credits, 3 Raid Tickets, and 3 Bounty Tickets.
- `claimDaily(agentId, userJid)`: Claims daily 1,200 Pyroxenes + 250,000 Credits + Activity Reports (`#11`, `#12`) and refreshes Raid/Bounty tickets (daily reset at 06:00 WIB).
- `refreshTicketsIfNeeded(agentId, userJid): Promise<SenseiProfile>`: Automatically restores 3 Raid Tickets and 3 Bounty Tickets after 06:00 WIB daily reset.
- `processGachaPull(agentId, userJid, cost, pullCount)`: Deducts Pyroxenes and increments Spark Points & pull counters.
- `saveStudent(agentId, userJid, studentId, studentName, starGrade)`: Adds a pulled student or increments duplicate `count`.
- `getCollection(agentId, userJid): Promise<SenseiStudentItem[]>`: Returns all students owned by the Sensei with full progression columns.
- `getOwnedStudent(agentId, userJid, studentId): Promise<SenseiStudentItem | null>`: Fetches a single owned student with progression state.
- `redeemSpark(agentId, userJid)`: Exchanges 200 Spark Points for a guaranteed 3★ student.
- `addPyroxenes(agentId, userJid, amount)` / `setPyroxenes(agentId, userJid, pyroxenes)`: Modifies Pyroxene balance.
- `addCredits(agentId, userJid, amount): Promise<SenseiProfile>`: Adds or adjusts Sensei Credit balance.
- `getInventory(agentId, userJid): Promise<SenseiInventoryItem[]>`: Fetches all owned SchaleDB upgrade materials and blueprints.
- `addInventoryItems(agentId, userJid, items)`: Adds SchaleDB materials (Activity Reports, Blu-rays, Tech Notes, Oopart Artifacts, Equipment Blueprints) to `public.sensei_inventory`.
- `consumeMaterialsAndCredits(agentId, userJid, requirements, creditCost)`: Atomically validates and deducts required SchaleDB items and Credits.
- `updateStudentProgression(agentId, userJid, studentId, updates)`: Updates a student's Level, EX/Sub Skill Levels, Equipment Tiers (`T1-T9`), Star Grade (`1★-5★`), Duplicate Count, or Unique Weapon (`UE 1★-3★`).
- `setSquad(agentId, userJid, strikers, specials)`: Saves Sensei's custom `4 Strikers + 2 Specials` formation.
- `consumeTicket(agentId, userJid, type: "raid" | "bounty")`: Deducts 1 Raid or Weekly Boss Bounty ticket.
- `recordRaidBattle(agentId, userJid, bossId, bossName, difficulty, score, damage, cleared)`: Records Total Assault Raid score, cumulative damage, and clear count.
- `getRaidLeaderboard(agentId, bossId?): Promise<SenseiRaidRecord[]>`: Returns top 10 Sensei Raid scores.
- `settlePvpDuel(agentId, winnerJid, loserJid, betAmount, currency)`: Atomically transfers wagered Pyroxenes or Credits from Loser to Winner and updates `pvp_wins` / `pvp_losses`.
- `getElephSummary(agentId, userJid)` & `claimElephToPyroxenes(agentId, userJid, filter?)`: Converts extra duplicate students into Pyroxenes.

---

## 2. MomoTalk Repository (`momo.repository.ts`)

### Related Tables:
- `public.sensei_bonds`: Tracks `bondLevel`, `bondExp`, `totalTalks`, and `lastTalk` per student and user.

### Complete Method Reference:
- `getRequiredExp(level: number): number`: Calculates EXP needed for next bond rank (`100 * level`, cap at level 20).
- `getBond(agentId, userJid, studentId, studentName): Promise<SenseiBond>`: Fetches or creates initial Bond Level 1.
- `addBondExp(agentId, userJid, studentId, studentName, expGain)`: Adds conversation EXP, calculates level progression, awards 50 Pyroxenes per rank up, and unlocks Live2D Memorial Lobby at Level 5.
- `setSession(agentId, userJid, session: MomoSession)` / `getSession(agentId, userJid)` / `clearSession(agentId, userJid)`: Caches active multi-turn MomoTalk dialogue session (5-minute TTL).
