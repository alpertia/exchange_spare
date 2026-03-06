'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type Row = {
  pn: string; brand: string; model: string; qty: string; price: string
  currency: string; condition: string; country: string; notes: string; description: string
}
type ImportGroup = {
  id: string; name: string; created_at: string; count: number; source: 'csv' | 'manual'
}
type Listing = {
  id: string; product_id: string; quantity: number | null; price: number | null
  currency: string; condition: string | null; country: string | null; notes: string | null
  created_at: string; status: string
  product: { normalized_pn: string; brand: string; description: string | null }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPTY: Row = { pn: '', brand: '', model: '', qty: '', price: '', currency: 'EUR', condition: 'used', country: '', notes: '', description: '' }
const CONDITIONS = ['new', 'used', 'refurbished', 'tested & packed', 'spare', 'for parts']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CNY']
const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CNY: '¥' }

// ─── Header normalizer — handles all variants seen in real files ──────────────
function normHeader(h: string): string {
  const s = h.toLowerCase().replace(/[\s_\-\(\)\.\/\*\#№]/g, '')
  // PN
  if (['pn','partnumber','partno','productcode','productno','code','sku','article','rowlabels','partnum','item'].includes(s)) return 'pn'
  // Brand / Vendor
  if (['brand','manufacturer','mfr','vendor','oem','supplier'].includes(s)) return 'brand'
  // Model (Huawei specific)
  if (['model','modelname','modelno'].includes(s)) return 'model'
  // Description
  if (['description','desc','productdescription','configname','itemdescription','name','productname'].includes(s)) return 'description'
  // Quantity
  if (['qty','quantity','availableqty','stock','availableqty','sumofqty','availableqty','qrequested','qtyrequested','availableqty'].includes(s)) return 'qty'
  // Price
  if (['price','unitprice','salesprice','exwunitprice','exwunitpricermb','unitpriceeur','unitpriceusd'].includes(s)) return 'price'
  // Condition
  if (['condition','cond','status','remarks'].includes(s)) return 'condition'
  // Country / Location
  if (['country','location','warehouse','loc','diaposone'].includes(s)) return 'country'
  // Currency (sometimes a column)
  if (['currency','cur'].includes(s)) return 'currency'
  // Notes
  if (['notes','note','comment','comments','leadtime','leadtimeday'].includes(s)) return 'notes'
  // Row number — skip
  if (['no','number','rowno',''].includes(s)) return '_skip'
  return s
}

// ─── Condition normalizer ─────────────────────────────────────────────────────
function normCondition(raw: string): string {
  const s = raw.toLowerCase().replace(/[\s&]/g, '')
  if (['new','brand-new','brandnew'].includes(s)) return 'new'
  if (['used','secondhand','2ndhand','uh','usedlanded'].includes(s)) return 'used'
  if (['refurbished','ref','refurb','remanufactured'].includes(s)) return 'refurbished'
  if (['tested&packed','tested','testedpacked','tp'].includes(s)) return 'tested & packed'
  if (['spare','spares'].includes(s)) return 'spare'
  if (['forparts','parts','scrap','damaged'].includes(s)) return 'for parts'
  return raw.toLowerCase() || ''
}

// ─── PN normalizer ────────────────────────────────────────────────────────────
function normPN(raw: string): string {
  return raw.replace(/\*$/, '').toUpperCase().replace(/\s/g, '').trim()
}

// ─── Parse price — handle "$18", "18 USD", "6,000" etc ───────────────────────
function parsePrice(raw: string): { price: string; currency: string } {
  if (!raw) return { price: '', currency: 'EUR' }
  const s = raw.trim()
  let currency = 'EUR'
  let num = s
  if (s.startsWith('$')) { currency = 'USD'; num = s.slice(1) }
  else if (s.startsWith('€')) { currency = 'EUR'; num = s.slice(1) }
  else if (s.startsWith('£')) { currency = 'GBP'; num = s.slice(1) }
  else if (s.startsWith('¥') || s.toLowerCase().includes('rmb') || s.toLowerCase().includes('cny')) { currency = 'CNY'; num = s.replace(/[¥rmb cny]/gi, '') }
  num = num.replace(/,/g, '').trim()
  const parsed = parseFloat(num)
  return { price: isNaN(parsed) ? '' : String(parsed), currency }
}

// ─── Parse quantity — handle "5-10", "~50", "100 PCS" etc ────────────────────
function parseQty(raw: string): string {
  if (!raw) return ''
  const s = raw.toString().replace(/[,\s]/g, '')
  const range = s.match(/^(\d+)\s*[-–]\s*\d+$/)
  if (range) return range[1] // take min
  const num = s.match(/^[\~≈]?(\d+)/)
  if (num) return num[1]
  return ''
}

// ─── Input styles ─────────────────────────────────────────────────────────────
const inp = (extra?: any) => ({
  padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#f8fafc', color: '#0f172a', fontSize: 12, outline: 'none',
  width: '100%', boxSizing: 'border-box' as const, ...extra
})
const lbl = { fontSize: 10, color: '#64748b', display: 'block', marginBottom: 2, fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

// ─── Condition badge ──────────────────────────────────────────────────────────
function CondBadge({ c }: { c: string | null }) {
  const colors: Record<string, [string, string]> = {
    'new': ['#059669', '#ecfdf5'], 'used': ['#64748b', '#f1f5f9'],
    'refurbished': ['#2563eb', '#eff6ff'], 'tested & packed': ['#7c3aed', '#f5f3ff'],
    'spare': ['#0891b2', '#ecfeff'], 'for parts': ['#dc2626', '#fef2f2'],
  }
  const [color, bg] = colors[c?.toLowerCase() || ''] || ['#94a3b8', '#f8fafc']
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: bg, color, fontWeight: 600 }}>{c || '—'}</span>
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function SellingPage() {
  const [myId, setMyId]             = useState<string | null>(null)
  const [view, setView]             = useState<'finder' | 'add' | 'csv' | 'scan'>('finder')

  // Finder state
  const [groups, setGroups]         = useState<ImportGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [listings, setListings]     = useState<Listing[]>([])
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [loadingListings, setLoadingListings] = useState(false)

  // Single add
  const [form, setForm]             = useState<Row>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [err, setErr]               = useState('')

  // CSV state
  const [csvRows, setCsvRows]       = useState<Row[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [importing, setImporting]   = useState(false)
  const [importDone, setImportDone] = useState<{ ok: number; fail: number } | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])

  // Bulk defaults (asked once for whole file)
  const [showDefaults, setShowDefaults]   = useState(false)
  const [defCondition, setDefCondition]   = useState('')
  const [defCurrency, setDefCurrency]     = useState('EUR')
  const [defBrand, setDefBrand]           = useState('')
  const [defCountry, setDefCountry]       = useState('')
  const [defaultsConfirmed, setDefaultsConfirmed] = useState(false)

  // Scan
  const [scanning, setScanning]     = useState(false)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef  = useRef<HTMLInputElement>(null)
  const csvRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('profiles').select('company_id').eq('id', session.user.id).single().then(({ data: p }) => {
        if (p?.company_id) { setMyId(p.company_id); loadGroups(p.company_id) }
      })
    })
    if (!(window as any).XLSX) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      document.head.appendChild(s)
    }
  }, [])

  // ── Load import groups (CSV batches + manual) ─────────────────────────────
  async function loadGroups(cid: string) {
    const { data } = await supabase
      .from('listings')
      .select('import_batch, created_at')
      .eq('company_id', cid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (!data) return

    const batchMap: Record<string, { count: number; created_at: string; source: 'csv' | 'manual' }> = {}
    data.forEach((l: any) => {
      const key = l.import_batch || 'manual'
      if (!batchMap[key]) batchMap[key] = { count: 0, created_at: l.created_at, source: key === 'manual' ? 'manual' : 'csv' }
      batchMap[key].count++
    })

    const gs: ImportGroup[] = Object.entries(batchMap).map(([id, v]) => ({
      id, name: id === 'manual' ? '✏️ Manual entries' : `📂 ${id}`,
      created_at: v.created_at, count: v.count, source: v.source
    }))
    setGroups(gs)
    if (gs.length > 0 && !selectedGroup) setSelectedGroup(gs[0].id)
  }

  // ── Load listings for selected group ──────────────────────────────────────
  const loadListings = useCallback(async (cid: string, groupId: string) => {
    setLoadingListings(true)
    const q = supabase
      .from('listings')
      .select('*, product:product_id(normalized_pn, brand, description)')
      .eq('company_id', cid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (groupId === 'manual') q.is('import_batch', null)
    else q.eq('import_batch', groupId)

    const { data } = await q
    setListings((data || []) as any)
    setLoadingListings(false)
  }, [])

  useEffect(() => {
    if (myId && selectedGroup) loadListings(myId, selectedGroup)
  }, [myId, selectedGroup, loadListings])

  // ── Single save ───────────────────────────────────────────────────────────
  async function saveSingle() {
    if (!myId || !form.pn) return
    setSaving(true); setErr('')
    const pn = normPN(form.pn)
    // description = model + description combined
    const fullDesc = [form.model, form.description].filter(Boolean).join(' — ') || null

    let { data: prod } = await supabase.from('products').select('id').eq('normalized_pn', pn).maybeSingle()
    if (!prod) {
      const { data: np } = await supabase.from('products').insert({
        normalized_pn: pn,
        brand: form.brand.toUpperCase() || 'UNKNOWN',
        description: fullDesc,
      }).select().single()
      prod = np
    }
    if (!prod) { setErr('Failed to create product'); setSaving(false); return }

    const { error } = await supabase.from('listings').insert({
      company_id: myId, product_id: prod.id, status: 'active',
      quantity: parseInt(form.qty) || null,
      price: parseFloat(form.price) || null,
      currency: form.currency,
      condition: form.condition || null,
      country: form.country || null,
      notes: form.notes || null,
      import_batch: null,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaved(true); setForm(EMPTY)
    setTimeout(() => { setSaved(false); setView('finder'); if (myId) loadGroups(myId) }, 1500)
    setSaving(false)
  }

  // ── CSV/Excel parse ───────────────────────────────────────────────────────
  function parseFile(file: File) {
    setCsvRows([]); setImportDone(null); setParseWarnings([]); setDefaultsConfirmed(false)
    setCsvFileName(file.name)

    const process = (raw: any[][]) => {
      if (raw.length < 2) { setErr('Empty or unreadable file'); return }

      // Find header row (skip rows until we find one with PN-like content)
      let headerIdx = 0
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        const row = raw[i].map((c: any) => String(c || '').toLowerCase())
        if (row.some(c => ['pn','part number','partnumber','article','sku','code','row labels'].includes(c.trim()))) {
          headerIdx = i; break
        }
      }

      const hdrs = raw[headerIdx].map((h: any) => normHeader(String(h || '').trim()))
      const hasPn = hdrs.includes('pn')
      if (!hasPn) { setErr('❌ No Part Number column found. File rejected. Need: PN, Part Number, Article, SKU, or Code column.'); return }

      const warnings: string[] = []
      const hasCondition = hdrs.includes('condition')
      const hasBrand = hdrs.includes('brand')
      const hasCurrency = hdrs.includes('currency')

      if (!hasCondition) warnings.push('No condition column — will ask for default')
      if (!hasBrand) warnings.push('No brand/vendor column — will ask for default')

      const rows: Row[] = []
      raw.slice(headerIdx + 1).forEach((rawRow: any[], idx) => {
        const obj: any = {}
        hdrs.forEach((h, i) => { if (h !== '_skip') obj[h] = String(rawRow[i] || '').trim() })

        const pn = normPN(obj.pn || '')
        if (!pn) return // skip empty PN
        if (pn === 'PNNOTFOUND' || pn === 'N/A' || pn === 'NA') return // skip invalid

        const qtyRaw = parseQty(obj.qty || '')
        if (!qtyRaw && obj.qty) warnings.push(`Row ${idx + 2}: qty "${obj.qty}" could not be parsed`)

        const { price, currency: priceCurrency } = parsePrice(obj.price || '')
        const currency = obj.currency || (hasCurrency ? '' : priceCurrency) || 'EUR'

        // Model + description merge (Huawei pattern)
        const model = obj.model || ''
        const desc = obj.description || ''
        const fullDesc = model && desc ? `${model} — ${desc}` : model || desc

        // Condition mapping
        let condition = normCondition(obj.condition || '')
        // "USED LANDED" → used, add LANDED to notes
        const notesExtra = (obj.condition || '').toUpperCase().includes('LANDED') ? 'LANDED' : ''

        rows.push({
          pn,
          brand: (obj.brand || '').toUpperCase(),
          model,
          description: fullDesc,
          qty: qtyRaw,
          price,
          currency,
          condition,
          country: obj.country || '',
          notes: [obj.notes, notesExtra].filter(Boolean).join(' '),
        })
      })

      if (rows.length === 0) { setErr('No valid rows found (need PN + Quantity)'); return }

      setParseWarnings(warnings)
      setCsvRows(rows)

      // Determine what defaults to ask
      const needsDefaults = rows.some(r => !r.condition) || rows.some(r => !r.brand)
      if (needsDefaults) {
        setShowDefaults(true)
        // Pre-fill defaults from first row that has values
        const firstWithCond = rows.find(r => r.condition)
        const firstWithBrand = rows.find(r => r.brand)
        if (firstWithCond) setDefCondition(firstWithCond.condition)
        if (firstWithBrand) setDefBrand(firstWithBrand.brand)
      } else {
        setDefaultsConfirmed(true)
      }
    }

    if (file.name.match(/\.xlsx?$/i)) {
      const XLSX = (window as any).XLSX
      if (!XLSX) { setErr('Parser loading, try again in 2s'); return }
      const reader = new FileReader()
      reader.onload = e => {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        process(raw)
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
        const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
        const raw = lines.map(l => l.split(delim).map(v => v.replace(/^["']|["']$/g, '').trim()))
        process(raw)
      }
      reader.readAsText(file)
    }
  }

  function confirmDefaults() {
    // Apply defaults to rows missing values
    setCsvRows(prev => prev.map(r => ({
      ...r,
      condition: r.condition || defCondition || 'used',
      brand: r.brand || defBrand || 'UNKNOWN',
      currency: r.currency || defCurrency,
      country: r.country || defCountry,
    })))
    setShowDefaults(false)
    setDefaultsConfirmed(true)
  }

  // ── Import CSV rows ───────────────────────────────────────────────────────
  async function importCSV() {
    if (!myId || !csvRows.length) return
    setImporting(true)
    const batchName = csvFileName.replace(/\.[^.]+$/, '').slice(0, 40)
    let ok = 0, fail = 0

    for (const row of csvRows) {
      let { data: prod } = await supabase.from('products').select('id').eq('normalized_pn', row.pn).maybeSingle()
      if (!prod) {
        const { data: np } = await supabase.from('products').insert({
          normalized_pn: row.pn,
          brand: row.brand || 'UNKNOWN',
          description: row.description || null,
        }).select().single()
        prod = np
      }
      if (!prod) { fail++; continue }

      const { error } = await supabase.from('listings').insert({
        company_id: myId, product_id: prod.id, status: 'active',
        quantity: parseInt(row.qty) || null,
        price: parseFloat(row.price) || null,
        currency: row.currency || 'EUR',
        condition: row.condition || null,
        country: row.country || null,
        notes: row.notes || null,
        import_batch: batchName,
      })
      error ? fail++ : ok++
    }

    setImportDone({ ok, fail })
    setImporting(false)
    if (myId) loadGroups(myId)
  }

  // ── AI Scan ───────────────────────────────────────────────────────────────
  async function scanImage(file: File) {
    setScanning(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const b64 = (e.target?.result as string).split(',')[1]
      try {
        const res = await fetch('/api/scan-label', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, mediaType: file.type }),
        })
        const data = await res.json()
        if (data.pn) {
          setForm(f => ({ ...f, pn: normPN(data.pn), brand: (data.brand || '').toUpperCase(), description: data.description || '', model: data.model || '' }))
          setView('add')
        } else {
          setErr('Could not detect PN. Please enter manually.')
          setView('add')
        }
      } catch { setErr('Scan failed.'); setView('add') }
      setScanning(false)
    }
    reader.readAsDataURL(file)
  }

  // ── Delete listing ────────────────────────────────────────────────────────
  async function deleteListing(id: string) {
    await supabase.from('listings').update({ status: 'inactive' }).eq('id', id)
    setListings(prev => prev.filter(l => l.id !== id))
    setSelectedListing(null)
    if (myId) loadGroups(myId)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.02em' }}>📦 I am Selling</h1>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Manage your listings and stock</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setView('scan'); setImgPreview(null) }}
            style={{ padding: '8px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            📷 Scan Label
          </button>
          <button onClick={() => csvRef.current?.click()}
            style={{ padding: '8px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            📂 Import File
          </button>
          <input ref={csvRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { parseFile(f); setView('csv') }; e.target.value = '' }} />
          <button onClick={() => { setForm(EMPTY); setView('add'); setErr('') }}
            style={{ padding: '8px 14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            + Add Listing
          </button>
        </div>
      </div>

      {err && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err} <button onClick={() => setErr('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button></div>}
      {saved && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontSize: 13, marginBottom: 14 }}>✅ Listing added!</div>}

      {/* ── FINDER VIEW ─────────────────────────────────────────────────── */}
      {view === 'finder' && (
        <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', height: 'calc(100vh - 180px)' }}>

          {/* Column 1: Import groups */}
          <div style={{ width: 220, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              My Lists
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {groups.length === 0 ? (
                <div style={{ padding: 20, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>No listings yet</div>
              ) : groups.map(g => (
                <div key={g.id} onClick={() => setSelectedGroup(g.id)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: selectedGroup === g.id ? '#eff6ff' : 'white', borderLeft: selectedGroup === g.id ? '3px solid #2563eb' : '3px solid transparent' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{g.count} listings</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{new Date(g.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Listings in selected group */}
          <div style={{ width: 320, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {groups.find(g => g.id === selectedGroup)?.name || 'Select a list'}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingListings ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Loading...</div>
              ) : listings.length === 0 ? (
                <div style={{ padding: 20, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>No listings in this group</div>
              ) : listings.map(l => (
                <div key={l.id} onClick={() => setSelectedListing(l)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: selectedListing?.id === l.id ? '#f0fdf4' : 'white', borderLeft: selectedListing?.id === l.id ? '3px solid #059669' : '3px solid transparent' }}>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{l.product?.normalized_pn}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{l.product?.brand}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <CondBadge c={l.condition} />
                    {l.quantity && <span style={{ fontSize: 10, color: '#64748b' }}>×{l.quantity}</span>}
                    {l.price && <span style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>{CURRENCY_SYMBOL[l.currency] || ''}{l.price}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Detail panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Detail
            </div>
            {!selectedListing ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
                Select a listing to see details
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 22, fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{selectedListing.product?.normalized_pn}</div>
                  <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>{selectedListing.product?.brand}</div>
                  {selectedListing.product?.description && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{selectedListing.product.description}</div>}
                  <CondBadge c={selectedListing.condition} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    ['Quantity', selectedListing.quantity ? `${selectedListing.quantity} units` : '—'],
                    ['Price', selectedListing.price ? `${CURRENCY_SYMBOL[selectedListing.currency] || ''}${selectedListing.price} ${selectedListing.currency}` : '—'],
                    ['Country', selectedListing.country || '—'],
                    ['Listed', new Date(selectedListing.created_at).toLocaleDateString()],
                  ].map(([k, v]) => (
                    <div key={k} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{v}</div>
                    </div>
                  ))}
                </div>
                {selectedListing.notes && (
                  <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e', marginBottom: 16 }}>
                    {selectedListing.notes}
                  </div>
                )}
                <button onClick={() => deleteListing(selectedListing.id)}
                  style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Remove from marketplace
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADD SINGLE ──────────────────────────────────────────────────── */}
      {view === 'add' && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, maxWidth: 700 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Add Single Listing</div>
            <button onClick={() => setView('finder')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: '1 / span 2' }}>
              <label style={lbl}>Part Number *</label>
              <input value={form.pn} onChange={e => setForm({ ...form, pn: e.target.value.toUpperCase() })} style={inp({ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 })} placeholder="e.g. WS-C3750X-48T" />
            </div>
            <div>
              <label style={lbl}>Brand / Vendor</label>
              <input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value.toUpperCase() })} style={inp()} placeholder="CISCO, HUAWEI..." />
            </div>
            <div>
              <label style={lbl}>Model (optional)</label>
              <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} style={inp()} placeholder="e.g. WD2DUBBPE100" />
            </div>
            <div>
              <label style={lbl}>Condition</label>
              <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} style={inp()}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Quantity</label>
              <input type="number" min="1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} style={inp()} />
            </div>
            <div>
              <label style={lbl}>Unit Price</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={inp({ flex: 1 })} placeholder="0.00" />
                <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={inp({ width: 65 })}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={lbl}>Country</label>
              <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} style={inp()} placeholder="DE, TR, UK..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inp()} placeholder="Optional product description..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp()} placeholder="Warranty, rack-pull, firmware..." />
            </div>
          </div>
          <button onClick={saveSingle} disabled={saving || !form.pn}
            style={{ marginTop: 16, width: '100%', padding: 12, background: !form.pn ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: !form.pn ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
            {saving ? 'Saving...' : '+ Add to Marketplace'}
          </button>
        </div>
      )}

      {/* ── CSV IMPORT ──────────────────────────────────────────────────── */}
      {view === 'csv' && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, maxWidth: 800 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {csvFileName ? `📂 ${csvFileName}` : 'Import File'}
            </div>
            <button onClick={() => { setCsvRows([]); setView('finder'); setImportDone(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
          </div>

          {/* Parse warnings */}
          {parseWarnings.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
              ⚠️ {parseWarnings.join(' · ')}
            </div>
          )}

          {/* Defaults modal */}
          {showDefaults && !defaultsConfirmed && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                📋 Set defaults for missing values
              </div>
              <div style={{ fontSize: 12, color: '#0369a1', marginBottom: 14 }}>
                Some rows are missing condition/brand. Set a default for the whole file — rows that already have values will keep them.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <label style={lbl}>Default Condition</label>
                  <select value={defCondition} onChange={e => setDefCondition(e.target.value)} style={inp()}>
                    <option value="">— keep empty —</option>
                    {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Default Brand</label>
                  <input value={defBrand} onChange={e => setDefBrand(e.target.value.toUpperCase())} style={inp()} placeholder="HUAWEI..." />
                </div>
                <div>
                  <label style={lbl}>Default Currency</label>
                  <select value={defCurrency} onChange={e => setDefCurrency(e.target.value)} style={inp()}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Default Country</label>
                  <input value={defCountry} onChange={e => setDefCountry(e.target.value)} style={inp()} placeholder="TR, DE..." />
                </div>
              </div>
              <button onClick={confirmDefaults}
                style={{ marginTop: 14, padding: '9px 24px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Apply & Continue →
              </button>
            </div>
          )}

          {/* Preview table */}
          {csvRows.length > 0 && defaultsConfirmed && !importDone && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{csvRows.length.toLocaleString()} rows</span>
                <span style={{ color: '#94a3b8' }}>ready to import</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>Showing first 20</span>
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 14, border: '1px solid #f1f5f9', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['PN', 'Brand', 'Qty', 'Price', 'Ccy', 'Condition', 'Country', 'Description'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {csvRows.slice(0, 20).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{r.pn}</td>
                        <td style={{ padding: '5px 10px', color: r.brand ? '#475569' : '#f59e0b' }}>{r.brand || '⚠ missing'}</td>
                        <td style={{ padding: '5px 10px', color: r.qty ? '#0f172a' : '#94a3b8' }}>{r.qty || '—'}</td>
                        <td style={{ padding: '5px 10px' }}>{r.price || '—'}</td>
                        <td style={{ padding: '5px 10px', fontSize: 10 }}>{r.currency}</td>
                        <td style={{ padding: '5px 10px' }}><CondBadge c={r.condition} /></td>
                        <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{r.country || '—'}</td>
                        <td style={{ padding: '5px 10px', color: '#94a3b8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                      </tr>
                    ))}
                    {csvRows.length > 20 && <tr><td colSpan={8} style={{ padding: '5px 10px', color: '#94a3b8', fontSize: 11 }}>...{csvRows.length - 20} more rows</td></tr>}
                  </tbody>
                </table>
              </div>
              <button onClick={importCSV} disabled={importing}
                style={{ width: '100%', padding: 12, background: importing ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: importing ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {importing ? 'Importing...' : `Import ${csvRows.length.toLocaleString()} listings to Marketplace`}
              </button>
            </>
          )}

          {/* Done */}
          {importDone && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Import complete</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 20 }}>
                <div><div style={{ fontSize: 28, fontWeight: 800, color: '#15803d' }}>{importDone.ok}</div><div style={{ fontSize: 12, color: '#64748b' }}>Listed</div></div>
                <div><div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626' }}>{importDone.fail}</div><div style={{ fontSize: 12, color: '#64748b' }}>Failed</div></div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => { setCsvRows([]); setImportDone(null); setCsvFileName(''); setView('finder') }} style={{ padding: '9px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Back to My Listings</button>
                <button onClick={() => csvRef.current?.click()} style={{ padding: '9px 20px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Import Another File</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SCAN ────────────────────────────────────────────────────────── */}
      {view === 'scan' && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, maxWidth: 500 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>📷 Scan Product Label</div>
            <button onClick={() => setView('finder')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
            Take a photo of a product label, box, or part number sticker. AI will extract the PN and brand automatically.
          </div>
          {scanning ? (
            <div style={{ textAlign: 'center', padding: 30, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>AI scanning label...</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Extracting part number and brand</div>
            </div>
          ) : (
            <>
              {imgPreview && <img src={imgPreview} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => camRef.current?.click()}
                  style={{ flex: 1, padding: 20, background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                  📷<br /><span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Take Photo</span>
                  <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setImgPreview(URL.createObjectURL(f)); scanImage(f) }; e.target.value = '' }} />
                </button>
                <button onClick={() => fileRef.current?.click()}
                  style={{ flex: 1, padding: 20, background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                  🖼️<br /><span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Upload Image</span>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setImgPreview(URL.createObjectURL(f)); scanImage(f) }; e.target.value = '' }} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
