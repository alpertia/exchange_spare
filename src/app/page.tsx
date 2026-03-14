'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import Logo from '@/components/Logo'

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [visible, setVisible] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setVisible(true)
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    // Check session
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setLoggedIn(!!session)
      })
    })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F7F6F2', minHeight: '100vh', color: '#0A0A0A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        .fade-up { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .fade-up.in { opacity: 1; transform: translateY(0); }
        .hover-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .hover-card:hover { transform: translateY(-3px); box-shadow: 0 16px 40px rgba(0,0,0,0.1); }
        .btn-main { display: inline-flex; align-items: center; gap: 8px; background: #0A0A0A; color: #F7F6F2; border: none; padding: 14px 28px; border-radius: 100px; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; text-decoration: none; }
        .btn-main:hover { background: #1a1a1a; }
        .btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #0A0A0A; border: 1.5px solid rgba(10,10,10,0.2); padding: 14px 28px; border-radius: 100px; font-family: inherit; font-size: 14px; font-weight: 400; cursor: pointer; transition: border-color 0.2s; text-decoration: none; }
        .btn-ghost:hover { border-color: rgba(10,10,10,0.5); }
        .tag { display: inline-block; background: #E8E4D9; color: #5A5545; font-size: 11px; font-weight: 500; padding: 4px 12px; border-radius: 100px; letter-spacing: 0.04em; text-transform: uppercase; }
        .pn { font-family: 'DM Mono', monospace, system-ui; }
        .step-line { width: 1px; background: #D4D0C4; flex-shrink: 0; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .float { animation: float 4s ease-in-out infinite; }
        @keyframes fadeSlide { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        .anim-1 { animation: fadeSlide 0.8s ease 0.1s both; }
        .anim-2 { animation: fadeSlide 0.8s ease 0.25s both; }
        .anim-3 { animation: fadeSlide 0.8s ease 0.4s both; }
        .anim-4 { animation: fadeSlide 0.8s ease 0.55s both; }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', height: 64,
        background: scrolled ? 'rgba(247,246,242,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo size={30} linkTo="/" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {[
            { label: 'Marketplace', href: '/marketplace' },
            { label: 'Trade Assurance', href: '/trade-assurance' },
            { label: 'Knowledge Base', href: '/knowledge-base' },
            { label: 'Consultants', href: '/consultants' },
          ].map(item => (
            <Link key={item.label} href={item.href} style={{ fontSize: 13, color: '#5A5545', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = '#0A0A0A'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = '#5A5545'}>
              {item.label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {loggedIn ? (
            <Link href="/dashboard/marketplace" className="btn-main" style={{ padding: '10px 20px', fontSize: 13 }}>My SpareShare →</Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost" style={{ padding: '10px 20px', fontSize: 13 }}>Log in</Link>
              <Link href="/register" className="btn-main" style={{ padding: '10px 20px', fontSize: 13 }}>Get started</Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '120px 48px 80px', position: 'relative', overflow: 'hidden' }}>
        {/* Background grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />
        {/* Accent circle */}
        <div className="float" style={{ position: 'absolute', right: '8%', top: '20%', width: 320, height: 320, borderRadius: '50%', background: 'linear-gradient(135deg, #C8F0D4, #A8D8F0)', opacity: 0.5, filter: 'blur(1px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: '20%', bottom: '15%', width: 160, height: 160, borderRadius: '50%', background: '#F0E8C8', opacity: 0.6, pointerEvents: 'none' }} />

        <div style={{ maxWidth: 760, position: 'relative' }}>
          <div className="anim-1">
            <span className="tag">B2B · Telecom &amp; Satellite</span>
          </div>
          <h1 className="anim-2" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(48px, 6vw, 80px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', marginTop: 24, marginBottom: 28 }}>
            The exchange for<br />
            <em style={{ fontStyle: 'italic', color: '#3D7A5C' }}>telecom spare parts</em><br />
            that just works.
          </h1>
          <p className="anim-3" style={{ fontSize: 17, color: '#5A5545', lineHeight: 1.75, maxWidth: 480, marginBottom: 40 }}>
            97,000+ verified part numbers. AI-powered matching. Trade Assurance escrow. Buy and sell with confidence — in minutes, not weeks.
          </p>
          <div className="anim-4" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {loggedIn ? (
              <Link href="/dashboard/marketplace" className="btn-main">Go to My SpareShare →</Link>
            ) : (
              <>
                <Link href="/register" className="btn-main">Start trading free →</Link>
                <Link href="/marketplace" className="btn-ghost">Browse marketplace</Link>
              </>
            )}
          </div>

          {/* Stats row */}
          <div className="anim-4" style={{ display: 'flex', gap: 40, marginTop: 64, paddingTop: 40, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
            {[
              { n: '97,000+', l: 'Verified PNs' },
              { n: '100%', l: 'Escrow-secured' },
              { n: '< 5 min', l: 'To register' },
            ].map(s => (
              <div key={s.n}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, letterSpacing: '-0.02em' }}>{s.n}</div>
                <div style={{ fontSize: 13, color: '#8A8070', marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '100px 48px', background: '#0A0A0A', color: '#F7F6F2' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <span className="tag" style={{ background: '#1E1E1E', color: '#8A8070' }}>How it works</span>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 60, lineHeight: 1.1 }}>
            From listing to delivery<br /><em style={{ color: '#7DB896' }}>fully protected.</em>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#1E1E1E', borderRadius: 16, overflow: 'hidden' }}>
            {[
              { n: '01', t: 'List or search', d: 'Post inventory or browse 97k+ verified PNs across all major telecom brands.' },
              { n: '02', t: 'Match & offer', d: 'AI matches your buy intent to available stock. Send or receive offers directly.' },
              { n: '03', t: 'Funds held', d: 'Payment secured in Trade Assurance escrow. Seller ships with confidence.' },
              { n: '04', t: 'Deliver & release', d: 'Buyer confirms delivery. Funds released instantly. Transaction complete.' },
            ].map((s, i) => (
              <div key={i} className="hover-card" style={{ padding: '32px 28px', background: '#0F0F0F', cursor: 'default' }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: '#2A2A2A', marginBottom: 20 }}>{s.n}</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 10, color: '#F7F6F2' }}>{s.t}</div>
                <div style={{ fontSize: 13, color: '#6A6A6A', lineHeight: 1.7 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRADE ASSURANCE */}
      <section style={{ padding: '100px 48px', background: '#F7F6F2' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            <div>
              <span className="tag" style={{ background: '#D4EDDA', color: '#2D6A4F' }}>Trade assurance</span>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 20, lineHeight: 1.15 }}>
                Your money moves only<br />when the deal is done.
              </h2>
              <p style={{ fontSize: 15, color: '#5A5545', lineHeight: 1.75, marginBottom: 32 }}>
                SpareShare holds funds in escrow until the buyer confirms delivery. No wire risk, no unresolved disputes — every transaction is backed by our protection policy.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  { icon: '🛡', t: 'Escrow protection', d: '5% fee on transactions up to €5k, 3% above — no hidden charges.' },
                  { icon: '⚖', t: 'Dispute resolution', d: 'Our team mediates any dispute and ensures a fair outcome for both parties.' },
                  { icon: '💱', t: 'Multi-currency', d: 'Trade in EUR, USD, GBP and more. Balances held securely in your account.' },
                ].map(f => (
                  <div key={f.t} style={{ display: 'flex', gap: 16 }}>
                    <div style={{ width: 40, height: 40, background: '#E8F5EE', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{f.icon}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{f.t}</div>
                      <div style={{ fontSize: 13, color: '#8A8070', lineHeight: 1.6 }}>{f.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Visual card */}
            <div style={{ background: '#0A0A0A', borderRadius: 20, padding: 32, color: '#F7F6F2' }}>
              <div style={{ fontSize: 12, color: '#6A6A6A', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trade assurance account</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, letterSpacing: '-0.02em', marginBottom: 4 }}>€24,500.00</div>
              <div style={{ fontSize: 13, color: '#6A6A6A', marginBottom: 32 }}>Available balance</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Nokia 7750 SR-12 × 2', amount: '+€12,000', status: 'released', color: '#7DB896' },
                  { label: 'Ericsson RBS 6601', amount: '€8,500 held', status: 'in escrow', color: '#C8A84B' },
                  { label: 'Cisco ASR 9006-AC', amount: '+€4,200', status: 'released', color: '#7DB896' },
                ].map((tx, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#161616', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, marginBottom: 3 }}>{tx.label}</div>
                      <div style={{ fontSize: 11, color: tx.color }}>{tx.status}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: tx.color }}>{tx.amount}</div>
                  </div>
                ))}
              </div>
              <Link href="/register" className="btn-main" style={{ marginTop: 24, width: '100%', justifyContent: 'center', background: '#F7F6F2', color: '#0A0A0A' }}>
                Open Trade Assurance account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* AI FEATURES */}
      <section style={{ padding: '100px 48px', background: '#EDEBE3' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <span className="tag">AI-powered</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: 24, alignItems: 'start' }}>
            <div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 16 }}>
                Intelligence built into<br /><em style={{ color: '#3D7A5C' }}>every step.</em>
              </h2>
              <p style={{ fontSize: 15, color: '#5A5545', lineHeight: 1.75 }}>
                From normalizing messy part numbers to answering technical questions — AI does the heavy lifting so you can focus on the deal.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { t: 'PN normalization', d: 'Paste any alias or transferred PN — get the canonical part number instantly.' },
                { t: 'Knowledge base Q&A', d: 'Ask technical questions about any product. AI answers from curated specs.' },
                { t: 'Smart matching', d: 'Buy intents matched to listings across 97,000+ verified parts automatically.' },
              ].map((f, i) => (
                <div key={i} className="hover-card" style={{ background: '#F7F6F2', borderRadius: 12, padding: '20px 24px', border: '1px solid rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{f.t}</div>
                  <div style={{ fontSize: 13, color: '#8A8070', lineHeight: 1.6 }}>{f.d}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PN demo */}
          <div style={{ marginTop: 48, background: '#F7F6F2', borderRadius: 16, padding: 28, border: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 11, color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>PN alias resolution</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { from: 'NTK-7750SR-12', to: '7750 SR-12', brand: 'Nokia' },
                { from: 'ALU-7450ESS-7', to: '7450 ESS-7', brand: 'Alcatel-Lucent' },
                { from: 'CISCO-ASR9006-AC', to: 'ASR9006-AC', brand: 'Cisco' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="pn" style={{ fontSize: 13, color: '#8A8070', background: '#EDEBE3', padding: '6px 12px', borderRadius: 6 }}>{row.from}</span>
                  <span style={{ color: '#C8B89A', fontSize: 12 }}>→</span>
                  <span className="pn" style={{ fontSize: 13, fontWeight: 500, background: '#D4EDDA', color: '#2D6A4F', padding: '6px 12px', borderRadius: 6 }}>{row.to}</span>
                  <span style={{ fontSize: 11, color: '#8A8070' }}>{row.brand}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: '100px 48px', background: '#F7F6F2' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <span className="tag">From our users</span>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 48, lineHeight: 1.1 }}>
            Trusted by telecom<br /><em style={{ color: '#3D7A5C' }}>professionals.</em>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[
              { q: "We cleared €180k of aging Nokia inventory in three weeks. The part number matching saved us days of manual cross-referencing.", name: 'Mehmet K.', co: 'Türk Telekom' },
              { q: "Trade Assurance gave our finance team the confidence to approve international deals. No more wire transfer anxiety.", name: 'Sara B.', co: 'Nordic Teleparts' },
              { q: "Found a replacement Ericsson RBS card within 48 hours. Would have taken weeks through our normal channels.", name: 'Julien R.', co: 'Orange SA' },
              { q: "The AI product Q&A alone is worth it. Our team stopped hunting datasheets — just ask and get the answer.", name: 'Alina Y.', co: 'Vodafone' },
            ].map((t, i) => (
              <div key={i} className="hover-card" style={{ background: i % 2 === 0 ? '#F7F6F2' : '#0A0A0A', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 28 }}>
                <p style={{ fontSize: 15, lineHeight: 1.75, color: i % 2 === 0 ? '#0A0A0A' : '#D4D0C4', marginBottom: 24, fontStyle: 'italic' }}>"{t.q}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: i % 2 === 0 ? '#D4EDDA' : '#1E1E1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: i % 2 === 0 ? '#2D6A4F' : '#7DB896' }}>
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: i % 2 === 0 ? '#0A0A0A' : '#F7F6F2' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: i % 2 === 0 ? '#8A8070' : '#6A6A6A' }}>{t.co}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '100px 48px', background: '#3D7A5C', color: 'white', textAlign: 'center' }}>
        <span className="tag" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>Get started today</span>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 20, lineHeight: 1.1 }}>
          Ready to trade smarter?
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', marginBottom: 40, maxWidth: 460, margin: '0 auto 40px', lineHeight: 1.7 }}>
          Join hundreds of telecom professionals buying and selling spare parts with confidence. Register in 5 minutes — it's free.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href="/dashboard/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', color: '#3D7A5C', padding: '14px 32px', borderRadius: 100, fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>
              Go to My SpareShare →
            </Link>
          ) : (
            <>
              <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', color: '#3D7A5C', padding: '14px 32px', borderRadius: 100, fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>
                Create free account →
              </Link>
              <Link href="/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: 'white', border: '1.5px solid rgba(255,255,255,0.4)', padding: '14px 32px', borderRadius: 100, fontSize: 15, textDecoration: 'none' }}>
                Browse marketplace
              </Link>
            </>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '40px 48px', background: '#0A0A0A', color: '#6A6A6A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={16} linkTo="/" dark={true} />
          <span style={{ fontSize: 11, color: '#3A3A3A' }}>· B2B Exchange with Trade Assurance</span>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
          {['Trade Assurance', 'Privacy', 'Terms', 'Contact'].map(l => (
            <span key={l} style={{ cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = '#F7F6F2'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = '#6A6A6A'}>
              {l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12 }}>© 2026 SpareShare</div>
      </footer>
    </div>
  )
}
