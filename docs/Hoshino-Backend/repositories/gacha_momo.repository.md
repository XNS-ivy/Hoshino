---
tags: [memory, backend, repositories, gacha, bluearchive, momotalk]
aliases: [GachaRepository, MomoRepository, bluearchive-db]
updated: 2026-10-15
---

# 🎲 Gacha & MomoTalk Repositories (`src/repositories/gacha.repository.ts & momo.repository.ts`)

> [!NOTE]
> These files power the interactive **Blue Archive** game features: student gacha simulation, pyroxene economy, spark pity system, student roster inventory, and interactive MomoTalk conversations with bond level progression.

---

## 1. Gacha Repository (`gacha.repository.ts`)

### Related Tables:
- `public.sensei_profiles`: Stores pyroxenes, sparkPoints, totalPulls, and lastDaily per user and agent.
- `public.sensei_students`: Stores student roster collection (studentId, studentName, starGrade, count, firstObtainedAt).

### Complete Method Reference:
- `normalizeJid(jid: string): string`: Normalizes phone digits (e.g., `08...` ➔ `62...`) and WhatsApp JIDs.
- `resolveUserJid(agentId: string, inputJid: string): Promise<string>`: Resolves canonical Sensei user JID from input numbers or JIDs.
- `getProfile(agentId, userJid): Promise<SenseiProfile>`: Retrieves or initializes Sensei profile with 1200 complimentary starter Pyroxenes.
- `claimDaily(agentId, userJid): Promise<{ success: boolean, pyroxenes: number, nextClaimAt?: Date }>`: Claims daily 1,200 Pyroxenes (24-hour cooldown).
- `addPulls(agentId, userJid, results, cost, sparkGain): Promise<void>`: Atomic pull transaction (deducts pyroxenes, adds spark points, increments student collection).
- `getStudents(agentId, userJid): Promise<SenseiStudentItem[]>`: Returns all students owned by the user.
- `redeemSpark(agentId, userJid, studentId, studentName, starGrade): Promise<boolean>`: Exchanges 200 Spark Points for a guaranteed 3-star student.
- `adjustPyroxenes(agentId, userJid, delta): Promise<number>`: Modifies Pyroxene balance directly for admin actions or minigame rewards.

---

## 2. MomoTalk Repository (`momo.repository.ts`)

### Related Tables:
- `public.sensei_bonds`: Tracks bondLevel, bondExp, totalTalks, and lastTalk per student and user.

### Complete Method Reference:
- `getRequiredExp(level: number): number`: Calculates EXP needed for next bond rank (`100 * level`, cap at level 20).
- `getBond(agentId, userJid, studentId, studentName): Promise<SenseiBond>`: Fetches or creates initial Bond Level 1.
- `addBondExp(agentId, userJid, studentId, studentName, expGain): Promise<{ oldLevel, newLevel, pyroxeneReward, unlockedMemorialLobby }>`: Adds conversation EXP, calculates level progression, awards Pyroxenes, and unlocks Live2D Memorial Lobby at Level 9.
- `startMomoSession(agentId, userJid, session: MomoSession): void`: Caches interactive multi-turn dialogue session (5-minute TTL).
- `getActiveSession(agentId, userJid): MomoSession | undefined`: Retrieves active session waiting for user option response (1, 2, or 3).
- `endMomoSession(agentId, userJid): void`: Purges dialogue session upon completion.
