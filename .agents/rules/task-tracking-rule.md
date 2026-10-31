---
trigger: always_on
description: "Task Tracking & Pre-Implementation Thinking Rule for maintaining ongoing, pending, and solved tasks with initial technical plans in docs/tasks.md"
---

# Task Tracking & Thinking Rule (Obsidian Style)

## 1. Core Principle
To maintain persistent visibility and structured engineering across sessions, the AI Agent MUST:
1. Track all ongoing, pending, and solved tasks inside **`docs/tasks.md`**.
2. Perform a **Pre-Implementation Thinking (Initial Architecture Plan)** step and document the technical blueprint inside `docs/tasks.md` **before** writing or modifying production source code for new features or complex tasks.

---

## 2. Language & Formatting Requirement
- **Strict English**: In compliance with `language-rule.md` and `internal-docs-memory.md`, all task titles, descriptions, thinking blueprints, technical notes, and status updates in `docs/tasks.md` MUST be written in English.
- **Obsidian Conventions**:
  - Maintain valid YAML frontmatter (`tags`, `aliases`, `updated`).
  - Use Obsidian Wikilinks (`[[Path/To/Note|Label]]`) when referencing affected modules or files in `docs/`.
  - Use Obsidian Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`) and Mermaid diagrams where appropriate.

---

## 3. Task Lifecycle & Status Definitions

Every task recorded in `docs/tasks.md` must have a clear status indicator:
- **⏳ Pending (`[ ]`)**: Task has been requested, registered, and analyzed in the **Thinking & Initial Plan** section, awaiting user confirmation or execution start.
- **🔄 In Progress (`[/]`)**: Task is actively being implemented in the current session.
- **✅ Solved (`[x]`)**: Task has been fully implemented and synchronized with the internal memory documentation (`docs/`), awaiting final user runtime verification.
- **🗑️ Pruned / Cleaned Up**: Once the user confirms a solved task is tested and running without issues, it is removed from `docs/tasks.md`.

---

## 4. AI Agent Workflow Rules

1. **Check Tasks on Session Start / New Request**:
   - Consult `docs/tasks.md` when starting a task or resuming work to understand pending items, active architectural plans, and recent changes.

2. **Register New Tasks First (`Pending` / `In Progress`)**:
   - When the user assigns a new feature, bugfix, refactoring, or multi-step task, **first** add it to the **Ongoing & Pending Tasks** table and checklist in `docs/tasks.md` before executing code changes.

3. **Write Initial Thinking & Technical Plan (`🧠 Thinking & Initial Plan`)**:
   - For every new feature or complex task, create or update a dedicated sub-section under **`## 🧠 Thinking & Initial Architecture Plans`** in `docs/tasks.md`.
   - Each thinking plan must outline:
     - **Objective & Scope**: What the feature achieves for the user/client.
     - **Data Sources / External APIs**: Which APIs, scrapers, or local JSON caches are used (e.g., SchaleDB, Wiki APIs).
     - **Database Schema Changes**: New tables or columns required in PostgreSQL (`src/utils/db.ts`).
     - **Module & Command Design**: New or updated repositories, utilities, and command triggers.
     - **Edge Cases & Balancing**: Cooldowns, economy anti-abuse, fallback mechanisms.

4. **Mark as Solved Upon Completion (`Solved`)**:
   - Once a task is completed by the agent, update its status to `✅ Solved` (`[x]`), move it to the **Solved Tasks** section, include the completion date (`YYYY-MM-DD`), and link the affected `docs/` memory notes until the user verifies it in production.

5. **Prune / Delete Tasks Confirmed Running Without Problems**:
   - Once the user confirms that a solved task (or all solved tasks) has been tested and is running without problems, **delete/prune** the confirmed task entries and their corresponding **Thinking & Initial Architecture Plans** from `docs/tasks.md`.
   - This keeps `docs/tasks.md` lightweight and focused strictly on active or awaiting-verification work, while permanent technical documentation remains preserved in the respective module notes under `docs/`.

---

## 5. Standard Structure for `docs/tasks.md`

```markdown
---
tags: [memory, tasks, tracker, roadmap, hoshino]
aliases: [Task Tracker, Ongoing Tasks, Project Tasks]
updated: YYYY-MM-DD
---

# 📋 Hoshino Workspace - Task Tracker

> [!NOTE]
> Central ledger tracking **Pending**, **In Progress**, and **Solved** tasks across the Hoshino workspace, including initial thinking blueprints.

## ⏳ Ongoing & Pending Tasks

| ID | Task Description | Status | Related Modules | Updated |
| :--- | :--- | :--- | :--- | :--- |
| `TASK-002` | Example pending task description | ⏳ Pending | [[Hoshino-Backend/README\|Backend]] | YYYY-MM-DD |

### Active Checklist
- [ ] **`TASK-002`**: Example pending task description (`Pending`)

---

## 🧠 Thinking & Initial Architecture Plans

### `TASK-002`: Feature Name
- **Objective**: ...
- **Data Source / Scraper**: ...
- **Database Schema**: ...
- **Commands & Flow**: ...

---

## ✅ Solved Tasks

| ID | Task Description | Status | Related Modules | Solved Date |
| :--- | :--- | :--- | :--- | :--- |
| `TASK-001` | Example solved task description | ✅ Solved | [[README\|Memory Hub]] | YYYY-MM-DD |
```
