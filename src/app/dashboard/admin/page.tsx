'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── ADMIN TRANSACTIONS MONITOR ────────────────────────────────────────────────
export function AdminTransactionsPage() {
  const [txs, setTxs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, company:company_id(name), counterpart:counterpart_id(name), product:product_id(normalized_pn, brand)')
      .order('created_at', { ascending: false })
      .limit(200)
    setTxs(data || [])
    setLoading(false)
  }

  const shown = filter === 'all' ? txs : txs.filter(t => t.status === filter)
  const escrow = txs.filter(t => t.escrow_status && t.escrow_status !== 'none').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Monitor: All Transactions</h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>{txs.length} total · {escrow} Trade Assurance requests</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all','offer_sent','confirmed','dispatched','delivered','completed','cancelled','disputed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid', cursor: 'pointer', fontSize: 11, fontWeight: filter === f ? 700 : 400, borderColor: filter === f ? '#0f172a' : '#e2e8f0', background: filter === f ? '#0f172a' : 'white', color: filter === f ? 'white' : '#64748b' }}>
            {f} {f !== 'all' ? `(${txs.filter(t => t.status === f).length})` : `(${txs.length})`}
          </button>
        ))}
      </div>
      {loading ? <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>Loading...</div> : (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['TX #','Type','Status','Trade Assurance','Company','Counterpart','PN','Qty','Price','Date'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {shown.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{t.tx_number || '—'}</td>
                  <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: t.type === 'buy' ? '#eff6ff' : '#f0fdf4', color: t.type === 'buy' ? '#1e40af' : '#15803d', fontWeight: 700 }}>{t.type.toUpperCase()}</span></td>
                  <td style={{ padding: '8px 12px', color: t.status === 'completed' ? '#15803d' : t.status === 'cancelled' ? '#dc2626' : '#475569', fontWeight: 500 }}>{t.status}</td>
                  <td style={{ padding: '8px 12px' }}>{t.escrow_status && t.escrow_status !== 'none' ? <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: '#f5f3ff', color: '#6d28d9', fontWeight: 600 }}>🔒 {t.escrow_status}</span> : <span style={{ color: '#e2e8f0' }}>—</span>}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{t.company?.name || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#475569' }}>{t.counterpart?.name || '—'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{t.product?.normalized_pn || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#475569' }}>{t.quantity || '—'}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{t.price ? `${t.price} ${t.currency}` : '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No transactions found</div>}
        </div>
      )}
    </div>
  )
}

// ── ADMIN MESSAGES MONITOR ────────────────────────────────────────────────────
export function AdminMessagesPage() {
  const [convs, setConvs] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')

  useEffect(() => { loadConvs() }, [])

  async function loadConvs() {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('*, ca:company_a(id, name), cb:company_b(id, name)')
      .order('created_at', { ascending: false })
    setConvs(data || [])
    setLoading(false)
  }

  async function loadMsgs(convId: string) {
    setSelected(convId)
    const { data } = await supabase.from('messages').select('*, sender:sender_id(name)').eq('conversation_id', convId).order('created_at')
    setMsgs(data || [])
  }

  const selectedConv = convs.find(c => c.id === selected)

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Monitor: All Messages</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, minHeight: 500 }}>
        {/* Conversation list */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {convs.length} Conversations
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 600 }}>
            {loading ? <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Loading...</div>
              : convs.map(c => (
                <div key={c.id} onClick={() => loadMsgs(c.id)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: selected === c.id ? '#eff6ff' : 'white' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{c.ca?.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>↔ {c.cb?.name}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{new Date(c.created_at).toLocaleDateString()}</div>
                </div>
              ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Select a conversation</div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 600 }}>
                {selectedConv?.ca?.name} ↔ {selectedConv?.cb?.name}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480 }}>
                {msgs.map(m => (
                  <div key={m.id}>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{m.sender?.name || '?'} · {new Date(m.created_at).toLocaleTimeString()}</div>
                    <div style={{ fontSize: 13, color: '#0f172a', background: '#f8fafc', padding: '8px 12px', borderRadius: 8, maxWidth: '80%' }}>{m.content}</div>
                    {m.image_url && <img src={m.image_url} alt="attachment" style={{ marginTop: 6, maxWidth: 200, borderRadius: 6, border: '1px solid #e2e8f0' }} />}
                    {m.tx_number && <div style={{ fontSize: 10, color: '#6d28d9', marginTop: 2, fontFamily: 'monospace' }}>ref: {m.tx_number}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ADMIN TRADE ASSURANCE MONITOR ──────────────────────────────────────────────────────
export function AdminTradeAssurancePage() {
  const [escrows, setEscrows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionTx, setActionTx] = useState<any | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const router = useRouter()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, company:company_id(id, name), counterpart:counterpart_id(id, name), product:product_id(normalized_pn, brand)')
      .neq('escrow_status', 'none')
      .not('escrow_status', 'is', null)
      .order('created_at', { ascending: false })
    // Deduplicate — only show one side (seller side = type='sell')
    const seen = new Set<string>()
    const deduped = (data || []).filter((t: any) => {
      const key = t.linked_transaction_id || t.id
      if (seen.has(key)) return false; seen.add(key); return true
    })
    setEscrows(deduped)
    setLoading(false)
  }

  async function contactParty(companyId: string) {
    // Admin sends message to this company
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!p?.company_id) return
    const { data: ex } = await supabase.from('conversations').select('id').or(`and(company_a.eq.${p.company_id},company_b.eq.${companyId}),and(company_a.eq.${companyId},company_b.eq.${p.company_id})`).maybeSingle()
    if (!ex) await supabase.from('conversations').insert({ company_a: p.company_id, company_b: companyId })
    router.push('/dashboard/messages')
  }

  const ESCROW_COLORS: Record<string, [string, string]> = {
    requested: ['#92400e', '#fffbeb'],
    held:      ['#6d28d9', '#f5f3ff'],
    released:  ['#15803d', '#f0fdf4'],
    refunded:  ['#dc2626', '#fef2f2'],
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Monitor: Trade Assurance</h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>{escrows.length} Trade Assurance transactions</div>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        : escrows.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '48px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No Trade Assurance requests yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {escrows.map(t => {
              const [col, bg] = ESCROW_COLORS[t.escrow_status] || ['#64748b', '#f8fafc']
              return (
                <div key={t.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `3px solid ${col}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {t.tx_number && <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', padding: '2px 7px', background: '#f8fafc', borderRadius: 4 }}>{t.tx_number}</span>}
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: bg, color: col, fontWeight: 700 }}>🔒 {t.escrow_status.toUpperCase()}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{t.status}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                        {t.product?.normalized_pn || '—'} · {t.product?.brand || ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Buyer: <strong style={{ color: '#0f172a' }}>{t.type === 'buy' ? t.company?.name : t.counterpart?.name}</strong></span>
                        <span>Seller: <strong style={{ color: '#0f172a' }}>{t.type === 'sell' ? t.company?.name : t.counterpart?.name}</strong></span>
                        {t.escrow_amount && <span>Amount: <strong style={{ color: '#6d28d9' }}>{t.escrow_amount} {t.escrow_currency}</strong></span>}
                        {t.quantity && <span>{t.quantity} units</span>}
                        {t.price && <span>{t.price} {t.currency}/unit</span>}
                      </div>
                      {t.escrow_ref && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4, fontFamily: 'monospace' }}>Ref: {t.escrow_ref}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => contactParty(t.type === 'buy' ? t.company?.id : t.counterpart?.id)}
                        style={{ padding: '5px 12px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        💬 Contact Buyer
                      </button>
                      <button onClick={() => contactParty(t.type === 'sell' ? t.company?.id : t.counterpart?.id)}
                        style={{ padding: '5px 12px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        💬 Contact Seller
                      </button>
                      {t.escrow_status === 'requested' && (
                        <button onClick={() => setActionTx(t)}
                          style={{ padding: '5px 12px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          🔒 Take Action
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>Created {new Date(t.created_at).toLocaleString()}</div>
                </div>
              )
            })}
          </div>
        )}

      {/* Action modal */}
      {actionTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Trade Assurance Action</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>TX: {actionTx.tx_number} · {actionTx.escrow_amount} {actionTx.escrow_currency}</div>
            <input value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="Admin note / reference..." style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', marginBottom: 14, boxSizing: 'border-box' as const }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={async () => { await supabase.rpc('set_escrow', { tx_id: actionTx.id, new_escrow_status: 'held', ref: adminNote || null, held_at: new Date().toISOString(), released_at: null }); setActionTx(null); load() }}
                style={{ flex: 1, padding: '9px', background: '#6d28d9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Mark Held</button>
              <button onClick={async () => { await supabase.rpc('set_escrow', { tx_id: actionTx.id, new_escrow_status: 'released', ref: adminNote || null, held_at: null, released_at: new Date().toISOString() }); setActionTx(null); load() }}
                style={{ flex: 1, padding: '9px', background: '#15803d', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Release</button>
              <button onClick={async () => { await supabase.rpc('set_escrow', { tx_id: actionTx.id, new_escrow_status: 'refunded', ref: adminNote || null, held_at: null, released_at: null }); setActionTx(null); load() }}
                style={{ flex: 1, padding: '9px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Refund</button>
              <button onClick={() => setActionTx(null)} style={{ padding: '9px 14px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  return <AdminTransactionsPage />
}
