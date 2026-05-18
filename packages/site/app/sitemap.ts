import type { MetadataRoute } from 'next'

const SITE_URL = 'https://vibetime.barry.ee'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date('2026-05-18'),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
