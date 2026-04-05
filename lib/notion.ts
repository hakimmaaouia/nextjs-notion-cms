import { ExtendedRecordMap, SearchParams, SearchResults } from 'notion-types'
import { mergeRecordMaps } from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

import {
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle
} from './config'
import { notion } from './notion-api'
import { getPreviewImageMap } from './preview-images'

const getNavigationLinkPages = pMemoize(
  async (): Promise<ExtendedRecordMap[]> => {
    const navigationLinkPageIds = (navigationLinks || [])
      .map((link) => link.pageId)
      .filter(Boolean)

    if (navigationStyle !== 'default' && navigationLinkPageIds.length) {
      return pMap(
        navigationLinkPageIds,
        async (navigationLinkPageId) =>
          notion.getPage(navigationLinkPageId, {
            chunkLimit: 1,
            fetchMissingBlocks: false,
            fetchCollections: false,
            signFileUrls: false
          }),
        {
          concurrency: 4
        }
      )
    }

    return []
  }
)

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  let recordMap = await notion.getPage(pageId)

  if (navigationStyle !== 'default') {
    // ensure that any pages linked to in the custom navigation header have
    // their block info fully resolved in the page record map so we know
    // the page title, slug, etc.
    const navigationLinkRecordMaps = await getNavigationLinkPages()

    if (navigationLinkRecordMaps?.length) {
      // NOTE: keep the primary recordMap as the first argument so its
      // block keys stay first in iteration order. react-notion-x's
      // NotionBlockRenderer falls back to `Object.keys(recordMap.block)[0]`
      // as the root block to render (it doesn't honor the `rootPageId`
      // prop for this), so reversing the order would make a nav-link page
      // render as the home page. The undefined-id crash from partial
      // nav-link block values is handled by the backfill below.
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(map, navigationLinkRecordMap),
        recordMap
      )
    }
  }

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
    ;(recordMap as any).preview_images = previewImageMap
  }

  // Normalize record-map entry shape.
  //
  // Recent notion-client / Notion API responses double-wrap each entry as
  //   { value: { value: <actualBlock>, role: 'reader', id: <uuid> } }
  // instead of the classic react-notion-x shape
  //   { value: <actualBlock>, role: 'reader' }
  //
  // react-notion-x does `recordMap.block[id].value` once, so on the new
  // shape it sees the inner wrapper (no `.type`, no `.content`) and falls
  // through to its "Unsupported type" branch — producing a blank page and
  // the prerender crash in `uuidToId(block.id)`. Flatten every table here.
  const tables: Array<keyof ExtendedRecordMap> = [
    'block',
    'collection',
    'collection_view',
    'notion_user'
  ]
  for (const table of tables) {
    const section = (recordMap as any)[table]
    if (!section) continue
    for (const key of Object.keys(section)) {
      const entry = section[key]
      if (!entry) continue
      const inner = entry.value
      if (
        inner &&
        typeof inner === 'object' &&
        inner.value &&
        typeof inner.value === 'object'
      ) {
        section[key] = {
          ...entry,
          value: inner.value,
          role: inner.role ?? entry.role
        }
      }
      // Safety net for react-notion-x calling uuidToId(block.id) on a
      // block value that somehow still lacks an id.
      const normalized = section[key]
      if (normalized?.value && !normalized.value.id) {
        normalized.value.id = key
      }
    }
  }

  return recordMap
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}
