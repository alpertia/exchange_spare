"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Product = {
  id: string
  brand: string
  normalized_pn: string
  category: string | null
  seller_count: number
  buyer_count: number
}

export default function SearchPage() {
  const router = useRouter()
  const [pn, setPn] = useState("")
  const [brand, setBrand] = useState("")
  const [category, setCategory] = useState("")
  const [filter, setFilter] = useState<"all" | "sellers" | "buyers">("all")
  const [dateRange, setDateRange] = useState<"all" | "week" | "month">("all")
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    setLoading(true)
    setSearched(true)

    let pQuery = supabase
      .from("products")
      .select("id, brand, normalized_pn, category")

    if (pn) pQuery = pQuery.ilike("normalized_pn", `%${pn}%`)
    if (brand) pQuery = pQuery.ilike("brand", `%${brand}%`)
    if (category) pQuery = pQuery.ilike("category", `%${category}%`)

    const { data: products, error } = await pQuery.limit(50)

    if (error || !products) {
      setLoading(false)
      return
    }

    const getDate = (range: string) => {
      const d = new Date()
      if (range === "week") d.setDate(d.getDate() - 7)
      if (range === "month") d.setMonth(d.getMonth() - 1)
      return d.toISOString()
    }

    const enriched = await Promise.all(
      products.map(async (p) => {
        let sQuery = supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .eq("product_id", p.id)
          .eq("status", "active")

        if (dateRange !== "all") {
          sQuery = sQuery.gte("created_at", getDate(dateRange))
        }

        const { count: sellerCount } = await sQuery

        let bQuery = supabase
          .from("trade_intent")
          .select("id", { count: "exact", head: true })
          .eq("product_id", p.id)
          .eq("status", "active")
          .eq("intent_type", "buy")

        if (dateRange !== "all") {
          bQuery = bQuery.gte("created_at", getDate(dateRange))
        }

        const { count: buyerCount } = await bQuery

        return {
          ...p,
          seller_count: sellerCount || 0,
          buyer_count: buyerCount || 0,
        }
      })
    )

    const filtered = enriched.filter((p) => {
      if (filter === "sellers") return p.seller_count > 0
      if (filter === "buyers") return p.buyer_count > 0
      return true
    })

    setResults(filtered)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b1120", color: "white", padding: "40px" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "26px", fontWeight: "bold", marginBottom: "28px" }}>Search</h1>

        <div style={{ background: "#1e293b", borderRadius: "12px", padding: "24px", marginBottom: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <input
              placeholder="Part Number"
              value={pn}
              onChange={(e) => setPn(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ flex: 1, minWidth: "180px", padding: "10px", borderRadius: "6px", border: "1px solid #334155", background: "#0f172a", color: "white" }}
            />
            <input
              placeholder="Brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ flex: 1, minWidth: "140px", padding: "10px", borderRadius: "6px", border: "1px solid #334155", background: "#0f172a", color: "white" }}
            />
            <input
              placeholder="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ flex: 1, minWidth: "140px", padding: "10px", borderRadius: "6px", border: "1px solid #334155", background: "#0f172a", color: "white" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {(["all", "sellers", "buyers"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{ padding: "6px 14px", borderRadius: "20px", border: "none", cursor: "pointer", background: filter === f ? "#2563eb" : "#334155", color: "white", fontSize: "13px" }}
              >
                {f === "all" ? "All" : f === "sellers" ? "Has Sellers" : "Has Buyers"}
              </button>
            ))}
            <div style={{ width: "1px", background: "#334155" }} />
            {(["all", "week", "month"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                style={{ padding: "6px 14px", borderRadius: "20px", border: "none", cursor: "pointer", background: dateRange === d ? "#7c3aed" : "#334155", color: "white", fontSize: "13px" }}
              >
                {d === "all" ? "All time" : d === "week" ? "Last 7 days" : "Last 30 days"}
              </button>
            ))}
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: "10px", background: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {searched && !loading && results.length === 0 && (
          <p style={{ color: "#475569" }}>No results found.</p>
        )}

        {results.map((p) => (
          <div
            key={p.id}
            onClick={() => router.push(`/products/${p.id}`)}
            style={{ background: "#1e293b", borderRadius: "10px", padding: "20px", marginBottom: "12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <p style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px" }}>{p.brand}</p>
              <p style={{ fontWeight: "bold", fontSize: "16px" }}>{p.normalized_pn}</p>
              {p.category && (
                <p style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>{p.category}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <span style={{ padding: "4px 12px", background: "#1d4ed8", borderRadius: "20px", fontSize: "13px" }}>
                {p.seller_count} sellers
              </span>
              <span style={{ padding: "4px 12px", background: "#15803d", borderRadius: "20px", fontSize: "13px" }}>
                {p.buyer_count} buyers
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
