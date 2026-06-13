import { KeywordFilter } from '@/modules/filters/core/subFilters/keywordFilter'
import { StringFilter } from '@/modules/filters/core/subFilters/stringFilter'

export class ArticleAuthorWhiteFilter extends StringFilter {}

export class ArticleTitleKeywordWhiteFilter extends KeywordFilter {}
