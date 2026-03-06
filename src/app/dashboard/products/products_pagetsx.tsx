"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

type Product = {
  id: string
  brand: string
  normalized_pn: string
  category: string | null
}

export default function ProductsPage() {
  const router = useRouter()
  const [pn, setPn] = useState("")
  const [results, setResults] = useState<Product[]>([])
  const [mostListed, setMostListed] = useState<Product[]>([])
  const [recent, setRecent] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    loadSidebar()
  }, [])

  async function loadSidebar() {
    const { data: listings } = await supabase
      .from("listings")
      .select("product_id, quantity")
      .eq("status", "active")

    if (listings && listings.length > 0) {
      const grouped: Record<string, number> = {}
      listings.forEach(l => {
        grouped[l.product_id] = (grouped[l.product_id] || 0) + (l.quantity || 0)
      })
      const sortedIds = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([id]) => id)

      const { data: products } = await supabase
        .from("products")
        .select("id, brand, normalized_pn, category")
        .in("id", sortedIds)
      setMostListed(products || [])
    }

    const { data: recentProducts } = await supabase
      .from("products")
      .select("id, brand, normalized_pn, category")
      .order("created_at", { ascending: false })
      .limit(15)
    setRecent(recentProducts || [])
  }

  async function search() {
    const query = pn.trim()
    if (!query) return
    setLoading(true)
    setSearched(true)

    const { data } = await supabase
      .from("products")
      .select("id, brand, normalized_pn, category")
      .ilike("normalized_pn", `%${query.toUpperCase().replace(/[\s-]/g, "")}%`)
      .order("normalized_pn", { ascending: true })
      .limit(100)

    setResults(data || [])
    setLoading(false)
  }

  const ProductCard = ({ p }: { p: Product }) => (
    <div
      onClick={() => router.push(`/dashboard/products/${p.id}`)}
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        padding: "12px 16px",
        borderRadius: 8,
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>{p.brand}</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", fontFamily: "monospace" }}>{p.normalized_pn}</div>
        {p.category && p.category !== "unknown" && (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{p.category}</div>
        )}
      </div>
      <span style={{ color: "#94a3b8", fontSize: 16 }}>→</span>
    </div>
  )

  return (
    <div style={{ display: "flex", gap: 32 }}>
      {/* LEFT */}
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 24 }}>Products</h1>

        <div style={{ background: "white", padding: 20, borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <input
              placeholder="Search Part Number..."
              value={pn}
              onChange={e => setPn(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }}
            />
            <button
              onClick={search}
              disabled={loading}
              style={{ padding: "9px 20px", background: loading ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}
            >
              {loading ? "..." : "Search"}
            </button>
          </div>
        </div>

        {searched && results.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: 40, background: "white", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            No products found for <strong style={{ color: "#0f172a" }}>{pn}</strong>
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {results.map(p => <ProductCard key={p.id} p={p} />)}
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div style={{ width: 240, borderLeft: "1px solid #e2e8f0", paddingLeft: 24, flexShrink: 0 }}>
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Most Listed
          </h3>
          {mostListed.map(p => (
            <div
              key={p.id}
              onClick={() => router.push(`/dashboard/products/${p.id}`)}
              style={{ padding: "6px 0", fontSize: 13, cursor: "pointer", color: "#374151", fontFamily: "monospace", borderBottom: "1px solid #f8fafc" }}
            >
              {p.normalized_pn}
              <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6, fontFamily: "sans-serif" }}>{p.brand}</span>
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Recently Added
          </h3>
          {recent.map(p => (
            <div
              key={p.id}
              onClick={() => router.push(`/dashboard/products/${p.id}`)}
              style={{ padding: "6px 0", fontSize: 13, cursor: "pointer", color: "#374151", fontFamily: "monospace", borderBottom: "1px solid #f8fafc" }}
            >
              {p.normalized_pn}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
