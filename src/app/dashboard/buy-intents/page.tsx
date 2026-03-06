"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

type Intent = {
  id: string
  intent_type: string
  status: string
  quantity: number | null
  target_price: number | null
  notes: string | null
  created_at: string
  products: { normalized_pn: string; brand: string }
}

const inp = {
  padding: "9px 12px",
  borderRadius: "6px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#0f172a",
  fontSize: "14px",
  width: "100%",
  boxSizing: "border-box" as const,
  outline: "none",
}

export default function BuyIntentsPage() {
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)
  const [pn, setPn] = useState("")
  const [brand, setBrand] = useState("")
  const [quantity, setQuantity] = useState("")
  const [targetPrice, setTargetPrice] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    init()
  }, [])

  async function init() {
    // ✅ getUser() - secure
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single()

    if (!profile) return
    setMyCompanyId(profile.company_id)
    await fetchIntents(profile.company_id)
  }

  async function fetchIntents(companyId: string) {
    const { data } = await supabase
      .from("trade_intent")
      .select("*, products(normalized_pn, brand)")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
    setIntents((data as any) || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!myCompanyId) return
    setError("")

    const cleanPN = pn.trim().toUpperCase().replace(/[\s-]/g, "")
    if (!cleanPN) { setError("Part number is required"); return }

    setSubmitting(true)

    const { data: existingProduct } = await supabase
      .from("products")
      .select("id")
      .eq("normalized_pn", cleanPN)
      .maybeSingle()

    let productId: string
    if (existingProduct) {
      productId = existingProduct.id
    } else {
      const { data: newProduct, error: productError } = await supabase
        .from("products")
        .insert({ normalized_pn: cleanPN, brand: brand.trim() || "Unknown" })
        .select()
        .single()
      if (productError || !newProduct) {
        setError(productError?.message || "Failed to create product")
        setSubmitting(false)
        return
      }
      productId = newProduct.id
    }

    const { error: intentError } = await supabase.from("trade_intent").insert({
      company_id: myCompanyId,
      product_id: productId,
      intent_type: "buy",
      status: "active",
      quantity: quantity ? parseInt(quantity) : null,
      target_price: targetPrice ? parseFloat(targetPrice) : null,
      notes: notes.trim() || null,
    })

    if (intentError) {
      setError(intentError.message)
    } else {
      setShowForm(false)
      setPn(""); setBrand(""); setQuantity(""); setTargetPrice(""); setNotes("")
      await fetchIntents(myCompanyId)
    }
    setSubmitting(false)
  }

  async function handleDeactivate(id: string) {
    await supabase.from("trade_intent").update({ status: "inactive" }).eq("id", id)
    setIntents(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>Buy Intents</h1>
        <button
          onClick={() => { setShowForm(!showForm); setError("") }}
          style={{ padding: "8px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          {showForm ? "Cancel" : "+ New Intent"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#0f172a" }}>New Buy Intent</h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Part Number *</label>
              <input placeholder="e.g. WSC2960X48FPD" value={pn} onChange={e => setPn(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Brand</label>
              <input placeholder="e.g. Cisco" value={brand} onChange={e => setBrand(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Quantity</label>
              <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Target Price (EUR)</label>
              <input type="number" placeholder="Optional" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Notes</label>
            <input placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} style={inp} />
          </div>
          {error && (
            <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleAdd}
              disabled={submitting}
              style={{ padding: "9px 24px", background: submitting ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: submitting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}
            >
              {submitting ? "Saving..." : "Save Intent"}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Loading...</div>
        ) : intents.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            No active buy intents. Click "+ New Intent" to add one.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                {["Part Number", "Brand", "Qty", "Target Price", "Notes", "Date", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {intents.map(i => (
                <tr key={i.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a", fontSize: 13, fontFamily: "monospace" }}>
                    {i.products?.normalized_pn}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 13 }}>{i.products?.brand}</td>
                  <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: 13 }}>{i.quantity ?? "—"}</td>
                  <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: 13 }}>
                    {i.target_price ? `${i.target_price} EUR` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 13 }}>{i.notes ?? "—"}</td>
                  <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: 12 }}>
                    {new Date(i.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => handleDeactivate(i.id)}
                      style={{ padding: "4px 10px", background: "transparent", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
                    >
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
