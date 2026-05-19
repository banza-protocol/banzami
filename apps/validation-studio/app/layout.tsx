import type { Metadata } from 'next'
import './globals.css'

// LOCAL-ONLY SAFETY GUARD — this check runs on every server-side render
if (process.env.NODE_ENV === 'production') {
  throw new Error('[Validation Studio] Local-only tool — must never run in production.')
}

export const metadata: Metadata = {
  title: 'Banzami Validation Studio',
  description: 'Local governance editor for the Banzami implementation matrix',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-bz-bg text-bz-text antialiased">{children}</body>
    </html>
  )
}
