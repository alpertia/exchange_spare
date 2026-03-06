"use client"
import { useEffect, useState, useRef } from "react"
import Papa from "papaparse"
import { supabase } from "@/lib/supabase/client"

type CSVRow = {
  brand: string
  part_number: string
  description: string
  warehouse: string
  quantity: string
  condition: string
  _row: number
  _error?: string
}
type ImportResult = { success: number; skipped: number; errors: string[] }

function normalizePN(pn: string) {
  return pn.toUpperCase().replace(/[\s\-]/g, "").trim()
}
function validateRows(rows: CSVRow[]): CSVRow[] {
  return rows.map((r, i) => {
    const errors: string[] = []
    if (!r.brand?.trim()) errors.push("Brand missing")
    if (!r.part_number?.trim()) errors.push("Part number missing")
    if (!r.warehouse?.trim()) errors.push("Warehouse missing")
    const qty = parseInt(r.quantity)
    if (isNaN(qty) || qty <= 0) errors.push("Quantity must be > 0")
    return { ...r, _row: i + 2, _error: errors.join(", ") }
  })
}
const SAMPLE_CSV = `Brand,Part number,Description,Warehouse,Quantity,Condition\nHUAWEI,03053557,"WP22MPUB4 Main Processing Unit B4 PGP",Soguksu,2,SPARE\nCISCO,WS-C2960X-48FPD-L,Catalyst 2960-X 48 Port Switch,Amsterdam Hub,5,Used\nCISCO,ASR1001-X,ASR 1001-X Router,Berlin DC,1,Tested & Packed\nHUAWEI,02311HKL,RRU3971 Multi-mode 1800MHz,Istanbul WH,12,New\nJUNIPER,EX4300-48P,EX4300 48-port PoE Switch,Amsterdam Hub,3,Refurbished\n`

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = "SpareShare_Inventory_Template.csv"; a.click()
  URL.revokeObjectURL(url)
}

const TH: React.CSSProperties = {
  background: "#4A6FA5", color: "white", fontWeight: 700,
  padding: "11px 16px", textAlign: "center", fontSize: 14,
  borderRight: "1px solid #3d5f8f",
}

export default function CSVImportPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<CSVRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState("")
  const [importedSummary, setImportedSummary] = useState<{pn: string; qty: number; warehouse: string}[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const validRows = rows.filter(r => !r._error)
  const invalidRows = rows.filter(r => r._error)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single()
    if (profile) setCompanyId(profile.company_id)
  }

  function handleFile(f: File) {
    setFile(f); setResult(null); setParseError(""); setRows([]); setImportedSummary([])
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => {
        const mapped: CSVRow[] = (res.data as any[]).map((row, i) => ({
          brand:       (row.brand || row.make || "").trim(),
          part_number: (row.part_number || row.pn || row.partnumber || row.part_no || "").trim(),
          description: (row.description || row.desc || "").trim(),
          warehouse:   (row.warehouse || row.location || "").trim(),
          quantity:    String(row.quantity || row.qty || "").trim(),
          condition:   (row.condition || "").trim(),
          _row: i + 2,
        }))
        setRows(validateRows(mapped))
      },
      error: (err: any) => setParseError("CSV parse error: " + err.message)
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f?.name.endsWith(".csv")) handleFile(f)
    else setParseError("Please drop a .csv file")
  }

  async function handleImport() {
    if (!companyId || validRows.length === 0) return
    setImporting(true); setProgress(0); setResult(null)
    const errors: string[] = []; let success = 0, skipped = 0

    const uniquePNs = [...new Set(validRows.map(r => normalizePN(r.part_number)))]
    const uniqueWH = [...new Set(validRows.map(r => r.warehouse.trim()))]

    const { data: existingProds } = await supabase.from("products").select("id, normalized_pn").in("normalized_pn", uniquePNs)
    const productMap = new Map(existingProds?.map(p => [p.normalized_pn, p.id]) || [])

    const newProds = validRows.filter(r => !productMap.has(normalizePN(r.part_number)))
      .reduce((acc: any[], r) => {
        const pn = normalizePN(r.part_number)
        if (!acc.find((x: any) => x.normalized_pn === pn))
          acc.push({ normalized_pn: pn, brand: r.brand.trim(), description: r.description || null })
        return acc
      }, [])
    if (newProds.length > 0) {
      const { data: ins } = await supabase.from("products").insert(newProds).select("id, normalized_pn")
      ins?.forEach(p => productMap.set(p.normalized_pn, p.id))
    }

    const { data: existingWH } = await supabase.from("warehouses").select("id, name").eq("company_id", companyId).in("name", uniqueWH)
    const warehouseMap = new Map(existingWH?.map(w => [w.name, w.id]) || [])
    for (const name of uniqueWH.filter(n => !warehouseMap.has(n))) {
      const { data: nw } = await supabase.from("warehouses").insert({ company_id: companyId, name }).select("id").single()
      if (nw) warehouseMap.set(name, nw.id)
    }

    const summary: {pn: string; qty: number; warehouse: string}[] = []
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      const pn = normalizePN(row.part_number)
      const productId = productMap.get(pn)
      const warehouseId = warehouseMap.get(row.warehouse.trim())
      const qty = parseInt(row.quantity)
      if (!productId || !warehouseId) { errors.push(`Row ${row._row}: unresolved`); skipped++; continue }
      const { error } = await supabase.from("warehouse_stock").upsert(
        { warehouse_id: warehouseId, product_id: productId, quantity: qty, condition: row.condition || null },
        { onConflict: "warehouse_id,product_id,condition" }
      )
      if (error) { errors.push(`Row ${row._row} (${row.part_number}): ${error.message}`); skipped++ }
      else { success++; summary.push({ pn: row.part_number, qty, warehouse: row.warehouse }) }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }

    setResult({ success, skipped, errors })
    setImportedSummary(summary)
    setImporting(false)
    if (errors.length === 0) { setFile(null); setRows([]); if (fileRef.current) fileRef.current.value = "" }
  }

  return (
    <div style={{ maxWidth: 960 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>Warehouse CSV Import</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "5px 0 0" }}>
            Bulk upload your inventory into warehouse stock.
          </p>
        </div>
        <button onClick={downloadSample} style={{ padding: "9px 18px", background: "white", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ⬇ Download Template
        </button>
      </div>

      {/* Format info with example table */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "16px 18px", marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", marginBottom: 10 }}>📋 Required CSV Format</div>
        <div style={{ overflowX: "auto", borderRadius: 8, overflow: "hidden", border: "1px solid #bfdbfe" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Brand", "Part number", "Description", "Warehouse", "Quantity", "Condition"].map((h, i) => (
                  <th key={h} style={{ ...TH, borderRight: i < 5 ? "1px solid #3d5f8f" : "none" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "#f0f7ff" }}>
                {["HUAWEI", "03053557", "Main Processing Unit B4, PGP", "Soguksu", "2", "SPARE"].map((v, i) => (
                  <td key={i} style={{ padding: "8px 16px", textAlign: "center", fontSize: 13, color: "#374151", borderRight: i < 5 ? "1px solid #dbeafe" : "none" }}>
                    {v}{[0,1,3,4].includes(i) && <span style={{ color: "#dc2626" }}>*</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "#1e40af", marginTop: 8 }}>
          <span style={{ color: "#dc2626" }}>*</span> Required: Brand, Part number, Warehouse, Quantity &nbsp;|&nbsp; Optional: Description, Condition
        </div>
      </div>

      {/* Drop zone — only when no file loaded */}
      {!rows.length && !result && (
        <div
          style={{ border: `2px dashed ${dragging ? "#2563eb" : "#cbd5e1"}`, borderRadius: 12, padding: "48px 20px", textAlign: "center", cursor: "pointer", background: dragging ? "#eff6ff" : "#fafafa", marginBottom: 20 }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>Drag & drop your CSV file here</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>or click to browse</div>
          <input type="file" accept=".csv" hidden ref={fileRef} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {parseError && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 13, marginBottom: 16 }}>
          {parseError}
        </div>
      )}

      {/* Preview table — same style as screenshot */}
      {rows.length > 0 && !result && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{file?.name}</span>
              <span style={{ fontSize: 12, color: "#16a34a", background: "#f0fdf4", padding: "2px 10px", borderRadius: 20, border: "1px solid #bbf7d0" }}>✓ {validRows.length} valid</span>
              {invalidRows.length > 0 && <span style={{ fontSize: 12, color: "#d97706", background: "#fffbeb", padding: "2px 10px", borderRadius: 20, border: "1px solid #fde68a" }}>⚠ {invalidRows.length} issues</span>}
            </div>
            <button onClick={() => { setRows([]); setFile(null); if (fileRef.current) fileRef.current.value = "" }}
              style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>✕ Clear</button>
          </div>

          <div style={{ border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Brand", "Part number", "Description", "Warehouse", "Quantity", "Condition"].map((h, i) => (
                    <th key={h} style={{ ...TH, borderRight: i < 5 ? "1px solid #3d5f8f" : "none" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #e2e8f0", background: row._error ? "#fffbeb" : i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, color: "#374151", borderRight: "1px solid #e2e8f0" }}>
                      {row.brand || <span style={{ color: "#fbbf24" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700, fontSize: 14, fontFamily: "monospace", color: "#0f172a", borderRight: "1px solid #e2e8f0" }}>
                      {row.part_number ? normalizePN(row.part_number) : <span style={{ color: "#fbbf24" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 13, color: "#374151", borderRight: "1px solid #e2e8f0", maxWidth: 240, wordBreak: "break-word" }}>
                      {row.description || <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, color: "#374151", borderRight: "1px solid #e2e8f0" }}>
                      {row.warehouse || <span style={{ color: "#fbbf24" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700, fontSize: 14, color: "#0f172a", background: !row._error ? "#e0f2f1" : "transparent", borderRight: "1px solid #e2e8f0" }}>
                      {row.quantity || <span style={{ color: "#fbbf24", fontWeight: 400 }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, color: "#374151" }}>
                      {row._error
                        ? <span style={{ fontSize: 11, color: "#d97706" }} title={row._error}>⚠ {row._error}</span>
                        : (row.condition || <span style={{ color: "#94a3b8" }}>—</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && (
              <div style={{ padding: "8px 16px", fontSize: 12, color: "#94a3b8", textAlign: "center", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                Showing 200 of {rows.length} rows — all {rows.length} will be imported
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      {importing && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, color: "#64748b" }}>
            <span>Importing...</span><span style={{ fontWeight: 700 }}>{progress}%</span>
          </div>
          <div style={{ background: "#e2e8f0", borderRadius: 999, height: 10, overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, background: "#2563eb", height: "100%", borderRadius: 999, transition: "width 0.2s" }} />
          </div>
        </div>
      )}

      {/* Result + Verification */}
      {result && (
        <div>
          <div style={{ padding: "14px 18px", borderRadius: 10, marginBottom: 16, background: result.errors.length === 0 ? "#f0fdf4" : "#fffbeb", border: `1px solid ${result.errors.length === 0 ? "#bbf7d0" : "#fde68a"}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: result.errors.length === 0 ? "#16a34a" : "#92400e" }}>
              {result.errors.length === 0
                ? `✅ ${result.success} items successfully imported to warehouse stock`
                : `⚠ ${result.success} imported, ${result.skipped} skipped`}
            </div>
            {result.errors.length > 0 && (
              <div style={{ fontSize: 12, color: "#92400e", marginTop: 8 }}>
                {result.errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
                {result.errors.length > 5 && <div>...and {result.errors.length - 5} more</div>}
              </div>
            )}
          </div>

          {importedSummary.length > 0 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                📦 Verify Imported Quantities:
              </div>
              <div style={{ border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Part Number", "Warehouse", "Quantity"].map((h, i) => (
                        <th key={h} style={{ ...TH, textAlign: "left", borderRight: i < 2 ? "1px solid #3d5f8f" : "none" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importedSummary.map((item, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                        <td style={{ padding: "10px 16px", fontWeight: 700, fontFamily: "monospace", fontSize: 14, color: "#0f172a", borderRight: "1px solid #e2e8f0" }}>
                          {normalizePN(item.pn)}
                        </td>
                        <td style={{ padding: "10px 16px", fontSize: 14, color: "#374151", borderRight: "1px solid #e2e8f0" }}>
                          {item.warehouse}
                        </td>
                        <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 14, color: "#0f172a", background: "#e0f2f1" }}>
                          {item.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => { setResult(null); setImportedSummary([]) }}
                style={{ padding: "9px 20px", background: "transparent", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                + Import Another File
              </button>
            </>
          )}
        </div>
      )}

      {/* Import button */}
      {rows.length > 0 && !result && (
        <button onClick={handleImport} disabled={importing || validRows.length === 0 || !companyId}
          style={{ width: "100%", padding: 14, background: importing || validRows.length === 0 ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: importing || validRows.length === 0 ? "not-allowed" : "pointer", marginTop: 4 }}>
          {importing ? `Importing... ${progress}%` : `Import ${validRows.length} items into Warehouse Stock`}
        </button>
      )}
      {invalidRows.length > 0 && validRows.length > 0 && !result && (
        <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
          {invalidRows.length} row{invalidRows.length > 1 ? "s" : ""} with errors will be skipped
        </p>
      )}
    </div>
  )
}
