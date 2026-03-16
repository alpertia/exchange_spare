"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Logo from "@/components/Logo"

const navItems = [
  { label: "Marketplace",             href: "/dashboard/marketplace" },
  { label: "My Stock",   href: "/dashboard/selling" },
  { label: "My Inquiries",            href: "/dashboard/buy-inquiries" },
  { label: "My CART",                 href: "/dashboard/buying" },
  { label: "My Messages",             href: "/dashboard/messages" },
  { label: "My Transactions",         href: "/dashboard/transactions" },
  { label: "Product Knowledge Base",  href: "/dashboard/knowledge" },
  { label: "Trade Assurance",              href: "/dashboard/trade-assurance" },
  { label: "My Profile",              href: "/dashboard/profile" },
  { label: "Settings",                href: "/dashboard/settings" },
]

const adminNavItems = [
  { label: "🔔 Admin Inbox",     href: "/dashboard/admin/notifications" },
  { label: "🔄 Transactions",    href: "/dashboard/admin/transactions" },
  { label: "💬 Messages",        href: "/dashboard/admin/messages" },
  { label: "🛡️ Trade Assurance", href: "/dashboard/admin/trade-assurance" },
  { label: "📄 Deposits",        href: "/dashboard/admin/deposits" },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()

  const [checking, setChecking]         = useState(true)
  const [companyName, setCompanyName]   = useState<string | null>(null)
  const [userEmail, setUserEmail]       = useState<string | null>(null)
  const [myCompanyId, setMyCompanyId]   = useState<string | null>(null)
  const [isAdmin, setIsAdmin]           = useState(false)
  const [unreadMsgs, setUnreadMsgs]     = useState(0)
  const [adminBadge, setAdminBadge]     = useState(0)
  const [txBadge, setTxBadge]           = useState(0)
  const [buyBadge, setBuyBadge]         = useState(0)
  const [sellBadge, setSellBadge]       = useState(0)
  const [escrowBalances, setEscrowBalances] = useState<{ currency: string; balance: number }[]>([])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }
    setUserEmail(session.user.email ?? null)

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role, companies(name)")
      .eq("id", session.user.id)
      .single()

    if (profile?.company_id) {
      setMyCompanyId(profile.company_id)
      setCompanyName((profile as any).companies?.name ?? null)
      loadUnread(profile.company_id)
      loadTxBadge(profile.company_id)
      loadEscrowBalances(profile.company_id)
      loadBuySellBadges(profile.company_id)
    }

    if ((profile as any)?.role === "admin") {
      setIsAdmin(true)
      loadAdminBadge()
    }

    setChecking(false)
  }

  async function loadUnread(companyId: string) {
    const { count } = await supabase.from("messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_company_id", companyId).is("read_at", null)
    setUnreadMsgs(count || 0)
  }

  async function loadAdminBadge() {
    const [notifRes, depositRes, disputeRes, escrowRes] = await Promise.all([
      supabase.from("admin_notifications").select("*", { count: "exact", head: true }).is("read_at", null),
      supabase.from("deposit_applications").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("status", "disputed"),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("escrow_status", "requested"),
    ])
    setAdminBadge((notifRes.count || 0) + (depositRes.count || 0) + (disputeRes.count || 0) + (escrowRes.count || 0))
  }

  async function loadTxBadge(companyId: string) {
    const { data } = await supabase.from("transactions")
      .select("id, type, status").eq("company_id", companyId)
      .in("status", ["offer_sent", "confirmed", "ready_to_ship", "shipped", "delivered", "disputed"])
    const myTurn = (data || []).filter((t: any) => {
      const isBuyer = t.type === "buy"
      return (
        (t.status === "offer_sent"    && !isBuyer) ||
        (t.status === "confirmed"     && isBuyer)  ||
        (t.status === "ready_to_ship" && !isBuyer) ||
        (t.status === "shipped"       && isBuyer)  ||
        t.status === "disputed"
      )
    })
    setTxBadge(myTurn.length)
  }

  async function loadEscrowBalances(companyId: string) {
    const { data } = await supabase.from("escrow_balances")
      .select("currency, balance").eq("company_id", companyId).gt("balance", 0)
    setEscrowBalances(data || [])
  }

  async function loadBuySellBadges(companyId: string) {
    const [buyRes, sellRes] = await Promise.all([
      supabase.from("transactions").select("*", { count: "exact", head: true })
        .eq("company_id", companyId).eq("type", "buy").eq("status", "offer_sent"),
      supabase.from("transactions").select("*", { count: "exact", head: true })
        .eq("company_id", companyId).eq("type", "sell").eq("status", "offer_sent"),
    ])
    setBuyBadge(buyRes.count || 0)
    setSellBadge(sellRes.count || 0)
  }

  useEffect(() => {
    if (!myCompanyId) return
    const ch = supabase.channel("layout-msgs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_company_id=eq.${myCompanyId}` },
        () => loadUnread(myCompanyId))
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `company_id=eq.${myCompanyId}` },
        () => { loadTxBadge(myCompanyId); loadBuySellBadges(myCompanyId) })
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow_balances", filter: `company_id=eq.${myCompanyId}` },
        () => loadEscrowBalances(myCompanyId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myCompanyId])

  useEffect(() => {
    if (!isAdmin) return
    const ch = supabase.channel("layout-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, loadAdminBadge)
      .on("postgres_changes", { event: "*", schema: "public", table: "deposit_applications" }, loadAdminBadge)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, loadAdminBadge)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isAdmin])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F6F2", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div style={{ color: "#8A8070", fontSize: 13 }}>Loading...</div>
      </div>
    )
  }

  const NavLink = ({ href, label, badge, badgeColor }: { href: string; label: string; badge?: number; badgeColor?: string }) => {
    const isActive = pathname?.startsWith(href)
    return (
      <Link href={href} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 12px", borderRadius: 6, textDecoration: "none",
        background: isActive ? "rgba(10,10,10,0.08)" : "transparent",
        color: isActive ? "#0A0A0A" : "#5A5545",
        fontSize: 13, fontWeight: isActive ? 600 : 400,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        <span>{label}</span>
        {badge && badge > 0 ? (
          <span style={{ background: badgeColor || "#ef4444", color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, fontWeight: 700 }}>
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    )
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif", background: "#F7F6F2" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { background: #F7F6F2; margin: 0; }
      `}</style>

      {/* SIDEBAR */}
      <div style={{ width: 220, background: "#EEEBE3", borderRight: "1px solid rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", position: "sticky", top: 0, overflow: "hidden" }}>

        {/* Logo */}
        <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <Logo size={28} linkTo="/" />
        </div>

        {/* Company + user */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0A0A0A", marginBottom: 1 }}>{companyName}</div>
          <div style={{ fontSize: 11, color: "#8A8070" }}>{userEmail}</div>
          {isAdmin && (
            <div style={{ fontSize: 10, marginTop: 4, padding: "1px 6px", background: "#fef2f2", color: "#dc2626", borderRadius: 4, display: "inline-block", fontWeight: 700, letterSpacing: "0.04em" }}>
              ADMIN
            </div>
          )}
        </div>

        {/* Trade Assurance Balance */}
        {escrowBalances.length > 0 && (
          <Link href="/dashboard/trade-assurance" style={{ display: "block", padding: "10px 16px", background: "#E4EDE4", borderBottom: "1px solid rgba(0,0,0,0.08)", textDecoration: "none" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#5A5545", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>🛡️ Trade Assurance</div>
            {escrowBalances.map(b => (
              <div key={b.currency} style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.3, fontFamily: "'DM Mono', monospace" }}>
                {b.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                <span style={{ fontSize: 10, fontWeight: 600, color: "#5A5545", fontFamily: "'DM Sans', sans-serif" }}>{b.currency}</span>
              </div>
            ))}
          </Link>
        )}

        {/* Nav */}
        <nav style={{ padding: "8px", flex: 1, overflowY: "auto", minHeight: 0 }}>
          {navItems.map(item => (
            <NavLink key={item.href} href={item.href} label={item.label}
              badge={
                item.href === "/dashboard/messages"      ? unreadMsgs :
                item.href === "/dashboard/transactions"  ? txBadge :
                item.href === "/dashboard/selling"       ? sellBadge :
                item.href === "/dashboard/buy-inquiries" ? buyBadge :
                undefined
              }
              badgeColor={item.href === "/dashboard/transactions" && txBadge > 0 ? "#f59e0b" : undefined}
            />
          ))}
          {isAdmin && (
            <>
              <div style={{ margin: "12px 12px 4px", fontSize: 10, fontWeight: 700, color: "#8A8070", textTransform: "uppercase", letterSpacing: "0.07em" }}>Admin</div>
              {adminNavItems.map(item => (
                <NavLink key={item.href} href={item.href} label={item.label}
                  badge={item.href === "/dashboard/admin/notifications" ? adminBadge : undefined} />
              ))}
            </>
          )}
        </nav>

        {/* Sign out */}
        <div style={{ padding: "10px 8px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <button onClick={handleLogout} style={{
            width: "100%", padding: "8px", background: "transparent",
            border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6, cursor: "pointer",
            fontSize: 12, color: "#5A5545", fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, background: "#F7F6F2", minWidth: 0 }}>
        <div style={{ padding: 32 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
