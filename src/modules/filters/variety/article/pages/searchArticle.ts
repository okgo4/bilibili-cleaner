import { coreCheck } from '@/modules/filters/core/core'
import config from '@/config'
import { Group } from '@/types/collection'
import { ContextMenuTargetHandler, FilterContextMenu, IMainFilter, SelectorResult, SubFilterPair } from '@/types/filter'
import { logger } from '@/utils/logger'
import { GM_getValue, GM_setValue } from '$'
import { orderedUniq, showEle, waitForEle } from '@/utils/tool'
import { ArticleAuthorFilter, ArticleAuthorKeywordFilter, ArticleTitleKeywordFilter } from '../subFilters/black'
import { ArticleAuthorWhiteFilter, ArticleTitleKeywordWhiteFilter } from '../subFilters/white'

const GM_KEYS = {
    black: {
        uploader: {
            statusKey: 'search-article-uploader-filter-status',
            valueKey: 'global-article-uploader-filter-value',
        },
        uploaderKeyword: {
            statusKey: 'search-article-uploader-keyword-filter-status',
            valueKey: 'global-article-uploader-keyword-filter-value',
        },
        title: {
            statusKey: 'search-article-title-keyword-filter-status',
            valueKey: 'global-article-title-keyword-filter-value',
        },
    },
    white: {
        uploader: {
            statusKey: 'search-article-uploader-whitelist-filter-status',
            valueKey: 'global-article-uploader-whitelist-filter-value',
        },
        title: {
            statusKey: 'search-article-title-keyword-whitelist-filter-status',
            valueKey: 'global-article-title-keyword-whitelist-filter-value',
        },
    },
}

const selectorFns = {
    author: (card: HTMLElement): SelectorResult => {
        return card.querySelector('.atc-author .lh_xs')?.textContent?.trim()
    },
    title: (card: HTMLElement): SelectorResult => {
        return card.querySelector('.i_card_title a')?.getAttribute('title')?.trim()
    },
}

class ArticleFilterSearch implements IMainFilter {
    target: HTMLElement | undefined
    articleAuthorFilter = new ArticleAuthorFilter()
    articleAuthorKeywordFilter = new ArticleAuthorKeywordFilter()
    articleAuthorWhiteFilter = new ArticleAuthorWhiteFilter()
    articleTitleKeywordFilter = new ArticleTitleKeywordFilter()
    articleTitleKeywordWhiteFilter = new ArticleTitleKeywordWhiteFilter()

    init() {
        const blacklist = GM_getValue<string[]>(GM_KEYS.black.uploader.valueKey, [])
        const keywordBlacklist = GM_getValue<string[]>(GM_KEYS.black.uploaderKeyword.valueKey, [])
        const titleKeywordBlacklist = GM_getValue<string[]>(GM_KEYS.black.title.valueKey, [])
        const whitelist = GM_getValue<string[]>(GM_KEYS.white.uploader.valueKey, [])
        const titleKeywordWhitelist = GM_getValue<string[]>(GM_KEYS.white.title.valueKey, [])
        this.articleAuthorFilter.setParam(blacklist)
        this.articleAuthorKeywordFilter.setParam(keywordBlacklist)
        this.articleTitleKeywordFilter.setParam(titleKeywordBlacklist)
        this.articleAuthorWhiteFilter.setParam(whitelist)
        this.articleTitleKeywordWhiteFilter.setParam(titleKeywordWhitelist)
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
            !this.articleTitleKeywordFilter.isEnable &&
            !this.articleAuthorWhiteFilter.isEnable &&
            !this.articleTitleKeywordWhiteFilter.isEnable
        ) {
            revertAll = true
        }
        const timer = performance.now()

        const cards = Array.from(mediaList.children) as HTMLElement[]
        if (!cards.length) {
            return
        }
        if (revertAll) {
            cards.forEach((c) => showEle(c, 'sign'))
            return
        }

        if (config.isDebugMode) {
            cards.forEach((c) => {
                logger.debug(
                    [
                        `ArticleFilterSearch`,
                        `author: ${selectorFns.author(c)}`,
                        `title: ${selectorFns.title(c)}`,
                    ].join('\n'),
                )
            })
        }

        const blackPairs: SubFilterPair[] = []
        this.articleAuthorFilter.isEnable && blackPairs.push([this.articleAuthorFilter, selectorFns.author])
        this.articleAuthorKeywordFilter.isEnable &&
            blackPairs.push([this.articleAuthorKeywordFilter, selectorFns.author])
        this.articleTitleKeywordFilter.isEnable &&
            blackPairs.push([this.articleTitleKeywordFilter, selectorFns.title])

        const whitePairs: SubFilterPair[] = []
        this.articleAuthorWhiteFilter.isEnable && whitePairs.push([this.articleAuthorWhiteFilter, selectorFns.author])
        this.articleTitleKeywordWhiteFilter.isEnable &&
            whitePairs.push([this.articleTitleKeywordWhiteFilter, selectorFns.title])

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
        name: 'UP主过滤',
        items: [
            {
                type: 'switch',
                id: GM_KEYS.black.uploader.statusKey,
                name: '启用 UP主过滤 (右键单击UP主)',
                defaultEnable: true,
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
                id: GM_KEYS.black.uploader.valueKey,
                name: '编辑 UP主黑名单',
                description: ['右键屏蔽的UP主会出现在首行'],
                editorTitle: 'UP主 黑名单',
                editorDescription: ['每行一个UP主昵称，保存时自动去重'],
                saveFn: async () => {
                    mainFilter.articleAuthorFilter.setParam(GM_getValue(GM_KEYS.black.uploader.valueKey, []))
                    mainFilter.checkFull()
                },
            },
            {
                type: 'switch',
                id: GM_KEYS.black.uploaderKeyword.statusKey,
                name: '启用 UP主昵称关键词过滤',
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
                id: GM_KEYS.black.uploaderKeyword.valueKey,
                name: '编辑 UP主昵称关键词黑名单',
                editorTitle: 'UP主昵称关键词 黑名单',
                editorDescription: [
                    '每行一个关键词或正则，不区分大小写、全半角',
                    '请勿使用过于激进的关键词或正则',
                    '正则默认 ius 模式，无需 flag，语法：/abc|\\d+/',
                ],
                saveFn: async () => {
                    mainFilter.articleAuthorKeywordFilter.setParam(
                        GM_getValue(GM_KEYS.black.uploaderKeyword.valueKey, []),
                    )
                    mainFilter.checkFull()
                },
            },
        ],
    },
    {
        name: '标题关键词过滤',
        items: [
            {
                type: 'switch',
                id: GM_KEYS.black.title.statusKey,
                name: '启用 标题关键词过滤',
                noStyle: true,
                enableFn: () => {
                    mainFilter.articleTitleKeywordFilter.enable()
                    mainFilter.checkFull()
                },
                disableFn: () => {
                    mainFilter.articleTitleKeywordFilter.disable()
                    mainFilter.checkFull()
                },
            },
            {
                type: 'editor',
                id: GM_KEYS.black.title.valueKey,
                name: '编辑 标题关键词黑名单',
                editorTitle: '标题关键词 黑名单',
                editorDescription: [
                    '每行一个关键词或正则，不区分大小写、全半角',
                    '请勿使用过于激进的关键词或正则',
                    '正则默认 ius 模式，无需 flag，语法：/abc|\\d+/',
                ],
                saveFn: async () => {
                    mainFilter.articleTitleKeywordFilter.setParam(GM_getValue(GM_KEYS.black.title.valueKey, []))
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
                id: GM_KEYS.white.uploader.statusKey,
                name: '启用 UP主白名单 (右键单击UP主)',
                defaultEnable: true,
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
                id: GM_KEYS.white.uploader.valueKey,
                name: '编辑 UP主白名单',
                editorTitle: 'UP主 白名单',
                editorDescription: ['每行一个UP主昵称，保存时自动去重'],
                saveFn: async () => {
                    mainFilter.articleAuthorWhiteFilter.setParam(GM_getValue(GM_KEYS.white.uploader.valueKey, []))
                    mainFilter.checkFull()
                },
            },
            {
                type: 'switch',
                id: GM_KEYS.white.title.statusKey,
                name: '启用 标题关键词白名单',
                noStyle: true,
                enableFn: () => {
                    mainFilter.articleTitleKeywordWhiteFilter.enable()
                    mainFilter.checkFull()
                },
                disableFn: () => {
                    mainFilter.articleTitleKeywordWhiteFilter.disable()
                    mainFilter.checkFull()
                },
            },
            {
                type: 'editor',
                id: GM_KEYS.white.title.valueKey,
                name: '编辑 标题关键词白名单',
                editorTitle: '标题关键词 白名单',
                editorDescription: [
                    '每行一个关键词或正则，不区分大小写、全半角',
                    '正则默认 ius 模式，无需 flag，语法：/abc|\\d+/',
                ],
                saveFn: async () => {
                    mainFilter.articleTitleKeywordWhiteFilter.setParam(GM_getValue(GM_KEYS.white.title.valueKey, []))
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
        const url = authorEl.querySelector<HTMLAnchorElement>('a')?.href?.trim()
        const spaceUrl = url?.match(/space\.bilibili\.com\/\d+/)?.[0]

        if (author) {
            if (mainFilter.articleAuthorFilter.isEnable) {
                menus.push({
                    name: `屏蔽UP主：${author}`,
                    fn: async () => {
                        try {
                            mainFilter.articleAuthorFilter.addParam(author)
                            mainFilter.checkFull()
                            const arr: string[] = GM_getValue(GM_KEYS.black.uploader.valueKey, [])
                            arr.unshift(author)
                            GM_setValue(GM_KEYS.black.uploader.valueKey, orderedUniq(arr))
                        } catch (err) {
                            logger.error(`articleFilterHandler add uploader ${author} failed`, err)
                        }
                    },
                })
            }
            if (mainFilter.articleAuthorWhiteFilter.isEnable) {
                menus.push({
                    name: `将UP主加入白名单`,
                    fn: async () => {
                        try {
                            mainFilter.articleAuthorWhiteFilter.addParam(author)
                            mainFilter.checkFull()
                            const arr: string[] = GM_getValue(GM_KEYS.white.uploader.valueKey, [])
                            arr.unshift(author)
                            GM_setValue(GM_KEYS.white.uploader.valueKey, orderedUniq(arr))
                        } catch (err) {
                            logger.error(`articleFilterHandler add white uploader ${author} failed`, err)
                        }
                    },
                })
            }
        }
        if (spaceUrl && (mainFilter.articleAuthorFilter.isEnable || mainFilter.articleAuthorWhiteFilter.isEnable)) {
            menus.push({
                name: `复制主页链接`,
                fn: () => navigator.clipboard.writeText(`https://${spaceUrl}`),
            })
        }
    }

    return menus
}
