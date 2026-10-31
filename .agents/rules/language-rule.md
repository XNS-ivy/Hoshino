---
trigger: always_on
description: "Language rule enforcing English for all source code, comments, docstrings, and documentation"
---

# Language Rule: English for Code & Documentation

## 1. Core Principle
Regardless of the language used by the user in conversational prompts (including Indonesian), **all code and documentation produced or maintained by the agent MUST strictly be written in English**.

---

## 2. Code Implementation Rules
1. **Identifiers**: All variables, constants, functions, classes, interfaces, types, and database entities must use clear, descriptive English names.
2. **Inline Comments & JSDoc**: All explanatory comments, docstrings, type annotations, and TODO notes must be written in English.
3. **Commit Messages & Logs**: Internal logger strings, debug messages, and git commit descriptions must be formatted in English.

---

## 3. Documentation Rules
1. **Memory & Docs Vault (`docs/`)**: All markdown documentation, architecture diagrams (Mermaid labels), Obsidian notes, Map of Contents (MOC), and technical specifications must be written in professional English.
2. **README & Guides**: All project readmes, setup guides, and API documentation files across the workspace must be in English.
3. **Conversational vs Output Separation**:
   - The agent may reply conversationally to the user in Indonesian if the user speaks in Indonesian.
   - However, **any code written, modified, or generated, and any markdown documentation file created or updated must ALWAYS be in English**.
