'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Seller = {
  id: string; pn: string; brand: string
  company_id: string; dealer_code: string; is_mine: boolean
  quantity: number; price: number | null; currency: string | null
  condition: string | null; country: string | null
}
type Buyer = {
  id: string; pn: string; brand: string
  company_id: string; dealer_code: string; is_mine: boolean
  quantity: number; price: number | null
}
type Tab = 'all' | 'sellers' | 'buyers' | 'products'

// ── Daily anonymous code — same company_id → same 4-digit code all day ────────
function dealerCode(companyId: string): string {
  const day = new Date().toISOString().slice(0, 10)
  let h = 2166136261
  for (const c of companyId + day) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
    h >>>= 0
  }
  return String((h % 9000) + 1000)
}

// ── Search: normalize + contains ─────────────────────────────────────────────
function n(s: string) { return s.toUpperCase().replace(/[\s\-\.\/]/g, '') }
function hit(pn: string, brand: string, code: string, q: string) {
  const nq = n(q)
  return n(pn).includes(nq) || n(brand).includes(nq) || n(code).includes(nq)
}

export default function MarketplacePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [sellers, setSellers] = useState<Seller[]>([])
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [contacting, setContacting] = useState<string | null>(null)
  const myRef = useRef<string | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
      if (p?.company_id) myRef.current = p.company_id
    }
    await load()
  }

  async function load() {
    setLoading(true); setErr('')
    // Don't fetch company name — we generate code client-side from company_id
    const [{ data: lr, error: e1 }, { data: br, error: e2 }] = await Promise.all([
      supabase.from('listings')
        .select('id, quantity, price, currency, condition, country, company_id, products(normalized_pn, brand)')
        .eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('trade_intent')
        .select('id, quantity, target_price, company_id, products(normalized_pn, brand)')
        .eq('status', 'active').eq('intent_type', 'buy').order('created_at', { ascending: false }),
    ])
    if (e1) { setErr(e1.message); setLoading(false); return }
    if (e2) { setErr(e2.message); setLoading(false); return }

    const myId = myRef.current
    setSellers((lr || []).map((r: any) => ({
      id: r.id,
      pn: r.products?.normalized_pn || '',
      brand: r.products?.brand || '',
      company_id: r.company_id,
      dealer_code: dealerCode(r.company_id),
      is_mine: r.company_id === myId,
      quantity: r.quantity,
      price: r.price,
      currency: r.currency,
      condition: r.condition,
      country: r.country,
    })))
    setBuyers((br || []).map((r: any) => ({
      id: r.id,
      pn: r.products?.normalized_pn || '',
      brand: r.products?.brand || '',
      company_id: r.company_id,
      dealer_code: dealerCode(r.company_id),
      is_mine: r.company_id === myId,
      quantity: r.quantity,
      price: r.target_price,
    })))
    setLoading(false)
  }

  // Filtered — search also works on dealer code
  const q = query.trim()
  const fs = q ? sellers.filter(s => hit(s.pn, s.brand, s.dealer_code, q)) : sellers
  const fb = q ? buyers.filter(b => hit(b.pn, b.brand, b.dealer_code, q)) : buyers

  // Products tab: group by PN
  const pMap: Record<string, { pn: string; brand: string; sellers: Seller[]; buyers: Buyer[] }> = {}
  for (const s of fs) { if (!pMap[s.pn]) pMap[s.pn] = { pn: s.pn, brand: s.brand, sellers: [], buyers: [] }; pMap[s.pn].sellers.push(s) }
  for (const b of fb) { if (!pMap[b.pn]) pMap[b.pn] = { pn: b.pn, brand: b.brand, sellers: [], buyers: [] }; pMap[b.pn].buyers.push(b) }
  const products = Object.values(pMap).sort((a, b) => (b.sellers.length + b.buyers.length) - (a.sellers.length + a.buyers.length))

  async function contact(cid: string) {
    if (!myRef.current) { router.push('/login'); return }
    if (cid === myRef.current) return
    setContacting(cid)
    const myId = myRef.current
    const { data: ex } = await supabase.from('conversations').select('id')
      .or(`and(company_a.eq.${myId},company_b.eq.${cid}),and(company_a.eq.${cid},company_b.eq.${myId})`).maybeSingle()
    if (!ex) await supabase.from('conversations').insert({ company_a: myId, company_b: cid })
    setContacting(null); router.push('/dashboard/messages')
  }

  // ── Sub-components ──────────────────────────────────────────────────────────
  function CondBadge({ c }: { c: string | null }) {
    if (!c) return null
    const m: Record<string, [string, string]> = {
      new: ['#15803d', '#f0fdf4'], used: ['#92400e', '#fffbeb'],
      refurbished: ['#1d4ed8', '#eff6ff'], 'tested & packed': ['#6d28d9', '#f5f3ff'], spare: ['#0f766e', '#f0fdfa']
    }
    const [col, bg] = m[c.toLowerCase()] || ['#64748b', '#f1f5f9']
    return <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: bg, color: col, fontWeight: 500 }}>{c}</span>
  }

  function DealerLabel({ code, isMine }: { code: string; isMine: boolean }) {
    if (isMine) return (
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: '#1e40af', fontWeight: 600 }}>
        You · Dealer {code}
      </span>
    )
    return <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Dealer {code}</span>
  }

  function ContactBtn({ cid, isMine }: { cid: string; isMine: boolean }) {
    if (isMine) return null
    return (
      <button onClick={() => contact(cid)} disabled={!!contacting}
        style={{ padding: '5px 12px', background: 'transparent', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
        {contacting === cid ? '...' : 'Contact'}
      </button>
    )
  }

  function SRow({ s }: { s: Seller }) {
    return (
      <div style={{ padding: '11px 0', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{s.pn}</span>
            <CondBadge c={s.condition} />
          </div>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{s.brand}</span>
            <span style={{ color: '#e2e8f0' }}>·</span>
            <DealerLabel code={s.dealer_code} isMine={s.is_mine} />
            {s.country && <><span style={{ color: '#e2e8f0' }}>·</span><span>{s.country}</span></>}
            <span style={{ color: '#e2e8f0' }}>·</span>
            <span>{s.quantity} units</span>
            {s.price != null && <><span style={{ color: '#e2e8f0' }}>·</span><strong style={{ color: '#0f172a' }}>{s.price} {s.currency || 'EUR'}</strong></>}
          </div>
        </div>
        <ContactBtn cid={s.company_id} isMine={s.is_mine} />
      </div>
    )
  }

  function BRow({ b }: { b: Buyer }) {
    return (
      <div style={{ padding: '11px 0', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>{b.pn}</div>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{b.brand}</span>
            <span style={{ color: '#e2e8f0' }}>·</span>
            <DealerLabel code={b.dealer_code} isMine={b.is_mine} />
            <span style={{ color: '#e2e8f0' }}>·</span>
            <span>{b.quantity} units</span>
            {b.price != null && <><span style={{ color: '#e2e8f0' }}>·</span><strong style={{ color: '#0f172a' }}>Target {b.price} EUR</strong></>}
          </div>
        </div>
        <ContactBtn cid={b.company_id} isMine={b.is_mine} />
      </div>
    )
  }

  // ── Tab styles ──────────────────────────────────────────────────────────────
  const tBtn = (t: Tab, label: string, count?: number) => (
    <button key={t} onClick={() => setTab(t)}
      style={{ padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === t ? '#1e40af' : 'transparent', color: tab === t ? 'white' : '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
      {label}
      {count !== undefined && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.1)' }}>{count}</span>}
    </button>
  )

  if (err) return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Marketplace</h1>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#dc2626', fontSize: 13 }}>
        {err} <button onClick={load} style={{ marginLeft: 10, padding: '3px 10px', background: 'white', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>Retry</button>
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Marketplace</h1>
        {!loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{sellers.length} available · {buyers.length} wanted</span>
            <span style={{ fontSize: 11, color: '#cbd5e1', borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
              🔒 Identities anonymous · codes change daily
            </span>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search part number, brand or Dealer code (e.g. 8507)..."
          style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
        {q && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{fs.length} sellers · {fb.length} buyers match</span>
            <button onClick={() => setQuery('')} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>clear</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {tBtn('all', 'All')}
        {tBtn('sellers', 'Available', fs.length)}
        {tBtn('buyers', 'Wanted', fb.length)}
        {tBtn('products', 'By Product', products.length)}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading marketplace...</div>
      ) : (
        <>
          {/* ALL */}
          {tab === 'all' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 24px' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Available ({fs.length})</div>
                {fs.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>No listings {q ? 'matching search' : 'yet'}</div> : fs.map(s => <SRow key={s.id} s={s} />)}
              </div>
              <div style={{ background: '#e2e8f0' }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Wanted ({fb.length})</div>
                {fb.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>No buy requests {q ? 'matching search' : 'yet'}</div> : fb.map(b => <BRow key={b.id} b={b} />)}
              </div>
            </div>
          )}

          {/* SELLERS */}
          {tab === 'sellers' && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0 20px' }}>
              {fs.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No listings found</div> : fs.map(s => <SRow key={s.id} s={s} />)}
            </div>
          )}

          {/* BUYERS */}
          {tab === 'buyers' && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0 20px' }}>
              {fb.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No buy requests found</div> : fb.map(b => <BRow key={b.id} b={b} />)}
            </div>
          )}

          {/* PRODUCTS */}
          {tab === 'products' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {products.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10 }}>No products found</div>
              ) : products.map(p => (
                <div key={p.pn} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{p.pn}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{p.brand}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      {p.sellers.length > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f0fdf4', color: '#15803d', fontWeight: 500 }}>{p.sellers.length} selling</span>}
                      {p.buyers.length > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: '#1e40af', fontWeight: 500 }}>{p.buyers.length} buying</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: p.sellers.length > 0 && p.buyers.length > 0 ? '1fr 1px 1fr' : '1fr' }}>
                    {p.sellers.length > 0 && <div style={{ padding: '0 16px' }}>{p.sellers.map(s => <SRow key={s.id} s={s} />)}</div>}
                    {p.sellers.length > 0 && p.buyers.length > 0 && <div style={{ background: '#f1f5f9' }} />}
                    {p.buyers.length > 0 && <div style={{ padding: '0 16px' }}>{p.buyers.map(b => <BRow key={b.id} b={b} />)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Privacy notice */}
      <div style={{ marginTop: 24, padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
        🔒 <span>Company identities are hidden. Each dealer is shown a daily-rotating 4-digit code. Share your real name only via private message.</span>
      </div>
    </div>
  )
}
