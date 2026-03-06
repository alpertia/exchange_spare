'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type LedgerRow = {
  id: string; amount: number; balance_after: number; type: string
  description: string | null; tx_id: string | null; created_at: string
}
type DepositApp = {
  id: string; amount: number; currency: string; status: string
  bank_ref: string | null; bank_name: string | null; notes: string | null
  created_at: string; reviewed_at: string | null; review_notes: string | null
}

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  initial_credit: { label: 'Welcome Credit',  color: '#15803d', bg: '#f0fdf4' },
  system_fee:     { label: 'Platform Fee',     color: '#dc2626', bg: '#fef2f2' },
  deposit:        { label: 'Deposit',          color: '#15803d', bg: '#f0fdf4' },
  trade_hold:     { label: 'Trade Hold',       color: '#6d28d9', bg: '#f5f3ff' },
  trade_release:  { label: 'Trade Release',    color: '#15803d', bg: '#f0fdf4' },
  trade_refund:   { label: 'Trade Refund',     color: '#0e7490', bg: '#ecfeff' },
  withdrawal:     { label: 'Withdrawal',       color: '#92400e', bg: '#fffbeb' },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Under Review', color: '#92400e', bg: '#fffbeb' },
  approved: { label: 'Approved ✓',  color: '#15803d', bg: '#f0fdf4' },
  rejected: { label: 'Rejected',    color: '#dc2626', bg: '#fef2f2' },
}

const inp = (extra?: any) => ({ padding: '8px 11px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, ...extra })
const lbl = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

export default function EscrowPage() {
  const [balance, setBalance] = useState<number | null>(null)
  const [currency, setCurrency] = useState('EUR')
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [deposits, setDeposits] = useState<DepositApp[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ledger' | 'deposit'>('ledger')

  // Deposit form
  const [showForm, setShowForm] = useState(false)
  const [dAmount, setDAmount] = useState('')
  const [dBankRef, setDBankRef] = useState('')
  const [dBankName, setDBankName] = useState('')
  const [dIban, setDIban] = useState('')
  const [dSwift, setDSwift] = useState('')
  const [dNotes, setDNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!p?.company_id) return
    setMyCompanyId(p.company_id)
    await load(p.company_id)
    supabase.channel('escrow-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escrow_accounts' }, () => load(p.company_id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escrow_ledger' }, () => load(p.company_id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_applications' }, () => load(p.company_id))
      .subscribe()
  }

  async function load(cid: string) {
    setLoading(true)
    const [{ data: acc }, { data: led }, { data: deps }] = await Promise.all([
      supabase.from('escrow_accounts').select('balance, currency').eq('company_id', cid).single(),
      supabase.from('escrow_ledger').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('deposit_applications').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
    ])
    setBalance(acc?.balance ?? 0)
    setCurrency(acc?.currency || 'EUR')
    setLedger(led || [])
    setDeposits(deps || [])
    setLoading(false)
  }

  async function submitDeposit() {
    if (!myCompanyId || !dAmount) return
    setSubmitting(true)
    await supabase.from('deposit_applications').insert({
      company_id: myCompanyId,
      amount: parseFloat(dAmount),
      currency,
      bank_ref: dBankRef || null,
      bank_name: dBankName || null,
      iban: dIban || null,
      swift: dSwift || null,
      notes: dNotes || null,
      status: 'pending',
    })
    setSubmitting(false); setSubmitted(true)
    setDAmount(''); setDBankRef(''); setDBankName(''); setDIban(''); setDSwift(''); setDNotes('')
    setTimeout(() => { setShowForm(false); setSubmitted(false); if (myCompanyId) load(myCompanyId) }, 2000)
  }

  const totalIn  = ledger.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const totalOut = ledger.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.03em' }}>🔒 Escrow Account</h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Secure trading balance for transaction protection</div>
      </div>

      {/* Balance card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        <div style={{ background: balance !== null && balance > 0 ? '#0f172a' : '#fef2f2', border: `1px solid ${balance !== null && balance > 0 ? '#1e293b' : '#fecaca'}`, borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: balance !== null && balance > 0 ? '#94a3b8' : '#dc2626', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Available Balance</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: balance !== null && balance > 0 ? 'white' : '#dc2626', letterSpacing: '-0.03em' }}>
            {balance !== null ? balance.toFixed(2) : '—'} <span style={{ fontSize: 16, fontWeight: 400, opacity: 0.7 }}>{currency}</span>
          </div>
          {balance !== null && balance <= 0 && (
            <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6, fontWeight: 500 }}>⚠ Insufficient — top up to use escrow</div>
          )}
        </div>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total In</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d' }}>+{totalIn.toFixed(2)} {currency}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total Out</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{totalOut.toFixed(2)} {currency}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <button onClick={() => { setShowForm(true); setTab('deposit') }}
            style={{ padding: '10px 16px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            + Deposit Funds
          </button>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>Submit bank transfer receipt</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {[['ledger','Transaction History'], ['deposit','Deposit Applications']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            style={{ padding: '6px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === k ? '#0f172a' : 'transparent', color: tab === k ? 'white' : '#64748b' }}>
            {l} {k === 'deposit' && deposits.filter(d => d.status === 'pending').length > 0 && <span style={{ marginLeft: 4, fontSize: 10, background: '#f59e0b', color: 'white', borderRadius: 10, padding: '1px 5px' }}>{deposits.filter(d => d.status === 'pending').length}</span>}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
        <>
          {/* LEDGER */}
          {tab === 'ledger' && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              {ledger.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No transactions yet</div>
              ) : ledger.map((row, i) => {
                const meta = TYPE_META[row.type] || { label: row.type, color: '#64748b', bg: '#f8fafc' }
                return (
                  <div key={row.id} style={{ padding: '12px 18px', borderBottom: i < ledger.length - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.amount > 0 ? '#15803d' : '#dc2626', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                        {row.tx_id && <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>tx:{row.tx_id.slice(0,8)}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{row.description || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: row.amount > 0 ? '#15803d' : '#dc2626' }}>
                        {row.amount > 0 ? '+' : ''}{row.amount.toFixed(2)} {currency}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Balance: {row.balance_after.toFixed(2)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#cbd5e1', flexShrink: 0, width: 70, textAlign: 'right' as const }}>
                      {new Date(row.created_at).toLocaleDateString()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* DEPOSIT APPLICATIONS */}
          {tab === 'deposit' && (
            <div>
              {/* Form */}
              {showForm && (
                <div style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                  {submitted ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Application Submitted!</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Our team will review and approve within 1 business day.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>📄 New Deposit Application</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                        <div>
                          <label style={lbl}>Amount * ({currency})</label>
                          <input type="number" value={dAmount} onChange={e => setDAmount(e.target.value)} style={inp()} placeholder="0.00" />
                        </div>
                        <div>
                          <label style={lbl}>Bank Name</label>
                          <input value={dBankName} onChange={e => setDBankName(e.target.value)} style={inp()} placeholder="Your bank name..." />
                        </div>
                        <div>
                          <label style={lbl}>Bank Reference / Receipt No.</label>
                          <input value={dBankRef} onChange={e => setDBankRef(e.target.value)} style={inp()} placeholder="TXN-12345..." />
                        </div>
                        <div>
                          <label style={lbl}>IBAN (optional)</label>
                          <input value={dIban} onChange={e => setDIban(e.target.value)} style={inp()} placeholder="IBAN..." />
                        </div>
                        <div>
                          <label style={lbl}>SWIFT (optional)</label>
                          <input value={dSwift} onChange={e => setDSwift(e.target.value)} style={inp()} placeholder="SWIFT code..." />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={lbl}>Notes</label>
                          <input value={dNotes} onChange={e => setDNotes(e.target.value)} style={inp()} placeholder="Transfer date, reference, or any additional info..." />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button onClick={submitDeposit} disabled={submitting || !dAmount}
                          style={{ padding: '10px 20px', background: submitting || !dAmount ? '#94a3b8' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: !dAmount ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                          {submitting ? 'Submitting...' : 'Submit Application →'}
                        </button>
                        <button onClick={() => setShowForm(false)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Existing applications */}
              {!showForm && (
                <button onClick={() => setShowForm(true)} style={{ marginBottom: 12, padding: '8px 16px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  + New Deposit Application
                </button>
              )}

              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {deposits.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No deposit applications yet.<br />
                    <span style={{ fontSize: 12 }}>Submit a bank transfer receipt to top up your escrow balance.</span>
                  </div>
                ) : deposits.map((d, i) => {
                  const meta = STATUS_META[d.status] || STATUS_META.pending
                  return (
                    <div key={d.id} style={{ padding: '14px 18px', borderBottom: i < deposits.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{d.amount.toFixed(2)} {d.currency}</span>
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>
                            {d.bank_name && <span>🏦 {d.bank_name}</span>}
                            {d.bank_ref && <span>Ref: <strong style={{ fontFamily: 'monospace' }}>{d.bank_ref}</strong></span>}
                            <span>{new Date(d.created_at).toLocaleDateString()}</span>
                          </div>
                          {d.notes && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{d.notes}</div>}
                          {d.review_notes && (
                            <div style={{ marginTop: 6, padding: '6px 10px', background: d.status === 'approved' ? '#f0fdf4' : '#fef2f2', borderRadius: 6, fontSize: 12, color: d.status === 'approved' ? '#15803d' : '#dc2626' }}>
                              Admin note: {d.review_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
