'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Listing = {
  id: string; product_id: string; pn: string; brand: string
  company_id: string; dealer_code: string; is_mine: boolean
  quantity: number; price: number | null; currency: string
  condition: string | null; country: string | null; notes: string | null
}
type BuyIntent = {
  id: string; product_id: string; pn: string; brand: string
  company_id: string; dealer_code: string; is_mine: boolean
  quantity: number; target_price: number | null
}

function dealerCode(id: string) {
  const day = new Date().toISOString().slice(0, 10)
  let h = 2166136261
  for (const c of id + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); h >>>= 0 }
  return String((h % 9000) + 1000)
}
function norm(s: string) { return s.toUpperCase().replace(/[\s\-\.\/]/g, '') }

const COND_COLORS: Record<string, [string, string]> = {
  new: ['#15803d', '#f0fdf4'], used: ['#92400e', '#fffbeb'],
  refurbished: ['#1d4ed8', '#eff6ff'], 'tested & packed': ['#6d28d9', '#f5f3ff'], spare: ['#0f766e', '#f0fdfa']
}
const inp = (extra?: any) => ({ padding: '8px 11px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, ...extra })
const lbl = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

export default function MarketplacePage() {
  const router = useRouter()
  const myId = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [intents, setIntents]   = useState<BuyIntent[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'all' | 'selling' | 'buying'>('all')

  // Cart modal
  const [cartItem, setCartItem] = useState<Listing | null>(null)
  const [cartQty, setCartQty]   = useState('1')
  const [cartPrice, setCartPrice] = useState('')
  const [cartNotes, setCartNotes] = useState('')
  const [cartCur, setCartCur]   = useState('EUR')
  const [adding, setAdding]     = useState(false)
  const [added, setAdded]       = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
      if (p?.company_id) myId.current = p.company_id
    }
    await load()
  }

  async function load() {
    setLoading(true)
    const [{ data: ls }, { data: bi }] = await Promise.all([
      supabase.from('listings').select('id, product_id, quantity, price, currency, condition, country, notes, company_id, products(normalized_pn, brand)').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('trade_intent').select('id, product_id, quantity, target_price, company_id, products(normalized_pn, brand)').eq('status', 'active').eq('intent_type', 'buy').order('created_at', { ascending: false }),
    ])
    const mid = myId.current
    setListings((ls || []).map((r: any) => ({ id: r.id, product_id: r.product_id, pn: r.products?.normalized_pn || '', brand: r.products?.brand || '', company_id: r.company_id, dealer_code: dealerCode(r.company_id), is_mine: r.company_id === mid, quantity: r.quantity, price: r.price, currency: r.currency || 'EUR', condition: r.condition, country: r.country, notes: r.notes })))
    setIntents((bi || []).map((r: any) => ({ id: r.id, product_id: r.product_id, pn: r.products?.normalized_pn || '', brand: r.products?.brand || '', company_id: r.company_id, dealer_code: dealerCode(r.company_id), is_mine: r.company_id === mid, quantity: r.quantity, target_price: r.target_price })))
    setLoading(false)
  }

  async function addToCart() {
    if (!cartItem || !myId.current || !cartPrice) return
    setAdding(true)
    await supabase.from('cart_items').insert({
      company_id: myId.current,
      listing_id: cartItem.id,
      product_id: cartItem.product_id,
      seller_id: cartItem.company_id,
      pn: cartItem.pn, brand: cartItem.brand,
      quantity: parseInt(cartQty) || 1,
      listing_price: cartItem.price,
      offer_price: parseFloat(cartPrice),
      currency: cartCur,
      notes: cartNotes || null,
    })
    setAdding(false); setAdded(true)
    setTimeout(() => { setCartItem(null); setAdded(false); setCartPrice(''); setCartNotes('') }, 1500)
  }

  async function askSeller(sellerId: string) {
    if (!myId.current) { router.push('/login'); return }
    const myCompany = myId.current
    const { data: ex } = await supabase.from('conversations').select('id').or(`and(company_a.eq.${myCompany},company_b.eq.${sellerId}),and(company_a.eq.${sellerId},company_b.eq.${myCompany})`).maybeSingle()
    if (!ex) await supabase.from('conversations').insert({ company_a: myCompany, company_b: sellerId })
    router.push('/dashboard/messages')
  }

  async function offerProduct(intent: BuyIntent) {
    // Creates a sell transaction offer to this buyer
    if (!myId.current) { router.push('/login'); return }
    const myCompany = myId.current
    const base = { company_id: myCompany, counterpart_id: intent.company_id, product_id: intent.product_id, type: 'sell', status: 'offer_sent', quantity: intent.quantity, price: intent.target_price, currency: 'EUR', escrow_status: 'none' }
    const { data: myTx } = await supabase.from('transactions').insert(base).select().single()
    if (myTx) {
      const { data: theirTx } = await supabase.from('transactions').insert({ ...base, company_id: intent.company_id, counterpart_id: myCompany, type: 'buy', linked_transaction_id: myTx.id }).select().single()
      if (theirTx) await supabase.from('transactions').update({ linked_transaction_id: theirTx.id }).eq('id', myTx.id)
    }
    router.push('/dashboard/transactions')
  }

  const q = query.trim()
  const fls = q ? listings.filter(l => norm(l.pn).includes(norm(q)) || norm(l.brand).includes(norm(q)) || l.dealer_code.includes(q)) : listings
  const fbi = q ? intents.filter(i => norm(i.pn).includes(norm(q)) || norm(i.brand).includes(norm(q)) || i.dealer_code.includes(q)) : intents

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.03em' }}>Marketplace</h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>🔒 All identities anonymous · dealer codes rotate daily</div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="🔍  Search part number, brand, or Dealer code..."
          style={{ ...inp(), fontSize: 14, padding: '11px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} />
        {q && <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>{fls.length} available · {fbi.length} wanted for "{q}"  <button onClick={() => setQuery('')} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 11 }}>clear</button></div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {[['all','All'], ['selling','Available to Buy'], ['buying','Buy Requests']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            style={{ padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === k ? '#0f172a' : 'transparent', color: tab === k ? 'white' : '#64748b' }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading market...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* AVAILABLE LISTINGS */}
          {(tab === 'all' || tab === 'selling') && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Available to Buy</span>
                <span style={{ fontSize: 11, padding: '1px 7px', background: '#f0fdf4', color: '#15803d', borderRadius: 10, fontWeight: 600 }}>{fls.length}</span>
              </div>
              {fls.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No listings {q ? 'matching your search' : 'yet'}</div>
              ) : fls.map(l => (
                <div key={l.id} style={{ padding: '13px 16px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{l.pn}</span>
                      {l.condition && (() => { const [col, bg] = COND_COLORS[l.condition!.toLowerCase()] || ['#64748b','#f1f5f9']; return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: bg, color: col, fontWeight: 600 }}>{l.condition}</span> })()}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '0 10px' }}>
                      <span>{l.brand}</span>
                      <span style={{ color: '#94a3b8' }}>Dealer {l.dealer_code}{l.is_mine ? ' (you)' : ''}</span>
                      <span><strong style={{ color: '#0f172a' }}>{l.quantity}</strong> units</span>
                      {l.price != null && <span><strong style={{ color: '#1e40af' }}>{l.price} {l.currency}</strong>/unit</span>}
                      {l.country && <span>📍{l.country}</span>}
                    </div>
                    {l.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{l.notes}</div>}
                  </div>
                  {/* Actions */}
                  {!l.is_mine && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setCartItem(l); setCartQty('1'); setCartPrice(l.price ? String(l.price) : ''); setCartCur(l.currency); setCartNotes(''); setAdded(false) }}
                        style={{ padding: '6px 12px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        🛒 Add to Cart
                      </button>
                      <button onClick={() => askSeller(l.company_id)}
                        style={{ padding: '6px 10px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        💬 Ask
                      </button>
                    </div>
                  )}
                  {l.is_mine && <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>Your listing</span>}
                </div>
              ))}
            </div>
          )}

          {/* BUY INTENTS */}
          {(tab === 'all' || tab === 'buying') && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Buy Requests</span>
                <span style={{ fontSize: 11, padding: '1px 7px', background: '#fef3c7', color: '#92400e', borderRadius: 10, fontWeight: 600 }}>{fbi.length}</span>
                <span style={{ fontSize: 11, color: '#b45309', marginLeft: 'auto' }}>Someone wants to buy — can you supply?</span>
              </div>
              {fbi.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No buy requests {q ? 'matching search' : 'yet'}</div>
              ) : fbi.map(i => (
                <div key={i.id} style={{ padding: '13px 16px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: 12, background: '#fffef5' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 3 }}>{i.pn}</div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '0 10px' }}>
                      <span>{i.brand}</span>
                      <span style={{ color: '#94a3b8' }}>Dealer {i.dealer_code}{i.is_mine ? ' (you)' : ''}</span>
                      <span>Wants <strong style={{ color: '#0f172a' }}>{i.quantity}</strong> units</span>
                      {i.target_price != null && <span>Budget <strong style={{ color: '#b45309' }}>{i.target_price} EUR</strong></span>}
                    </div>
                  </div>
                  {!i.is_mine && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => offerProduct(i)}
                        style={{ padding: '6px 12px', background: '#b45309', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        📦 Offer Product
                      </button>
                      <button onClick={() => askSeller(i.company_id)}
                        style={{ padding: '6px 10px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        💬 Ask Buyer
                      </button>
                    </div>
                  )}
                  {i.is_mine && <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>Your request</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ADD TO CART MODAL */}
      {cartItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {added ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 42, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Added to Buying List!</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>Find it in My Buying List to finalize your offer.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>🛒 Add to Buying List</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Dealer {cartItem.dealer_code}</div>
                  </div>
                  <button onClick={() => setCartItem(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </div>

                {/* Product */}
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{cartItem.pn}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{cartItem.brand}{cartItem.condition ? ` · ${cartItem.condition}` : ''} · {cartItem.quantity} units available</div>
                  {cartItem.price && <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>Listed price: <strong style={{ color: '#0f172a' }}>{cartItem.price} {cartItem.currency}</strong>/unit</div>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lbl}>Quantity *</label>
                      <input type="number" min="1" max={cartItem.quantity} value={cartQty} onChange={e => setCartQty(e.target.value)} style={inp()} />
                    </div>
                    <div>
                      <label style={lbl}>My Offer Price * <span style={{ color: '#ef4444' }}>per unit</span></label>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input type="number" value={cartPrice} onChange={e => setCartPrice(e.target.value)} style={inp({ flex: 1 })} placeholder="0.00" />
                        <select value={cartCur} onChange={e => setCartCur(e.target.value)} style={inp({ width: 68 })}>
                          <option>EUR</option><option>USD</option><option>GBP</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {cartPrice && cartQty && (
                    <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 13 }}>
                      Total offer: <strong style={{ color: '#15803d' }}>{(parseFloat(cartPrice) * parseInt(cartQty)).toLocaleString()} {cartCur}</strong>
                      {cartItem.price && cartPrice && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: parseFloat(cartPrice) < cartItem.price ? '#dc2626' : '#15803d' }}>
                          ({parseFloat(cartPrice) < cartItem.price ? `${Math.round((1 - parseFloat(cartPrice)/cartItem.price)*100)}% below ask` : `at ask`})
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <label style={lbl}>Notes (optional)</label>
                    <input value={cartNotes} onChange={e => setCartNotes(e.target.value)} style={inp()} placeholder="Incoterm, delivery, warranty..." />
                  </div>

                  <button onClick={addToCart} disabled={adding || !cartPrice || !cartQty}
                    style={{ padding: '11px', background: adding || !cartPrice ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: !cartPrice ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                    {adding ? 'Adding...' : 'Add to My Buying List →'}
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
