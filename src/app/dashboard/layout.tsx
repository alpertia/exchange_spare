'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard/knowledge',    icon: '📚', label: 'Knowledge Base' },
  { href: '/dashboard/marketplace',  icon: '🌐', label: 'Marketplace' },
  { href: '/dashboard/selling',      icon: '📦', label: 'I am Selling' },
  { href: '/dashboard/buying',       icon: '🛒', label: 'My Cart' },
  { href: '/dashboard/inquiries',    icon: '🔍', label: 'My Inquiries' },
  { href: '/dashboard/transactions', icon: '🔄', label: 'Transactions' },
  { href: '/dashboard/messages',     icon: '💬', label: 'Messages' },
  { href: '/dashboard/escrow',       icon: '🔒', label: 'Escrow Account' },
  { href: '/dashboard/profile',      icon: '👤', label: 'My Profile' },
]

const ADMIN_NAV = [
  { href: '/dashboard/admin/transactions', icon: '👁', label: 'Monitor Transactions' },
  { href: '/dashboard/admin/messages',     icon: '👁', label: 'Monitor Messages' },
  { href: '/dashboard/admin/escrow',       icon: '🔒', label: 'Monitor Escrow' },
  { href: '/dashboard/admin/deposits',     icon: '📄', label: 'Deposit Applications' },
  { href: '/dashboard/admin/inquiries',    icon: '🔍', label: 'Monitor Inquiries' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [checking, setChecking]       = useState(true)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [userEmail, setUserEmail]     = useState<string | null>(null)
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [cartCount, setCartCount]     = useState(0)
  const [pendingTx, setPendingTx]     = useState(0)
  const [escrowBal, setEscrowBal]     = useState(0)

  const [escrowBals, setEscrowBals] = useState<{currency: string; balance: number}[]>([])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserEmail(session.user.email ?? null)

    const { data: profile } = await supabase
      .from('profiles').select('company_id, role').eq('id', session.user.id).single()

    if (profile?.company_id) {
      setMyCompanyId(profile.company_id)
      setIsAdmin(profile.role === 'admin')

      const { data: company } = await supabase
        .from('companies').select('name').eq('id', profile.company_id).single()
      setCompanyName(company?.name ?? null)

      loadBadges(profile.company_id)
    }
    setChecking(false)
  }

  async function loadBadges(cid: string) {
    const [unread, cart, tx, escrow] = await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_company_id', cid).is('read_at', null),
      supabase.from('cart_items').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('company_id', cid).in('status', ['offer_sent', 'confirmed', 'payment_held', 'dispatched']),
      supabase.from('escrow_balances').select('currency, balance').eq('company_id', cid),
    ])
    setUnreadCount(unread.count || 0)
    setCartCount(cart.count || 0)
    setPendingTx(tx.count || 0)
    setEscrowBals((escrow.data || []) as any)
    // Keep backward compat for single EUR value
    const eurBal = (escrow.data || []).find((b: any) => b.currency === 'EUR')
    setEscrowBal((eurBal as any)?.balance || 0)
  }

  useEffect(() => {
    if (!myCompanyId) return
    const ch = supabase.channel('layout-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_company_id=eq.${myCompanyId}` }, () => loadBadges(myCompanyId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items', filter: `company_id=eq.${myCompanyId}` }, () => loadBadges(myCompanyId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `company_id=eq.${myCompanyId}` }, () => loadBadges(myCompanyId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escrow_ledger', filter: `company_id=eq.${myCompanyId}` }, () => loadBadges(myCompanyId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_applications', filter: `company_id=eq.${myCompanyId}` }, () => loadBadges(myCompanyId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myCompanyId])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checking) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#64748b', fontSize: 13 }}>Loading...</div>
    </div>
  )

  const Badge = ({ n, color = '#ef4444' }: { n: number; color?: string }) => n > 0 ? (
    <span style={{ background: color, color: 'white', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 700, marginLeft: 4 }}>{n}</span>
  ) : null

  const NavLink = ({ item }: { item: typeof NAV[0] }) => {
    const isActive = pathname?.startsWith(item.href)
    const badge =
      item.href === '/dashboard/messages'     ? <Badge n={unreadCount} /> :
      item.href === '/dashboard/buying'        ? <Badge n={cartCount} color='#2563eb' /> :
      item.href === '/dashboard/transactions'  ? <Badge n={pendingTx} color='#f59e0b' /> :
      null

    return (
      <Link href={item.href} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', borderRadius: 6, textDecoration: 'none', fontSize: 13,
        background: isActive ? '#e2e8f0' : 'transparent',
        color: isActive ? '#0f172a' : '#64748b',
        fontWeight: isActive ? 600 : 400,
      }}>
        <span>{item.icon} {item.label}</span>
        {badge}
      </Link>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* SIDEBAR */}
      <div style={{ width: 240, background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>

        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>SpareShare</div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.08em' }}>B2B Exchange</div>
        </div>

        {/* Company info */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{companyName}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{userEmail}</div>
          {isAdmin && <div style={{ fontSize: 10, marginTop: 3, padding: '1px 6px', background: '#fef3c7', color: '#92400e', borderRadius: 4, display: 'inline-block', fontWeight: 700 }}>ADMIN</div>}
        </div>

        {/* Escrow balance mini */}
        <div style={{ padding: '8px 20px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => router.push('/dashboard/escrow')}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Escrow Balance</div>
          {escrowBals.length > 0 ? escrowBals.map(b => (
            <div key={b.currency} style={{ fontSize: 13, fontWeight: 700, color: b.balance > 0 ? '#059669' : '#94a3b8' }}>
              {b.currency === 'EUR' ? '€' : b.currency === 'USD' ? '$' : b.currency === 'GBP' ? '£' : ''}{Number(b.balance).toFixed(2)} <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>{b.currency}</span>
            </div>
          )) : (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>€0.00</div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px', flex: 1 }}>
          {NAV.map(item => <NavLink key={item.href} item={item} />)}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div style={{ fontSize: 10, color: '#94a3b8', padding: '12px 12px 4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Admin</div>
              {ADMIN_NAV.map(item => <NavLink key={item.href} item={item} />)}
            </>
          )}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '10px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={handleLogout} style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, background: '#f8fafc', minHeight: '100vh' }}>
        <div style={{ padding: 32 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
