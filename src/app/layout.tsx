import { DM_Sans } from "next/font/google"

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.className}>
      <body style={{ margin: 0, padding: 0, background: "#f8fafc" }}>
        {children}
      </body>
    </html>
  )
}
