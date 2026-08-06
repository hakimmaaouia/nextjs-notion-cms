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

// Notion's bot protection rejects requests carrying `got`'s default
// User-Agent ("got (https://github.com/sindresorhus/got)") with a hard 403,
// even for pages that are published to the web. notion-client sends that UA
// on every api/v3 call, so builds started failing with
// `page load error ... Response code 403 (Forbidden)` with no code change on
// our side. The same request with a browser UA (or no UA at all) returns 200.
//
// Send a browser-like User-Agent on every request. Overridable via env in
// case Notion tightens this further and a different UA is needed.
const NOTION_USER_AGENT =
  process.env.NOTION_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const originalFetch = (notion as any).fetch.bind(notion)
;(notion as any).fetch = async function patchedFetch(opts: any) {
  // NotionAPI#fetch builds its final header set as
  //   { ...headers, ...gotOptions.headers, 'Content-Type': 'application/json' }
  // so gotOptions.headers is the layer that reliably wins.
  opts = {
    ...opts,
    gotOptions: {
      ...opts?.gotOptions,
      headers: {
        'user-agent': NOTION_USER_AGENT,
        ...opts?.gotOptions?.headers
      }
    }
  }

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
      // A 403 is not a transient failure, so don't burn build minutes
      // retrying it — but it is the single most confusing error this app can
      // hit, so make it self-explaining. It means either Notion's bot
      // protection rejected our User-Agent, or the page is no longer shared
      // to the web.
      if (status === 403) {
        console.error(
          `notion 403 Forbidden (endpoint ${opts?.endpoint}). Either the page is no longer published to the web, or Notion is blocking this User-Agent (${NOTION_USER_AGENT}). Try setting the NOTION_USER_AGENT env var to a current browser UA.`
        )
        throw err
      }
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
        `notion fetch retry ${
          attempt + 1
        }/${maxAttempts} in ${backoffMs}ms (status ${status}, endpoint ${
          opts?.endpoint
        })`
      )
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
    }
  }
}
