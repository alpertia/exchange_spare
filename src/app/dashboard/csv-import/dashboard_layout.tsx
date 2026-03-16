"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const navItems = [
  { label: "Marketplace",        href: "/dashboard/marketplace" },
  { label: "My SELL Listings",   href: "/dashboard/selling" },
  { label: "My BUY Intents",     href: "/dashboard/buy-intents" },
  { label: "My CART",            href: "/dashboard/buying" },
  { label: "My Messages",        href: "/dashboard/messages" },
  { label: "My Transactions",    href: "/dashboard/transactions" },
  { label: "Product Knowledge Base", href: "/dashboard/knowledge" },
  { label: "Trade Assurance", href: "/dashboard/trade-assurance" },
  { label: "My Profile",         href: "/dashboard/profile" },
  { label: "Settings",           href: "/dashboard/settings" },
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
  const router = useRouter()

  const [checking, setChecking]       = useState(true)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [userEmail, setUserEmail]     = useState<string | null>(null)
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [unreadMsgs, setUnreadMsgs]     = useState(0)
  const [adminBadge, setAdminBadge]     = useState(0)
  const [txBadge, setTxBadge]           = useState(0)   // needs-action tx count
  const [buyBadge, setBuyBadge]         = useState(0)   // new buy intent matches
  const [sellBadge, setSellBadge]       = useState(0)   // new sell inquiries
  const [escrowBalances, setEscrowBalances] = useState<{currency: string; balance: number}[]>([])

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

    if ((profile as any)?.role === 'admin') {
      setIsAdmin(true)
      loadAdminBadge()
    }

    setChecking(false)
  }

  async function loadUnread(companyId: string) {
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_company_id", companyId)
      .is("read_at", null)
    setUnreadMsgs(count || 0)
  }

  async function loadAdminBadge() {
    const [notifRes, depositRes, disputeRes, escrowRes] = await Promise.all([
      supabase.from("admin_notifications").select("*", { count: "exact", head: true }).is("read_at", null),
      supabase.from("deposit_applications").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("status", "disputed"),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("escrow_status", "requested"),
    ])
    const total = (notifRes.count || 0) + (depositRes.count || 0) + (disputeRes.count || 0) + (escrowRes.count || 0)
    setAdminBadge(total)
  }

  async function loadTxBadge(companyId: string) {
    // Transactions where it's MY turn to act
    const { data } = await supabase
      .from("transactions")
      .select("id, type, status")
      .eq("company_id", companyId)
      .in("status", ["offer_sent", "confirmed", "ready_to_ship", "shipped", "delivered", "disputed"])
    const myTurn = (data || []).filter((t: any) => {
      const isBuyer = t.type === 'buy'
      return (
        (t.status === 'offer_sent'    && !isBuyer) ||
        (t.status === 'confirmed'     && isBuyer)  ||
        (t.status === 'ready_to_ship' && !isBuyer) ||
        (t.status === 'shipped'       && isBuyer)  ||
        t.status === 'disputed'
      )
    })
    setTxBadge(myTurn.length)
  }

  async function loadEscrowBalances(companyId: string) {
    const { data } = await supabase
      .from("escrow_balances")
      .select("currency, balance")
      .eq("company_id", companyId)
      .gt("balance", 0)
    setEscrowBalances(data || [])
  }

  async function loadBuySellBadges(companyId: string) {
    // Unread buy intents that got new offers
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
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b" }}>Loading...</div>
      </div>
    )
  }

  const NavLink = ({ href, label, badge, badgeColor }: { href: string; label: string; badge?: number; badgeColor?: string }) => {
    const isActive = pathname?.startsWith(href)
    return (
      <Link href={href} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "9px 12px", borderRadius: "6px", textDecoration: "none",
        background: isActive ? "#e2e8f0" : "transparent",
        color: isActive ? "#0f172a" : "#64748b",
        fontSize: 13,
      }}>
        <span>{label}</span>
        {badge && badge > 0 ? (
          <span style={{ background: badgeColor || "#ef4444", color: "white", fontSize: 11, padding: "2px 7px", borderRadius: 12, fontWeight: 600 }}>
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </Link>
    )
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* SIDEBAR */}
      <div style={{ width: "220px", background: "#f8fafc", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", position: "sticky", top: 0, overflow: "hidden" }}>

        <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #e2e8f0" }}>
<Link href="/" style={{ textDecoration: "none", display: "block" }}>
  <div style={{ fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "'DM Serif Display', serif" }}>
    <span style={{ color: "#0f172a" }}>Spare</span><span style={{ color: "#185FA5" }}>Share</span>
  </div>
  <div style={{ fontSize: 9, fontWeight: 600, color: "#15803d", letterSpacing: "0.06em", marginTop: 4, textTransform: "lowercase" }}>with Trade Assurance</div>
</Link>
         
        </div>

        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{companyName}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{userEmail}</div>
          {isAdmin && (
            <div style={{ fontSize: 10, marginTop: 3, padding: "1px 6px", background: "#fef2f2", color: "#dc2626", borderRadius: 4, display: "inline-block", fontWeight: 700 }}>
              ADMIN
            </div>
          )}
        </div>

        {/* Trade Assurance Balance — prominent, right below account info */}
        {escrowBalances.length > 0 && (
          <Link href="/dashboard/trade-assurance" style={{ display: "block", margin: "0", padding: "10px 16px", background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", textDecoration: "none" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>🛡️ Trade Assurance Balance</div>
            {escrowBalances.map(b => (
              <div key={b.currency} style={{ fontSize: 14, fontWeight: 800, color: "#166534", lineHeight: 1.3 }}>
                {b.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 11, fontWeight: 600 }}>{b.currency}</span>
              </div>
            ))}
          </Link>
        )}

        <nav style={{ padding: "8px", flex: 1, overflowY: "auto", minHeight: 0 }}>
          {navItems.map(item => (
            <NavLink key={item.href} href={item.href} label={item.label}
              badge={
                item.href === "/dashboard/messages"     ? unreadMsgs :
                item.href === "/dashboard/transactions" ? txBadge :
                item.href === "/dashboard/selling"      ? sellBadge :
                item.href === "/dashboard/buy-intents"  ? buyBadge :
                undefined
              }
              badgeColor={
                item.href === "/dashboard/transactions" && txBadge > 0 ? "#f59e0b" :
                undefined
              }
            />
          ))}
          {isAdmin && (
            <>
              <div style={{ margin: "12px 12px 6px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Admin
              </div>
              {adminNavItems.map(item => (
                <NavLink key={item.href} href={item.href} label={item.label}
                  badge={item.href === "/dashboard/admin/notifications" ? adminBadge : undefined} />
              ))}
            </>
          )}
        </nav>

        <div style={{ padding: "10px 8px", borderTop: "1px solid #e2e8f0" }}>
          <button onClick={handleLogout} style={{
            width: "100%", padding: "8px", background: "transparent",
            border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer",
            fontSize: 12, color: "#64748b",
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, background: "#f8fafc", minWidth: 0 }}>
        <div style={{ padding: "32px" }}>
          {children}
        </div>
      </div>
    </div>
  )
}