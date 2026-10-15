---
tags: [memory, frontend, components, react, ui]
aliases: [Frontend Components, components.md]
updated: 2026-10-15
---

# 🎨 Frontend Components & Modals (`src/components/`)

> [!NOTE]
> Documentation for React visual components, bot settings configuration tabs, and web chat console interface.

---

## 1. Dashboard (`src/components/dashboard/`)
- `Navbar.tsx`: Application top navigation header, Hoshino branding, and backend health status indicator.
- `BackendStatus.tsx`: Periodic polling (every 5 seconds) against `GET /` to detect backend service health.
- `MetricsSummary.tsx`: Aggregate metrics (Total Agents, Online Agents, Offline Agents, Total Chats).
- `MetricCard.tsx`: Reusable metric card with icon, title, numeric metric, and status badge.
- `AgentGrid.tsx`: Responsive CSS grid rendering the collection of agent cards.
- `AgentCard.tsx`: Individual agent card displaying status badge (`connected`, `connecting`, `qr_code`, `pairing_code`, `disconnected`), Reconnect, Delete, and View Console action buttons.

---

## 2. Modals (`src/components/modals/`)
- `CreateAgentModal.tsx`: Creation modal for new agent sessions with choice of QR Code scanning or 8-digit Pairing Code phone number input.
- `DeleteAgentModal.tsx`: Deletion confirmation dialog warning of database cascade purge.
- `AuthModal.tsx`: Live connection modal rendering animated QR code or pairing code in real time via WebSocket.
- `QRCodeGuide.tsx`: Visual instructions for scanning QR codes in WhatsApp mobile app (`Settings ➔ Linked Devices ➔ Link a Device`).
- `PairingCodeGuide.tsx`: Visual guide for entering 8-digit pairing codes on the mobile device.

---

## 3. Settings Tabs (`src/components/settings/`)
- `GeneralSettingsTab.tsx`: Custom prefix configuration (`.`, `!`, etc.), auto-read blue ticks toggle, typing indicator simulation, and welcome/goodbye message templates.
- `OwnersTab.tsx`: Management of bot owners and administrators (`role: owner | master`).
- `BlacklistTab.tsx`: Management of blacklisted phone numbers blocked from bot commands.
- `AutoDeleteTab.tsx`: Management of target phone numbers whose group messages are automatically deleted.
- `CommandTogglesTab.tsx`: Toggle switches for enabling or disabling individual bot commands.
- `GroupSettingsTab.tsx`: Per-group controls for listening status (`botEnabled`), welcome messages, and group-specific prefixes.
- `SenseiTab.tsx`: Blue Archive dashboard for inspecting Sensei player profiles, student roster inventory, Pyroxene adjustments, and profile resets.
- `ContactSelector.tsx`: Autocomplete dropdown selector for known WhatsApp contacts.

---

## 4. Live Chat Console (`src/components/chat/`)
- `ChatSidebar.tsx`: Active chat list (`public.chats`), unread message badges, avatar icons, and contact search.
- `ChatItem.tsx`: Individual chat conversation row with timestamp and message snippet.
- `ChatMessageList.tsx`: Scrollable chat viewport rendering messages in ascending chronological order.
- `ChatMessageBubble.tsx`: Chat bubble component for inbound and outbound messages, supporting bold/italic markdown, media previews, WebP stickers, file downloads, and quoted reply headers.
- `QuotedPreviewBar.tsx`: Preview bar displaying the message currently being replied to.
- `ChatInputFooter.tsx`: Message input bar for composing text, attaching media (image, video, document), and sending.
