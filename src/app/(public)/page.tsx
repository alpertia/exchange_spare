'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import Logo from '@/components/Logo'

export default function MarketplaceLandingPage() {
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
    { label: 'Marketplace', href: '/marketplace' },
    { label: 'Trade Assurance', href: '/trade-assurance' },
    { label: 'Knowledge Base', href: '/knowledge-base' },
    { label: 'Consultants', href: '/consultants' },
  ]

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F7F6F2', minHeight: '100vh', color: '#0A0A0A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn-main { display: inline-flex; align-items: center; gap: 8px; background: #0A0A0A; color: #F7F6F2; border: none; padding: 13px 26px; border-radius: 100px; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; transition: background 0.2s; }
        .btn-main:hover { background: #222; }
        .btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #0A0A0A; border: 1.5px solid rgba(10,10,10,0.2); padding: 13px 26px; border-radius: 100px; font-family: inherit; font-size: 14px; cursor: pointer; text-decoration: none; }
        .tag { display: inline-block; background: #E8E4D9; color: #5A5545; font-size: 11px; font-weight: 500; padding: 4px 12px; border-radius: 100px; letter-spacing: 0.04em; text-transform: uppercase; }
        .card { background: white; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 24px; }
        .hover-lift { transition: transform 0.2s, box-shadow 0.2s; }
        .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .pn { font-family: 'DM Mono', monospace; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .a1{animation:fadeUp 0.7s ease 0.1s both} .a2{animation:fadeUp 0.7s ease 0.2s both} .a3{animation:fadeUp 0.7s ease 0.3s both}
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px', height: 64, background: scrolled ? 'rgba(247,246,242,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : 'none', transition: 'all 0.3s ease' }}>
        <Logo size={30} linkTo="/" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {nav.map(item => (
            <Link key={item.label} href={item.href} style={{ fontSize: 13, color: item.href === '/marketplace' ? '#0A0A0A' : '#5A5545', textDecoration: 'none', fontWeight: item.href === '/marketplace' ? 500 : 400 }}>{item.label}</Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {loggedIn ? (
            <Link href="/dashboard/marketplace" className="btn-main" style={{ padding: '9px 20px', fontSize: 13 }}>My SpareShare →</Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost" style={{ padding: '9px 20px', fontSize: 13 }}>Log in</Link>
              <Link href="/register" className="btn-main" style={{ padding: '9px 20px', fontSize: 13 }}>Get started</Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: '140px 48px 80px', maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
        <div className="a1"><span className="tag" style={{ background: '#E6F1FB', color: '#0C447C' }}>Marketplace</span></div>
        <h1 className="a2" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', marginTop: 24, marginBottom: 24 }}>
          Buy and sell telecom parts<br /><em style={{ fontStyle: 'italic', color: '#185FA5' }}>with confidence.</em>
        </h1>
        <p className="a3" style={{ fontSize: 17, color: '#5A5545', lineHeight: 1.75, maxWidth: 520, margin: '0 auto 40px' }}>
          97,000+ verified part numbers. Post inventory, find what you need, and close deals — protected by Trade Assurance escrow.
        </p>
        <div className="a3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href="/dashboard/marketplace" className="btn-main">Open marketplace →</Link>
          ) : (
            <>
              <Link href="/register" className="btn-main">Start trading free →</Link>
              <Link href="/login" className="btn-ghost">Log in</Link>
            </>
          )}
        </div>
      </section>

      {/* MOCK LISTINGS */}
      <section style={{ padding: '60px 48px', background: '#0A0A0A' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#3A3A3A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>Live listings preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { pn: '7750 SR-12', brand: 'Nokia', qty: 2, price: '€14,500', tag: 'For Sale', tagBg: '#E6F1FB', tagColor: '#0C447C' },
              { pn: 'ASR9006-AC', brand: 'Cisco', qty: 1, price: '€8,200', tag: 'For Sale', tagBg: '#E6F1FB', tagColor: '#0C447C' },
              { pn: 'RBS 6601', brand: 'Ericsson', qty: 4, price: '€3,800/u', tag: 'Wanted', tagBg: '#FAEEDA', tagColor: '#633806' },
              { pn: 'NE40E-X8', brand: 'Huawei', qty: 1, price: '€22,000', tag: 'For Sale', tagBg: '#E6F1FB', tagColor: '#0C447C' },
              { pn: '7450 ESS-7', brand: 'Nokia', qty: 3, price: 'Make offer', tag: 'Wanted', tagBg: '#FAEEDA', tagColor: '#633806' },
              { pn: 'C9606R', brand: 'Cisco', qty: 2, price: '€11,400', tag: 'For Sale', tagBg: '#E6F1FB', tagColor: '#0C447C' },
            ].map((l, i) => (
              <div key={i} className="hover-lift" style={{ background: '#0F0F0F', border: '1px solid #1E1E1E', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span className="pn" style={{ fontSize: 14, fontWeight: 500, color: '#F7F6F2' }}>{l.pn}</span>
                  <span style={{ fontSize: 11, background: l.tagBg, color: l.tagColor, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{l.tag}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6A6A6A', marginBottom: 12 }}>{l.brand} · Qty: {l.qty}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#F7F6F2' }}>{l.price}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Link href={loggedIn ? "/dashboard/marketplace" : "/register"} className="btn-main">
              {loggedIn ? 'See all listings →' : 'Register to see all listings →'}
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '80px 48px', background: '#F7F6F2' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <span className="tag">Platform features</span>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 48, lineHeight: 1.1 }}>
            Everything you need<br /><em style={{ color: '#185FA5' }}>to trade B2B.</em>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { icon: '📋', t: 'List inventory', d: 'Post your surplus stock in minutes. AI fills in product details from the part number automatically.' },
              { icon: '🔍', t: 'Post buy intents', d: 'Tell the market what you need. Sellers with matching stock will reach out directly.' },
              { icon: '🤝', t: 'Make & receive offers', d: 'Negotiate price, quantity and incoterms directly on the platform — structured and tracked.' },
              { icon: '🛡', t: 'Trade Assurance', d: 'Every transaction is escrow-protected. Funds held until delivery is confirmed.' },
              { icon: '🤖', t: 'AI matching', d: 'Our AI automatically matches buy intents to available listings across 97,000+ verified PNs.' },
              { icon: '💬', t: 'Anonymous messaging', d: 'Communicate safely before revealing your identity. Contact info is only shared after deal confirmation.' },
            ].map((f, i) => (
              <div key={i} className="card hover-lift">
                <div style={{ fontSize: 24, marginBottom: 14 }}>{f.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{f.t}</div>
                <div style={{ fontSize: 13, color: '#8A8070', lineHeight: 1.7 }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW BUYING WORKS */}
      <section style={{ padding: '80px 48px', background: '#EDEBE3' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64 }}>
            <div>
              <span className="tag" style={{ background: '#E6F1FB', color: '#0C447C' }}>For buyers</span>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 32, lineHeight: 1.15 }}>
                Find what you need.<br /><em style={{ color: '#185FA5' }}>Fast.</em>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  { n: '1', t: 'Search or post a buy intent', d: 'Browse listings or tell the market what you need.' },
                  { n: '2', t: 'Receive offers', d: 'Sellers with matching stock send you priced offers.' },
                  { n: '3', t: 'Pay securely', d: 'Fund your Trade Assurance account. Payment held until delivery.' },
                  { n: '4', t: 'Confirm & done', d: 'Confirm delivery. Funds released to seller. Done.' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#185FA5', color: 'white', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{s.t}</div>
                      <div style={{ fontSize: 13, color: '#8A8070' }}>{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="tag" style={{ background: '#FAEEDA', color: '#633806' }}>For sellers</span>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 32, lineHeight: 1.15 }}>
                Clear inventory.<br /><em style={{ color: '#BA7517' }}>Get paid.</em>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  { n: '1', t: 'List your inventory', d: 'AI auto-fills product details. Post in under 2 minutes.' },
                  { n: '2', t: 'Receive buy intents', d: 'Buyers looking for your parts come to you directly.' },
                  { n: '3', t: 'Confirm & ship', d: 'Deal confirmed, payment held. Ship with tracking.' },
                  { n: '4', t: 'Get paid instantly', d: 'Buyer confirms delivery. Funds in your account immediately.' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#BA7517', color: 'white', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{s.t}</div>
                      <div style={{ fontSize: 13, color: '#8A8070' }}>{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 48px', background: '#185FA5', textAlign: 'center' }}>
        <span className="tag" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>Join the marketplace</span>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', color: 'white', marginTop: 20, marginBottom: 16, lineHeight: 1.1 }}>
          Start buying and selling today.
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', marginBottom: 36, maxWidth: 420, margin: '0 auto 36px', lineHeight: 1.7 }}>
          Free to register. No listing fees. Trade Assurance included on every transaction.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href="/dashboard/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', color: '#185FA5', padding: '13px 28px', borderRadius: 100, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
              Open marketplace →
            </Link>
          ) : (
            <>
              <Link href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', color: '#185FA5', padding: '13px 28px', borderRadius: 100, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
                Create free account →
              </Link>
              <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: 'white', border: '1.5px solid rgba(255,255,255,0.4)', padding: '13px 28px', borderRadius: 100, fontSize: 14, textDecoration: 'none' }}>
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      <footer style={{ padding: '32px 48px', background: '#0A0A0A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo size={16} linkTo="/" dark={true} />
          <span style={{ fontSize: 11, color: '#3A3A3A' }}>· B2B Exchange with Trade Assurance</span>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#6A6A6A' }}>
          {['Trade Assurance', 'Privacy', 'Terms', 'Contact'].map(l => <span key={l} style={{ cursor: 'pointer' }}>{l}</span>)}
        </div>
        <div style={{ fontSize: 12, color: '#6A6A6A' }}>© 2026 SpareShare</div>
      </footer>
    </div>
  )
}
