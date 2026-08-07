import * as config from './config'
import { MAX_HEADLINE_LENGTH, truncate } from './seo'
import type { Site } from './types'

export interface StructuredDataParams {
  site?: Site
  title?: string
  description?: string
  url?: string
  image?: string
  isRootPage?: boolean
  isBlogPost?: boolean
  publishedTime?: string
  modifiedTime?: string
}

/**
 * Profile URLs for every social account configured in `site.config.ts`. These
 * become schema.org `sameAs` entries, which is how search engines tie this site
 * to the same person on GitHub/LinkedIn/etc.
 */
function getSameAs(): string[] {
  return [
    config.twitter && `https://twitter.com/${config.twitter}`,
    config.github && `https://github.com/${config.github}`,
    config.linkedin && `https://www.linkedin.com/in/${config.linkedin}`,
    config.youtube && `https://www.youtube.com/${config.youtube}`,
    config.mastodon
  ].filter(Boolean) as string[]
}

/**
 * Builds a JSON-LD `@graph` describing the page. Every page gets the author
 * `Person` and the `WebSite`; blog posts additionally get a `BlogPosting` and
 * inner pages get a `BreadcrumbList`.
 */
export function getStructuredData({
  site,
  title,
  description,
  url,
  image,
  isRootPage,
  isBlogPost,
  publishedTime,
  modifiedTime
}: StructuredDataParams) {
  if (!site || !url) {
    return null
  }

  const host = `https://${site.domain}`
  const personId = `${host}/#person`
  const websiteId = `${host}/#website`

  const person: Record<string, any> = {
    '@type': 'Person',
    '@id': personId,
    name: config.author,
    url: host
  }

  const sameAs = getSameAs()
  if (sameAs.length) {
    person.sameAs = sameAs
  }

  const website = {
    '@type': 'WebSite',
    '@id': websiteId,
    url: host,
    name: site.name,
    description: site.description,
    inLanguage: config.language,
    publisher: { '@id': personId }
  }

  const graph: Record<string, any>[] = [person, website]

  if (isBlogPost) {
    const article: Record<string, any> = {
      '@type': 'BlogPosting',
      '@id': `${url}#article`,
      isPartOf: { '@id': websiteId },
      mainEntityOfPage: url,
      url,
      headline: truncate(title, MAX_HEADLINE_LENGTH),
      description,
      inLanguage: config.language,
      author: { '@id': personId },
      publisher: { '@id': personId }
    }

    if (image) {
      article.image = image
    }

    // `datePublished` is required for Google to show a date in the SERP. Fall
    // back to the modified time rather than omitting it entirely.
    if (publishedTime || modifiedTime) {
      article.datePublished = publishedTime ?? modifiedTime
      article.dateModified = modifiedTime ?? publishedTime
    }

    graph.push(article)
  }

  if (!isRootPage && title) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: site.name,
          item: host
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: title
        }
      ]
    })
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  }
}

/**
 * Serializes JSON-LD for embedding in a `<script>` tag. Escaping `<` prevents a
 * page title containing `</script>` from breaking out of the tag.
 */
export function serializeStructuredData(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
