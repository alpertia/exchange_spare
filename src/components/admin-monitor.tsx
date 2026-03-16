'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
type AdminPage = 'transactions' | 'messages' | 'trade-assurance' | 'deposits'

interface PageConfig {
  title: string
  accent: string       // main accent color
  accentLight: string  // light bg
  accentBorder: string
  icon: string
}

const PAGE_CONFIG: Record<AdminPage, PageConfig> = {
  transactions: { title: 'Monitor Transactions', accent: '#2563eb', accentLight: '#eff6ff', accentBorder: '#bfdbfe', icon: '🔄' },
  messages:     { title: 'Monitor Messages',     accent: '#7c3aed', accentLight: '#f5f3ff', accentBorder: '#ddd6fe', icon: '💬' },
  'trade-assurance': { title: 'Monitor Trade Assurance',       accent: '#0891b2', accentLight: '#ecfeff', accentBorder: '#a5f3fc', icon: '🔒' },
  deposits:     { title: 'Deposit Applications', accent: '#059669', accentLight: '#ecfdf5', accentBorder: '#6ee7b7', icon: '📄' },
}

// ─── Event feed item ───────────────────────────────────────────────────────────
interface FeedEvent {
  id: string
  time: string
  label: string
  sub: string
  color: string
  data: any
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return new Date(d).toLocaleDateString()
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, accent, accentLight }: { status: string; accent: string; accentLight: string }) {
  const colors: Record<string, [string, string]> = {
    offer_sent:               ['#2563eb', '#eff6ff'],
    offer_accepted:           ['#15803d', '#f0fdf4'],
    order_confirmed:          ['#15803d', '#f0fdf4'],
    prepayment_deposited:     ['#7c3aed', '#f5f3ff'],
    prepayment_confirmed:     ['#7c3aed', '#f5f3ff'],
    ready_to_ship:            ['#0891b2', '#ecfeff'],
    preshipment_deposited:    ['#7c3aed', '#f5f3ff'],
    preshipment_paid:         ['#7c3aed', '#f5f3ff'],
    shipment_authorized:      ['#0891b2', '#ecfeff'],
    shipped:                  ['#0891b2', '#ecfeff'],
    final_payment_deposited:  ['#7c3aed', '#f5f3ff'],
    final_payment_paid:       ['#7c3aed', '#f5f3ff'],
    confirmed:    ['#059669', '#ecfdf5'],
    payment_held: ['#7c3aed', '#f5f3ff'],
    dispatched:   ['#0891b2', '#ecfeff'],
    delivered:    ['#059669', '#ecfdf5'],
    completed:    ['#059669', '#ecfdf5'],
    cancelled:    ['#dc2626', '#fef2f2'],
    disputed:     ['#dc2626', '#fef2f2'],
    pending:      ['#d97706', '#fffbeb'],
    approved:     ['#059669', '#ecfdf5'],
    rejected:     ['#dc2626', '#fef2f2'],
    requested:    ['#7c3aed', '#f5f3ff'],
    held:         ['#0891b2', '#ecfeff'],
    released:     ['#059669', '#ecfdf5'],
    refunded:     ['#dc2626', '#fef2f2'],
    active:       ['#059669', '#ecfdf5'],
    closed:       ['#64748b', '#f1f5f9'],
    none:         ['#94a3b8', '#f8fafc'],
  }
  const [c, bg] = colors[status?.toLowerCase()] || [accent, accentLight]
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: bg, color: c, fontWeight: 600, whiteSpace: 'nowrap' as const }}>
      {status}
    </span>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({ options, active, onChange, accent }: { options: string[]; active: string; onChange: (v: string) => void; accent: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${active === o ? accent : '#e2e8f0'}`, cursor: 'pointer', fontSize: 11, fontWeight: active === o ? 700 : 400, background: active === o ? accent : 'white', color: active === o ? 'white' : '#64748b' }}>
          {o}
        </button>
      ))}
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function Row({ children, onClick, selected }: { children: React.ReactNode; onClick?: () => void; selected?: boolean }) {
  return (
    <tr onClick={onClick} style={{ borderBottom: '1px solid #f1f5f9', cursor: onClick ? 'pointer' : 'default', background: selected ? '#f8fafc' : 'white', transition: 'background 0.1s' }}>
      {children}
    </tr>
  )
}
function TD({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td style={{ padding: '7px 10px', fontSize: 11, color: '#0f172a', fontFamily: mono ? 'monospace' : undefined, whiteSpace: 'nowrap' as const }}>{children}</td>
}
function TH({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#64748b', textAlign: 'left' as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>{children}</th>
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
function DetailDrawer({ item, page, onClose, accent, accentLight }: { item: any; page: AdminPage; onClose: () => void; accent: string; accentLight: string }) {
  if (!item) return null
  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 420, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)', zIndex: 50, overflowY: 'auto' as const, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Detail</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {Object.entries(item).filter(([k]) => !['id', 'linked_transaction_id'].includes(k)).map(([k, v]) => (
          <div key={k} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase' as const, fontWeight: 600, letterSpacing: '0.06em' }}>{k.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 13, color: '#0f172a', wordBreak: 'break-all' as const }}>{v === null || v === undefined ? '—' : String(v)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function TransactionsMonitor({ cfg }: { cfg: PageConfig }) {
  const [rows, setRows] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [adminEscrow, setAdminEscrow] = useState<{currency: string; balance: number}[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [txRes, adminEscrowRes] = await Promise.all([
      supabase.from('transactions')
        .select('*, company:company_id(name), counterpart:counterpart_id(name), product:product_id(normalized_pn, brand)')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('admin_escrow_balance').select('*'),
    ])
    setAdminEscrow(adminEscrowRes.data || [])
    const rows = (txRes.data || []).map((t: any) => ({
      ...t,
      company_name: t.company?.name || '—',
      counterpart_name: t.counterpart?.name || '—',
      pn: t.product?.normalized_pn || '—',
      brand: t.product?.brand || '—',
    }))
    setRows(rows)
    setEvents(rows.slice(0, 30).map((t: any) => ({
      id: t.id, time: t.created_at,
      label: `${t.type?.toUpperCase()} ${t.tx_number || ''}`,
      sub: `${t.company_name} → ${t.counterpart_name}`,
      color: t.status === 'completed' ? '#059669' : t.status === 'cancelled' ? '#dc2626' : cfg.accent,
      data: t,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('admin-tx').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function adminAdvanceTx(tx: any, newStatus: string) {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() }

    // Release Trade Assurance to seller when completing
    // Always derive seller/buyer from the BUY side tx
    const buyerCompanyId = tx.type === 'buy' ? tx.company_id : tx.counterpart_id
    const sellerCompanyId = tx.type === 'sell' ? tx.company_id : tx.counterpart_id

    // Get escrow_amount — buy side has it, sell side may be null
    // Fall back to actual admin_escrow_account balance for this tx
    let escrowAmt = tx.escrow_amount
    let escrowCur = tx.escrow_currency || 'EUR'
    if (!escrowAmt) {
      const { data: adminHeld } = await supabase
        .from('admin_escrow_account')
        .select('amount')
        .eq('tx_id', tx.linked_transaction_id || tx.id)
        .eq('type', 'trade_hold')
      escrowAmt = adminHeld ? adminHeld.reduce((s: number, r: any) => s + r.amount, 0) : 0
    }

    if (newStatus === 'completed' && escrowAmt && escrowCur) {
      const sellerId = sellerCompanyId
      const { data: result } = await supabase.rpc('escrow_trade_release', {
        p_tx_id: tx.id,
        p_seller_company_id: sellerId,
        p_amount: tx.escrow_amount,
        p_currency: tx.escrow_currency,
      })
      if (!result?.ok) {
        alert('Trade Assurance release failed: ' + (result?.error || 'unknown error'))
        return
      }
      updates.escrow_status = 'released'
      updates.escrow_released_at = new Date().toISOString()
    }

    // Refund Trade Assurance to buyer when resolving in buyer's favor
    if ((newStatus === 'resolved_buyer' || newStatus === 'cancelled') && escrowAmt && tx.escrow_status === 'held') {
      const buyerId = buyerCompanyId
      const { data: result } = await supabase.rpc('escrow_trade_refund', {
        p_tx_id: tx.id,
        p_buyer_company_id: buyerId,
        p_amount: escrowAmt,
        p_currency: escrowCur,
      })
      if (!result?.ok) {
        alert('Trade Assurance refund failed: ' + (result?.error || 'unknown error'))
        return
      }
      updates.escrow_status = 'refunded'
    }

    // Seller gets Trade Assurance when resolved in seller's favor
    if (newStatus === 'resolved_seller' && escrowAmt && tx.escrow_status === 'held') {
      const sellerId = sellerCompanyId
      const { data: result } = await supabase.rpc('escrow_trade_release', {
        p_tx_id: tx.id,
        p_seller_company_id: sellerId,
        p_amount: escrowAmt,
        p_currency: escrowCur,
      })
      if (!result?.ok) {
        alert('Trade Assurance release failed: ' + (result?.error || 'unknown error'))
        return
      }
      updates.escrow_status = 'released'
      updates.escrow_released_at = new Date().toISOString()
    }

    await supabase.from('transactions').update(updates).eq('id', tx.id)
    if (tx.linked_transaction_id) {
      await supabase.from('transactions').update(updates).eq('id', tx.linked_transaction_id)
    }
    await supabase.from('tx_events').insert({
      tx_id: tx.id, from_status: tx.status, to_status: newStatus, actor: 'admin',
    })
    load()
  }

  const ADMIN_ACTION_STATUSES = ['payment_held', 'delivered', 'disputed']
  const statuses = ['all', 'needs_action', 'offer_sent', 'confirmed', 'payment_held', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'cancelled', 'disputed', 'resolved_buyer', 'resolved_seller', 'resolved_split']
  const filtered = rows.filter(r => {
    if (filter === 'needs_action' && !ADMIN_ACTION_STATUSES.includes(r.status)) return false
    if (filter !== 'all' && filter !== 'needs_action' && r.status !== filter) return false
    if (search && !`${r.tx_number} ${r.company_name} ${r.counterpart_name} ${r.pn}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 12, minWidth: 0 }}>
        {/* Admin Trade Assurance balance cards */}
        {adminEscrow.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center' }}>🛡️ Admin Trade Assurance Held:</div>
            {adminEscrow.map(b => (
              <div key={b.currency} style={{ padding: '4px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#6d28d9' }}>
                {b.currency === 'EUR' ? '€' : b.currency === 'USD' ? '$' : b.currency === 'GBP' ? '£' : ''}{Number(b.balance).toLocaleString()} {b.currency}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search TX#, company, PN..." style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', width: 240 }} />
          <FilterBar options={statuses} active={filter} onChange={setFilter} accent={cfg.accent} />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{filtered.length} transactions</span>
        </div>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', flex: 1 }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><TH>TX #</TH><TH>Type</TH><TH>Status</TH><TH>Company</TH><TH>Counterpart</TH><TH>PN</TH><TH>Qty</TH><TH>Price</TH><TH>Trade Assurance</TH><TH>Date</TH><TH>Admin Action</TH></tr></thead>
              <tbody>
                {filtered.map(t => (
                  <Row key={t.id} onClick={() => setSelected(t)} selected={selected?.id === t.id}>
                    <TD mono>{t.tx_number || '—'}</TD>
                    <TD><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: t.type === 'buy' ? '#eff6ff' : '#ecfdf5', color: t.type === 'buy' ? '#2563eb' : '#059669', fontWeight: 700 }}>{t.type?.toUpperCase()}</span></TD>
                    <TD><StatusBadge status={t.status} accent={cfg.accent} accentLight={cfg.accentLight} /></TD>
                    <TD><strong>{t.company_name}</strong></TD>
                    <TD>{t.counterpart_name}</TD>
                    <TD mono>{t.pn}</TD>
                    <TD>{t.quantity || '—'}</TD>
                    <TD>{t.price ? `${t.price} ${t.currency}` : '—'}</TD>
                    <TD>{t.escrow_status !== 'none' && t.escrow_status ? <StatusBadge status={t.escrow_status} accent={cfg.accent} accentLight={cfg.accentLight} /> : <span style={{ color: '#e2e8f0' }}>—</span>}</TD>
                    <TD>{new Date(t.created_at).toLocaleDateString()}</TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                        {t.status === 'payment_held' && (
                          <button onClick={() => adminAdvanceTx(t, 'ready_to_ship')} style={{ padding: '3px 8px', background: '#ecfeff', color: '#0891b2', border: '1px solid #a5f3fc', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>✓ Approve & Ship</button>
                        )}
                        {t.status === 'delivered' && (
                          <button onClick={() => adminAdvanceTx(t, 'completed')} style={{ padding: '3px 8px', background: '#f0fdf4', color: '#059669', border: '1px solid #6ee7b7', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>✓ Release Trade Assurance</button>
                        )}
                        {t.status === 'disputed' && (
                          <>
                            <button onClick={() => adminAdvanceTx(t, 'resolved_buyer')} style={{ padding: '3px 8px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>→ Buyer</button>
                            <button onClick={() => adminAdvanceTx(t, 'resolved_seller')} style={{ padding: '3px 8px', background: '#f0fdf4', color: '#059669', border: '1px solid #6ee7b7', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>→ Seller</button>
                          </>
                        )}
                      </div>
                    </TD>
                  </Row>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* Event feed */}
      <EventFeed events={events} cfg={cfg} onSelect={e => setSelected(e.data)} selectedId={selected?.id} />
      {selected && <DetailDrawer item={selected} page="transactions" onClose={() => setSelected(null)} accent={cfg.accent} accentLight={cfg.accentLight} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES PAGE
// ══════════════════════════════════════════════════════════════════════════════
function MessagesMonitor({ cfg }: { cfg: PageConfig }) {
  const [convs, setConvs] = useState<any[]>([])
  const [msgs, setMsgs] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('*, ca:company_a(name), cb:company_b(name), product:product_id(normalized_pn, brand)')
      .order('created_at', { ascending: false })
      .limit(200)
    setConvs(data || [])
    const allMsgs = await supabase.from('messages').select('*, sender:sender_company_id(name)').order('created_at', { ascending: false }).limit(50)
    setMsgs(allMsgs.data || [])
    setEvents((allMsgs.data || []).slice(0, 30).map((m: any) => ({
      id: m.id, time: m.created_at,
      label: m.sender?.name || '?',
      sub: m.content?.slice(0, 50) || '',
      color: m.read_at ? '#94a3b8' : cfg.accent,
      data: m,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function loadConvMsgs(convId: string) {
    const { data } = await supabase.from('messages').select('*, sender:sender_company_id(name)').eq('conversation_id', convId).order('created_at')
    setMsgs(data || [])
  }

  const filtered = convs.filter(c => {
    const name = `${c.ca?.name} ${c.cb?.name} ${c.product?.normalized_pn || ''}`.toLowerCase()
    if (search && !name.includes(search.toLowerCase())) return false
    if (filter !== 'all' && c.status !== filter) return false
    return true
  })

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      <div style={{ flex: 1, display: 'flex', gap: 12, minWidth: 0 }}>
        {/* Conversations list */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search firms, PN..." style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }} />
          <FilterBar options={['all', 'active', 'closed']} active={filter} onChange={setFilter} accent={cfg.accent} />
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', flex: 1 }}>
            {loading ? <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Loading...</div>
              : filtered.map(c => (
                <div key={c.id} onClick={() => { setSelected(c); loadConvMsgs(c.id) }}
                  style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selected?.id === c.id ? cfg.accentLight : 'white' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{c.ca?.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>↔ {c.cb?.name}</div>
                  {c.product?.normalized_pn && <div style={{ fontSize: 10, color: cfg.accent, marginTop: 2, fontFamily: 'monospace' }}>{c.product.normalized_pn}</div>}
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{new Date(c.created_at).toLocaleDateString()}</div>
                </div>
              ))}
          </div>
        </div>
        {/* Messages */}
        <div style={{ flex: 1, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Select a conversation</div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600 }}>
                {selected.ca?.name} ↔ {selected.cb?.name}
                {selected.product?.normalized_pn && <span style={{ marginLeft: 8, fontFamily: 'monospace', color: cfg.accent }}>{selected.product.normalized_pn}</span>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' as const, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                {msgs.map(m => (
                  <div key={m.id}>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{m.sender?.name || '?'} · {timeAgo(m.created_at)} {m.read_at ? '· read' : '· unread'}</div>
                    <div style={{ fontSize: 13, color: '#0f172a', background: '#f8fafc', padding: '8px 12px', borderRadius: 8, maxWidth: '85%' }}>{m.content}</div>
                    {m.image_url && <img src={m.image_url} alt="" style={{ marginTop: 4, maxWidth: 200, borderRadius: 6 }} />}
                    {m.tx_number && <div style={{ fontSize: 10, color: cfg.accent, marginTop: 2, fontFamily: 'monospace' }}>ref: {m.tx_number}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <EventFeed events={events} cfg={cfg} onSelect={e => { setSelected(null); setMsgs([e.data]) }} selectedId={null} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TRADE ASSURANCE PAGE
// ══════════════════════════════════════════════════════════════════════════════
function TradeAssuranceMonitor({ cfg }: { cfg: PageConfig }) {
  const [rows, setRows] = useState<any[]>([])
  const [ledger, setLedger] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [txRes, ledgerRes] = await Promise.all([
      supabase.from('transactions').select('*, company:company_id(name), counterpart:counterpart_id(name), product:product_id(normalized_pn)').neq('escrow_status', 'none').not('escrow_status', 'is', null).order('created_at', { ascending: false }),
      supabase.from('escrow_ledger').select('*, company:company_id(name)').order('created_at', { ascending: false }).limit(100),
    ])
    const seen = new Set<string>()
    const deduped = (txRes.data || []).filter((t: any) => { const k = t.linked_transaction_id || t.id; if (seen.has(k)) return false; seen.add(k); return true })
    setRows(deduped)
    setLedger(ledgerRes.data || [])
    setEvents(deduped.slice(0, 30).map((t: any) => ({
      id: t.id, time: t.created_at,
      label: `Escrow ${t.escrow_status?.toUpperCase()}`,
      sub: `${t.company?.name} · ${t.escrow_amount || '?'} ${t.escrow_currency || 'EUR'}`,
      color: t.escrow_status === 'released' ? '#059669' : t.escrow_status === 'refunded' ? '#dc2626' : cfg.accent,
      data: t,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    if (filter !== 'all' && r.escrow_status !== filter) return false
    if (search && !`${r.tx_number} ${r.company?.name} ${r.counterpart?.name}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function takeAction(tx: any, action: string) {
    await supabase.rpc('set_escrow', { tx_id: tx.id, new_escrow_status: action, ref: null, held_at: action === 'held' ? new Date().toISOString() : null, released_at: action === 'released' ? new Date().toISOString() : null })
    load()
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search TX#, company..." style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', width: 240 }} />
          <FilterBar options={['all', 'requested', 'held', 'released', 'refunded']} active={filter} onChange={setFilter} accent={cfg.accent} />
        </div>
        {/* Trade Assurance transactions */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', flex: 1 }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><TH>TX #</TH><TH>Status</TH><TH>Buyer</TH><TH>Seller</TH><TH>Amount</TH><TH>Ref</TH><TH>Date</TH><TH>Actions</TH></tr></thead>
              <tbody>
                {filtered.map(t => (
                  <Row key={t.id} onClick={() => setSelected(t)} selected={selected?.id === t.id}>
                    <TD mono>{t.tx_number || '—'}</TD>
                    <TD><StatusBadge status={t.escrow_status} accent={cfg.accent} accentLight={cfg.accentLight} /></TD>
                    <TD><strong>{t.type === 'buy' ? t.company?.name : t.counterpart?.name}</strong></TD>
                    <TD>{t.type === 'sell' ? t.company?.name : t.counterpart?.name}</TD>
                    <TD><strong>{t.escrow_amount ? `${t.escrow_amount} ${t.escrow_currency}` : '—'}</strong></TD>
                    <TD mono>{t.escrow_ref || '—'}</TD>
                    <TD>{new Date(t.created_at).toLocaleDateString()}</TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {t.escrow_status === 'requested' && <button onClick={e => { e.stopPropagation(); takeAction(t, 'held') }} style={{ padding: '3px 8px', background: cfg.accentLight, color: cfg.accent, border: `1px solid ${cfg.accentBorder}`, borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Hold</button>}
                        {t.escrow_status === 'held'      && <button onClick={e => { e.stopPropagation(); takeAction(t, 'released') }} style={{ padding: '3px 8px', background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Release</button>}
                        {!['released','refunded','none'].includes(t.escrow_status) && <button onClick={e => { e.stopPropagation(); takeAction(t, 'refunded') }} style={{ padding: '3px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Refund</button>}
                      </div>
                    </TD>
                  </Row>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Ledger */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', maxHeight: 200 }}>
          <div style={{ padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Trade Assurance Ledger</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><TH>Company</TH><TH>Type</TH><TH>Amount</TH><TH>Balance After</TH><TH>Description</TH><TH>Date</TH></tr></thead>
            <tbody>
              {ledger.map(l => (
                <Row key={l.id}>
                  <TD>{l.company?.name}</TD>
                  <TD><StatusBadge status={l.type} accent={cfg.accent} accentLight={cfg.accentLight} /></TD>
                  <TD><strong style={{ color: l.amount > 0 ? '#059669' : '#dc2626' }}>{l.amount > 0 ? '+' : ''}{l.amount}</strong></TD>
                  <TD>{l.balance_after}</TD>
                  <TD>{l.description}</TD>
                  <TD>{new Date(l.created_at).toLocaleDateString()}</TD>
                </Row>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <EventFeed events={events} cfg={cfg} onSelect={e => setSelected(e.data)} selectedId={selected?.id} />
      {selected && <DetailDrawer item={selected} page="trade-assurance" onClose={() => setSelected(null)} accent={cfg.accent} accentLight={cfg.accentLight} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DEPOSITS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function DepositsMonitor({ cfg }: { cfg: PageConfig }) {
  const [rows, setRows] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewNote, setReviewNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('deposit_applications').select('*, company:company_id(name)').order('created_at', { ascending: false })
    setRows(data || [])
    setEvents((data || []).slice(0, 30).map((d: any) => ({
      id: d.id, time: d.created_at,
      label: `Deposit ${d.status?.toUpperCase()}`,
      sub: `${d.company?.name} · ${d.amount} ${d.currency}`,
      color: d.status === 'approved' ? '#059669' : d.status === 'rejected' ? '#dc2626' : cfg.accent,
      data: d,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function review(id: string, status: 'approved' | 'rejected') {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('deposit_applications').update({ status, reviewed_by: session?.user.id, reviewed_at: new Date().toISOString(), review_notes: reviewNote || null }).eq('id', id)
    setReviewNote(''); load()
  }

  const filtered = rows.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false
    if (search && !`${r.company?.name} ${r.bank_ref} ${r.bank_name}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, bank ref..." style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', width: 240 }} />
          <FilterBar options={['all', 'pending', 'approved', 'rejected']} active={filter} onChange={setFilter} accent={cfg.accent} />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{filtered.filter(r => r.status === 'pending').length} pending</span>
        </div>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', flex: 1 }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><TH>Company</TH><TH>Amount</TH><TH>Bank</TH><TH>Ref</TH><TH>Status</TH><TH>Date</TH><TH>Actions</TH></tr></thead>
              <tbody>
                {filtered.map(d => (
                  <Row key={d.id} onClick={() => setSelected(d)} selected={selected?.id === d.id}>
                    <TD><strong>{d.company?.name}</strong></TD>
                    <TD><strong style={{ color: cfg.accent }}>{d.amount} {d.currency}</strong></TD>
                    <TD>{d.bank_name || '—'}</TD>
                    <TD mono>{d.bank_ref || '—'}</TD>
                    <TD><StatusBadge status={d.status} accent={cfg.accent} accentLight={cfg.accentLight} /></TD>
                    <TD>{new Date(d.created_at).toLocaleDateString()}</TD>
                    <TD>
                      {d.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={e => { e.stopPropagation(); review(d.id, 'approved') }} style={{ padding: '3px 8px', background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>✓ Approve</button>
                          <button onClick={e => { e.stopPropagation(); review(d.id, 'rejected') }} style={{ padding: '3px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>✕ Reject</button>
                        </div>
                      )}
                    </TD>
                  </Row>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <EventFeed events={events} cfg={cfg} onSelect={e => setSelected(e.data)} selectedId={selected?.id} />
      {selected && <DetailDrawer item={selected} page="deposits" onClose={() => setSelected(null)} accent={cfg.accent} accentLight={cfg.accentLight} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT FEED (right panel — same on all pages)
// ══════════════════════════════════════════════════════════════════════════════
function EventFeed({ events, cfg, onSelect, selectedId }: { events: FeedEvent[]; cfg: PageConfig; onSelect: (e: FeedEvent) => void; selectedId: string | null }) {
  return (
    <div style={{ width: 220, flexShrink: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const }}>
      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
        Live Events
      </div>
      <div style={{ flex: 1, overflowY: 'auto' as const }}>
        {events.length === 0 && <div style={{ padding: 20, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>No events yet</div>}
        {events.map(e => (
          <div key={e.id} onClick={() => onSelect(e)}
            style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: selectedId === e.id ? cfg.accentLight : 'white', borderLeft: `3px solid ${e.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{e.label}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{e.sub}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{timeAgo(e.time)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PAGE WRAPPER
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminPage({ page }: { page: AdminPage }) {
  const router = useRouter()
  const cfg = PAGE_CONFIG[page]

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data }) => {
        if (data?.role !== 'admin') router.push('/dashboard')
      })
    })
  }, [])

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20, padding: '6px 10px', background: cfg.accentLight, borderRadius: 8, border: `1px solid ${cfg.accentBorder}` }}>{cfg.icon}</span>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{cfg.title}</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Admin view · real company names visible</div>
        </div>
      </div>

      {page === 'transactions' && <TransactionsMonitor cfg={cfg} />}
      {page === 'messages'     && <MessagesMonitor cfg={cfg} />}
      {page === 'trade-assurance'       && <TradeAssuranceMonitor cfg={cfg} />}
      {page === 'deposits'     && <DepositsMonitor cfg={cfg} />}
    </div>
  )
}
