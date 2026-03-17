'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type Row = {
  pn: string; brand: string; model: string; qty: string; price: string
  currency: string; condition: string; warehouse_location: string; notes: string; description: string
  manufacture_date: string; stock_entry_date: string; condition_image: string
}
type ImportGroup = {
  id: string; name: string; created_at: string; count: number; source: 'csv' | 'manual'
}
type Listing = {
  id: string; product_id: string; quantity: number | null; price: number | null
  currency: string; condition: string | null; warehouse_location: string | null; notes: string | null
  manufacture_date: string | null; stock_entry_date: string | null
  condition_images: string[] | null
  created_at: string; status: string
  product: {
    id: string; normalized_pn: string; brand: string; description: string | null
    weight_kg: number | null; dimensions_cm: string | null; images: string[] | null
    condition_notes: string | null; target_price: number | null; target_currency: string | null
    datasheet_url: string | null; lifecycle_status: string | null; category: string | null
  }
}
type EditForm = {
  quantity: string; price: string; currency: string
  condition: string; warehouse_location: string; notes: string
  manufacture_date: string; stock_entry_date: string; condition_image: string
}
type ProductEditForm = {
  description: string; weight_kg: string; dimensions_cm: string
  condition_notes: string; target_price: string; target_currency: string
  datasheet_url: string; category: string; lifecycle_status: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPTY: Row = { pn: '', brand: '', model: '', qty: '', price: '', currency: 'EUR', condition: 'Used', warehouse_location: '', notes: '', description: '', manufacture_date: '', stock_entry_date: '', condition_image: '' }
const CONDITIONS = ['New', 'Used', 'Refurbished', 'New with Box', 'New Open Box', 'Brand New']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CNY']
const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CNY: '¥' }

function normHeader(h: string): string {
  const s = h.toLowerCase().replace(/[\s_\-\(\)\.\/\*\#№]/g, '')
  if (['pn','partnumber','partno','productcode','productno','code','sku','article','rowlabels','partnum','item'].includes(s)) return 'pn'
  if (['brand','manufacturer','mfr','vendor','oem','supplier'].includes(s)) return 'brand'
  if (['model','modelname','modelno'].includes(s)) return 'model'
  if (['description','desc','productdescription','configname','itemdescription','name','productname'].includes(s)) return 'description'
  if (['qty','quantity','availableqty','stock','sumofqty','qrequested','qtyrequested'].includes(s)) return 'qty'
  if (['price','unitprice','salesprice','exwunitprice','exwunitpricermb','unitpriceeur','unitpriceusd'].includes(s)) return 'price'
  if (['condition','cond','status','remarks'].includes(s)) return 'condition'
  if (['country','location','warehouse','loc','diaposone','warehouse_location'].includes(s)) return 'warehouse_location'
  if (['currency','cur'].includes(s)) return 'currency'
  if (['notes','note','comment','comments','leadtime','leadtimeday'].includes(s)) return 'notes'
  if (['no','number','rowno',''].includes(s)) return '_skip'
  return s
}
function normCondition(raw: string): string {
  const s = raw.toLowerCase().replace(/[\s&]/g, '')
  if (['new','brand-new','brandnew','brand new'].includes(s)) return 'New'
  if (['used','secondhand','2ndhand','uh','usedlanded'].includes(s)) return 'Used'
  if (['refurbished','ref','refurb','remanufactured'].includes(s)) return 'Refurbished'
  if (['tested&packed','tested','testedpacked','tp'].includes(s)) return 'Used'
  if (['spare','spares'].includes(s)) return 'Used'
  if (['forparts','parts','scrap','damaged'].includes(s)) return 'Used'
  return 'Used'
}
function normPN(raw: string): string {
  return raw.replace(/\*$/, '').toUpperCase().replace(/\s/g, '').trim()
}
function parsePrice(raw: string): { price: string; currency: string } {
  if (!raw) return { price: '', currency: 'EUR' }
  const s = raw.trim(); let currency = 'EUR'; let num = s
  if (s.startsWith('$')) { currency = 'USD'; num = s.slice(1) }
  else if (s.startsWith('€')) { currency = 'EUR'; num = s.slice(1) }
  else if (s.startsWith('£')) { currency = 'GBP'; num = s.slice(1) }
  else if (s.startsWith('¥') || s.toLowerCase().includes('rmb') || s.toLowerCase().includes('cny')) { currency = 'CNY'; num = s.replace(/[¥rmb cny]/gi, '') }
  num = num.replace(/,/g, '').trim()
  const parsed = parseFloat(num)
  return { price: isNaN(parsed) ? '' : String(parsed), currency }
}
function parseQty(raw: string): string {
  if (!raw) return ''
  const s = raw.toString().replace(/[,\s]/g, '')
  const range = s.match(/^(\d+)\s*[-–]\s*\d+$/)
  if (range) return range[1]
  const num = s.match(/^[\~≈]?(\d+)/)
  if (num) return num[1]
  return ''
}

const inp = (extra?: any): any => ({ padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box', ...extra })
const lbl: any = { fontSize: 10, color: '#64748b', display: 'block', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

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
export default function SellingPage() {
  const [myId, setMyId]             = useState<string | null>(null)
  const [view, setView]             = useState<'finder' | 'add' | 'csv' | 'scan'>('finder')

  // Finder
  const [groups, setGroups]               = useState<ImportGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [allListings, setAllListings]     = useState<Listing[]>([])
  const [visibleCount, setVisibleCount]   = useState(50)
  const listings = allListings.slice(0, visibleCount)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [loadingListings, setLoadingListings] = useState(false)
  const listScrollRef = useRef<HTMLDivElement>(null)

  // Edit
  const [editing, setEditing]         = useState(false)
  const [editForm, setEditForm]       = useState<EditForm>({ quantity: '', price: '', currency: 'EUR', condition: 'Used', warehouse_location: '', notes: '', manufacture_date: '', stock_entry_date: '', condition_image: '' })
  const [editSaving, setEditSaving]   = useState(false)
  const [editImgUrl, setEditImgUrl]   = useState<string | null>(null)
  const [condImgUploading, setCondImgUploading] = useState(false)
  const condImgRef = useRef<HTMLInputElement>(null)

  // Product edit
  const [productEditing, setProductEditing] = useState(false)
  const [productForm, setProductForm]       = useState<ProductEditForm>({ description: '', weight_kg: '', dimensions_cm: '', condition_notes: '', target_price: '', target_currency: 'EUR', datasheet_url: '', category: '', lifecycle_status: 'still_produced' })
  const [productSaving, setProductSaving]   = useState(false)
  const [productImgs, setProductImgs]       = useState<string[]>([])
  const [prodImgUploading, setProdImgUploading] = useState(false)
  const prodImgRef = useRef<HTMLInputElement>(null)

  // Bulk select
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [detailTab, setDetailTab]   = useState<'listing' | 'product'>('listing')

  // Single add
  const [form, setForm]     = useState<Row>(EMPTY)
  const [aiPnBusy, setAiPnBusy]           = useState(false)   // PN → desc+brand
  const [aiDescBusy, setAiDescBusy]       = useState(false)   // desc → PN+brand
  const [aiSuggestion, setAiSuggestion]   = useState<{pn?:string;brand?:string;description?:string} | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [err, setErr]       = useState('')

  // CSV
  const [csvRows, setCsvRows]             = useState<Row[]>([])
  const [csvFileName, setCsvFileName]     = useState('')
  const [importing, setImporting]         = useState(false)
  const [importDone, setImportDone]       = useState<{ ok: number; fail: number; errors: { pn: string; reason: string }[] } | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [diffReport, setDiffReport]       = useState<{ added: string[]; removed: string[]; updated: { pn: string; changes: string }[]; unchanged: number } | null>(null)
  const [showErrors, setShowErrors]       = useState(false)
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

  async function loadGroups(cid: string) {
    // Paginate to get all listings (past 1000 limit)
    let allData: any[] = []
    let from = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase.from('listings')
        .select('import_batch, created_at')
        .eq('company_id', cid).in('status', ['active','paused','closed'])
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      allData = allData.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }
    if (!allData.length) return
    const batchMap: Record<string, { count: number; created_at: string; source: 'csv' | 'manual' }> = {}
    allData.forEach((l: any) => {
      const key = l.import_batch || 'manual'
      if (!batchMap[key]) batchMap[key] = { count: 0, created_at: l.created_at, source: key === 'manual' ? 'manual' : 'csv' }
      batchMap[key].count++
    })
    const gs: ImportGroup[] = Object.entries(batchMap).map(([id, v]) => ({ id, name: id === 'manual' ? '✏️ Manual entries' : `📂 ${id}`, created_at: v.created_at, count: v.count, source: v.source }))
    const total = gs.reduce((s, g) => s + g.count, 0)
    const finalGs = total > 0 ? [{ id: '__all__', name: '📋 All Listings', created_at: '', count: total, source: 'csv' as const }, ...gs] : gs
    setGroups(finalGs)
    if (finalGs.length > 0 && !selectedGroup) setSelectedGroup(finalGs[0].id)
  }

  const loadListings = useCallback(async (cid: string, groupId: string) => {
    setLoadingListings(true)
    const PAGE = 1000
    let allData: any[] = []
    let from = 0
    while (true) {
      const q = supabase.from('listings')
        .select('*, product:product_id(id, normalized_pn, brand, description, weight_kg, dimensions_cm, images, condition_notes, target_price, target_currency, datasheet_url, lifecycle_status, category)')
        .eq('company_id', cid).in('status', ['active','paused','closed'])
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (groupId !== '__all__') {
        if (groupId === 'manual') q.is('import_batch', null)
        else q.eq('import_batch', groupId)
      }
      const { data } = await q
      if (!data || data.length === 0) break
      allData = allData.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }
    // Deduplicate by id (safety net for pagination edge cases)
    const seen = new Set<string>()
    const unique = allData.filter(l => { if (seen.has(l.id)) return false; seen.add(l.id); return true })
    setAllListings(unique as any)
    setVisibleCount(50)
    setSelected(new Set())
    setLoadingListings(false)
  }, [])

  useEffect(() => { if (myId && selectedGroup) loadListings(myId, selectedGroup) }, [myId, selectedGroup, loadListings])

  // Infinite scroll handler
  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        setVisibleCount(prev => Math.min(prev + 50, allListings.length))
      }
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [allListings.length])

  // ── Edit ──────────────────────────────────────────────────────────────────
  function openEdit(l: Listing) {
    setEditForm({ quantity: l.quantity ? String(l.quantity) : '', price: l.price ? String(l.price) : '', currency: l.currency || 'EUR', condition: l.condition || 'Used', warehouse_location: l.warehouse_location || '', notes: l.notes || '', manufacture_date: l.manufacture_date || '', stock_entry_date: l.stock_entry_date || '', condition_image: l.condition_images?.[0] ?? '' })
    setEditImgUrl(l.condition_images?.[0] ?? null)
    setEditing(true)
  }

  async function saveEdit() {
    if (!selectedListing) return
    setEditSaving(true)
    const updates = { quantity: parseInt(editForm.quantity) || null, price: parseFloat(editForm.price) || null, currency: editForm.currency, condition: editForm.condition || null, warehouse_location: editForm.warehouse_location || null, notes: editForm.notes || null, condition_images: editImgUrl ? [editImgUrl] : [], manufacture_date: editForm.manufacture_date || null, stock_entry_date: editForm.stock_entry_date || null }
    const { error } = await supabase.from('listings').update(updates).eq('id', selectedListing.id)
    if (!error) {
      const updated = { ...selectedListing, ...updates }
      setSelectedListing(updated)
      setAllListings(prev => prev.map(l => l.id === selectedListing.id ? updated : l))
      setEditing(false)
    } else { setErr(error.message) }
    setEditSaving(false)
  }

  // ── Upload condition image → Supabase Storage ─────────────────────────────
  // ── S3 upload helper ─────────────────────────────────────────────────────
  async function uploadToS3(file: File, folder: 'products' | 'listings'): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErr('Not logged in'); return null }

      const listingId = selectedListing?.id ?? 'draft'
      const res = await fetch('/api/media/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          listingId: folder === 'listings' ? listingId : `product-${listingId}`,
        }),
      })
      if (!res.ok) { setErr('Failed to get upload URL'); return null }
      const { presignedUrl, publicUrl } = await res.json()

      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!uploadRes.ok) { setErr('Upload to S3 failed'); return null }
      return publicUrl
    } catch (e: any) {
      setErr(e.message || 'Upload failed')
      return null
    }
  }

  function openProductEdit(l: Listing) {
    const p = l.product
    setProductForm({
      description:      p.description       || '',
      weight_kg:        p.weight_kg         ? String(p.weight_kg) : '',
      dimensions_cm:    p.dimensions_cm     || '',
      condition_notes:  p.condition_notes   || '',
      target_price:     p.target_price      ? String(p.target_price) : '',
      target_currency:  p.target_currency   || 'EUR',
      datasheet_url:    p.datasheet_url     || '',
      category:         p.category          || '',
      lifecycle_status: p.lifecycle_status  || 'active',
    })
    setProductImgs(p.images || [])
    setProductEditing(true)
  }

  async function saveProduct() {
    if (!selectedListing) return
    setProductSaving(true)
    const { error } = await supabase.from('products').update({
      description:      productForm.description      || null,
      weight_kg:        parseFloat(productForm.weight_kg)    || null,
      dimensions_cm:    productForm.dimensions_cm    || null,
      condition_notes:  productForm.condition_notes  || null,
      target_price:     parseFloat(productForm.target_price) || null,
      target_currency:  productForm.target_currency  || 'EUR',
      datasheet_url:    productForm.datasheet_url    || null,
      category:         productForm.category         || null,
      lifecycle_status: productForm.lifecycle_status || 'active',
      images:           productImgs.length > 0 ? productImgs : null,
      updated_at:       new Date().toISOString(),
    }).eq('id', selectedListing.product.id)
    if (!error) {
      // Update local state
      const updatedProduct = {
        ...selectedListing.product,
        ...productForm,
        weight_kg: parseFloat(productForm.weight_kg) || null,
        target_price: parseFloat(productForm.target_price) || null,
        images: productImgs,
      }
      const updated = { ...selectedListing, product: updatedProduct }
      setSelectedListing(updated as any)
      setAllListings(prev => prev.map(l => l.id === selectedListing.id ? updated as any : l))
      setProductEditing(false)
    } else { setErr(error.message) }
    setProductSaving(false)
  }



  // ── Bulk delete ───────────────────────────────────────────────────────────
  async function bulkDelete() {
    if (!selected.size || !myId) return
    if (!confirm(`Remove ${selected.size} listing${selected.size > 1 ? 's' : ''} from marketplace?`)) return
    setBulkDeleting(true)
    await supabase.from('listings').update({ status: 'inactive' }).in('id', [...selected])
    if (selectedListing && selected.has(selectedListing.id)) setSelectedListing(null)
    setSelected(new Set()); setSelectMode(false)
    if (myId && selectedGroup) { loadListings(myId, selectedGroup); loadGroups(myId) }
    setBulkDeleting(false)
  }

  async function deleteGroup(groupId: string) {
    if (!myId) return
    const g = groups.find(g => g.id === groupId)
    if (!confirm(`Delete all ${g?.count || ''} listings in "${g?.name}"? This cannot be undone.`)) return
    if (groupId === 'manual') {
      await supabase.from('listings').update({ status: 'inactive' }).eq('company_id', myId).is('import_batch', null)
    } else {
      await supabase.from('listings').update({ status: 'inactive' }).eq('company_id', myId).eq('import_batch', groupId)
    }
    setSelectedListing(null)
    setSelectedGroup('__all__')
    loadGroups(myId)
  }

  async function deleteListing(id: string) {
    await supabase.from('listings').update({ status: 'inactive' }).eq('id', id)
    setAllListings(prev => prev.filter(l => l.id !== id))
    setSelectedListing(null)
    if (myId) loadGroups(myId)
  }

  async function updateListingStatus(id: string, newStatus: 'active' | 'paused' | 'closed') {
    await supabase.from('listings').update({ status: newStatus }).eq('id', id)
    setAllListings(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l))
    if (selectedListing?.id === id) setSelectedListing(prev => prev ? { ...prev, status: newStatus } : null)
    if (myId) loadGroups(myId)
  }

  function downloadTemplate() {
    const headers = ['pn', 'brand', 'quantity', 'price', 'currency', 'condition', 'warehouse_location', 'manufacture_date', 'stock_entry_date', 'notes', 'description']
    const example = ['7750-SR-12', 'NOKIA', '2', '14500', 'EUR', 'Used - Excellent', 'DE-WH1', '2022-01-01', '2024-06-01', 'Rack pull, tested', 'Nokia 7750 SR-12 chassis']
    const csv = [headers.join(','), example.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'spareshare_import_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function exportListings() {
    const rows = allListings.map(l => [
      l.product?.normalized_pn || '',
      l.product?.brand || '',
      l.quantity || '',
      l.price || '',
      l.currency || '',
      l.condition || '',
      l.warehouse_location || '',
      l.status || '',
      l.notes || '',
    ])
    const headers = ['pn', 'brand', 'quantity', 'price', 'currency', 'condition', 'warehouse_location', 'status', 'notes']
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `spareshare_listings_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Single save ───────────────────────────────────────────────────────────
  // ── AI fill: PN → description + brand ─────────────────────────────────────
  async function fillFromPN() {
    if (!form.pn.trim()) return
    setAiPnBusy(true); setAiSuggestion(null)
    // First check DB
    const { data: existing } = await supabase.from('products')
      .select('brand, description').eq('normalized_pn', normPN(form.pn)).maybeSingle()
    if (existing?.brand || existing?.description) {
      setForm(f => ({ ...f, brand: existing.brand || f.brand, description: existing.description || f.description }))
      setAiPnBusy(false); return
    }
    // Ask Claude
    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          skipTools: true,
          system: 'You are a B2B electronics parts expert. Given a part number, return ONLY a JSON object with keys: brand (manufacturer name, uppercase), description (1 sentence technical description). If unknown, make a best guess based on PN format. Return only valid JSON, no markdown.',
          messages: [{ role: 'user', content: `Part number: ${form.pn}` }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setForm(f => ({ ...f, brand: parsed.brand || f.brand, description: parsed.description || f.description }))
      setAiSuggestion(parsed)
    } catch (_) {}
    setAiPnBusy(false)
  }

  // ── AI fill: description → PN + brand ──────────────────────────────────────
  async function fillFromDesc() {
    if (!form.description.trim()) return
    setAiDescBusy(true); setAiSuggestion(null)
    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          skipTools: true,
          system: 'You are a B2B electronics parts expert. Given a product description, return ONLY a JSON object with keys: pn (most likely part number or model number), brand (manufacturer, uppercase), confidence (high/medium/low). Return only valid JSON, no markdown.',
          messages: [{ role: 'user', content: `Product description: ${form.description}` }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setAiSuggestion(parsed)
      // Don't auto-fill PN — show suggestion for user to confirm
    } catch (_) {}
    setAiDescBusy(false)
  }

  async function saveSingle() {
    if (!myId || !form.pn) return
    setSaving(true); setErr('')
    const pn = normPN(form.pn)
    const fullDesc = [form.model, form.description].filter(Boolean).join(' — ') || null
    let { data: prod } = await supabase.from('products').select('id').eq('normalized_pn', pn).maybeSingle()
    if (!prod) {
      const { data: np } = await supabase.from('products').insert({ normalized_pn: pn, brand: form.brand.toUpperCase() || 'UNKNOWN', description: fullDesc }).select().single()
      prod = np
    }
    if (!prod) { setErr('Failed to create product'); setSaving(false); return }
    const { error } = await supabase.from('listings').insert({ company_id: myId, product_id: prod!.id, status: 'active', quantity: parseInt(form.qty) || null, price: parseFloat(form.price) || null, currency: form.currency, condition: form.condition || null, warehouse_location: form.warehouse_location || null, notes: form.notes || null, manufacture_date: form.manufacture_date || null, stock_entry_date: form.stock_entry_date || null, import_batch: null, condition_images: form.condition_image ? [form.condition_image] : [] })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaved(true); setForm(EMPTY)
    setTimeout(() => { setSaved(false); setView('finder'); if (myId) loadGroups(myId) }, 1500)
    setSaving(false)
  }

  // ── CSV parse ─────────────────────────────────────────────────────────────
  function parseFile(file: File) {
    setCsvRows([]); setImportDone(null); setParseWarnings([]); setDefaultsConfirmed(false); setCsvFileName(file.name)
    const process = (raw: any[][]) => {
      if (raw.length < 2) { setErr('Empty or unreadable file'); return }
      let headerIdx = 0
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        const row = raw[i].map((c: any) => String(c || '').toLowerCase())
        if (row.some(c => ['pn','part number','partnumber','article','sku','code','row labels'].includes(c.trim()))) { headerIdx = i; break }
      }
      const hdrs = raw[headerIdx].map((h: any) => normHeader(String(h || '').trim()))
      if (!hdrs.includes('pn')) { setErr('❌ No Part Number column found. Need: PN, Part Number, Article, SKU, or Code column.'); return }
      const warnings: string[] = []
      const hasCurrency = hdrs.includes('currency')
      if (!hdrs.includes('condition')) warnings.push('No condition column — will ask for default')
      if (!hdrs.includes('brand')) warnings.push('No brand/vendor column — will ask for default')
      const rows: Row[] = []
      raw.slice(headerIdx + 1).forEach((rawRow: any[], idx) => {
        const obj: any = {}
        hdrs.forEach((h, i) => { if (h !== '_skip') obj[h] = String(rawRow[i] || '').trim() })
        const pn = normPN(obj.pn || '')
        if (!pn || pn === 'N/A' || pn === 'NA') return
        const qtyRaw = parseQty(obj.qty || '')
        if (!qtyRaw && obj.qty) warnings.push(`Row ${idx + 2}: qty "${obj.qty}" could not be parsed`)
        const { price, currency: priceCurrency } = parsePrice(obj.price || '')
        const notesExtra = (obj.condition || '').toUpperCase().includes('LANDED') ? 'LANDED' : ''
        rows.push({ pn, brand: (obj.brand || '').toUpperCase(), model: obj.model || '', description: obj.model && obj.description ? `${obj.model} — ${obj.description}` : obj.model || obj.description || '', qty: qtyRaw, price, currency: obj.currency || (hasCurrency ? '' : priceCurrency) || 'EUR', condition: normCondition(obj.condition || ''), warehouse_location: obj.warehouse_location || obj.country || '', notes: [obj.notes, notesExtra].filter(Boolean).join(' '), manufacture_date: obj.manufacture_date || '', stock_entry_date: obj.stock_entry_date || obj.date || '', condition_image: '' })
      })
      if (rows.length === 0) { setErr('No valid rows found'); return }
      setParseWarnings(warnings); setCsvRows(rows)
      const needsDefaults = rows.some(r => !r.condition) || rows.some(r => !r.brand)
      if (needsDefaults) {
        setShowDefaults(true)
        const fc = rows.find(r => r.condition); const fb = rows.find(r => r.brand)
        if (fc) setDefCondition(fc.condition); if (fb) setDefBrand(fb.brand)
      } else { setDefaultsConfirmed(true) }
    }
    if (file.name.match(/\.xlsx?$/i)) {
      const XLSX = (window as any).XLSX
      if (!XLSX) { setErr('Parser loading, try again in 2s'); return }
      const reader = new FileReader()
      reader.onload = e => { const wb = XLSX.read(e.target?.result, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; process(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })) }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => { const text = e.target?.result as string; const lines = text.trim().split(/\r?\n/).filter(l => l.trim()); const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','; process(lines.map(l => l.split(delim).map(v => v.replace(/^["']|["']$/g, '').trim()))) }
      reader.readAsText(file)
    }
  }

  function confirmDefaults() {
    setCsvRows(prev => prev.map(r => ({ ...r, condition: r.condition || defCondition || 'used', brand: r.brand || defBrand || 'UNKNOWN', currency: r.currency || defCurrency, warehouse_location: r.warehouse_location || defCountry })))
    setShowDefaults(false); setDefaultsConfirmed(true)
  }

  async function importCSV() {
    if (!myId || !csvRows.length) return
    setImporting(true); setDiffReport(null)
    const batchName = csvFileName.replace(/\.[^.]+$/, '').slice(0, 40)
    let ok = 0, fail = 0; const errors: { pn: string; reason: string }[] = []
    const { data: existingListings } = await supabase.from('listings').select('id, product:product_id(normalized_pn), quantity, price, currency, condition').eq('company_id', myId).eq('import_batch', batchName).eq('status', 'active')
    const existingPNs = new Map<string, any>()
    ;(existingListings || []).forEach((l: any) => { if (l.product?.normalized_pn) existingPNs.set(l.product.normalized_pn, l) })
    const newPNs = new Set(csvRows.map(r => r.pn))
    const added: string[] = []; const updated: { pn: string; changes: string }[] = []
    for (const row of csvRows) {
      try {
        if (!row.pn || row.pn.length < 2) { errors.push({ pn: row.pn || '(empty)', reason: 'Invalid PN' }); fail++; continue }
        let { data: prod } = await supabase.from('products').select('id').eq('normalized_pn', row.pn).maybeSingle()
        if (!prod) {
          const { data: np, error: prodErr } = await supabase.from('products').insert({ normalized_pn: row.pn, brand: row.brand || 'UNKNOWN', description: row.description || null }).select().single()
          if (prodErr || !np) { errors.push({ pn: row.pn, reason: `Product create: ${prodErr?.message}` }); fail++; continue }
          prod = np
        }
        const { data: existInBatch } = await supabase.from('listings').select('id').eq('company_id', myId).eq('product_id', prod!.id).eq('import_batch', batchName).eq('status', 'active').maybeSingle()
        if (existInBatch) {
          const { error: updErr } = await supabase.from('listings').update({ quantity: parseInt(row.qty) || null, price: parseFloat(row.price) || null, currency: row.currency || 'EUR', condition: row.condition || null }).eq('id', existInBatch.id)
          if (updErr) { errors.push({ pn: row.pn, reason: updErr.message }); fail++; continue }
          const old = existingPNs.get(row.pn)
          if (old) { const changes: string[] = []; if (old.quantity !== (parseInt(row.qty) || null)) changes.push(`qty: ${old.quantity}→${row.qty}`); if (old.price !== (parseFloat(row.price) || null)) changes.push(`price: ${old.price}→${row.price}`); if (changes.length) updated.push({ pn: row.pn, changes: changes.join(', ') }) }
          ok++
        } else {
          const { count: otherCount } = await supabase.from('listings').select('*', { count: 'exact', head: true }).eq('company_id', myId).eq('product_id', prod!.id).eq('status', 'active').neq('import_batch', batchName)
          const { error: insErr } = await supabase.from('listings').insert({ company_id: myId, product_id: prod!.id, status: 'active', quantity: parseInt(row.qty) || null, price: parseFloat(row.price) || null, currency: row.currency || 'EUR', condition: row.condition || null, warehouse_location: row.warehouse_location || null, notes: row.notes || null, manufacture_date: row.manufacture_date || null, stock_entry_date: row.stock_entry_date || null, import_batch: batchName, cross_list_duplicate: (otherCount || 0) > 0 })
          if (insErr) { errors.push({ pn: row.pn, reason: insErr.message }); fail++; continue }
          if (!existingPNs.has(row.pn)) added.push(row.pn)
          ok++
        }
      } catch (e: any) { errors.push({ pn: row.pn, reason: e?.message || 'Error' }); fail++ }
    }
    const removed = [...existingPNs.keys()].filter(pn => !newPNs.has(pn))
    if (existingPNs.size > 0) setDiffReport({ added, removed, updated, unchanged: Math.max(0, ok - added.length - updated.length) })
    setImportDone({ ok, fail, errors }); setImporting(false)
    if (myId) loadGroups(myId)
  }

  async function scanImage(file: File) {
    setScanning(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const b64 = (e.target?.result as string).split(',')[1]
      try {
        const res = await fetch('/api/scan-label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: b64, mediaType: file.type }) })
        const data = await res.json()
        if (data.pn) { setForm(f => ({ ...f, pn: normPN(data.pn), brand: (data.brand || '').toUpperCase(), description: data.description || '', model: data.model || '' })); setView('add') }
        else { setErr('Could not detect PN.'); setView('add') }
      } catch { setErr('Scan failed.'); setView('add') }
      setScanning(false)
    }
    reader.readAsDataURL(file)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.02em' }}>📦 I am Selling</h1>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Manage your listings and stock</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setView('scan'); setImgPreview(null) }} style={{ padding: '8px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#64748b' }}>📷 Scan Label</button>
          <button onClick={() => csvRef.current?.click()} style={{ padding: '8px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#64748b' }}>📂 Import File</button>
          <input ref={csvRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { parseFile(f); setView('csv') }; e.target.value = '' }} />
          <button onClick={() => { setForm(EMPTY); setView('add'); setErr('') }} style={{ padding: '8px 14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+ Add Listing</button>
        </div>
      </div>

      {err && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err} <button onClick={() => setErr('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button></div>}
      {saved && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontSize: 13, marginBottom: 14 }}>✅ Listing added!</div>}

      {/* ══ FINDER ══════════════════════════════════════════════════════════ */}
      {view === 'finder' && (
        <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', height: 'calc(100vh - 180px)' }}>

          {/* Col 1 — Groups */}
          <div style={{ width: 220, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>My Lists</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {groups.length === 0
                ? <div style={{ padding: 20, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>No listings yet</div>
                : groups.map(g => (
                  <div key={g.id}
                    style={{ borderBottom: '1px solid #f8fafc', background: selectedGroup === g.id ? '#eff6ff' : 'white', borderLeft: selectedGroup === g.id ? '3px solid #2563eb' : '3px solid transparent', display: 'flex', alignItems: 'stretch' }}>
                    <div onClick={() => { setSelectedGroup(g.id); setSelectMode(false); setSelected(new Set()) }}
                      style={{ flex: 1, padding: '10px 14px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{g.count} listings</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{g.created_at ? new Date(g.created_at).toLocaleDateString() : ''}</div>
                    </div>
                    {g.id !== '__all__' && (
                      <button onClick={e => { e.stopPropagation(); deleteGroup(g.id) }}
                        style={{ padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, borderLeft: '1px solid #f1f5f9' }}
                        title="Delete all listings in this group">
                        🗑
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* Col 2 — Listings with bulk toolbar */}
          <div style={{ width: 300, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {groups.find(g => g.id === selectedGroup)?.name || 'Listings'}
              </span>
              {allListings.length > 0 && !selectMode && (
                <button onClick={exportListings} style={{ fontSize: 10, padding: '2px 8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  ⬇ Export
                </button>
              )}
              {allListings.length > 0 && (
                selectMode ? (
                  <>
                    <button onClick={() => setSelected(prev => prev.size === allListings.length ? new Set() : new Set(allListings.map(l => l.id)))}
                      style={{ fontSize: 10, padding: '2px 7px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {selected.size === allListings.length ? 'None' : 'All'}
                    </button>
                    {selected.size > 0 && (
                      <button onClick={bulkDelete} disabled={bulkDeleting}
                        style={{ fontSize: 10, padding: '2px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {bulkDeleting ? '...' : `✕ ${selected.size}`}
                      </button>
                    )}
                    <button onClick={() => { setSelectMode(false); setSelected(new Set()) }}
                      style={{ fontSize: 10, padding: '2px 7px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                  </>
                ) : (
                  <button onClick={() => setSelectMode(true)}
                    style={{ fontSize: 10, padding: '2px 7px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', color: '#64748b' }}>☑ Select</button>
                )
              )}
            </div>
            <div ref={listScrollRef} style={{ flex: 1, overflowY: 'auto' }}>
              {loadingListings
                ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Loading...</div>
                : allListings.length === 0
                  ? <div style={{ padding: 20, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>No listings in this group</div>
                  : listings.map(l => (
                    <div key={l.id}
                      onClick={() => selectMode ? setSelected(prev => { const n = new Set(prev); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n }) : (setSelectedListing(l), setEditing(false), setProductEditing(false), setDetailTab('listing'))}
                      style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start', background: selected.has(l.id) ? '#fef2f2' : selectedListing?.id === l.id ? '#f0fdf4' : 'white', borderLeft: selected.has(l.id) ? '3px solid #dc2626' : selectedListing?.id === l.id ? '3px solid #059669' : '3px solid transparent' }}>
                      {selectMode && (
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${selected.has(l.id) ? '#dc2626' : '#cbd5e1'}`, background: selected.has(l.id) ? '#dc2626' : 'white', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selected.has(l.id) && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
                        </div>
                      )}
                      {/* Thumbnail */}
                      {(l.condition_images?.[0] || l.product?.images?.[0]) ? (
                        <img src={l.condition_images?.[0] || l.product.images![0]} alt=""
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0 4px', borderRadius: 3 }}>{l.product?.brand || '—'}</span>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.product?.normalized_pn}</span>
                        </div>
                        {l.product?.description && (
                          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.product.description}</div>
                        )}
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <CondBadge c={l.condition} />
                          {l.quantity && <span style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>×{l.quantity}</span>}
                          {l.price && <span style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>{CURRENCY_SYMBOL[l.currency] || ''}{l.price}</span>}
                          {l.status === 'paused' && <span style={{ fontSize: 9, padding: '1px 5px', background: '#fffbeb', color: '#92400e', borderRadius: 4, fontWeight: 600 }}>⏸ PAUSED</span>}
                          {l.status === 'closed' && <span style={{ fontSize: 9, padding: '1px 5px', background: '#f1f5f9', color: '#64748b', borderRadius: 4, fontWeight: 600 }}>✕ CLOSED</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                          {l.warehouse_location && <span style={{ fontSize: 9, color: '#64748b' }}>📍{l.warehouse_location}</span>}
                          {l.manufacture_date && <span style={{ fontSize: 9, color: '#94a3b8' }}>DOM:{new Date(l.manufacture_date).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}</span>}
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>🕐{new Date(l.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              {visibleCount < allListings.length && (
                <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>
                  ↓ Showing {visibleCount.toLocaleString()} of {allListings.length.toLocaleString()} — scroll for more
                </div>
              )}
            </div>
          </div>

          {/* Col 3 — Detail / Edit */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

            {/* Tab bar */}
            <div style={{ padding: '0 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 0 }}>
              {(['listing', 'product'] as const).map(tab => (
                <button key={tab} onClick={() => { setDetailTab(tab); setEditing(false); setProductEditing(false) }}
                  style={{ padding: '9px 14px', fontSize: 11, fontWeight: detailTab === tab ? 700 : 400, color: detailTab === tab ? '#0f172a' : '#94a3b8', background: 'none', border: 'none', borderBottom: detailTab === tab ? '2px solid #0f172a' : '2px solid transparent', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {tab === 'listing' ? '🏷 Listing' : '📦 Product'}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {/* Tab-specific action buttons */}
              {selectedListing && detailTab === 'listing' && !editing && (
                <button onClick={() => openEdit(selectedListing)} style={{ fontSize: 11, padding: '3px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', color: '#0f172a', fontWeight: 600 }}>✏️ Edit</button>
              )}
              {selectedListing && detailTab === 'listing' && editing && (
                <>
                  <button onClick={saveEdit} disabled={editSaving} style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>{editSaving ? '...' : '✓ Save'}</button>
                  <button onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '3px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', color: '#94a3b8', marginLeft: 4 }}>Cancel</button>
                </>
              )}
              {selectedListing && detailTab === 'product' && !productEditing && (
                <button onClick={() => openProductEdit(selectedListing)} style={{ fontSize: 11, padding: '3px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', color: '#0f172a', fontWeight: 600 }}>✏️ Edit</button>
              )}
              {selectedListing && detailTab === 'product' && productEditing && (
                <>
                  <button onClick={saveProduct} disabled={productSaving} style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>{productSaving ? '...' : '✓ Save'}</button>
                  <button onClick={() => setProductEditing(false)} style={{ fontSize: 11, padding: '3px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', color: '#94a3b8', marginLeft: 4 }}>Cancel</button>
                </>
              )}
            </div>

            {!selectedListing ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Select a listing to see details</div>
            ) : detailTab === 'listing' ? (
              editing ? (
                /* ─ LISTING EDIT FORM ─ */
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <div style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{selectedListing.product?.normalized_pn}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>{selectedListing.product?.brand}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Quantity</label>
                      <input type="number" value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} style={inp()} placeholder="e.g. 25" />
                    </div>
                    <div>
                      <label style={lbl}>Unit Price</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} style={inp({ flex: 1 })} placeholder="0.00" />
                        <select value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))} style={inp({ width: 60 })}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Condition</label>
                      <select value={editForm.condition} onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))} style={inp()}>
                        {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Country</label>
                      <input value={editForm.warehouse_location} onChange={e => setEditForm(f => ({ ...f, warehouse_location: e.target.value }))} style={inp()} placeholder="DE, warehouse-A, FR-PARIS..." />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={lbl}>Notes</label>
                      <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={inp()} placeholder="Warranty, rack-pull, firmware, new: X pcs, used: Y pcs..." />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={lbl}>Manufacture Date</label>
                        <input type="date" value={editForm.manufacture_date} onChange={e => setEditForm(f => ({ ...f, manufacture_date: e.target.value }))} style={inp()} />
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Production / DOM date</div>
                      </div>
                      <div>
                        <label style={lbl}>Stock Entry Date</label>
                        <input type="date" value={editForm.stock_entry_date} onChange={e => setEditForm(f => ({ ...f, stock_entry_date: e.target.value }))} style={inp()} />
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>When added to stock</div>
                      </div>
                    </div>
                  </div>
                  {/* Condition photo */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Condition Photo</label>
                    <div style={{ marginTop: 4 }}>
                      {editImgUrl ? (
                        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                          <img src={editImgUrl} alt="condition" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, border: '1px solid #e2e8f0', objectFit: 'cover', display: 'block' }} />
                          <button onClick={() => setEditImgUrl(null)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 11 }}>✕</button>
                          <button onClick={() => condImgRef.current?.click()} style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 10 }}>Change</button>
                        </div>
                      ) : (
                        <button onClick={() => condImgRef.current?.click()} disabled={condImgUploading}
                          style={{ padding: '12px', background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 8, cursor: condImgUploading ? 'not-allowed' : 'pointer', fontSize: 12, color: '#64748b', width: '100%', textAlign: 'center' }}>
                          {condImgUploading ? '⏳ Uploading to S3...' : '🖼️ Upload condition photo'}
                        </button>
                      )}
                      <input ref={condImgRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={async e => {
                          const f = e.target.files?.[0]; if (!f) return
                          setCondImgUploading(true)
                          const url = await uploadToS3(f, 'listings')
                          if (url) setEditImgUrl(url)
                          setCondImgUploading(false)
                          e.target.value = ''
                        }} />
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Uploaded to S3 → URL saved to Supabase</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                    <button onClick={saveEdit} disabled={editSaving} style={{ flex: 1, padding: '10px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{editSaving ? 'Saving...' : '✓ Save Changes'}</button>
                    <button onClick={() => deleteListing(selectedListing.id)} style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
                  </div>
                </div>
              ) : (
                /* ─ LISTING DETAIL VIEW ─ */
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <div style={{ marginBottom: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {/* Main image */}
                    {(selectedListing.condition_images?.[0] || selectedListing.product?.images?.[0]) ? (
                      <img src={selectedListing.condition_images?.[0] || selectedListing.product.images![0]} alt=""
                        onClick={() => window.open((selectedListing.condition_images?.[0] || selectedListing.product.images![0])!, '_blank')}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0', flexShrink: 0, cursor: 'pointer' }} />
                    ) : (
                      <div style={{ width: 80, height: 80, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📦</div>
                    )}
                    <div>
                      <div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{selectedListing.product?.normalized_pn}</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{selectedListing.product?.brand}</div>
                      <CondBadge c={selectedListing.condition} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {([
                      ['Quantity', selectedListing.quantity ? `${selectedListing.quantity} units` : '—'],
                      ['Price', selectedListing.price ? `${CURRENCY_SYMBOL[selectedListing.currency] || ''}${selectedListing.price} ${selectedListing.currency}` : '—'],
                      ['Country', (selectedListing as any).country || '—'],
                      ['Listed', new Date(selectedListing.created_at).toLocaleDateString()],
                    ] as [string,string][]).map(([k, v]) => (
                      <div key={k} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6 }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {selectedListing.notes && <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e', marginBottom: 14 }}>{selectedListing.notes}</div>}
                  {selectedListing.condition_images?.[0] && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Condition Photo</div>
                      <img src={selectedListing.condition_images?.[0]} alt="condition" onClick={() => window.open(selectedListing.condition_images?.[0]!, '_blank')}
                        style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: '1px solid #e2e8f0', objectFit: 'cover', display: 'block', cursor: 'pointer' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(selectedListing)} style={{ flex: 1, minWidth: 100, padding: '8px', background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✏️ Edit</button>
                    {selectedListing.status !== 'active' && <button onClick={() => updateListingStatus(selectedListing.id, 'active')} style={{ padding: '8px 10px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>▶ Active</button>}
                    {selectedListing.status !== 'paused' && <button onClick={() => updateListingStatus(selectedListing.id, 'paused')} style={{ padding: '8px 10px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>⏸ Pause</button>}
                    {selectedListing.status !== 'closed' && <button onClick={() => updateListingStatus(selectedListing.id, 'closed')} style={{ padding: '8px 10px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕ Close</button>}
                  </div>
                </div>
              )
            ) : (
              /* ═══════════════════════════════════════════════════════
                 PRODUCT TAB
              ═══════════════════════════════════════════════════════ */
              productEditing ? (
                /* ─ PRODUCT EDIT FORM ─ */
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <div style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{selectedListing.product?.normalized_pn}</div>
                  <div style={{ fontSize: 12, color: '#7c3aed', marginBottom: 16 }}>Editing product master data — visible to all companies</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={lbl}>Description</label>
                      <textarea value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))}
                        style={{ ...inp(), height: 64, resize: 'vertical' }} placeholder="Full product description..." />
                    </div>
                    <div>
                      <label style={lbl}>Category</label>
                      <input value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))} style={inp()} placeholder="e.g. Switch, Router, SFP..." />
                    </div>
                    <div>
                      <label style={lbl}>Lifecycle Status</label>
                      <select value={productForm.lifecycle_status} onChange={e => setProductForm(f => ({ ...f, lifecycle_status: e.target.value }))} style={inp()}>
                        <option value="still_produced">Still Produced</option>
                        <option value="eop">EOP — End of Production</option>
                        <option value="eos">EOS — End of Sale</option>
                        <option value="eol">EOL — End of Life</option>
                        <option value="eol">End of Life</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Weight (kg)</label>
                      <input type="number" step="0.001" value={productForm.weight_kg} onChange={e => setProductForm(f => ({ ...f, weight_kg: e.target.value }))} style={inp()} placeholder="e.g. 4.500" />
                    </div>
                    <div>
                      <label style={lbl}>Dimensions (cm) W×D×H</label>
                      <input value={productForm.dimensions_cm} onChange={e => setProductForm(f => ({ ...f, dimensions_cm: e.target.value }))} style={inp()} placeholder="e.g. 44.5 × 36.0 × 4.4" />
                    </div>
                    <div>
                      <label style={lbl}>Target Price</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="number" value={productForm.target_price} onChange={e => setProductForm(f => ({ ...f, target_price: e.target.value }))} style={inp({ flex: 1 })} placeholder="0.00" />
                        <select value={productForm.target_currency} onChange={e => setProductForm(f => ({ ...f, target_currency: e.target.value }))} style={inp({ width: 60 })}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Datasheet URL</label>
                      <input value={productForm.datasheet_url} onChange={e => setProductForm(f => ({ ...f, datasheet_url: e.target.value }))} style={inp()} placeholder="https://..." />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={lbl}>Condition Notes</label>
                      <input value={productForm.condition_notes} onChange={e => setProductForm(f => ({ ...f, condition_notes: e.target.value }))} style={inp()} placeholder="Known defects, wear patterns, special handling..." />
                    </div>
                  </div>

                  {/* Product images */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Product Images ({productImgs.length})</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      {productImgs.map((url, i) => (
                        <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                          <img src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                          <button onClick={() => setProductImgs(prev => prev.filter((_, j) => j !== i))}
                            style={{ position: 'absolute', top: -6, right: -6, background: '#dc2626', color: 'white', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                      ))}
                      <button onClick={() => prodImgRef.current?.click()} disabled={prodImgUploading}
                        style={{ width: 80, height: 80, background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 6, cursor: prodImgUploading ? 'not-allowed' : 'pointer', fontSize: 24, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {prodImgUploading ? '⏳' : '+'}
                      </button>
                      <input ref={prodImgRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                        onChange={async e => {
                          const files = Array.from(e.target.files || [])
                          if (!files.length) return
                          setProdImgUploading(true)
                          for (const f of files) {
                            const url = await uploadToS3(f, 'products')
                            if (url) setProductImgs(prev => [...prev, url])
                          }
                          setProdImgUploading(false)
                          e.target.value = ''
                        }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Uploaded to S3 → URLs saved to Supabase</div>
                  </div>

                  <button onClick={saveProduct} disabled={productSaving}
                    style={{ width: '100%', padding: '10px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {productSaving ? 'Saving...' : '✓ Save Product Data'}
                  </button>
                </div>
              ) : (
                /* ─ PRODUCT DETAIL VIEW ─ */
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  {/* Images carousel */}
                  {selectedListing.product?.images && selectedListing.product.images.length > 0 && (
                    <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {selectedListing.product.images.map((url, i) => (
                        <img key={i} src={url} alt="" onClick={() => window.open(url, '_blank')}
                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer' }} />
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{selectedListing.product?.normalized_pn}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{selectedListing.product?.brand}</div>

                  {selectedListing.product?.lifecycle_status && selectedListing.product.lifecycle_status !== 'active' && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontWeight: 700, display: 'inline-block', marginBottom: 10 }}>
                      {selectedListing.product.lifecycle_status === 'eos' ? 'END OF SALE' : 'END OF LIFE'}
                    </span>
                  )}

                  {selectedListing.product?.description && (
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 6 }}>
                      {selectedListing.product.description}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {([
                      ['Category',    selectedListing.product?.category          || '—'],
                      ['Weight',      selectedListing.product?.weight_kg         ? `${selectedListing.product.weight_kg} kg` : '—'],
                      ['Dimensions',  selectedListing.product?.dimensions_cm     || '—'],
                      ['Target Price',selectedListing.product?.target_price      ? `${CURRENCY_SYMBOL[selectedListing.product.target_currency || 'EUR'] || ''}${selectedListing.product.target_price} ${selectedListing.product.target_currency || 'EUR'}` : '—'],
                    ] as [string,string][]).map(([k, v]) => (
                      <div key={k} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6 }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {selectedListing.product?.condition_notes && (
                    <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e', marginBottom: 14 }}>
                      <strong>Condition notes:</strong> {selectedListing.product.condition_notes}
                    </div>
                  )}

                  {selectedListing.product?.datasheet_url && (
                    <a href={selectedListing.product.datasheet_url} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', padding: '6px 12px', background: '#eff6ff', color: '#2563eb', borderRadius: 6, fontSize: 12, textDecoration: 'none', fontWeight: 600, marginBottom: 14 }}>
                      📄 Datasheet
                    </a>
                  )}

                  <button onClick={() => openProductEdit(selectedListing)}
                    style={{ width: '100%', padding: '8px', background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    ✏️ Edit Product Data
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ══ ADD SINGLE ══════════════════════════════════════════════════════ */}
      {view === 'add' && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, maxWidth: 700 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Add Single Listing</div>
            <button onClick={() => setView('finder')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: '1 / span 2' }}>
              <label style={lbl}>Part Number *</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form.pn} onChange={e => setForm({ ...form, pn: e.target.value.toUpperCase() })}
                  onBlur={() => { if (form.pn && !form.description && !form.brand) fillFromPN() }}
                  style={inp({ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, flex: 1 })} placeholder="e.g. WS-C3750X-48T" />
                <button onClick={fillFromPN} disabled={aiPnBusy || !form.pn}
                  style={{ padding: '0 12px', background: aiPnBusy ? '#f1f5f9' : '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {aiPnBusy ? '⏳' : '✨ Fill'}
                </button>
              </div>
              {aiSuggestion?.pn && !form.pn && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>💡 Suggested PN: <strong>{aiSuggestion.pn}</strong> ({(aiSuggestion as any).confidence})</span>
                  <button onClick={() => setForm(f => ({ ...f, pn: aiSuggestion.pn!, brand: aiSuggestion.brand || f.brand }))} style={{ padding: '2px 8px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Use</button>
                </div>
              )}
            </div>
            <div><label style={lbl}>Brand / Vendor</label><input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value.toUpperCase() })} style={inp()} placeholder="CISCO, HUAWEI..." /></div>
            <div><label style={lbl}>Model (optional)</label><input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} style={inp()} placeholder="e.g. WD2DUBBPE100" /></div>
            <div><label style={lbl}>Condition</label><select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} style={inp()}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label style={lbl}>Quantity</label><input type="number" min="1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} style={inp()} /></div>
            <div><label style={lbl}>Unit Price</label><div style={{ display: 'flex', gap: 4 }}><input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={inp({ flex: 1 })} placeholder="0.00" /><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={inp({ width: 65 })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></div></div>
            <div><label style={lbl}>Location / Warehouse</label><input value={form.warehouse_location} onChange={e => setForm({ ...form, warehouse_location: e.target.value })} style={inp()} placeholder="DE, WH-A, PARIS-3..." /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Description</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  style={inp({ flex: 1 })} placeholder="Enter description — or fill from PN using ✨ Fill above" />
                <button onClick={fillFromDesc} disabled={aiDescBusy || !form.description}
                  style={{ padding: '0 12px', background: aiDescBusy ? '#f1f5f9' : '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {aiDescBusy ? '⏳' : '🔍 Find PN'}
                </button>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp()} placeholder="Warranty, rack-pull, firmware..." /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Condition Photo</label>
              <div style={{ marginTop: 4 }}>
                {form.condition_image ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={form.condition_image} alt="condition" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, border: '1px solid #e2e8f0', objectFit: 'cover', display: 'block' }} />
                    <button onClick={() => setForm(f => ({ ...f, condition_image: '' }))} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 10 }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => (document.getElementById('add-img-input') as HTMLInputElement)?.click()}
                    style={{ padding: '10px', background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#64748b', width: '100%', textAlign: 'center' }}>
                    🖼️ Upload condition photo
                  </button>
                )}
                <input id="add-img-input" type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return
                    const url = await uploadToS3(f, 'listings')
                    if (url) setForm(prev => ({ ...prev, condition_image: url }))
                    e.target.value = ''
                  }} />
              </div>
            </div>
          </div>
          <button onClick={saveSingle} disabled={saving || !form.pn} style={{ marginTop: 16, width: '100%', padding: 12, background: !form.pn ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: !form.pn ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
            {saving ? 'Saving...' : '+ Add to Marketplace'}
          </button>
        </div>
      )}

      {/* ══ CSV IMPORT ══════════════════════════════════════════════════════ */}
      {view === 'csv' && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, maxWidth: 800 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{csvFileName ? `📂 ${csvFileName}` : 'Import File'}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={downloadTemplate} style={{ padding: '6px 14px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ⬇ Download Template
              </button>
              <button onClick={() => { setCsvRows([]); setView('finder'); setImportDone(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
            </div>
          </div>
          {parseWarnings.length > 0 && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>⚠️ {parseWarnings.join(' · ')}</div>}
          {showDefaults && !defaultsConfirmed && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>📋 Set defaults for missing values</div>
              <div style={{ fontSize: 12, color: '#0369a1', marginBottom: 14 }}>Some rows are missing condition/brand. Rows that already have values will keep them.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div><label style={lbl}>Default Condition</label><select value={defCondition} onChange={e => setDefCondition(e.target.value)} style={inp()}><option value="">— keep empty —</option>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label style={lbl}>Default Brand</label><input value={defBrand} onChange={e => setDefBrand(e.target.value.toUpperCase())} style={inp()} placeholder="HUAWEI..." /></div>
                <div><label style={lbl}>Default Currency</label><select value={defCurrency} onChange={e => setDefCurrency(e.target.value)} style={inp()}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label style={lbl}>Default Country</label><input value={defCountry} onChange={e => setDefCountry(e.target.value)} style={inp()} placeholder="TR, DE..." /></div>
              </div>
              <button onClick={confirmDefaults} style={{ marginTop: 14, padding: '9px 24px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Apply & Continue →</button>
            </div>
          )}
          {csvRows.length > 0 && defaultsConfirmed && !importDone && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{csvRows.length.toLocaleString()} rows</span>
                <span style={{ color: '#94a3b8' }}>ready to import</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>Showing first 20</span>
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 14, border: '1px solid #f1f5f9', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>{['PN','Brand','Qty','Price','Ccy','Condition','Country','Description'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {csvRows.slice(0, 20).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{r.pn}</td>
                        <td style={{ padding: '5px 10px', color: r.brand ? '#475569' : '#f59e0b' }}>{r.brand || '⚠ missing'}</td>
                        <td style={{ padding: '5px 10px', color: r.qty ? '#0f172a' : '#94a3b8' }}>{r.qty || '—'}</td>
                        <td style={{ padding: '5px 10px' }}>{r.price || '—'}</td>
                        <td style={{ padding: '5px 10px', fontSize: 10 }}>{r.currency}</td>
                        <td style={{ padding: '5px 10px' }}><CondBadge c={r.condition} /></td>
                        <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{(r as any).country || '—'}</td>
                        <td style={{ padding: '5px 10px', color: '#94a3b8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                      </tr>
                    ))}
                    {csvRows.length > 20 && <tr><td colSpan={8} style={{ padding: '5px 10px', color: '#94a3b8', fontSize: 11 }}>...{csvRows.length - 20} more rows</td></tr>}
                  </tbody>
                </table>
              </div>
              <button onClick={importCSV} disabled={importing} style={{ width: '100%', padding: 12, background: importing ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: importing ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {importing ? 'Importing...' : `Import ${csvRows.length.toLocaleString()} listings to Marketplace`}
              </button>
            </>
          )}
          {importDone && (
            <div style={{ padding: '20px 0' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Import complete</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 20 }}>
                  <div><div style={{ fontSize: 28, fontWeight: 800, color: '#15803d' }}>{importDone.ok}</div><div style={{ fontSize: 12, color: '#64748b' }}>Listed</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626' }}>{importDone.fail}</div><div style={{ fontSize: 12, color: '#64748b' }}>Failed</div></div>
                </div>
              </div>
              {importDone.errors.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <button onClick={() => setShowErrors(!showErrors)} style={{ padding: '8px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626', width: '100%', textAlign: 'left' }}>
                    ⚠️ {importDone.errors.length} failed rows — {showErrors ? 'hide' : 'show'} details
                  </button>
                  {showErrors && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #fecaca', borderTop: 'none', borderRadius: '0 0 6px 6px', background: '#fff5f5' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr style={{ background: '#fef2f2' }}><th style={{ padding: '6px 10px', textAlign: 'left', color: '#dc2626', fontWeight: 700 }}>PN</th><th style={{ padding: '6px 10px', textAlign: 'left', color: '#dc2626', fontWeight: 700 }}>Error</th></tr></thead>
                        <tbody>{importDone.errors.map((e, i) => <tr key={i} style={{ borderTop: '1px solid #fecaca' }}><td style={{ padding: '5px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{e.pn}</td><td style={{ padding: '5px 10px', color: '#dc2626' }}>{e.reason}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {diffReport && (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 10 }}>📊 Re-import Comparison</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                    {([['New PNs', diffReport.added.length, '#15803d', '#ecfdf5'], ['Removed', diffReport.removed.length, '#dc2626', '#fef2f2'], ['Updated', diffReport.updated.length, '#2563eb', '#eff6ff'], ['Unchanged', diffReport.unchanged, '#64748b', '#f8fafc']] as [string, number, string, string][]).map(([label, val, color, bg]) => (
                      <div key={label} style={{ textAlign: 'center', padding: '8px', background: bg, borderRadius: 6 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
                        <div style={{ fontSize: 11, color }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {diffReport.added.length > 0 && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 3 }}>+ New:</div><div style={{ fontSize: 11, color: '#15803d', fontFamily: 'monospace', maxHeight: 60, overflowY: 'auto' }}>{diffReport.added.join(', ')}</div></div>}
                  {diffReport.removed.length > 0 && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 3 }}>− Removed:</div><div style={{ fontSize: 11, color: '#dc2626', fontFamily: 'monospace', maxHeight: 60, overflowY: 'auto' }}>{diffReport.removed.join(', ')}</div></div>}
                  {diffReport.updated.length > 0 && <div><div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 3 }}>↻ Updated:</div><div style={{ maxHeight: 80, overflowY: 'auto' }}>{diffReport.updated.map((u, i) => <div key={i} style={{ fontSize: 11, color: '#2563eb', fontFamily: 'monospace' }}>{u.pn}: {u.changes}</div>)}</div></div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => { setCsvRows([]); setImportDone(null); setCsvFileName(''); setDiffReport(null); setShowErrors(false); setView('finder') }} style={{ padding: '9px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Back to My Listings</button>
                <button onClick={() => csvRef.current?.click()} style={{ padding: '9px 20px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Import Another File</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ SCAN ════════════════════════════════════════════════════════════ */}
      {view === 'scan' && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, maxWidth: 500 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>📷 Scan Product Label</div>
            <button onClick={() => setView('finder')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>Take a photo of a product label, box, or part number sticker. AI will extract the PN and brand automatically.</div>
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
                <button onClick={() => camRef.current?.click()} style={{ flex: 1, padding: 20, background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                  📷<br /><span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Take Photo</span>
                  <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setImgPreview(URL.createObjectURL(f)); scanImage(f) }; e.target.value = '' }} />
                </button>
                <button onClick={() => fileRef.current?.click()} style={{ flex: 1, padding: 20, background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                  🖼️<br /><span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Upload Image</span>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setImgPreview(URL.createObjectURL(f)); scanImage(f) }; e.target.value = '' }} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
