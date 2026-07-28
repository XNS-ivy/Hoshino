import { cors } from "@elysiajs/cors"
import { agentRoute } from "@routes/agent-routes"
import { wsRoute } from "@routes/ws-routes"
import { Elysia } from "elysia"

const configuredPort = Number(process.env.BACKEND_PORT)
const port =
	Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3031
const dashboardFile = Bun.file(new URL("../index.html", import.meta.url))

export const server = new Elysia()
	.use(cors())
	.get(
		"/",
		() =>
			new Response(dashboardFile, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			}),
	)
	.use(agentRoute)
	.use(wsRoute)
	.listen(port, () => {
		logger.info(`Server running on port http://localhost:${port}`)
	})

logger.info("Loaded API routes:")
for (const r of server.routes) {
	logger.info(`${r.method} ${r.path}`)
}
