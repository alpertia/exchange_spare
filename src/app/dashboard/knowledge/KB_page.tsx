"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

type Product = {
  id: string
  brand: string
  normalized_pn: string
  category: string | null
  lifecycle_status: string | null
  weight_kg: number | null
  dimensions_mm: string | null
  compatibility: string | null
}

export default function ProductsPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [pn, setPn] = useState("")
  const [results, setResults] = useState<Product[]>([])
  const [mostListed, setMostListed] = useState<Product[]>([])
  const [recent, setRecent] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [total, setTotal] = useState<number>(0)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setRole(p?.role || 'user')
    }
    loadSidebar()
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true })
    setTotal(count || 0)
  }

  async function loadSidebar() {
    const { data: listings } = await supabase.from("listings").select("product_id, quantity").eq("status", "active")
    if (listings?.length) {
      const grouped: Record<string, number> = {}
      listings.forEach(l => { grouped[l.product_id] = (grouped[l.product_id] || 0) + (l.quantity || 0) })
      const sortedIds = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id]) => id)
      const { data: products } = await supabase.from("products").select("id, brand, normalized_pn, category, lifecycle_status, weight_kg, dimensions_mm, compatibility").in("id", sortedIds)
      setMostListed(products || [])
    }
    const { data: recentProducts } = await supabase.from("products").select("id, brand, normalized_pn, category, lifecycle_status, weight_kg, dimensions_mm, compatibility").order("created_at", { ascending: false }).limit(15)
    setRecent(recentProducts || [])
  }

  async function search() {
    const query = pn.trim()
    if (!query) return
    setLoading(true); setSearched(true)
    const { data } = await supabase.from("products")
      .select("id, brand, normalized_pn, category, lifecycle_status, weight_kg, dimensions_mm, compatibility")
      .ilike("normalized_pn", `%${query.toUpperCase().replace(/[\s-]/g, "")}%`)
      .order("normalized_pn", { ascending: true }).limit(100)
    setResults(data || [])
    setLoading(false)
  }

  const LIFECYCLE_COLOR: Record<string, [string, string]> = {
    active:      ['#15803d', '#f0fdf4'],
    eol:         ['#dc2626', '#fef2f2'],
    discontinued:['#92400e', '#fffbeb'],
    unknown:     ['#94a3b8', '#f8fafc'],
  }

  function ProductCard({ p }: { p: Product }) {
    const [lc, lb] = LIFECYCLE_COLOR[(p.lifecycle_status || 'unknown').toLowerCase()] || ['#94a3b8', '#f8fafc']
    return (
      <div onClick={() => router.push(`/dashboard/knowledge/${p.id}`)}
        style={{ background: "white", border: "1px solid #e2e8f0", padding: "14px 16px", borderRadius: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: 'border-color 0.15s' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#bfdbfe'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{p.brand}</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", fontFamily: "monospace" }}>{p.normalized_pn}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {p.category && p.category !== "unknown" && (
              <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '1px 7px', borderRadius: 10 }}>{p.category}</span>
            )}
            {p.lifecycle_status && p.lifecycle_status !== 'unknown' && (
              <span style={{ fontSize: 10, background: lb, color: lc, padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>{p.lifecycle_status}</span>
            )}
            {p.weight_kg && <span style={{ fontSize: 10, color: '#94a3b8' }}>⚖ {p.weight_kg}kg</span>}
            {p.dimensions_mm && <span style={{ fontSize: 10, color: '#94a3b8' }}>📐 {p.dimensions_mm}</span>}
          </div>
        </div>
        <span style={{ color: "#94a3b8", fontSize: 16, flexShrink: 0 }}>→</span>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", gap: 32 }}>
      {/* LEFT */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: '0 0 2px' }}>Product Knowledge Base</h1>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{total.toLocaleString()} products in catalogue</div>
          </div>
          {(role === 'admin') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => router.push('/dashboard/product-upload')}
                style={{ padding: '7px 14px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                + Upload Catalogue
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ background: "white", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              placeholder="Search Part Number..."
              value={pn}
              onChange={e => setPn(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }}
            />
            <button onClick={search} disabled={loading}
              style={{ padding: "9px 20px", background: loading ? "#93c5fd" : "#1e40af", color: "white", border: "none", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
              {loading ? "..." : "Search"}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
            💡 Tip: Click any product to see specs, compatibility, topology and ask AI questions
          </div>
        </div>

        {searched && results.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: 40, background: "white", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            No products found for <strong style={{ color: "#0f172a" }}>{pn}</strong>
          </div>
        )}

        {!searched && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
            🔍 Search a part number above to find specs, compatibility info, and AI insights
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {results.map(p => <ProductCard key={p.id} p={p} />)}
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div style={{ width: 220, borderLeft: "1px solid #e2e8f0", paddingLeft: 24, flexShrink: 0 }}>
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Most Listed</h3>
          {mostListed.map(p => (
            <div key={p.id} onClick={() => router.push(`/dashboard/knowledge/${p.id}`)}
              style={{ padding: "6px 0", fontSize: 12, cursor: "pointer", color: "#374151", fontFamily: "monospace", borderBottom: "1px solid #f8fafc" }}>
              {p.normalized_pn}
              <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6, fontFamily: "sans-serif" }}>{p.brand}</span>
            </div>
          ))}
        </div>
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Recently Added</h3>
          {recent.map(p => (
            <div key={p.id} onClick={() => router.push(`/dashboard/knowledge/${p.id}`)}
              style={{ padding: "6px 0", fontSize: 12, cursor: "pointer", color: "#374151", fontFamily: "monospace", borderBottom: "1px solid #f8fafc" }}>
              {p.normalized_pn}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
