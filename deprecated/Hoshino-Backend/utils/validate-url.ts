const URL_PATTERNS = {
    twitter: /^https?:\/\/(www\.)?(x|twitter)\.com\//i,
    instagram: /^https?:\/\/(www\.)?instagram\.com\//i,
    tiktok: /^https?:\/\/(www\.|vm\.)?tiktok\.com\//i,
    youtube: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i,
    facebook: /^https?:\/\/(www\.|m\.)?facebook\.com\//i,
} as const

export function isValidUrl(url: string, platform: keyof typeof URL_PATTERNS): boolean {
    return URL_PATTERNS[platform]?.test(url) ?? false
}

export function normalizeUrl(url: string): string {
    try {
        const u = new URL(url)

        u.protocol = 'https:'
        const needsWww = ['youtube.com', 'instagram.com', 'facebook.com', 'twitter.com']
        if (needsWww.some(d => u.hostname === d)) {
            u.hostname = `www.${u.hostname}`
        }
        return u.toString()
    } catch {
        return url
    }
}