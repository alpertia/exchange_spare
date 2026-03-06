"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type ParsedRow = {
  normalized_pn: string
  brand: string
  quantity: string
  condition: string
  country: string
}

type ImportTab = "csv" | "numbers" | "excel" | "auto"

const inp = {
  padding: "9px 12px", borderRadius: "6px", border: "1px solid #e2e8f0",
  background: "#f8fafc", color: "#0f172a", fontSize: "14px",
  width: "100%", boxSizing: "border-box" as const
}

function parseCSVText(text: string): ParsedRow[] {
  const lines = text.trim().split("\n").filter(l => l.trim())
  if (lines.length < 2) return []
  const delimiter = lines[0].includes(";") ? ";" : ","
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ""))
    const obj: any = {}
    headers.forEach((h, i) => (obj[h] = values[i] || ""))
    return {
      normalized_pn: obj.normalized_pn || obj.pn || obj["part number"] || obj.partnumber || "",
      brand: obj.brand || obj.manufacturer || obj.mfr || "",
      quantity: obj.quantity || obj.qty || obj.stock || "",
      condition: obj.condition || obj.cond || "",
      country: obj.country || obj.location || "",
    }
  }).filter(r => r.normalized_pn)
}

export default function CSVImportPage() {
  const [tab, setTab] = useState<ImportTab>("csv")
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("")
  const [newWarehouseName, setNewWarehouseName] = useState("")
  const [autoMethod, setAutoMethod] = useState<"webhook" | "sheets" | "ftp">("webhook")

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", session.user.id).single()
      if (!profile?.company_id) return
      setCompanyId(profile.company_id)
      const { data } = await supabase.from("warehouses").select("id, name").eq("company_id", profile.company_id)
      setWarehouses(data || [])
    }
    init()
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setDone(false); setError(""); setRows([])
    const ext = file.name.split(".").pop()?.toLowerCase()

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader()
      reader.onload = async ev => {
        try {
          // @ts-ignore
          const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs")
          const data = new Uint8Array(ev.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })
          const parsed: ParsedRow[] = json.map((row: any) => ({
            normalized_pn: String(row.normalized_pn || row.pn || row["Part Number"] || row.PN || ""),
            brand: String(row.brand || row.Brand || row.manufacturer || ""),
            quantity: String(row.quantity || row.Quantity || row.qty || ""),
            condition: String(row.condition || row.Condition || ""),
            country: String(row.country || row.Country || ""),
          })).filter(r => r.normalized_pn)
          if (parsed.length === 0) setError("No valid rows. Check headers: normalized_pn, brand, quantity")
          setRows(parsed)
        } catch { setError("Excel parse error. Try saving as CSV.") }
      }
      reader.readAsArrayBuffer(file)
    } else {
      // CSV or Numbers export (CSV format)
      const reader = new FileReader()
      reader.onload = ev => {
        const parsed = parseCSVText(ev.target?.result as string)
        if (parsed.length === 0) setError("No valid rows. Check headers: normalized_pn, brand, quantity")
        setRows(parsed)
      }
      reader.readAsText(file)
    }
  }

  function downloadSample() {
    const s = `normalized_pn,brand,quantity,condition,country\nABC123,Siemens,10,NEW,DE\nXYZ456,Huawei,5,USED,TR`
    const blob = new Blob([s], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "warehouse_sample.csv"; a.click()
  }

  async function handleImport() {
    if (!companyId) return
    setError("")
    if (!selectedWarehouseId) { setError("Select a warehouse"); return }
    if (selectedWarehouseId === "__new" && !newWarehouseName.trim()) { setError("Enter warehouse name"); return }
    if (rows.length === 0) { setError("No data to import"); return }
    setImporting(true)

    let warehouseId = selectedWarehouseId === "__new" ? "" : selectedWarehouseId
    if (!warehouseId) {
      const { data, error: wErr } = await supabase.from("warehouses")
        .insert({ company_id: companyId, name: newWarehouseName.trim() }).select().single()
      if (wErr || !data) { setError("Failed to create warehouse"); setImporting(false); return }
      warehouseId = data.id
      setWarehouses(prev => [...prev, { id: data.id, name: data.name }])
      setSelectedWarehouseId(data.id)
    }

    for (const row of rows) {
      const pn = row.normalized_pn.trim().toUpperCase().replace(/[\s-]/g, "")
      const qty = parseInt(row.quantity)
      if (!pn || !qty || qty <= 0) continue
      let productId: string
      const { data: existing } = await supabase.from("products").select("id").eq("normalized_pn", pn).maybeSingle()
      if (existing) { productId = existing.id }
      else {
        const { data: newP } = await supabase.from("products")
          .insert({ normalized_pn: pn, brand: row.brand || "Unknown" }).select().single()
        if (!newP) continue
        productId = newP.id
      }
      await supabase.from("warehouse_stock").upsert(
        { warehouse_id: warehouseId, product_id: productId, quantity: qty, condition: row.condition || null },
        { onConflict: "warehouse_id,product_id,condition" }
      )
    }
    setImporting(false); setDone(true); setRows([]); setFileName("")
  }

  const tabs = [
    { key: "csv" as ImportTab, label: "CSV", accept: ".csv", icon: "📄", hint: "Comma or semicolon separated" },
    { key: "numbers" as ImportTab, label: "Numbers", accept: ".csv", icon: "🔢", hint: "Export from Apple Numbers as CSV" },
    { key: "excel" as ImportTab, label: "Excel", accept: ".xlsx,.xls", icon: "📊", hint: ".xlsx or .xls files" },
    { key: "auto" as ImportTab, label: "⚡ Auto Sync", accept: "", icon: "", hint: "" },
  ]

  const activeTab = tabs.find(t => t.key === tab)!

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", margin: 0 }}>Warehouse Import</h1>
        <button onClick={downloadSample}
          style={{ padding: "8px 16px", background: "transparent", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: "#64748b" }}>
          Sample CSV
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: "white", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "4px", maxWidth: "640px" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setRows([]); setFileName(""); setError("") }}
            style={{ flex: 1, padding: "8px", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500", background: tab === t.key ? "#1e40af" : "transparent", color: tab === t.key ? "white" : "#64748b" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "auto" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "640px" }}>
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 16px" }}>Choose Sync Method</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { key: "webhook", label: "🔗 Webhook (Recommended)", desc: "Your WMS/ERP pushes inventory changes to a URL in real-time. Works with Zapier, Make.com, or custom HTTP POST. Zero manual effort, instant sync." },
                { key: "sheets", label: "📋 Google Sheets", desc: "Connect a Google Sheet. Non-technical team updates rows, system pulls on schedule (hourly/daily). No code needed." },
                { key: "ftp", label: "📁 FTP / SFTP Drop", desc: "Drop a CSV to a folder nightly. Classic B2B integration compatible with any legacy WMS that can export files." },
              ].map(m => (
                <div key={m.key} onClick={() => setAutoMethod(m.key as any)}
                  style={{ padding: "14px", border: `1px solid ${autoMethod === m.key ? "#1e40af" : "#e2e8f0"}`, borderRadius: "8px", cursor: "pointer", background: autoMethod === m.key ? "#eff6ff" : "white" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#0f172a", marginBottom: "4px" }}>{m.label}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>{m.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "16px" }}>
            <div style={{ fontWeight: "600", fontSize: "13px", color: "#92400e", marginBottom: "4px" }}>🚧 Coming Soon</div>
            <div style={{ fontSize: "12px", color: "#92400e" }}>Auto sync is in development. Use CSV/Numbers/Excel in the meantime. Contact us for early access or custom integrations.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "640px" }}>
          {activeTab.hint && (
            <div style={{ fontSize: "12px", color: "#94a3b8", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px" }}>
              {activeTab.icon} {activeTab.hint}
            </div>
          )}

          {/* WAREHOUSE */}
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 14px" }}>Warehouse</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <select value={selectedWarehouseId} onChange={e => { setSelectedWarehouseId(e.target.value); if (e.target.value !== "__new") setNewWarehouseName("") }} style={inp}>
                <option value="">Select warehouse...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                <option value="__new">+ New Warehouse</option>
              </select>
              {selectedWarehouseId === "__new" && (
                <input placeholder="New warehouse name" value={newWarehouseName} onChange={e => setNewWarehouseName(e.target.value)} style={inp} />
              )}
            </div>
          </div>

          {/* FILE */}
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 14px" }}>File</h3>
            <div style={{ border: "2px dashed #e2e8f0", borderRadius: "8px", padding: "32px", textAlign: "center", background: "#f8fafc" }}>
              <input type="file" accept={activeTab.accept} onChange={handleFile} style={{ display: "none" }} id="file-upload" key={tab} />
              <label htmlFor="file-upload" style={{ cursor: "pointer" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>{activeTab.icon || "📁"}</div>
                <div style={{ fontSize: "14px", fontWeight: "500", color: "#0f172a" }}>{fileName || `Select ${tab.toUpperCase()} file`}</div>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>{activeTab.accept}</div>
              </label>
            </div>
            {rows.length > 0 && (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "#f0fdf4", borderRadius: "6px", fontSize: "13px", color: "#15803d" }}>
                ✓ {rows.length} rows ready
              </div>
            )}
          </div>

          {/* PREVIEW */}
          {rows.length > 0 && (
            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", fontSize: "13px", fontWeight: "600" }}>Preview (first 5)</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8fafc" }}>
                  {["PN", "Brand", "Qty", "Condition", "Country"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: "500" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{rows.slice(0, 5).map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "600" }}>{r.normalized_pn}</td>
                    <td style={{ padding: "8px 14px", fontSize: "13px", color: "#64748b" }}>{r.brand}</td>
                    <td style={{ padding: "8px 14px", fontSize: "13px" }}>{r.quantity}</td>
                    <td style={{ padding: "8px 14px", fontSize: "13px", color: "#64748b" }}>{r.condition}</td>
                    <td style={{ padding: "8px 14px", fontSize: "13px", color: "#64748b" }}>{r.country}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {error && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>{error}</div>}
          {done && <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", color: "#15803d", fontSize: "13px" }}>✓ Import complete</div>}

          <button onClick={handleImport} disabled={importing || rows.length === 0}
            style={{ padding: "12px", background: importing || rows.length === 0 ? "#94a3b8" : "#1e40af", color: "white", border: "none", borderRadius: "8px", cursor: importing || rows.length === 0 ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "600" }}>
            {importing ? "Importing..." : `Import${rows.length > 0 ? ` (${rows.length} rows)` : ""}`}
          </button>
        </div>
      )}
    </div>
  )
}
