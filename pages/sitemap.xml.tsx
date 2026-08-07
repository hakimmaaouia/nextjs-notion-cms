import type { GetServerSideProps } from 'next'

import { ExtendedRecordMap } from 'notion-types'
import { parsePageId } from 'notion-utils'

import { host, rootNotionPageId } from '@/lib/config'
import { getSiteMap } from '@/lib/get-site-map'
import { toIsoDate } from '@/lib/seo'
import type { SiteMap } from '@/lib/types'

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.write(JSON.stringify({ error: 'method not allowed' }))
    res.end()
    return {
      props: {}
    }
  }

  const siteMap = await getSiteMap()

  // cache for up to 8 hours
  res.setHeader(
    'Cache-Control',
    'public, max-age=28800, stale-while-revalidate=28800'
  )
  res.setHeader('Content-Type', 'text/xml')
  res.write(createSitemap(siteMap))
  res.end()

  return {
    props: {}
  }
}

interface SitemapUrl {
  loc: string
  lastmod?: string
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const getLastModified = (siteMap: SiteMap, pageId: string) => {
  const recordMap = siteMap.pageMap[pageId] as ExtendedRecordMap

  return toIsoDate(recordMap?.block?.[pageId]?.value?.last_edited_time)
}

const renderUrl = ({ loc, lastmod }: SitemapUrl) =>
  `  <url>
    <loc>${escapeXml(encodeURI(loc))}</loc>${
    lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
  }
  </url>`

const createSitemap = (siteMap: SiteMap) => {
  const rootPageId = parsePageId(rootNotionPageId, { uuid: false })
  const entries = Object.entries(siteMap.canonicalPageMap)

  // The root Notion page is also reachable under its own slug (e.g.
  // /mohamed-hakim-maaouia), but that URL canonicalizes to `/`. A sitemap
  // should only ever list canonical URLs, so the slug variant is dropped and
  // the homepage is listed exactly once — without a trailing slash, matching
  // the canonical tag `getCanonicalPageUrl` emits.
  const rootEntry = entries.find(
    ([, pageId]) => parsePageId(pageId, { uuid: false }) === rootPageId
  )

  const urls: SitemapUrl[] = [
    {
      loc: host,
      lastmod: rootEntry ? getLastModified(siteMap, rootEntry[1]) : undefined
    },
    ...entries
      .filter(
        ([, pageId]) => parsePageId(pageId, { uuid: false }) !== rootPageId
      )
      .map(([canonicalPagePath, pageId]) => ({
        loc: `${host}/${canonicalPagePath}`,
        lastmod: getLastModified(siteMap, pageId)
      }))
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(renderUrl).join('\n')}
</urlset>
`
}

export default () => null
