const BASE = 'http://localhost:3010'

export const api = {
    agent: {
        list: () => fetch(`${BASE}/agent/list`).then(r => r.json()),
        register: (userId: string, phoneNumber?: string) => fetch(`${BASE}/agent/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, phoneNumber })
        }).then(r => r.json()),
        reregister: (userId: string, phoneNumber?: string) => fetch(`${BASE}/agent/reregister`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, phoneNumber })
        }).then(r => r.json()),
        delete: (userId: string) => fetch(`${BASE}/agent/${userId}`, { method: 'DELETE' }).then(r => r.json()),
        qr: (userId: string) => fetch(`${BASE}/agent/${userId}/qr`).then(r => r.json()),
        status: (userId: string) => fetch(`${BASE}/agent/${userId}/status`).then(r => r.json()),
    }
}