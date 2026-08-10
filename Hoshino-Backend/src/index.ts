import { Elysia } from "elysia"
import "./utils/logger"
import { socketManager } from "./modules/baileys/socket"

const app = new Elysia()
	.get("/", () => ({ status: "online", service: "Hoshino Backend" }))
	.listen(3000)

// Initialize database schema on startup
socketManager
	.initDatabase()
	.then(() => {
		logger.system(
			"/index.ts",
			`Hoshino Backend running at ${app.server?.hostname}:${app.server?.port}`,
		)
	})
	.catch((err) => {
		logger.error("/index.ts", `Failed to initialize database: ${err}`)
	})
