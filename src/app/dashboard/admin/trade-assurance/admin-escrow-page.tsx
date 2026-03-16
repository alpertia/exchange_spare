'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// escrow_balances view'dan geliyor: { company_id, currency, balance }
type BalanceRow = { currency: string; balance: number }
type LedgerRow = {
  id: string; amount: number; balance_after: number; type: string
  description: string | null; tx_id: string | null; created_at: string; currency: string
}
type DepositApp = {
  id: string; amount: number; currency: string; status: string
  bank_ref: string | null; bank_name: string | null; notes: string | null
  created_at: string; reviewed_at: string | null; review_notes: string | null
  received_amount: number | null; bank_fee_note: string | null
}

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  initial_credit: { label: 'Welcome Credit', color: '#15803d', bg: '#f0fdf4' },
  system_fee:     { label: 'Platform Fee',   color: '#dc2626', bg: '#fef2f2' },
  deposit:        { label: 'Deposit',         color: '#15803d', bg: '#f0fdf4' },
  trade_hold:     { label: 'Trade Hold',      color: '#6d28d9', bg: '#f5f3ff' },
  trade_release:  { label: 'Trade Release',   color: '#15803d', bg: '#f0fdf4' },
  trade_refund:   { label: 'Trade Refund',    color: '#0e7490', bg: '#ecfeff' },
  withdrawal:     { label: 'Withdrawal',      color: '#92400e', bg: '#fffbeb' },
  withdrawal_fee: { label: 'Withdrawal Fee',  color: '#dc2626', bg: '#fef2f2' },
}
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Under Review', color: '#92400e', bg: '#fffbeb' },
  approved: { label: 'Approved ✓',  color: '#15803d', bg: '#f0fdf4' },
  rejected: { label: 'Rejected',    color: '#dc2626', bg: '#fef2f2' },
}
const CURRENCIES = ['EUR', 'USD', 'GBP']
const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

const inp = (extra?: any) => ({
  padding: '8px 11px', borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#f8fafc', color: '#0f172a', fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box' as const, ...extra
})
const lbl = {
  fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3,
  fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em'
}

export default function TradeAssurancePage() {
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [deposits, setDeposits] = useState<DepositApp[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ledger' | 'deposit' | 'withdraw'>('ledger')
  const [selectedCurrency, setSelectedCurrency] = useState('EUR')
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null)

  // Deposit form
  const [showDepForm, setShowDepForm] = useState(false)
  const [dAmount, setDAmount] = useState('')
  const [dCurrency, setDCurrency] = useState('EUR')
  const [dBankRef, setDBankRef] = useState('')
  const [dBankName, setDBankName] = useState('')
  const [dIban, setDIban] = useState('')
  const [dSwift, setDSwift] = useState('')
  const [dNotes, setDNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Withdrawal form
  const [showWdForm, setShowWdForm] = useState(false)
  const [wAmount, setWAmount] = useState('')
  const [wCurrency, setWCurrency] = useState('EUR')
  const [wIban, setWIban] = useState('')
  const [wBankName, setWBankName] = useState('')
  const [wNotes, setWNotes] = useState('')
  const [wSubmitting, setWSubmitting] = useState(false)
  const [wSubmitted, setWSubmitted] = useState(false)
  const [companyProfile, setCompanyProfile] = useState<{ vat_number: string | null; address: string | null; name: string | null } | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!p?.company_id) return
    setMyCompanyId(p.company_id)
    // Load company profile for withdrawal validation
    const { data: co } = await supabase.from('companies').select('name, vat_number, address').eq('id', p.company_id).single()
    setCompanyProfile(co || null)
    await load(p.company_id)
    supabase.channel('trade-assurance-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escrow_ledger' }, () => load(p.company_id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_applications' }, () => load(p.company_id))
      .subscribe()
  }

  async function load(cid: string) {
    setLoading(true)
    const [{ data: bals }, { data: led }, { data: deps }] = await Promise.all([
      // escrow_balances view — currency bazlı bakiye
      supabase.from('escrow_balances').select('currency, balance').eq('company_id', cid),
      supabase.from('escrow_ledger').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('deposit_applications').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
    ])
    setBalances(bals || [])
    setLedger((led || []).map((r: any) => ({ ...r, currency: r.currency || 'EUR' })))
    setDeposits(deps || [])
    setLoading(false)
  }

  async function submitDeposit() {
    if (!myCompanyId || !dAmount) return
    setSubmitting(true)
    await supabase.from('deposit_applications').insert({
      company_id: myCompanyId, amount: parseFloat(dAmount), currency: dCurrency,
      bank_ref: dBankRef || null, bank_name: dBankName || null,
      iban: dIban || null, swift: dSwift || null,
      notes: dNotes || null, status: 'pending',
    })
    setSubmitting(false); setSubmitted(true)
    setDAmount(''); setDBankRef(''); setDBankName(''); setDIban(''); setDSwift(''); setDNotes('')
    setTimeout(() => { setShowDepForm(false); setSubmitted(false); if (myCompanyId) load(myCompanyId) }, 2000)
  }

  async function submitWithdrawal() {
    if (!myCompanyId || !wAmount) return
    setWSubmitting(true)
    // withdrawal_applications tablosu yoksa deposit_applications'a type ekle (geçici)
    await supabase.from('deposit_applications').insert({
      company_id: myCompanyId,
      amount: -Math.abs(parseFloat(wAmount)),
      currency: wCurrency,
      bank_name: wBankName || null,
      iban: wIban || null,
      notes: (wNotes || '') + ' [WITHDRAWAL REQUEST]',
      status: 'pending',
    })
    setWSubmitting(false); setWSubmitted(true)
    setTimeout(() => { setShowWdForm(false); setWSubmitted(false); if (myCompanyId) load(myCompanyId) }, 2000)
  }

  const getBalance = (cur: string) => balances.find(b => b.currency === cur)?.balance ?? 0
  const filteredLedger = selectedCurrency === 'ALL'
    ? ledger
    : ledger.filter(r => r.currency === selectedCurrency)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.03em' }}>🛡️ Trade Assurance Account</h1>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Secure global trading — protected by SpareShare Trade Assurance</div>
      </div>

      {/* Balance cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        {CURRENCIES.map(cur => {
          const bal = getBalance(cur)
          const low = bal <= 0
          const sym = CURRENCY_SYMBOL[cur]
          return (
            <div key={cur} onClick={() => setSelectedCurrency(cur)}
              style={{ background: selectedCurrency === cur ? (low ? '#fef2f2' : '#0f172a') : 'white', border: `2px solid ${selectedCurrency === cur ? (low ? '#fecaca' : '#1e293b') : '#e2e8f0'}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: selectedCurrency === cur ? (low ? '#dc2626' : '#64748b') : '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{cur}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: selectedCurrency === cur ? (low ? '#dc2626' : 'white') : (low ? '#dc2626' : '#0f172a'), letterSpacing: '-0.02em' }}>
                {sym}{bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {low && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>⚠ Top up needed</div>}
            </div>
          )
        })}

        {/* Action buttons */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => { setShowDepForm(true); setShowWdForm(false); setTab('deposit') }}
            style={{ padding: '9px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            + Deposit Funds
          </button>
          <button onClick={() => { setShowWdForm(true); setShowDepForm(false); setTab('withdraw') }}
            style={{ padding: '9px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ↩ Withdraw
          </button>
        </div>
      </div>

      {/* Bank fee notice */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#92400e' }}>
        ℹ️ <strong>Bank transfer notice:</strong> Banks may deduct up to 5% in fees. Only the received amount will be credited to your account. You may note any discrepancy in your application — our team will confirm the exact credited amount.
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {([['ledger','Transaction History'], ['deposit','Deposit Applications'], ['withdraw','Withdrawals']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '6px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === k ? '#0f172a' : 'transparent', color: tab === k ? 'white' : '#64748b' }}>
            {l}
            {k === 'deposit' && deposits.filter(d => d.status === 'pending' && d.amount > 0).length > 0 && (
              <span style={{ marginLeft: 5, fontSize: 10, background: '#f59e0b', color: 'white', borderRadius: 10, padding: '1px 5px' }}>
                {deposits.filter(d => d.status === 'pending' && d.amount > 0).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
        <>
          {/* LEDGER */}
          {tab === 'ledger' && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {CURRENCIES.map(cur => (
                  <button key={cur} onClick={() => setSelectedCurrency(cur)}
                    style={{ padding: '4px 12px', border: `1px solid ${selectedCurrency === cur ? '#1e40af' : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, background: selectedCurrency === cur ? '#eff6ff' : 'white', color: selectedCurrency === cur ? '#1e40af' : '#64748b', fontWeight: selectedCurrency === cur ? 700 : 400 }}>
                    {cur}
                  </button>
                ))}
                <button onClick={() => setSelectedCurrency('ALL')}
                  style={{ padding: '4px 12px', border: `1px solid ${selectedCurrency === 'ALL' ? '#1e40af' : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, background: selectedCurrency === 'ALL' ? '#eff6ff' : 'white', color: selectedCurrency === 'ALL' ? '#1e40af' : '#64748b', fontWeight: selectedCurrency === 'ALL' ? 700 : 400 }}>
                  All
                </button>
              </div>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {filteredLedger.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No transactions yet</div>
                ) : filteredLedger.map((row, i) => {
                  const meta = TYPE_META[row.type] || { label: row.type, color: '#64748b', bg: '#f8fafc' }
                  const sym = CURRENCY_SYMBOL[row.currency] || ''
                  return (
                    <div key={row.id} style={{ padding: '12px 18px', borderBottom: i < filteredLedger.length - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.amount > 0 ? '#15803d' : '#dc2626', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#64748b', fontWeight: 700 }}>{row.currency}</span>
                          {row.tx_id && <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>tx:{row.tx_id.slice(0,8)}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{row.description || '—'}</div>
                      </div>
                      <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: row.amount > 0 ? '#15803d' : '#dc2626' }}>
                          {row.amount > 0 ? '+' : ''}{sym}{Math.abs(row.amount).toFixed(2)} {row.currency}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Bal: {sym}{row.balance_after.toFixed(2)}</div>
                      </div>
                      <div style={{ fontSize: 11, color: '#cbd5e1', width: 70, textAlign: 'right' as const, flexShrink: 0 }}>
                        {new Date(row.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* DEPOSIT APPLICATIONS */}
          {tab === 'deposit' && (
            <div>
              {showDepForm && (
                <div style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                  {submitted ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>Application Submitted!</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Our team will review within 1 business day.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>📄 New Deposit Application</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                        <div>
                          <label style={lbl}>Amount *</label>
                          <input type="number" value={dAmount} onChange={e => setDAmount(e.target.value)} style={inp()} placeholder="0.00" />
                        </div>
                        <div>
                          <label style={lbl}>Currency *</label>
                          <select value={dCurrency} onChange={e => setDCurrency(e.target.value)} style={inp()}>
                            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Bank Name</label>
                          <input value={dBankName} onChange={e => setDBankName(e.target.value)} style={inp()} placeholder="Your bank..." />
                        </div>
                        <div>
                          <label style={lbl}>Bank Ref / Receipt No.</label>
                          <input value={dBankRef} onChange={e => setDBankRef(e.target.value)} style={inp()} placeholder="TXN-12345..." />
                        </div>
                        <div>
                          <label style={lbl}>IBAN (optional)</label>
                          <input value={dIban} onChange={e => setDIban(e.target.value)} style={inp()} />
                        </div>
                        <div>
                          <label style={lbl}>SWIFT (optional)</label>
                          <input value={dSwift} onChange={e => setDSwift(e.target.value)} style={inp()} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={lbl}>Notes (bank fees, transfer date etc.)</label>
                          <input value={dNotes} onChange={e => setDNotes(e.target.value)} style={inp()} placeholder="e.g. Bank deducted $15 fee, net transfer $985..." />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button onClick={submitDeposit} disabled={submitting || !dAmount}
                          style={{ padding: '10px 20px', background: !dAmount ? '#94a3b8' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: !dAmount ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                          {submitting ? 'Submitting...' : 'Submit Application →'}
                        </button>
                        <button onClick={() => setShowDepForm(false)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!showDepForm && (
                <button onClick={() => setShowDepForm(true)} style={{ marginBottom: 12, padding: '8px 16px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  + New Deposit Application
                </button>
              )}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {deposits.filter(d => d.amount > 0).length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No deposit applications yet.</div>
                ) : deposits.filter(d => d.amount > 0).map((d, i, arr) => {
                  const meta = STATUS_META[d.status] || STATUS_META.pending
                  return (
                    <div key={d.id} style={{ padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                              {CURRENCY_SYMBOL[d.currency]}{d.amount.toFixed(2)} <span style={{ fontSize: 12, color: '#94a3b8' }}>{d.currency}</span>
                            </span>
                            {d.received_amount && d.received_amount !== d.amount && (
                              <span style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '2px 6px', borderRadius: 4 }}>
                                Received: {CURRENCY_SYMBOL[d.currency]}{d.received_amount.toFixed(2)} (bank fee deducted)
                              </span>
                            )}
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap' as const, gap: '0 12px' }}>
                            {d.bank_name && <span>🏦 {d.bank_name}</span>}
                            {d.bank_ref && <span>Ref: <strong style={{ fontFamily: 'monospace' }}>{d.bank_ref}</strong></span>}
                            <span>{new Date(d.created_at).toLocaleDateString()}</span>
                          </div>
                          {d.notes && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{d.notes}</div>}
                          {d.bank_fee_note && <div style={{ fontSize: 12, color: '#92400e', marginTop: 3 }}>⚠ {d.bank_fee_note}</div>}
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

          {/* WITHDRAWALS */}
          {tab === 'withdraw' && (
            <div>
              {showWdForm && (
                <div style={{ background: 'white', border: '1px solid #fde68a', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                  {wSubmitted ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>Withdrawal Requested!</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Admin will review and apply any applicable fees.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>↩ Withdrawal Request</div>

                      {/* Profile incomplete warning */}
                      {companyProfile && (!companyProfile.vat_number || !companyProfile.address) && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
                          ⚠️ Your company profile is incomplete. Please add your <strong>VAT number</strong> and <strong>address</strong> before requesting a withdrawal.
                          <a href="/dashboard/profile" style={{ marginLeft: 8, color: '#dc2626', fontWeight: 700, textDecoration: 'underline' }}>Complete Profile →</a>
                        </div>
                      )}

                      {/* Info note */}
                      <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>
                        ℹ️ Admin will review your request and determine any applicable withdrawal fee before processing. IBAN is required for bank transfer.
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                        <div>
                          <label style={lbl}>Amount *</label>
                          <input type="number" value={wAmount} onChange={e => setWAmount(e.target.value)} style={inp({ borderColor: wAmount && parseFloat(wAmount) > getBalance(wCurrency) ? '#fca5a5' : '#e2e8f0' })} placeholder="0.00" />
                          {wAmount && parseFloat(wAmount) > getBalance(wCurrency) && (
                            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>⚠ Exceeds available balance ({CURRENCY_SYMBOL[wCurrency]}{getBalance(wCurrency).toFixed(2)})</div>
                          )}
                        </div>
                        <div>
                          <label style={lbl}>Currency *</label>
                          <select value={wCurrency} onChange={e => setWCurrency(e.target.value)} style={inp()}>
                            {CURRENCIES.map(c => (
                              <option key={c} value={c}>{c} — {CURRENCY_SYMBOL[c]}{getBalance(c).toFixed(2)} available</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Bank Name</label>
                          <input value={wBankName} onChange={e => setWBankName(e.target.value)} style={inp()} placeholder="Your bank..." />
                        </div>
                        <div>
                          <label style={lbl}>IBAN *</label>
                          <input value={wIban} onChange={e => setWIban(e.target.value)} style={inp({ borderColor: !wIban && wAmount ? '#fde68a' : '#e2e8f0' })} placeholder="GBXX XXXX XXXX..." />
                          {!wIban && wAmount && (
                            <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>⚠ IBAN required for bank transfer</div>
                          )}
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={lbl}>Notes</label>
                          <input value={wNotes} onChange={e => setWNotes(e.target.value)} style={inp()} placeholder="Any additional information..." />
                        </div>
                      </div>

                      {/* Submit validation summary */}
                      {(() => {
                        const profileOk = companyProfile && companyProfile.vat_number && companyProfile.address
                        const balanceOk = wAmount && parseFloat(wAmount) > 0 && parseFloat(wAmount) <= getBalance(wCurrency)
                        const ibanOk = !!wIban
                        const canSubmit = profileOk && balanceOk && ibanOk && !wSubmitting
                        return (
                          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
                            <button onClick={submitWithdrawal} disabled={!canSubmit}
                              style={{ padding: '10px 20px', background: canSubmit ? '#92400e' : '#94a3b8', color: 'white', border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                              {wSubmitting ? 'Submitting...' : 'Request Withdrawal →'}
                            </button>
                            <button onClick={() => setShowWdForm(false)} style={{ padding: '10px 16px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                            {!canSubmit && wAmount && (
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                {!profileOk ? '⚠ Complete profile first' : !balanceOk ? '⚠ Check amount' : !ibanOk ? '⚠ IBAN required' : ''}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              )}
              {!showWdForm && (
                <button onClick={() => setShowWdForm(true)} style={{ marginBottom: 12, padding: '8px 16px', background: '#92400e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  + New Withdrawal Request
                </button>
              )}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {deposits.filter(d => d.amount < 0).length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No withdrawal requests yet.</div>
                ) : deposits.filter(d => d.amount < 0).map((d, i, arr) => {
                  const meta = STATUS_META[d.status] || STATUS_META.pending
                  return (
                    <div key={d.id} style={{ padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>
                              {CURRENCY_SYMBOL[d.currency]}{Math.abs(d.amount).toFixed(2)} <span style={{ fontSize: 12, color: '#94a3b8' }}>{d.currency}</span>
                            </span>
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {d.notes?.replace(' [WITHDRAWAL REQUEST]', '')}
                          </div>
                          {d.review_notes && (
                            <div style={{ marginTop: 6, padding: '6px 10px', background: d.status === 'approved' ? '#f0fdf4' : '#fef2f2', borderRadius: 6, fontSize: 12, color: d.status === 'approved' ? '#15803d' : '#dc2626' }}>
                              Admin: {d.review_notes}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</div>
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
