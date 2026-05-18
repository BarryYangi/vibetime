import './globals.css'
import type { Metadata } from 'next'
import { Besley } from 'next/font/google'
import localFont from 'next/font/local'
import { ThemeProvider } from '@/contexts/ThemeContext'

const SITE_URL = 'https://vibetime.barry.ee'
const REPO_URL = 'https://github.com/BarryYangi/vibetime'
const RELEASE_URL = `${REPO_URL}/releases/latest`
const SITE_TITLE = 'VibeTime - Local-first time tracking for AI coding agents'
const SITE_DESCRIPTION =
  'Track Claude Code, Codex, Cursor, and Gemini CLI coding time locally by project.'
const OG_IMAGE = {
  url: '/images/vibetime/og-image.png',
  width: 1200,
  height: 630,
  alt: 'VibeTime local-first time tracking for AI coding agents',
}

const mondwest = localFont({
  src: '../public/fonts/PPMondwest-Regular.woff2',
  variable: '--font-mondwest',
})

const inter = localFont({
  src: '../public/fonts/InterVariable.woff2',
  variable: '--font-inter',
})

const besley = Besley({
  subsets: ['latin'],
  variable: '--font-besley-var',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: 'VibeTime',
  title: {
    default: SITE_TITLE,
    template: '%s | VibeTime',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'VibeTime',
    'AI coding agents',
    'time tracking',
    'Claude Code',
    'Codex',
    'Cursor',
    'Gemini CLI',
    'developer tools',
    'local-first',
  ],
  authors: [{ name: 'Barry', url: 'https://barry.ee' }],
  creator: 'Barry',
  publisher: 'Barry',
  category: 'Developer Tools',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/icon.png',
    apple: '/images/vibetime/icon.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'VibeTime',
    locale: 'en_US',
    title: SITE_TITLE,
    description:
      'See which AI coding agents worked on which projects, and for how long. No account, cloud sync, or telemetry.',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: 'Local-first time tracking for Claude Code, Codex, Cursor, and Gemini CLI.',
    creator: '@BarryYangi',
    images: [OG_IMAGE],
  },
  appleWebApp: {
    title: 'VibeTime',
  },
  formatDetection: {
    telephone: false,
  },
}

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'VibeTime',
  alternateName: 'VibeTime Agent Time Tracker',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows',
  url: SITE_URL,
  downloadUrl: RELEASE_URL,
  codeRepository: REPO_URL,
  image: `${SITE_URL}/images/vibetime/og-image.png`,
  screenshot: `${SITE_URL}/images/vibetime/vibetime-demo-poster.png`,
  softwareVersion: '2026.5.18',
  license: `${REPO_URL}/blob/main/LICENSE`,
  isAccessibleForFree: true,
  description:
    'VibeTime is a local-first desktop app for tracking AI coding sessions by project across Claude Code, Codex, Cursor, and Gemini CLI.',
  featureList: [
    'Local-first AI coding session tracking',
    'Daily project and agent breakdowns',
    'Live activity view',
    'History trends',
    'Menu bar status',
    'Hook installer',
    'CLI status and diagnostics',
    'Project detection from aliases, remotes, and folders',
  ],
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  creator: {
    '@type': 'Person',
    name: 'Barry',
    url: 'https://barry.ee',
    sameAs: ['https://github.com/BarryYangi'],
  },
  sameAs: [REPO_URL],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mondwest.variable} ${besley.variable}`}>
      <body className="transition-colors duration-800">
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is generated from static metadata constants.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
