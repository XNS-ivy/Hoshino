import hoshino from '@modules/baileys/main'

hoshino.registerAgent('2', null)

async function main() {
    await hoshino.bootAllAgents()
}

main()