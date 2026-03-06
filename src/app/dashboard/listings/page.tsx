"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Listing = {
  id: string
  quantity: number
  price: number | null
  currency: string | null
  condition: string | null
  country: string | null
  status: string
  product_id: string
  products: { normalized_pn: string; brand: string }
}

const inputStyle = {
  padding: "9px 12px",
  borderRadius: "6px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  fontSize: "14px",
  width: "100%",
  boxSizing: "border-box" as const
}

export default function ListingsPage() {
  const router = useRouter()

  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [pn, setPn] = useState("")
  const [brand, setBrand] = useState("")
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState("")
  const [condition, setCondition] = useState("")
  const [country, setCountry] = useState("")

  const [submitting, setSubmitting] = useState(false)

  async function getCompanyId() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", session.user.id)
      .single()

    return profile?.company_id || null
  }

  async function fetchListings() {
    setLoading(true)

    const companyId = await getCompanyId()
    if (!companyId) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from("listings")
      .select("*, products(normalized_pn, brand)")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("created_at", { ascending: false })

    setListings(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    setSubmitting(true)

    const companyId = await getCompanyId()
    if (!companyId) {
      setSubmitting(false)
      return
    }

    const cleanPN = pn.trim().toLowerCase()
    if (!cleanPN || !brand.trim() || !quantity) {
      alert("PN, brand and quantity are required.")
      setSubmitting(false)
      return
    }

    // Find or create product
    let productId: string

    const { data: existingProduct } = await supabase
      .from("products")
      .select("id")
      .eq("normalized_pn", cleanPN)
      .maybeSingle()

    if (existingProduct) {
      productId = existingProduct.id
    } else {
      const { data: newProduct, error } = await supabase
        .from("products")
        .insert({
          normalized_pn: cleanPN,
          brand: brand.trim()
        })
        .select("id")
        .single()

      if (error || !newProduct) {
        alert(error?.message)
        setSubmitting(false)
        return
      }

      productId = newProduct.id
    }

    const { error } = await supabase
      .from("listings")
      .upsert({
        product_id: productId,
        company_id: companyId,
        quantity: parseInt(quantity),
        price: price ? parseFloat(price) : null,
        condition: condition || null,
        country: country || null,
        currency: "EUR",
        status: "active"
      }, {
        onConflict: "product_id,company_id"
      })

    if (error) {
      alert(error.message)
    } else {
      setShowForm(false)
      setPn("")
      setBrand("")
      setQuantity("")
      setPrice("")
      setCondition("")
      setCountry("")
      fetchListings()
    }

    setSubmitting(false)
  }

  async function handleDelete(id: string) {
    await supabase
      .from("listings")
      .update({ status: "inactive" })
      .eq("id", id)

    fetchListings()
  }

  useEffect(() => {
    fetchListings()
  }, [])

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>My SELL Listings</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "8px 16px",
            background: "#1e40af",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer"
          }}
        >
          {showForm ? "Cancel" : "+ New Listing"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "white", padding: 20, borderRadius: 10, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input placeholder="Part Number" value={pn} onChange={e => setPn(e.target.value)} style={inputStyle} />
            <input placeholder="Brand" value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input type="number" placeholder="Quantity" value={quantity} onChange={e => setQuantity(e.target.value)} style={inputStyle} />
            <input type="number" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)} style={inputStyle} />
            <input placeholder="Condition" value={condition} onChange={e => setCondition(e.target.value)} style={inputStyle} />
            <input placeholder="Country" value={country} onChange={e => setCountry(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button
              onClick={handleAdd}
              disabled={submitting}
              style={{
                padding: "8px 20px",
                background: "#1e40af",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer"
              }}
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: "white", borderRadius: 10 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
        ) : listings.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>No listings yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Part No", "Brand", "Qty", "Price", "Condition", "Country", ""].map(h => (
                  <th key={h} style={{ padding: 12, textAlign: "left", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listings.map(l => (
                <tr key={l.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 12 }}>{l.products?.normalized_pn}</td>
                  <td style={{ padding: 12 }}>{l.products?.brand}</td>
                  <td style={{ padding: 12 }}>{l.quantity}</td>
                  <td style={{ padding: 12 }}>
                    {l.price ? `${l.price} ${l.currency || ""}` : "—"}
                  </td>
                  <td style={{ padding: 12 }}>{l.condition || "—"}</td>
                  <td style={{ padding: 12 }}>{l.country || "—"}</td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleDelete(l.id)}
                      style={{
                        background: "transparent",
                        color: "#ef4444",
                        border: "none",
                        cursor: "pointer"
                      }}
                    >
                      Delete
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