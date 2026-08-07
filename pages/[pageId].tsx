import * as React from 'react'
import { GetStaticProps } from 'next'

import { NotionPage } from '@/components/NotionPage'
import { domain, isDev } from '@/lib/config'
import { getSiteMap } from '@/lib/get-site-map'
import { resolveNotionPage } from '@/lib/resolve-notion-page'
import { PageProps, Params } from '@/lib/types'

export const getStaticProps: GetStaticProps<PageProps, Params> = async (
  context
) => {
  const rawPageId = context.params.pageId as string

  try {
    const props = await resolveNotionPage(domain, rawPageId)

    // `resolveNotionPage` returns an error object for unknown slugs instead of
    // throwing. Passing that through as normal props renders a "not found"
    // page with a 200 status, which Google classifies as a soft 404 and keeps
    // crawling. `notFound` makes Next.js serve pages/404.tsx with a real 404.
    if ((props as PageProps).error?.statusCode === 404) {
      return { notFound: true, revalidate: 10 }
    }

    return { props, revalidate: 10 }
  } catch (err) {
    console.error('page error', domain, rawPageId, err)

    // we don't want to publish the error version of this page, so
    // let next.js know explicitly that incremental SSG failed
    throw err
  }
}

export async function getStaticPaths() {
  // `blocking` rather than `true`: with `fallback: true` a crawler hitting a
  // path that wasn't prerendered receives an empty loading shell with no title,
  // no meta tags and no content. `blocking` renders the real HTML server-side
  // on first request instead.
  if (isDev) {
    return {
      paths: [],
      fallback: 'blocking'
    }
  }

  const siteMap = await getSiteMap()

  const staticPaths = {
    paths: Object.keys(siteMap.canonicalPageMap).map((pageId) => ({
      params: {
        pageId
      }
    })),
    // paths: [],
    fallback: 'blocking'
  }

  console.log(staticPaths.paths)
  return staticPaths
}

export default function NotionDomainDynamicPage(props) {
  return <NotionPage {...props} />
}
