export function convertLID(lid: string | null): string | null {
    if (!lid) return null
    const result = (lid
        .replace(/@lid$/i, '')
        .replace(/^@/, '')
        .split(':')[0]
        ?.trim()) || null
    return result || null
}