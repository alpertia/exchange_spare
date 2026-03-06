'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type TxStatus = 'offer_sent' | 'confirmed' | 'payment_held' | 'dispatched' | 'delivered' | 'completed' | 'cancelled' | 'disputed'
type EscrowStatus = 'none' | 'requested' | 'held' | 'released' | 'refunded'

type Tx = {
  id: string; tx_number: string | null; type: 'buy' | 'sell'; status: TxStatus
  escrow_status: EscrowStatus; escrow_amount: number | null; escrow_currency: string
  escrow_ref: string | null; escrow_held_at: string | null; escrow_released_at: string | null
  payment_terms: string | null; incoterm: string | null
  shipping_ref: string | null; dispute_reason: string | null
  quantity: number | null; price: number | null; currency: string
  notes: string | null; created_at: string; updated_at: string
  linked_transaction_id: string | null; counterpart_id: string | null
  counterpart_name: string; pn: string; brand: string
  buyer_confirmed: boolean; seller_confirmed: boolean
  final_confirmed_at: string | null
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; step: number }> = {
  offer_sent:   { label: 'Offer Sent',    color: '#1d4ed8', bg: '#eff6ff', step: 0 },
  confirmed:    { label: 'Confirmed',     color: '#15803d', bg: '#f0fdf4', step: 1 },
  payment_held: { label: 'Payment Held',  color: '#6d28d9', bg: '#f5f3ff', step: 2 },
  dispatched:   { label: 'Shipped',       color: '#0e7490', bg: '#ecfeff', step: 3 },
  delivered:    { label: 'Delivered',     color: '#15803d', bg: '#f0fdf4', step: 4 },
  completed:    { label: 'Completed ✓',   color: '#15803d', bg: '#f0fdf4', step: 5 },
  cancelled:    { label: 'Cancelled',     color: '#dc2626', bg: '#fef2f2', step: -1 },
  disputed:     { label: 'Disputed ⚠',   color: '#dc2626', bg: '#fef2f2', step: -1 },
}
const PIPELINE: TxStatus[] = ['offer_sent','confirmed','payment_held','dispatched','delivered','completed']

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.floor(m/60)}h ago`
  return new Date(d).toLocaleDateString()
}

function Pipeline({ status }: { status: TxStatus }) {
  if (status === 'cancelled') return <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626', fontWeight: 600 }}>✕ Cancelled</div>
  if (status === 'disputed')  return <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626', fontWeight: 600 }}>⚠ Under Dispute</div>
  const cur = STATUS_META[status]?.step ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
      {PIPELINE.map((s, i) => {
        const step = STATUS_META[s].step; const done = step < cur; const active = step === cur
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ padding: '2px 9px', borderRadius: 4, fontSize: 11, whiteSpace: 'nowrap' as const, fontWeight: active ? 700 : 400,
              color: done ? '#94a3b8' : active ? STATUS_META[s].color : '#e2e8f0',
              background: active ? STATUS_META[s].bg : 'transparent',
              border: `1px solid ${active ? STATUS_META[s].color + '40' : done ? '#f1f5f9' : '#f8fafc'}`,
              opacity: done ? 0.5 : 1 }}>
              {done && '✓ '}{STATUS_META[s].label.replace(' ✓','')}
            </div>
            {i < PIPELINE.length - 1 && <span style={{ color: '#e2e8f0', padding: '0 2px', fontSize: 10 }}>›</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function TransactionsPage() {
  const router = useRouter()
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'pending' | 'active' | 'done'>('pending')

  // Final confirmation modal
  const [finalTx, setFinalTx] = useState<Tx | null>(null)
  const [finalDocUrl, setFinalDocUrl] = useState('')
  const [finalNote, setFinalNote] = useState('')
  const [finalSubmitting, setFinalSubmitting] = useState(false)

  // Escrow request modal
  const [escrowTx, setEscrowTx] = useState<Tx | null>(null)
  const [escrowAmount, setEscrowAmount] = useState('')
  const [escrowRef, setEscrowRef] = useState('')
  const [escrowBalance, setEscrowBalance] = useState<number>(0)

  // Counter offer modal
  const [counterTx, setCounterTx] = useState<Tx | null>(null)
  const [counterPrice, setCounterPrice] = useState('')
  const [counterQty, setCounterQty] = useState('')
  const [counterNotes, setCounterNotes] = useState('')
  const [counterSubmitting, setCounterSubmitting] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!p?.company_id) return
    setMyId(p.company_id)
    await fetchTxs(p.company_id)
    supabase.channel('tx-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchTxs(p.company_id))
      .subscribe()
  }

  async function fetchTxs(cid: string) {
    setLoading(true)
    const { data } = await supabase.from('transactions')
      .select('*, counterpart:counterpart_id(name), product:product_id(normalized_pn, brand)')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })
    setTxs((data || []).map((t: any) => ({
      ...t,
      counterpart_name: t.counterpart?.name || '—',
      pn: t.product?.normalized_pn || '—',
      brand: t.product?.brand || '—',
      escrow_status: t.escrow_status || 'none',
      currency: t.currency || 'EUR',
      escrow_currency: t.escrow_currency || 'EUR',
      buyer_confirmed: t.buyer_confirmed || false,
      seller_confirmed: t.seller_confirmed || false,
    })))
    setLoading(false)
  }

  async function updateTx(txId: string, updates: any) {
    await supabase.from('transactions').update(updates).eq('id', txId)
    // Mirror to linked tx for status/escrow changes
    const tx = txs.find(t => t.id === txId)
    if (tx?.linked_transaction_id && (updates.status || updates.escrow_status || updates.shipping_ref)) {
      await supabase.from('transactions').update(updates).eq('id', tx.linked_transaction_id)
    }
    if (myId) await fetchTxs(myId)
  }

  // Final Confirmation — both buyer and seller must confirm + optional doc
  async function submitFinalConfirmation() {
    if (!finalTx || !myId) return
    setFinalSubmitting(true)
    const isBuyer = finalTx.type === 'buy'
    const updates: any = isBuyer
      ? { buyer_confirmed: true }
      : { seller_confirmed: true }
    if (finalDocUrl) updates.shipping_ref = finalDocUrl  // reuse field or add doc_url

    await supabase.from('transactions').update(updates).eq('id', finalTx.id)
    if (finalTx.linked_transaction_id) await supabase.from('transactions').update(updates).eq('id', finalTx.linked_transaction_id)

    // Check if both sides confirmed now
    const { data: linked } = finalTx.linked_transaction_id
      ? await supabase.from('transactions').select('buyer_confirmed, seller_confirmed').eq('id', finalTx.linked_transaction_id).single()
      : { data: null }

    const buyerDone  = isBuyer  ? true : (linked?.buyer_confirmed  || false)
    const sellerDone = !isBuyer ? true : (linked?.seller_confirmed || false)

    if (buyerDone && sellerDone) {
      // Both confirmed → complete + release escrow
      const finalUpdates = { status: 'completed', final_confirmed_at: new Date().toISOString(), escrow_status: finalTx.escrow_status === 'held' ? 'released' : finalTx.escrow_status, escrow_released_at: new Date().toISOString() }
      await supabase.from('transactions').update(finalUpdates).eq('id', finalTx.id)
      if (finalTx.linked_transaction_id) await supabase.from('transactions').update(finalUpdates).eq('id', finalTx.linked_transaction_id)
    }

    setFinalTx(null); setFinalDocUrl(''); setFinalNote('')
    setFinalSubmitting(false)
    if (myId) await fetchTxs(myId)
  }

  // Escrow request — checks balance, calls DB function
  async function submitEscrowRequest() {
    if (!escrowTx || !myId) return
    const amt = parseFloat(escrowAmount) || (escrowTx.price && escrowTx.quantity ? escrowTx.price * escrowTx.quantity : 0)
    if (amt <= 0) return

    // Call the DB function that checks balance + moves funds to admin
    const { data: result, error } = await supabase.rpc('escrow_trade_hold', {
      p_tx_id: escrowTx.id,
      p_buyer_company_id: myId,
      p_amount: amt,
      p_currency: escrowTx.currency || 'EUR',
    })

    if (error || !result?.ok) {
      alert(result?.error || error?.message || 'Escrow request failed — check your balance')
      return
    }

    // Update TX status on both sides
    await updateTx(escrowTx.id, { 
      escrow_status: 'requested', 
      escrow_amount: amt, 
      escrow_currency: escrowTx.currency || 'EUR', 
      escrow_ref: escrowRef || null 
    })
    setEscrowTx(null); setEscrowAmount(''); setEscrowRef('')
  }

  // Counter offer — buyer proposes new price/qty
  async function submitCounterOffer() {
    if (!counterTx || !myId) return
    setCounterSubmitting(true)
    const newPrice = parseFloat(counterPrice) || counterTx.price
    const newQty = parseInt(counterQty) || counterTx.quantity
    const note = `Counter offer: ${newQty} units @ ${newPrice} ${counterTx.currency}/unit${counterNotes ? '. ' + counterNotes : ''}`
    
    // Update buyer's TX with new proposed values + reset status to offer_sent
    await supabase.from('transactions').update({
      price: newPrice,
      quantity: newQty,
      notes: note,
      status: 'offer_sent',
      updated_at: new Date().toISOString(),
    }).eq('id', counterTx.id)

    // Mirror to seller's linked TX
    if (counterTx.linked_transaction_id) {
      await supabase.from('transactions').update({
        price: newPrice,
        quantity: newQty,
        notes: note,
        status: 'offer_sent',
        updated_at: new Date().toISOString(),
      }).eq('id', counterTx.linked_transaction_id)
    }

    setCounterTx(null); setCounterPrice(''); setCounterQty(''); setCounterNotes('')
    setCounterSubmitting(false)
    if (myId) await fetchTxs(myId)
  }

  function ActionButtons({ tx }: { tx: Tx }) {
    const isSeller = tx.type === 'sell'
    const isBuyer  = tx.type === 'buy'
    const s = tx.status

    const btn = (label: string, color: string, bg: string, onClick: () => void, border?: string) => (
      <button key={label} onClick={onClick} style={{ padding: '5px 11px', background: bg, color, border: border || `1px solid ${color}30`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' as const }}>
        {label}
      </button>
    )
    const actions: any[] = []

    // Offer stage
    if (s === 'offer_sent') {
      if (isSeller) actions.push(btn('✓ Confirm Deal', '#15803d', '#f0fdf4', () => updateTx(tx.id, { status: 'confirmed' })))
      if (isBuyer)  actions.push(btn('✎ Counter Offer', '#1d4ed8', '#eff6ff', () => { setCounterTx(tx); setCounterPrice(tx.price ? String(tx.price) : ''); setCounterQty(tx.quantity ? String(tx.quantity) : '') }))
      actions.push(btn('✕ Cancel', '#dc2626', '#fef2f2', () => updateTx(tx.id, { status: 'cancelled' })))
    }

    // Confirmed stage
    if (s === 'confirmed') {
      if (isBuyer && tx.escrow_status === 'none') actions.push(btn('🔒 Request Escrow', '#6d28d9', '#f5f3ff', async () => { 
        setEscrowTx(tx); setEscrowAmount(tx.price && tx.quantity ? String(tx.price * tx.quantity) : '')
        // Fetch current balance
        const { data: bals } = await supabase.from('escrow_balances').select('balance').eq('company_id', myId).eq('currency', tx.currency || 'EUR').maybeSingle()
        setEscrowBalance(bals?.balance ?? 0)
      }))
      if (isSeller && tx.escrow_status !== 'requested') actions.push(btn('📦 Mark Shipped', '#0e7490', '#ecfeff', () => updateTx(tx.id, { status: 'dispatched' })))
      if (isSeller && tx.escrow_status === 'requested') actions.push(btn('⏳ Awaiting Escrow', '#6d28d9', '#f5f3ff', () => {}))
      if (isBuyer && tx.escrow_status === 'requested')  actions.push(btn('💳 Escrow Funded', '#6d28d9', '#f5f3ff', () => updateTx(tx.id, { status: 'payment_held', escrow_status: 'held', escrow_held_at: new Date().toISOString() })))
    }

    if (s === 'payment_held' && isSeller) actions.push(btn('📦 Mark Shipped', '#0e7490', '#ecfeff', () => updateTx(tx.id, { status: 'dispatched' })))
    if (s === 'dispatched' && isBuyer)    actions.push(btn('✓ Confirm Received', '#15803d', '#f0fdf4', () => updateTx(tx.id, { status: 'delivered' })))

    // Delivered — Final Confirmation
    if (s === 'delivered') {
      const myConfirmed = isBuyer ? tx.buyer_confirmed : tx.seller_confirmed
      if (!myConfirmed) {
        actions.push(btn('🏁 Final Confirmation', '#0f172a', '#f8fafc', () => setFinalTx(tx)))
      } else {
        actions.push(
          <div key="waiting" style={{ fontSize: 11, color: '#94a3b8', padding: '5px 0' }}>
            ⏳ Waiting for {isBuyer ? 'seller' : 'buyer'} confirmation
          </div>
        )
      }
    }

    if (!['completed','cancelled','disputed'].includes(s))
      actions.push(btn('⚠ Dispute', '#dc2626', 'white', () => updateTx(tx.id, { status: 'disputed' }), '1px solid #fecaca'))

    if (!actions.length) return null
    return <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, flexShrink: 0 }}>{actions}</div>
  }

  const needMyAction = txs.filter(t => t.status === 'offer_sent' && t.type === 'sell')
  const waitingThem  = txs.filter(t => t.status === 'offer_sent' && t.type === 'buy')
  const deliveredNeedConfirm = txs.filter(t => t.status === 'delivered' && !(t.type === 'buy' ? t.buyer_confirmed : t.seller_confirmed))
  const active = txs.filter(t => !['offer_sent','completed','cancelled'].includes(t.status))
  const done   = txs.filter(t => ['completed','cancelled','disputed'].includes(t.status))
  const pendingAll = [...needMyAction, ...deliveredNeedConfirm, ...waitingThem]

  const sections = [
    { key: 'pending', label: `Needs Attention (${pendingAll.length})`, color: '#f59e0b' },
    { key: 'active',  label: `In Progress (${active.length})`,        color: '#1d4ed8' },
    { key: 'done',    label: `Closed (${done.length})`,                color: '#94a3b8' },
  ]

  function TxCard({ tx, highlight }: { tx: Tx; highlight?: string }) {
    const meta = STATUS_META[tx.status]
    const isExp = expanded === tx.id
    const total = tx.price && tx.quantity ? tx.price * tx.quantity : null

    return (
      <div style={{ background: 'white', border: `1px solid ${highlight || '#e2e8f0'}`, borderLeft: `3px solid ${highlight || '#e2e8f0'}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : tx.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {tx.tx_number && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f8fafc', color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>{tx.tx_number}</span>}
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: tx.type === 'buy' ? '#eff6ff' : '#f0fdf4', color: tx.type === 'buy' ? '#1e40af' : '#15803d' }}>{tx.type === 'buy' ? '🛒 BUY' : '📦 SELL'}</span>
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
              {tx.escrow_status !== 'none' && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f5f3ff', color: '#6d28d9', fontWeight: 600 }}>🔒 {tx.escrow_status}</span>}
              {tx.status === 'delivered' && (tx.buyer_confirmed || tx.seller_confirmed) && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>
                  {tx.buyer_confirmed && tx.seller_confirmed ? '🏁 Both Confirmed' : tx.type === 'buy' ? (tx.buyer_confirmed ? '✓ You confirmed' : '⏳ Waiting you') : (tx.seller_confirmed ? '✓ You confirmed' : '⏳ Waiting you')}
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{tx.brand !== '—' ? `${tx.brand} ` : ''}{tx.pn}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {tx.type === 'buy' ? 'From' : 'To'}: <strong style={{ color: '#475569' }}>{tx.counterpart_name}</strong>
              {tx.quantity && <> · {tx.quantity} units</>}
              {tx.price && <> · {tx.price} {tx.currency}/unit</>}
              {total && <> · <strong style={{ color: '#0f172a' }}>Total {total.toLocaleString()} {tx.currency}</strong></>}
              {tx.incoterm && <> · {tx.incoterm}</>}
              <span style={{ marginLeft: 8, color: '#cbd5e1' }}>{timeAgo(tx.created_at)}</span>
            </div>
            <Pipeline status={tx.status} />
          </div>
          <ActionButtons tx={tx} />
        </div>

        {isExp && (
          <div style={{ borderTop: '1px solid #f8fafc', padding: '12px 16px', background: '#fafafa', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {tx.payment_terms && <div><div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 1, textTransform: 'uppercase' as const, fontWeight: 600 }}>Payment Terms</div><div>{tx.payment_terms}</div></div>}
              {tx.incoterm && <div><div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 1, textTransform: 'uppercase' as const, fontWeight: 600 }}>Incoterm</div><div style={{ fontWeight: 700 }}>{tx.incoterm}</div></div>}
              {tx.shipping_ref && <div><div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 1, textTransform: 'uppercase' as const, fontWeight: 600 }}>Tracking / Doc</div><div style={{ fontFamily: 'monospace', fontSize: 12 }}>{tx.shipping_ref}</div></div>}
              {tx.notes && <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 1, textTransform: 'uppercase' as const, fontWeight: 600 }}>Notes</div><div>{tx.notes}</div></div>}
              {tx.final_confirmed_at && <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 1, textTransform: 'uppercase' as const, fontWeight: 600 }}>Final Confirmed</div><div style={{ color: '#15803d', fontWeight: 600 }}>{new Date(tx.final_confirmed_at).toLocaleString()}</div></div>}
              {tx.escrow_status !== 'none' && (
                <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', marginBottom: 4 }}>🔒 Escrow</div>
                  <div style={{ fontSize: 12, color: '#7c3aed', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>Status: <strong>{tx.escrow_status}</strong></span>
                    {tx.escrow_amount && <span>Amount: <strong>{tx.escrow_amount} {tx.escrow_currency}</strong></span>}
                    {tx.escrow_ref && <span>Ref: <strong style={{ fontFamily: 'monospace' }}>{tx.escrow_ref}</strong></span>}
                    {tx.escrow_held_at && <span>Held: {new Date(tx.escrow_held_at).toLocaleDateString()}</span>}
                    {tx.escrow_released_at && <span style={{ color: '#15803d' }}>Released: {new Date(tx.escrow_released_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              )}
            </div>
            {/* Shipping ref input */}
            {tx.status === 'dispatched' && tx.type === 'sell' && !tx.shipping_ref && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <input id={`ship-${tx.id}`} placeholder="Tracking / AWB number..." style={{ flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                <button onClick={async () => {
                  const ref = (document.getElementById(`ship-${tx.id}`) as HTMLInputElement)?.value
                  if (!ref) return
                  await updateTx(tx.id, { shipping_ref: ref })
                }} style={{ padding: '7px 14px', background: '#0e7490', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Save Tracking
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px', letterSpacing: '-0.03em' }}>Transactions</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key as any)}
            style={{ padding: '7px 16px', border: `1px solid ${activeSection === s.key ? s.color : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: activeSection === s.key ? 700 : 400, background: activeSection === s.key ? s.color : 'white', color: activeSection === s.key ? 'white' : '#64748b', transition: 'all 0.15s' }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
        <>
          {activeSection === 'pending' && (
            <div>
              {needMyAction.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 10 }}>
                    🟡 Awaiting My Action — Confirm or Decline
                  </div>
                  {needMyAction.map(tx => <TxCard key={tx.id} tx={tx} highlight="#f59e0b" />)}
                </div>
              )}
              {deliveredNeedConfirm.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 10 }}>
                    🏁 Final Confirmation Required
                  </div>
                  {deliveredNeedConfirm.map(tx => <TxCard key={tx.id} tx={tx} highlight="#0d9488" />)}
                </div>
              )}
              {waitingThem.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 10 }}>
                    ⏳ Waiting for Counterpart
                  </div>
                  {waitingThem.map(tx => <TxCard key={tx.id} tx={tx} highlight="#bfdbfe" />)}
                </div>
              )}
              {pendingAll.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>No pending actions</div>
              )}
            </div>
          )}
          {activeSection === 'active' && (
            <div>
              {active.length === 0
                ? <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>No active transactions</div>
                : active.map(tx => <TxCard key={tx.id} tx={tx} />)}
            </div>
          )}
          {activeSection === 'done' && (
            <div>
              {done.length === 0
                ? <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>No closed transactions yet</div>
                : done.map(tx => <TxCard key={tx.id} tx={tx} />)}
            </div>
          )}
        </>
      )}

      {/* ── FINAL CONFIRMATION MODAL ── */}
      {finalTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>🏁 Final Confirmation</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
              Both buyer and seller must confirm payment received and goods delivered. When both confirm, the transaction closes and escrow (if any) is released automatically.
            </div>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{finalTx.brand} {finalTx.pn}</div>
              <div style={{ color: '#64748b', marginTop: 2 }}>{finalTx.quantity} units · {finalTx.price} {finalTx.currency}/unit</div>
              {finalTx.escrow_status === 'held' && <div style={{ color: '#6d28d9', marginTop: 4, fontWeight: 600 }}>🔒 Escrow {finalTx.escrow_amount} {finalTx.escrow_currency} will be released</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' as const }}>Payment / Delivery Document URL (optional)</label>
                <input value={finalDocUrl} onChange={e => setFinalDocUrl(e.target.value)} placeholder="Bank receipt, waybill, or doc link..." style={{ width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' as const }}>Notes (optional)</label>
                <input value={finalNote} onChange={e => setFinalNote(e.target.value)} placeholder="Any final notes..." style={{ width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={submitFinalConfirmation} disabled={finalSubmitting} style={{ flex: 1, padding: '11px', background: finalSubmitting ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {finalSubmitting ? 'Confirming...' : '✓ Confirm My Side'}
                </button>
                <button onClick={() => setFinalTx(null)} style={{ padding: '11px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ESCROW REQUEST MODAL ── */}
      {escrowTx && (() => {
        const amt = parseFloat(escrowAmount) || 0
        const insufficient = amt > escrowBalance
        const cur = escrowTx.currency || 'EUR'
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>🔒 Request Escrow</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 1.6 }}>
              This amount will be deducted from your escrow balance and held by admin until the deal completes. Seller will be notified of the prepayment.
            </div>

            {/* Balance indicator */}
            <div style={{ padding: '10px 14px', background: insufficient ? '#fef2f2' : '#f0fdf4', border: `1px solid ${insufficient ? '#fecaca' : '#bbf7d0'}`, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Your {cur} balance:</span>
                <span style={{ fontWeight: 700, color: insufficient ? '#dc2626' : '#15803d' }}>{escrowBalance.toFixed(2)} {cur}</span>
              </div>
              {insufficient && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>⚠ Insufficient balance. Please deposit funds first.</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' as const }}>Escrow Amount ({cur})</label>
                <input type="number" value={escrowAmount} onChange={e => setEscrowAmount(e.target.value)} placeholder="Amount to hold..." style={{ width: '100%', padding: '8px 11px', border: `1px solid ${insufficient ? '#fecaca' : '#e2e8f0'}`, borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' as const }}>Reference (optional)</label>
                <input value={escrowRef} onChange={e => setEscrowRef(e.target.value)} placeholder="SWIFT, bank ref..." style={{ width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={submitEscrowRequest} disabled={insufficient || amt <= 0} style={{ flex: 1, padding: '10px', background: insufficient || amt <= 0 ? '#94a3b8' : '#6d28d9', color: 'white', border: 'none', borderRadius: 6, cursor: insufficient || amt <= 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {insufficient ? 'Insufficient Balance' : 'Request Escrow'}
                </button>
                <button onClick={() => setEscrowTx(null)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ── COUNTER OFFER MODAL ── */}
      {counterTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>✎ Counter Offer</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 1.6 }}>
              Propose new terms. The seller will see your updated offer and can confirm or counter back.
            </div>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{counterTx.brand} {counterTx.pn}</div>
              <div style={{ color: '#64748b', marginTop: 2 }}>Current: {counterTx.quantity} units @ {counterTx.price} {counterTx.currency}/unit</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' as const }}>New Quantity</label>
                  <input type="number" value={counterQty} onChange={e => setCounterQty(e.target.value)} placeholder={String(counterTx.quantity || '')} style={{ width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' as const }}>New Price ({counterTx.currency}/unit)</label>
                  <input type="number" value={counterPrice} onChange={e => setCounterPrice(e.target.value)} placeholder={String(counterTx.price || '')} style={{ width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              </div>
              {counterPrice && counterQty && (
                <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
                  New total: {(parseFloat(counterPrice) * parseInt(counterQty)).toLocaleString()} {counterTx.currency}
                  {counterTx.price && counterTx.quantity && (
                    <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>
                      (was {(counterTx.price * counterTx.quantity).toLocaleString()} {counterTx.currency})
                    </span>
                  )}
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' as const }}>Notes (optional)</label>
                <input value={counterNotes} onChange={e => setCounterNotes(e.target.value)} placeholder="Reason for counter offer..." style={{ width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={submitCounterOffer} disabled={counterSubmitting} style={{ flex: 1, padding: '10px', background: counterSubmitting ? '#94a3b8' : '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {counterSubmitting ? 'Sending...' : 'Send Counter Offer'}
                </button>
                <button onClick={() => setCounterTx(null)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
