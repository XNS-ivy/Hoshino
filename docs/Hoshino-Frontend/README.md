---
tags: [moc, frontend, react, internal-memory]
aliases: [Frontend Architecture Hub]
updated: 2026-10-15
---

# 💻 Hoshino Frontend - Internal Memory MOC

> [!NOTE]
> Web Console dashboard for managing multi-instance Hoshino agents, live QR code scanning, web chat console, and multi-tenant settings. Built with **React**, **Vite**, **TypeScript**, and **Modern CSS**.

---

## 🗂️ Frontend File Structure

```
Hoshino-Frontend/src/
├── App.tsx                     # React Router: '/' (AgentListPage), '/agents/:agentId' (AgentDetailPage)
├── types.ts                    # TypeScript definitions (Agent, ChatMessage, WSEvent, SenseiProfileItem)
├── services/
│   └── api.ts                  # Fetch API wrapper for backend endpoints (:3040)
├── pages/
│   ├── AgentListPage.tsx       # Main dashboard (Agent grid, metric summary, backend health status)
│   ├── AgentDetailPage.tsx     # Agent console (Chat console, settings tabs, QR scanner)
│   └── NotFoundPage.tsx        # 404 fallback page
└── components/
    ├── dashboard/              # Navbar, MetricCard, MetricsSummary, AgentGrid, AgentCard, BackendStatus
    ├── modals/                 # CreateAgentModal, DeleteAgentModal, AuthModal, PairingCodeGuide, QRCodeGuide
    ├── settings/               # GeneralSettingsTab, OwnersTab, BlacklistTab, AutoDeleteTab, CommandTogglesTab, GroupSettingsTab, SenseiTab, ContactSelector
    └── chat/                   # ChatSidebar, ChatItem, ChatMessageList, ChatMessageBubble, ChatInputFooter, QuotedPreviewBar
```

---

## 🧭 Navigation Map

- [[Hoshino-Frontend/services/api|API Client (`src/services/api.ts`)]]: REST API wrapper (`fetchAgents`, `createAgent`, `reconnectAgent`, `deleteAgent`).
- [[Hoshino-Frontend/components/components|UI Components & Modals]]: Visual components, configuration tabs, and web chat console interface.
