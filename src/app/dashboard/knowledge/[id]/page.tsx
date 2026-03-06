"use client"
import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Product = {
  id: string; brand: string; normalized_pn: string
  description: string | null; lifecycle_status: string | null
  category: string | null; datasheet_url: string | null
  weight_kg: number | null; dimensions_mm: string | null
  compatibility: string | null; related_pns: string[] | null
  topology_data: any | null; image_url: string | null
}
type Listing = {
  id: string; company_id: string; quantity: number
  price: number | null; currency: string | null
  condition: string | null; company_name?: string
}
type MarketStats = {
  seller_count: number; buyer_count: number; total_quantity: number
  min_price: number | null; max_price: number | null; avg_price: number | null
}
type ChatMsg = { role: 'user' | 'assistant'; content: string }

const LIFECYCLE_COLOR: Record<string, [string, string]> = {
  active:       ['#15803d', '#f0fdf4'],
  eol:          ['#dc2626', '#fef2f2'],
  discontinued: ['#92400e', '#fffbeb'],
}

export default function ProductDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [product, setProduct] = useState<Product | null>(null)
  const [stats, setStats] = useState<MarketStats | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [contacting, setContacting] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'compatibility' | 'topology' | 'market'>('overview')

  // AI Chat
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Product>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (id) load() }, [id])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("company_id, role").eq("id", user.id).single()
      if (profile) {
        setMyCompanyId(profile.company_id)
        if (profile.role === 'admin') setCanEdit(true)
        else {
          const { data: ed } = await supabase.from('product_editors').select('user_id').eq('user_id', user.id).maybeSingle()
          if (ed) setCanEdit(true)
        }
      }
    }

    const [{ data: p }, { data: marketStats }, { data: rawListings }] = await Promise.all([
      supabase.from("products").select("*").eq("id", id).single(),
      supabase.rpc("product_market_stats", { p_id: id }).maybeSingle(),
      supabase.from("listings").select("id, company_id, quantity, price, currency, condition, companies(name)").eq("product_id", id).eq("status", "active").order("price", { ascending: true }),
    ])

    setProduct(p)
    setEditData(p || {})
    setStats(marketStats || null)
    setListings((rawListings || []).map((l: any) => ({ ...l, company_name: l.companies?.name || "—" })))
    setLoading(false)
  }

  async function handleContact(targetCompanyId: string) {
    if (!myCompanyId || myCompanyId === targetCompanyId) return
    setContacting(targetCompanyId)
    const { data: existing } = await supabase.from("conversations").select("id")
      .or(`and(company_a.eq.${myCompanyId},company_b.eq.${targetCompanyId}),and(company_a.eq.${targetCompanyId},company_b.eq.${myCompanyId})`).maybeSingle()
    if (!existing) await supabase.from("conversations").insert({ company_a: myCompanyId, company_b: targetCompanyId, product_id: id })
    setContacting(null)
    router.push("/dashboard/messages")
  }

  async function saveEdit() {
    if (!product) return
    setSaving(true)
    const { error } = await supabase.from('products').update({
      description:   editData.description,
      weight_kg:     editData.weight_kg,
      dimensions_mm: editData.dimensions_mm,
      compatibility: editData.compatibility,
      related_pns:   editData.related_pns,
      lifecycle_status: editData.lifecycle_status,
      category:      editData.category,
      datasheet_url: editData.datasheet_url,
      image_url:     editData.image_url,
      topology_data: editData.topology_data,
      updated_at:    new Date().toISOString(),
    }).eq('id', product.id)
    if (!error) { setEditing(false); await load() }
    setSaving(false)
  }

  // AI Chat — calls Anthropic API with product context
  async function sendChat() {
    if (!chatInput.trim() || !product || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMsgs(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)

    const systemPrompt = `You are a telecom equipment specialist AI assistant for the SpareShare platform.
You have access to the following product information:

Product: ${product.normalized_pn}
Brand: ${product.brand}
Category: ${product.category || 'N/A'}
Lifecycle: ${product.lifecycle_status || 'N/A'}
Description: ${product.description || 'N/A'}
Weight: ${product.weight_kg ? product.weight_kg + ' kg' : 'N/A'}
Dimensions: ${product.dimensions_mm || 'N/A'}
Compatibility Notes: ${product.compatibility || 'N/A'}
Related PNs: ${product.related_pns?.join(', ') || 'N/A'}

Answer questions about this product: compatibility, installation, specifications, alternatives, topology, usage, and trading considerations. Be concise and technical. If you don't know something specific about this product, say so clearly.`

    const history = chatMsgs.map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [...history, { role: 'user', content: userMsg }],
          max_tokens: 800,
        }),
      })
      const data = await res.json()
      const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
      setChatMsgs(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setChatMsgs(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    }
    setChatLoading(false)
  }

  if (loading) return <div style={{ color: "#64748b", padding: 40 }}>Loading...</div>
  if (!product) return <div style={{ color: "#dc2626", padding: 40 }}>Product not found</div>

  const [lc, lb] = LIFECYCLE_COLOR[(product.lifecycle_status || '').toLowerCase()] || ['#64748b', '#f8fafc']
  const relatedPns: string[] = product.related_pns || []

  return (
    <div style={{ maxWidth: 960 }}>
      <button onClick={() => router.back()}
        style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, marginBottom: 20, padding: 0 }}>
        ← Back to Knowledge Base
      </button>

      {/* Header */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>{product.brand}</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 10px", fontFamily: "monospace", letterSpacing: "-0.02em" }}>
              {product.normalized_pn}
            </h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {product.category && <span style={{ fontSize: 11, background: "#f1f5f9", color: "#64748b", padding: "2px 9px", borderRadius: 20 }}>{product.category}</span>}
              {product.lifecycle_status && <span style={{ fontSize: 11, background: lb, color: lc, padding: "2px 9px", borderRadius: 20, fontWeight: 600 }}>{product.lifecycle_status}</span>}
              {product.datasheet_url && <a href={product.datasheet_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#1e40af", padding: "2px 9px", borderRadius: 20, background: '#eff6ff', textDecoration: 'none', fontWeight: 600 }}>📄 Download Datasheet</a>}
            </div>
            {product.description && <p style={{ fontSize: 13, color: "#64748b", margin: "8px 0 0", lineHeight: 1.6 }}>{product.description}</p>}
          </div>
          {canEdit && (
            <button onClick={() => setEditing(!editing)}
              style={{ marginLeft: 16, padding: '7px 14px', background: editing ? '#fef2f2' : '#f8fafc', color: editing ? '#dc2626' : '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
              {editing ? '✕ Cancel Edit' : '✎ Edit'}
            </button>
          )}
        </div>

        {/* Specs row */}
        {(product.weight_kg || product.dimensions_mm) && (
          <div style={{ display: 'flex', gap: 20, marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
            {product.weight_kg && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 1 }}>WEIGHT</span>
                <strong style={{ color: '#0f172a' }}>{product.weight_kg} kg</strong>
              </div>
            )}
            {product.dimensions_mm && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 1 }}>DIMENSIONS</span>
                <strong style={{ color: '#0f172a' }}>{product.dimensions_mm}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && canEdit && (
        <div style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 14 }}>✎ Edit Product Info</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { label: 'Description', key: 'description', type: 'textarea' },
              { label: 'Category', key: 'category', type: 'text' },
              { label: 'Lifecycle Status', key: 'lifecycle_status', type: 'select', options: ['active','eol','discontinued','unknown'] },
              { label: 'Weight (kg)', key: 'weight_kg', type: 'number' },
              { label: 'Dimensions (mm)', key: 'dimensions_mm', type: 'text', placeholder: '442 × 44 × 320 mm' },
              { label: 'Compatibility Notes', key: 'compatibility', type: 'textarea' },
              { label: 'Datasheet URL', key: 'datasheet_url', type: 'text' },
              { label: 'Image URL', key: 'image_url', type: 'text' },
            ].map(f => (
              <div key={f.key} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : {}}>
                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</label>
                {f.type === 'select' ? (
                  <select value={(editData as any)[f.key] || ''} onChange={e => setEditData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', background: '#f8fafc' }}>
                    {f.options?.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea value={(editData as any)[f.key] || ''} onChange={e => setEditData(prev => ({ ...prev, [f.key]: e.target.value }))} rows={3}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical', background: '#f8fafc', boxSizing: 'border-box' }} />
                ) : (
                  <input type={f.type} value={(editData as any)[f.key] || ''} placeholder={f.placeholder}
                    onChange={e => setEditData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' as const }} />
                )}
              </div>
            ))}
            {/* Related PNs */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Related / Compatible PNs (comma separated)</label>
              <input value={(editData.related_pns || []).join(', ')} onChange={e => setEditData(prev => ({ ...prev, related_pns: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) }))}
                placeholder="PN1, PN2, PN3..."
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={saveEdit} disabled={saving}
              style={{ padding: '9px 20px', background: saving ? '#94a3b8' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {saving ? 'Saving...' : '✓ Save Changes'}
            </button>
            <button onClick={() => { setEditing(false); setEditData(product) }}
              style={{ padding: '9px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {[['overview','📋 Overview'], ['compatibility','🔗 Compatibility'], ['topology','🖧 Topology'], ['market','📊 Market']].map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k as any)}
            style={{ padding: '6px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: activeTab === k ? '#0f172a' : 'transparent', color: activeTab === k ? 'white' : '#64748b' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        {/* LEFT PANEL */}
        <div>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Product Details</div>
              <div style={{ padding: 18 }}>
                {product.image_url && (
                  <div style={{ marginBottom: 16, textAlign: 'center' }}>
                    <img src={product.image_url} alt={product.normalized_pn} style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid #f1f5f9' }} />
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Part Number', value: product.normalized_pn },
                    { label: 'Brand', value: product.brand },
                    { label: 'Category', value: product.category },
                    { label: 'Lifecycle', value: product.lifecycle_status },
                    { label: 'Weight', value: product.weight_kg ? `${product.weight_kg} kg` : null },
                    { label: 'Dimensions', value: product.dimensions_mm },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{f.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', fontFamily: f.label === 'Part Number' ? 'monospace' : undefined }}>{f.value}</div>
                    </div>
                  ))}
                </div>
                {product.description && (
                  <div style={{ marginTop: 12, padding: '12px', background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{product.description}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COMPATIBILITY */}
          {activeTab === 'compatibility' && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Compatibility & Related Parts</div>
              <div style={{ padding: 18 }}>
                {product.compatibility && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Compatibility Notes</div>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, padding: '12px 14px', background: '#f8fafc', borderRadius: 8 }}>
                      {product.compatibility}
                    </div>
                  </div>
                )}
                {relatedPns.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Works With / Compatible PNs</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {relatedPns.map(pn => (
                        <button key={pn} onClick={() => router.push(`/dashboard/knowledge?q=${pn}`)}
                          style={{ padding: '5px 12px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>
                          {pn} →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!product.compatibility && relatedPns.length === 0 && (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No compatibility data yet.{canEdit ? ' Use the Edit button to add.' : ' Ask the AI assistant for guidance.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TOPOLOGY */}
          {activeTab === 'topology' && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Network Topology</div>
              <div style={{ padding: 18 }}>
                {product.topology_data ? (
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569', fontFamily: 'monospace', lineHeight: 1.8 }}>
                    {/* Render topology as a simple visual if it's a node list */}
                    {Array.isArray(product.topology_data?.nodes) ? (
                      <div>
                        <div style={{ marginBottom: 12, fontSize: 11, color: '#94a3b8', fontFamily: 'sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>Network Nodes</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          {product.topology_data.nodes.map((node: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ padding: '6px 14px', background: node.highlight ? '#eff6ff' : 'white', border: `2px solid ${node.highlight ? '#1e40af' : '#e2e8f0'}`, borderRadius: 8, fontSize: 12, fontWeight: node.highlight ? 700 : 400, color: node.highlight ? '#1e40af' : '#475569', fontFamily: 'monospace' }}>
                                {node.pn || node.label}
                              </div>
                              {i < product.topology_data.nodes.length - 1 && <span style={{ color: '#94a3b8', fontSize: 16 }}>→</span>}
                            </div>
                          ))}
                        </div>
                        {product.topology_data.description && (
                          <div style={{ marginTop: 14, padding: '10px 12px', background: 'white', border: '1px solid #f1f5f9', borderRadius: 6, fontSize: 12, color: '#64748b', fontFamily: 'sans-serif', lineHeight: 1.6 }}>
                            {product.topology_data.description}
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre style={{ margin: 0, fontSize: 11, overflow: 'auto' }}>{JSON.stringify(product.topology_data, null, 2)}</pre>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No topology data yet. Ask the AI assistant about typical network configurations for this product.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MARKET */}
          {activeTab === 'market' && (
            <div>
              {stats && (
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Market Overview</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {[
                      { label: "Sellers", value: stats.seller_count },
                      { label: "Buyers", value: stats.buyer_count },
                      { label: "Total Stock", value: stats.total_quantity },
                      { label: "Min Price", value: stats.min_price ? `${stats.min_price} EUR` : "—" },
                      { label: "Avg Price", value: stats.avg_price ? `${Math.round(Number(stats.avg_price))} EUR` : "—" },
                      { label: "Max Price", value: stats.max_price ? `${stats.max_price} EUR` : "—" },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center", padding: 12, background: "#f8fafc", borderRadius: 8 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9", fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  Active Listings ({listings.length})
                </div>
                {listings.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No active listings</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Company", "Qty", "Condition", "Price", ""].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listings.map(l => (
                        <tr key={l.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{l.company_name}</td>
                          <td style={{ padding: "11px 14px", fontSize: 13 }}>{l.quantity}</td>
                          <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{l.condition || "—"}</td>
                          <td style={{ padding: "11px 14px", fontSize: 13, color: "#0f172a" }}>{l.price ? `${l.price} ${l.currency || "EUR"}` : "—"}</td>
                          <td style={{ padding: "11px 14px" }}>
                            {l.company_id === myCompanyId ? (
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>Your listing</span>
                            ) : (
                              <button onClick={() => handleContact(l.company_id)} disabled={contacting === l.company_id}
                                style={{ padding: "4px 12px", background: "transparent", color: "#1e40af", border: "1px solid #bfdbfe", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                {contacting === l.company_id ? "..." : "Contact"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — AI ASSISTANT */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 520 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#0f172a' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>🤖 AI Product Assistant</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Ask anything about {product.normalized_pn}</div>
          </div>

          {/* Chat area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px' }}>
            {chatMsgs.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ marginBottom: 10, fontWeight: 600, color: '#64748b' }}>Suggested questions:</div>
                {[
                  `What systems is ${product.normalized_pn} compatible with?`,
                  `What are the typical use cases for this product?`,
                  `What is the typical network topology for this unit?`,
                  `What alternative PNs can replace this?`,
                  `What should I check before buying used ${product.brand} equipment?`,
                ].map(q => (
                  <div key={q} onClick={() => { setChatInput(q); }}
                    style={{ padding: '7px 10px', margin: '4px 0', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: '#475569', lineHeight: 1.4 }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#eff6ff'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'}>
                    {q}
                  </div>
                ))}
              </div>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '85%', padding: '9px 12px', borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px', background: m.role === 'user' ? '#1e40af' : '#f8fafc', color: m.role === 'user' ? 'white' : '#0f172a', fontSize: 12, lineHeight: 1.6, border: m.role === 'assistant' ? '1px solid #f1f5f9' : 'none' }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', gap: 4, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, width: 'fit-content', marginBottom: 8 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'pulse 1.2s infinite', animationDelay: `${i * 0.2}s` }} />)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder="Ask about specs, compatibility, topology..."
              style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f8fafc' }} />
            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
              style={{ padding: '8px 14px', background: chatLoading || !chatInput.trim() ? '#94a3b8' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
