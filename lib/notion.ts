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
      // NOTE: argument order matters. `mergeRecordMaps(a, b)` lets `b` win
      // on key collisions, and the nav-link record maps are fetched with
      // partial options (chunkLimit: 1, fetchMissingBlocks: false), so they
      // can contain block value objects without an `id`. Passing the
      // nav-link map as the first argument ensures the primary recordMap
      // wins on collisions while nav-link-only entries are still added.
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(navigationLinkRecordMap, map),
        recordMap
      )
    }
  }

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
    ;(recordMap as any).preview_images = previewImageMap
  }

  // Defense-in-depth: react-notion-x's <Block> calls `uuidToId(block.id)`
  // unconditionally (react-notion-x/build/index.js:2067) and crashes on
  // undefined. Ensure every block value carries an id by falling back to
  // the record-map key, which is the block's own uuid.
  for (const key of Object.keys(recordMap.block)) {
    const entry = recordMap.block[key] as any
    if (entry?.value && !entry.value.id) {
      entry.value.id = key
    }
  }

  return recordMap
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}
