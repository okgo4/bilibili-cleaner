import { ISubFilter, SelectorFn } from '@/types/filter'
import { upStatFetcher } from '../upStatFetcher'
import { logger } from '@/utils/logger'

export class VideoUploaderStatFilter implements ISubFilter {
    isEnable = false
    private minVideoCount = 100
    private maxRatio = 2.0

    setMinVideoCount(value: number) {
        this.minVideoCount = value
    }

    setMaxRatio(value: number) {
        this.maxRatio = value
    }

    enable() {
        this.isEnable = true
    }

    disable() {
        this.isEnable = false
    }

    async check(el: HTMLElement, selectorFn: SelectorFn): Promise<void> {
        if (!this.isEnable) return
        const mid = selectorFn(el)
        if (typeof mid !== 'string' || !mid) return

        let stats
        try {
            stats = await upStatFetcher.fetch(mid)
        } catch (err) {
            logger.error('VideoUploaderStatFilter fetch error', err)
            return
        }
        if (!stats) return

        const follower = stats.follower || 1
        const ratio = stats.videoCount / follower

        if (stats.videoCount > this.minVideoCount && ratio > this.maxRatio) {
            throw new Error('upStat matched')
        }
    }
}
