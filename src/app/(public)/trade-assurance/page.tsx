"use client"
import Link from 'next/link'

export default function TradeAssurancePage() {
  return (
    <>
      <section style={{ padding:'140px 48px 80px', maxWidth:860, margin:'0 auto', textAlign:'center' }}>
        <div className="a1"><span className="tag" style={{ background:'#D4EDDA', color:'#2D6A4F' }}>Trade Assurance</span></div>
        <h1 className="a2" style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(40px, 6vw, 68px)', fontWeight:400, lineHeight:1.08, letterSpacing:'-0.03em', marginTop:24, marginBottom:24 }}>
          Your money moves only<br /><em style={{ fontStyle:'italic', color:'#3D7A5C' }}>when the deal is done.</em>
        </h1>
        <p className="a3" style={{ fontSize:17, color:'#5A5545', lineHeight:1.75, maxWidth:520, margin:'0 auto 40px' }}>
          SpareShare holds buyer funds in a secure trade assurance account until delivery is confirmed. No wire transfer risk. No unresolved disputes. Every transaction is protected.
        </p>
        <div className="a3" style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link href="/register" className="btn-main">Open a free account →</Link>
          <Link href="/login" className="btn-ghost">Go to my account</Link>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding:'80px 48px', background:'#0A0A0A' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag" style={{ background:'#1E1E1E', color:'#8A8070' }}>How it works</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 48px)', fontWeight:400, letterSpacing:'-0.03em', color:'#F7F6F2', marginTop:20, marginBottom:48, lineHeight:1.1 }}>Four steps. Zero risk.</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:1, background:'#1E1E1E', borderRadius:16, overflow:'hidden' }}>
            {[
              {n:'01',t:'Fund your escrow',d:'Deposit via credit card or bank transfer. Funds held securely in your Trade Assurance escrow account.'},
              {n:'02',t:'Confirm the deal',d:'Agree on price and terms with the seller. Both parties confirm the transaction on the platform.'},
              {n:'03',t:'Seller ships',d:'Funds locked in escrow. Seller ships with tracking. You are fully protected until delivery.'},
              {n:'04',t:'Release payment',d:'You confirm delivery. Funds released instantly to seller. Full audit trail retained.'},
            ].map((s,i) => (
              <div key={i} className="hover-lift" style={{ padding:'32px 24px', background:'#0F0F0F' }}>
                <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:36, color:'#2A2A2A', marginBottom:20 }}>{s.n}</div>
                <div style={{ fontSize:15, fontWeight:500, color:'#F7F6F2', marginBottom:8 }}>{s.t}</div>
                <div style={{ fontSize:13, color:'#6A6A6A', lineHeight:1.7 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PAYMENT METHODS */}
      <section style={{ padding:'80px 48px', background:'#F7F6F2' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag">Funding your escrow</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:16, lineHeight:1.1 }}>
            Deposit by card or bank transfer.
          </h2>
          <p style={{ fontSize:15, color:'#5A5545', marginBottom:40, lineHeight:1.7, maxWidth:560 }}>
            Your Trade Assurance escrow account accepts deposits via credit card (Visa, Mastercard) or international bank wire. Funds are held in a segregated escrow account — never commingled with SpareShare operating funds.
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
            {[
              {icon:'💳', t:'Credit & debit card', d:'Instant deposits via Visa or Mastercard. Funds available in your escrow account immediately after payment confirmation.'},
              {icon:'🏦', t:'Bank wire transfer', d:'SWIFT / SEPA bank transfers accepted. Funds credited within 1–2 business days. Suitable for larger transaction volumes.'},
              {icon:'🔒', t:'Segregated escrow', d:'Your escrow balance is held in a dedicated account, separate from all other funds. Protected until you release it.'},
            ].map((f,i) => (
              <div key={i} className="card hover-lift">
                <div style={{ fontSize:28, marginBottom:14 }}>{f.icon}</div>
                <div style={{ fontSize:14, fontWeight:500, marginBottom:8 }}>{f.t}</div>
                <div style={{ fontSize:13, color:'#8A8070', lineHeight:1.7 }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEE STRUCTURE */}
      <section style={{ padding:'80px 48px', background:'#EDEBE3' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag">Fee structure</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:12, lineHeight:1.1 }}>Simple, transparent pricing.</h2>
          <p style={{ fontSize:15, color:'#5A5545', marginBottom:40, lineHeight:1.7 }}>A small fee on each protected transaction. No monthly fees, no hidden charges.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
            {[
              {tier:'Standard', range:'Up to €5,000', fee:'5%', color:'#E6F1FB', textColor:'#0C447C', ex:'On a €2,000 deal — €100 fee'},
              {tier:'Mid-size', range:'€5,000 – €55,000', fee:'3%', color:'#D4EDDA', textColor:'#2D6A4F', ex:'On a €20,000 deal — €600 fee', featured:true},
              {tier:'Enterprise', range:'Above €55,000', fee:'Contact us', color:'#EDEBE3', textColor:'#5A5545', ex:'Custom rates for large volumes'},
            ].map((t,i) => (
              <div key={i} className="card hover-lift" style={{ borderColor: t.featured ? '#3D7A5C' : 'rgba(0,0,0,0.08)', borderWidth: t.featured ? 2 : 1 }}>
                {t.featured && <div style={{ fontSize:11, fontWeight:500, color:'#3D7A5C', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>Most common</div>}
                <div style={{ display:'inline-block', background:t.color, color:t.textColor, fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:20, marginBottom:16 }}>{t.tier}</div>
                <div style={{ fontSize:13, color:'#8A8070', marginBottom:8 }}>{t.range}</div>
                <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:40, letterSpacing:'-0.02em', marginBottom:12 }}>{t.fee}</div>
                <div style={{ fontSize:12, color:'#8A8070', lineHeight:1.6, borderTop:'1px solid rgba(0,0,0,0.06)', paddingTop:12 }}>{t.ex}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT IS COVERED */}
      <section style={{ padding:'80px 48px', background:'#F7F6F2' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag">What is covered</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:48, lineHeight:1.1 }}>Full protection, every step.</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:16 }}>
            {[
              {icon:'🛡', t:'Escrow-secured payments', d:'Funds held in your Trade Assurance escrow account and only released when you confirm delivery.'},
              {icon:'⚖', t:'Dispute resolution', d:'If something goes wrong, our team mediates based on shipping evidence and tracking records.'},
              {icon:'🔄', t:'Refund protection', d:'If goods do not arrive or do not match the listing, buyers can open a dispute and get refunded.'},
              {icon:'📦', t:'Shipment tracking', d:'All transactions require a tracking number before payment is released. Full audit trail.'},
              {icon:'💱', t:'Multi-currency support', d:'Trade in EUR, USD, GBP and more. Your escrow balance is held in your chosen currency.'},
              {icon:'📋', t:'Full transaction history', d:'Every deposit, hold, and release is logged. Export records for accounting and compliance.'},
            ].map((f,i) => (
              <div key={i} className="card hover-lift" style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                <div style={{ width:40, height:40, background:'#F7F6F2', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>{f.t}</div>
                  <div style={{ fontSize:13, color:'#8A8070', lineHeight:1.7 }}>{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding:'80px 48px', background:'#3D7A5C', textAlign:'center' }}>
        <span className="tag" style={{ background:'rgba(255,255,255,0.15)', color:'white' }}>Get protected today</span>
        <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 52px)', fontWeight:400, letterSpacing:'-0.03em', color:'white', marginTop:20, marginBottom:16, lineHeight:1.1 }}>Start trading with confidence.</h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.75)', marginBottom:36, maxWidth:440, margin:'0 auto 36px', lineHeight:1.7 }}>Every transaction on SpareShare is protected by Trade Assurance escrow. Register free in 5 minutes.</p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link href="/register" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'white', color:'#3D7A5C', padding:'13px 28px', borderRadius:100, fontSize:14, fontWeight:500, textDecoration:'none' }}>Create free account →</Link>
          <Link href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'transparent', color:'white', border:'1.5px solid rgba(255,255,255,0.4)', padding:'13px 28px', borderRadius:100, fontSize:14, textDecoration:'none' }}>Go to my account</Link>
        </div>
      </section>
    </>
  )
}
