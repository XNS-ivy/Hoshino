import { bootAllAgents, registerAgent, stopAgent, getRunningAgents, isRunning, reRegisterAgent, onPairingCode } from '@modules/baileys/main'

async function main() {
    await bootAllAgents()
}


main()