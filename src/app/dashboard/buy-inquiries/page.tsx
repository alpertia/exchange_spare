"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

type Inquiry = {
  id: string
  status: string
  quantity: number | null
  target_price: number | null
  target_currency: string | null
  notes: string | null
  created_at: string
  products: { normalized_pn: string; brand: string | null } | null
}

const inp = {
  padding: "9px 12px", borderRadius: "6px", border: "1px solid #e2e8f0",
  background: "white", color: "#0f172a", fontSize: "13px",
  width: "100%", boxSizing: "border-box" as const, outline: "none",
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  active:   { label: "Active",  bg: "#f0fdf4", color: "#15803d" },
  paused:   { label: "Paused",  bg: "#fffbeb", color: "#92400e" },
  closed:   { label: "Closed",  bg: "#f1f5f9", color: "#64748b" },
  inactive: { label: "Closed",  bg: "#f1f5f9", color: "#64748b" },
}

const CURRENCIES = ["EUR", "USD", "GBP", "AED", "CHF"]

export default function MyInquiriesPage() {
  const [inquiries, setInquiries]       = useState<Inquiry[]>([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [myCompanyId, setMyCompanyId]   = useState<string | null>(null)
  const [filter, setFilter]             = useState<'all' | 'active' | 'paused' | 'closed'>('active')
  const [selected, setSelected]         = useState<Inquiry | null>(null)

  // Form
  const [pn, setPn]                     = useState("")
  const [brand, setBrand]               = useState("")
  const [quantity, setQuantity]         = useState("")
  const [targetPrice, setTargetPrice]   = useState("")
  const [currency, setCurrency]         = useState("EUR")
  const [notes, setNotes]               = useState("")
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState("")

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single()
    if (!profile) return
    setMyCompanyId(profile.company_id)
    await fetchInquiries(profile.company_id)
  }

  async function fetchInquiries(companyId: string) {
    setLoading(true)
    const { data } = await supabase
      .from("trade_intent")
      .select("*, products(normalized_pn, brand)")
      .eq("company_id", companyId)
      .eq("intent_type", "buy")
      .in("status", ["active", "paused", "closed", "inactive"])
      .order("created_at", { ascending: false })
    setInquiries((data as any) || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!myCompanyId) return
    setError("")
    const cleanPN = pn.trim().toUpperCase().replace(/\s+/g, "")
    if (!cleanPN) { setError("Part number is required"); return }
    setSubmitting(true)

    const { data: existing } = await supabase.from("products").select("id").eq("normalized_pn", cleanPN).maybeSingle()
    let productId = existing?.id
    if (!productId) {
      const { data: newProd, error: pe } = await supabase.from("products")
        .insert({ normalized_pn: cleanPN, brand: brand.trim() || "Unknown" }).select().single()
      if (pe || !newProd) { setError(pe?.message || "Failed"); setSubmitting(false); return }
      productId = newProd.id
    }

    const { error: ie } = await supabase.from("trade_intent").insert({
      company_id: myCompanyId, product_id: productId, intent_type: "buy", status: "active",
      quantity: quantity ? parseInt(quantity) : null,
      target_price: targetPrice ? parseFloat(targetPrice) : null,
      target_currency: currency,
      notes: notes.trim() || null,
    })

    if (ie) { setError(ie.message) } else {
      setShowForm(false)
      setPn(""); setBrand(""); setQuantity(""); setTargetPrice(""); setNotes("")
      await fetchInquiries(myCompanyId)
    }
    setSubmitting(false)
  }

  async function updateStatus(id: string, newStatus: 'active' | 'paused' | 'closed') {
    await supabase.from("trade_intent").update({ status: newStatus }).eq("id", id)
    setInquiries(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: newStatus } : null)
  }

  const filtered = inquiries.filter(i => {
    if (filter === 'all') return true
    if (filter === 'closed') return i.status === 'closed' || i.status === 'inactive'
    return i.status === filter
  })

  const counts = {
    all: inquiries.length,
    active: inquiries.filter(i => i.status === 'active').length,
    paused: inquiries.filter(i => i.status === 'paused').length,
    closed: inquiries.filter(i => i.status === 'closed' || i.status === 'inactive').length,
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 4px", letterSpacing: "-0.03em" }}>
            🔍 My Inquiries
          </h1>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Parts you are looking to buy</div>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError("") }}
          style={{ padding: "9px 18px", background: showForm ? "#f1f5f9" : "#0f172a", color: showForm ? "#64748b" : "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          {showForm ? "Cancel" : "+ New Inquiry"}
        </button>
      </div>

      {/* New Inquiry Form */}
      {showForm && (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>New Buy Inquiry</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 600 }}>Part Number *</label>
              <input placeholder="e.g. 7750-SR-12" value={pn} onChange={e => setPn(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 600 }}>Brand</label>
              <input placeholder="Nokia, Cisco..." value={brand} onChange={e => setBrand(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 600 }}>Quantity</label>
              <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 2fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 600 }}>Target Price</label>
              <input type="number" placeholder="Optional" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 600 }}>Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={inp}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 600 }}>Notes</label>
              <input placeholder="Condition, urgency, alternatives accepted..." value={notes} onChange={e => setNotes(e.target.value)} style={inp} />
            </div>
          </div>
          {error && <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleAdd} disabled={submitting}
              style={{ padding: "9px 24px", background: submitting ? "#94a3b8" : "#0f172a", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              {submitting ? "Saving..." : "Post Inquiry"}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
        {(['all', 'active', 'paused', 'closed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "8px 16px", fontSize: 12, fontWeight: filter === f ? 600 : 400,
            color: filter === f ? "#0f172a" : "#64748b", background: "none", border: "none",
            borderBottom: filter === f ? "2px solid #0f172a" : "2px solid transparent",
            cursor: "pointer", marginBottom: -1, textTransform: "capitalize",
          }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ marginLeft: 6, fontSize: 10, background: "#f1f5f9", color: "#64748b", padding: "1px 6px", borderRadius: 10 }}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          {filter === 'active' ? 'No active inquiries. Click "+ New Inquiry" to post one.' : `No ${filter} inquiries.`}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(inq => {
            const sc = STATUS_CONFIG[inq.status] || STATUS_CONFIG.active
            const isSelected = selected?.id === inq.id
            return (
              <div key={inq.id} onClick={() => setSelected(isSelected ? null : inq)}
                style={{ background: "white", border: `1px solid ${isSelected ? '#0f172a' : '#e2e8f0'}`, borderRadius: 10, padding: "14px 18px", cursor: "pointer", transition: "border-color 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {/* PN */}
                  <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14, color: "#0f172a", minWidth: 140 }}>
                    {inq.products?.normalized_pn || "—"}
                  </span>
                  {/* Brand */}
                  {inq.products?.brand && (
                    <span style={{ fontSize: 11, background: "#eff6ff", color: "#2563eb", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>
                      {inq.products.brand}
                    </span>
                  )}
                  {/* Status */}
                  <span style={{ fontSize: 11, background: sc.bg, color: sc.color, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                    {sc.label}
                  </span>
                  {/* Qty & Price */}
                  <span style={{ fontSize: 12, color: "#64748b", marginLeft: "auto" }}>
                    {inq.quantity ? `×${inq.quantity}` : ""}{" "}
                    {inq.target_price ? `· ${inq.target_price} ${inq.target_currency || "EUR"}` : ""}
                  </span>
                  {/* Date */}
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {new Date(inq.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                {inq.notes && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, paddingTop: 6, borderTop: "1px solid #f1f5f9" }}>{inq.notes}</div>
                )}

                {/* Expanded actions */}
                {isSelected && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}
                    onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: 12, color: "#64748b", alignSelf: "center", marginRight: 4 }}>Set status:</span>
                    {inq.status !== 'active' && (
                      <button onClick={() => updateStatus(inq.id, 'active')}
                        style={{ padding: "5px 12px", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        ▶ Active
                      </button>
                    )}
                    {inq.status !== 'paused' && (
                      <button onClick={() => updateStatus(inq.id, 'paused')}
                        style={{ padding: "5px 12px", background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        ⏸ Pause
                      </button>
                    )}
                    {inq.status !== 'closed' && inq.status !== 'inactive' && (
                      <button onClick={() => updateStatus(inq.id, 'closed')}
                        style={{ padding: "5px 12px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        ✕ Close — Found / No longer needed
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
