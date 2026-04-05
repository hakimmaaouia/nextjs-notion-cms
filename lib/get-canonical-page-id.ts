import { ExtendedRecordMap } from 'notion-types'
import {
  getCanonicalPageId as getCanonicalPageIdImpl,
  parsePageId
} from 'notion-utils'

import { inversePageUrlOverrides } from './config'

export function getCanonicalPageId(
  pageId: string,
  recordMap: ExtendedRecordMap,
  { uuid = true }: { uuid?: boolean } = {}
): string | null {
  const cleanPageId = parsePageId(pageId, { uuid: false })
  if (!cleanPageId) {
    return null
  }

  const override = inversePageUrlOverrides[cleanPageId]
  if (override) {
    return override
  }

  const canonicalId = getCanonicalPageIdImpl(pageId, recordMap, { uuid })
  if (!canonicalId) return canonicalId

  // notion-utils uses an explicit `Slug`/`slug` page property verbatim when
  // one exists (bypassing its own normalizeTitle), so stray whitespace or
  // casing in the Notion property leaks into the URL and the sitemap. Strip
  // surrounding whitespace, collapse any internal whitespace to dashes, and
  // lowercase — otherwise a slug like "my-slug " 404s when the browser
  // requests it without the trailing space.
  return canonicalId
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
}
