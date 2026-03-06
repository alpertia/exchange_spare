"use client"
import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

function normalizePN(pn: string) {
  return pn.toUpperCase().replace(/[\s\-.]/g, "").trim()
}

const inp = {
  width: "100%", padding: "9px 12px", borderRadius: "6px",
  border: "1px solid #e2e8f0", background: "#f8fafc",
  color: "#0f172a", fontSize: "14px", boxSizing: "border-box" as const, outline: "none",
}
const lbl = { color: "#64748b", fontSize: "12px", display: "block", marginBottom: "4px" }

export default function AddListingPage() {
  const router = useRouter()
  const [brand, setBrand] = useState("")
  const [partNumber, setPartNumber] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [condition, setCondition] = useState("used")
  const [country, setCountry] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState("")

  const handleSubmit = async () => {
    if (loading) return
    setLoading(true); setError(""); setStep("")

    const cleanBrand = brand.trim().toUpperCase()
    const cleanPN = normalizePN(partNumber)

    if (!cleanBrand) { setError("Brand is required"); setLoading(false); return }
    if (!cleanPN) { setError("Part Number is required"); setLoading(false); return }
    if (!quantity || quantity <= 0) { setError("Quantity must be > 0"); setLoading(false); return }

    setStep("Checking session...")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setError("Not logged in. Please sign in again."); setLoading(false); return }

    setStep("Loading profile...")
    const { data: profile, error: pErr } = await supabase
      .from("profiles").select("company_id").eq("id", session.user.id).single()
    if (pErr || !profile?.company_id) {
      setError("Company not found on profile. Make sure registration completed successfully.")
      setLoading(false); return
    }

    setStep("Checking product...")
    let productId: string
    const { data: existing } = await supabase
      .from("products").select("id").eq("normalized_pn", cleanPN).maybeSingle()

    if (existing) {
      productId = existing.id
    } else {
      setStep("Creating product...")
      const { data: newP, error: prodErr } = await supabase
        .from("products")
        .insert({ brand: cleanBrand, normalized_pn: cleanPN })
        .select("id").single()
      if (prodErr || !newP) { setError("Product error: " + (prodErr?.message || "unknown")); setLoading(false); return }
      productId = newP.id
    }

    setStep("Creating listing...")
    const { error: listingErr } = await supabase
      .from("listings")
      .insert({
        product_id: productId,
        company_id: profile.company_id,
        quantity: Number(quantity),
        price: price ? parseFloat(price) : null,
        currency,
        condition,
        country: country.trim() || null,
        notes: notes.trim() || null,
        status: "active",
      })

    if (listingErr) { setError("Listing error: " + listingErr.message); setLoading(false); return }

    setStep(""); router.push("/dashboard/listings")
  }

  return (
    <div style={{ maxWidth: "560px" }}>
      <h1 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", marginBottom: "24px" }}>Add Listing</h1>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          <div>
            <label style={lbl}>Part Number *</label>
            <input placeholder="e.g. WS-C2960X-48FPD-L" value={partNumber}
              onChange={e => setPartNumber(e.target.value)} style={inp} />
            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
              Normalized automatically — spaces/dashes removed, uppercase
            </div>
          </div>

          <div>
            <label style={lbl}>Brand *</label>
            <input placeholder="CISCO" value={brand}
              onChange={e => setBrand(e.target.value.toUpperCase())} style={inp} />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Quantity *</label>
              <input type="number" min="1" value={quantity}
                onChange={e => setQuantity(Number(e.target.value))} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Price (optional)</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={price} onChange={e => setPrice(e.target.value)}
                  style={{ ...inp, flex: 1, minWidth: 0 }} />
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  style={{ ...inp, width: "72px" }}>
                  <option>EUR</option><option>USD</option><option>GBP</option><option>TRY</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label style={lbl}>Condition</label>
            <select value={condition} onChange={e => setCondition(e.target.value)} style={inp}>
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="refurbished">Refurbished</option>
              <option value="tested & packed">Tested & Packed</option>
              <option value="spare">Spare / Pulled</option>
            </select>
          </div>

          <div>
            <label style={lbl}>Country</label>
            <input placeholder="e.g. Germany" value={country}
              onChange={e => setCountry(e.target.value)} style={inp} />
          </div>

          <div>
            <label style={lbl}>Notes</label>
            <input placeholder="Warranty, revision, packaging..." value={notes}
              onChange={e => setNotes(e.target.value)} style={inp} />
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", color: "#dc2626", fontSize: "13px" }}>
              ✕ {error}
            </div>
          )}

          {step && (
            <div style={{ padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", color: "#1e40af", fontSize: "12px" }}>
              ⟳ {step}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button onClick={() => router.back()}
              style={{ flex: 1, padding: "10px", background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={loading}
              style={{ flex: 2, padding: "10px", background: loading ? "#93c5fd" : "#1e40af", color: "white", border: "none", borderRadius: "6px", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "600" }}>
              {loading ? "Creating..." : "Create Listing"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
