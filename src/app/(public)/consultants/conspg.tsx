'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import Logo from '@/components/Logo'

export default function ConsultantsPage() {
  const [scrolled, setScrolled] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', topic: '', message: '' })
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleSubmit() {
    if (!form.name || !form.email || !form.message) return
    setStatus('sending')
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'consultant_inquiry',
          data: {
            name: form.name,
            company: form.company,
            email: form.email,
            topic: form.topic,
            message: form.message,
          },
        }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const nav = [
    {label:'Marketplace',href:'/dashboard/marketplace'},
    {label:'Trade Assurance',href:'/trade-assurance'},
    {label:'Knowledge Base',href:'/knowledge-base'},
    {label:'Consultants',href:'/consultants'},
  ]

  const inp: React.CSSProperties = {
    width:'100%', padding:'11px 14px', border:'1px solid rgba(0,0,0,0.12)', borderRadius:8,
    fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, outline:'none',
    background:'white', color:'#0A0A0A', transition:'border-color 0.2s',
  }

  return (
    <div style={{ fontFamily:"'DM Sans', system-ui, sans-serif", background:'#F7F6F2', minHeight:'100vh', color:'#0A0A0A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .btn-main { display:inline-flex; align-items:center; gap:8px; background:#0A0A0A; color:#F7F6F2; border:none; padding:13px 26px; border-radius:100px; font-family:inherit; font-size:14px; font-weight:500; cursor:pointer; text-decoration:none; transition:background 0.2s; }
        .btn-main:hover { background:#222; }
        .btn-ghost { display:inline-flex; align-items:center; gap:8px; background:transparent; color:#0A0A0A; border:1.5px solid rgba(10,10,10,0.2); padding:13px 26px; border-radius:100px; font-family:inherit; font-size:14px; cursor:pointer; text-decoration:none; }
        .tag { display:inline-block; background:#E8E4D9; color:#5A5545; font-size:11px; font-weight:500; padding:4px 12px; border-radius:100px; letter-spacing:0.04em; text-transform:uppercase; }
        .card { background:white; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:28px; }
        .hover-lift { transition:transform 0.2s; }
        .hover-lift:hover { transform:translateY(-2px); }
        input:focus, textarea:focus, select:focus { border-color:#185FA5 !important; box-shadow:0 0 0 3px rgba(24,95,165,0.1); }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .a1{animation:fadeUp 0.7s ease 0.1s both} .a2{animation:fadeUp 0.7s ease 0.2s both} .a3{animation:fadeUp 0.7s ease 0.3s both}
      `}</style>

      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 48px', height:64, background: scrolled ? 'rgba(247,246,242,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : 'none', transition:'all 0.3s ease' }}>
        <Logo size={30} linkTo="/" />
        <div style={{ display:'flex', alignItems:'center', gap:32 }}>
          {nav.map(item => (
            <Link key={item.label} href={item.href} style={{ fontSize:13, color: item.href==='/consultants' ? '#0A0A0A' : '#5A5545', textDecoration:'none', fontWeight: item.href==='/consultants' ? 500 : 400 }}>{item.label}</Link>
          ))}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <Link href="/login" className="btn-ghost" style={{ padding:'9px 20px', fontSize:13 }}>Log in</Link>
          <Link href="/register" className="btn-main" style={{ padding:'9px 20px', fontSize:13 }}>Get started</Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding:'140px 48px 80px', maxWidth:860, margin:'0 auto', textAlign:'center' }}>
        <div className="a1"><span className="tag" style={{ background:'#FAEEDA', color:'#633806' }}>Consultants</span></div>
        <h1 className="a2" style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(40px, 6vw, 68px)', fontWeight:400, lineHeight:1.08, letterSpacing:'-0.03em', marginTop:24, marginBottom:24 }}>
          Expert guidance for<br /><em style={{ fontStyle:'italic', color:'#BA7517' }}>telecom procurement.</em>
        </h1>
        <p className="a3" style={{ fontSize:17, color:'#5A5545', lineHeight:1.75, maxWidth:520, margin:'0 auto 40px' }}>
          Our network of telecom infrastructure specialists helps you source the right parts, negotiate better deals, and navigate complex procurement challenges.
        </p>
        <div className="a3" style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <a href="#contact" className="btn-main">Get in touch →</a>
          <a href="#services" className="btn-ghost">See our services</a>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding:'80px 48px', background:'#0A0A0A' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <span className="tag" style={{ background:'#1E1E1E', color:'#8A8070' }}>What we offer</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', color:'#F7F6F2', marginTop:20, marginBottom:48, lineHeight:1.1 }}>
            From sourcing to strategy.
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:1, background:'#1E1E1E', borderRadius:16, overflow:'hidden' }}>
            {[
              {icon:'🔎', t:'Sourcing support', d:'Can\'t find a specific part? Our consultants tap into a global network of verified suppliers to locate hard-to-find inventory.'},
              {icon:'💼', t:'Procurement strategy', d:'Optimize your spare parts budget. We analyze your network topology and recommend cost-effective inventory strategies.'},
              {icon:'🤝', t:'Vendor negotiation', d:'Leverage our market knowledge to negotiate better pricing, lead times, and warranty terms with suppliers.'},
              {icon:'📋', t:'Due diligence', d:'Before large purchases, our experts verify authenticity, condition grades, and compatibility of used equipment.'},
              {icon:'🌍', t:'Import & export', d:'Navigate customs, documentation, and compliance for cross-border telecom equipment transactions.'},
              {icon:'🛠', t:'Technical assessment', d:'Get an independent technical evaluation of equipment before purchasing — condition, firmware, and performance.'},
            ].map((s,i) => (
              <div key={i} className="hover-lift" style={{ padding:'28px 24px', background:'#0F0F0F' }}>
                <div style={{ fontSize:24, marginBottom:14 }}>{s.icon}</div>
                <div style={{ fontSize:14, fontWeight:500, color:'#F7F6F2', marginBottom:8 }}>{s.t}</div>
                <div style={{ fontSize:13, color:'#6A6A6A', lineHeight:1.7 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY */}
      <section style={{ padding:'80px 48px', background:'#F7F6F2' }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, alignItems:'center' }}>
          <div>
            <span className="tag">Why ExchangeSpare consultants</span>
            <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(24px, 3vw, 38px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:20, lineHeight:1.15 }}>
              Deep expertise.<br /><em style={{ color:'#BA7517' }}>Real results.</em>
            </h2>
            <p style={{ fontSize:14, color:'#5A5545', lineHeight:1.75 }}>
              Our consultants have decades of combined experience in telecom infrastructure — from Nokia and Ericsson ecosystems to Cisco, Huawei, and emerging vendors. We understand the difference between what a datasheet says and what works in the field.
            </p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              {n:'15+', l:'Years average experience per consultant'},
              {n:'€50M+', l:'Worth of transactions advised'},
              {n:'40+', l:'Countries served'},
              {n:'24h', l:'Average first response time'},
            ].map((s,i) => (
              <div key={i} className="card" style={{ display:'flex', alignItems:'center', gap:20 }}>
                <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:32, letterSpacing:'-0.02em', color:'#BA7517', minWidth:80 }}>{s.n}</div>
                <div style={{ fontSize:13, color:'#5A5545', lineHeight:1.5 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT FORM */}
      <section id="contact" style={{ padding:'80px 48px', background:'#EDEBE3' }}>
        <div style={{ maxWidth:680, margin:'0 auto' }}>
          <span className="tag" style={{ background:'#FAEEDA', color:'#633806' }}>Get in touch</span>
          <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 44px)', fontWeight:400, letterSpacing:'-0.03em', marginTop:20, marginBottom:12, lineHeight:1.1 }}>
            Tell us what you need.
          </h2>
          <p style={{ fontSize:15, color:'#5A5545', marginBottom:40, lineHeight:1.7 }}>
            Fill in the form below and one of our consultants will get back to you within 24 hours.
          </p>

          {status === 'sent' ? (
            <div style={{ background:'white', borderRadius:14, padding:48, textAlign:'center', border:'1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:24, marginBottom:12 }}>Message sent!</div>
              <div style={{ fontSize:14, color:'#8A8070', lineHeight:1.7 }}>A consultant will be in touch within 24 hours. Check your inbox at <strong>{form.email}</strong>.</div>
            </div>
          ) : (
            <div className="card" style={{ padding:32 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:500, color:'#5A5545', display:'block', marginBottom:6 }}>Full name *</label>
                  <input style={inp} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Your name" />
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:500, color:'#5A5545', display:'block', marginBottom:6 }}>Company</label>
                  <input style={inp} value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))} placeholder="Company name" />
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#5A5545', display:'block', marginBottom:6 }}>Email address *</label>
                <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="you@company.com" />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#5A5545', display:'block', marginBottom:6 }}>Topic</label>
                <select style={inp} value={form.topic} onChange={e => setForm(f => ({...f, topic: e.target.value}))}>
                  <option value="">Select a topic...</option>
                  <option value="sourcing">Part sourcing</option>
                  <option value="procurement">Procurement strategy</option>
                  <option value="negotiation">Vendor negotiation</option>
                  <option value="due-diligence">Due diligence</option>
                  <option value="import-export">Import / export</option>
                  <option value="technical">Technical assessment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#5A5545', display:'block', marginBottom:6 }}>Message *</label>
                <textarea style={{ ...inp, minHeight:120, resize:'vertical' }} value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} placeholder="Describe your challenge or what you are looking for..." />
              </div>
              {status === 'error' && (
                <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, color:'#DC2626', fontSize:13, marginBottom:16 }}>
                  Something went wrong. Please try again or email us directly.
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={status === 'sending' || !form.name || !form.email || !form.message}
                className="btn-main"
                style={{ width:'100%', justifyContent:'center', opacity: (!form.name || !form.email || !form.message) ? 0.5 : 1 }}>
                {status === 'sending' ? 'Sending...' : 'Send message →'}
              </button>
              <div style={{ fontSize:12, color:'#B0A898', textAlign:'center', marginTop:12 }}>
                We respond within 24 hours · Your data is never shared
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding:'80px 48px', background:'#BA7517', textAlign:'center' }}>
        <span className="tag" style={{ background:'rgba(255,255,255,0.15)', color:'white' }}>Ready to trade?</span>
        <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:'clamp(28px, 4vw, 48px)', fontWeight:400, letterSpacing:'-0.03em', color:'white', marginTop:20, marginBottom:16, lineHeight:1.1 }}>
          Start on the platform first.
        </h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.75)', marginBottom:36, maxWidth:400, margin:'0 auto 36px', lineHeight:1.7 }}>
          Many sourcing challenges are solved directly on ExchangeSpare. Register free and search 97,000+ parts before engaging a consultant.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link href="/register" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'white', color:'#BA7517', padding:'13px 28px', borderRadius:100, fontSize:14, fontWeight:500, textDecoration:'none' }}>Create free account →</Link>
          <Link href="/dashboard/marketplace" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'transparent', color:'white', border:'1.5px solid rgba(255,255,255,0.4)', padding:'13px 28px', borderRadius:100, fontSize:14, textDecoration:'none' }}>Browse marketplace</Link>
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
        <div style={{ fontSize:12, color:'#6A6A6A' }}>© 2026 ExchangeSpare</div>
      </footer>
    </div>
  )
}
