"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

type Product = {
  id: string
  brand: string
  normalized_pn: string
  description: string | null
  lifecycle_status: string | null
  category: string | null
  datasheet_url: string | null
}

type Listing = {
  id: string
  company_id: string
  quantity: number
  price: number | null
  currency: string | null
  condition: string | null
  company_name?: string
}

type MarketStats = {
  seller_count: number
  buyer_count: number
  total_quantity: number
  min_price: number | null
  max_price: number | null
  avg_price: number | null
}

export default function ProductDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [product, setProduct] = useState<Product | null>(null)
  const [stats, setStats] = useState<MarketStats | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [contacting, setContacting] = useState<string | null>(null)

  useEffect(() => {
    if (id) load()
  }, [id])

  async function load() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single()
      if (profile) setMyCompanyId(profile.company_id)
    }

    const [{ data: p }, { data: marketStats }, { data: rawListings }] = await Promise.all([
      supabase.from("products").select("*").eq("id", id).single(),
      supabase.rpc("product_market_stats", { p_id: id }).maybeSingle(),
      supabase
        .from("listings")
        .select("id, company_id, quantity, price, currency, condition, companies(name)")
        .eq("product_id", id)
        .eq("status", "active")
        .order("price", { ascending: true }),
    ])

    const mappedListings: Listing[] = (rawListings || []).map((l: any) => ({
      ...l,
      company_name: l.companies?.name || "Unknown",
    }))

    setProduct(p)
    setStats(marketStats || null)
    setListings(mappedListings)
    setLoading(false)
  }

  async function handleContact(targetCompanyId: string) {
    if (!myCompanyId || myCompanyId === targetCompanyId) return
    setContacting(targetCompanyId)

    // ✅ Correct schema: company_a / company_b
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .or(
        `and(company_a.eq.${myCompanyId},company_b.eq.${targetCompanyId}),and(company_a.eq.${targetCompanyId},company_b.eq.${myCompanyId})`
      )
      .maybeSingle()

    if (!existing) {
      await supabase.from("conversations").insert({
        company_a: myCompanyId,
        company_b: targetCompanyId,
        product_id: id,
      })
    }

    setContacting(null)
    router.push("/dashboard/messages")
  }

  if (loading) return <div style={{ color: "#64748b", padding: 40 }}>Loading...</div>
  if (!product) return <div style={{ color: "#dc2626", padding: 40 }}>Product not found</div>

  return (
    <div style={{ maxWidth: 900 }}>
      <button
        onClick={() => router.back()}
        style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        ← Back
      </button>

      {/* Header */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{product.brand}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", fontFamily: "monospace", letterSpacing: "-0.02em" }}>
          {product.normalized_pn}
        </h1>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {product.category && (
            <span style={{ fontSize: 12, background: "#f1f5f9", color: "#64748b", padding: "3px 10px", borderRadius: 20 }}>
              {product.category}
            </span>
          )}
          {product.lifecycle_status && (
            <span style={{
              fontSize: 12,
              background: product.lifecycle_status === "active" ? "#f0fdf4" : "#fef2f2",
              color: product.lifecycle_status === "active" ? "#16a34a" : "#dc2626",
              padding: "3px 10px",
              borderRadius: 20,
            }}>
              {product.lifecycle_status}
            </span>
          )}
          {product.datasheet_url && (
            <a href={product.datasheet_url} target="_blank" style={{ fontSize: 12, color: "#2563eb" }}>
              📄 Datasheet
            </a>
          )}
        </div>
        {product.description && (
          <p style={{ fontSize: 13, color: "#64748b", margin: "12px 0 0", lineHeight: 1.6 }}>
            {product.description}
          </p>
        )}
      </div>

      {/* Market Stats */}
      {stats && (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Market Overview</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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

      {/* Active Listings */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Active Listings ({listings.length})
          </h2>
        </div>
        {listings.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            No active listings for this product.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Company", "Qty", "Condition", "Price", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listings.map(l => (
                <tr key={l.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{l.company_name}</td>
                  <td style={{ padding: "12px 16px", fontSize: 14, color: "#374151" }}>{l.quantity}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#64748b" }}>{l.condition || "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 14, color: "#0f172a" }}>
                    {l.price ? `${l.price} ${l.currency || "EUR"}` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {l.company_id === myCompanyId ? (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>Your listing</span>
                    ) : (
                      <button
                        onClick={() => handleContact(l.company_id)}
                        disabled={contacting === l.company_id}
                        style={{ padding: "5px 14px", background: "transparent", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                      >
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
  )
}
