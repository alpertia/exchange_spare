'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import Logo from '@/components/Logo'

export default function KnowledgeBaseLandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => setLoggedIn(!!session))
    })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const nav = [
    {label:'Marketplace',href:'/marketplace'},
    {label:'Trade Assurance',href:'/trade-assurance'},
    {label:'Knowledge Base',href:'/knowledge-base'},
    {label:'Consultants',href:'/consultants'},
  ]

  return (
    <div style={{ fontFamily:"'DM Sans', system-ui, sans-serif", background:'#F7F6F2', minHeight:'100vh', color:'#0A0A0A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .btn-main { display:inline-flex; align-items:center; gap:8px; background:#0A0A0A; color:#F7F6F2; border:none; padding:13px 26px; border-radius:100px; font-family:inherit; font-size:14px; font-weight:500; cursor:pointer; text-decoration:none; transition:background 0.2s; }
        .btn-main:hover { background:#222; }
        .btn-ghost { display:inline-flex; align-items:center; gap:8px; background:transparent; color:#0A0A0A; border:1.5px solid rgba(10,10,10,0.2); padding:13px 26px; border-radius:100px; font-family:inherit; font-size:14px; cursor:pointer; text-decoration:none; }
        .tag { display:inline-block; background:#E8E4D9; color:#5A5545; font-size:11px; font-weight:500; padding:4px 12px; border-radius:100px; letter-spacing:0.04em; text-transform:uppercase; }
        .card { background:white; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:28px; }
        .hover-lift { transition:transform 0.2s; }
        .hover-lift:hover { transform:translateY(-2px); }
        .pn { font-family:'DM Mono', monospace; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .a1{animation:fadeUp 0.7s ease 0.1s both} .a2{animation:fadeUp 0.7s ease 0.2s both} .a3{animation:fadeUp 0.7s ease 0.3s both}
      `}</style>

      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 48px', height:64, background: scrolled ? 'rgba(247,246,242,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : 'none', transition:'all 0.3s ease' }}>
        <Logo size={30} linkTo="/" />
        <div style={{ display:'flex', alignItems:'center', gap:32 }}>
          {nav.map(item => (
            <Link key={item.label} href={item.href} style={{ fontSize:13, color: item.href==='/knowledge-base' ? '#0A0A0A' : '#5A5545', textDecoration:'none', fontWeight: item.href==='/knowledge-base' ? 500 : 400 }}>{item.label}</Link>
          ))}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          {loggedIn ? (
            <Link href="/dashboard/marketplace" className="btn-main" style={{ padding:'9px 20px', fontSize:13 }}>My SpareShare →</Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost" style={{ padding:'9px 20px', fontSize:13 }}>Log in</Link>
              <Link href="/register" className="btn-main" style={{ padding:'9px 20px', fontSize:13 }}>Get started</Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding:'140px 48px 80px', maxWidth:860, margin:'0 auto', textAlign:'center' }}>
        <div className="a1"><span className="tag" style={{ background:'#EAF3DE', color:'#3B6D11' }}>Knowledge Base</span></div>
        <h1 className="a2" style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(40px, 6vw, 68px)', fontWeight:400, lineHeight:1.08, letterSpacing:'-0.03em', marginTop:24, marginBottom:24 }}>
          97,000+ products.<br /><em style={{ fontStyle:'italic', color:'#3B6D11' }}>Every spec, answered.</em>
        </h1>
        <p className="a3" style={{ fontSize:17, color:'#5A5545', lineHeight:1.75, maxWidth:520, margin:'0 auto 40px' }}>
          Our AI-powered knowledge base covers telecom and satellite equipment from Nokia, Ericsson, Cisco, Huawei and more. Ask technical questions, check compatibility, verify lifecycle status.
        </p>
        <div className="a3" style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          {loggedIn ? (
            <Link href="/knowledge-base" className="btn-main">Open knowledge base →</Link>
          ) : (
            <>
              <Link href="/knowledge-base" className="btn-main">Browse knowledge base →</Link>
              <Link href="/register" className="btn-ghost">Create free account</Link>
            </>
          )}
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding:'60px 48px', background:'#0A0A0A' }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:1, background:'#1E1E1E', borderRadius:16, overflow:'hidden' }}>
          {[
            {n:'97,000+', l:'Verified part numbers'},
            {n:'50+', l:'Brands covered'},
            {n:'AI', l:'Instant Q&A answers'},
            {n:'Live', l:'Lifecycle status tracking'},
          ].map((s,i) => (
            <div key={i} style={{ padding:'32px 28px', background:'#0F0F0F', textAlign:'center' }}>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:36, color:'#F7F6F2', marginBottom:8 }}>{s.n}</div>
              <div style={{ fontSize:13, color:'#6A6A6A' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding:'80px 48px', background:'#F7F6F2' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag">What you can do</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:48, lineHeight:1.1 }}>
            More than a catalog.
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
            {[
              {icon:'🔍', t:'Part number search', d:'Search any PN variant, alias, or OEM reference. Our AI resolves it to the canonical part number instantly.'},
              {icon:'🤖', t:'AI product Q&A', d:'Ask anything about a product — specs, compatibility, topology, replacement options. Get expert-level answers in seconds.'},
              {icon:'📊', t:'Lifecycle status', d:'See if a product is still in production, end-of-sale, or end-of-life. Plan your inventory decisions with confidence.'},
              {icon:'🔗', t:'Compatibility lookup', d:'Check which products work together. Avoid costly mistakes before purchasing spare parts or upgrades.'},
              {icon:'📦', t:'Product groups', d:'Products are organized by group and category. Quickly navigate large portfolios across vendors.'},
              {icon:'✏️', t:'Community corrections', d:'Logged-in users can submit corrections or questions on any product page. Our team reviews and updates the database.'},
            ].map((f,i) => (
              <div key={i} className="card hover-lift">
                <div style={{ fontSize:24, marginBottom:14 }}>{f.icon}</div>
                <div style={{ fontSize:14, fontWeight:500, marginBottom:8 }}>{f.t}</div>
                <div style={{ fontSize:13, color:'#8A8070', lineHeight:1.7 }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PN DEMO */}
      <section style={{ padding:'80px 48px', background:'#EDEBE3' }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, alignItems:'center' }}>
          <div>
            <span className="tag" style={{ background:'#C0DD97', color:'#27500A' }}>PN normalization</span>
            <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(24px, 3vw, 38px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:16, lineHeight:1.15 }}>
              Any alias.<br /><em style={{ color:'#3B6D11' }}>One canonical PN.</em>
            </h2>
            <p style={{ fontSize:14, color:'#5A5545', lineHeight:1.75, marginBottom:24 }}>
              Suppliers often use transferred, internal, or OEM part numbers. Our AI maps 174,000+ aliases to their canonical reference — so you always find what you are looking for.
            </p>
            <Link href="/knowledge-base" className="btn-main" style={{ fontSize:13 }}>Try it now →</Link>
          </div>
          <div style={{ background:'white', borderRadius:14, padding:28, border:'1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:11, color:'#8A8070', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:20 }}>Live examples</div>
            {[
              {from:'NTK-7750SR-12', to:'7750 SR-12', brand:'Nokia'},
              {from:'ALU-7450ESS-7', to:'7450 ESS-7', brand:'Alcatel-Lucent'},
              {from:'CISCO-ASR9006-AC', to:'ASR9006-AC', brand:'Cisco'},
              {from:'HW-NE40E-X8', to:'NE40E-X8', brand:'Huawei'},
            ].map((row,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom: i<3 ? 12 : 0 }}>
                <span className="pn" style={{ fontSize:12, color:'#8A8070', background:'#F7F6F2', padding:'5px 10px', borderRadius:6, flex:1 }}>{row.from}</span>
                <span style={{ color:'#C8B89A', fontSize:12, flexShrink:0 }}>→</span>
                <span className="pn" style={{ fontSize:12, fontWeight:500, background:'#D4EDDA', color:'#2D6A4F', padding:'5px 10px', borderRadius:6, flex:1 }}>{row.to}</span>
                <span style={{ fontSize:11, color:'#B0A898', flexShrink:0, minWidth:80 }}>{row.brand}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI CHAT DEMO */}
      <section style={{ padding:'80px 48px', background:'#0A0A0A' }}>
        <div style={{ maxWidth:760, margin:'0 auto', textAlign:'center' }}>
          <span className="tag" style={{ background:'#1E1E1E', color:'#8A8070' }}>AI product Q&A</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', color:'#F7F6F2', marginTop:20, marginBottom:16, lineHeight:1.1 }}>
            Ask anything.<br /><em style={{ color:'#7DB896' }}>Get expert answers.</em>
          </h2>
          <p style={{ fontSize:15, color:'#6A6A6A', lineHeight:1.75, marginBottom:48, maxWidth:480, margin:'0 auto 48px' }}>
            One credit per conversation. Your first use is free. Questions about specs, compatibility, topology, replacements — answered instantly.
          </p>
          {/* Mock chat */}
          <div style={{ background:'#0F0F0F', borderRadius:16, padding:24, textAlign:'left', border:'1px solid #1E1E1E' }}>
            {[
              {role:'user', msg:'What is the maximum line card capacity of the Nokia 7750 SR-12?'},
              {role:'ai', msg:'The Nokia 7750 SR-12 supports up to 12 line card slots. Each slot can accommodate FP4-based MDAs with up to 400 Gbps per slot, giving a theoretical chassis capacity of 4.8 Tbps. It supports a wide range of MDA types including 100GE, 10GE, and OTN interfaces.'},
              {role:'user', msg:'Is it compatible with the FP5 chipset?'},
              {role:'ai', msg:'Yes — Nokia introduced FP5-based cards for the 7750 SR-12 starting with SR OS 22.x. However, FP4 and FP5 cards can coexist in the same chassis, making it straightforward to upgrade capacity without a full platform replacement.'},
            ].map((m,i) => (
              <div key={i} style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start', marginBottom: i<3 ? 12 : 0 }}>
                <div style={{ maxWidth:'78%', padding:'10px 14px', borderRadius: m.role==='user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: m.role==='user' ? '#185FA5' : '#1A1A1A', color: m.role==='user' ? 'white' : '#D4D0C4', fontSize:13, lineHeight:1.6 }}>
                  {m.msg}
                </div>
              </div>
            ))}
            <div style={{ marginTop:16, display:'flex', gap:8 }}>
              <div style={{ flex:1, background:'#161616', border:'1px solid #2A2A2A', borderRadius:8, padding:'9px 14px', fontSize:13, color:'#3A3A3A' }}>Ask about any product...</div>
              <div style={{ background:'#185FA5', padding:'9px 16px', borderRadius:8, fontSize:13, color:'white', fontWeight:500 }}>→</div>
            </div>
          </div>
          <div style={{ marginTop:24 }}>
            <Link href="/register" className="btn-main">Try it free →</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding:'80px 48px', background:'#3B6D11', textAlign:'center' }}>
        <span className="tag" style={{ background:'rgba(255,255,255,0.15)', color:'white' }}>Start exploring</span>
        <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 48px)', fontWeight:400, letterSpacing:'-0.03em', color:'white', marginTop:20, marginBottom:16, lineHeight:1.1 }}>
          The most complete telecom<br />parts database. Free to search.
        </h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.7)', marginBottom:36, maxWidth:440, margin:'0 auto 36px', lineHeight:1.7 }}>
          Register free to access AI Q&A, lifecycle data, and community corrections across 97,000+ verified part numbers.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link href="/register" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'white', color:'#3B6D11', padding:'13px 28px', borderRadius:100, fontSize:14, fontWeight:500, textDecoration:'none' }}>Create free account →</Link>
          <Link href="/knowledge-base" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'transparent', color:'white', border:'1.5px solid rgba(255,255,255,0.4)', padding:'13px 28px', borderRadius:100, fontSize:14, textDecoration:'none' }}>Browse {loggedIn ? 'now' : 'without account'}</Link>
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
