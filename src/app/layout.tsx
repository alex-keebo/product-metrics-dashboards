import type { Metadata } from 'next'
import { IBM_Plex_Sans, Exo_2, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { ThemeProvider } from '@/components/layout/ThemeProvider'

const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

const exo2 = Exo_2({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Keebo Dashboard',
  description: 'Keebo product metrics dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${exo2.variable} ${ibmPlexMono.variable} h-full antialiased dark`} suppressHydrationWarning>
      <head>
        {/* Runs synchronously before first paint — removes 'dark' if user prefers light */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('theme')==='light'){document.documentElement.classList.remove('dark')}}catch(e){}})()` }} />
      </head>
      <body className="h-screen flex bg-background text-foreground overflow-hidden">
        <ThemeProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
