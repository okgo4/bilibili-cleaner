interface UpStat {
    follower: number
    videoCount: number
}

class UpStatFetcher {
    private cache = new Map<string, UpStat>()
    private pending = new Map<string, Promise<UpStat | null>>()

    async fetch(mid: string): Promise<UpStat | null> {
        const cached = this.cache.get(mid)
        if (cached) return cached

        if (this.pending.has(mid)) {
            return this.pending.get(mid)!
        }

        const promise = this.doFetch(mid)
        this.pending.set(mid, promise)

        try {
            const result = await promise
            if (result) {
                this.cache.set(mid, result)
            }
            return result
        } finally {
            this.pending.delete(mid)
        }
    }

    private async doFetch(mid: string): Promise<UpStat | null> {
        try {
            const [followerRes, videoRes] = await Promise.allSettled([
                fetch(`https://api.bilibili.com/x/relation/stat?vmid=${mid}`, {
                    credentials: 'include',
                }),
                fetch(`https://api.bilibili.com/x/space/navnum?mid=${mid}`, {
                    credentials: 'include',
                }),
            ])

            let follower = 0
            let videoCount = 0

            if (followerRes.status === 'fulfilled' && followerRes.value.ok) {
                const json = await followerRes.value.json()
                follower = json?.data?.follower ?? 0
            }

            if (videoRes.status === 'fulfilled' && videoRes.value.ok) {
                const json = await videoRes.value.json()
                videoCount = json?.data?.video ?? 0
            }

            return { follower, videoCount }
        } catch {
            return null
        }
    }
}

export const upStatFetcher = new UpStatFetcher()
