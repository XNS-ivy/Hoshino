import { cors } from "@elysiajs/cors"
import { socketManager } from "@modules/baileys/socket"
import { agentRoutes } from "@routes/agents"
import { messageRoutes } from "@routes/messages"
import { Elysia } from "elysia"
import "./utils/logger"

const app = new Elysia()
	.use(cors())
	.get("/", () => ({ status: "online", service: "Hoshino Backend" }))
	.use(agentRoutes)
	.use(messageRoutes)
	.listen(3000)

// Initialize database schema on startup
socketManager
	.initDatabase()
	.then(() => {
		logger.system(
			"/index.ts",
			`Hoshino Backend running at http://${app.server?.hostname}:${app.server?.port}`,
		)
	})
	.catch((err) => {
		logger.error("/index.ts", `Failed to initialize database: ${err}`)
	})
