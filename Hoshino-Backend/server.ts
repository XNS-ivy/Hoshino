import { Elysia } from 'elysia'
import { agentRoute } from '@routes/agent-routes'
import { wsRoute } from '@routes/ws-routes'
import { cors } from '@elysiajs/cors'

const port = (Number(process.env.BACKEND_PORT) ?? 3010)

export const server = new Elysia()
    .use(cors())
    .use(agentRoute)
    .use(wsRoute)
    .listen(port, () => {
        logger.info('/server.ts', `Server running on port http://localhost:${port}`)
    })
logger.info('/server.ts', `Loaded API :`)
logger.info('/server.ts', server.routes.map(r => `${r.method} ${r.path}`))