import { cors } from "@elysiajs/cors"
import { socketManager } from "@modules/baileys/socket"
import { agentRoutes } from "@routes/agents"
import { messageRoutes } from "@routes/messages"
import { Elysia } from "elysia"
import "./utils/logger"

const PORT = Number(process.env.PORT) || 3030

const app = new Elysia()
	.use(cors())
	.get("/", () => ({ status: "online", service: "Hoshino Backend" }))
	.use(agentRoutes)
	.use(messageRoutes)
	.listen(PORT)

// Initialize database schema and boot active agents on startup
socketManager
	.initDatabase()
	.then(async () => {
		logger.system(
			"/index.ts",
			`Hoshino Backend running at http://${app.server?.hostname}:${app.server?.port}`,
		)
		await socketManager.bootAllAgents()
	})
	.catch((err) => {
		logger.error("/index.ts", `Failed to initialize database: ${err}`)
	})
