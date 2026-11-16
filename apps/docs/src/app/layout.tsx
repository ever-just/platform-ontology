import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import { siteUrl } from '@/lib/shared';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
});

const description =
  'An open, plain language map of what apps and websites can do on your phone and in your browser: 844 capabilities across Android, iPhone and 7 browsers.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Platform.Ontology',
    template: '%s | Platform.Ontology',
  },
  description,
  applicationName: 'Platform.Ontology',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Platform.Ontology',
    title: 'Platform.Ontology',
    description,
    url: siteUrl,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Platform.Ontology' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Platform.Ontology',
    description,
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
