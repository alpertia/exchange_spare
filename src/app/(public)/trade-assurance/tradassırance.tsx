'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import Logo from '@/components/Logo'

export default function TradeAssurancePage() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F7F6F2', minHeight: '100vh', color: '#0A0A0A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn-main { display: inline-flex; align-items: center; gap: 8px; background: #0A0A0A; color: #F7F6F2; border: none; padding: 13px 26px; border-radius: 100px; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; transition: background 0.2s; }
        .btn-main:hover { background: #222; }
        .btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #0A0A0A; border: 1.5px solid rgba(10,10,10,0.2); padding: 13px 26px; border-radius: 100px; font-family: inherit; font-size: 14px; cursor: pointer; text-decoration: none; }
        .tag { display: inline-block; background: #E8E4D9; color: #5A5545; font-size: 11px; font-weight: 500; padding: 4px 12px; border-radius: 100px; letter-spacing: 0.04em; text-transform: uppercase; }
        .card { background: white; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 28px; }
        .hover-lift { transition: transform 0.2s; }
        .hover-lift:hover { transform: translateY(-2px); }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .a1 { animation: fadeUp 0.7s ease 0.1s both; }
        .a2 { animation: fadeUp 0.7s ease 0.2s both; }
        .a3 { animation: fadeUp 0.7s ease 0.3s both; }
      `}</style>

      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 48px', height:64, background: scrolled ? 'rgba(247,246,242,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : 'none', transition:'all 0.3s ease' }}>
        <Logo size={30} linkTo="/" />
        <div style={{ display:'flex', alignItems:'center', gap:32 }}>
          {[{label:'Marketplace',href:'/marketplace'},{label:'Trade Assurance',href:'/trade-assurance'},{label:'Knowledge Base',href:'/knowledge-base'},{label:'Consultants',href:'/consultants'}].map(item => (
            <Link key={item.label} href={item.href} style={{ fontSize:13, color: item.href==='/trade-assurance' ? '#0A0A0A' : '#5A5545', textDecoration:'none', fontWeight: item.href==='/trade-assurance' ? 500 : 400 }}>{item.label}</Link>
          ))}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <Link href="/login" className="btn-ghost" style={{ padding:'9px 20px', fontSize:13 }}>Log in</Link>
          <Link href="/register" className="btn-main" style={{ padding:'9px 20px', fontSize:13 }}>Get started</Link>
        </div>
      </nav>

      <section style={{ padding:'140px 48px 80px', maxWidth:860, margin:'0 auto', textAlign:'center' }}>
        <div className="a1"><span className="tag" style={{ background:'#D4EDDA', color:'#2D6A4F' }}>Trade Assurance</span></div>
        <h1 className="a2" style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(40px, 6vw, 68px)', fontWeight:400, lineHeight:1.08, letterSpacing:'-0.03em', marginTop:24, marginBottom:24 }}>
          Your money moves only<br /><em style={{ fontStyle:'italic', color:'#3D7A5C' }}>when the deal is done.</em>
        </h1>
        <p className="a3" style={{ fontSize:17, color:'#5A5545', lineHeight:1.75, maxWidth:520, margin:'0 auto 40px' }}>
          SpareShare holds buyer funds in Trade Assurance until delivery is confirmed. No wire transfer risk. No unresolved disputes. Every transaction is protected.
        </p>
        <div className="a3" style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link href="/register" className="btn-main">Open a free account →</Link>
          <Link href="/login" className="btn-ghost">Go to my account</Link>
        </div>
      </section>

      <section style={{ padding:'80px 48px', background:'#0A0A0A' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag" style={{ background:'#1E1E1E', color:'#8A8070' }}>How it works</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 48px)', fontWeight:400, letterSpacing:'-0.03em', color:'#F7F6F2', marginTop:20, marginBottom:48, lineHeight:1.1 }}>Four steps. Zero risk.</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:1, background:'#1E1E1E', borderRadius:16, overflow:'hidden' }}>
            {[{n:'01',t:'Deposit funds',d:'Load your Trade Assurance account via bank transfer. Funds held securely.'},{n:'02',t:'Confirm deal',d:'Agree on price and terms with the seller. Both parties confirm.'},{n:'03',t:'Seller ships',d:'Funds locked in Trade Assurance. Seller ships with tracking. Buyer protected.'},{n:'04',t:'Release payment',d:'Buyer confirms delivery. Funds released instantly. Done.'}].map((s,i) => (
              <div key={i} className="hover-lift" style={{ padding:'32px 24px', background:'#0F0F0F' }}>
                <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:36, color:'#2A2A2A', marginBottom:20 }}>{s.n}</div>
                <div style={{ fontSize:15, fontWeight:500, color:'#F7F6F2', marginBottom:8 }}>{s.t}</div>
                <div style={{ fontSize:13, color:'#6A6A6A', lineHeight:1.7 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding:'80px 48px', background:'#F7F6F2' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag">Fee structure</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:12, lineHeight:1.1 }}>Simple, transparent pricing.</h2>
          <p style={{ fontSize:15, color:'#5A5545', marginBottom:40, lineHeight:1.7 }}>A small fee on each protected transaction. No monthly fees, no hidden charges.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
            {[{tier:'Standard',range:'Up to €5,000',fee:'5%',color:'#E6F1FB',textColor:'#0C447C',ex:'On a €2,000 deal — €100 fee'},{tier:'Mid-size',range:'€5,000 – €55,000',fee:'3%',color:'#D4EDDA',textColor:'#2D6A4F',ex:'On a €20,000 deal — €600 fee',featured:true},{tier:'Enterprise',range:'Above €55,000',fee:'Contact us',color:'#EDEBE3',textColor:'#5A5545',ex:'Custom rates for large volumes'}].map((t,i) => (
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

      <section style={{ padding:'80px 48px', background:'#EDEBE3' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag">What is covered</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:48, lineHeight:1.1 }}>Full protection, every step.</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:16 }}>
            {[
              {icon:'🛡',t:'Trade Assurance-secured payments',d:'Funds held in your Trade Assurance account and only released when you confirm delivery.'},
              {icon:'⚖',t:'Dispute resolution',d:'If something goes wrong, our team mediates based on shipping evidence and tracking.'},
              {icon:'🔄',t:'Refund protection',d:'If goods do not arrive or do not match the listing, buyers can open a dispute and get refunded.'},
              {icon:'📦',t:'Shipment tracking',d:'All transactions require a tracking number before payment is released. Full audit trail.'},
              {icon:'💱',t:'Multi-currency support',d:'Trade in EUR, USD, GBP and more. Your balance is held securely in your account.'},
              {icon:'📋',t:'Full transaction history',d:'Every deposit, hold, and release is logged. Export records for accounting and compliance.'},
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

      <section style={{ padding:'80px 48px', background:'#3D7A5C', textAlign:'center' }}>
        <span className="tag" style={{ background:'rgba(255,255,255,0.15)', color:'white' }}>Get protected today</span>
        <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 52px)', fontWeight:400, letterSpacing:'-0.03em', color:'white', marginTop:20, marginBottom:16, lineHeight:1.1 }}>Start trading with confidence.</h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.75)', marginBottom:36, maxWidth:440, margin:'0 auto 36px', lineHeight:1.7 }}>Every transaction on SpareShare is protected by Trade Assurance. Register free in 5 minutes.</p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link href="/register" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'white', color:'#3D7A5C', padding:'13px 28px', borderRadius:100, fontSize:14, fontWeight:500, textDecoration:'none' }}>Create free account →</Link>
          <Link href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'transparent', color:'white', border:'1.5px solid rgba(255,255,255,0.4)', padding:'13px 28px', borderRadius:100, fontSize:14, textDecoration:'none' }}>Go to my account</Link>
        </div>
      </section>

      <footer style={{ padding:'32px 48px', background:'#0A0A0A', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Logo size={16} linkTo="/" dark={true} />
          <span style={{ fontSize:11, color:'#3A3A3A' }}>· B2B Exchange with Trade Assurance</span>
        </div>
        <div style={{ display:'flex', gap:24, fontSize:12, color:'#6A6A6A' }}>
          {['Trade Assurance','Privacy','Terms','Contact'].map(l => <span key={l} style={{ cursor:'pointer' }}>{l}</span>)}
        </div>
        <div style={{ fontSize:12, color:'#6A6A6A' }}>© 2026 SpareShare</div>
      </footer>
    </div>
  )
}
