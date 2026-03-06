'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Row = {
  pn: string; brand: string; description: string
  weight_kg: string; dimensions_mm: string
  market_price_eur: string; market_price_usd: string
  is_consumable: boolean; notes: string
}

function normHeader(h: string): string {
  const s = h.toLowerCase().replace(/[\s_\-\(\)\.\/\*\#№]/g, '')
  if (['pn','partnumber','partno','productcode','code','sku','normalizedpn','article','rowlabels','partnum'].includes(s)) return 'pn'
  if (['brand','manufacturer','mfr','make','vendor','oem','supplier'].includes(s)) return 'brand'
  if (['description','productdescription','desc','name','configname','itemdescription'].includes(s)) return 'description'
  if (['model','modelname','modelno'].includes(s)) return 'model'
  if (['weightkg','weight','weightkilogram','wt'].includes(s)) return 'weight_kg'
  if (['dimensionsmm','dimensions','dimension','size'].includes(s)) return 'dimensions_mm'
  if (['marketpriceeur','marketprice','priceeur','listpriceeur'].includes(s)) return 'market_price_eur'
  if (['lastfoundlistpriceusd','priceusd','listpriceusd','marketpriceusd'].includes(s)) return 'market_price_usd'
  if (['consumableornot','consumable','isconsumable'].includes(s)) return 'is_consumable'
  if (['remarks','notes','note','comment'].includes(s)) return 'notes'
  if (['itemcode','item_code','internalcode','id','no','number','rowno'].includes(s)) return '_skip'
  return s
}

function normPN(raw: string): string { return raw.replace(/\*$/, '').toUpperCase().replace(/\s/g, '').trim() }
function parsePrice(raw: string): string {
  const s = raw.toString().replace(/[€$£¥,\s]/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) || n === 0 ? '' : String(n)
}
function detectBrand(pn: string, desc: string): string {
  const p = pn.toUpperCase(); const n = (desc||'').toUpperCase()
  if (p.match(/^(KRC|KRY|KDV|ROA|ROJ|ROB|473|472|471)/)) return 'NOKIA'
  if (p.match(/^(WS-|ASR|N9K|SFP|GLC|CAB)/)) return 'CISCO'
  if (p.match(/^(EX|MX|QFX|PTX|SRX)/)) return 'JUNIPER'
  if (p.match(/^0[0-9]{7}[A-Z]{0,3}$/)) return 'HUAWEI'
  if (n.includes('HUAWEI')) return 'HUAWEI'
  if (n.includes('ERICSSON')) return 'ERICSSON'
  if (n.includes('NOKIA')) return 'NOKIA'
  if (n.includes('CISCO')) return 'CISCO'
  return ''
}

const BATCH_SIZE = 500
const inp = (extra?: any) => ({ padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' as const, ...extra })

export default function ProductUploadPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [globalBrand, setGlobalBrand] = useState('')
  const [err, setErr] = useState('')
  const [phase, setPhase] = useState<'idle'|'running'|'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState({ added: 0, updated: 0, skipped: 0 })
  const [warnings, setWarnings] = useState<string[]>([])
  const [detectedFormat, setDetectedFormat] = useState('')

  useEffect(() => {
    checkRole()
    if (!(window as any).XLSX) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      document.head.appendChild(s)
    }
  }, [])

  async function checkRole() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (p?.role !== 'admin') { router.push('/dashboard'); return }
    setRole(p.role); setChecking(false)
  }

  function parseFile(file: File) {
    setRows([]); setErr(''); setWarnings([]); setDetectedFormat(''); setFileName(file.name)

    const process = (raw: any[][]) => {
      if (raw.length < 2) { setErr('Empty file'); return }
      let headerIdx = 0
      for (let i = 0; i < Math.min(6, raw.length); i++) {
        const r = raw[i].map((c: any) => String(c||'').toLowerCase().trim())
        if (r.some(c => ['pn','part number','partnumber','article','sku','code','row labels','item_code','item code'].includes(c))) {
          headerIdx = i; break
        }
      }
      const rawHdrs = raw[headerIdx].map((h: any) => String(h||'').trim())
      const hdrs = rawHdrs.map(normHeader)
      const hasPn = hdrs.includes('pn')
      const hasItemCode = rawHdrs.some(h => h.toLowerCase().includes('item_code')||h.toLowerCase().includes('item code'))
      const hasMarketPrice = hdrs.includes('market_price_eur')||hdrs.includes('market_price_usd')
      const hasModel = hdrs.includes('model')
      const isItemCodeFormat = hasItemCode && !hasPn
      let format = 'Generic'
      if (isItemCodeFormat) format = 'Internal Catalogue (item_code → PN)'
      else if (hasMarketPrice) format = 'Huawei Knowledge Base'
      else if (hasModel) format = 'Huawei with Model'
      setDetectedFormat(format)
      const warns: string[] = []
      let skippedCount = 0
      const parsed: Row[] = []
      raw.slice(headerIdx+1).forEach((rawRow: any[]) => {
        const obj: any = {}
        hdrs.forEach((h,i) => { if (h !== '_skip') obj[h] = String(rawRow[i]||'').trim() })
        let pn = isItemCodeFormat ? normPN(obj.description||'') : normPN(obj.pn||'')
        if (!pn || pn === 'PNNOTFOUND' || pn === 'N/A' || pn === 'NA' || pn.match(/^\d{1,4}$/)) { skippedCount++; return }
        const model = obj.model||''
        const desc = isItemCodeFormat ? '' : (obj.description||'')
        const fullDesc = model&&desc ? `${model} — ${desc}` : model||desc
        const brand = (obj.brand||'').toUpperCase()||detectBrand(pn, fullDesc)
        parsed.push({
          pn, brand, description: fullDesc,
          weight_kg: obj.weight_kg||'', dimensions_mm: obj.dimensions_mm||'',
          market_price_eur: parsePrice(obj.market_price_eur||''),
          market_price_usd: parsePrice(obj.market_price_usd||''),
          is_consumable: obj.is_consumable==='1'||obj.is_consumable?.toLowerCase()==='yes',
          notes: obj.notes||'',
        })
      })
      if (skippedCount > 0) warns.push(`${skippedCount} rows skipped (no valid PN)`)
      if (parsed.length === 0) { setErr('No valid products found'); return }
      setWarnings(warns); setRows(parsed)
    }

    if (file.name.match(/\.xlsx?$/i)) {
      const XLSX = (window as any).XLSX
      if (!XLSX) { setErr('Parser loading, try again in 2s'); return }
      const reader = new FileReader()
      reader.onload = e => { const wb = XLSX.read(e.target?.result,{type:'array'}); const ws = wb.Sheets[wb.SheetNames[0]]; process(XLSX.utils.sheet_to_json(ws,{header:1,defval:''})) }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        const lines = text.trim().split(/\r?\n/).filter(l=>l.trim())
        const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
        process(lines.map(l => l.split(delim).map(v=>v.replace(/^["']|["']$/g,'').trim())))
      }
      reader.readAsText(file)
    }
  }

  async function upload() {
    if (!rows.length) return
    setPhase('running'); setProgress(0)
    const final = rows.map(r => ({...r, brand: globalBrand.trim().toUpperCase()||r.brand||'UNKNOWN'}))
    let added=0, updated=0, skipped=0
    for (let i=0; i<final.length; i+=BATCH_SIZE) {
      const batch = final.slice(i,i+BATCH_SIZE)
      for (const row of batch) {
        const d: any = { normalized_pn: row.pn, brand: row.brand }
        if (row.description) d.description = row.description
        if (row.weight_kg) d.weight_kg = parseFloat(row.weight_kg)
        if (row.dimensions_mm) d.dimensions_mm = row.dimensions_mm
        if (row.market_price_eur) d.market_price_eur = parseFloat(row.market_price_eur)
        if (row.market_price_usd) d.market_price_usd = parseFloat(row.market_price_usd)
        if (row.is_consumable) d.is_consumable = row.is_consumable
        if (row.notes) d.notes = row.notes
        const { data: ex } = await supabase.from('products').select('id').eq('normalized_pn', row.pn).maybeSingle()
        if (ex) { await supabase.from('products').update(d).eq('id', ex.id); updated++ }
        else { const { error } = await supabase.from('products').insert(d); error ? skipped++ : added++ }
      }
      setProgress(Math.round(((i+batch.length)/final.length)*100))
    }
    setResults({added,updated,skipped}); setPhase('done')
  }

  if (checking) return <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}>Checking permissions...</div>
  if (role !== 'admin') return null

  return (
    <div style={{maxWidth:900}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:800,color:'#0f172a',margin:'0 0 4px',letterSpacing:'-0.02em'}}>📚 Upload Product Catalogue</h1>
        <div style={{fontSize:13,color:'#94a3b8'}}>Add or update product knowledge base — admin only</div>
      </div>

      <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:10,padding:'12px 16px',marginBottom:20,fontSize:12,color:'#0369a1'}}>
        <strong>Auto-detected formats:</strong> Huawei KB (PART NUMBER + MARKET PRICE + Weight) · Internal catalogue (item_code + description as PN) · Generic (PN/Part Number/Article)
        <br/>Model column merged into description · item_code numeric IDs skipped · Brand auto-detected from PN prefix
      </div>

      {phase==='idle' && (
        <>
          <div onClick={() => document.getElementById('prod-upload')?.click()}
            onDragOver={e=>e.preventDefault()}
            onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)parseFile(f)}}
            style={{border:'2px dashed #bfdbfe',borderRadius:10,padding:'40px 20px',textAlign:'center',cursor:'pointer',marginBottom:16,background:'white'}}>
            <div style={{fontSize:36,marginBottom:8}}>📂</div>
            <div style={{fontSize:14,color:'#475569',fontWeight:600}}>Drop file or click to browse</div>
            <div style={{fontSize:12,color:'#94a3b8',marginTop:4}}>.xlsx / .xls / .csv</div>
            {fileName && <div style={{marginTop:8,fontSize:12,color:'#2563eb'}}>📎 {fileName}</div>}
            <input id="prod-upload" type="file" accept=".xlsx,.xls,.csv,.txt" style={{display:'none'}}
              onChange={e=>{const f=e.target.files?.[0];if(f)parseFile(f);e.target.value=''}} />
          </div>

          {err && <div style={{padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,color:'#dc2626',fontSize:13,marginBottom:14}}>{err}</div>}
          {warnings.length>0 && <div style={{padding:'10px 14px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,fontSize:12,color:'#92400e',marginBottom:14}}>⚠️ {warnings.join(' · ')}</div>}

          {rows.length>0 && (
            <>
              <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:14,padding:'8px 14px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8}}>
                <span style={{fontSize:12,color:'#15803d',fontWeight:700}}>✅ {detectedFormat}</span>
                <span style={{fontSize:12,color:'#64748b'}}>{rows.length.toLocaleString()} products ready</span>
              </div>

              {rows.some(r=>!r.brand) && (
                <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:12,color:'#92400e'}}>⚠ Some missing brand</span>
                  <input placeholder="Set brand for all (e.g. HUAWEI)" value={globalBrand} onChange={e=>setGlobalBrand(e.target.value.toUpperCase())}
                    style={{flex:1,padding:'5px 10px',border:'1px solid #fde68a',borderRadius:6,fontSize:12,outline:'none'}} />
                </div>
              )}

              <div style={{overflowX:'auto',marginBottom:16,border:'1px solid #e2e8f0',borderRadius:8}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{background:'#f8fafc'}}>
                    {['PN','Brand','Description','Weight','Dimensions','€ Price','$ Price','Notes'].map(h=>(
                      <th key={h} style={{padding:'7px 12px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rows.slice(0,25).map((r,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid #f8fafc'}}>
                        <td style={{padding:'5px 12px',fontFamily:'monospace',fontWeight:700,color:'#0f172a',whiteSpace:'nowrap'}}>{r.pn}</td>
                        <td style={{padding:'5px 12px',color:r.brand?'#475569':'#f59e0b'}}>{r.brand||'⚠'}</td>
                        <td style={{padding:'5px 12px',color:'#64748b',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description||'—'}</td>
                        <td style={{padding:'5px 12px',color:'#94a3b8'}}>{r.weight_kg||'—'}</td>
                        <td style={{padding:'5px 12px',color:'#94a3b8'}}>{r.dimensions_mm||'—'}</td>
                        <td style={{padding:'5px 12px',color:r.market_price_eur?'#059669':'#94a3b8'}}>{r.market_price_eur?`€${r.market_price_eur}`:'—'}</td>
                        <td style={{padding:'5px 12px',color:r.market_price_usd?'#059669':'#94a3b8'}}>{r.market_price_usd?`$${r.market_price_usd}`:'—'}</td>
                        <td style={{padding:'5px 12px',color:'#94a3b8',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                      </tr>
                    ))}
                    {rows.length>25 && <tr><td colSpan={8} style={{padding:'5px 12px',color:'#94a3b8',fontSize:11}}>...{rows.length-25} more</td></tr>}
                  </tbody>
                </table>
              </div>

              <button onClick={upload}
                style={{width:'100%',padding:14,background:'#0f172a',color:'white',border:'none',borderRadius:8,cursor:'pointer',fontSize:14,fontWeight:700}}>
                Upload {rows.length.toLocaleString()} products to Knowledge Base →
              </button>
            </>
          )}
        </>
      )}

      {phase==='running' && (
        <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:32,textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:12}}>⚙️</div>
          <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Uploading...</div>
          <div style={{background:'#f1f5f9',borderRadius:8,overflow:'hidden',height:8,marginBottom:10}}>
            <div style={{height:'100%',background:'#2563eb',width:`${progress}%`,transition:'width 0.3s'}} />
          </div>
          <div style={{fontSize:13,color:'#94a3b8'}}>{progress}%</div>
        </div>
      )}

      {phase==='done' && (
        <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:32,textAlign:'center'}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:20}}>Upload complete</div>
          <div style={{display:'flex',justifyContent:'center',gap:32,marginBottom:24}}>
            <div><div style={{fontSize:28,fontWeight:800,color:'#15803d'}}>{results.added}</div><div style={{fontSize:12,color:'#64748b'}}>New</div></div>
            <div><div style={{fontSize:28,fontWeight:800,color:'#2563eb'}}>{results.updated}</div><div style={{fontSize:12,color:'#64748b'}}>Updated</div></div>
            <div><div style={{fontSize:28,fontWeight:800,color:'#dc2626'}}>{results.skipped}</div><div style={{fontSize:12,color:'#64748b'}}>Skipped</div></div>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button onClick={()=>{setRows([]);setPhase('idle');setFileName('')}} style={{padding:'9px 20px',background:'white',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:7,cursor:'pointer',fontSize:13}}>Upload Another</button>
            <button onClick={()=>router.push('/dashboard/knowledge')} style={{padding:'9px 20px',background:'#0f172a',color:'white',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,fontWeight:600}}>View Knowledge Base →</button>
          </div>
        </div>
      )}
    </div>
  )
}
