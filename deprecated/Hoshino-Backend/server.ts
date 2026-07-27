import { Elysia } from 'elysia'
import { agentRoute } from '@routes/agent-routes'
import { wsRoute } from '@routes/ws-routes'
import { cors } from '@elysiajs/cors'

const configuredPort = Number(process.env.BACKEND_PORT)
const port = Number.isInteger(configuredPort) && configuredPort > 0
    ? configuredPort
    : 3031
const dashboardFile = Bun.file(new URL('./index.html', import.meta.url))

export const server = new Elysia()
    .use(cors())
    .get('/', () => new Response(dashboardFile, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }))
    .use(agentRoute)
    .use(wsRoute)
    .listen(port, () => {
        logger.info('/server.ts', `Server running on port http://localhost:${port}`)
    })
logger.info('/server.ts', `Loaded API :`)
logger.info('/server.ts', server.routes.map(r => `${r.method} ${r.path}`))
