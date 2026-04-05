import { NotionAPI } from 'notion-client'

// Recent Notion API responses double-wrap every record-map entry as
//   { value: { value: <actualRecord>, role, id }, spaceId? }
// instead of the classic notion-client / react-notion-x shape
//   { value: <actualRecord>, role }
//
// notion-client's internal getPage reads `t.block[c].value.type` to decide
// which collection views to query, so on the new shape `.type` is undefined,
// `getCollectionData` is never invoked, and `collection_query` stays empty —
// which is why blog collections and their sub-pages don't load. Patching the
// data after `notion.getPage` returns is too late; we need the normalized
// shape visible to notion-client itself.
//
// We wrap the low-level `fetch` method so every endpoint response that
// carries a `recordMap` (loadPageChunk, queryCollection, syncRecordValues,
// getRecordValues) is flattened before notion-client touches it.
const RECORD_MAP_TABLES = [
  'block',
  'collection',
  'collection_view',
  'notion_user',
  'space'
] as const

function normalizeRecordMap(recordMap: any): void {
  if (!recordMap || typeof recordMap !== 'object') return
  for (const table of RECORD_MAP_TABLES) {
    const section = recordMap[table]
    if (!section || typeof section !== 'object') continue
    for (const key of Object.keys(section)) {
      const entry = section[key]
      if (!entry || typeof entry !== 'object') continue
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
      // Safety net: ensure block value has an id so react-notion-x's
      // uuidToId(block.id) call never crashes.
      const normalized = section[key]
      if (normalized?.value && !normalized.value.id) {
        normalized.value.id = key
      }
    }
  }
}

export const notion = new NotionAPI({
  apiBaseUrl: process.env.NOTION_API_BASE_URL
})

const originalFetch = (notion as any).fetch.bind(notion)
;(notion as any).fetch = async function patchedFetch(opts: any) {
  // Retry on 429 (rate limit) and 5xx with exponential backoff. The
  // prerender phase fans out a lot of parallel calls to Notion and bulk
  // builds routinely trip the rate limit; one bad call fails the whole
  // build. `got`'s built-in retry is off for POST requests by default, so
  // we handle it here.
  const maxAttempts = 10
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await originalFetch(opts)
      // loadPageChunk / queryCollection / syncRecordValues / getRecordValues
      // all return `{ recordMap: {...}, ... }`; search/getSignedFileUrls
      // don't and are safely ignored by the guard in normalizeRecordMap.
      if (res && typeof res === 'object') {
        normalizeRecordMap(res.recordMap)
      }
      return res
    } catch (err: any) {
      const status = err?.response?.statusCode
      const retryable =
        status === 429 || (typeof status === 'number' && status >= 500)
      if (!retryable || attempt >= maxAttempts - 1) {
        throw err
      }
      const backoffMs = Math.min(
        60_000,
        1_500 * 2 ** attempt + Math.floor(Math.random() * 1_000)
      )
      console.warn(
        `notion fetch retry ${attempt + 1}/${maxAttempts} in ${backoffMs}ms (status ${status}, endpoint ${opts?.endpoint})`
      )
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
    }
  }
}
