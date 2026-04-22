import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

import { Providers } from "@/components/providers"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "StreamLens",
  description: "A Kafka observability and data exploration UI",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <TooltipProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto bg-background">
                {children}
              </main>
            </div>
            <Toaster richColors />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
