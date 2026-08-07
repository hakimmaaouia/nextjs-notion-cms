import * as React from 'react'
import Head from 'next/head'

import * as config from '@/lib/config'
import * as types from '@/lib/types'
import {
  getStructuredData,
  serializeStructuredData
} from '@/lib/get-structured-data'
import { getSocialImageUrl } from '@/lib/get-social-image-url'
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH, truncate } from '@/lib/seo'

export const PageHead: React.FC<
  types.PageProps & {
    title?: string
    description?: string
    image?: string
    url?: string
    isRootPage?: boolean
    isBlogPost?: boolean
    publishedTime?: string
    modifiedTime?: string
    noindex?: boolean
  }
> = ({
  site,
  title,
  description,
  pageId,
  image,
  url,
  isRootPage,
  isBlogPost,
  publishedTime,
  modifiedTime,
  noindex
}) => {
  const rssFeedUrl = `${config.host}/feed`

  const rawTitle = title ?? site?.name
  description = truncate(
    description ?? site?.description,
    MAX_DESCRIPTION_LENGTH
  )

  // The root page's Notion title is just the author's name, which wastes the
  // most valuable ranking real estate we have. Every other page gets the site
  // name appended for brand recognition — but only when the result still fits
  // inside the SERP's title budget, so we never cause a truncation.
  const suffix = site?.name && rawTitle !== site.name ? ` | ${site.name}` : ''
  const pageTitle = isRootPage
    ? [site?.name ?? rawTitle, config.tagline].filter(Boolean).join(' — ')
    : suffix && rawTitle.length + suffix.length <= MAX_TITLE_LENGTH
    ? `${rawTitle}${suffix}`
    : rawTitle

  const socialImageUrl = getSocialImageUrl(pageId) || image

  // Not every Notion post has a "Published" property. Falling back to the
  // modified time keeps a date in the SERP, which is what the RSS feed already
  // does — an absent date is worse than an approximate one.
  const published = publishedTime ?? modifiedTime
  const modified = modifiedTime ?? publishedTime

  const structuredData = noindex
    ? null
    : getStructuredData({
        site,
        title: rawTitle,
        description,
        url,
        image: socialImageUrl,
        isRootPage,
        isBlogPost,
        publishedTime: published,
        modifiedTime: modified
      })

  return (
    <Head>
      <meta charSet='utf-8' />
      <meta httpEquiv='Content-Type' content='text/html; charset=utf-8' />
      <meta
        name='viewport'
        content='width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover'
      />

      <meta name='apple-mobile-web-app-capable' content='yes' />
      <meta
        name='apple-mobile-web-app-status-bar-style'
        content='black'
      />

      <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fefffe" key="theme-color-light"/>
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#2d3439" key="theme-color-dark"/>

      <meta
        name='robots'
        content={noindex ? 'noindex,nofollow' : 'index,follow'}
      />
      <meta name='author' content={config.author} />
      <meta property='og:type' content={isBlogPost ? 'article' : 'website'} />

      {isBlogPost && (
        <>
          {published && (
            <meta property='article:published_time' content={published} />
          )}
          {modified && (
            <meta property='article:modified_time' content={modified} />
          )}
          <meta property='article:author' content={config.author} />
        </>
      )}

      {site && (
        <>
          <meta property='og:site_name' content={site.name} />
          <meta property='twitter:domain' content={site.domain} />
        </>
      )}

      {config.twitter && (
        <>
          <meta name='twitter:site' content={`@${config.twitter}`} />
          <meta name='twitter:creator' content={`@${config.twitter}`} />
        </>
      )}

      {description && (
        <>
          <meta name='description' content={description} />
          <meta property='og:description' content={description} />
          <meta name='twitter:description' content={description} />
        </>
      )}

      {socialImageUrl ? (
        <>
          <meta name='twitter:card' content='summary_large_image' />
          <meta name='twitter:image' content={socialImageUrl} />
          <meta property='og:image' content={socialImageUrl} />
        </>
      ) : (
        <meta name='twitter:card' content='summary' />
      )}

      {url && (
        <>
          <link rel='canonical' href={url} />
          <meta property='og:url' content={url} />
          <meta property='twitter:url' content={url} />
        </>
      )}

      <link
        rel='alternate'
        type='application/rss+xml'
        href={rssFeedUrl}
        title={site?.name}
      />

      <meta property='og:title' content={pageTitle} />
      <meta name='twitter:title' content={pageTitle} />
      <title>{pageTitle}</title>

      {structuredData && (
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: serializeStructuredData(structuredData)
          }}
        />
      )}
    </Head>
  )
}
