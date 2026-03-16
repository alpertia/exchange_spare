'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Notif = {
  id: string
  type: string
  title: string
  body: string | null
  source_table: string | null
  source_id: string | null
  company_id: string | null
  company_name: string | null
  read_at: string | null
  resolved_at: string | null
  created_at: string
}

const TYPE_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  admin_mention:      { icon: '📣', color: '#f59e0b', bg: '#fffbeb', label: '@Admin Mention' },
  correction_request: { icon: '✏️', color: '#dc2626', bg: '#fef2f2', label: 'Correction Request' },
  dispute:            { icon: '⚠️', color: '#dc2626', bg: '#fef2f2', label: 'Dispute Opened' },
  escrow_request: { icon: '🛡️', color: '#7c3aed', bg: '#f5f3ff', label: 'Trade Assurance Request' },
  deposit_pending:    { icon: '📄', color: '#059669', bg: '#ecfdf5', label: 'Deposit Application' },
  tx_needs_action:    { icon: '🔄', color: '#2563eb', bg: '#eff6ff', label: 'TX Needs Action' },
  message_mention:    { icon: '💬', color: '#0891b2', bg: '#ecfeff', label: 'Message @Admin' },
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return new Date(d).toLocaleDateString()
}

export default function AdminNotificationsPage() {
  const router = useRouter()
  const [notifs, setNotifs]     = useState<Notif[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'all' | 'unread' | 'unresolved'>('unread')
  const [typeFilter, setTypeFilter] = useState('all')

  // Live counts for sidebar badge
  const [counts, setCounts] = useState({
    adminMentions: 0, corrections: 0, disputes: 0,
    escrow: 0, deposits: 0, txActions: 0, messages: 0,
  })

  const load = useCallback(async () => {
    setLoading(true)

    // 1. Notifications table
    let q = supabase.from('admin_notifications').select('*').order('created_at', { ascending: false }).limit(200)
    if (filter === 'unread')    q = q.is('read_at', null)
    if (filter === 'unresolved') q = q.is('resolved_at', null)
    if (typeFilter !== 'all')   q = q.eq('type', typeFilter)
    const { data: notifData } = await q

    // 2. Pull live data from other tables to enrich
    const [txRes, depositRes, escrowRes] = await Promise.all([
      supabase.from('transactions').select('id, tx_number, status, company_id, companies:company_id(name)')
        .in('status', ['payment_held', 'delivered', 'disputed']).limit(50),
      supabase.from('deposit_applications').select('id, company_id, amount, currency, companies:company_id(name)')
        .eq('status', 'pending').limit(50),
      supabase.from('transactions').select('id, tx_number, escrow_status, company_id, companies:company_id(name)')
        .eq('escrow_status', 'requested').limit(50),
    ])

    // Build synthetic notifs from live tables
    const liveNotifs: Notif[] = []

    ;(txRes.data || []).forEach((t: any) => {
      liveNotifs.push({
        id: `tx-${t.id}`, type: t.status === 'disputed' ? 'dispute' : 'tx_needs_action',
        title: t.status === 'disputed' ? `Dispute: ${t.tx_number || t.id.slice(0,8)}` : `TX needs admin: ${t.tx_number || t.id.slice(0,8)}`,
        body: `Status: ${t.status}`,
        source_table: 'transactions', source_id: t.id,
        company_id: t.company_id, company_name: t.companies?.name || '—',
        read_at: null, resolved_at: null, created_at: new Date().toISOString(),
      })
    })

    ;(depositRes.data || []).forEach((d: any) => {
      liveNotifs.push({
        id: `dep-${d.id}`, type: 'deposit_pending',
        title: `Deposit: ${d.amount} ${d.currency}`,
        body: `Pending review`,
        source_table: 'deposit_applications', source_id: d.id,
        company_id: d.company_id, company_name: d.companies?.name || '—',
        read_at: null, resolved_at: null, created_at: new Date().toISOString(),
      })
    })

    ;(escrowRes.data || []).forEach((t: any) => {
      liveNotifs.push({
        id: `esc-${t.id}`, type: 'escrow_request',
        title: `Trade Assurance requested: ${t.tx_number || t.id.slice(0,8)}`,
        body: null,
        source_table: 'transactions', source_id: t.id,
        company_id: t.company_id, company_name: t.companies?.name || '—',
        read_at: null, resolved_at: null, created_at: new Date().toISOString(),
      })
    })

    // Merge — dedupe by source_id
    const all = [...liveNotifs, ...(notifData || [])]
    const seen = new Set<string>()
    const deduped = all.filter(n => { const k = n.source_id || n.id; if (seen.has(k)) return false; seen.add(k); return true })

    setNotifs(deduped)
    setCounts({
      adminMentions: (notifData || []).filter(n => n.type === 'admin_mention' && !n.read_at).length,
      corrections:   (notifData || []).filter(n => n.type === 'correction_request' && !n.resolved_at).length,
      disputes:      txRes.data?.filter((t: any) => t.status === 'disputed').length || 0,
      escrow:        escrowRes.data?.length || 0,
      deposits:      depositRes.data?.length || 0,
      txActions:     txRes.data?.filter((t: any) => t.status !== 'disputed').length || 0,
      messages:      (notifData || []).filter(n => n.type === 'message_mention' && !n.read_at).length,
    })
    setLoading(false)
  }, [filter, typeFilter])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('admin-notif')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_applications' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function markRead(id: string) {
    if (id.startsWith('tx-') || id.startsWith('dep-') || id.startsWith('esc-')) return
    await supabase.from('admin_notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function markResolved(id: string) {
    if (id.startsWith('tx-') || id.startsWith('dep-') || id.startsWith('esc-')) {
      // Navigate to relevant page
      const notif = notifs.find(n => n.id === id)
      if (notif?.source_table === 'transactions') router.push('/dashboard/admin/trade-assurance')
      if (notif?.source_table === 'deposit_applications') router.push('/dashboard/admin/deposits')
      return
    }
    await supabase.from('admin_notifications').update({ resolved_at: new Date().toISOString(), read_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function markAllRead() {
    await supabase.from('admin_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    load()
  }

  function navigateTo(n: Notif) {
    markRead(n.id)
    if (n.source_table === 'product_comments' && n.source_id) router.push(`/dashboard/knowledge/${n.source_id}`)
    else if (n.source_table === 'transactions') router.push('/dashboard/admin/trade-assurance')
    else if (n.source_table === 'deposit_applications') router.push('/dashboard/admin/deposits')
    else if (n.source_table === 'messages') router.push('/dashboard/admin/messages')
  }

  const totalUnread = notifs.filter(n => !n.read_at).length
  const types = ['all', 'admin_mention', 'correction_request', 'dispute', 'escrow_request', 'deposit_pending', 'tx_needs_action', 'message_mention']

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>🔔 Admin Inbox</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>All requests, mentions, disputes & actions in one place</div>
        </div>
        {totalUnread > 0 && (
          <button onClick={markAllRead}
            style={{ marginLeft: 'auto', padding: '6px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
            Mark all read ({totalUnread})
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Corrections', count: counts.corrections, color: '#dc2626', bg: '#fef2f2', type: 'correction_request' },
          { label: 'Disputes',    count: counts.disputes,    color: '#dc2626', bg: '#fef2f2', type: 'dispute' },
          { label: 'Trade Assurance',      count: counts.escrow,      color: '#7c3aed', bg: '#f5f3ff', type: 'escrow_request' },
          { label: 'Deposits',    count: counts.deposits,    color: '#059669', bg: '#ecfdf5', type: 'deposit_pending' },
        ].map(c => (
          <div key={c.label} onClick={() => setTypeFilter(c.type)}
            style={{ padding: '12px 16px', background: c.count > 0 ? c.bg : 'white', border: `1px solid ${c.count > 0 ? c.color + '30' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.count > 0 ? c.color : '#94a3b8' }}>{c.count}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3 }}>
          {(['all', 'unread', 'unresolved'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '4px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: filter === f ? 700 : 400, background: filter === f ? '#0f172a' : 'transparent', color: filter === f ? 'white' : '#64748b' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', background: 'white', color: '#0f172a' }}>
          {types.map(t => (
            <option key={t} value={t}>{t === 'all' ? 'All types' : TYPE_META[t]?.label || t}</option>
          ))}
        </select>
      </div>

      {/* Notification list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
      ) : notifs.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>All clear!</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>No pending items</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notifs.map(n => {
            const meta = TYPE_META[n.type] || { icon: '📌', color: '#64748b', bg: '#f8fafc', label: n.type }
            const isUnread = !n.read_at
            const isResolved = !!n.resolved_at
            return (
              <div key={n.id}
                style={{ background: isUnread ? meta.bg : 'white', border: `1px solid ${isUnread ? meta.color + '30' : '#e2e8f0'}`, borderLeft: `3px solid ${isResolved ? '#e2e8f0' : meta.color}`, borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', opacity: isResolved ? 0.6 : 1 }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>{meta.icon}</div>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigateTo(n)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: meta.color + '15', color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                    {isUnread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />}
                    {isResolved && <span style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>✓ Resolved</span>}
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{timeAgo(n.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                  {n.company_name && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>from {n.company_name}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {!isResolved && (
                    <button onClick={() => markResolved(n.id)}
                      style={{ padding: '4px 10px', background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      {n.source_table === 'transactions' || n.source_table === 'deposit_applications' ? '→ Go' : '✓ Resolve'}
                    </button>
                  )}
                  {isUnread && !n.id.startsWith('tx-') && !n.id.startsWith('dep-') && !n.id.startsWith('esc-') && (
                    <button onClick={() => markRead(n.id)}
                      style={{ padding: '4px 10px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
                      Read
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
