'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

async function sendEmail(type: string, data: Record<string, any>) {
  try {
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    })
  } catch (_) { /* non-critical */ }
}
import { useRouter } from 'next/navigation'

// ─── 6-stage pipeline ─────────────────────────────────────────────────────────
// offer_sent → confirmed → payment_held → ready_to_ship → shipped → delivered → completed
// Any stage → disputed → resolved_buyer / resolved_seller / resolved_split

type TxStatus = 'offer_sent' | 'confirmed' | 'payment_held' | 'ready_to_ship' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'disputed' | 'resolved_buyer' | 'resolved_seller' | 'resolved_split'

function dealerCode(id: string) {
  const day = new Date().toISOString().slice(0, 10)
  let h = 2166136261
  for (const c of id + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); h >>>= 0 }
  return String((h % 9000) + 1000)
}

type Tx = {
  id: string; tx_number: string | null; type: 'buy' | 'sell'; status: TxStatus
  escrow_status: string; escrow_amount: number | null; escrow_currency: string
  escrow_held_at: string | null; escrow_released_at: string | null
  payment_terms: string | null; incoterm: string | null
  tracking_number: string | null; shipping_ref: string | null
  dispute_reason: string | null; dispute_opened_at: string | null
  quantity: number | null; price: number | null; currency: string
  notes: string | null; created_at: string; updated_at: string
  linked_transaction_id: string | null; counterpart_id: string | null
  counterpart_name: string; pn: string; brand: string; product_image: string | null
  dealer_code: string | null
}

const PIPELINE: TxStatus[] = ['offer_sent', 'confirmed', 'payment_held', 'ready_to_ship', 'shipped', 'delivered', 'completed']

const STATUS_META: Record<string, { label: string; color: string; bg: string; step: number }> = {
  offer_sent:      { label: 'Offer Sent',       color: '#1d4ed8', bg: '#eff6ff', step: 0 },
  confirmed:       { label: 'Confirmed',         color: '#15803d', bg: '#f0fdf4', step: 1 },
  payment_held:    { label: 'Payment Held',      color: '#6d28d9', bg: '#f5f3ff', step: 2 },
  ready_to_ship:   { label: 'Ready to Ship',     color: '#0891b2', bg: '#ecfeff', step: 3 },
  shipped:         { label: 'Shipped',           color: '#0891b2', bg: '#ecfeff', step: 4 },
  delivered:       { label: 'Delivered',         color: '#15803d', bg: '#f0fdf4', step: 5 },
  completed:       { label: 'Completed ✓',       color: '#15803d', bg: '#f0fdf4', step: 6 },
  cancelled:       { label: 'Cancelled',         color: '#dc2626', bg: '#fef2f2', step: -1 },
  disputed:        { label: 'Disputed ⚠',       color: '#dc2626', bg: '#fef2f2', step: -1 },
  resolved_buyer:  { label: 'Resolved → Buyer',  color: '#059669', bg: '#ecfdf5', step: -1 },
  resolved_seller: { label: 'Resolved → Seller', color: '#059669', bg: '#ecfdf5', step: -1 },
  resolved_split:  { label: 'Resolved → Split',  color: '#059669', bg: '#ecfdf5', step: -1 },
}

// Action needed for each role at each status
const NEXT_ACTION: Record<string, { buyer: string; seller: string }> = {
  offer_sent:    { seller: '⚡ Accept, counter, or decline', buyer: 'Waiting for seller response' },
  confirmed:     { buyer: '⚡ Make payment to proceed',      seller: 'Waiting for buyer payment' },
  payment_held:  { buyer: 'Payment confirmed — waiting for admin',  seller: 'Waiting for admin shipment approval' },
  ready_to_ship: { seller: '⚡ Ship the goods & enter tracking',    buyer: 'Waiting for seller to ship' },
  shipped:       { buyer: '⚡ Confirm you received the goods',      seller: 'Waiting for buyer delivery confirmation' },
  delivered:     { buyer: 'Waiting for admin to release escrow',    seller: 'Waiting for admin to release escrow' },
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return new Date(d).toLocaleDateString()
}

const inp = (extra?: any): any => ({ padding: '8px 11px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', ...extra })
const lbl: any = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

// ─── Pipeline bar ─────────────────────────────────────────────────────────────
function PipelineBar({ status }: { status: string }) {
  const terminal = ['cancelled', 'disputed', 'resolved_buyer', 'resolved_seller', 'resolved_split']
  const meta = STATUS_META[status]
  if (terminal.includes(status)) return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: meta?.bg, color: meta?.color, fontWeight: 700, marginTop: 6, display: 'inline-block' }}>{meta?.label || status}</span>
  )
  const cur = STATUS_META[status]?.step ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 1 }}>
      {PIPELINE.map((s, i) => {
        const step = STATUS_META[s].step
        const done = step < cur; const active = step === cur
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap',
              fontWeight: active ? 700 : 400,
              color: done ? '#94a3b8' : active ? STATUS_META[s].color : '#cbd5e1',
              background: active ? STATUS_META[s].bg : 'transparent',
              border: `1px solid ${active ? STATUS_META[s].color + '40' : done ? '#f1f5f9' : 'transparent'}`,
              opacity: done ? 0.6 : 1 }}>
              {done ? '✓ ' : ''}{STATUS_META[s].label.replace(' ✓', '')}
            </div>
            {i < PIPELINE.length - 1 && <span style={{ color: '#e2e8f0', fontSize: 9, margin: '0 1px' }}>›</span>}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function TransactionsPage() {
  const router = useRouter()
  const [txs, setTxs]           = useState<Tx[]>([])
  const [loading, setLoading]   = useState(true)
  const [myId, setMyId]         = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [section, setSection]   = useState<'pending' | 'active' | 'done'>('pending')

  // Counter offer modal
  const [counterTx, setCounterTx]       = useState<Tx | null>(null)
  const [counterPrice, setCounterPrice] = useState('')
  const [counterQty, setCounterQty]     = useState('')
  const [counterNotes, setCounterNotes] = useState('')

  // Payment modal
  const [payTx, setPayTx]             = useState<Tx | null>(null)
  const [payAmount, setPayAmount]     = useState('')
  const [payRef, setPayRef]           = useState('')
  const [useEscrow, setUseEscrow]     = useState(true)
  const [payBusy, setPayBusy]         = useState(false)
  const [escrowBal, setEscrowBal]     = useState(0)

  // Tracking modal
  const [trackTx, setTrackTx]         = useState<Tx | null>(null)
  const [trackNum, setTrackNum]       = useState('')

  // Dispute modal
  const [dispTx, setDispTx]           = useState<Tx | null>(null)
  const [dispReason, setDispReason]   = useState('')
  const [dispFile, setDispFile]       = useState('')
  const [dispBusy, setDispBusy]       = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!p?.company_id) return
    setMyId(p.company_id)
    fetchTxs(p.company_id)
    supabase.channel('tx-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchTxs(p.company_id))
      .subscribe()
  }

  async function fetchTxs(cid: string) {
    setLoading(true)
    const { data } = await supabase.from('transactions')
      .select('*, counterpart:counterpart_id(name), product:product_id(normalized_pn, brand, images)')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })
    setTxs((data || []).map((t: any) => ({
      ...t,
      counterpart_name: t.counterpart?.name || '—',
      pn: t.product?.normalized_pn || '—',
      brand: t.product?.brand || '—',
      product_image: t.product?.images?.[0] || null,
      escrow_status: t.escrow_status || 'none',
      currency: t.currency || 'EUR',
      escrow_currency: t.escrow_currency || 'EUR',
      dealer_code: t.counterpart_id ? dealerCode(t.counterpart_id) : null,
    })))
    setLoading(false)
  }

  async function updateTx(txId: string, updates: any) {
    await supabase.from('transactions').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', txId)
    const tx = txs.find(t => t.id === txId)
    if (tx?.linked_transaction_id) {
      const mirror: any = { updated_at: new Date().toISOString() }
      if (updates.status)          mirror.status = updates.status
      if (updates.tracking_number) mirror.tracking_number = updates.tracking_number
      if (updates.shipping_ref)    mirror.shipping_ref = updates.shipping_ref
      if (updates.dispute_reason)  mirror.dispute_reason = updates.dispute_reason
      if (updates.escrow_status)   mirror.escrow_status = updates.escrow_status
      await supabase.from('transactions').update(mirror).eq('id', tx.linked_transaction_id)
    }
    if (myId) fetchTxs(myId)
  }

  async function logEvent(txId: string, from: string, to: string, actor: string, notes?: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from('tx_events').insert({
        tx_id: txId, from_status: from, to_status: to,
        actor, actor_id: session?.user?.id ?? null,
        notes: notes ?? null,
      })
    } catch (_) { /* non-critical */ }
  }

  // ── Counter offer ────────────────────────────────────────────────────────
  async function submitCounter() {
    if (!counterTx) return
    const price = parseFloat(counterPrice) || counterTx.price || 0
    const qty   = parseInt(counterQty) || counterTx.quantity || 1
    const note  = `Counter offer: ${qty} × ${price} ${counterTx.currency}${counterNotes ? ' — ' + counterNotes : ''}`
    await updateTx(counterTx.id, { price, quantity: qty, notes: note, status: 'offer_sent' })
    await logEvent(counterTx.id, counterTx.status, 'offer_sent', counterTx.type === 'buy' ? 'buyer' : 'seller', note)
    setCounterTx(null)
  }

  // ── Payment ──────────────────────────────────────────────────────────────
  async function submitPayment() {
    if (!payTx || !myId) return
    setPayBusy(true)
    const amt = parseFloat(payAmount)
    if (!amt) { setPayBusy(false); return }

    if (useEscrow) {
      const { data: result, error } = await supabase.rpc('escrow_trade_hold', {
        p_tx_id: payTx.id, p_buyer_company_id: myId, p_amount: amt, p_currency: payTx.currency,
      })
      if (error || !result?.ok) {
        alert(result?.error || error?.message || 'Escrow failed')
        setPayBusy(false); return
      }
      await updateTx(payTx.id, { status: 'payment_held', escrow_status: 'held', escrow_amount: amt, escrow_currency: payTx.currency, escrow_held_at: new Date().toISOString() })
    } else {
      await updateTx(payTx.id, { status: 'payment_held', escrow_status: 'none', shipping_ref: payRef || null })
    }
    await logEvent(payTx.id, 'confirmed', 'payment_held', 'buyer', `Payment: ${amt} ${payTx.currency} ${useEscrow ? '(escrow)' : '(direct) ref:' + payRef}`)
    // Email seller: payment secured
    sendEmail('tx_payment_held', {
      company_id: payTx.counterpart_id,
      pn: payTx.pn,
      amount: amt,
      currency: payTx.currency,
    })
    setPayTx(null); setPayAmount(''); setPayRef(''); setPayBusy(false)
  }

  // ── Tracking ─────────────────────────────────────────────────────────────
  async function submitTracking() {
    if (!trackTx || !trackNum) return
    await updateTx(trackTx.id, { status: 'shipped', tracking_number: trackNum, shipping_ref: trackNum })
    await logEvent(trackTx.id, 'ready_to_ship', 'shipped', 'seller', `Tracking: ${trackNum}`)
    // Email buyer: shipped
    sendEmail('tx_shipped', {
      company_id: trackTx.counterpart_id,
      pn: trackTx.pn,
      quantity: trackTx.quantity,
      tracking: trackNum,
    })
    setTrackTx(null); setTrackNum('')
  }

  // ── Dispute ───────────────────────────────────────────────────────────────
  async function submitDispute() {
    if (!dispTx || !dispReason) return
    setDispBusy(true)
    await updateTx(dispTx.id, { status: 'disputed', dispute_reason: dispReason, dispute_opened_at: new Date().toISOString() })
    await logEvent(dispTx.id, dispTx.status, 'disputed', dispTx.type === 'buy' ? 'buyer' : 'seller', dispReason)
    // Email admin: dispute
    sendEmail('tx_disputed', {
      tx_id: dispTx.id,
      pn: dispTx.pn,
      amount: dispTx.escrow_amount,
      currency: dispTx.escrow_currency || dispTx.currency,
      dealer_code: dispTx.dealer_code || '',
      role: dispTx.type === 'buy' ? 'buyer' : 'seller',
      reason: dispReason,
    })
    if (dispFile) {
      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from('dispute_evidence').insert({ tx_id: dispTx.id, uploaded_by: session?.user.id, role: dispTx.type, file_url: dispFile, description: dispReason })
    }
    setDispTx(null); setDispReason(''); setDispFile(''); setDispBusy(false)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION BUTTONS
  // ─────────────────────────────────────────────────────────────────────────
  function ActionButtons({ tx }: { tx: Tx }) {
    const isBuyer  = tx.type === 'buy'
    const isSeller = tx.type === 'sell'
    const s = tx.status

    const btn = (label: string, color: string, bg: string, onClick: () => void, disabled = false) => (
      <button key={label} onClick={onClick} disabled={disabled} style={{ padding: '6px 12px', background: disabled ? '#f1f5f9' : bg, color: disabled ? '#94a3b8' : color, border: `1px solid ${disabled ? '#e2e8f0' : color + '40'}`, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {label}
      </button>
    )

    const actions: any[] = []

    if (s === 'offer_sent') {
      if (isSeller) actions.push(btn('✓ Accept', '#15803d', '#f0fdf4', async () => {
        await updateTx(tx.id, { status: 'confirmed' })
        sendEmail('tx_confirmed', { company_id: tx.counterpart_id, pn: tx.pn, quantity: tx.quantity, price: tx.price, currency: tx.currency, dealer_code: tx.dealer_code })
      }))
      actions.push(btn('↩ Counter', '#1d4ed8', '#eff6ff', () => { setCounterTx(tx); setCounterPrice(String(tx.price || '')); setCounterQty(String(tx.quantity || '')) }))
      actions.push(btn('✕ Cancel', '#dc2626', '#fef2f2', () => updateTx(tx.id, { status: 'cancelled' })))
    }

    if (s === 'confirmed' && isBuyer) {
      const total = tx.price && tx.quantity ? tx.price * tx.quantity : 0
      actions.push(btn(`💳 Pay ${total ? total.toLocaleString() + ' ' + tx.currency : ''}`, '#6d28d9', '#f5f3ff', async () => {
        const { data: b } = await supabase.from('escrow_balances').select('balance').eq('company_id', myId).eq('currency', tx.currency).maybeSingle()
        setEscrowBal(b?.balance ?? 0)
        setPayTx(tx); setPayAmount(total ? String(total) : '')
      }))
    }

    if (s === 'payment_held') {
      actions.push(<div key="wait" style={{ fontSize: 11, color: '#94a3b8', padding: '4px 0' }}>⏳ Awaiting admin approval</div>)
    }

    if (s === 'ready_to_ship' && isSeller) {
      actions.push(btn('🚚 Ship & Track', '#0891b2', '#ecfeff', () => { setTrackTx(tx); setTrackNum('') }))
    }

    if (s === 'shipped' && isBuyer) {
      actions.push(btn('✓ Confirm Received', '#15803d', '#f0fdf4', async () => {
        await updateTx(tx.id, { status: 'delivered' })
        sendEmail('tx_delivered', { company_id: tx.counterpart_id, pn: tx.pn, amount: tx.escrow_amount, currency: tx.escrow_currency || tx.currency })
      }))
    }

    if (s === 'delivered') {
      actions.push(<div key="wait" style={{ fontSize: 11, color: '#94a3b8', padding: '4px 0' }}>⏳ Awaiting admin escrow release</div>)
    }

    if (!['completed', 'cancelled', 'disputed', 'resolved_buyer', 'resolved_seller', 'resolved_split', 'offer_sent'].includes(s)) {
      actions.push(btn('⚠ Dispute', '#dc2626', 'white', () => setDispTx(tx)))
    }

    if (!actions.length) return null
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, minWidth: 150 }}>{actions}</div>
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TX CARD
  // ─────────────────────────────────────────────────────────────────────────
  function TxCard({ tx, highlight }: { tx: Tx; highlight?: string }) {
    const meta    = STATUS_META[tx.status] || { label: tx.status, color: '#64748b', bg: '#f8fafc' }
    const isExp   = expanded === tx.id
    const isBuyer = tx.type === 'buy'
    const total   = tx.price && tx.quantity ? tx.price * tx.quantity : null
    const nextMsg = NEXT_ACTION[tx.status]?.[isBuyer ? 'buyer' : 'seller']
    const isMyAction = nextMsg?.startsWith('⚡')

    return (
      <div style={{ background: 'white', border: `1px solid ${highlight || '#e2e8f0'}`, borderLeft: `3px solid ${isMyAction ? '#f59e0b' : highlight || meta.color}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : tx.id)}>
            {/* Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {tx.tx_number && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f8fafc', color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>{tx.tx_number}</span>}
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: isBuyer ? '#eff6ff' : '#f0fdf4', color: isBuyer ? '#1e40af' : '#15803d' }}>
                {isBuyer ? '🛒 BUY' : '📦 SELL'}
              </span>
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
              {tx.escrow_status === 'held' && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f5f3ff', color: '#6d28d9', fontWeight: 600 }}>🔒 escrow held</span>}
            </div>

            {/* Product */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              {tx.product_image ? (
                <img src={tx.product_image} alt=""
                  style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 5, border: '1px solid #e2e8f0', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                {tx.brand !== '—' ? `${tx.brand} ` : ''}{tx.pn}
              </div>
            </div>

            {/* Summary */}
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {isBuyer ? 'From' : 'To'}: <strong style={{ color: '#475569' }}>{tx.counterpart_name}</strong>
              {tx.quantity && <> · {tx.quantity} units</>}
              {tx.price && <> · {tx.price} {tx.currency}/unit</>}
              {total && <> · <strong style={{ color: '#0f172a' }}>Total: {total.toLocaleString()} {tx.currency}</strong></>}
              {tx.incoterm && <> · {tx.incoterm}</>}
              <span style={{ marginLeft: 8, color: '#cbd5e1' }}>{timeAgo(tx.created_at)}</span>
            </div>

            <PipelineBar status={tx.status} />

            {/* Next action hint */}
            {nextMsg && (
              <div style={{ marginTop: 6, padding: '5px 10px', background: isMyAction ? '#fffbeb' : '#f8fafc', border: `1px solid ${isMyAction ? '#fde68a' : '#f1f5f9'}`, borderRadius: 5, fontSize: 11, color: isMyAction ? '#92400e' : '#64748b' }}>
                {nextMsg}
              </div>
            )}
          </div>

          <ActionButtons tx={tx} />
        </div>

        {/* Expanded */}
        {isExp && (
          <div style={{ borderTop: '1px solid #f8fafc', padding: '12px 16px', background: '#fafafa', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {tx.payment_terms && <div><div style={lbl}>Payment Terms</div><div>{tx.payment_terms}</div></div>}
              {tx.incoterm && <div><div style={lbl}>Incoterm</div><div style={{ fontWeight: 700 }}>{tx.incoterm}</div></div>}
              {tx.tracking_number && <div><div style={lbl}>Tracking</div><div style={{ fontFamily: 'monospace', fontSize: 12 }}>{tx.tracking_number}</div></div>}
              {tx.dispute_reason && <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Dispute Reason</div><div style={{ color: '#dc2626' }}>{tx.dispute_reason}</div></div>}
              {tx.notes && <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Notes</div><div>{tx.notes}</div></div>}
              {tx.escrow_status === 'held' && (
                <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', marginBottom: 4 }}>🔒 Escrow</div>
                  <div style={{ fontSize: 12, color: '#7c3aed', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>Amount: <strong>{tx.escrow_amount} {tx.escrow_currency}</strong></span>
                    {tx.escrow_held_at && <span>Held: {new Date(tx.escrow_held_at).toLocaleDateString()}</span>}
                    {tx.escrow_released_at && <span style={{ color: '#15803d' }}>Released: {new Date(tx.escrow_released_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const ACTIVE = ['offer_sent', 'confirmed', 'payment_held', 'ready_to_ship', 'shipped', 'delivered']
  const DONE   = ['completed', 'cancelled', 'disputed', 'resolved_buyer', 'resolved_seller', 'resolved_split']

  const myActionTxs = txs.filter(t => {
    const s = t.status; const isBuyer = t.type === 'buy'; const isSeller = t.type === 'sell'
    return (
      (s === 'offer_sent'    && isSeller) ||
      (s === 'confirmed'     && isBuyer)  ||
      (s === 'ready_to_ship' && isSeller) ||
      (s === 'shipped'       && isBuyer)
    )
  })
  const waitingTxs = txs.filter(t => ACTIVE.includes(t.status) && !myActionTxs.find(x => x.id === t.id))
  const activeTxs  = txs.filter(t => ACTIVE.includes(t.status))
  const doneTxs    = txs.filter(t => DONE.includes(t.status))

  const tabs = [
    { key: 'pending', label: `Needs Action (${myActionTxs.length})`, color: '#f59e0b' },
    { key: 'active',  label: `In Progress (${activeTxs.length})`,    color: '#1d4ed8' },
    { key: 'done',    label: `Closed (${doneTxs.length})`,            color: '#94a3b8' },
  ]

  const empty = (msg: string) => (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>{msg}</div>
  )

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px', letterSpacing: '-0.03em' }}>Transactions</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSection(t.key as any)}
            style={{ padding: '7px 16px', border: `1px solid ${section === t.key ? t.color : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: section === t.key ? 700 : 400, background: section === t.key ? t.color : 'white', color: section === t.key ? 'white' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
        <>
          {section === 'pending' && (
            <div>
              {myActionTxs.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>⚡ Action Required</div>
                  {myActionTxs.map(tx => <TxCard key={tx.id} tx={tx} highlight="#f59e0b" />)}
                </div>
              )}
              {waitingTxs.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>⏳ Waiting for Counterpart / Admin</div>
                  {waitingTxs.map(tx => <TxCard key={tx.id} tx={tx} />)}
                </div>
              )}
              {myActionTxs.length === 0 && waitingTxs.length === 0 && empty('No pending actions 🎉')}
            </div>
          )}
          {section === 'active'  && (activeTxs.length  === 0 ? empty('No active transactions')   : activeTxs.map(tx => <TxCard key={tx.id} tx={tx} />))}
          {section === 'done'    && (doneTxs.length     === 0 ? empty('No closed transactions yet') : doneTxs.map(tx => <TxCard key={tx.id} tx={tx} />))}
        </>
      )}

      {/* ── COUNTER OFFER MODAL ──────────────────────────────────────── */}
      {counterTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>↩ Counter Offer</div>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{counterTx.brand} {counterTx.pn}</div>
              <div style={{ color: '#64748b', marginTop: 2 }}>Current: {counterTx.quantity} × {counterTx.price} {counterTx.currency}/unit</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Qty</label><input type="number" value={counterQty} onChange={e => setCounterQty(e.target.value)} style={inp()} placeholder={String(counterTx.quantity || '')} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Price ({counterTx.currency}/unit)</label><input type="number" value={counterPrice} onChange={e => setCounterPrice(e.target.value)} style={inp()} placeholder={String(counterTx.price || '')} /></div>
            </div>
            {counterPrice && counterQty && (
              <div style={{ padding: '7px 12px', background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1d4ed8', fontWeight: 600, marginBottom: 10 }}>
                New total: {(parseFloat(counterPrice) * parseInt(counterQty)).toLocaleString()} {counterTx.currency}
              </div>
            )}
            <div style={{ marginBottom: 12 }}><label style={lbl}>Notes</label><input value={counterNotes} onChange={e => setCounterNotes(e.target.value)} style={inp()} placeholder="Reason..." /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitCounter} style={{ flex: 1, padding: '10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Send Counter</button>
              <button onClick={() => setCounterTx(null)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL ────────────────────────────────────────────── */}
      {payTx && (() => {
        const amt = parseFloat(payAmount) || 0
        const insufficient = useEscrow && amt > escrowBal
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>💳 Payment</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>{payTx.brand} {payTx.pn} · {payTx.quantity} units · {payTx.counterpart_name}</div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => setUseEscrow(true)} style={{ flex: 1, padding: '8px', background: useEscrow ? '#f5f3ff' : 'white', color: useEscrow ? '#6d28d9' : '#64748b', border: `1px solid ${useEscrow ? '#6d28d9' : '#e2e8f0'}`, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: useEscrow ? 700 : 400 }}>
                  🔒 Escrow ({escrowBal.toFixed(0)} {payTx.currency} available)
                </button>
                <button onClick={() => setUseEscrow(false)} style={{ flex: 1, padding: '8px', background: !useEscrow ? '#fffbeb' : 'white', color: !useEscrow ? '#92400e' : '#64748b', border: `1px solid ${!useEscrow ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: !useEscrow ? 700 : 400 }}>
                  🏦 Direct Transfer
                </button>
              </div>

              {useEscrow && insufficient && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
                  ⚠ Insufficient escrow balance — deposit funds first
                </div>
              )}
              {!useEscrow && (
                <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e', marginBottom: 12 }}>
                  ⚠ Direct payment proof must be shared with admin before order proceeds
                </div>
              )}

              <div style={{ marginBottom: 10 }}><label style={lbl}>Amount ({payTx.currency})</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={inp({ borderColor: insufficient ? '#fecaca' : '#e2e8f0' })} placeholder="0.00" /></div>
              {!useEscrow && <div style={{ marginBottom: 12 }}><label style={lbl}>Bank Ref / Transfer ID</label><input value={payRef} onChange={e => setPayRef(e.target.value)} style={inp()} placeholder="SWIFT ref..." /></div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={submitPayment} disabled={payBusy || insufficient || !amt}
                  style={{ flex: 1, padding: '10px', background: (payBusy || insufficient || !amt) ? '#94a3b8' : '#6d28d9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {payBusy ? 'Processing...' : 'Confirm Payment'}
                </button>
                <button onClick={() => setPayTx(null)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── TRACKING MODAL ───────────────────────────────────────────── */}
      {trackTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🚚 Enter Tracking</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>{trackTx.brand} {trackTx.pn} → {trackTx.counterpart_name}</div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Tracking / AWB Number *</label><input value={trackNum} onChange={e => setTrackNum(e.target.value)} style={inp()} placeholder="e.g. 1Z999AA10123456784" /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitTracking} disabled={!trackNum} style={{ flex: 1, padding: '10px', background: !trackNum ? '#94a3b8' : '#0891b2', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Confirm Shipment</button>
              <button onClick={() => setTrackTx(null)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DISPUTE MODAL ────────────────────────────────────────────── */}
      {dispTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>⚠ Open Dispute</div>
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626', marginBottom: 14 }}>
              ❄ Escrow will be frozen. Platform admin will review and decide within 48h.
            </div>
            <div style={{ marginBottom: 10 }}><label style={lbl}>Reason *</label><textarea value={dispReason} onChange={e => setDispReason(e.target.value)} style={{ ...inp(), height: 80, resize: 'vertical' }} placeholder="Describe the issue..." /></div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Evidence URL (optional)</label><input value={dispFile} onChange={e => setDispFile(e.target.value)} style={inp()} placeholder="https://..." /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitDispute} disabled={dispBusy || !dispReason} style={{ flex: 1, padding: '10px', background: !dispReason ? '#94a3b8' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {dispBusy ? 'Opening...' : 'Open Dispute'}
              </button>
              <button onClick={() => setDispTx(null)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
