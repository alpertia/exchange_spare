"use client"
import { useEffect, useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"

type Product = {
  id: string
  normalized_pn: string
  brand: string | null
  description: string | null
  lifecycle_status: string | null
  product_group: string | null
  category: string | null
  image_url: string | null
  images: string[] | null
  weight_kg: number | null
  dimensions: string | null
  power_consumption_w: number | null
  operating_temp_min: number | null
  operating_temp_max: number | null
  mtbf_hours: number | null
  warranty_months: number | null
  notes: string | null
}

type MarketTx = {
  id: string
  price: number
  quantity: number
  currency: string
  status: string
  type: string
  final_confirmed_at: string | null
  created_at: string
}

type ActiveListing = {
  id: string
  price: number
  quantity: number
  currency: string
  type: string
  created_at: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const LIFECYCLE_COLOR: Record<string, [string, string]> = {
  still_produced: ['#15803d', '#f0fdf4'],
  eop:            ['#92400e', '#fffbeb'],
  eos:            ['#d97706', '#fffbeb'],
  eol:            ['#dc2626', '#fef2f2'],
  unknown:        ['#64748b', '#f8fafc'],
}
const LIFECYCLE_LABEL: Record<string, string> = {
  still_produced: 'In Production',
  eop:            'End of Production',
  eos:            'End of Sale',
  eol:            'End of Life',
  unknown:        'Unknown',
}

export default function KBDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [product, setProduct]       = useState<Product | null>(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<'info' | 'market' | 'ai'>('info')
  const [imgIdx, setImgIdx]         = useState(0)

  // Market data
  const [soldTxs, setSoldTxs]       = useState<MarketTx[]>([])
  const [activeSell, setActiveSell] = useState<ActiveListing[]>([])
  const [activeBuy, setActiveBuy]   = useState<ActiveListing[]>([])
  const [marketLoading, setMarketLoading] = useState(false)

  // AI chat
  const [messages, setMessages]     = useState<ChatMessage[]>([])
  const [input, setInput]           = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [credits, setCredits]       = useState<number | null>(null)
  const [companyId, setCompanyId]   = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (id) loadProduct() }, [id])
  useEffect(() => { getSession() }, [])
  useEffect(() => { if (tab === 'market' && product) loadMarket() }, [tab, product])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', session.user.id).single()
    if (profile?.company_id) {
      setCompanyId(profile.company_id)
      const { data: ai } = await supabase
        .from('ai_credits').select('credits_total, credits_used, credits_free')
        .eq('company_id', profile.company_id).single()
      if (ai) setCredits((ai.credits_free || 0) + (ai.credits_total || 0) - (ai.credits_used || 0))
    }
  }

  async function loadProduct() {
    setLoading(true)
    const { data } = await supabase.from('products').select('*').eq('id', id).single()
    setProduct(data)
    setLoading(false)
  }

  async function loadMarket() {
    if (!product) return
    setMarketLoading(true)
    const pn = product.normalized_pn

    // Last 3 completed sales — join through listings to get product_id
    // transactions have product_id directly
    const [soldRes, sellRes, buyRes] = await Promise.all([
      supabase.from('transactions')
        .select('id, price, quantity, currency, status, type, final_confirmed_at, created_at')
        .eq('product_id', product.id)
        .eq('status', 'completed')
        .order('final_confirmed_at', { ascending: false })
        .limit(3),
      supabase.from('transactions')
        .select('id, price, quantity, currency, type, created_at')
        .eq('product_id', product.id)
        .eq('type', 'sell')
        .in('status', ['active', 'offer_sent', 'confirmed'])
        .order('price', { ascending: true })
        .limit(5),
      supabase.from('transactions')
        .select('id, price, quantity, currency, type, created_at')
        .eq('product_id', product.id)
        .eq('type', 'buy')
        .in('status', ['active', 'offer_sent', 'confirmed'])
        .order('price', { ascending: false })
        .limit(5),
    ])

    setSoldTxs(soldRes.data || [])
    setActiveSell(sellRes.data || [])
    setActiveBuy(buyRes.data || [])
    setMarketLoading(false)
  }

  async function sendChat() {
    if (!input.trim() || aiLoading || !product) return
    if (!companyId) { router.push('/login'); return }

    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setAiLoading(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          credit_feature: 'kb_chat',
          messages: [
            ...history,
            { role: 'user', content: userMsg }
          ],
          system: `You are a technical expert on telecom and satellite equipment. The user is asking about this product:

Part Number: ${product.normalized_pn}
Brand: ${product.brand || 'Unknown'}
Description: ${product.description || 'N/A'}
Lifecycle: ${LIFECYCLE_LABEL[product.lifecycle_status || ''] || product.lifecycle_status || 'Unknown'}
Product Group: ${product.product_group || 'N/A'}
Category: ${product.category || 'N/A'}
${product.weight_kg ? `Weight: ${product.weight_kg} kg` : ''}
${product.dimensions ? `Dimensions: ${product.dimensions}` : ''}
${product.power_consumption_w ? `Power: ${product.power_consumption_w}W` : ''}
${product.notes ? `Notes: ${product.notes}` : ''}

Answer concisely and technically. If you don't know something specific, say so.`
        })
      })

      const remaining = res.headers.get('X-AI-Credits-Remaining')
      if (remaining) setCredits(parseInt(remaining))

      if (res.status === 402) {
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ No AI credits remaining. Please purchase more credits to continue.' }])
        setAiLoading(false)
        return
      }

      const data = await res.json()
      const text = data.content?.map((b: any) => b.text || '').join('') || 'No response.'
      setMessages(prev => [...prev, { role: 'assistant', content: text }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error — please try again.' }])
    }
    setAiLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#94a3b8', fontSize: 13 }}>Loading...</div>
  )
  if (!product) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Product not found.</div>
  )

  const images = product.images?.length ? product.images : product.image_url ? [product.image_url] : []
  const [lcColor, lcBg] = LIFECYCLE_COLOR[(product.lifecycle_status || '').toLowerCase()] || ['#64748b', '#f8fafc']
  const lcLabel = LIFECYCLE_LABEL[(product.lifecycle_status || '').toLowerCase()] || product.lifecycle_status || 'Unknown'

  const fmt = (v: number, cur = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* Back */}
      <Link href="/dashboard/knowledge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 20 }}>
        ← Knowledge Base
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Image */}
        <div style={{ width: 160, flexShrink: 0 }}>
          <div style={{ width: 160, height: 130, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6 }}>
            {images.length > 0 ? (
              <img src={images[imgIdx]} alt={product.normalized_pn} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ fontSize: 40, opacity: 0.15 }}>📦</div>
            )}
          </div>
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {images.map((img, i) => (
                <div key={i} onClick={() => setImgIdx(i)} style={{ width: 32, height: 28, border: `2px solid ${imgIdx === i ? '#185FA5' : '#e2e8f0'}`, borderRadius: 5, overflow: 'hidden', cursor: 'pointer' }}>
                  <img src={img} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 22, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 4 }}>
            {product.normalized_pn}
          </div>
          {product.brand && <div style={{ fontSize: 14, color: '#64748b', marginBottom: 10 }}>{product.brand}</div>}
          {product.description && (
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.65, marginBottom: 12, maxWidth: 520 }}>{product.description}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: lcBg, color: lcColor, fontWeight: 600 }}>{lcLabel}</span>
            {product.product_group && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>📦 {product.product_group}</span>}
            {product.category && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>{product.category}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 24, gap: 2 }}>
        {([['info', '📋 Product Info'], ['market', '📊 Market Data'], ['ai', '🤖 Ask AI']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 18px', fontSize: 13, fontWeight: tab === key ? 600 : 400,
            color: tab === key ? '#0f172a' : '#64748b', background: 'none', border: 'none',
            borderBottom: tab === key ? '2px solid #0f172a' : '2px solid transparent',
            cursor: 'pointer', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* TAB: Product Info */}
      {tab === 'info' && (
        <div>
          {/* Specs grid */}
          {(product.weight_kg || product.dimensions || product.power_consumption_w || product.operating_temp_min != null || product.mtbf_hours || product.warranty_months) ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
              {[
                product.weight_kg && { label: 'Weight', value: `${product.weight_kg} kg` },
                product.dimensions && { label: 'Dimensions', value: product.dimensions },
                product.power_consumption_w && { label: 'Power', value: `${product.power_consumption_w} W` },
                product.operating_temp_min != null && product.operating_temp_max != null && { label: 'Temp Range', value: `${product.operating_temp_min}°C – ${product.operating_temp_max}°C` },
                product.mtbf_hours && { label: 'MTBF', value: `${product.mtbf_hours.toLocaleString()} h` },
                product.warranty_months && { label: 'Warranty', value: `${product.warranty_months} months` },
              ].filter(Boolean).map((s: any, i) => (
                <div key={i} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{s.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', marginBottom: 20, fontSize: 13, color: '#94a3b8' }}>
              No detailed specs available for this product yet.
            </div>
          )}

          {product.notes && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '16px 20px', fontSize: 13, color: '#78350f', lineHeight: 1.65 }}>
              <strong>Notes:</strong> {product.notes}
            </div>
          )}
        </div>
      )}

      {/* TAB: Market Data */}
      {tab === 'market' && (
        <div>
          {marketLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading market data...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Last 3 completed sales */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>🏷️ Last completed sales</div>
                {soldTxs.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', padding: '16px', background: '#f8fafc', borderRadius: 8 }}>No completed sales on record yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {soldTxs.map(tx => (
                      <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px' }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmt(tx.price, tx.currency || 'USD')}</span>
                          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>× {tx.quantity} unit{tx.quantity > 1 ? 's' : ''}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {tx.final_confirmed_at ? fmtDate(tx.final_confirmed_at) : fmtDate(tx.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active sell listings */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>📤 Active sell listings</div>
                {activeSell.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', padding: '16px', background: '#f8fafc', borderRadius: 8 }}>No active sell listings.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeSell.map(tx => (
                      <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px' }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>{fmt(tx.price, tx.currency || 'USD')}</span>
                          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>× {tx.quantity} unit{tx.quantity > 1 ? 's' : ''}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>FOR SALE</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active buy intents */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>📥 Active buy intents</div>
                {activeBuy.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', padding: '16px', background: '#f8fafc', borderRadius: 8 }}>No active buy intents.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeBuy.map(tx => (
                      <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px' }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>{fmt(tx.price, tx.currency || 'USD')}</span>
                          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>× {tx.quantity} unit{tx.quantity > 1 ? 's' : ''}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>WANTED</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* TAB: AI Chat */}
      {tab === 'ai' && (
        <div>
          {/* Credits badge */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <span style={{ fontSize: 11, padding: '3px 10px', background: credits && credits > 0 ? '#f0fdf4' : '#fef2f2', color: credits && credits > 0 ? '#15803d' : '#dc2626', border: `1px solid ${credits && credits > 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: 20, fontWeight: 600 }}>
              {credits === null ? '...' : credits > 0 ? `${credits} credits` : 'No credits'}
            </span>
          </div>

          {!companyId ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: 13 }}>
              <Link href="/login" style={{ color: '#185FA5' }}>Log in</Link> to use AI chat.
            </div>
          ) : (
            <>
              {/* Messages */}
              <div style={{ minHeight: 240, maxHeight: 400, overflowY: 'auto', background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
                    Ask anything about <strong style={{ fontFamily: 'monospace' }}>{product.normalized_pn}</strong>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: m.role === 'user' ? '#0f172a' : 'white',
                      color: m.role === 'user' ? 'white' : '#0f172a',
                      fontSize: 13, lineHeight: 1.65,
                      border: m.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: 'flex' }}>
                    <div style={{ padding: '10px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px 12px 12px 2px', fontSize: 13, color: '#94a3b8' }}>
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder={`Ask about ${product.normalized_pn}...`}
                  disabled={aiLoading || (credits !== null && credits <= 0)}
                  style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white' }}
                />
                <button
                  onClick={sendChat}
                  disabled={aiLoading || !input.trim() || (credits !== null && credits <= 0)}
                  style={{ padding: '10px 18px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: aiLoading || !input.trim() ? 0.5 : 1 }}
                >
                  Send
                </button>
              </div>
              {credits !== null && credits <= 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626', textAlign: 'center' }}>
                  No credits remaining. <Link href="/dashboard/knowledge" style={{ color: '#185FA5' }}>Buy credits</Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
