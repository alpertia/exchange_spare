'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Intent = {
  id: string
  intent_type: 'buy' | 'sell'
  status: string
  quantity: number | null
  target_price: number | null
  currency: string
  notes: string | null
  created_at: string
  product: { normalized_pn: string; brand: string } | null
  company: { name: string } | null
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

export default function AdminInquiriesPage() {
  const router = useRouter()
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Intent | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data }) => {
        if (data?.role !== 'admin') router.push('/dashboard')
      })
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('trade_intent')
      .select('*, product:product_id(normalized_pn, brand), company:company_id(name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setIntents((data || []) as any)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('admin-intents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_intent' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const filtered = intents.filter(i => {
    if (filterType !== 'all' && i.intent_type !== filterType) return false
    if (search) {
      const s = search.toLowerCase()
      if (!`${i.company?.name} ${i.product?.normalized_pn} ${i.product?.brand}`.toLowerCase().includes(s)) return false
    }
    return true
  })

  // Group by product to see demand
  const byProduct: Record<string, { pn: string; brand: string; buyers: number; sellers: number; totalQty: number }> = {}
  filtered.forEach(i => {
    const pn = i.product?.normalized_pn || '?'
    if (!byProduct[pn]) byProduct[pn] = { pn, brand: i.product?.brand || '', buyers: 0, sellers: 0, totalQty: 0 }
    if (i.intent_type === 'buy') byProduct[pn].buyers++
    else byProduct[pn].sellers++
    byProduct[pn].totalQty += i.quantity || 0
  })
  const hotProducts = Object.values(byProduct).filter(p => p.buyers > 0).sort((a, b) => b.buyers - a.buyers).slice(0, 5)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>🔍 Monitor Inquiries</h1>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>All active buy/sell inquiries across all companies</div>
      </div>

      {/* Hot products */}
      {hotProducts.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🔥 High Demand</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {hotProducts.map(p => (
              <div key={p.pn} style={{ background: 'white', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{p.pn}</span>
                <span style={{ color: '#64748b', marginLeft: 8 }}>{p.brand}</span>
                <span style={{ marginLeft: 8, color: '#2563eb', fontWeight: 700 }}>{p.buyers} buyers</span>
                {p.sellers > 0 && <span style={{ marginLeft: 6, color: '#059669', fontWeight: 700 }}>{p.sellers} sellers</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 240px)' }}>
        {/* Main table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search company, PN, brand..."
              style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', width: 240 }} />
            {(['all', 'buy', 'sell'] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                style={{ padding: '4px 14px', border: `1px solid ${filterType === t ? '#2563eb' : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: filterType === t ? 700 : 400, background: filterType === t ? '#eff6ff' : 'white', color: filterType === t ? '#2563eb' : '#64748b' }}>
                {t === 'all' ? 'All' : t === 'buy' ? '🔍 Buy' : '📦 Sell'}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{filtered.length} inquiries</span>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', flex: 1 }}>
            {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Type', 'Company', 'Part Number', 'Brand', 'Qty', 'Target Price', 'Notes', 'Date'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', fontSize: 11, color: '#64748b', fontWeight: 700, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(i => (
                    <tr key={i.id} onClick={() => setSelected(i)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selected?.id === i.id ? '#f8fafc' : 'white' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: i.intent_type === 'buy' ? '#eff6ff' : '#ecfdf5', color: i.intent_type === 'buy' ? '#2563eb' : '#059669' }}>
                          {i.intent_type === 'buy' ? '🔍 BUY' : '📦 SELL'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{i.company?.name || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{i.product?.normalized_pn || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#64748b' }}>{i.product?.brand || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#0f172a' }}>{i.quantity ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#0f172a' }}>
                        {i.target_price ? `${CURRENCY_SYMBOL[i.currency] || ''}${i.target_price} ${i.currency}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.notes || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(i.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right panel — detail */}
        <div style={{ width: 220, flexShrink: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {selected ? 'Detail' : 'Product Demand'}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {!selected ? (
              Object.values(byProduct).sort((a, b) => b.buyers - a.buyers).map(p => (
                <div key={p.pn} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #f1f5f9', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{p.pn}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{p.brand}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {p.buyers > 0 && <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>🔍 {p.buyers}</span>}
                    {p.sellers > 0 && <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>📦 {p.sellers}</span>}
                    {p.totalQty > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>qty:{p.totalQty}</span>}
                  </div>
                </div>
              ))
            ) : (
              <div>
                <button onClick={() => setSelected(null)} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 10, padding: 0 }}>← Back</button>
                {Object.entries(selected).filter(([k]) => !['id'].includes(k)).map(([k, v]) => (
                  <div key={k} style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 5, marginBottom: 5 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>{k.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 12, color: '#0f172a', marginTop: 1, wordBreak: 'break-all' }}>
                      {v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
