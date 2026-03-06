'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Trend = {
  product_id: string; pn: string; brand: string
  seller_count: number; buyer_count: number; total_qty: number
  min_price: number; max_price: number; avg_price: number
  spread: number; direction: 'up' | 'down' | 'stable' | null
  demand: 'high' | 'medium' | 'low'
}
type MyStats = { listings: number; intents: number; deals: number; value: number }

export default function AnalyticsPage() {
  const [trends, setTrends] = useState<Trend[]>([])
  const [stats, setStats] = useState<MyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'all' | 'hot' | 'rising' | 'falling'>('all')
  const [sort, setSort] = useState<'spread' | 'demand' | 'qty' | 'price'>('spread')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      let companyId: string | null = null
      if (session?.user) {
        const { data: p } = await supabase
          .from('profiles').select('company_id').eq('id', session.user.id).single()
        companyId = p?.company_id ?? null
      }

      const [
        { data: listings, error: e1 },
        { data: intents, error: e2 },
        { data: txs, error: e3 },
      ] = await Promise.all([
        supabase.from('listings')
          .select('product_id, price, quantity, company_id, products(normalized_pn, brand)')
          .eq('status', 'active'),
        supabase.from('trade_intent')
          .select('product_id, company_id')
          .eq('status', 'active').eq('intent_type', 'buy'),
        supabase.from('transactions')
          .select('product_id, price, company_id, quantity, status')
          .in('status', ['delivered', 'completed'])
          .not('price', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500),
      ])

      if (e1) throw new Error('listings: ' + e1.message)
      if (e2) throw new Error('trade_intent: ' + e2.message)
      if (e3) throw new Error('transactions: ' + e3.message)

      // My stats
      if (companyId) {
        const myL = (listings || []).filter((l: any) => l.company_id === companyId)
        const myI = (intents || []).filter((i: any) => i.company_id === companyId)
        const myT = (txs || []).filter((t: any) => t.company_id === companyId)
        const value = myT.reduce((s: number, t: any) => s + (t.quantity || 0) * (Number(t.price) || 0), 0)
        setStats({ listings: myL.length, intents: myI.length, deals: myT.length, value })
      }

      // Product map
      const map: Record<string, { pn: string; brand: string; prices: number[]; qtys: number[]; sellers: Set<string>; buyers: Set<string> }> = {}
      for (const l of (listings || []) as any[]) {
        if (!l.price || !l.product_id) continue
        if (!map[l.product_id]) map[l.product_id] = { pn: l.products?.normalized_pn || '', brand: l.products?.brand || '', prices: [], qtys: [], sellers: new Set(), buyers: new Set() }
        map[l.product_id].prices.push(Number(l.price))
        map[l.product_id].qtys.push(Number(l.quantity))
        map[l.product_id].sellers.add(l.company_id)
      }
      for (const i of (intents || []) as any[]) {
        if (map[i.product_id]) map[i.product_id].buyers.add(i.company_id)
      }

      // Last tx price
      const lastTx: Record<string, number> = {}
      for (const t of (txs || []) as any[]) {
        if (!lastTx[t.product_id]) lastTx[t.product_id] = Number(t.price)
      }

      const result: Trend[] = Object.entries(map)
        .filter(([, v]) => v.prices.length > 0)
        .map(([pid, v]) => {
          const mn = Math.min(...v.prices), mx = Math.max(...v.prices)
          const avg = v.prices.reduce((a, b) => a + b, 0) / v.prices.length
          const spread = mx > 0 ? Math.round(((mx - mn) / avg) * 100) : 0
          const bc = v.buyers.size, sc = v.sellers.size
          const demand: Trend['demand'] = bc / (sc || 1) >= 0.7 ? 'high' : bc / (sc || 1) >= 0.3 ? 'medium' : 'low'
          let direction: Trend['direction'] = null
          if (lastTx[pid]) {
            const pct = ((avg - lastTx[pid]) / lastTx[pid]) * 100
            direction = Math.abs(pct) < 2 ? 'stable' : pct > 0 ? 'up' : 'down'
          }
          return { product_id: pid, pn: v.pn, brand: v.brand, seller_count: sc, buyer_count: bc, total_qty: v.qtys.reduce((a, b) => a + b, 0), min_price: +mn.toFixed(2), max_price: +mx.toFixed(2), avg_price: +avg.toFixed(2), spread, demand, direction }
        })

      setTrends(result)
    } catch (e: any) {
      setErr(e?.message || 'Unknown error')
    }
    setLoading(false)
  }

  const shown = trends
    .filter(t =>
      filter === 'hot' ? t.demand === 'high' :
      filter === 'rising' ? t.direction === 'up' :
      filter === 'falling' ? t.direction === 'down' : true
    )
    .sort((a, b) =>
      sort === 'spread' ? b.spread - a.spread :
      sort === 'demand' ? (b.buyer_count / (b.seller_count || 1)) - (a.buyer_count / (a.seller_count || 1)) :
      sort === 'qty' ? b.total_qty - a.total_qty :
      b.avg_price - a.avg_price
    )

  const demandColor = (d: Trend['demand']) =>
    d === 'high' ? ['#dc2626', '#fef2f2'] : d === 'medium' ? ['#b45309', '#fffbeb'] : ['#94a3b8', '#f8fafc']

  const dirLabel = (d: Trend['direction']) =>
    d === 'up' ? <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 12 }}>↑ Rising</span> :
    d === 'down' ? <span style={{ color: '#15803d', fontWeight: 600, fontSize: 12 }}>↓ Falling</span> :
    d === 'stable' ? <span style={{ color: '#94a3b8', fontSize: 12 }}>→ Stable</span> :
    <span style={{ color: '#e2e8f0', fontSize: 12 }}>—</span>

  if (loading) return <div style={{ padding: 40, color: '#94a3b8', fontSize: 14 }}>Loading analytics...</div>

  if (err) return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Analytics</h1>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#dc2626', fontSize: 13 }}>
        Error: {err}
        <button onClick={loadData} style={{ marginLeft: 10, padding: '3px 10px', background: 'white', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Retry</button>
      </div>
    </div>
  )

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>Analytics</h1>

      {stats && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>My Activity</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
            {[
              { label: 'Active Listings', value: stats.listings, icon: '📦' },
              { label: 'Buy Intents', value: stats.intents, icon: '🛒' },
              { label: 'Completed Deals', value: stats.deals, icon: '✅' },
              { label: 'Total Sold', value: `€${stats.value.toLocaleString()}`, icon: '💰' },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Market Intelligence · {trends.length} products tracked
        </div>

        {trends.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>No market data yet</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Add priced listings to start seeing price trends and demand signals.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {[{ k: 'all', l: 'All' }, { k: 'hot', l: '🔥 Hot' }, { k: 'rising', l: '↑ Rising' }, { k: 'falling', l: '↓ Falling' }].map(f => (
                <button key={f.k} onClick={() => setFilter(f.k as any)}
                  style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 500, borderColor: filter === f.k ? '#1e40af' : '#e2e8f0', background: filter === f.k ? '#eff6ff' : 'white', color: filter === f.k ? '#1e40af' : '#64748b' }}>
                  {f.l}
                </button>
              ))}
              <select value={sort} onChange={e => setSort(e.target.value as any)}
                style={{ marginLeft: 'auto', padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#64748b', background: 'white' }}>
                <option value="spread">Sort: Spread</option>
                <option value="demand">Sort: Demand</option>
                <option value="qty">Sort: Qty</option>
                <option value="price">Sort: Price</option>
              </select>
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Part No', 'Brand', 'Sell', 'Buy', 'Min €', 'Avg €', 'Max €', 'Spread', 'Trend', 'Demand'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map(t => {
                    const [dc, db] = demandColor(t.demand)
                    return (
                      <tr key={t.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'white'}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{t.pn}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 13 }}>{t.brand}</td>
                        <td style={{ padding: '10px 12px', color: '#0f172a', fontSize: 13, textAlign: 'center' }}>{t.seller_count}</td>
                        <td style={{ padding: '10px 12px', color: '#0f172a', fontSize: 13, textAlign: 'center' }}>{t.buyer_count}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 13 }}>{t.min_price}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{t.avg_price}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 13 }}>{t.max_price}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: t.spread > 30 ? '#dc2626' : t.spread > 15 ? '#b45309' : '#15803d' }}>{t.spread}%</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>{dirLabel(t.direction)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: db, color: dc, fontWeight: 600, textTransform: 'capitalize' }}>{t.demand}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
