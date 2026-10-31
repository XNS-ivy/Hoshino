---
trigger: always_on
description: "Internal Memory Documentation Rule (Obsidian Style) with English language requirement"
---

# Internal Memory Documentation Rule (Obsidian Style)

## 1. Role & Core Concept (Internal Memory)
The `docs/` directory serves as the **Internal Memory (Persistent Mental Map)** for the AI Agent.
Its primary objectives are:
- **Prevent full codebase re-reading**: Avoid scanning dozens or hundreds of raw source code files (`.ts`, `.tsx`, etc.) for every incoming task.
- **Act as the primary source of truth**: Use `docs/` as the first reference when looking up functions, workflows, signatures, or module dependencies.

---

## 2. Language Requirement (Strict English)
- **All documentation files created or maintained in `docs/` MUST be written in English**, including descriptions, tables, and Mermaid diagram annotations, regardless of the user's conversational prompt language (e.g. Indonesian).
- All source code, identifiers, and inline comments must likewise be in English.

---

## 3. AI Agent Workflow Rules

1. **Check Memory First**:
   - Before executing broad grep searches or opening numerous source files, open the corresponding index or documentation note in `docs/`.
   - Read function signatures, parameters, return types, and module relationships directly from the memory documentation.

2. **Mirror Workspace Structure**:
   - The directory hierarchy and naming in `docs/` **must strictly mirror** the workspace structure (e.g., `Hoshino-Backend/src/modules/baileys/socket.ts` maps to `docs/Hoshino-Backend/modules/baileys/socket.md`).
   - Every module or feature folder must have an index file or Map of Content (MOC).

3. **Document Down to Function Level**:
   Each documentation note must detail:
   - **Role & Architectural Scope**: Purpose and responsibilities of the file.
   - **Exports & Interfaces**: Class, interface, and type definitions.
   - **Comprehensive Function/Method List**:
     - Exact signature (parameters, types, return type).
     - Internal logic (operations performed, SQL queries, Baileys/WS events, caching).
     - Error handling & edge cases.
     - Cross-references / calls to other modules.

4. **Continuous Synchronization**:
   - Whenever a script file is created, updated, refactored, or deleted:
     **The AI MUST immediately update the corresponding memory note in `docs/`**.
   - Do not delete existing documentation without good reason (adhere to `markdown-rule.md`).

---

## 4. Obsidian Markdown Style (`readme.md obsidian`)

All documentation files in `docs/` must follow **Obsidian Vault** conventions:

1. **YAML Frontmatter**:
   ```yaml
   ---
   tags: [memory, backend, socket, baileys]
   aliases: [SocketManager, Socket Service]
   updated: YYYY-MM-DD
   ---
   ```

2. **Obsidian Wikilinks**:
   - Use vault-relative paths `[[Subfolder/NoteName|Label]]` (e.g. `[[Hoshino-Backend/modules/baileys/socket|SocketManager]]` without the `docs/` prefix, since `docs/` is the root of the Obsidian vault) or anchor links `[[Path/To/Doc#MethodName|method()]]` to connect notes.

3. **Obsidian Callouts**:
   - Use `> [!NOTE]`, `> [!IMPORTANT]`, `> [!TIP]`, `> [!WARNING]`.

4. **Map of Content (MOC)**:
   - `docs/README.md` is the Root MOC for the entire workspace.
   - Subfolder READMEs act as domain-specific MOCs.
