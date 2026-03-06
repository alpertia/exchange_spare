'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Seller = {
  id: string; product_id: string; pn: string; brand: string
  company_id: string; dealer_code: string; is_mine: boolean
  quantity: number; price: number | null; currency: string | null
  condition: string | null; country: string | null
}
type Buyer = {
  id: string; product_id: string; pn: string; brand: string
  company_id: string; dealer_code: string; is_mine: boolean
  quantity: number; price: number | null
}
type Tab = 'all' | 'sellers' | 'buyers' | 'products'

type OfferDraft = {
  type: 'buy' | 'sell'           // buy = I want to buy from seller / sell = I want to sell to buyer
  counterpart_id: string
  counterpart_code: string
  product_id: string
  pn: string; brand: string
  qty: string; price: string; currency: string
  condition: string; notes: string
  incoterm: string; pay_terms: string
  escrow: boolean
}

function dealerCode(id: string): string {
  const day = new Date().toISOString().slice(0, 10)
  let h = 2166136261
  for (const c of id + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); h >>>= 0 }
  return String((h % 9000) + 1000)
}

function n(s: string) { return s.toUpperCase().replace(/[\s\-\.\/]/g, '') }
function hit(pn: string, brand: string, code: string, q: string) {
  const nq = n(q)
  return n(pn).includes(nq) || n(brand).includes(nq) || n(code).includes(nq)
}

const INCOTERMSOPTS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DDP', 'FOB', 'CIF']
const inp = { padding: '8px 11px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 13, width: '100%', boxSizing: 'border-box' as const, outline: 'none' }
const lbl = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

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

  // Offer modal
  const [offer, setOffer] = useState<OfferDraft | null>(null)
  const [sending, setSending] = useState(false)
  const [offerSent, setOfferSent] = useState(false)

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
    const [{ data: lr, error: e1 }, { data: br, error: e2 }] = await Promise.all([
      supabase.from('listings')
        .select('id, product_id, quantity, price, currency, condition, country, company_id, products(normalized_pn, brand)')
        .eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('trade_intent')
        .select('id, product_id, quantity, target_price, company_id, products(normalized_pn, brand)')
        .eq('status', 'active').eq('intent_type', 'buy').order('created_at', { ascending: false }),
    ])
    if (e1) { setErr(e1.message); setLoading(false); return }
    if (e2) { setErr(e2.message); setLoading(false); return }
    const myId = myRef.current
    setSellers((lr || []).map((r: any) => ({
      id: r.id, product_id: r.product_id,
      pn: r.products?.normalized_pn || '', brand: r.products?.brand || '',
      company_id: r.company_id, dealer_code: dealerCode(r.company_id), is_mine: r.company_id === myId,
      quantity: r.quantity, price: r.price, currency: r.currency, condition: r.condition, country: r.country,
    })))
    setBuyers((br || []).map((r: any) => ({
      id: r.id, product_id: r.product_id,
      pn: r.products?.normalized_pn || '', brand: r.products?.brand || '',
      company_id: r.company_id, dealer_code: dealerCode(r.company_id), is_mine: r.company_id === myId,
      quantity: r.quantity, price: r.target_price,
    })))
    setLoading(false)
  }

  // ── Open offer modal pre-filled from listing ──────────────────────────────
  function openOfferFromSeller(s: Seller) {
    if (!myRef.current) { router.push('/login'); return }
    setOfferSent(false)
    setOffer({
      type: 'buy',                         // I am buying from this seller
      counterpart_id: s.company_id,
      counterpart_code: s.dealer_code,
      product_id: s.product_id,
      pn: s.pn, brand: s.brand,
      qty: String(s.quantity || 1),
      price: s.price ? String(s.price) : '',
      currency: s.currency || 'EUR',
      condition: s.condition || '',
      notes: '', incoterm: '', pay_terms: '', escrow: false,
    })
  }

  function openOfferFromBuyer(b: Buyer) {
    if (!myRef.current) { router.push('/login'); return }
    setOfferSent(false)
    setOffer({
      type: 'sell',                        // I am selling to this buyer
      counterpart_id: b.company_id,
      counterpart_code: b.dealer_code,
      product_id: b.product_id,
      pn: b.pn, brand: b.brand,
      qty: String(b.quantity || 1),
      price: b.price ? String(b.price) : '',
      currency: 'EUR',
      condition: '', notes: '', incoterm: '', pay_terms: '', escrow: false,
    })
  }

  async function sendOffer() {
    if (!offer || !myRef.current) return
    setSending(true)
    const myId = myRef.current
    const base = {
      company_id: myId,
      counterpart_id: offer.counterpart_id,
      product_id: offer.product_id || null,
      type: offer.type,
      status: 'offer_sent',
      quantity: offer.qty ? parseInt(offer.qty) : null,
      price: offer.price ? parseFloat(offer.price) : null,
      currency: offer.currency,
      notes: offer.notes || null,
      incoterm: offer.incoterm || null,
      payment_terms: offer.pay_terms || null,
      escrow_status: offer.escrow ? 'requested' : 'none',
      escrow_amount: offer.escrow && offer.price && offer.qty
        ? parseFloat(offer.price) * parseInt(offer.qty) : null,
    }
    const { data: myTx } = await supabase.from('transactions').insert(base).select().single()
    if (myTx) {
      const { data: theirTx } = await supabase.from('transactions').insert({
        ...base,
        company_id: offer.counterpart_id,
        counterpart_id: myId,
        type: offer.type === 'buy' ? 'sell' : 'buy',
        linked_transaction_id: myTx.id,
      }).select().single()
      if (theirTx) await supabase.from('transactions').update({ linked_transaction_id: theirTx.id }).eq('id', myTx.id)
    }
    setSending(false)
    setOfferSent(true)
  }

  async function contactOnly(cid: string) {
    if (!myRef.current) { router.push('/login'); return }
    if (cid === myRef.current) return
    setContacting(cid)
    const myId = myRef.current
    const { data: ex } = await supabase.from('conversations').select('id')
      .or(`and(company_a.eq.${myId},company_b.eq.${cid}),and(company_a.eq.${cid},company_b.eq.${myId})`).maybeSingle()
    if (!ex) await supabase.from('conversations').insert({ company_a: myId, company_b: cid })
    setContacting(null); router.push('/dashboard/messages')
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
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
    if (isMine) return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: '#1e40af', fontWeight: 600 }}>You · {code}</span>
    return <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Dealer {code}</span>
  }

  function SRow({ s }: { s: Seller }) {
    return (
      <div style={{ padding: '11px 0', borderBottom: '1px solid #f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{s.pn}</span>
              <CondBadge c={s.condition} />
            </div>
            <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span>{s.brand}</span><span style={{ color: '#e2e8f0' }}>·</span>
              <DealerLabel code={s.dealer_code} isMine={s.is_mine} />
              {s.country && <><span style={{ color: '#e2e8f0' }}>·</span><span>{s.country}</span></>}
              <span style={{ color: '#e2e8f0' }}>·</span><span>{s.quantity} units</span>
              {s.price != null && <><span style={{ color: '#e2e8f0' }}>·</span><strong style={{ color: '#0f172a' }}>{s.price} {s.currency || 'EUR'}</strong></>}
            </div>
          </div>
          {!s.is_mine && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => openOfferFromSeller(s)}
                style={{ padding: '5px 12px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Make Offer
              </button>
              <button onClick={() => contactOnly(s.company_id)} disabled={contacting === s.company_id}
                style={{ padding: '5px 10px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                {contacting === s.company_id ? '...' : '💬'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  function BRow({ b }: { b: Buyer }) {
    return (
      <div style={{ padding: '11px 0', borderBottom: '1px solid #f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>{b.pn}</div>
            <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span>{b.brand}</span><span style={{ color: '#e2e8f0' }}>·</span>
              <DealerLabel code={b.dealer_code} isMine={b.is_mine} />
              <span style={{ color: '#e2e8f0' }}>·</span><span>{b.quantity} units</span>
              {b.price != null && <><span style={{ color: '#e2e8f0' }}>·</span><strong style={{ color: '#0f172a' }}>Target {b.price} EUR</strong></>}
            </div>
          </div>
          {!b.is_mine && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => openOfferFromBuyer(b)}
                style={{ padding: '5px 12px', background: '#15803d', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Sell to This
              </button>
              <button onClick={() => contactOnly(b.company_id)} disabled={contacting === b.company_id}
                style={{ padding: '5px 10px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                {contacting === b.company_id ? '...' : '💬'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const tBtn = (t: Tab, label: string, count?: number) => (
    <button key={t} onClick={() => setTab(t)}
      style={{ padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === t ? '#1e40af' : 'transparent', color: tab === t ? 'white' : '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
      {label}
      {count !== undefined && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.1)' }}>{count}</span>}
    </button>
  )

  const q = query.trim()
  const fs = q ? sellers.filter(s => hit(s.pn, s.brand, s.dealer_code, q)) : sellers
  const fb = q ? buyers.filter(b => hit(b.pn, b.brand, b.dealer_code, q)) : buyers
  const pMap: Record<string, { pn: string; brand: string; sellers: Seller[]; buyers: Buyer[] }> = {}
  for (const s of fs) { if (!pMap[s.pn]) pMap[s.pn] = { pn: s.pn, brand: s.brand, sellers: [], buyers: [] }; pMap[s.pn].sellers.push(s) }
  for (const b of fb) { if (!pMap[b.pn]) pMap[b.pn] = { pn: b.pn, brand: b.brand, sellers: [], buyers: [] }; pMap[b.pn].buyers.push(b) }
  const products = Object.values(pMap).sort((a, b) => (b.sellers.length + b.buyers.length) - (a.sellers.length + a.buyers.length))

  if (err) return <div style={{ padding: 20 }}><h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Marketplace</h1><div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#dc2626', fontSize: 13 }}>{err} <button onClick={load} style={{ marginLeft: 10, padding: '3px 10px', background: 'white', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>Retry</button></div></div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Marketplace</h1>
        {!loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{sellers.length} available · {buyers.length} wanted</span>
            <span style={{ fontSize: 11, color: '#cbd5e1', borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>🔒 Anonymous · codes change daily</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search part number, brand or Dealer code..."
          style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
        {q && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', display: 'flex', gap: 8 }}>
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

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading...</div> : (
        <>
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
          {tab === 'sellers' && <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0 20px' }}>{fs.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No listings found</div> : fs.map(s => <SRow key={s.id} s={s} />)}</div>}
          {tab === 'buyers' && <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0 20px' }}>{fb.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No buy requests found</div> : fb.map(b => <BRow key={b.id} b={b} />)}</div>}
          {tab === 'products' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {products.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10 }}>No products found</div>
                : products.map(p => (
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

      <div style={{ marginTop: 20, padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#94a3b8' }}>
        🔒 Company identities hidden. Share your real name via private message only.
      </div>

      {/* ── MAKE OFFER MODAL ─────────────────────────────────────────────── */}
      {offer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

            {offerSent ? (
              // ── Success state ──
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Offer Sent!</div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
                  Your {offer.type === 'buy' ? 'buy offer' : 'sell offer'} for <strong>{offer.pn}</strong> has been sent to <strong>Dealer {offer.counterpart_code}</strong>.<br />
                  Track it in Transactions.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button onClick={() => router.push('/dashboard/transactions')}
                    style={{ padding: '9px 18px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    View Transactions →
                  </button>
                  <button onClick={() => setOffer(null)}
                    style={{ padding: '9px 18px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                    Back to Marketplace
                  </button>
                </div>
              </div>
            ) : (
              // ── Form ──
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                      {offer.type === 'buy' ? '🛒 Buy Offer' : '📦 Sell Offer'}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      To: <strong>Dealer {offer.counterpart_code}</strong>
                    </div>
                  </div>
                  <button onClick={() => setOffer(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', padding: 4 }}>✕</button>
                </div>

                {/* Product info (read-only) */}
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{offer.pn}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{offer.brand}{offer.condition ? ` · ${offer.condition}` : ''}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Qty + Price */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lbl}>Quantity *</label>
                      <input type="number" min="1" value={offer.qty}
                        onChange={e => setOffer({ ...offer, qty: e.target.value })} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Unit Price</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="number" value={offer.price}
                          onChange={e => setOffer({ ...offer, price: e.target.value })}
                          style={{ ...inp, flex: 1 }} placeholder="0.00" />
                        <select value={offer.currency} onChange={e => setOffer({ ...offer, currency: e.target.value })}
                          style={{ ...inp, width: 70 }}>
                          <option>EUR</option><option>USD</option><option>GBP</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Total */}
                  {offer.price && offer.qty && (
                    <div style={{ fontSize: 13, color: '#475569', padding: '6px 10px', background: '#f0fdf4', borderRadius: 6 }}>
                      Total: <strong style={{ color: '#15803d' }}>{(parseFloat(offer.price) * parseInt(offer.qty)).toLocaleString()} {offer.currency}</strong>
                    </div>
                  )}

                  {/* Incoterm + Pay terms */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lbl}>Incoterm</label>
                      <select value={offer.incoterm} onChange={e => setOffer({ ...offer, incoterm: e.target.value })} style={inp}>
                        <option value="">Select...</option>
                        {INCOTERMSOPTS.map(i => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Payment Terms</label>
                      <input value={offer.pay_terms} onChange={e => setOffer({ ...offer, pay_terms: e.target.value })}
                        placeholder="e.g. Net 30, 50% upfront" style={inp} />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={lbl}>Notes</label>
                    <input value={offer.notes} onChange={e => setOffer({ ...offer, notes: e.target.value })}
                      placeholder="Warranty, packaging, delivery time..." style={inp} />
                  </div>

                  {/* Escrow toggle */}
                  <div style={{ padding: '10px 14px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" id="mp-escrow" checked={offer.escrow}
                      onChange={e => setOffer({ ...offer, escrow: e.target.checked })}
                      style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                    <label htmlFor="mp-escrow" style={{ cursor: 'pointer', fontSize: 13, lineHeight: 1.4 }}>
                      <strong style={{ color: '#6d28d9' }}>🔒 Request Escrow</strong>
                      <span style={{ color: '#7c3aed', marginLeft: 6, fontSize: 12 }}>Payment held until goods confirmed received</span>
                    </label>
                  </div>

                  {/* Send button */}
                  <button onClick={sendOffer} disabled={sending || !offer.qty}
                    style={{ width: '100%', padding: '11px', background: sending || !offer.qty ? '#94a3b8' : offer.type === 'buy' ? '#1e40af' : '#15803d', color: 'white', border: 'none', borderRadius: 8, cursor: sending || !offer.qty ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                    {sending ? 'Sending...' : offer.type === 'buy' ? 'Send Buy Offer →' : 'Send Sell Offer →'}
                  </button>

                  {/* Or just message */}
                  <button onClick={() => { setOffer(null); contactOnly(offer.counterpart_id) }}
                    style={{ width: '100%', padding: '8px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                    💬 Just send a message instead
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
