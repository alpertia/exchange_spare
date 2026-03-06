'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Stats = { listings: number; buyIntents: number; messages: number; transactions: number }
type RecentTx = { id: string; type: 'buy' | 'sell'; status: string; pn: string; brand: string; counterpart: string; created_at: string }

const QUICK_ACTIONS = [
  { icon: '🌐', label: 'Search Marketplace', desc: 'Find parts from other companies', href: '/dashboard/marketplace' },
  { icon: '📦', label: 'Add Listing',         desc: 'List parts you want to sell',    href: '/dashboard/add-listing' },
  { icon: '🛒', label: 'New Buy Intent',       desc: 'Post what you\'re looking for',  href: '/dashboard/buy-intents' },
  { icon: '📥', label: 'CSV Import',           desc: 'Bulk upload your inventory',    href: '/dashboard/csv-import' },
  { icon: '📊', label: 'Analytics',            desc: 'View market intelligence',      href: '/dashboard/analytics' },
  { icon: '💬', label: 'Messages',             desc: 'Communicate anonymously',       href: '/dashboard/messages' },
]

const STATUS_COLOR: Record<string, [string, string]> = {
  pending:    ['#92400e', '#fffbeb'],
  confirmed:  ['#1d4ed8', '#eff6ff'],
  dispatched: ['#6d28d9', '#f5f3ff'],
  delivered:  ['#15803d', '#f0fdf4'],
  cancelled:  ['#dc2626', '#fef2f2'],
}

export default function DashboardPage() {
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<RecentTx[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!profile?.company_id) { setLoading(false); return }

    const cid = profile.company_id

    const { data: co } = await supabase.from('companies').select('name').eq('id', cid).single()
    setCompanyName(co?.name ?? null)

    // Parallel fetches
    const [
      { count: listingCount },
      { count: intentCount },
      { count: msgCount },
      { count: txCount },
      { data: recentTx },
    ] = await Promise.all([
      supabase.from('listings').select('*', { count: 'exact', head: true }).eq('company_id', cid).eq('status', 'active'),
      supabase.from('trade_intent').select('*', { count: 'exact', head: true }).eq('company_id', cid).eq('status', 'active'),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_company_id', cid).is('read_at', null),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('transactions')
        .select('id, type, status, created_at, product:product_id(normalized_pn, brand), counterpart:counterpart_id(name)')
        .eq('company_id', cid)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    setStats({ listings: listingCount || 0, buyIntents: intentCount || 0, messages: msgCount || 0, transactions: txCount || 0 })
    setUnread(msgCount || 0)
    setRecent((recentTx || []).map((t: any) => ({
      id: t.id, type: t.type, status: t.status,
      pn: t.product?.normalized_pn || '—',
      brand: t.product?.brand || '—',
      counterpart: t.counterpart?.name || '—',
      created_at: t.created_at,
    })))
    setLoading(false)
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const timeAgo = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (m < 60) return `${m}m ago`
    if (m < 1440) return `${Math.floor(m / 60)}h ago`
    return new Date(d).toLocaleDateString()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>
      Loading dashboard...
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
          {greeting()}{companyName ? `, ${companyName}` : ''}
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8' }}>Here's what's happening in the marketplace today.</div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 36 }}>
          {[
            { label: 'Active Listings', value: stats.listings,     icon: '📦', href: '/dashboard/listings',     color: '#1e40af', bg: '#eff6ff' },
            { label: 'Buy Intents',     value: stats.buyIntents,   icon: '🛒', href: '/dashboard/buy-intents',  color: '#15803d', bg: '#f0fdf4' },
            { label: 'Unread Messages', value: stats.messages,     icon: '💬', href: '/dashboard/messages',     color: stats.messages > 0 ? '#dc2626' : '#64748b', bg: stats.messages > 0 ? '#fef2f2' : '#f8fafc' },
            { label: 'Transactions',    value: stats.transactions, icon: '🔄', href: '/dashboard/transactions', color: '#6d28d9', bg: '#f5f3ff' },
          ].map(s => (
            <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', transition: 'box-shadow 0.15s', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  {s.value > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>{s.value}</span>}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Quick Actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {QUICK_ACTIONS.map(a => (
            <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', cursor: 'pointer', height: '100%' }}
                onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = '#bfdbfe'; d.style.background = '#fafcff' }}
                onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = '#e2e8f0'; d.style.background = 'white' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{a.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>{a.label}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{a.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent Transactions</div>
          <Link href="/dashboard/transactions" style={{ fontSize: 12, color: '#1e40af', textDecoration: 'none' }}>View all →</Link>
        </div>

        {recent.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '36px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔄</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>No transactions yet</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Contact sellers from the Marketplace to start a deal.</div>
            <Link href="/dashboard/marketplace" style={{ padding: '8px 18px', background: '#1e40af', color: 'white', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            {recent.map((tx, i) => {
              const [sc, sb] = STATUS_COLOR[tx.status] || ['#64748b', '#f8fafc']
              return (
                <div key={tx.id} style={{ padding: '14px 20px', borderBottom: i < recent.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 600, background: tx.type === 'buy' ? '#eff6ff' : '#f0fdf4', color: tx.type === 'buy' ? '#1e40af' : '#15803d' }}>
                        {tx.type.toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{tx.brand} {tx.pn}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {tx.type === 'buy' ? 'From' : 'To'}: {tx.counterpart} · {timeAgo(tx.created_at)}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: sb, color: sc, fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>
                    {tx.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Unread messages banner */}
      {unread > 0 && (
        <div style={{ marginTop: 20, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, color: '#991b1b', fontWeight: 500 }}>
            💬 You have <strong>{unread} unread message{unread > 1 ? 's' : ''}</strong>
          </div>
          <Link href="/dashboard/messages" style={{ padding: '7px 14px', background: '#dc2626', color: 'white', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
            Read Now
          </Link>
        </div>
      )}
    </div>
  )
}
