"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Trend = {
  product_id: string; pn: string; brand: string
  seller_count: number; buyer_count: number; total_qty: number
  min_price: number; max_price: number; avg_price: number
  spread: number; direction: "up" | "down" | "stable" | null; demand: "high" | "medium" | "low"
  last_tx_price: number | null; last_tx_date: string | null
}

type MyStats = { listings: number; intents: number; deals: number; value: number }

export default function AnalyticsPage() {
  const [trends, setTrends] = useState<Trend[]>([])
  const [myStats, setMyStats] = useState<MyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [filter, setFilter] = useState<"all" | "rising" | "falling" | "high_demand">("all")
  const [sort, setSort] = useState<"spread" | "demand" | "qty" | "price">("spread")

  useEffect(() => { init() }, [])

  async function init() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const companyId = session
        ? (await supabase.from("profiles").select("company_id").eq("id", session.user.id).single()).data?.company_id
        : null

      const [{ data: allListings, error: lErr }, { data: allIntents }, { data: allTxs }] = await Promise.all([
        supabase.from("listings").select("product_id, price, quantity, company_id, products(normalized_pn, brand)").eq("status", "active"),
        supabase.from("trade_intent").select("product_id, company_id").eq("status", "active").eq("intent_type", "buy"),
        supabase.from("transactions").select("product_id, price, created_at, company_id, quantity, status")
          .in("status", ["delivered", "completed"]).not("price", "is", null)
          .order("created_at", { ascending: false }).limit(1000),
      ])

      if (lErr) { setLoadError("Data load error: " + lErr.message); setLoading(false); return }

      // My stats
      if (companyId) {
        const myL = (allListings || []).filter((l: any) => l.company_id === companyId)
        const myI = (allIntents || []).filter((i: any) => i.company_id === companyId)
        const myT = (allTxs || []).filter((t: any) => t.company_id === companyId)
        const value = myT.reduce((s: number, t: any) => s + (t.quantity || 0) * (t.price || 0), 0)
        setMyStats({ listings: myL.length, intents: myI.length, deals: myT.length, value })
      }

      // Market trends
      const pMap: Record<string, { pn: string; brand: string; prices: number[]; qtys: number[]; sellers: Set<string>; buyers: Set<string> }> = {}

      for (const l of (allListings || []) as any[]) {
        if (!l.price) continue
        if (!pMap[l.product_id]) pMap[l.product_id] = {
          pn: l.products?.normalized_pn || "", brand: l.products?.brand || "",
          prices: [], qtys: [], sellers: new Set(), buyers: new Set(),
        }
        pMap[l.product_id].prices.push(Number(l.price))
        pMap[l.product_id].qtys.push(Number(l.quantity))
        pMap[l.product_id].sellers.add(l.company_id)
      }

      for (const i of (allIntents || []) as any[]) {
        if (pMap[i.product_id]) pMap[i.product_id].buyers.add(i.company_id)
      }

      const lastTxMap: Record<string, { price: number; date: string }> = {}
      for (const t of (allTxs || []) as any[]) {
        if (!lastTxMap[t.product_id]) lastTxMap[t.product_id] = { price: Number(t.price), date: t.created_at }
      }

      const result: Trend[] = Object.entries(pMap)
        .filter(([, v]) => v.prices.length > 0)
        .map(([pid, v]) => {
          const min = Math.min(...v.prices), max = Math.max(...v.prices)
          const avg = v.prices.reduce((a, b) => a + b, 0) / v.prices.length
          const totalQty = v.qtys.reduce((a, b) => a + b, 0)
          const spread = max > 0 ? Math.round(((max - min) / avg) * 100) : 0
          const bc = v.buyers.size, sc = v.sellers.size
          const dr = bc / (sc || 1)
          const demand: Trend["demand"] = dr >= 0.7 ? "high" : dr >= 0.3 ? "medium" : "low"
          const tx = lastTxMap[pid]
          let direction: Trend["direction"] = null
          if (tx) { const pct = ((avg - tx.price) / tx.price) * 100; direction = Math.abs(pct) < 2 ? "stable" : pct > 0 ? "up" : "down" }
          return {
            product_id: pid, pn: v.pn, brand: v.brand,
            seller_count: sc, buyer_count: bc, total_qty: totalQty,
            min_price: +min.toFixed(2), max_price: +max.toFixed(2), avg_price: +avg.toFixed(2),
            spread, demand, direction,
            last_tx_price: tx?.price ?? null, last_tx_date: tx?.date ?? null,
          }
        })

      setTrends(result)
    } catch (e: any) {
      setLoadError(e?.message || "Unknown error")
    }
    setLoading(false)
  }

  const displayed = trends
    .filter(t => filter === "rising" ? t.direction === "up" : filter === "falling" ? t.direction === "down" : filter === "high_demand" ? t.demand === "high" : true)
    .sort((a, b) =>
      sort === "spread" ? b.spread - a.spread :
      sort === "demand" ? (b.buyer_count / (b.seller_count || 1)) - (a.buyer_count / (a.seller_count || 1)) :
      sort === "qty" ? b.total_qty - a.total_qty :
      b.avg_price - a.avg_price
    )

  const dc = (d: Trend["demand"]) =>
    d === "high" ? ["#dc2626", "#fef2f2"] : d === "medium" ? ["#b45309", "#fffbeb"] : ["#94a3b8", "#f8fafc"]

  const dir = (d: Trend["direction"]) =>
    d === "up" ? <span style={{ color: "#dc2626", fontWeight: 600, fontSize: "12px" }}>↑ Rising</span> :
    d === "down" ? <span style={{ color: "#15803d", fontWeight: 600, fontSize: "12px" }}>↓ Falling</span> :
    d === "stable" ? <span style={{ color: "#94a3b8", fontSize: "12px" }}>→ Stable</span> :
    <span style={{ color: "#e2e8f0" }}>—</span>

  if (loading) return <div style={{ padding: "40px", color: "#94a3b8" }}>Loading analytics...</div>
  if (loadError) return <div style={{ padding: "40px", color: "#ef4444", fontSize: "14px" }}>Error: {loadError}</div>

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", marginBottom: "24px" }}>Analytics</h1>

      {myStats && (
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>My Activity</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px" }}>
            {[
              { label: "Active Listings", value: myStats.listings, icon: "📦" },
              { label: "Buy Intents", value: myStats.intents, icon: "🛒" },
              { label: "Completed Deals", value: myStats.deals, icon: "✅" },
              { label: "Total Sold", value: `€${myStats.value.toLocaleString()}`, icon: "💰" },
            ].map(s => (
              <div key={s.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ fontSize: "20px", marginBottom: "6px" }}>{s.icon}</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>{s.value}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
          Market Intelligence · {trends.length} products tracked
        </div>

        {trends.length === 0 ? (
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "48px 40px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>📊</div>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "#0f172a", marginBottom: "8px" }}>No market data yet</div>
            <div style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "320px", margin: "0 auto" }}>
              Market intelligence appears once companies add priced listings.
              Add a listing with a price to see trends, demand signals, and price spreads.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
              {[{ k: "all", l: "All" }, { k: "high_demand", l: "🔥 Hot" }, { k: "rising", l: "↑ Rising" }, { k: "falling", l: "↓ Falling" }]
                .map(f => (
                  <button key={f.k} onClick={() => setFilter(f.k as any)}
                    style={{ padding: "4px 12px", borderRadius: "20px", border: "1px solid", cursor: "pointer", fontSize: "12px", fontWeight: "500",
                      borderColor: filter === f.k ? "#1e40af" : "#e2e8f0",
                      background: filter === f.k ? "#eff6ff" : "white",
                      color: filter === f.k ? "#1e40af" : "#64748b" }}>
                    {f.l}
                  </button>
                ))}
              <select value={sort} onChange={e => setSort(e.target.value as any)}
                style={{ marginLeft: "auto", padding: "4px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "12px", color: "#64748b", background: "white" }}>
                <option value="spread">Sort: Spread</option>
                <option value="demand">Sort: Demand</option>
                <option value="qty">Sort: Qty</option>
                <option value="price">Sort: Price</option>
              </select>
            </div>

            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                    {["Part No", "Brand", "Sell", "Buy", "Min €", "Avg €", "Max €", "Spread", "Trend", "Demand"].map(h => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(t => {
                    const [dColor, dBg] = dc(t.demand)
                    return (
                      <tr key={t.product_id} style={{ borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "white"}>
                        <td style={{ padding: "10px 12px", fontWeight: "700", color: "#0f172a", fontSize: "13px" }}>{t.pn}</td>
                        <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "13px" }}>{t.brand}</td>
                        <td style={{ padding: "10px 12px", color: "#0f172a", fontSize: "13px", textAlign: "center" }}>{t.seller_count}</td>
                        <td style={{ padding: "10px 12px", color: "#0f172a", fontSize: "13px", textAlign: "center" }}>{t.buyer_count}</td>
                        <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "13px" }}>{t.min_price}</td>
                        <td style={{ padding: "10px 12px", fontWeight: "600", color: "#0f172a", fontSize: "13px" }}>{t.avg_price}</td>
                        <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "13px" }}>{t.max_price}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontWeight: "700", fontSize: "12px", color: t.spread > 30 ? "#dc2626" : t.spread > 15 ? "#b45309" : "#15803d" }}>{t.spread}%</span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>{dir(t.direction)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: dBg, color: dColor, fontWeight: "600", textTransform: "capitalize" }}>{t.demand}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
