/**
 * Shared SEO helpers used by `PageHead` and the JSON-LD builder.
 */

// Google truncates meta descriptions around 155-160 characters, so anything
// longer is dead weight that gets cut mid-sentence in the SERP.
export const MAX_DESCRIPTION_LENGTH = 160

// schema.org recommends keeping `headline` under 110 characters.
export const MAX_HEADLINE_LENGTH = 110

// Titles render in roughly 600px of SERP width, which is ~60 characters. We
// only append the site name when the result still fits inside that budget.
export const MAX_TITLE_LENGTH = 60

/**
 * Truncates on a word boundary so descriptions never get cut mid-word.
 */
export function truncate(text: string | null | undefined, maxLength: number) {
  if (!text) {
    return undefined
  }

  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  // leave room for the ellipsis
  const clipped = normalized.slice(0, maxLength - 1)
  const lastSpace = clipped.lastIndexOf(' ')

  return `${(lastSpace > maxLength * 0.5
    ? clipped.slice(0, lastSpace)
    : clipped
  ).replace(/[\s,;:.\-–—]+$/, '')}…`
}

/**
 * Notion stores dates as epoch milliseconds; schema.org and Open Graph both
 * want ISO 8601. Returns undefined for anything unparseable so we never emit a
 * malformed date.
 */
export function toIsoDate(value?: number | string | null) {
  if (!value) {
    return undefined
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
