"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

type SellerRow = {
  id: string; pn: string; brand: string; company: string; company_id: string
  quantity: number; price?: number | null; currency?: string | null
  condition?: string | null; country?: string | null
}
type BuyerRow = {
  id: string; pn: string; brand: string; company: string; company_id: string
  quantity: number; price?: number | null
}

export default function MarketplacePage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [allSellers, setAllSellers] = useState<SellerRow[]>([])
  const [allBuyers, setAllBuyers] = useState<BuyerRow[]>([])
  const [sellers, setSellers] = useState<SellerRow[]>([])
  const [buyers, setBuyers] = useState<BuyerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [contacting, setContacting] = useState<string | null>(null)
  const myCompanyIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: p } = await supabase.from("profiles").select("company_id").eq("id", session.user.id).single()
        if (p?.company_id) myCompanyIdRef.current = p.company_id
      }
      await loadAll()
    }
    init()
  }, [])

  async function loadAll() {
    setLoading(true); setLoadError("")

    // Note: trade_intent may not have currency column in older DB installs
    // Select only columns that definitely exist
    const [{ data: listingRows, error: lErr }, { data: buyerRows, error: bErr }] = await Promise.all([
      supabase
        .from("listings")
        .select("id, quantity, price, currency, condition, country, company_id, companies(name), products(normalized_pn, brand)")
        .eq("status", "active")
        .order("quantity", { ascending: false }),
      supabase
        .from("trade_intent")
        .select("id, quantity, target_price, company_id, companies(name), products(normalized_pn, brand)")
        .eq("status", "active")
        .eq("intent_type", "buy")
        .order("quantity", { ascending: false }),
    ])

    if (lErr) { setLoadError(lErr.message); setLoading(false); return }
    if (bErr) { setLoadError(bErr.message); setLoading(false); return }

    const s: SellerRow[] = (listingRows || []).map((r: any) => ({
      id: r.id, pn: r.products?.normalized_pn || "", brand: r.products?.brand || "",
      company: r.companies?.name || "Unknown", company_id: r.company_id,
      quantity: r.quantity, price: r.price, currency: r.currency,
      condition: r.condition, country: r.country,
    }))
    const b: BuyerRow[] = (buyerRows || []).map((r: any) => ({
      id: r.id, pn: r.products?.normalized_pn || "", brand: r.products?.brand || "",
      company: r.companies?.name || "Unknown", company_id: r.company_id,
      quantity: r.quantity, price: r.target_price,
    }))

    setAllSellers(s); setSellers(s)
    setAllBuyers(b); setBuyers(b)
    setLoading(false)
  }

  function handleSearch(q: string) {
    setQuery(q)
    if (!q.trim()) { setSellers(allSellers); setBuyers(allBuyers); return }
    const n = q.toUpperCase().replace(/[\s-]/g, "")
    setSellers(allSellers.filter(s => s.pn.includes(n) || s.brand.toUpperCase().includes(n) || s.company.toUpperCase().includes(n)))
    setBuyers(allBuyers.filter(b => b.pn.includes(n) || b.brand.toUpperCase().includes(n) || b.company.toUpperCase().includes(n)))
  }

  async function handleContact(targetCompanyId: string) {
    if (!myCompanyIdRef.current) { router.push("/login"); return }
    if (myCompanyIdRef.current === targetCompanyId) return
    setContacting(targetCompanyId)
    const myId = myCompanyIdRef.current
    const { data: ex } = await supabase.from("conversations").select("id")
      .or(`and(company_a.eq.${myId},company_b.eq.${targetCompanyId}),and(company_a.eq.${targetCompanyId},company_b.eq.${myId})`).maybeSingle()
    if (!ex) await supabase.from("conversations").insert({ company_a: myId, company_b: targetCompanyId })
    setContacting(null); router.push("/dashboard/messages")
  }

  function CondBadge({ c }: { c?: string | null }) {
    if (!c) return null
    const m: Record<string, [string, string]> = {
      new: ["#15803d", "#f0fdf4"], used: ["#92400e", "#fffbeb"],
      refurbished: ["#1d4ed8", "#eff6ff"], "tested & packed": ["#6d28d9", "#f5f3ff"], spare: ["#0f766e", "#f0fdfa"]
    }
    const [color, bg] = m[c.toLowerCase()] || ["#64748b", "#f1f5f9"]
    return <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: bg, color, fontWeight: 500 }}>{c}</span>
  }

  if (loadError) return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", marginBottom: "16px" }}>Marketplace</h1>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "20px", color: "#dc2626", fontSize: "13px" }}>
        {loadError}
        <button onClick={loadAll} style={{ marginLeft: "12px", padding: "4px 10px", background: "white", border: "1px solid #fecaca", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>Retry</button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", margin: 0 }}>Marketplace</h1>
        {!loading && <span style={{ fontSize: "13px", color: "#94a3b8" }}>{allSellers.length} available · {allBuyers.length} wanted</span>}
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", padding: "14px 20px", borderRadius: "10px", marginBottom: "24px" }}>
        <input placeholder="Filter by part number, brand or company..." value={query}
          onChange={e => handleSearch(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "14px", boxSizing: "border-box", outline: "none" }} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Loading marketplace...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: "0 24px" }}>

          <div>
            <div style={{ fontSize: "12px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>Available ({sellers.length})</div>
            {sellers.length === 0
              ? <div style={{ color: "#94a3b8", fontSize: "14px", padding: "20px 0" }}>No listings yet. Be the first — Add Listing.</div>
              : sellers.map(s => (
                <div key={s.id} style={{ padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "3px" }}>
                        <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>{s.pn}</span>
                        <CondBadge c={s.condition} />
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {s.brand} · <strong style={{ color: "#475569" }}>{s.company}</strong>
                        {s.country ? ` · ${s.country}` : ""} · {s.quantity} units
                        {s.price != null ? <> · <strong style={{ color: "#0f172a" }}>{s.price} {s.currency || "EUR"}</strong></> : null}
                      </div>
                    </div>
                    {s.company_id !== myCompanyIdRef.current && (
                      <button onClick={() => handleContact(s.company_id)} disabled={contacting === s.company_id}
                        style={{ padding: "5px 12px", background: "transparent", color: "#1e40af", border: "1px solid #bfdbfe", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "500", flexShrink: 0 }}>
                        {contacting === s.company_id ? "..." : "Contact"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>

          <div style={{ background: "#e2e8f0" }} />

          <div>
            <div style={{ fontSize: "12px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>Wanted ({buyers.length})</div>
            {buyers.length === 0
              ? <div style={{ color: "#94a3b8", fontSize: "14px", padding: "20px 0" }}>No buy requests yet.</div>
              : buyers.map(b => (
                <div key={b.id} style={{ padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px", marginBottom: "3px" }}>{b.pn}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {b.brand} · <strong style={{ color: "#475569" }}>{b.company}</strong> · {b.quantity} units
                        {b.price != null ? <> · Target <strong style={{ color: "#0f172a" }}>{b.price} EUR</strong></> : null}
                      </div>
                    </div>
                    {b.company_id !== myCompanyIdRef.current && (
                      <button onClick={() => handleContact(b.company_id)} disabled={contacting === b.company_id}
                        style={{ padding: "5px 12px", background: "transparent", color: "#1e40af", border: "1px solid #bfdbfe", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "500", flexShrink: 0 }}>
                        {contacting === b.company_id ? "..." : "Contact"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
