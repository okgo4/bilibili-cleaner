import { coreCheck } from '@/modules/filters/core/core'
import config from '@/config'
import { Group } from '@/types/collection'
import { ContextMenuTargetHandler, FilterContextMenu, IMainFilter, SelectorResult, SubFilterPair } from '@/types/filter'
import { logger } from '@/utils/logger'
import { GM_getValue, GM_setValue } from '$'
import { orderedUniq, showEle, waitForEle } from '@/utils/tool'
import { ArticleAuthorFilter, ArticleAuthorKeywordFilter } from '../subFilters/black'
import { ArticleAuthorKeywordWhiteFilter, ArticleAuthorWhiteFilter } from '../subFilters/white'

const GM_KEYS = {
    black: {
        author: {
            statusKey: 'search-article-author-filter-status',
            valueKey: 'search-article-author-filter-value',
        },
        authorKeyword: {
            statusKey: 'search-article-author-keyword-filter-status',
            valueKey: 'search-article-author-keyword-filter-value',
        },
    },
    white: {
        author: {
            statusKey: 'search-article-author-whitelist-filter-status',
            valueKey: 'search-article-author-whitelist-filter-value',
        },
        authorKeyword: {
            statusKey: 'search-article-author-keyword-whitelist-filter-status',
            valueKey: 'search-article-author-keyword-whitelist-filter-value',
        },
    },
}

const selectorFns = {
    author: (card: HTMLElement): SelectorResult => {
        return card.querySelector('.atc-author .lh_xs')?.textContent?.trim()
    },
}

class ArticleFilterSearch implements IMainFilter {
    target: HTMLElement | undefined
    articleAuthorFilter = new ArticleAuthorFilter()
    articleAuthorKeywordFilter = new ArticleAuthorKeywordFilter()
    articleAuthorWhiteFilter = new ArticleAuthorWhiteFilter()
    articleAuthorKeywordWhiteFilter = new ArticleAuthorKeywordWhiteFilter()

    init() {
        const blacklist = GM_getValue<string[]>(GM_KEYS.black.author.valueKey, [])
        const keywordBlacklist = GM_getValue<string[]>(GM_KEYS.black.authorKeyword.valueKey, [])
        const whitelist = GM_getValue<string[]>(GM_KEYS.white.author.valueKey, [])
        const keywordWhitelist = GM_getValue<string[]>(GM_KEYS.white.authorKeyword.valueKey, [])
        logger.log(
            `ArticleFilterSearch init, blacklist=${JSON.stringify(blacklist)}, keyword=${JSON.stringify(keywordBlacklist)}, whitelist=${JSON.stringify(whitelist)}, keywordWhite=${JSON.stringify(keywordWhitelist)}`,
        )
        this.articleAuthorFilter.setParam(blacklist)
        this.articleAuthorKeywordFilter.setParam(keywordBlacklist)
        this.articleAuthorWhiteFilter.setParam(whitelist)
        this.articleAuthorKeywordWhiteFilter.setParam(keywordWhitelist)
    }

    /** 仅过滤 div.media-list 的子元素，不扫描全页面 */
    private async checkFilter() {
        if (!this.target) {
            return
        }

        const mediaList = this.target.querySelector<HTMLElement>('div.media-list')
        if (!mediaList) {
            return
        }

        let revertAll = false
        if (
            !this.articleAuthorFilter.isEnable &&
            !this.articleAuthorKeywordFilter.isEnable &&
            !this.articleAuthorWhiteFilter.isEnable &&
            !this.articleAuthorKeywordWhiteFilter.isEnable
        ) {
            revertAll = true
        }
        const timer = performance.now()

        const cards = Array.from(mediaList.children) as HTMLElement[]
        const allAuthors = cards.map((c) => selectorFns.author(c)).filter(Boolean)
        logger.log(`ArticleFilterSearch authors on page: [${allAuthors.join(', ')}]`)
        logger.log(
            `ArticleFilterSearch checkFilter, cards=${cards.length}, revertAll=${revertAll}, black=${this.articleAuthorFilter.isEnable}, keyword=${this.articleAuthorKeywordFilter.isEnable}, white=${this.articleAuthorWhiteFilter.isEnable}`,
        )
        if (!cards.length) {
            return
        }
        if (revertAll) {
            cards.forEach((c) => showEle(c, 'sign'))
            return
        }

        if (config.isDebugMode) {
            cards.forEach((c) => {
                logger.debug(`ArticleFilterSearch author: ${selectorFns.author(c)}`)
            })
        }

        const blackPairs: SubFilterPair[] = []
        this.articleAuthorFilter.isEnable && blackPairs.push([this.articleAuthorFilter, selectorFns.author])
        this.articleAuthorKeywordFilter.isEnable &&
            blackPairs.push([this.articleAuthorKeywordFilter, selectorFns.author])

        const whitePairs: SubFilterPair[] = []
        this.articleAuthorWhiteFilter.isEnable && whitePairs.push([this.articleAuthorWhiteFilter, selectorFns.author])
        this.articleAuthorKeywordWhiteFilter.isEnable &&
            whitePairs.push([this.articleAuthorKeywordWhiteFilter, selectorFns.author])

        const blackCnt = await coreCheck(cards, true, 'sign', blackPairs, whitePairs)
        const time = (performance.now() - timer).toFixed(1)
        logger.debug(`ArticleFilterSearch hide ${blackCnt} in ${cards.length} cards, time=${time}`)
    }

    observe() {
        logger.log('ArticleFilterSearch observe')
        waitForEle(document, 'div.search-content', (node: HTMLElement): boolean => {
            return node.className.includes('search-content')
        }).then((ele) => {
            if (!ele) {
                return
            }

            logger.log('ArticleFilterSearch div.search-content found')
            this.target = ele
            this.checkFilter()

            new MutationObserver(() => {
                this.checkFilter()
            }).observe(this.target, { childList: true, subtree: true })
        })
    }

    /** 兼容 IMainFilter 接口 */
    check(_mode?: 'full' | 'incr') {
        this.checkFilter()
    }

    checkFull() {
        this.checkFilter()
    }
}

const mainFilter = new ArticleFilterSearch()

export const articleFilterEntry = async () => {
    mainFilter.init()
    mainFilter.observe()
}

export const articleFilterGroups: Group[] = [
    {
        name: '作者过滤',
        items: [
            {
                type: 'switch',
                id: GM_KEYS.black.author.statusKey,
                name: '启用 作者过滤',
                noStyle: true,
                enableFn: () => {
                    mainFilter.articleAuthorFilter.enable()
                    mainFilter.checkFull()
                },
                disableFn: () => {
                    mainFilter.articleAuthorFilter.disable()
                    mainFilter.checkFull()
                },
            },
            {
                type: 'editor',
                id: GM_KEYS.black.author.valueKey,
                name: '编辑 UP主黑名单',
                description: ['右键屏蔽的作者会出现在首行'],
                editorTitle: 'UP主 黑名单',
                editorDescription: ['每行一个UP主昵称，保存时自动去重'],
                saveFn: async () => {
                    mainFilter.articleAuthorFilter.setParam(GM_getValue(GM_KEYS.black.author.valueKey, []))
                    mainFilter.checkFull()
                },
            },
        ],
    },
    {
        name: '作者昵称关键词过滤',
        items: [
            {
                type: 'switch',
                id: GM_KEYS.black.authorKeyword.statusKey,
                name: '启用 作者昵称关键词过滤',
                noStyle: true,
                enableFn: () => {
                    mainFilter.articleAuthorKeywordFilter.enable()
                    mainFilter.checkFull()
                },
                disableFn: () => {
                    mainFilter.articleAuthorKeywordFilter.disable()
                    mainFilter.checkFull()
                },
            },
            {
                type: 'editor',
                id: GM_KEYS.black.authorKeyword.valueKey,
                name: '编辑 作者昵称关键词黑名单',
                editorTitle: '作者昵称关键词 黑名单',
                editorDescription: [
                    '每行一个关键词或正则，不区分大小写、全半角',
                    '请勿使用过于激进的关键词或正则',
                    '正则默认 ius 模式，无需 flag，语法：/abc|\\d+/',
                ],
                saveFn: async () => {
                    mainFilter.articleAuthorKeywordFilter.setParam(
                        GM_getValue(GM_KEYS.black.authorKeyword.valueKey, []),
                    )
                    mainFilter.checkFull()
                },
            },
        ],
    },
    {
        name: '白名单 免过滤',
        items: [
            {
                type: 'switch',
                id: GM_KEYS.white.author.statusKey,
                name: '启用 作者白名单',
                noStyle: true,
                enableFn: () => {
                    mainFilter.articleAuthorWhiteFilter.enable()
                    mainFilter.checkFull()
                },
                disableFn: () => {
                    mainFilter.articleAuthorWhiteFilter.disable()
                    mainFilter.checkFull()
                },
            },
            {
                type: 'editor',
                id: GM_KEYS.white.author.valueKey,
                name: '编辑 UP主白名单',
                editorTitle: 'UP主 白名单',
                editorDescription: ['每行一个UP主昵称，保存时自动去重'],
                saveFn: async () => {
                    mainFilter.articleAuthorWhiteFilter.setParam(GM_getValue(GM_KEYS.white.author.valueKey, []))
                    mainFilter.checkFull()
                },
            },
            {
                type: 'switch',
                id: GM_KEYS.white.authorKeyword.statusKey,
                name: '启用 作者昵称关键词白名单',
                noStyle: true,
                enableFn: () => {
                    mainFilter.articleAuthorKeywordWhiteFilter.enable()
                    mainFilter.checkFull()
                },
                disableFn: () => {
                    mainFilter.articleAuthorKeywordWhiteFilter.disable()
                    mainFilter.checkFull()
                },
            },
            {
                type: 'editor',
                id: GM_KEYS.white.authorKeyword.valueKey,
                name: '编辑 作者昵称关键词白名单',
                editorTitle: '作者昵称关键词 白名单',
                editorDescription: ['每行一个关键词或正则，不区分大小写、全半角'],
                saveFn: async () => {
                    mainFilter.articleAuthorKeywordWhiteFilter.setParam(
                        GM_getValue(GM_KEYS.white.authorKeyword.valueKey, []),
                    )
                    mainFilter.checkFull()
                },
            },
        ],
    },
]

export const articleFilterHandler: ContextMenuTargetHandler = (target: HTMLElement): FilterContextMenu[] => {
    if (location.host !== 'search.bilibili.com') {
        return []
    }

    const menus: FilterContextMenu[] = []
    const authorEl = target.closest('.atc-author')
    if (authorEl) {
        const author = authorEl.querySelector('.lh_xs')?.textContent?.trim()
        if (author) {
            if (mainFilter.articleAuthorFilter.isEnable) {
                menus.push({
                    name: `屏蔽作者：${author}`,
                    fn: async () => {
                        try {
                            mainFilter.articleAuthorFilter.addParam(author)
                            mainFilter.checkFull()
                            const arr: string[] = GM_getValue(GM_KEYS.black.author.valueKey, [])
                            arr.unshift(author)
                            GM_setValue(GM_KEYS.black.author.valueKey, orderedUniq(arr))
                        } catch (err) {
                            logger.error(`articleFilterHandler add author ${author} failed`, err)
                        }
                    },
                })
            }
            if (mainFilter.articleAuthorWhiteFilter.isEnable) {
                menus.push({
                    name: `将作者加入白名单`,
                    fn: async () => {
                        try {
                            mainFilter.articleAuthorWhiteFilter.addParam(author)
                            mainFilter.checkFull()
                            const arr: string[] = GM_getValue(GM_KEYS.white.author.valueKey, [])
                            arr.unshift(author)
                            GM_setValue(GM_KEYS.white.author.valueKey, orderedUniq(arr))
                        } catch (err) {
                            logger.error(`articleFilterHandler add white author ${author} failed`, err)
                        }
                    },
                })
            }
        }
    }

    return menus
}
