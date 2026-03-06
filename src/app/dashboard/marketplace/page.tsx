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
  quantity: number; target_price: number | null; currency: string
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

type ModalMode = 'cart' | 'buy_now' | 'sell_now' | null
type ActiveItem = { listing?: Listing; intent?: BuyIntent }

export default function MarketplacePage() {
  const router = useRouter()
  const myId = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [intents, setIntents] = useState<BuyIntent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'selling' | 'buying'>('all')

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [activeItem, setActiveItem] = useState<ActiveItem>({})
  const [qty, setQty] = useState('1')
  const [offerPrice, setOfferPrice] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [notes, setNotes] = useState('')
  const [incoterm, setIncoterm] = useState('EXW')
  const [paymentTerms, setPaymentTerms] = useState('TT in advance')
  const [escrowWanted, setEscrowWanted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

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
      supabase.from('trade_intent').select('id, product_id, quantity, target_price, currency, company_id, products(normalized_pn, brand)').eq('status', 'active').eq('intent_type', 'buy').order('created_at', { ascending: false }),
    ])
    const mid = myId.current
    setListings((ls || []).map((r: any) => ({ id: r.id, product_id: r.product_id, pn: r.products?.normalized_pn || '', brand: r.products?.brand || '', company_id: r.company_id, dealer_code: dealerCode(r.company_id), is_mine: r.company_id === mid, quantity: r.quantity, price: r.price, currency: r.currency || 'EUR', condition: r.condition, country: r.country, notes: r.notes })))
    setIntents((bi || []).map((r: any) => ({ id: r.id, product_id: r.product_id, pn: r.products?.normalized_pn || '', brand: r.products?.brand || '', company_id: r.company_id, dealer_code: dealerCode(r.company_id), is_mine: r.company_id === mid, quantity: r.quantity, target_price: r.target_price, currency: r.currency || 'EUR' })))
    setLoading(false)
  }

  function openModal(mode: ModalMode, item: ActiveItem) {
    if (!myId.current) { router.push('/login'); return }
    setModalMode(mode)
    setActiveItem(item)
    const listing = item.listing
    const intent = item.intent
    setQty(String(intent?.quantity || listing?.quantity || 1))
    setOfferPrice(String(intent?.target_price || listing?.price || ''))
    setCurrency(intent?.currency || listing?.currency || 'EUR')
    setNotes('')
    setIncoterm('EXW')
    setPaymentTerms('TT in advance')
    setEscrowWanted(false)
    setDone(false)
  }

  function closeModal() { setModalMode(null); setActiveItem({}); setDone(false) }

  // Add to cart (buying list)
  async function addToCart() {
    const l = activeItem.listing!
    if (!myId.current || !offerPrice) return
    setSubmitting(true)
    await supabase.from('cart_items').insert({
      company_id: myId.current, listing_id: l.id, product_id: l.product_id,
      seller_id: l.company_id, pn: l.pn, brand: l.brand,
      quantity: parseInt(qty) || 1, listing_price: l.price,
      offer_price: parseFloat(offerPrice), currency, notes: notes || null,
    })
    setSubmitting(false); setDone(true)
    setTimeout(closeModal, 1800)
  }

  // Direct Buy Request → transaction açılır (silinebilir, cancel edilebilir)
  async function buyNow() {
    const l = activeItem.listing!
    if (!myId.current || !offerPrice) return
    setSubmitting(true)
    const myCompany = myId.current
    const base = {
      product_id: l.product_id, quantity: parseInt(qty) || 1,
      price: parseFloat(offerPrice), currency,
      notes: notes || null, incoterm, payment_terms: paymentTerms,
      escrow_status: escrowWanted ? 'requested' : 'none',
      escrow_amount: escrowWanted ? parseFloat(offerPrice) * (parseInt(qty) || 1) : null,
      escrow_currency: currency, status: 'offer_sent',
    }
    // My BUY transaction
    const { data: myTx } = await supabase.from('transactions').insert({ ...base, company_id: myCompany, counterpart_id: l.company_id, type: 'buy' }).select().single()
    if (myTx) {
      // Seller's SELL transaction (mirror)
      const { data: theirTx } = await supabase.from('transactions').insert({ ...base, company_id: l.company_id, counterpart_id: myCompany, type: 'sell', linked_transaction_id: myTx.id }).select().single()
      if (theirTx) await supabase.from('transactions').update({ linked_transaction_id: theirTx.id }).eq('id', myTx.id)
    }
    setSubmitting(false); setDone(true)
    setTimeout(() => { closeModal(); router.push('/dashboard/transactions') }, 1800)
  }

  // Direct Sell Offer to a buyer intent
  async function sellNow() {
    const i = activeItem.intent!
    if (!myId.current || !offerPrice) return
    setSubmitting(true)
    const myCompany = myId.current
    const base = {
      product_id: i.product_id, quantity: parseInt(qty) || 1,
      price: parseFloat(offerPrice), currency,
      notes: notes || null, incoterm, payment_terms: paymentTerms,
      escrow_status: escrowWanted ? 'requested' : 'none',
      escrow_amount: escrowWanted ? parseFloat(offerPrice) * (parseInt(qty) || 1) : null,
      escrow_currency: currency, status: 'offer_sent',
    }
    const { data: myTx } = await supabase.from('transactions').insert({ ...base, company_id: myCompany, counterpart_id: i.company_id, type: 'sell' }).select().single()
    if (myTx) {
      const { data: theirTx } = await supabase.from('transactions').insert({ ...base, company_id: i.company_id, counterpart_id: myCompany, type: 'buy', linked_transaction_id: myTx.id }).select().single()
      if (theirTx) await supabase.from('transactions').update({ linked_transaction_id: theirTx.id }).eq('id', myTx.id)
    }
    setSubmitting(false); setDone(true)
    setTimeout(() => { closeModal(); router.push('/dashboard/transactions') }, 1800)
  }

  async function askCompany(companyId: string) {
    if (!myId.current) { router.push('/login'); return }
    const myCompany = myId.current
    const { data: ex } = await supabase.from('conversations').select('id').or(`and(company_a.eq.${myCompany},company_b.eq.${companyId}),and(company_a.eq.${companyId},company_b.eq.${myCompany})`).maybeSingle()
    if (!ex) await supabase.from('conversations').insert({ company_a: myCompany, company_b: companyId })
    router.push('/dashboard/messages')
  }

  const q = query.trim()
  const fls = q ? listings.filter(l => norm(l.pn).includes(norm(q)) || norm(l.brand).includes(norm(q)) || l.dealer_code.includes(q)) : listings
  const fbi = q ? intents.filter(i => norm(i.pn).includes(norm(q)) || norm(i.brand).includes(norm(q)) || i.dealer_code.includes(q)) : intents

  // Modal content
  const listing = activeItem.listing
  const intent = activeItem.intent
  const totalOffer = offerPrice && qty ? (parseFloat(offerPrice) * parseInt(qty)).toLocaleString() : null

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.03em' }}>Marketplace</h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>🔒 All identities anonymous · dealer codes rotate daily</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="🔍  Search part number, brand, or dealer code..."
          style={{ ...inp(), fontSize: 14, padding: '11px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} />
        {q && <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>{fls.length} available · {fbi.length} wanted for "{q}" <button onClick={() => setQuery('')} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 11 }}>clear</button></div>}
      </div>

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
                  {!l.is_mine && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => openModal('buy_now', { listing: l })}
                        style={{ padding: '6px 13px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        ⚡ Buy Now
                      </button>
                      <button onClick={() => openModal('cart', { listing: l })}
                        style={{ padding: '6px 12px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        🛒 Add to List
                      </button>
                      <button onClick={() => askCompany(l.company_id)}
                        style={{ padding: '6px 10px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        💬
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
                      {i.target_price != null && <span>Budget <strong style={{ color: '#b45309' }}>{i.target_price} {i.currency}</strong></span>}
                    </div>
                  </div>
                  {!i.is_mine && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => openModal('sell_now', { intent: i })}
                        style={{ padding: '6px 13px', background: '#15803d', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        ⚡ Sell Now
                      </button>
                      <button onClick={() => askCompany(i.company_id)}
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

      {/* ── UNIFIED MODAL ── */}
      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            {done ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 42, marginBottom: 10 }}>{modalMode === 'cart' ? '✅' : '🚀'}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  {modalMode === 'cart' ? 'Added to Buying List!' : modalMode === 'buy_now' ? 'Buy Request Sent!' : 'Sell Offer Sent!'}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                  {modalMode === 'cart' ? 'Find it in My Buying List.' : 'Check Transactions for status updates.'}
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                      {modalMode === 'cart' && '🛒 Add to Buying List'}
                      {modalMode === 'buy_now' && '⚡ Direct Buy Request'}
                      {modalMode === 'sell_now' && '⚡ Direct Sell Offer'}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {modalMode === 'buy_now' && 'This will open a transaction immediately. You can cancel anytime before confirmation.'}
                      {modalMode === 'sell_now' && 'This will send a sell offer. Buyer must accept to confirm the deal.'}
                      {modalMode === 'cart' && 'Save with your offer price, send later from My Buying List.'}
                    </div>
                  </div>
                  <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', marginLeft: 8 }}>✕</button>
                </div>

                {/* Product info */}
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                    {listing?.pn || intent?.pn}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {listing?.brand || intent?.brand}
                    {listing?.condition ? ` · ${listing.condition}` : ''}
                    {listing ? ` · ${listing.quantity} units available` : intent ? ` · Needs ${intent.quantity} units` : ''}
                  </div>
                  {listing?.price && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Listed: <strong style={{ color: '#1e40af' }}>{listing.price} {listing.currency}</strong>/unit</div>}
                  {intent?.target_price && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Buyer budget: <strong style={{ color: '#b45309' }}>{intent.target_price} {intent.currency}</strong>/unit</div>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Qty + Price */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lbl}>Quantity *</label>
                      <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inp()} />
                    </div>
                    <div>
                      <label style={lbl}>{modalMode === 'sell_now' ? 'My Sell Price *' : 'My Offer Price *'} <span style={{ color: '#ef4444' }}>per unit</span></label>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input type="number" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} style={inp({ flex: 1 })} placeholder="0.00" />
                        <select value={currency} onChange={e => setCurrency(e.target.value)} style={inp({ width: 68 })}>
                          <option>EUR</option><option>USD</option><option>GBP</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Total */}
                  {totalOffer && (
                    <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 13 }}>
                      Total: <strong style={{ color: '#15803d' }}>{totalOffer} {currency}</strong>
                      {listing?.price && offerPrice && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: parseFloat(offerPrice) < listing.price ? '#dc2626' : '#15803d' }}>
                          ({parseFloat(offerPrice) < listing.price ? `${Math.round((1 - parseFloat(offerPrice)/listing.price)*100)}% below ask` : 'at ask'})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Incoterm + Payment — only for buy_now / sell_now */}
                  {modalMode !== 'cart' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={lbl}>Incoterm</label>
                        <select value={incoterm} onChange={e => setIncoterm(e.target.value)} style={inp()}>
                          {['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Payment Terms</label>
                        <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} style={inp()}>
                          {['TT in advance','TT 30 days','TT 60 days','LC at sight','LC 30 days','Open Account'].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label style={lbl}>Notes (optional)</label>
                    <input value={notes} onChange={e => setNotes(e.target.value)} style={inp()} placeholder={modalMode !== 'cart' ? 'Warranty, delivery window, condition...' : 'Incoterm, delivery, warranty...'} />
                  </div>

                  {/* Escrow toggle — only for buy_now / sell_now */}
                  {modalMode !== 'cart' && (
                    <div
                      onClick={() => setEscrowWanted(!escrowWanted)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: escrowWanted ? '#f5f3ff' : '#f8fafc', border: `1px solid ${escrowWanted ? '#a78bfa' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${escrowWanted ? '#6d28d9' : '#cbd5e1'}`, background: escrowWanted ? '#6d28d9' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {escrowWanted && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: escrowWanted ? '#6d28d9' : '#475569' }}>🔒 Request Escrow Protection</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Payment held until goods confirmed received. Requires escrow balance.</div>
                      </div>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    onClick={modalMode === 'cart' ? addToCart : modalMode === 'buy_now' ? buyNow : sellNow}
                    disabled={submitting || !offerPrice || !qty}
                    style={{ padding: '11px', background: submitting || !offerPrice ? '#94a3b8' : modalMode === 'sell_now' ? '#15803d' : '#1e40af', color: 'white', border: 'none', borderRadius: 8, cursor: !offerPrice ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                    {submitting ? 'Sending...' :
                      modalMode === 'cart' ? 'Save to Buying List →' :
                      modalMode === 'buy_now' ? '⚡ Send Buy Request →' :
                      '⚡ Send Sell Offer →'}
                  </button>

                  {modalMode !== 'cart' && (
                    <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
                      Transaction will be created immediately. You can cancel before the other party confirms.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
