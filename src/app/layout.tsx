import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'SpareShare — B2B Telecom Parts Exchange',
  description: 'Buy and sell telecom and satellite spare parts with Trade Assurance.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#F7F6F2', margin: 0 }}>{children}</body>
    </html>
  )
}
