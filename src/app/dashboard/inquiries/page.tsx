'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  // matches from marketplace
  match_count?: number
}

const CURRENCIES = ['EUR', 'USD', 'GBP']

const inp = (extra?: any) => ({
  padding: '8px 11px', borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box' as const, ...extra
})
const lbl = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

export default function InquiriesPage() {
  const [intents, setIntents]         = useState<Intent[]>([])
  const [loading, setLoading]         = useState(true)
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)
  const [showForm, setShowForm]       = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')
  const [filterType, setFilterType]   = useState<'all' | 'buy' | 'sell'>('all')

  // Form state
  const [fPn, setFPn]               = useState('')
  const [fBrand, setFBrand]         = useState('')
  const [fType, setFType]           = useState<'buy' | 'sell'>('buy')
  const [fQty, setFQty]             = useState('')
  const [fPrice, setFPrice]         = useState('')
  const [fCurrency, setFCurrency]   = useState('EUR')
  const [fNotes, setFNotes]         = useState('')
  const [pnSuggestions, setPnSuggestions] = useState<any[]>([])
  const [matchingListings, setMatchingListings] = useState<any[]>([])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!p?.company_id) return
    setMyCompanyId(p.company_id)
    await load(p.company_id)
  }

  async function load(cid: string) {
    setLoading(true)
    const { data } = await supabase
      .from('trade_intent')
      .select('*, product:product_id(normalized_pn, brand)')
      .eq('company_id', cid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    // Check marketplace matches for each intent
    const withMatches = await Promise.all((data || []).map(async (intent: any) => {
      if (intent.intent_type === 'buy' && intent.product_id) {
        const { count } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('product_id', intent.product_id)
          .eq('status', 'active')
          .neq('company_id', cid)
        return { ...intent, match_count: count || 0 }
      }
      return { ...intent, match_count: 0 }
    }))

    setIntents(withMatches)
    setLoading(false)
  }

  // PN autocomplete
  async function searchPn(val: string) {
    setFPn(val)
    if (val.length < 2) { setPnSuggestions([]); setMatchingListings([]); return }
    const clean = val.toUpperCase().replace(/[\s-]/g, '')
    const { data } = await supabase
      .from('products')
      .select('id, normalized_pn, brand')
      .ilike('normalized_pn', `%${clean}%`)
      .limit(5)
    setPnSuggestions(data || [])

    // Show marketplace matches
    if (fType === 'buy' && data && data.length > 0) {
      const ids = data.map((p: any) => p.id)
      const { data: listings } = await supabase
        .from('listings')
        .select('*, company:company_id(name), product:product_id(normalized_pn, brand)')
        .in('product_id', ids)
        .eq('status', 'active')
        .neq('company_id', myCompanyId)
        .limit(5)
      setMatchingListings(listings || [])
    }
  }

  function selectSuggestion(p: any) {
    setFPn(p.normalized_pn)
    setFBrand(p.brand || '')
    setPnSuggestions([])
  }

  async function handleSubmit() {
    if (!myCompanyId || !fPn.trim()) { setError('Part number required'); return }
    setSubmitting(true); setError('')

    const cleanPN = fPn.trim().toUpperCase().replace(/[\s-]/g, '')

    // Find or create product
    let productId: string
    const { data: existing } = await supabase.from('products').select('id').eq('normalized_pn', cleanPN).maybeSingle()
    if (existing) {
      productId = existing.id
    } else {
      const { data: newP, error: pErr } = await supabase.from('products')
        .insert({ normalized_pn: cleanPN, brand: fBrand.trim() || 'UNKNOWN' })
        .select().single()
      if (pErr || !newP) { setError(pErr?.message || 'Failed'); setSubmitting(false); return }
      productId = newP.id
    }

    // Check for duplicate intent
    const { data: dup } = await supabase
      .from('trade_intent')
      .select('id, quantity, target_price')
      .eq('company_id', myCompanyId)
      .eq('product_id', productId)
      .eq('intent_type', fType)
      .eq('status', 'active')
      .maybeSingle()

    if (dup) {
      // Update existing
      await supabase.from('trade_intent').update({
        quantity: fQty ? parseInt(fQty) : dup.quantity,
        target_price: fPrice ? parseFloat(fPrice) : dup.target_price,
        currency: fCurrency,
        notes: fNotes.trim() || null,
      }).eq('id', dup.id)
    } else {
      await supabase.from('trade_intent').insert({
        company_id: myCompanyId, product_id: productId,
        intent_type: fType, status: 'active',
        quantity: fQty ? parseInt(fQty) : null,
        target_price: fPrice ? parseFloat(fPrice) : null,
        currency: fCurrency,
        notes: fNotes.trim() || null,
      })
    }

    setShowForm(false)
    setFPn(''); setFBrand(''); setFQty(''); setFPrice(''); setFNotes('')
    setPnSuggestions([]); setMatchingListings([])
    await load(myCompanyId)
    setSubmitting(false)
  }

  async function deactivate(id: string) {
    await supabase.from('trade_intent').update({ status: 'inactive' }).eq('id', id)
    setIntents(prev => prev.filter(i => i.id !== id))
  }

  const filtered = intents.filter(i => filterType === 'all' || i.intent_type === filterType)
  const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.02em' }}>🔍 My Inquiries</h1>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Post buy/sell inquiries — matched sellers/buyers will see them</div>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError('') }}
          style={{ padding: '9px 18px', background: showForm ? '#f1f5f9' : '#2563eb', color: showForm ? '#64748b' : 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          {showForm ? 'Cancel' : '+ New Inquiry'}
        </button>
      </div>

      {/* New inquiry form */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>New Inquiry</div>

          {/* Buy / Sell toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['buy', 'sell'] as const).map(t => (
              <button key={t} onClick={() => setFType(t)}
                style={{ padding: '6px 20px', border: `1px solid ${fType === t ? (t === 'buy' ? '#2563eb' : '#059669') : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: fType === t ? 700 : 400, background: fType === t ? (t === 'buy' ? '#eff6ff' : '#ecfdf5') : 'white', color: fType === t ? (t === 'buy' ? '#2563eb' : '#059669') : '#64748b' }}>
                {t === 'buy' ? '🔍 I want to BUY' : '📦 I want to SELL'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ position: 'relative', gridColumn: 'span 2' }}>
              <label style={lbl}>Part Number *</label>
              <input value={fPn} onChange={e => searchPn(e.target.value)}
                placeholder="e.g. WS-C2960X" style={inp({ fontFamily: 'monospace', textTransform: 'uppercase' })} />
              {pnSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {pnSuggestions.map(p => (
                    <div key={p.id} onClick={() => selectSuggestion(p)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}>
                      <strong style={{ fontFamily: 'monospace' }}>{p.normalized_pn}</strong>
                      <span style={{ color: '#64748b', marginLeft: 8 }}>{p.brand}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={lbl}>Brand</label>
              <input value={fBrand} onChange={e => setFBrand(e.target.value)} placeholder="Cisco, Nokia..." style={inp()} />
            </div>
            <div>
              <label style={lbl}>Quantity</label>
              <input type="number" value={fQty} onChange={e => setFQty(e.target.value)} placeholder="0" style={inp()} />
            </div>
            <div>
              <label style={lbl}>Target Price</label>
              <input type="number" value={fPrice} onChange={e => setFPrice(e.target.value)} placeholder="0.00" style={inp()} />
            </div>
            <div>
              <label style={lbl}>Currency</label>
              <select value={fCurrency} onChange={e => setFCurrency(e.target.value)} style={inp()}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Notes</label>
              <input value={fNotes} onChange={e => setFNotes(e.target.value)}
                placeholder="Condition preference, delivery terms, urgency..." style={inp()} />
            </div>
          </div>

          {/* Marketplace matches preview */}
          {fType === 'buy' && matchingListings.length > 0 && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 8 }}>
                ✅ {matchingListings.length} matching listing{matchingListings.length > 1 ? 's' : ''} already in marketplace
              </div>
              {matchingListings.map(l => (
                <div key={l.id} style={{ fontSize: 12, color: '#064e3b', display: 'flex', gap: 12 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{l.product?.normalized_pn}</span>
                  <span>{l.quantity} units</span>
                  <span>{l.price} {l.currency}</span>
                  <span style={{ color: '#94a3b8' }}>{l.condition}</span>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={handleSubmit} disabled={submitting || !fPn}
              style={{ padding: '9px 24px', background: (!fPn || submitting) ? '#94a3b8' : '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: (!fPn || submitting) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
              {submitting ? 'Saving...' : 'Post Inquiry →'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['all', 'buy', 'sell'] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            style={{ padding: '4px 14px', border: `1px solid ${filterType === t ? '#2563eb' : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: filterType === t ? 700 : 400, background: filterType === t ? '#eff6ff' : 'white', color: filterType === t ? '#2563eb' : '#64748b' }}>
            {t === 'all' ? 'All' : t === 'buy' ? '🔍 Buy' : '📦 Sell'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>{filtered.length} active</span>
      </div>

      {/* List */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No active inquiries. Post one to let others know what you need.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Type', 'Part Number', 'Brand', 'Qty', 'Target Price', 'Notes', 'Matches', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontSize: 11, color: '#64748b', fontWeight: 700, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: i.intent_type === 'buy' ? '#eff6ff' : '#ecfdf5', color: i.intent_type === 'buy' ? '#2563eb' : '#059669' }}>
                      {i.intent_type === 'buy' ? '🔍 BUY' : '📦 SELL'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace', fontSize: 13, color: '#0f172a' }}>{i.product?.normalized_pn || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#64748b' }}>{i.product?.brand || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#0f172a' }}>{i.quantity ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#0f172a' }}>
                    {i.target_price ? `${CURRENCY_SYMBOL[i.currency] || ''}${i.target_price} ${i.currency}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.notes || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {(i.match_count || 0) > 0 ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#ecfdf5', color: '#059669', fontWeight: 700 }}>
                        ✅ {i.match_count} match{(i.match_count || 0) > 1 ? 'es' : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>No match</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(i.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => deactivate(i.id)}
                      style={{ padding: '4px 10px', background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
