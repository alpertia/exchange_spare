'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type CartItem = {
  id: string; listing_id: string | null; product_id: string | null
  seller_id: string | null; pn: string; brand: string
  quantity: number; listing_price: number | null
  offer_price: number | null; currency: string; notes: string | null
  created_at: string; dealer_code: string
  // enriched
  offers_received: number
  best_offer: number | null
}

function dealerCode(id: string) {
  if (!id) return '????'
  const day = new Date().toISOString().slice(0, 10)
  let h = 2166136261
  for (const c of id + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); h >>>= 0 }
  return String((h % 9000) + 1000)
}

const inp = (extra?: any) => ({ padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, ...extra })

export default function BuyingListPage() {
  const router = useRouter()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState<Record<string, string>>({})
  const [editQty, setEditQty] = useState<Record<string, string>>({})

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!p?.company_id) return
    setMyId(p.company_id)
    await loadItems(p.company_id)
  }

  async function loadItems(cid: string) {
    setLoading(true)
    const { data } = await supabase.from('cart_items').select('*').eq('company_id', cid).order('created_at', { ascending: false })
    if (!data) { setLoading(false); return }

    // For each item, check if any seller has sent offers on that product
    const enriched = await Promise.all(data.map(async (item: any) => {
      let offers_received = 0, best_offer: number | null = null
      if (item.product_id) {
        const { data: txs } = await supabase.from('transactions')
          .select('price').eq('counterpart_id', cid).eq('product_id', item.product_id).eq('type', 'buy').eq('status', 'offer_sent')
        offers_received = txs?.length || 0
        best_offer = txs?.length ? Math.min(...txs.map((t: any) => t.price).filter(Boolean)) : null
      }
      return { ...item, dealer_code: dealerCode(item.seller_id || ''), offers_received, best_offer, currency: item.currency || 'EUR' }
    }))

    setItems(enriched)
    const prices: Record<string, string> = {}, qtys: Record<string, string> = {}
    enriched.forEach((i: any) => { prices[i.id] = String(i.offer_price || ''); qtys[i.id] = String(i.quantity || 1) })
    setEditPrice(prices); setEditQty(qtys)
    setLoading(false)
  }

  async function removeItem(id: string) {
    await supabase.from('cart_items').delete().eq('id', id)
    if (myId) await loadItems(myId)
  }

  async function updateItem(id: string) {
    await supabase.from('cart_items').update({ offer_price: parseFloat(editPrice[id]), quantity: parseInt(editQty[id]) }).eq('id', id)
    if (myId) await loadItems(myId)
  }

  async function sendOffer(item: CartItem) {
    if (!myId || !item.seller_id) return
    setSubmitting(item.id)
    const price = parseFloat(editPrice[item.id] || String(item.offer_price || 0))
    const qty   = parseInt(editQty[item.id]   || String(item.quantity))
    const base = {
      company_id: myId, counterpart_id: item.seller_id,
      product_id: item.product_id, type: 'buy', status: 'offer_sent',
      quantity: qty, price, currency: item.currency,
      notes: item.notes || null, escrow_status: 'none',
    }
    const { data: myTx } = await supabase.from('transactions').insert(base).select().single()
    if (myTx) {
      const { data: theirTx } = await supabase.from('transactions').insert({ ...base, company_id: item.seller_id, counterpart_id: myId, type: 'sell', linked_transaction_id: myTx.id }).select().single()
      if (theirTx) await supabase.from('transactions').update({ linked_transaction_id: theirTx.id }).eq('id', myTx.id)
      // Remove from cart
      await supabase.from('cart_items').delete().eq('id', item.id)
    }
    setSubmitting(null)
    router.push('/dashboard/transactions')
  }

  async function askSeller(sellerId: string) {
    if (!myId) return
    const { data: ex } = await supabase.from('conversations').select('id').or(`and(company_a.eq.${myId},company_b.eq.${sellerId}),and(company_a.eq.${sellerId},company_b.eq.${myId})`).maybeSingle()
    if (!ex) await supabase.from('conversations').insert({ company_a: myId, company_b: sellerId })
    router.push('/dashboard/messages')
  }

  const total = items.reduce((s, i) => s + (parseFloat(editPrice[i.id] || '0') || 0) * (parseInt(editQty[i.id] || '0') || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.03em' }}>My Buying List</h1>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{items.length} items · Total offers: <strong style={{ color: '#0f172a' }}>{total.toLocaleString()} EUR</strong></div>
        </div>
        <button onClick={() => router.push('/dashboard/marketplace')}
          style={{ padding: '8px 14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Browse Marketplace
        </button>
      </div>

      {loading ? <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        : items.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Your buying list is empty</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Browse the marketplace and click "Add to Cart" on any listing</div>
            <button onClick={() => router.push('/dashboard/marketplace')}
              style={{ padding: '9px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Go to Marketplace →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(item => (
              <div key={item.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* Product info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{item.pn}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{item.brand}</span>
                      {item.offers_received > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: 4, fontWeight: 600 }}>
                          {item.offers_received} offer{item.offers_received > 1 ? 's' : ''} received!
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      Seller: Dealer {item.dealer_code}
                      {item.listing_price && <> · Listed at <strong style={{ color: '#64748b' }}>{item.listing_price} {item.currency}</strong></>}
                      {item.best_offer && <> · Best offer to you: <strong style={{ color: '#15803d' }}>{item.best_offer} {item.currency}</strong></>}
                    </div>
                    {item.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{item.notes}</div>}
                  </div>

                  {/* Edit price + qty */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Qty</div>
                      <input type="number" min="1" value={editQty[item.id] || ''} onChange={e => setEditQty({ ...editQty, [item.id]: e.target.value })} style={inp({ width: 64 })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>My Offer Price *</div>
                      <input type="number" value={editPrice[item.id] || ''} onChange={e => setEditPrice({ ...editPrice, [item.id]: e.target.value })} style={inp({ width: 100 })} placeholder="0.00" />
                    </div>
                    <div style={{ paddingTop: 16 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{item.currency}</span>
                    </div>
                  </div>
                </div>

                {/* Total + actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #f8fafc' }}>
                  <div style={{ fontSize: 13 }}>
                    {editPrice[item.id] && editQty[item.id] ? (
                      <span>Total: <strong style={{ color: '#0f172a', fontSize: 14 }}>{(parseFloat(editPrice[item.id]) * parseInt(editQty[item.id])).toLocaleString()} {item.currency}</strong></span>
                    ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>Enter offer price to continue</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {item.seller_id && (
                      <button onClick={() => askSeller(item.seller_id!)}
                        style={{ padding: '6px 12px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        💬 Ask Seller
                      </button>
                    )}
                    <button onClick={() => removeItem(item.id)}
                      style={{ padding: '6px 10px', background: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                      ✕
                    </button>
                    <button onClick={() => sendOffer(item)} disabled={!editPrice[item.id] || submitting === item.id}
                      style={{ padding: '6px 14px', background: !editPrice[item.id] ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 6, cursor: !editPrice[item.id] ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {submitting === item.id ? 'Sending...' : '→ Send Buy Offer'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
