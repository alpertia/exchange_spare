'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Row = { pn: string; brand: string; qty: number; price: string; condition: string; country: string; notes: string }
type Tab = 'csv' | 'numbers' | 'excel'

// ── Column name normalizer ────────────────────────────────────────────────────
function normHeader(h: string): string {
  const s = h.toLowerCase().replace(/[\s_\-\(\)\.\/\*]/g, '')
  if (['pn','partnumber','partno','normalizedpn','part','productcode','code','sku','itemcode','itemnumber','articlenumber','article'].includes(s)) return 'pn'
  if (['brand','manufacturer','mfr','make','vendor','supplier','oem'].includes(s)) return 'brand'
  if (['qty','quantity','stock','units','availableqty','availablestock','onhand','stockonhand','count','pieces'].includes(s)) return 'qty'
  if (['price','unitprice','listprice','cost','sellingprice','saleproce'].includes(s)) return 'price'
  if (['condition','cond','state','grade','status'].includes(s)) return 'condition'
  if (['country','location','origin','loc','warehouse'].includes(s)) return 'country'
  if (['description','productdescription','desc','name','productname','itemdescription','details'].includes(s)) return 'notes'
  return s
}

// ── PN normalizer: uppercase, strip spaces/dashes/dots BUT keep letters & slashes ─
function normPN(raw: string): string {
  // Remove trailing * (Nokia uses these for variants)
  return raw.replace(/\*$/, '').toUpperCase().replace(/[\s]/g, '').trim()
}

// ── Try to detect brand from PN or description ────────────────────────────────
function detectBrand(pn: string, notes: string): string {
  const p = pn.toUpperCase()
  const n = notes.toUpperCase()
  if (p.startsWith('KRC') || p.startsWith('KRY') || p.startsWith('KDV') || n.includes('NOKIA') || n.includes('FLEXI') || n.includes('FRHF') || n.includes('ARPA')) return 'NOKIA'
  if (p.startsWith('WS-') || p.startsWith('ASR') || p.startsWith('N9K') || n.includes('CISCO')) return 'CISCO'
  if (p.startsWith('EX') || p.startsWith('MX') || p.startsWith('QFX') || n.includes('JUNIPER')) return 'JUNIPER'
  if (p.startsWith('NE') || p.startsWith('ES') || n.includes('HUAWEI')) return 'HUAWEI'
  if (p.startsWith('ALU') || p.startsWith('7750') || n.includes('ALCATEL')) return 'NOKIA/ALCATEL'
  if (n.includes('ERICSSON') || p.startsWith('KDU') || p.startsWith('AIR')) return 'ERICSSON'
  return ''
}

// ── Parse comma/semicolon/tab delimited text ─────────────────────────────────
function parseText(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  // Detect delimiter
  const firstLine = lines[0]
  const delim = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ','

  const headers = firstLine.split(delim).map(h => normHeader(h.replace(/^["']|["']$/g, '').trim()))

  return lines.slice(1).flatMap(line => {
    // Parse respecting quoted fields
    const values: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if ((ch === '"' || ch === "'") && !inQ) inQ = true
      else if ((ch === '"' || ch === "'") && inQ) inQ = false
      else if (ch === delim && !inQ) { values.push(cur.trim()); cur = '' }
      else cur += ch
    }
    values.push(cur.trim())

    const obj: any = {}
    headers.forEach((h, i) => (obj[h] = (values[i] || '').replace(/^["']|["']$/g, '').trim()))

    const rawPN = obj.pn || obj.productcode || obj.code || obj.sku || ''
    if (!rawPN) return []
    const pn = normPN(rawPN)
    if (!pn) return []

    const notesRaw = obj.notes || obj.description || ''
    const brandRaw = obj.brand || ''
    const brand = brandRaw ? brandRaw.toUpperCase().trim() : detectBrand(pn, notesRaw)

    return [{
      pn, brand, notes: notesRaw,
      qty: parseInt(obj.qty) || 1,
      price: obj.price || '',
      condition: obj.condition || 'used',
      country: obj.country || '',
    }]
  }).filter(r => r.qty > 0)
}

const SAMPLE = `PN,Brand,Qty,Price,Condition,Country\nWS-C2960X-48FPD-L,CISCO,5,450,used,Germany\nKRC161706/1,NOKIA,59,,spare,\n473225A,NOKIA,322,,,`

export default function CSVImportPage() {
  const [tab, setTab] = useState<Tab>('csv')
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [failed, setFailed] = useState(0)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [excelReady, setExcelReady] = useState(false)
  const [editBrand, setEditBrand] = useState('')  // global brand override

  useEffect(() => {
    init()
    loadXLSX()
  }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (p?.company_id) setCompanyId(p.company_id)
  }

  function loadXLSX() {
    if ((window as any).XLSX) { setExcelReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => setExcelReady(true)
    document.head.appendChild(s)
  }

  function parseExcel(file: File) {
    if (!(window as any).XLSX) { setErr('Excel parser loading, wait a moment and try again.'); return }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const XLSX = (window as any).XLSX
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        // Get as array of arrays
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (raw.length < 2) { setErr('Sheet appears empty'); return }

        const headers = raw[0].map((h: any) => normHeader(String(h || '').trim()))
        const parsed: Row[] = raw.slice(1).flatMap((row: any[]) => {
          const obj: any = {}
          headers.forEach((h, i) => (obj[h] = String(row[i] || '').trim()))

          const rawPN = obj.pn || obj.productcode || ''
          if (!rawPN) return []
          const pn = normPN(rawPN)
          if (!pn) return []

          const notesRaw = obj.notes || ''
          const brandRaw = obj.brand || ''
          const brand = brandRaw ? brandRaw.toUpperCase() : detectBrand(pn, notesRaw)
          const qty = parseInt(obj.qty) || 1
          if (qty <= 0) return []

          return [{ pn, brand, notes: notesRaw, qty, price: obj.price || '', condition: obj.condition || 'used', country: obj.country || '' }]
        })

        if (parsed.length === 0) { setErr('No valid rows found. Make sure file has Product Code / PN column.'); return }
        setRows(parsed)
        setErr('')
      } catch (ex: any) {
        setErr('Parse error: ' + ex.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRows([]); setDone(false); setErr(''); setFileName(file.name)
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) { parseExcel(file) }
    else { const r = new FileReader(); r.onload = ev => { const parsed = parseText(ev.target?.result as string); if (parsed.length === 0) setErr('No valid rows. Check columns.'); else setRows(parsed) }; r.readAsText(file) }
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    setRows([]); setDone(false); setErr(''); setFileName(file.name)
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) { setTab('excel'); parseExcel(file) }
    else { setTab('csv'); const r = new FileReader(); r.onload = ev => { const parsed = parseText(ev.target?.result as string); if (parsed.length === 0) setErr('No valid rows.'); else setRows(parsed) }; r.readAsText(file) }
  }

  // Apply global brand override
  const finalRows = rows.map(r => ({ ...r, brand: editBrand.trim().toUpperCase() || r.brand || 'UNKNOWN' }))

  async function doImport() {
    if (!companyId || finalRows.length === 0) return
    setImporting(true); setImported(0); setFailed(0); setDone(false)
    let ok = 0, fail = 0
    for (const row of finalRows) {
      try {
        const { data: ex } = await supabase.from('products').select('id').eq('normalized_pn', row.pn).maybeSingle()
        let productId: string
        if (ex) {
          productId = ex.id
        } else {
          const { data: np, error: pe } = await supabase.from('products')
            .insert({ normalized_pn: row.pn, brand: row.brand })
            .select('id').single()
          if (pe || !np) { fail++; continue }
          productId = np.id
        }
        const { error: le } = await supabase.from('listings').insert({
          product_id: productId, company_id: companyId,
          quantity: row.qty,
          price: row.price ? parseFloat(row.price) : null,
          condition: row.condition || 'used',
          country: row.country || null,
          notes: row.notes || null,
          status: 'active',
        })
        if (le) fail++; else ok++
        setImported(ok); setFailed(fail)
      } catch { fail++ }
    }
    setImporting(false); setDone(true)
  }

  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => { setTab(t); setRows([]); setErr(''); setDone(false) }}
      style={{ padding: '7px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === t ? '#1e40af' : 'transparent', color: tab === t ? 'white' : '#64748b' }}>
      {label}
    </button>
  )

  const missingBrands = finalRows.some(r => !r.brand || r.brand === 'UNKNOWN')

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Import Listings</h1>
        <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([SAMPLE], { type: 'text/csv' })); a.download = 'exchangespare_template.csv'; a.click() }}
          style={{ padding: '7px 14px', background: 'transparent', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          ↓ Template CSV
        </button>
      </div>

      {/* Format tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {tabBtn('csv', '📄 CSV')}
        {tabBtn('numbers', '🍎 Numbers')}
        {tabBtn('excel', `📊 Excel${!excelReady ? ' ⟳' : ''}`)}
      </div>

      {/* Hint */}
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
        {tab === 'csv' && '📄 CSV — comma or semicolon separated. Column names auto-detected.'}
        {tab === 'numbers' && '🍎 Numbers — File → Export To → CSV, then upload here. Tab or semicolon separated also works.'}
        {tab === 'excel' && '📊 Excel — upload .xlsx or .xls directly. Reads the first sheet. No need to reformat.'}
      </div>

      {/* Drop zone */}
      {rows.length === 0 && !done && (
        <div onDrop={onDrop} onDragOver={e => e.preventDefault()}
          style={{ border: '2px dashed #bfdbfe', borderRadius: 10, padding: '40px 20px', textAlign: 'center', background: 'white', marginBottom: 16, cursor: 'pointer' }}
          onClick={() => document.getElementById('file-input')?.click()}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 14, color: '#475569', marginBottom: 4 }}>Drop your file here, or click to browse</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            {tab === 'excel' ? '.xlsx / .xls' : tab === 'numbers' ? '.csv / .tsv' : '.csv / .txt'} · Auto-detects column names
          </div>
          <input id="file-input" type="file" accept={tab === 'excel' ? '.xlsx,.xls' : '.csv,.tsv,.txt,.numbers'} onChange={onFile} style={{ display: 'none' }} />
          {fileName && <div style={{ marginTop: 10, fontSize: 12, color: '#1e40af', fontWeight: 500 }}>📎 {fileName}</div>}
        </div>
      )}

      {err && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {/* Preview + brand fix */}
      {rows.length > 0 && !done && (
        <>
          {/* Brand override */}
          {missingBrands && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#92400e' }}>⚠ Some rows have no brand detected.</span>
              <input placeholder="Set brand for all (e.g. NOKIA)" value={editBrand} onChange={e => setEditBrand(e.target.value.toUpperCase())}
                style={{ flex: 1, padding: '5px 10px', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, background: 'white' }} />
            </div>
          )}

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Preview — {rows.length} rows ready</span>
              <button onClick={() => { setRows([]); setFileName('') }} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Clear</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['PN', 'Brand', 'Qty', 'Price', 'Condition', 'Notes'].map(h => (
                      <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {finalRows.slice(0, 10).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '6px 12px', fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', fontSize: 11 }}>{r.pn}</td>
                      <td style={{ padding: '6px 12px', color: r.brand && r.brand !== 'UNKNOWN' ? '#475569' : '#f59e0b', fontWeight: 500 }}>{r.brand || '—'}</td>
                      <td style={{ padding: '6px 12px', color: '#475569' }}>{r.qty}</td>
                      <td style={{ padding: '6px 12px', color: '#94a3b8' }}>{r.price || '—'}</td>
                      <td style={{ padding: '6px 12px', color: '#64748b' }}>{r.condition}</td>
                      <td style={{ padding: '6px 12px', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes}>{r.notes || '—'}</td>
                    </tr>
                  ))}
                  {rows.length > 10 && (
                    <tr><td colSpan={6} style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 11 }}>...and {rows.length - 10} more rows</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={doImport} disabled={importing || !companyId}
            style={{ width: '100%', padding: 13, background: importing ? '#93c5fd' : '#1e40af', color: 'white', border: 'none', borderRadius: 8, cursor: importing ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600 }}>
            {importing
              ? `Importing... ${imported} done${failed > 0 ? `, ${failed} failed` : ''}`
              : `Import ${rows.length} listings → Marketplace`}
          </button>
        </>
      )}

      {/* Done */}
      {done && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Import complete</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
            <strong style={{ color: '#15803d' }}>{imported} listings</strong> added to Marketplace
            {failed > 0 && <span style={{ color: '#dc2626' }}> · {failed} failed</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a href="/dashboard/listings" style={{ padding: '8px 18px', background: '#1e40af', color: 'white', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>View My Listings</a>
            <button onClick={() => { setRows([]); setDone(false); setFileName('') }}
              style={{ padding: '8px 18px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Import Another
            </button>
          </div>
        </div>
      )}

      {/* Column guide */}
      {rows.length === 0 && !done && (
        <div style={{ marginTop: 20, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>Accepted column names — case insensitive, order doesn't matter</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
            {[
              ['PN / Part Number / Part No / Product Code / SKU', '★ Required'],
              ['Description / Product Description / Notes', 'Saved as notes'],
              ['Brand / Manufacturer / Mfr', 'Auto-detected from PN if missing'],
              ['Qty / Quantity / Available Qty / Stock', 'Defaults to 1'],
              ['Price / Unit Price / Cost', 'Optional'],
              ['Condition / Grade', 'Defaults to "used"'],
              ['Country / Location', 'Optional'],
            ].map(([k, v]) => (
              <div key={k} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{k}</span>
                <span style={{ color: '#94a3b8', marginLeft: 6 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
            💡 Nokia format (Product Code, Product Description, Available Qty) is fully supported. Brand auto-detected as NOKIA.
          </div>
        </div>
      )}
    </div>
  )
}
