"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"

type Product = {
  id: string
  normalized_pn: string
  brand: string | null
  description: string | null
  lifecycle_status: string | null
  product_group: string | null
  category: string | null
  image_url: string | null
  images: string[] | null
}

const LIFECYCLE_COLOR: Record<string, [string, string]> = {
  still_produced: ['#15803d', '#f0fdf4'],
  eop:            ['#92400e', '#fffbeb'],
  eos:            ['#d97706', '#fffbeb'],
  eol:            ['#dc2626', '#fef2f2'],
  unknown:        ['#64748b', '#f8fafc'],
}

const LIFECYCLE_LABEL: Record<string, string> = {
  still_produced: 'In Production',
  eop:            'End of Production',
  eos:            'End of Sale',
  eol:            'End of Life',
  unknown:        'Unknown',
}

const PAGE_SIZE = 24

export default function KnowledgeBasePage() {
  const router = useRouter()
  const [products, setProducts]       = useState<Product[]>([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [page, setPage]               = useState(1)
  const [query, setQuery]             = useState('')
  const [debouncedQ, setDebouncedQ]   = useState('')
  const [lifecycle, setLifecycle]     = useState('')
  const [group, setGroup]             = useState('')
  const [groups, setGroups]           = useState<string[]>([])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => { setPage(1) }, [lifecycle, group])

  useEffect(() => { load() }, [debouncedQ, lifecycle, group, page])

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    const { data } = await supabase
      .from('products')
      .select('product_group')
      .not('product_group', 'is', null)
      .order('product_group')
    const unique = [...new Set((data || []).map((d: any) => d.product_group).filter(Boolean))]
    setGroups(unique)
  }

  async function load() {
    setLoading(true)
    let q = supabase
      .from('products')
      .select('id, normalized_pn, brand, description, lifecycle_status, product_group, category, image_url, images', { count: 'exact' })
      .order('normalized_pn', { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    if (debouncedQ.trim()) {
      const s = debouncedQ.trim()
      q = q.or(`normalized_pn.ilike.%${s}%,brand.ilike.%${s}%,description.ilike.%${s}%`)
    }
    if (lifecycle) q = q.eq('lifecycle_status', lifecycle)
    if (group)     q = q.eq('product_group', group)

    const { data, count } = await q
    setProducts(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function getThumb(p: Product) {
    if (p.images && p.images.length > 0) return p.images[0]
    if (p.image_url) return p.image_url
    return null
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.03em' }}>
          📚 Product Knowledge Base
        </h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          {total.toLocaleString()} products · telecom &amp; satellite infrastructure
        </div>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by part number, brand, description..."
          style={{ flex: 1, minWidth: 220, padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white' }}
        />
        <select
          value={lifecycle}
          onChange={e => setLifecycle(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white', color: lifecycle ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}
        >
          <option value="">All Lifecycle</option>
          {Object.entries(LIFECYCLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {groups.length > 0 && (
          <select
            value={group}
            onChange={e => setGroup(e.target.value)}
            style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white', color: group ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}
          >
            <option value="">All Groups</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        {(query || lifecycle || group) && (
          <button
            onClick={() => { setQuery(''); setLifecycle(''); setGroup(''); setPage(1) }}
            style={{ padding: '9px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#64748b', cursor: 'pointer' }}
          >
            Clear ✕
          </button>
        )}
      </div>

      {/* Results info */}
      {(debouncedQ || lifecycle || group) && !loading && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
          {total.toLocaleString()} results {debouncedQ ? `for "${debouncedQ}"` : ''}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Loading...
        </div>
      ) : products.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No products found{debouncedQ ? ` for "${debouncedQ}"` : ''}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
          {products.map(p => {
            const thumb = getThumb(p)
            const [lc, lb] = LIFECYCLE_COLOR[(p.lifecycle_status || '').toLowerCase()] || ['#64748b', '#f8fafc']
            const lcLabel = LIFECYCLE_LABEL[(p.lifecycle_status || '').toLowerCase()] || p.lifecycle_status
            return (
              <Link key={p.id} href={`/dashboard/knowledge/${p.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
                  overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
                >
                  {/* Thumbnail */}
                  <div style={{ height: 100, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f1f5f9', overflow: 'hidden' }}>
                    {thumb ? (
                      <img src={thumb} alt={p.normalized_pn} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ fontSize: 28, opacity: 0.2 }}>📦</div>
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 3, fontFamily: 'monospace' }}>
                      {p.normalized_pn}
                    </div>
                    {p.brand && (
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{p.brand}</div>
                    )}
                    {p.description && (
                      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginBottom: 8,
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                        {p.description}
                      </div>
                    )}
                    {/* Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.lifecycle_status && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: lb, color: lc, fontWeight: 600 }}>
                          {lcLabel}
                        </span>
                      )}
                      {p.product_group && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                          📦 {p.product_group}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setPage(1)} disabled={page === 1}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: page === 1 ? '#f8fafc' : 'white', color: page === 1 ? '#94a3b8' : '#0f172a', cursor: page === 1 ? 'default' : 'pointer', fontSize: 12 }}>
              «
            </button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: page === 1 ? '#f8fafc' : 'white', color: page === 1 ? '#94a3b8' : '#0f172a', cursor: page === 1 ? 'default' : 'pointer', fontSize: 12 }}>
              ← Prev
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number
              if (totalPages <= 5) p = i + 1
              else if (page <= 3) p = i + 1
              else if (page >= totalPages - 2) p = totalPages - 4 + i
              else p = page - 2 + i
              return (
                <button key={p} onClick={() => setPage(p)}
                  style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: page === p ? '#0f172a' : 'white', color: page === p ? 'white' : '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: page === p ? 700 : 400 }}>
                  {p}
                </button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: page === totalPages ? '#f8fafc' : 'white', color: page === totalPages ? '#94a3b8' : '#0f172a', cursor: page === totalPages ? 'default' : 'pointer', fontSize: 12 }}>
              Next →
            </button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: page === totalPages ? '#f8fafc' : 'white', color: page === totalPages ? '#94a3b8' : '#0f172a', cursor: page === totalPages ? 'default' : 'pointer', fontSize: 12 }}>
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
